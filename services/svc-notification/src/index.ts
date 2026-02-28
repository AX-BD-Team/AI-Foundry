/**
 * svc-notification — SVC-09
 * Notification: Queue-based review alerts
 *
 * Queue events: delivered by svc-queue-router via POST /internal/queue-event.
 * Routes:
 *   POST /internal/queue-event     — process pipeline events (policy.candidate_ready, skill.packaged)
 *   GET  /notifications?userId=... — list notifications for a user
 *   PATCH /notifications/:id/read  — mark a notification as read
 */

import { createLogger, unauthorized, notFound } from "@ai-foundry/utils";
import { processQueueEvent } from "./routes/queue.js";
import { handleListNotifications, handleMarkRead } from "./routes/notifications.js";
import type { Env } from "./env.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = createLogger("svc-notification");
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // Health check — no auth required
    if (method === "GET" && path === "/health") {
      return new Response(
        JSON.stringify({
          service: env.SERVICE_NAME,
          status: "ok",
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // All other routes require inter-service secret
    const secret = request.headers.get("X-Internal-Secret");
    if (!secret || secret !== env.INTERNAL_API_SECRET) {
      logger.warn("Unauthorized request", { path, method });
      return unauthorized("Missing or invalid X-Internal-Secret");
    }

    try {
      // POST /internal/queue-event
      if (method === "POST" && path === "/internal/queue-event") {
        return processQueueEvent(request, env, ctx);
      }

      // GET /notifications?userId=...
      if (method === "GET" && path === "/notifications") {
        return handleListNotifications(request, env);
      }

      // PATCH /notifications/:id/read
      const readMatch = path.match(/^\/notifications\/([^/]+)\/read$/);
      if (method === "PATCH" && readMatch?.[1]) {
        return handleMarkRead(request, env, readMatch[1]);
      }

      return notFound("route", path);
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
