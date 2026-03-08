/**
 * POST /admin/backfill-neo4j
 *
 * Backfills ontology records that have neo4j_graph_id = NULL.
 * Reads terms from D1, upserts into Neo4j, updates neo4j_graph_id on success.
 *
 * Query params:
 *   limit  — batch size (default 20, max 100)
 *   offset — skip first N NULL records (default 0)
 *   dryRun — if "true", only report counts without writing to Neo4j
 */

import { createLogger, ok } from "@ai-foundry/utils";
import { neo4jQuery } from "../neo4j/client.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-ontology:backfill");

interface OntologyRow {
  ontology_id: string;
  policy_id: string;
  organization_id: string;
  skos_concept_scheme: string | null;
}

interface TermRow {
  term_id: string;
  label: string;
  definition: string | null;
  skos_uri: string;
  term_type: string;
}

interface BackfillResult {
  ontologyId: string;
  policyId: string;
  termCount: number;
  neo4jStatements: number;
  success: boolean;
  error?: string;
}

export async function handleBackfillNeo4j(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");
  const dryRun = url.searchParams.get("dryRun") === "true";

  const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);
  const offset = Math.max(Number(offsetParam) || 0, 0);

  // 1. Count total NULL records
  const countResult = await env.DB_ONTOLOGY.prepare(
    `SELECT COUNT(*) AS cnt FROM ontologies WHERE neo4j_graph_id IS NULL AND status = 'completed'`,
  ).first<{ cnt: number }>();
  const totalNull = countResult?.cnt ?? 0;

  if (totalNull === 0) {
    return ok({ message: "No records to backfill", totalNull: 0, processed: 0 });
  }

  if (dryRun) {
    return ok({ dryRun: true, totalNull, limit, offset });
  }

  // 2. Fetch batch of NULL ontologies
  const rows = await env.DB_ONTOLOGY.prepare(
    `SELECT ontology_id, policy_id, organization_id, skos_concept_scheme
     FROM ontologies
     WHERE neo4j_graph_id IS NULL AND status = 'completed'
     ORDER BY created_at ASC
     LIMIT ? OFFSET ?`,
  )
    .bind(limit, offset)
    .all<OntologyRow>();

  const ontologies = rows.results;
  const results: BackfillResult[] = [];

  // 3. Process each ontology
  for (const ont of ontologies) {
    const termRows = await env.DB_ONTOLOGY.prepare(
      `SELECT term_id, label, definition, skos_uri, term_type
       FROM terms WHERE ontology_id = ?`,
    )
      .bind(ont.ontology_id)
      .all<TermRow>();

    const terms = termRows.results;

    if (terms.length === 0) {
      // No terms — mark as backfilled with empty graph
      await env.DB_ONTOLOGY.prepare(
        `UPDATE ontologies SET neo4j_graph_id = ? WHERE ontology_id = ?`,
      )
        .bind(ont.ontology_id, ont.ontology_id)
        .run();

      results.push({
        ontologyId: ont.ontology_id,
        policyId: ont.policy_id,
        termCount: 0,
        neo4jStatements: 0,
        success: true,
      });
      continue;
    }

    // Build Neo4j statements — UNWIND batch for efficiency (2 calls per ontology)
    const termParams = terms.map((t) => ({
      uri: t.skos_uri,
      label: t.label,
      definition: t.definition ?? "",
      type: t.term_type,
    }));

    const statements = [
      // Statement 1: UNWIND all terms in a single Cypher call
      {
        statement:
          "UNWIND $terms AS t " +
          "MERGE (term:Term {uri: t.uri}) SET term.label = t.label, term.ontologyId = $ontologyId, term.definition = t.definition, term.type = t.type " +
          "WITH term " +
          "MERGE (o:Ontology {id: $ontologyId}) MERGE (o)-[:HAS_TERM]->(term)",
        parameters: {
          terms: termParams,
          ontologyId: ont.ontology_id,
        } as Record<string, unknown>,
      },
      // Statement 2: Ontology → Policy relationship
      {
        statement:
          "MERGE (o:Ontology {id: $ontologyId}) SET o.policyId = $policyId, o.skosScheme = $skosScheme " +
          "WITH o MERGE (p:Policy {id: $policyId}) MERGE (o)-[:EXTRACTED_FROM]->(p)",
        parameters: {
          ontologyId: ont.ontology_id,
          policyId: ont.policy_id,
          skosScheme: ont.skos_concept_scheme ?? "",
        } as Record<string, unknown>,
      },
    ];

    try {
      const neo4jResponse = await neo4jQuery(env, statements);

      if (neo4jResponse.errors.length > 0) {
        const firstErr = neo4jResponse.errors[0];
        logger.warn("Neo4j backfill partial error", {
          ontologyId: ont.ontology_id,
          errors: neo4jResponse.errors.length,
          firstCode: firstErr?.code,
        });
        results.push({
          ontologyId: ont.ontology_id,
          policyId: ont.policy_id,
          termCount: terms.length,
          neo4jStatements: statements.length,
          success: false,
          error: `Neo4j errors: ${firstErr?.code} — ${firstErr?.message}`,
        });
        continue;
      }

      // Success — update D1
      await env.DB_ONTOLOGY.prepare(
        `UPDATE ontologies SET neo4j_graph_id = ? WHERE ontology_id = ?`,
      )
        .bind(ont.ontology_id, ont.ontology_id)
        .run();

      results.push({
        ontologyId: ont.ontology_id,
        policyId: ont.policy_id,
        termCount: terms.length,
        neo4jStatements: statements.length,
        success: true,
      });

      logger.info("Backfilled ontology", {
        ontologyId: ont.ontology_id,
        terms: terms.length,
      });
    } catch (e) {
      logger.error("Neo4j backfill failed for ontology", {
        ontologyId: ont.ontology_id,
        error: String(e),
      });
      results.push({
        ontologyId: ont.ontology_id,
        policyId: ont.policy_id,
        termCount: terms.length,
        neo4jStatements: statements.length,
        success: false,
        error: String(e),
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const remaining = totalNull - offset - ontologies.length;

  logger.info("Backfill batch complete", {
    totalNull,
    processed: ontologies.length,
    succeeded,
    failed,
    remaining: Math.max(remaining, 0),
  });

  return ok({
    totalNull,
    batchSize: limit,
    offset,
    processed: ontologies.length,
    succeeded,
    failed,
    remaining: Math.max(remaining, 0),
    results,
  });
}
