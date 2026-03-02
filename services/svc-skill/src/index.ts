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
} from "./routes/skills.js";
import { handleGetMcpAdapter } from "./routes/mcp.js";
import { handleGetOpenApiAdapter } from "./routes/openapi.js";
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
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
