/**
 * svc-notification — SVC-09
 * Notification: Queue-based review alerts
 *
 * Queue events: delivered by svc-queue-router via POST /internal/queue-event.
 */

import { createLogger, unauthorized } from "@ai-foundry/utils";
import type { Env } from "./env.js";

const NOT_IMPLEMENTED = JSON.stringify({
  success: false,
  error: { code: "NOT_IMPLEMENTED", message: "Not implemented" },
});

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
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
      // POST /internal/queue-event — queue router delivers events here
      if (method === "POST" && path === "/internal/queue-event") {
        const body: unknown = await request.json();
        logger.info("Processing notification event", { body });
        return new Response(
          JSON.stringify({ status: "processed" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // TODO: implement notification routes
      // POST /notify       — send a notification directly (internal use)
      // GET  /notifications — list recent notification records
      return new Response(NOT_IMPLEMENTED, {
        status: 501,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
