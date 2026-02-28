/**
 * Queue event handler — processes policy.approved events
 * dispatched by svc-queue-router via POST /internal/queue-event.
 */

import { PipelineEventSchema } from "@ai-foundry/types";
import type { OntologyNormalizedEvent } from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-ontology:queue");

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

  const { policyId, policyCount } = event.payload;
  logger.info("Received policy.approved event", { policyId, policyCount });

  // Bootstrap an ontology record for this approved policy batch.
  // Detailed term normalization is triggered via POST /normalize once
  // policy terms are available from the upstream extraction pipeline.
  const now = new Date().toISOString();
  const ontologyId = crypto.randomUUID();
  const skosConceptScheme = `urn:aif:scheme:${ontologyId}`;

  try {
    await env.DB_ONTOLOGY.prepare(
      `INSERT INTO ontologies (
        ontology_id, policy_id, organization_id, neo4j_graph_id,
        skos_concept_scheme, term_count, status, created_at, completed_at
      ) VALUES (?, ?, ?, NULL, ?, 0, 'pending', ?, NULL)`,
    )
      .bind(ontologyId, policyId, "system", skosConceptScheme, now)
      .run();

    // Emit ontology.normalized so downstream svc-skill can begin
    const outEvent: OntologyNormalizedEvent = {
      eventId: crypto.randomUUID(),
      occurredAt: now,
      type: "ontology.normalized",
      payload: {
        policyId,
        ontologyId,
        termCount: 0,
      },
    };

    ctx.waitUntil(env.QUEUE_PIPELINE.send(outEvent));

    logger.info("Bootstrapped ontology record", { ontologyId, policyId });

    return new Response(
      JSON.stringify({
        status: "processed",
        eventId: event.eventId,
        type: event.type,
        ontologyId,
        policyId,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    logger.error("Failed to bootstrap ontology for policy.approved event", {
      policyId,
      error: String(e),
    });
    return new Response(
      JSON.stringify({ error: "Processing failed", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
