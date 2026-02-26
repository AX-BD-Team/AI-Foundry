import { createLogger, unauthorized } from "@ai-foundry/utils";
import type { Env } from "./env.js";
import { handleHealth } from "./routes/health.js";
import { handleCheckPermission, handleGetRolePermissions } from "./routes/rbac.js";
import { handleWriteAudit, handleQueryAudit } from "./routes/audit.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = createLogger("svc-security");
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // Health check — no auth required
    if (method === "GET" && path === "/health") {
      return handleHealth();
    }

    // All other routes require inter-service secret
    const secret = request.headers.get("X-Internal-Secret");
    if (!secret || secret !== env.INTERNAL_API_SECRET) {
      logger.warn("Unauthorized request", { path, method });
      return unauthorized("Missing or invalid X-Internal-Secret");
    }

    try {
      // RBAC routes
      if (method === "POST" && path === "/rbac/check") {
        return await handleCheckPermission(request);
      }
      if (method === "POST" && path === "/rbac/permissions") {
        return await handleGetRolePermissions(request);
      }

      // Audit routes
      if (method === "POST" && path === "/audit") {
        return await handleWriteAudit(request, env, ctx);
      }
      if (method === "GET" && path === "/audit") {
        return await handleQueryAudit(request, env);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
