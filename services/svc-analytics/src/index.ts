/**
 * svc-analytics — SVC-10
 * Analytics: KPI aggregation, business dashboards, cost tracking
 *
 * Routes:
 *   POST /internal/queue-event — process pipeline events for metric aggregation
 *   GET  /kpi                  — KPI summary (pipeline metrics)
 *   GET  /cost                 — LLM cost breakdown by tier
 *   GET  /dashboards           — combined dashboard (pipeline + cost + usage)
 *   GET  /quality              — quality metrics (parsing, extraction, policy, skill)
 */

import { createLogger, unauthorized, notFound, extractRbacContext, checkPermission, logAudit } from "@ai-foundry/utils";
import { processQueueEvent } from "./routes/queue.js";
import { handleGetKpi, handleGetCost, handleGetDashboard } from "./routes/kpi.js";
import { handleGetQuality } from "./routes/quality.js";
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
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "analytics", "read");
          if (denied) return denied;
        }
        return handleGetKpi(request, env);
      }

      // GET /cost
      if (method === "GET" && path === "/cost") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "analytics", "read");
          if (denied) return denied;
        }
        return handleGetCost(request, env);
      }

      // GET /dashboards
      if (method === "GET" && path === "/dashboards") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "analytics", "read");
          if (denied) return denied;
          ctx.waitUntil(logAudit(env, {
            userId: rbacCtx.userId,
            organizationId: rbacCtx.organizationId,
            action: "read",
            resource: "analytics",
          }));
        }
        return handleGetDashboard(request, env);
      }

      // GET /quality
      if (method === "GET" && path === "/quality") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "analytics", "read");
          if (denied) return denied;
        }
        return handleGetQuality(request, env);
      }

      return notFound("route", path);
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
