/**
 * Queue event handler — processes policy.approved events
 * dispatched by svc-queue-router via POST /internal/queue-event.
 *
 * Flow:
 *  1. Receive policy.approved event
 *  2. Fetch approved policy details from svc-policy via service binding
 *  3. Extract domain terms from policy condition/criteria/outcome
 *  4. Normalize terms: D1 insert + Neo4j upsert (graceful fallback)
 *  5. Emit ontology.normalized event
 */

import { PipelineEventSchema } from "@ai-foundry/types";
import type { OntologyNormalizedEvent } from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";
import { neo4jQuery } from "../neo4j/client.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-ontology:queue");

interface PolicyApiResponse {
  success: boolean;
  data: {
    policyId: string;
    extractionId: string;
    organizationId: string;
    policyCode: string;
    title: string;
    condition: string;
    criteria: string;
    outcome: string;
    sourceDocumentId: string;
    status: string;
  };
}

interface ExtractedTerm {
  label: string;
  definition: string;
}

/**
 * Simple term extraction from policy text.
 * Extracts Korean compound nouns and domain-specific terms.
 */
function extractTermsFromPolicy(policy: PolicyApiResponse["data"]): ExtractedTerm[] {
  const terms: ExtractedTerm[] = [];
  const seen = new Set<string>();

  // Extract key phrases from condition, criteria, outcome
  const sources = [
    { text: policy.condition, context: "조건" },
    { text: policy.criteria, context: "기준" },
    { text: policy.outcome, context: "결과" },
  ];

  // Korean domain term patterns (2+ char compound nouns)
  const termPattern = /[가-힣]{2,}(?:\s[가-힣]{2,})?/g;

  // Common stopwords to skip
  const stopwords = new Set([
    "경우", "해당", "필요", "확인", "통해", "기반", "관련", "대한",
    "위한", "따른", "의한", "있는", "없는", "하는", "되는", "이상",
    "이하", "이내", "범위", "내에서", "여부",
  ]);

  for (const source of sources) {
    const matches = source.text.match(termPattern);
    if (!matches) continue;

    for (const match of matches) {
      const trimmed = match.trim();
      if (trimmed.length < 2 || stopwords.has(trimmed) || seen.has(trimmed)) continue;
      seen.add(trimmed);
      terms.push({
        label: trimmed,
        definition: `${policy.title}의 ${source.context}에서 추출된 도메인 용어`,
      });
    }
  }

  // Limit to top 10 most relevant terms
  return terms.slice(0, 10);
}

/**
 * Process a single pipeline event delivered by svc-queue-router.
 * Expects the body to be a valid PipelineEvent (policy.approved).
 */
export async function processQueueEvent(
  body: unknown,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const parsed = PipelineEventSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("Invalid pipeline event", {
      error: parsed.error.message,
    });
    return new Response(
      JSON.stringify({ error: "Invalid pipeline event", details: parsed.error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const event = parsed.data;
  if (event.type !== "policy.approved") {
    logger.info("Ignoring non-policy.approved event", { type: event.type });
    return new Response(
      JSON.stringify({ status: "ignored", reason: `Event type '${event.type}' not handled by svc-ontology` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const { policyId } = event.payload;
  logger.info("Processing policy.approved event", { policyId });

  // 1. Fetch approved policy from svc-policy
  let policy: PolicyApiResponse["data"];
  try {
    const resp = await env.SVC_POLICY.fetch(
      `http://internal/policies/${policyId}`,
      {
        method: "GET",
        headers: {
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
        },
      },
    );

    if (!resp.ok) {
      logger.error("Failed to fetch policy", { policyId, status: resp.status });
      return new Response(
        JSON.stringify({ status: "error", reason: `Policy fetch failed: ${resp.status}` }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const data = (await resp.json()) as PolicyApiResponse;
    policy = data.data;
  } catch (e) {
    logger.error("Policy fetch error", { policyId, error: String(e) });
    return new Response(
      JSON.stringify({ status: "error", reason: `Policy fetch error: ${String(e)}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 2. Extract terms from policy text
  const terms = extractTermsFromPolicy(policy);
  logger.info("Extracted terms from policy", { policyId, termCount: terms.length });

  const now = new Date().toISOString();
  const ontologyId = crypto.randomUUID();
  const skosConceptScheme = `urn:aif:scheme:${ontologyId}`;

  // 3. Insert ontology record
  try {
    await env.DB_ONTOLOGY.prepare(
      `INSERT INTO ontologies (
        ontology_id, policy_id, organization_id, neo4j_graph_id,
        skos_concept_scheme, term_count, status, created_at, completed_at
      ) VALUES (?, ?, ?, NULL, ?, 0, 'processing', ?, NULL)`,
    )
      .bind(ontologyId, policyId, policy.organizationId, skosConceptScheme, now)
      .run();
  } catch (e) {
    logger.error("Failed to insert ontology record", { ontologyId, error: String(e) });
    return new Response(
      JSON.stringify({ status: "error", reason: `D1 insert failed: ${String(e)}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 4. Insert each term into D1
  const insertedTermIds: string[] = [];
  const termUris: string[] = [];

  for (const term of terms) {
    const termId = crypto.randomUUID();
    const skosUri = `urn:aif:term:${termId}`;

    ctx.waitUntil(
      env.DB_ONTOLOGY.prepare(
        `INSERT INTO terms (
          term_id, ontology_id, label, definition, skos_uri,
          broader_term_id, embedding_model, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
      )
        .bind(termId, ontologyId, term.label, term.definition, skosUri, now)
        .run(),
    );

    insertedTermIds.push(termId);
    termUris.push(skosUri);
  }

  // 5. Try Neo4j upsert — graceful fallback if unavailable
  let neo4jGraphId: string | null = null;
  try {
    const statements = terms.map((t, i) => ({
      statement:
        "MERGE (t:Term {uri: $uri}) SET t.label = $label, t.ontologyId = $ontologyId, t.definition = $definition " +
        "WITH t MERGE (o:Ontology {id: $ontologyId}) MERGE (o)-[:HAS_TERM]->(t)",
      parameters: {
        uri: termUris[i] ?? "",
        label: t.label,
        ontologyId,
        definition: t.definition,
      } as Record<string, unknown>,
    }));

    if (statements.length > 0) {
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
      if (neo4jResponse.errors.length === 0) {
        neo4jGraphId = ontologyId;
        logger.info("Neo4j upsert completed", { ontologyId, termCount: terms.length });
      } else {
        logger.warn("Neo4j query errors (non-fatal)", { errors: neo4jResponse.errors });
      }
    }
  } catch (e) {
    logger.warn("Neo4j upsert failed (non-fatal)", { error: String(e), ontologyId });
  }

  // 6. Update ontology status
  const termCount = terms.length;
  ctx.waitUntil(
    env.DB_ONTOLOGY.prepare(
      `UPDATE ontologies
       SET status = 'completed', term_count = ?, neo4j_graph_id = ?, completed_at = ?
       WHERE ontology_id = ?`,
    )
      .bind(termCount, neo4jGraphId, now, ontologyId)
      .run(),
  );

  // 7. Emit ontology.normalized event
  const outEvent: OntologyNormalizedEvent = {
    eventId: crypto.randomUUID(),
    occurredAt: now,
    type: "ontology.normalized",
    payload: {
      policyId,
      ontologyId,
      organizationId: policy.organizationId,
      termCount,
      ...(neo4jGraphId !== null ? { skosGraphId: neo4jGraphId } : {}),
    },
  };
  await env.QUEUE_PIPELINE.send(outEvent);

  logger.info("Queue-triggered ontology normalization completed", {
    policyId,
    ontologyId,
    termCount,
  });

  return new Response(
    JSON.stringify({
      status: "processed",
      eventId: event.eventId,
      type: event.type,
      ontologyId,
      policyId,
      termCount,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
