/**
 * svc-governance — SVC-08
 * Governance: Prompt Registry, cost monitoring, trust dashboard
 */

import { createLogger, unauthorized, errFromUnknown, extractRbacContext, checkPermission, logAudit } from "@ai-foundry/utils";
import type { ExportedHandler } from "@cloudflare/workers-types";
import type { Env } from "./env.js";
import { handleCreatePrompt, handleListPrompts, handleGetPrompt } from "./routes/prompts.js";
import { handleGetCost } from "./routes/cost.js";
import { handleGetTrust, handleCreateTrustEvaluation } from "./routes/trust.js";
import { handleGetGoldenTests } from "./routes/golden-tests.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = createLogger("svc-governance");
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
      // Prompt Registry
      if (method === "POST" && path === "/prompts") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "governance", "create");
          if (denied) return denied;
          ctx.waitUntil(logAudit(env, {
            userId: rbacCtx.userId,
            organizationId: rbacCtx.organizationId,
            action: "create",
            resource: "governance",
          }));
        }
        return await handleCreatePrompt(request, env, ctx);
      }
      if (method === "GET" && path === "/prompts") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "governance", "read");
          if (denied) return denied;
        }
        return await handleListPrompts(request, env);
      }
      const promptMatch = path.match(/^\/prompts\/([^/]+)$/);
      if (method === "GET" && promptMatch) {
        const id = promptMatch[1];
        if (!id) return new Response("Not Found", { status: 404 });
        return await handleGetPrompt(request, env, id);
      }

      // Cost monitoring
      if (method === "GET" && path === "/cost") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "governance", "read");
          if (denied) return denied;
        }
        return await handleGetCost(request, env);
      }

      // Golden test history
      if (method === "GET" && path === "/golden-tests") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "governance", "read");
          if (denied) return denied;
        }
        return await handleGetGoldenTests(request, env);
      }

      // Trust dashboard
      if (method === "GET" && path === "/trust") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "governance", "read");
          if (denied) return denied;
        }
        return await handleGetTrust(request, env);
      }
      if (method === "POST" && path === "/trust") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "governance", "create");
          if (denied) return denied;
          ctx.waitUntil(logAudit(env, {
            userId: rbacCtx.userId,
            organizationId: rbacCtx.organizationId,
            action: "create",
            resource: "governance",
          }));
        }
        return await handleCreateTrustEvaluation(request, env);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return errFromUnknown(e);
    }
  },
} satisfies ExportedHandler<Env>;
