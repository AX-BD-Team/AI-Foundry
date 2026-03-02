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
  created_at: string;
  updated_at: string;
}

// ── POST /skills ──────────────────────────────────────────────────────

export async function handleCreateSkill(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
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
  try {
    await env.DB_SKILL.prepare(
      `INSERT INTO skills (
        skill_id, ontology_id, domain, subdomain, language, version,
        r2_key, policy_count, trust_level, trust_score, tags, author,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    )
      .bind(
        skillId,
        ontologyId,
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
        now,
        now,
      )
      .run();
  } catch (e) {
    logger.error("Failed to insert skill catalog record", { skillId, error: String(e) });
    return errFromUnknown(e);
  }

  // Emit skill.packaged event
  const organizationId = request.headers.get("X-Organization-Id") ?? "unknown";
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

// ── GET /skills ───────────────────────────────────────────────────────

export async function handleListSkills(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");
  const status = url.searchParams.get("status");
  const trustLevel = url.searchParams.get("trustLevel");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);
  const offset = Number(url.searchParams.get("offset") ?? "0");

  let query = "SELECT * FROM skills WHERE 1=1";
  const binds: (string | number)[] = [];

  if (domain) {
    query += " AND domain = ?";
    binds.push(domain);
  }
  if (status) {
    query += " AND status = ?";
    binds.push(status);
  }
  if (trustLevel) {
    query += " AND trust_level = ?";
    binds.push(trustLevel);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  binds.push(limit, offset);

  const result = await env.DB_SKILL.prepare(query).bind(...binds).all<SkillRow>();
  const skills = (result.results ?? []).map(rowToSummary);

  return ok({ skills, limit, offset });
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

export function rowToSummary(row: SkillRow): SkillSummary & { status: string } {
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
  };
}

export function rowToDetail(row: SkillRow) {
  return {
    ...rowToSummary(row),
    ontologyId: row.ontology_id,
  };
}
