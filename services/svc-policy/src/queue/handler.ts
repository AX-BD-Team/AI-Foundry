/**
 * Queue event handler — processes extraction.completed events
 * dispatched by svc-queue-router via POST /internal/queue-event.
 */

import { PipelineEventSchema } from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-policy:queue");

/**
 * Process a single pipeline event delivered by svc-queue-router.
 * Expects the body to be a valid PipelineEvent (extraction.completed).
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
  if (event.type !== "extraction.completed") {
    logger.info("Ignoring non-extraction event", { type: event.type });
    return new Response(
      JSON.stringify({ status: "ignored", reason: `Event type '${event.type}' not handled by svc-policy` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  logger.info("Received extraction.completed event", {
    extractionId: event.payload.extractionId,
    documentId: event.payload.documentId,
  });

  // TODO: Full integration — fetch extraction chunks from svc-extraction
  // and call handleInferPolicies internally. For now, log and acknowledge.
  // Cross-service chunk retrieval requires svc-extraction GET /extractions/:id/chunks
  // endpoint (not yet implemented).

  return new Response(
    JSON.stringify({
      status: "processed",
      eventId: event.eventId,
      type: event.type,
      extractionId: event.payload.extractionId,
      documentId: event.payload.documentId,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
