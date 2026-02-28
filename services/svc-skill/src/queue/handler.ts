/**
 * Queue event handler — processes ontology.normalized events
 * dispatched by svc-queue-router via POST /internal/queue-event.
 */

import { PipelineEventSchema } from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-skill:queue");

/**
 * Process a single pipeline event delivered by svc-queue-router.
 * Expects the body to be a valid PipelineEvent (ontology.normalized).
 */
export async function processQueueEvent(
  body: unknown,
  env: Env,
  _ctx: ExecutionContext,
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
  if (event.type !== "ontology.normalized") {
    logger.info("Ignoring non-ontology.normalized event", { type: event.type });
    return new Response(
      JSON.stringify({ status: "ignored", reason: `Event type '${event.type}' not handled by svc-skill` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  logger.info("Received ontology.normalized event", {
    policyId: event.payload.policyId,
    ontologyId: event.payload.ontologyId,
    termCount: event.payload.termCount,
  });

  // TODO: Full integration — fetch confirmed policies from svc-policy
  // and call handleCreateSkill internally. Requires svc-policy
  // GET /policies?policyId=:id endpoint to retrieve structured Policy objects.
  // For now, log and acknowledge.

  return new Response(
    JSON.stringify({
      status: "processed",
      eventId: event.eventId,
      type: event.type,
      policyId: event.payload.policyId,
      ontologyId: event.payload.ontologyId,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
