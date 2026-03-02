/**
 * OpenAPI adapter route — transforms .skill.json into an OpenAPI 3.0 specification.
 *
 * Each policy in the Skill package maps to one POST /evaluate/{policyCode} endpoint.
 * The spec JSON is computed on-the-fly (projection, not stored).
 */

import type { SkillPackage, Policy } from "@ai-foundry/types";
import {
  createLogger,
  notFound,
  extractRbacContext,
} from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-skill:openapi");

// ── OpenAPI 3.0 types (minimal subset) ──────────────────────────────

interface OpenApiInfo {
  title: string;
  description: string;
  version: string;
  contact: { name: string };
}

interface OpenApiSchema {
  type: string;
  properties?: Record<string, { type: string; description: string }>;
  required?: string[];
  description?: string;
}

interface OpenApiRequestBody {
  required: boolean;
  content: {
    "application/json": { schema: OpenApiSchema };
  };
}

interface OpenApiResponse {
  description: string;
  content?: {
    "application/json": { schema: OpenApiSchema };
  };
}

interface OpenApiOperation {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  requestBody: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  security: Array<Record<string, string[]>>;
}

interface OpenApiPathItem {
  post: OpenApiOperation;
}

interface OpenApiSecurityScheme {
  type: string;
  scheme: string;
  bearerFormat: string;
  description: string;
}

interface OpenApiSpec {
  openapi: "3.0.3";
  info: OpenApiInfo;
  paths: Record<string, OpenApiPathItem>;
  components: {
    securitySchemes: Record<string, OpenApiSecurityScheme>;
    schemas: Record<string, OpenApiSchema>;
  };
  tags: Array<{ name: string; description: string }>;
}

// ── GET /skills/:id/openapi ─────────────────────────────────────────

export async function handleGetOpenApiAdapter(
  request: Request,
  env: Env,
  skillId: string,
  ctx: ExecutionContext,
): Promise<Response> {
  const row = await env.DB_SKILL.prepare(
    "SELECT r2_key FROM skills WHERE skill_id = ?",
  )
    .bind(skillId)
    .first<{ r2_key: string }>();

  if (!row) {
    return notFound("Skill", skillId);
  }

  const r2Object = await env.R2_SKILL_PACKAGES.get(row["r2_key"]);
  if (!r2Object) {
    logger.error("R2 object not found for skill", { skillId, r2Key: row["r2_key"] });
    return notFound("Skill package file", skillId);
  }

  // Parse the stored .skill.json
  const raw = await r2Object.text();
  let skillPackage: SkillPackage;
  try {
    skillPackage = JSON.parse(raw) as SkillPackage;
  } catch (e) {
    logger.error("Failed to parse skill package JSON", { skillId, error: String(e) });
    return new Response("Internal Server Error", { status: 500 });
  }

  // Transform to OpenAPI spec
  const spec = toOpenApiSpec(skillPackage);

  // Record download asynchronously
  const rbacCtx = extractRbacContext(request);
  const downloadedBy = rbacCtx?.userId ?? "anonymous";
  const downloadId = crypto.randomUUID();
  const now = new Date().toISOString();

  ctx.waitUntil(
    env.DB_SKILL.prepare(
      `INSERT INTO skill_downloads (download_id, skill_id, downloaded_by, adapter_type, downloaded_at)
       VALUES (?, ?, ?, 'openapi', ?)`,
    )
      .bind(downloadId, skillId, downloadedBy, now)
      .run(),
  );

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Transformation ───────────────────────────────────────────────────

function policyToPathItem(policy: Policy): OpenApiPathItem {
  return {
    post: {
      operationId: `evaluate_${policy.code.toLowerCase().replace(/-/g, "_")}`,
      summary: policy.title,
      description: [
        `**Condition**: ${policy.condition}`,
        `**Criteria**: ${policy.criteria}`,
        `**Outcome**: ${policy.outcome}`,
      ].join("\n\n"),
      tags: ["evaluate"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/EvaluateRequest" } as unknown as OpenApiSchema,
          },
        },
      },
      responses: {
        "200": {
          description: "Policy evaluation result",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EvaluateResponse" } as unknown as OpenApiSchema,
            },
          },
        },
        "400": { description: "Invalid request" },
        "401": { description: "Unauthorized" },
        "404": { description: "Policy not found" },
      },
      security: [{ bearerAuth: [] }],
    },
  };
}

export function toOpenApiSpec(pkg: SkillPackage): OpenApiSpec {
  const { metadata } = pkg;
  const subdomain = metadata.subdomain;
  const domainLabel = `${metadata.domain}${subdomain ? ` / ${subdomain}` : ""}`;

  const paths: Record<string, OpenApiPathItem> = {};
  for (const policy of pkg.policies) {
    const pathKey = `/evaluate/${policy.code.toLowerCase()}`;
    paths[pathKey] = policyToPathItem(policy);
  }

  return {
    openapi: "3.0.3",
    info: {
      title: `AI Foundry Skill: ${domainLabel}`,
      description: `Auto-generated OpenAPI spec from AI Foundry Skill package (${pkg.skillId}). Contains ${pkg.policies.length} policy evaluation endpoint(s).`,
      version: metadata.version,
      contact: { name: metadata.author },
    },
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "AI Foundry access token",
        },
      },
      schemas: {
        EvaluateRequest: {
          type: "object",
          properties: {
            context: {
              type: "string",
              description: "적용 대상의 상황 설명",
            },
            parameters: {
              type: "object",
              description: "판단에 필요한 추가 파라미터",
            },
          },
          required: ["context"],
        },
        EvaluateResponse: {
          type: "object",
          properties: {
            result: {
              type: "string",
              description: "정책 평가 결과",
            },
            confidence: {
              type: "number",
              description: "평가 신뢰도 (0-1)",
            },
            reasoning: {
              type: "string",
              description: "평가 근거 설명",
            },
          },
          required: ["result", "confidence"],
        },
      },
    },
    tags: [
      {
        name: "evaluate",
        description: `Policy evaluation endpoints for ${domainLabel}`,
      },
    ],
  };
}
