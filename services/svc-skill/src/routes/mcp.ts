/**
 * MCP adapter route — transforms .skill.json into MCP Server tool definitions.
 *
 * Each policy in the Skill package maps to one MCP tool.
 * The adapter JSON is computed on-the-fly (projection, not stored).
 */

import type { SkillPackage } from "@ai-foundry/types";
import {
  createLogger,
  notFound,
  extractRbacContext,
} from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-skill:mcp");

// ── MCP adapter types ────────────────────────────────────────────────

interface McpToolInputSchema {
  type: "object";
  properties: Record<string, { type: string; description: string }>;
  required: string[];
}

interface McpToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  openWorldHint: boolean;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
  annotations: McpToolAnnotations;
}

interface McpAdapter {
  protocolVersion: "2024-11-05";
  capabilities: {
    tools: { listChanged: boolean };
  };
  serverInfo: {
    name: string;
    version: string;
  };
  instructions: string;
  name: string;
  version: string;
  description: string;
  tools: McpTool[];
  metadata: {
    skillId: string;
    domain: string;
    trustLevel: string;
    trustScore: number;
    generatedAt: string;
  };
}

// ── GET /skills/:id/mcp ─────────────────────────────────────────────

export async function handleGetMcpAdapter(
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

  // Transform to MCP adapter format
  const adapter = toMcpAdapter(skillPackage);

  // Record download asynchronously
  const rbacCtx = extractRbacContext(request);
  const downloadedBy = rbacCtx?.userId ?? "anonymous";
  const downloadId = crypto.randomUUID();
  const now = new Date().toISOString();

  ctx.waitUntil(
    env.DB_SKILL.prepare(
      `INSERT INTO skill_downloads (download_id, skill_id, downloaded_by, adapter_type, downloaded_at)
       VALUES (?, ?, ?, 'mcp', ?)`,
    )
      .bind(downloadId, skillId, downloadedBy, now)
      .run(),
  );

  return new Response(JSON.stringify(adapter, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Transformation ───────────────────────────────────────────────────

export function toMcpAdapter(pkg: SkillPackage): McpAdapter {
  const { metadata } = pkg;
  const subdomain = metadata.subdomain;
  const nameSuffix = subdomain
    ? `${metadata.domain}-${subdomain}`
    : metadata.domain;
  const serverName = `ai-foundry-skill-${nameSuffix}`;
  const domainLabel = `${metadata.domain}${subdomain ? ` / ${subdomain}` : ""}`;

  const tools: McpTool[] = pkg.policies.map((policy) => ({
    name: policy.code.toLowerCase(),
    description: `${policy.title} — ${policy.condition}`,
    inputSchema: {
      type: "object" as const,
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
    annotations: {
      title: policy.title,
      readOnlyHint: true,
      openWorldHint: true,
    },
  }));

  return {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: {
      name: serverName,
      version: metadata.version,
    },
    instructions: `AI Foundry Skill for ${domainLabel}. ${pkg.policies.length} policy tool(s) available for evaluation.`,
    name: serverName,
    version: metadata.version,
    description: `AI Foundry Skill: ${domainLabel}`,
    tools,
    metadata: {
      skillId: pkg.skillId,
      domain: metadata.domain,
      trustLevel: pkg.trust.level,
      trustScore: pkg.trust.score,
      generatedAt: new Date().toISOString(),
    },
  };
}
