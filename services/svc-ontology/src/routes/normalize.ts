/**
 * POST /normalize
 * Accepts a set of policy terms, normalizes them against the SKOS ontology,
 * persists to D1, upserts into Neo4j, and emits ontology.normalized event.
 */

import { createLogger, ok, badRequest, errFromUnknown } from "@ai-foundry/utils";
import type { OntologyNormalizedEvent } from "@ai-foundry/types";
import { neo4jQuery } from "../neo4j/client.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-ontology:normalize");

interface TermInput {
  label: string;
  definition?: string;
}

interface NormalizeRequest {
  policyId: string;
  terms: TermInput[];
  organizationId: string;
}

interface OntologyRow {
  ontology_id: string;
  policy_id: string;
  organization_id: string;
  neo4j_graph_id: string | null;
  skos_concept_scheme: string | null;
  term_count: number;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface TermRow {
  term_id: string;
  ontology_id: string;
  label: string;
  definition: string | null;
  skos_uri: string;
  broader_term_id: string | null;
  embedding_model: string | null;
  created_at: string;
}

export async function handleNormalize(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // 1. Parse & validate body
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  if (typeof raw !== "object" || raw === null) {
    return badRequest("Request body must be a JSON object");
  }

  const body = raw as Record<string, unknown>;
  const policyId = body["policyId"];
  const organizationId = body["organizationId"];
  const termsRaw = body["terms"];

  if (typeof policyId !== "string" || !policyId) {
    return badRequest("policyId is required");
  }
  if (typeof organizationId !== "string" || !organizationId) {
    return badRequest("organizationId is required");
  }
  if (!Array.isArray(termsRaw)) {
    return badRequest("terms must be an array");
  }

  const terms: TermInput[] = [];
  for (const t of termsRaw) {
    if (typeof t !== "object" || t === null) continue;
    const item = t as Record<string, unknown>;
    const label = item["label"];
    if (typeof label !== "string" || !label) continue;
    const definition = item["definition"];
    const termInput: TermInput = { label };
    if (typeof definition === "string") {
      termInput.definition = definition;
    }
    terms.push(termInput);
  }

  const now = new Date().toISOString();
  const ontologyId = crypto.randomUUID();
  const skosConceptScheme = `urn:aif:scheme:${ontologyId}`;

  // 2. Insert ontology record (status: processing)
  try {
    await env.DB_ONTOLOGY.prepare(
      `INSERT INTO ontologies (
        ontology_id, policy_id, organization_id, neo4j_graph_id,
        skos_concept_scheme, term_count, status, created_at, completed_at
      ) VALUES (?, ?, ?, NULL, ?, 0, 'processing', ?, NULL)`,
    )
      .bind(ontologyId, policyId, organizationId, skosConceptScheme, now)
      .run();
  } catch (e) {
    logger.error("Failed to insert ontology record", { ontologyId, error: String(e) });
    return errFromUnknown(e);
  }

  // 3. Insert each term into D1
  const insertedTerms: TermRow[] = [];

  for (const term of terms) {
    const termId = crypto.randomUUID();
    const skosUri = `urn:aif:term:${termId}`;
    const termRow: TermRow = {
      term_id: termId,
      ontology_id: ontologyId,
      label: term.label,
      definition: term.definition ?? null,
      skos_uri: skosUri,
      broader_term_id: null,
      embedding_model: null,
      created_at: now,
    };

    ctx.waitUntil(
      env.DB_ONTOLOGY.prepare(
        `INSERT INTO terms (
          term_id, ontology_id, label, definition, skos_uri,
          broader_term_id, embedding_model, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
      )
        .bind(termId, ontologyId, term.label, term.definition ?? null, skosUri, now)
        .run(),
    );

    insertedTerms.push(termRow);
  }

  // 4. Try Neo4j upsert — graceful fallback if unavailable
  let neo4jGraphId: string | null = null;
  try {
    const statements = insertedTerms.map((t) => ({
      statement:
        "MERGE (t:Term {uri: $uri}) SET t.label = $label, t.ontologyId = $ontologyId, t.definition = $definition " +
        "WITH t MERGE (o:Ontology {id: $ontologyId}) MERGE (o)-[:HAS_TERM]->(t)",
      parameters: {
        uri: t.skos_uri,
        label: t.label,
        ontologyId,
        definition: t.definition ?? "",
      } as Record<string, unknown>,
    }));

    if (statements.length > 0) {
      // Also upsert ontology → policy relationship
      statements.push({
        statement:
          "MERGE (o:Ontology {id: $ontologyId}) SET o.policyId = $policyId, o.skosScheme = $skosScheme " +
          "WITH o MERGE (p:Policy {id: $policyId}) MERGE (o)-[:EXTRACTED_FROM]->(p)",
        parameters: {
          ontologyId,
          policyId,
          skosScheme: skosConceptScheme,
        } as Record<string, unknown>,
      });

      const neo4jResponse = await neo4jQuery(env, statements);

      if (neo4jResponse.errors.length > 0) {
        const firstError = neo4jResponse.errors[0];
        logger.warn("Neo4j query errors (non-fatal)", {
          errors: neo4jResponse.errors,
          firstCode: firstError?.code,
        });
      } else {
        neo4jGraphId = ontologyId; // use ontologyId as graph reference
        logger.info("Neo4j upsert completed", { ontologyId, termCount: insertedTerms.length });
      }
    }
  } catch (e) {
    // Neo4j may be unavailable in dev — log and continue
    logger.warn("Neo4j upsert failed (non-fatal), continuing without graph storage", {
      error: String(e),
      ontologyId,
    });
  }

  // 5. Update ontology: status → completed, term_count, neo4j_graph_id, completed_at
  const termCount = insertedTerms.length;
  ctx.waitUntil(
    env.DB_ONTOLOGY.prepare(
      `UPDATE ontologies
       SET status = 'completed', term_count = ?, neo4j_graph_id = ?, completed_at = ?
       WHERE ontology_id = ?`,
    )
      .bind(termCount, neo4jGraphId, now, ontologyId)
      .run(),
  );

  // 6. Emit ontology.normalized event
  const event: OntologyNormalizedEvent = {
    eventId: crypto.randomUUID(),
    occurredAt: now,
    type: "ontology.normalized",
    payload: {
      policyId,
      ontologyId,
      organizationId,
      termCount,
      ...(neo4jGraphId !== null ? { skosGraphId: neo4jGraphId } : {}),
    },
  };
  await env.QUEUE_PIPELINE.send(event);

  logger.info("Ontology normalization completed", { ontologyId, policyId, termCount });

  // 7. Return created ontology with terms
  const ontology: OntologyRow = {
    ontology_id: ontologyId,
    policy_id: policyId,
    organization_id: organizationId,
    neo4j_graph_id: neo4jGraphId,
    skos_concept_scheme: skosConceptScheme,
    term_count: termCount,
    status: "completed",
    created_at: now,
    completed_at: now,
  };

  return ok({
    ontology: formatOntologyRow(ontology),
    terms: insertedTerms.map(formatTermRow),
  }, 201);
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatOntologyRow(row: OntologyRow) {
  return {
    ontologyId: row.ontology_id,
    policyId: row.policy_id,
    organizationId: row.organization_id,
    neo4jGraphId: row.neo4j_graph_id,
    skosConceptScheme: row.skos_concept_scheme,
    termCount: row.term_count,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function formatTermRow(row: TermRow) {
  return {
    termId: row.term_id,
    ontologyId: row.ontology_id,
    label: row.label,
    definition: row.definition,
    skosUri: row.skos_uri,
    broaderTermId: row.broader_term_id,
    embeddingModel: row.embedding_model,
    createdAt: row.created_at,
  };
}
