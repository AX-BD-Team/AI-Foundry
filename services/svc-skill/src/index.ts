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
import {
  handleCreateSkill,
  handleListSkills,
  handleGetSkill,
  handleDownloadSkill,
  handleSearchTags,
  handleGetSkillStats,
  handleUpdateSkillStatus,
  handleBulkPublish,
} from "./routes/skills.js";
import { handleGetMcpAdapter, handleGetOrgMcpAdapter } from "./routes/mcp.js";
import { handleExportCc } from "./routes/export-cc.js";
import { handleGetOpenApiAdapter } from "./routes/openapi.js";
import { handleEvaluateSkill, handleListEvaluations } from "./routes/evaluate.js";
import { handleBackfillDepth, handleBackfillTrust, handleRebundle } from "./routes/admin.js";
import {
  handleGeneratePrototype,
  handleListPrototypes,
  handleGetPrototype,
  handleDownloadPrototype,
} from "./routes/prototype.js";
import { processQueueEvent } from "./queue/handler.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

      // POST /admin/backfill-depth — compute content_depth for existing skills
      if (method === "POST" && path === "/admin/backfill-depth") {
        return await handleBackfillDepth(request, env);
      }

      // POST /admin/backfill-trust — compute trust_score from trust_level + content_depth
      if (method === "POST" && path === "/admin/backfill-trust") {
        return await handleBackfillTrust(request, env);
      }

      // POST /admin/bulk-publish — batch status update for skills
      if (method === "POST" && path === "/admin/bulk-publish") {
        return await handleBulkPublish(request, env);
      }

      // POST /admin/rebundle — LLM-based skill bundling
      if (method === "POST" && path === "/admin/rebundle") {
        return await handleRebundle(request, env, ctx);
      }

      // ── Prototype (Working Prototype Generator) ──

      // POST /prototype/generate — start WP generation (async)
      if (method === "POST" && path === "/prototype/generate") {
        return await handleGeneratePrototype(request, env, ctx);
      }

      // GET /prototype — list prototypes
      if (method === "GET" && path === "/prototype") {
        return await handleListPrototypes(request, env);
      }

      // GET /prototype/:id or /prototype/:id/download
      const protoMatch = path.match(/^\/prototype\/([^/]+)(?:\/([^/]+))?$/);
      if (protoMatch) {
        const protoId = protoMatch[1];
        if (!protoId) return new Response("Not Found", { status: 404 });
        const protoSub = protoMatch[2];

        if (method === "GET" && protoSub === "download") {
          return await handleDownloadPrototype(env, protoId);
        }
        if (method === "GET" && !protoSub) {
          return await handleGetPrototype(env, protoId);
        }
      }

      // GET /skills/org/:orgId/mcp — org-level MCP adapter (all bundled skills)
      const orgMcpMatch = path.match(/^\/skills\/org\/([^/]+)\/mcp$/);
      if (method === "GET" && orgMcpMatch) {
        const orgId = orgMcpMatch[1];
        if (!orgId) return new Response("Not Found", { status: 404 });
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "skill", "download");
          if (denied) return denied;
          ctx.waitUntil(logAudit(env, {
            userId: rbacCtx.userId,
            organizationId: rbacCtx.organizationId,
            action: "download",
            resource: "skill",
            details: { adapter_type: "mcp-org", orgId },
          }));
        }
        return await handleGetOrgMcpAdapter(request, env, orgId, ctx);
      }

      // POST /skills — package a new Skill from confirmed policies
      if (method === "POST" && path === "/skills") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "skill", "create");
          if (denied) return denied;
          ctx.waitUntil(
            logAudit(env, {
              userId: rbacCtx.userId,
              organizationId: rbacCtx.organizationId,
              action: "create",
              resource: "skill",
            }),
          );
        }
        return await handleCreateSkill(request, env, ctx);
      }

      // GET /skills — list Skill packages in the catalog
      if (method === "GET" && path === "/skills") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "skill", "read");
          if (denied) return denied;
        }
        return await handleListSkills(request, env);
      }

      // GET /skills/search/tags — unique tag list for filter dropdowns
      if (method === "GET" && path === "/skills/search/tags") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "skill", "read");
          if (denied) return denied;
        }
        return await handleSearchTags(request, env);
      }

      // GET /skills/stats — marketplace dashboard stats
      if (method === "GET" && path === "/skills/stats") {
        const rbacCtx = extractRbacContext(request);
        if (rbacCtx) {
          const denied = await checkPermission(env, rbacCtx.role, "skill", "read");
          if (denied) return denied;
        }
        return await handleGetSkillStats(request, env);
      }

      // Match /skills/:id and /skills/:id/download
      const skillMatch = path.match(/^\/skills\/([^/]+)(?:\/([^/]+))?$/);
      if (skillMatch) {
        const skillId = skillMatch[1];
        if (!skillId) {
          return new Response("Not Found", { status: 404 });
        }
        const subpath = skillMatch[2]; // "download" | undefined

        // GET /skills/:id/download
        if (method === "GET" && subpath === "download") {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "skill", "download");
            if (denied) return denied;
            ctx.waitUntil(
              logAudit(env, {
                userId: rbacCtx.userId,
                organizationId: rbacCtx.organizationId,
                action: "download",
                resource: "skill",
                resourceId: skillId,
              }),
            );
          }
          return await handleDownloadSkill(request, env, skillId, ctx);
        }

        // GET /skills/:id/export-cc — CC Skill ZIP export
        if (method === "GET" && subpath === "export-cc") {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "skill", "download");
            if (denied) return denied;
            ctx.waitUntil(
              logAudit(env, {
                userId: rbacCtx.userId,
                organizationId: rbacCtx.organizationId,
                action: "download",
                resource: "skill",
                resourceId: skillId,
                details: { adapter_type: "cc-skill" },
              }),
            );
          }
          return await handleExportCc(request, env, skillId, ctx);
        }

        // POST /skills/:id/evaluate — policy evaluation
        if (method === "POST" && subpath === "evaluate") {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "skill", "read");
            if (denied) return denied;
            ctx.waitUntil(
              logAudit(env, {
                userId: rbacCtx.userId,
                organizationId: rbacCtx.organizationId,
                action: "evaluate",
                resource: "skill",
                resourceId: skillId,
              }),
            );
          }
          return await handleEvaluateSkill(request, env, skillId, ctx);
        }

        // GET /skills/:id/evaluations — evaluation history
        if (method === "GET" && subpath === "evaluations") {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "skill", "read");
            if (denied) return denied;
          }
          return await handleListEvaluations(request, env, skillId);
        }

        // GET /skills/:id/mcp — MCP adapter projection
        if (method === "GET" && subpath === "mcp") {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "skill", "download");
            if (denied) return denied;
            ctx.waitUntil(
              logAudit(env, {
                userId: rbacCtx.userId,
                organizationId: rbacCtx.organizationId,
                action: "download",
                resource: "skill",
                resourceId: skillId,
                details: { adapter_type: "mcp" },
              }),
            );
          }
          return await handleGetMcpAdapter(request, env, skillId, ctx);
        }

        // PATCH /skills/:id/status — update skill status
        if (method === "PATCH" && subpath === "status") {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "skill", "create");
            if (denied) return denied;
            ctx.waitUntil(
              logAudit(env, {
                userId: rbacCtx.userId,
                organizationId: rbacCtx.organizationId,
                action: "update_status",
                resource: "skill",
                resourceId: skillId,
              }),
            );
          }
          return await handleUpdateSkillStatus(request, env, skillId);
        }

        // GET /skills/:id/openapi — OpenAPI 3.0 adapter projection
        if (method === "GET" && subpath === "openapi") {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "skill", "download");
            if (denied) return denied;
            ctx.waitUntil(
              logAudit(env, {
                userId: rbacCtx.userId,
                organizationId: rbacCtx.organizationId,
                action: "download",
                resource: "skill",
                resourceId: skillId,
                details: { adapter_type: "openapi" },
              }),
            );
          }
          return await handleGetOpenApiAdapter(request, env, skillId, ctx);
        }

        // GET /skills/:id
        if (method === "GET" && !subpath) {
          const rbacCtx = extractRbacContext(request);
          if (rbacCtx) {
            const denied = await checkPermission(env, rbacCtx.role, "skill", "read");
            if (denied) return denied;
          }
          return await handleGetSkill(request, env, skillId);
        }
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      logger.error("Unhandled error", { error: String(e), path, method });
      return errFromUnknown(e);
    }
  },
} satisfies ExportedHandler<Env>;
