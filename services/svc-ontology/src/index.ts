/**
 * svc-ontology — SVC-04
 * Stage 4 — Ontology Normalization (Neo4j Aura + SKOS/JSON-LD)
 *
 * Receives confirmed policy triples from svc-policy and:
 *  - Normalizes terms against the SKOS/JSON-LD domain ontology
 *  - Persists/updates nodes and relationships in Neo4j Aura
 *  - Maintains a terminology dictionary in DB_ONTOLOGY (D1)
 *  - Generates embeddings via LLM Router (Workers AI tier)
 */

import { createLogger, unauthorized } from "@ai-foundry/utils";
import type { ExportedHandler } from "@cloudflare/workers-types";
import type { Env } from "./env.js";

const NOT_IMPLEMENTED = JSON.stringify({
  success: false,
  error: { code: "NOT_IMPLEMENTED", message: "Not implemented" },
});

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
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
      // POST /normalize  — normalize a set of terms/policies against the ontology
      // GET  /terms/:id  — retrieve a term/SKOS concept by ID
      // GET  /graph      — query the ontology graph (proxies to Neo4j Aura)
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
