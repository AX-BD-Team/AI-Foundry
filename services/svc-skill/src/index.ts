/**
 * svc-skill — SVC-05
 * Stage 5 — Skill Packaging (AI Foundry Skill Spec)
 *
 * Assembles confirmed policies and ontology references into a .skill.json
 * package conforming to the AI Foundry Skill Spec (JSON Schema Draft 2020-12).
 * Packages are stored in R2_SKILL_PACKAGES (ai-foundry-skill-packages bucket).
 * Catalog metadata is persisted to DB_SKILL.
 *
 * Policy code format: POL-{DOMAIN}-{TYPE}-{SEQ}
 *   e.g. POL-PENSION-WD-HOUSING-001
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
    const logger = createLogger("svc-skill");
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
      // POST /skills          — package a new Skill from confirmed policies
      // GET  /skills          — list Skill packages in the catalog
      // GET  /skills/:id      — retrieve Skill package metadata
      // GET  /skills/:id/download — download the .skill.json from R2
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
