/**
 * svc-queue-router — Pipeline Event Bus Router
 *
 * Sole consumer of `ai-foundry-pipeline` queue.
 * Dispatches events to the appropriate service via service bindings.
 *
 * IMPORTANT: Only staging/production env Workers should consume queues.
 * The default env Worker must NOT be deployed to avoid consumer conflicts
 * (Cloudflare allows only one consumer per queue).
 */

import { PipelineEventSchema } from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";

interface Env {
  INTERNAL_API_SECRET: string;
  ENVIRONMENT?: string;
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
  | "skill.packaged"
  | "analysis.requested"
  | "analysis.completed"
  | "diagnosis.completed"
  | "diagnosis.review_completed"
  | "factcheck.requested"
  | "factcheck.completed";

/** Named target: service name + Fetcher binding for better observability */
interface NamedTarget {
  name: string;
  fetcher: Fetcher;
}

/** Map each event type to the target service binding(s) with names for logging */
function getTargets(type: EventType, env: Env): NamedTarget[] {
  const primary: NamedTarget[] = (() => {
    switch (type) {
      case "document.uploaded":
        return [{ name: "svc-ingestion", fetcher: env.SVC_INGESTION }];
      case "ingestion.completed":
        return [{ name: "svc-extraction", fetcher: env.SVC_EXTRACTION }];
      case "extraction.completed":
        return [{ name: "svc-policy", fetcher: env.SVC_POLICY }];
      case "policy.candidate_ready":
        return [{ name: "svc-notification", fetcher: env.SVC_NOTIFICATION }];
      case "policy.approved":
        return [{ name: "svc-ontology", fetcher: env.SVC_ONTOLOGY }];
      case "ontology.normalized":
        return [{ name: "svc-skill", fetcher: env.SVC_SKILL }];
      case "skill.packaged":
        return [{ name: "svc-notification", fetcher: env.SVC_NOTIFICATION }];
      case "analysis.requested":
        return [{ name: "svc-extraction", fetcher: env.SVC_EXTRACTION }];
      case "analysis.completed":
        return [{ name: "svc-notification", fetcher: env.SVC_NOTIFICATION }];
      case "diagnosis.completed":
        return [{ name: "svc-notification", fetcher: env.SVC_NOTIFICATION }];
      case "diagnosis.review_completed":
        return [{ name: "svc-notification", fetcher: env.SVC_NOTIFICATION }];
      case "factcheck.requested":
      case "factcheck.completed":
        return [{ name: "svc-extraction", fetcher: env.SVC_EXTRACTION }];
    }
  })();
  // All events also go to analytics for metric aggregation
  return [...primary, { name: "svc-analytics", fetcher: env.SVC_ANALYTICS }];
}

export default {
  async fetch(_req: Request, env: Env): Promise<Response> {
    const url = new URL(_req.url);
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "svc-queue-router",
        environment: env.ENVIRONMENT ?? "unknown",
      });
    }
    return new Response("svc-queue-router — pipeline event bus", { status: 200 });
  },

  async queue(batch: MessageBatch<unknown>, env: Env, _ctx: ExecutionContext): Promise<void> {
    const logger = createLogger("svc-queue-router");

    logger.info("Queue batch received", {
      queueName: batch.queue,
      messageCount: batch.messages.length,
      environment: env.ENVIRONMENT ?? "unknown",
    });

    for (const message of batch.messages) {
      const parsed = PipelineEventSchema.safeParse(message.body);
      if (!parsed.success) {
        logger.warn("Invalid pipeline event — skipping", {
          id: message.id,
          attempts: message.attempts,
          error: parsed.error.message,
          bodyPreview: JSON.stringify(message.body).slice(0, 300),
        });
        message.ack();
        continue;
      }

      const event = parsed.data;
      const targets = getTargets(event.type, env);
      const targetNames = targets.map((t) => t.name);

      logger.info("Routing event", {
        type: event.type,
        eventId: event.eventId,
        attempt: message.attempts,
        targets: targetNames,
      });

      const dispatches = targets.map(async (target) => {
        const startMs = Date.now();
        let resp: Response;
        try {
          resp = await target.fetcher.fetch("http://internal/internal/queue-event", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Secret": env.INTERNAL_API_SECRET,
            },
            body: JSON.stringify(event),
          });
        } catch (fetchError) {
          const elapsed = Date.now() - startMs;
          logger.error("Service binding fetch error", {
            target: target.name,
            type: event.type,
            eventId: event.eventId,
            elapsed,
            error: String(fetchError),
          });
          throw fetchError;
        }

        const elapsed = Date.now() - startMs;

        if (!resp.ok) {
          const body = await resp.text();
          logger.error("Dispatch target returned error", {
            target: target.name,
            type: event.type,
            eventId: event.eventId,
            status: resp.status,
            elapsed,
            responsePreview: body.slice(0, 300),
          });
          throw new Error(
            `Dispatch to ${target.name} failed: ${resp.status} — ${body.slice(0, 200)}`,
          );
        }

        logger.info("Dispatch success", {
          target: target.name,
          type: event.type,
          eventId: event.eventId,
          status: resp.status,
          elapsed,
        });
      });

      try {
        const results = await Promise.allSettled(dispatches);
        const failures = results
          .map((r, i) => ({ result: r, target: targets[i] }))
          .filter((entry): entry is { result: PromiseRejectedResult; target: NamedTarget | undefined } =>
            entry.result.status === "rejected",
          );

        if (failures.length > 0) {
          for (const f of failures) {
            const reason = f.result.reason;
            logger.error("Dispatch failed — will retry", {
              type: event.type,
              eventId: event.eventId,
              target: f.target?.name ?? "unknown",
              attempt: message.attempts,
              reason: reason instanceof Error ? reason.message : String(reason),
            });
          }
          message.retry();
        } else {
          logger.info("All dispatches succeeded", {
            type: event.type,
            eventId: event.eventId,
            targetCount: targets.length,
          });
          message.ack();
        }
      } catch (e) {
        logger.error("Dispatch error", {
          type: event.type,
          eventId: event.eventId,
          attempt: message.attempts,
          error: String(e),
        });
        message.retry();
      }
    }
  },
};
