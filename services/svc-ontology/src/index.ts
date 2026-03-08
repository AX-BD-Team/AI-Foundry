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
  verifyInternalSecret,
  errFromUnknown,
  extractRbacContext,
  checkPermission,
  logAudit,
} from "@ai-foundry/utils";
import type { Env } from "./env.js";
import { handleNormalize } from "./routes/normalize.js";
import { handleGetTerm, handleListTerms, handleGetGraph, handleTermsStats, handleGraphVisualization } from "./routes/terms.js";
import { handleBackfillNeo4j } from "./routes/backfill.js";
import { processQueueEvent } from "./queue/handler.js";

/** Diagnostic: test Neo4j Query API v2 connectivity and report config. */
async function handleNeo4jHealth(env: Env): Promise<Response> {
  const hasUri = Boolean(env.NEO4J_URI);
  const hasUser = Boolean(env.NEO4J_USERNAME);
  const hasPass = Boolean(env.NEO4J_PASSWORD);
  const hasDb = Boolean(env.NEO4J_DATABASE);

  // Mask URI: show scheme + first 8 chars of host + "..."
  const maskedUri = hasUri
    ? env.NEO4J_URI.replace(/(https?:\/\/)([^/]{0,12})(.*)/, "$1$2...")
    : "(not set)";

  // Check if URI contains port number
  const uriHasPort = hasUri && /:\d+$/.test(new URL(env.NEO4J_URI).host);

  const diag: Record<string, unknown> = {
    secretsConfigured: { uri: hasUri, username: hasUser, password: hasPass, database: hasDb },
    maskedUri,
    uriHasPort,
    database: hasDb ? env.NEO4J_DATABASE : "(not set)",
  };

  if (!hasUri || !hasUser || !hasPass || !hasDb) {
    return Response.json({ status: "error", reason: "missing_secrets", ...diag }, { status: 503 });
  }

  // Attempt RETURN 1 query
  const url = `${env.NEO4J_URI}/db/${env.NEO4J_DATABASE}/query/v2`;
  const auth = btoa(`${env.NEO4J_USERNAME}:${env.NEO4J_PASSWORD}`);

  try {
    const start = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ statement: "RETURN 1 AS ping", parameters: {} }),
    });
    const elapsed = Date.now() - start;
    const body = await response.text();

    if (response.ok) {
      return Response.json({
        status: "ok",
        latencyMs: elapsed,
        httpStatus: response.status,
        ...diag,
      });
    }

    return Response.json({
      status: "error",
      reason: "neo4j_http_error",
      httpStatus: response.status,
      latencyMs: elapsed,
      errorBody: body.slice(0, 500),
      ...diag,
    }, { status: 502 });
  } catch (e) {
    return Response.json({
      status: "error",
      reason: "fetch_failed",
      error: String(e),
      ...diag,
    }, { status: 502 });
  }
}

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

    // Neo4j diagnostic — no auth, but masks sensitive info
    if (method === "GET" && path === "/neo4j/health") {
      return await handleNeo4jHealth(env);
    }

    // All other routes require inter-service secret
    if (!verifyInternalSecret(request, env.INTERNAL_API_SECRET)) {
      logger.warn("Unauthorized request", { path, method });
      return unauthorized("Missing or invalid X-Internal-Secret");
    }

    try {
      // POST /internal/queue-event — queue router delivers events here
      if (method === "POST" && path === "/internal/queue-event") {
        const body: unknown = await request.json();
        return await processQueueEvent(body, env, ctx);
      }

      // POST /admin/backfill-neo4j — backfill NULL neo4j_graph_id records
      if (method === "POST" && path === "/admin/backfill-neo4j") {
        return await handleBackfillNeo4j(request, env);
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

      // GET /terms/stats — aggregate counts
      if (method === "GET" && path === "/terms/stats") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "ontology", "read");
          if (denied) return denied;
        }
        return await handleTermsStats(request, env);
      }

      // GET /graph/visualization — force-graph-ready data
      if (method === "GET" && path === "/graph/visualization") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "ontology", "read");
          if (denied) return denied;
        }
        return await handleGraphVisualization(request, env);
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
      return errFromUnknown(e);
    }
  },
} satisfies ExportedHandler<Env>;
