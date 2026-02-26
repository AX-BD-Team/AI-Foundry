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

import { createLogger, unauthorized } from "@ai-foundry/utils";
import type { ExportedHandler } from "@cloudflare/workers-types";
import type { Env } from "./env.js";

const NOT_IMPLEMENTED = JSON.stringify({
  success: false,
  error: { code: "NOT_IMPLEMENTED", message: "Not implemented" },
});

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
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
      // POST /extract — trigger structure extraction for a document
      // GET  /extractions/:id — retrieve extraction result
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
