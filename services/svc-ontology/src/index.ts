/**
 * svc-ontology — SVC-04
 * Stage 4 — Ontology Normalization (Neo4j Aura + SKOS/JSON-LD)
 *
 * Receives confirmed policy triples from svc-policy and:
 *  - Normalizes terms against the SKOS/JSON-LD domain ontology
 *  - Persists/updates nodes and relationships in Neo4j Aura
 *  - Maintains a terminology dictionary in DB_ONTOLOGY (D1)
 *  - Emits ontology.normalized events for svc-skill (Stage 5)
 *
 * Queue events: delivered by svc-queue-router via POST /internal/queue-event.
 */

import {
  createLogger,
  unauthorized,
  extractRbacContext,
  checkPermission,
  logAudit,
} from "@ai-foundry/utils";
import type { Env } from "./env.js";
import { handleNormalize } from "./routes/normalize.js";
import { handleGetTerm, handleListTerms, handleGetGraph } from "./routes/terms.js";
import { processQueueEvent } from "./queue/handler.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const logger = createLogger("svc-ontology");
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
      // POST /internal/queue-event — queue router delivers events here
      if (method === "POST" && path === "/internal/queue-event") {
        const body: unknown = await request.json();
        return await processQueueEvent(body, env, ctx);
      }

      // POST /normalize — normalize terms against the ontology
      if (method === "POST" && path === "/normalize") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "ontology", "create");
          if (denied) return denied;
          ctx.waitUntil(
            logAudit(env, {
              userId: rbacCtx.userId,
              organizationId: rbacCtx.organizationId,
              action: "create",
              resource: "ontology",
            }),
          );
        }
        return await handleNormalize(request, env, ctx);
      }

      // GET /terms — list terms with optional ontologyId filter
      if (method === "GET" && path === "/terms") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "ontology", "read");
          if (denied) return denied;
        }
        return await handleListTerms(request, env);
      }

      // GET /terms/:id — single term lookup
      const termMatch = path.match(/^\/terms\/([^/]+)$/);
      if (method === "GET" && termMatch) {
        const termId = termMatch[1];
        if (!termId) {
          return new Response("Not Found", { status: 404 });
        }
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "ontology", "read");
          if (denied) return denied;
        }
        return await handleGetTerm(request, env, termId);
      }

      // GET /graph — proxy Cypher query to Neo4j
      if (method === "GET" && path === "/graph") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "ontology", "read");
          if (denied) return denied;
        }
        return await handleGetGraph(request, env);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
