/**
 * svc-policy — SVC-03
 * Stage 3 — Policy Inference (Claude Opus via LLM Router) + HITL
 *
 * Receives structured extraction results from svc-extraction and:
 *  1. Sends process graphs / entity maps to Claude Opus (via LLM Router Tier 1)
 *     to generate policy candidates as condition-criteria-outcome triples.
 *  2. Creates a HitlSession Durable Object per candidate and notifies Reviewers
 *     via svc-notification.
 *  3. Exposes HITL review endpoints so Reviewers can approve / modify / reject.
 *  4. On confirmation, emits a pipeline event to QUEUE_PIPELINE for svc-ontology.
 *
 * Queue consumer: listens on "ai-foundry-pipeline" for Stage 2 completion events.
 */

import { createLogger, unauthorized } from "@ai-foundry/utils";
import type { ExportedHandler } from "@cloudflare/workers-types";
import type { Env } from "./env.js";
export { HitlSession } from "./hitl-session.js";

const NOT_IMPLEMENTED = JSON.stringify({
  success: false,
  error: { code: "NOT_IMPLEMENTED", message: "Not implemented" },
});

async function fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const logger = createLogger("svc-policy");
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
    // POST /policies/infer        — trigger policy inference for an extraction result
    // GET  /policies              — list policy candidates (with HITL status)
    // GET  /policies/:id          — retrieve a single policy candidate
    // POST /policies/:id/approve  — Reviewer approves the policy candidate
    // POST /policies/:id/modify   — Reviewer modifies and approves
    // POST /policies/:id/reject   — Reviewer rejects the policy candidate
    // GET  /sessions/:id          — proxy to HitlSession Durable Object
    return new Response(NOT_IMPLEMENTED, {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    logger.error("Unhandled error", { error: String(e), path, method });
    return new Response("Internal Server Error", { status: 500 });
  }
}

export default { fetch } satisfies ExportedHandler<Env>;
