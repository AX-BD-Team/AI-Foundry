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
        return await processQueueEvent(body, env, ctx);
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

      // GET /documents — list documents for an organization
      if (method === "GET" && path === "/documents") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "document", "read");
          if (denied) return denied;
        }
        const orgId = request.headers.get("X-Organization-Id") ?? "unknown";
        const limit = Number(url.searchParams.get("limit") ?? "50");
        const offset = Number(url.searchParams.get("offset") ?? "0");
        const { results } = await env.DB_INGESTION.prepare(
          `SELECT document_id, organization_id, uploaded_by, r2_key, file_type,
                  file_size_byte, original_name, status, uploaded_at
           FROM documents WHERE organization_id = ?
           ORDER BY uploaded_at DESC LIMIT ? OFFSET ?`,
        )
          .bind(orgId, limit, offset)
          .all<{
            document_id: string;
            organization_id: string;
            uploaded_by: string;
            r2_key: string;
            file_type: string;
            file_size_byte: number;
            original_name: string;
            status: string;
            uploaded_at: string;
          }>();
        return Response.json({ success: true, data: { documents: results } });
      }

      // GET /documents/:id/chunks — retrieve parsed chunks for a document
      const chunksMatch = path.match(/^\/documents\/([^/]+)\/chunks$/);
      if (method === "GET" && chunksMatch) {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "document", "read");
          if (denied) return denied;
        }
        const documentId = chunksMatch[1];
        if (!documentId) {
          return new Response("Not Found", { status: 404 });
        }
        const { results } = await env.DB_INGESTION.prepare(
          `SELECT chunk_id, chunk_index, element_type, masked_text, classification, word_count
           FROM document_chunks WHERE document_id = ? ORDER BY chunk_index`,
        )
          .bind(documentId)
          .all<{
            chunk_id: string;
            chunk_index: number;
            element_type: string;
            masked_text: string;
            classification: string;
            word_count: number;
          }>();
        return new Response(JSON.stringify({ documentId, chunks: results }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
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
