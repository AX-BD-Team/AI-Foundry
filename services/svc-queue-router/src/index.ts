/**
 * svc-queue-router — Pipeline Event Bus Router
 *
 * Sole consumer of `ai-foundry-pipeline` queue.
 * Dispatches events to the appropriate service via service bindings.
 */

import { PipelineEventSchema } from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";

interface Env {
  INTERNAL_API_SECRET: string;
  SVC_INGESTION: Fetcher;
  SVC_EXTRACTION: Fetcher;
  SVC_POLICY: Fetcher;
  SVC_ONTOLOGY: Fetcher;
  SVC_SKILL: Fetcher;
  SVC_NOTIFICATION: Fetcher;
  SVC_ANALYTICS: Fetcher;
}

type EventType =
  | "document.uploaded"
  | "ingestion.completed"
  | "extraction.completed"
  | "policy.candidate_ready"
  | "policy.approved"
  | "ontology.normalized"
  | "skill.packaged";

/** Map each event type to the target service binding(s) */
function getTargets(type: EventType, env: Env): Fetcher[] {
  const primary: Fetcher[] = (() => {
    switch (type) {
      case "document.uploaded":
        return [env.SVC_INGESTION];
      case "ingestion.completed":
        return [env.SVC_EXTRACTION];
      case "extraction.completed":
        return [env.SVC_POLICY];
      case "policy.candidate_ready":
        return [env.SVC_NOTIFICATION];
      case "policy.approved":
        return [env.SVC_ONTOLOGY];
      case "ontology.normalized":
        return [env.SVC_SKILL];
      case "skill.packaged":
        return [env.SVC_NOTIFICATION];
    }
  })();
  // All events also go to analytics for metric aggregation
  return [...primary, env.SVC_ANALYTICS];
}

export default {
  async fetch(_req: Request): Promise<Response> {
    const url = new URL(_req.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "svc-queue-router" });
    }
    return new Response("svc-queue-router — pipeline event bus", { status: 200 });
  },

  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
    const logger = createLogger("svc-queue-router");

    for (const message of batch.messages) {
      const parsed = PipelineEventSchema.safeParse(message.body);
      if (!parsed.success) {
        logger.warn("Invalid pipeline event — skipping", {
          id: message.id,
          error: parsed.error.message,
        });
        message.ack();
        continue;
      }

      const event = parsed.data;
      const targets = getTargets(event.type, env);

      logger.info("Routing event", {
        type: event.type,
        eventId: event.eventId,
        targetCount: targets.length,
      });

      const dispatches = targets.map(async (target) => {
        const resp = await target.fetch("http://internal/internal/queue-event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": env.INTERNAL_API_SECRET,
          },
          body: JSON.stringify(event),
        });

        if (!resp.ok) {
          const body = await resp.text();
          logger.error("Dispatch failed", {
            type: event.type,
            status: resp.status,
            body: body.slice(0, 200),
          });
        }
      });

      try {
        ctx.waitUntil(Promise.allSettled(dispatches));
        message.ack();
      } catch (e) {
        logger.error("Dispatch error", { type: event.type, error: String(e) });
        message.retry();
      }
    }
  },
};
