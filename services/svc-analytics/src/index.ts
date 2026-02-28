/**
 * svc-analytics — SVC-10
 * Analytics: KPI aggregation, business dashboards, cost tracking
 *
 * Routes:
 *   POST /internal/queue-event — process pipeline events for metric aggregation
 *   GET  /kpi                  — KPI summary (pipeline metrics)
 *   GET  /cost                 — LLM cost breakdown by tier
 *   GET  /dashboards           — combined dashboard (pipeline + cost + usage)
 */

import { createLogger, unauthorized, notFound } from "@ai-foundry/utils";
import { processQueueEvent } from "./routes/queue.js";
import { handleGetKpi, handleGetCost, handleGetDashboard } from "./routes/kpi.js";
import type { Env } from "./env.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = createLogger("svc-analytics");
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

      // GET /kpi
      if (method === "GET" && path === "/kpi") {
        return handleGetKpi(request, env);
      }

      // GET /cost
      if (method === "GET" && path === "/cost") {
        return handleGetCost(request, env);
      }

      // GET /dashboards
      if (method === "GET" && path === "/dashboards") {
        return handleGetDashboard(request, env);
      }

      return notFound("route", path);
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
