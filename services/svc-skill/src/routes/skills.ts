/**
 * Skill routes — create, list, get, download.
 */

import {
  PolicySchema,
  OntologyRefSchema,
  ProvenanceSchema,
  type SkillPackagedEvent,
  type SkillSummary,
} from "@ai-foundry/types";
import {
  createLogger,
  ok,
  created,
  badRequest,
  notFound,
  errFromUnknown,
  extractRbacContext,
} from "@ai-foundry/utils";
import { z } from "zod";
import { buildSkillPackage } from "../assembler/skill-builder.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-skill:routes");

// ── Request schema ────────────────────────────────────────────────────

const CreateSkillRequestSchema = z.object({
  domain: z.string().min(1),
  subdomain: z.string().optional(),
  policies: z.array(PolicySchema).min(1),
  ontologyId: z.string().min(1),
  ontologyRef: OntologyRefSchema,
  provenance: ProvenanceSchema,
  author: z.string().min(1),
  tags: z.array(z.string()).optional(),
  version: z.string().default("1.0.0"),
  language: z.string().optional(),
});

// ── D1 row type ───────────────────────────────────────────────────────

export interface SkillRow {
  skill_id: string;
  ontology_id: string;
  organization_id: string;
  domain: string;
  subdomain: string | null;
  language: string;
  version: string;
  r2_key: string;
  policy_count: number;
  trust_level: string;
  trust_score: number;
  tags: string;
  author: string;
  status: string;
  content_depth: number;
  created_at: string;
  updated_at: string;
}

// ── POST /skills ──────────────────────────────────────────────────────

export async function handleCreateSkill(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = CreateSkillRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest("Invalid request body", parsed.error.flatten());
  }

  const { domain, subdomain, policies, ontologyId, ontologyRef, provenance, author, tags, version, language } =
    parsed.data;

  // Build the SkillPackage
  let skillPackage;
  try {
    skillPackage = buildSkillPackage({
      policies,
      ontologyRef,
      provenance,
      domain,
      ...(subdomain !== undefined ? { subdomain } : {}),
      ...(language !== undefined ? { language } : {}),
      ...(tags !== undefined ? { tags } : {}),
      version,
      author,
    });
  } catch (e) {
    logger.error("Failed to build skill package", { error: String(e) });
    return badRequest(`Skill assembly failed: ${String(e)}`);
  }

  const { skillId, trust, metadata } = skillPackage;
  const r2Key = `skill-packages/${skillId}.skill.json`;
  const now = new Date().toISOString();

  // Calculate content depth from policies
  let contentDepth = 0;
  for (const p of policies) {
    contentDepth += p.condition.length + p.criteria.length + p.outcome.length;
  }

  // Store .skill.json in R2
  try {
    await env.R2_SKILL_PACKAGES.put(r2Key, JSON.stringify(skillPackage, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (e) {
    logger.error("Failed to store skill package in R2", { skillId, error: String(e) });
    return errFromUnknown(e);
  }

  // Insert catalog record into D1
  const organizationId = request.headers.get("X-Organization-Id") ?? "unknown";
  try {
    await env.DB_SKILL.prepare(
      `INSERT INTO skills (
        skill_id, ontology_id, organization_id, domain, subdomain, language, version,
        r2_key, policy_count, trust_level, trust_score, tags, author,
        status, content_depth, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    )
      .bind(
        skillId,
        ontologyId,
        organizationId,
        domain,
        subdomain ?? null,
        metadata.language,
        version,
        r2Key,
        policies.length,
        trust.level,
        trust.score,
        JSON.stringify(metadata.tags),
        author,
        contentDepth,
        now,
        now,
      )
      .run();
  } catch (e) {
    logger.error("Failed to insert skill catalog record", { skillId, error: String(e) });
    return errFromUnknown(e);
  }

  // Emit skill.packaged event
  const event: SkillPackagedEvent = {
    eventId: crypto.randomUUID(),
    occurredAt: now,
    type: "skill.packaged",
    payload: {
      skillId,
      ontologyId,
      organizationId,
      r2Key,
      policyCount: policies.length,
      trustScore: trust.score,
    },
  };
  await env.QUEUE_PIPELINE.send(event);

  logger.info("Skill package created", { skillId, domain, policyCount: policies.length });

  const summary: SkillSummary = {
    skillId,
    metadata,
    trust,
    policyCount: policies.length,
    r2Key,
  };

  return created(summary);
}

// ── Sort options ──────────────────────────────────────────────────────

const SORT_OPTIONS: Record<string, string> = {
  newest: "created_at DESC",
  oldest: "created_at ASC",
  trust_desc: "trust_score DESC",
  trust_asc: "trust_score ASC",
  policy_count: "policy_count DESC",
  depth_desc: "content_depth DESC",
  depth_asc: "content_depth ASC",
};

// ── GET /skills ───────────────────────────────────────────────────────

export async function handleListSkills(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = request.headers.get("X-Organization-Id") ?? "unknown";
  const domain = url.searchParams.get("domain");
  const subdomain = url.searchParams.get("subdomain");
  const status = url.searchParams.get("status");
  const trustLevel = url.searchParams.get("trustLevel");
  const q = url.searchParams.get("q");
  const tag = url.searchParams.get("tag");
  const minDepthParam = url.searchParams.get("minDepth");
  const sort = url.searchParams.get("sort") ?? "newest";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);
  const offset = Number(url.searchParams.get("offset") ?? "0");

  let whereClause = "WHERE organization_id = ?";
  const binds: (string | number)[] = [organizationId];

  if (domain) {
    whereClause += " AND domain = ?";
    binds.push(domain);
  }
  if (subdomain) {
    whereClause += " AND subdomain = ?";
    binds.push(subdomain);
  }
  if (status) {
    whereClause += " AND status = ?";
    binds.push(status);
  }
  if (trustLevel) {
    whereClause += " AND trust_level = ?";
    binds.push(trustLevel);
  }
  if (minDepthParam) {
    const minDepth = Number(minDepthParam);
    if (!Number.isNaN(minDepth) && minDepth > 0) {
      whereClause += " AND content_depth >= ?";
      binds.push(minDepth);
    }
  }
  if (q) {
    whereClause += " AND (domain LIKE ? OR subdomain LIKE ? OR author LIKE ? OR tags LIKE ?)";
    const pattern = `%${q}%`;
    binds.push(pattern, pattern, pattern, pattern);
  }
  if (tag) {
    whereClause += " AND tags LIKE ?";
    binds.push(`%"${tag}"%`);
  }

  // Count query (same filters, no ORDER/LIMIT/OFFSET)
  const countQuery = `SELECT COUNT(*) as cnt FROM skills ${whereClause}`;
  const countResult = await env.DB_SKILL.prepare(countQuery)
    .bind(...binds)
    .first<{ cnt: number }>();
  const total = countResult?.cnt ?? 0;

  // Data query with sort, limit, offset
  const orderBy = SORT_OPTIONS[sort] ?? SORT_OPTIONS["newest"]!;
  const dataQuery = `SELECT * FROM skills ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  const dataBinds = [...binds, limit, offset];

  const result = await env.DB_SKILL.prepare(dataQuery).bind(...dataBinds).all<SkillRow>();
  const skills = (result.results ?? []).map(rowToSummary);

  return ok({ skills, total, limit, offset });
}

// ── GET /skills/search/tags ──────────────────────────────────────────

export async function handleSearchTags(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id") ?? "unknown";
  const result = await env.DB_SKILL.prepare(
    "SELECT DISTINCT tags FROM skills WHERE organization_id = ? AND status != 'archived'",
  )
    .bind(organizationId)
    .all<{ tags: string }>();

  const rows = result.results ?? [];
  const tagSet = new Set<string>();
  for (const row of rows) {
    const parsed = parseTags(row.tags);
    for (const t of parsed) {
      tagSet.add(t);
    }
  }

  const tags = [...tagSet].sort();
  return ok({ tags });
}

// ── GET /skills/stats ────────────────────────────────────────────────

export async function handleGetSkillStats(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id") ?? "unknown";

  // Total skills and total policies
  const totals = await env.DB_SKILL.prepare(
    "SELECT COUNT(*) as total_skills, COALESCE(SUM(policy_count), 0) as total_policies FROM skills WHERE organization_id = ?",
  )
    .bind(organizationId)
    .first<{ total_skills: number; total_policies: number }>();

  const totalSkills = totals?.total_skills ?? 0;
  const totalPolicies = totals?.total_policies ?? 0;

  // By trust level
  const trustRows = await env.DB_SKILL.prepare(
    "SELECT trust_level, COUNT(*) as cnt FROM skills WHERE organization_id = ? GROUP BY trust_level",
  )
    .bind(organizationId)
    .all<{ trust_level: string; cnt: number }>();

  const byTrustLevel: Record<string, number> = { unreviewed: 0, reviewed: 0, validated: 0 };
  for (const row of trustRows.results ?? []) {
    byTrustLevel[row.trust_level] = row.cnt;
  }

  // By domain
  const domainRows = await env.DB_SKILL.prepare(
    "SELECT domain, COUNT(*) as cnt FROM skills WHERE organization_id = ? GROUP BY domain",
  )
    .bind(organizationId)
    .all<{ domain: string; cnt: number }>();

  const byDomain: Record<string, number> = {};
  for (const row of domainRows.results ?? []) {
    byDomain[row.domain] = row.cnt;
  }

  // Top tags — aggregate from all non-archived skills
  const tagRows = await env.DB_SKILL.prepare(
    "SELECT tags FROM skills WHERE organization_id = ? AND status != 'archived'",
  )
    .bind(organizationId)
    .all<{ tags: string }>();

  const tagCounts = new Map<string, number>();
  for (const row of tagRows.results ?? []) {
    const parsed = parseTags(row.tags);
    for (const t of parsed) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }

  const topTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 20);

  // Content depth distribution
  const depthRows = await env.DB_SKILL.prepare(
    `SELECT
       SUM(CASE WHEN content_depth >= 150 THEN 1 ELSE 0 END) as rich,
       SUM(CASE WHEN content_depth >= 50 AND content_depth < 150 THEN 1 ELSE 0 END) as medium,
       SUM(CASE WHEN content_depth < 50 THEN 1 ELSE 0 END) as thin
     FROM skills WHERE organization_id = ?`,
  )
    .bind(organizationId)
    .first<{ rich: number; medium: number; thin: number }>();

  const byContentDepth = {
    rich: depthRows?.rich ?? 0,
    medium: depthRows?.medium ?? 0,
    thin: depthRows?.thin ?? 0,
  };

  return ok({
    totalSkills,
    totalPolicies,
    byTrustLevel,
    byDomain,
    byContentDepth,
    topTags,
  });
}

// ── GET /skills/:id ───────────────────────────────────────────────────

export async function handleGetSkill(
  _request: Request,
  env: Env,
  skillId: string,
): Promise<Response> {
  const row = await env.DB_SKILL.prepare(
    "SELECT * FROM skills WHERE skill_id = ?",
  )
    .bind(skillId)
    .first<SkillRow>();

  if (!row) {
    return notFound("Skill", skillId);
  }

  return ok(rowToDetail(row));
}

// ── GET /skills/:id/download ──────────────────────────────────────────

export async function handleDownloadSkill(
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

  // Record download asynchronously
  const rbacCtx = extractRbacContext(request);
  const downloadedBy = rbacCtx?.userId ?? "anonymous";
  const downloadId = crypto.randomUUID();
  const now = new Date().toISOString();

  ctx.waitUntil(
    env.DB_SKILL.prepare(
      `INSERT INTO skill_downloads (download_id, skill_id, downloaded_by, adapter_type, downloaded_at)
       VALUES (?, ?, ?, 'core', ?)`,
    )
      .bind(downloadId, skillId, downloadedBy, now)
      .run(),
  );

  const body = await r2Object.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${skillId}.skill.json"`,
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────

export function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string");
    }
  } catch {
    // fall through
  }
  return [];
}

export function rowToSummary(row: SkillRow): SkillSummary & { status: string; contentDepth: number } {
  return {
    skillId: row.skill_id,
    metadata: {
      domain: row.domain,
      ...(row.subdomain !== null ? { subdomain: row.subdomain } : {}),
      language: row.language,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      author: row.author,
      tags: parseTags(row.tags),
    },
    trust: {
      level: row.trust_level as "unreviewed" | "reviewed" | "validated",
      score: row.trust_score,
    },
    policyCount: row.policy_count,
    r2Key: row.r2_key,
    status: row.status,
    contentDepth: row.content_depth,
  };
}

export function rowToDetail(row: SkillRow) {
  return {
    ...rowToSummary(row),
    ontologyId: row.ontology_id,
  };
}
