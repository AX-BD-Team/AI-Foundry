/**
 * svc-extraction — SVC-02
 * Stage 2 — Structure Extraction (Claude Sonnet/Haiku via LLM Router)
 *
 * Consumes structured document chunks from svc-ingestion and produces:
 *  - Process graph nodes/edges
 *  - Entity relation maps
 *  - Trace matrices
 * Results are written to DB_EXTRACTION and forwarded to svc-policy via the pipeline queue.
 */

import { createLogger, unauthorized, notFound, ok, extractRbacContext, checkPermission, logAudit } from "@ai-foundry/utils";
import type { Env } from "./env.js";
import { handleExtract } from "./routes/extract.js";
import { handleAnalysisRoutes } from "./routes/analysis.js";
import { handleCompareRoutes } from "./routes/compare.js";
import { processQueueEvent } from "./queue/handler.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = createLogger("svc-extraction");
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // Health check — no auth required
    if (method === "GET" && path === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", service: env.SERVICE_NAME }),
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
      // /analysis/* and /analyze routes — analysis + cross-org comparison
      if (path.startsWith("/analysis") || path === "/analyze") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const action = method === "GET" ? "read" : "execute";
          const denied = await checkPermission(env, rbacCtx.role, "extraction", action);
          if (denied) return denied;
        }
        // compare routes first (more specific), then analysis routes
        if (path.startsWith("/analysis/compare") || path === "/analysis/compare") {
          return await handleCompareRoutes(request, env, ctx);
        }
        if (path.startsWith("/analysis/") && path.includes("/service-groups")) {
          return await handleCompareRoutes(request, env, ctx);
        }
        return await handleAnalysisRoutes(request, env, ctx);
      }

      // POST /internal/queue-event — invoked by svc-queue-router via service binding
      if (method === "POST" && path === "/internal/queue-event") {
        const body: unknown = await request.json();
        return await processQueueEvent(body, env, ctx);
      }

      // POST /extract — trigger structure extraction for a document
      if (method === "POST" && path === "/extract") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "extraction", "execute");
          if (denied) return denied;
          ctx.waitUntil(logAudit(env, {
            userId: rbacCtx.userId,
            organizationId: rbacCtx.organizationId,
            action: "execute",
            resource: "extraction",
          }));
        }
        return await handleExtract(request, env, ctx);
      }

      // GET /extractions?documentId=:id — list extractions for a document
      if (method === "GET" && path === "/extractions") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "extraction", "read");
          if (denied) return denied;
        }
        const documentId = url.searchParams.get("documentId");
        if (!documentId) {
          return ok({ extractions: [] });
        }
        const { results } = await env.DB_EXTRACTION.prepare(
          `SELECT id, document_id, status, process_node_count, entity_count, created_at, updated_at
           FROM extractions WHERE document_id = ? ORDER BY created_at DESC`,
        )
          .bind(documentId)
          .all<{
            id: string;
            document_id: string;
            status: string;
            process_node_count: number | null;
            entity_count: number | null;
            created_at: string;
            updated_at: string | null;
          }>();
        return ok({
          extractions: results.map((r) => ({
            extractionId: r.id,
            documentId: r.document_id,
            status: r.status,
            processNodeCount: r.process_node_count ?? 0,
            entityCount: r.entity_count ?? 0,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })),
        });
      }

      // GET /extractions/:id — retrieve extraction result
      const extractionMatch = path.match(/^\/extractions\/([^/]+)$/);
      if (method === "GET" && extractionMatch) {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "extraction", "read");
          if (denied) return denied;
        }
        const extractionId = extractionMatch[1];
        if (!extractionId) {
          return notFound("extraction");
        }

        const row = await env.DB_EXTRACTION.prepare(
          `SELECT id, document_id, status, process_node_count, entity_count,
                  result_json, created_at, updated_at
           FROM extractions WHERE id = ?`,
        )
          .bind(extractionId)
          .first<{
            id: string;
            document_id: string;
            status: string;
            process_node_count: number | null;
            entity_count: number | null;
            result_json: string | null;
            created_at: string;
            updated_at: string;
          }>();

        if (!row) {
          return notFound("extraction", extractionId);
        }

        return ok({
          extractionId: row.id,
          documentId: row.document_id,
          status: row.status,
          processNodeCount: row.process_node_count ?? 0,
          entityCount: row.entity_count ?? 0,
          result: row.result_json ? JSON.parse(row.result_json) : null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }

      return notFound("route");
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
