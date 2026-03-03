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
 * Receives queue events via POST /internal/queue-event from svc-queue-router.
 */

import { createLogger, unauthorized, verifyInternalSecret, errFromUnknown, extractRbacContext, checkPermission, logAudit } from "@ai-foundry/utils";
import type { Env } from "./env.js";
import { handleInferPolicies, handleListPolicies, handleGetPolicy } from "./routes/policies.js";
import { handleApprovePolicy, handleModifyPolicy, handleRejectPolicy, handleGetSession, handleListExpiredSessions, handleCleanupExpiredSessions, handleBulkApprovePolicy } from "./routes/hitl.js";
import { handleReopenPolicies } from "./routes/admin.js";
import { handleGetHitlStats } from "./routes/stats.js";
import { handleGetQualityTrend } from "./routes/quality-trend.js";
import { handleGetReasoningAnalysis } from "./routes/reasoning.js";
import { processQueueEvent } from "./queue/handler.js";

export { HitlSession } from "./hitl-session.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
    if (!verifyInternalSecret(request, env.INTERNAL_API_SECRET)) {
      logger.warn("Unauthorized request", { path, method });
      return unauthorized("Missing or invalid X-Internal-Secret");
    }

    try {
      // POST /internal/queue-event — receive pipeline events from svc-queue-router
      if (method === "POST" && path === "/internal/queue-event") {
        const body: unknown = await request.json();
        return await processQueueEvent(body, env, ctx);
      }

      // POST /admin/reopen-policies — revert approved policies to candidate
      if (method === "POST" && path === "/admin/reopen-policies") {
        return await handleReopenPolicies(request, env);
      }

      // POST /policies/infer — trigger policy inference for an extraction result
      if (method === "POST" && path === "/policies/infer") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "policy", "create");
          if (denied) return denied;
          ctx.waitUntil(logAudit(env, {
            userId: rbacCtx.userId,
            organizationId: rbacCtx.organizationId,
            action: "create",
            resource: "policy",
          }));
        }
        return await handleInferPolicies(request, env, ctx);
      }

      // GET /policies/hitl/stats — HITL review statistics (Trust Dashboard)
      if (method === "GET" && path === "/policies/hitl/stats") {
        return await handleGetHitlStats(request, env);
      }

      // GET /policies/quality-trend — daily policy quality trend (Trust Dashboard)
      if (method === "GET" && path === "/policies/quality-trend") {
        return await handleGetQualityTrend(request, env);
      }

      // GET /policies/reasoning-analysis — conflict/gap/similarity (Trust Dashboard)
      if (method === "GET" && path === "/policies/reasoning-analysis") {
        return await handleGetReasoningAnalysis(request, env);
      }

      // GET /policies — list policy candidates
      if (method === "GET" && path === "/policies") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "policy", "read");
          if (denied) return denied;
        }
        return await handleListPolicies(request, env);
      }

      // POST /policies/bulk-approve — batch approve multiple candidates
      if (method === "POST" && path === "/policies/bulk-approve") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "policy", "approve");
          if (denied) return denied;
          ctx.waitUntil(logAudit(env, {
            userId: rbacCtx.userId,
            organizationId: rbacCtx.organizationId,
            action: "approve",
            resource: "policy",
          }));
        }
        return await handleBulkApprovePolicy(request, env, ctx);
      }

      // GET /hitl/expired — list expired session candidates
      if (method === "GET" && path === "/hitl/expired") {
        return await handleListExpiredSessions(request, env);
      }

      // POST /hitl/cleanup — bulk-expire stale sessions
      if (method === "POST" && path === "/hitl/cleanup") {
        return await handleCleanupExpiredSessions(request, env);
      }

      // Match /policies/:id and /policies/:id/action
      const policyMatch = path.match(/^\/policies\/([^/]+)(?:\/([^/]+))?$/);
      if (policyMatch) {
        const policyId = policyMatch[1];
        if (!policyId) {
          return new Response("Not Found", { status: 404 });
        }
        const action = policyMatch[2]; // approve | modify | reject | undefined

        // GET /policies/:id — single policy detail
        if (method === "GET" && !action) {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "policy", "read");
            if (denied) return denied;
          }
          return await handleGetPolicy(request, env, policyId);
        }

        // POST /policies/:id/approve
        if (method === "POST" && action === "approve") {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "policy", "approve");
            if (denied) return denied;
            ctx.waitUntil(logAudit(env, {
              userId: rbacCtx.userId,
              organizationId: rbacCtx.organizationId,
              action: "approve",
              resource: "policy",
              resourceId: policyId,
            }));
          }
          return await handleApprovePolicy(request, env, policyId, ctx);
        }

        // POST /policies/:id/modify
        if (method === "POST" && action === "modify") {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "policy", "update");
            if (denied) return denied;
            ctx.waitUntil(logAudit(env, {
              userId: rbacCtx.userId,
              organizationId: rbacCtx.organizationId,
              action: "update",
              resource: "policy",
              resourceId: policyId,
            }));
          }
          return await handleModifyPolicy(request, env, policyId, ctx);
        }

        // POST /policies/:id/reject
        if (method === "POST" && action === "reject") {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "policy", "reject");
            if (denied) return denied;
            ctx.waitUntil(logAudit(env, {
              userId: rbacCtx.userId,
              organizationId: rbacCtx.organizationId,
              action: "reject",
              resource: "policy",
              resourceId: policyId,
            }));
          }
          return await handleRejectPolicy(request, env, policyId, ctx);
        }
      }

      // GET /sessions/:id — proxy to HitlSession Durable Object
      const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
      if (method === "GET" && sessionMatch) {
        const sessionId = sessionMatch[1];
        if (!sessionId) {
          return new Response("Not Found", { status: 404 });
        }
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "policy", "read");
          if (denied) return denied;
        }
        return await handleGetSession(request, env, sessionId);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return errFromUnknown(e);
    }
  },
} satisfies ExportedHandler<Env>;
