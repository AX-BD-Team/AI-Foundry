import { createLogger, unauthorized, extractRbacContext, checkPermission, logAudit } from "@ai-foundry/utils";
import type { Env } from "./env.js";
import { handleHealth } from "./routes/health.js";
import { handleUpload, handleGetDocument } from "./routes/upload.js";
import { processQueueEvent } from "./queue.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = createLogger("svc-ingestion");
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
      // POST /internal/queue-event — queue router delivers events here
      if (method === "POST" && path === "/internal/queue-event") {
        const body: unknown = await request.json();
        return await processQueueEvent(body, env);
      }

      // POST /documents — upload a new document
      if (method === "POST" && path === "/documents") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "document", "upload");
          if (denied) return denied;
          ctx.waitUntil(logAudit(env, {
            userId: rbacCtx.userId,
            organizationId: rbacCtx.organizationId,
            action: "upload",
            resource: "document",
          }));
        }
        return await handleUpload(request, env, ctx);
      }

      // GET /documents/:id
      const docMatch = path.match(/^\/documents\/([^/]+)$/);
      if (method === "GET" && docMatch) {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "document", "read");
          if (denied) return denied;
        }
        const documentId = docMatch[1];
        if (!documentId) {
          return new Response("Not Found", { status: 404 });
        }
        return await handleGetDocument(request, env, documentId);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
