/**
 * Prototype Routes — Working Prototype 생성/조회/다운로드
 */
import { ok, notFound, badRequest } from "@ai-foundry/utils";
import { GeneratePrototypeRequestSchema } from "@ai-foundry/types";
import type { Env } from "../env.js";
import { generatePrototype } from "../prototype/orchestrator.js";

// ── POST /prototype/generate ────────────────────

export async function handleGeneratePrototype(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const body: unknown = await request.json();
  const parsed = GeneratePrototypeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(`Invalid request: ${parsed.error.message}`);
  }

  const { organizationId, organizationName, options } = parsed.data;
  const orgName = organizationName ?? organizationId;
  const prototypeId = `wp-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  // D1에 레코드 생성 (generating 상태)
  await env.DB_SKILL.prepare(
    `INSERT INTO prototypes (prototype_id, organization_id, version, status, generation_params, started_at, created_at)
     VALUES (?, ?, '1.0.0', 'generating', ?, ?, ?)`,
  ).bind(
    prototypeId,
    organizationId,
    options ? JSON.stringify(options) : null,
    now,
    now,
  ).run();

  // 비동기 생성 시작 (Workers 30초 제한 우회)
  ctx.waitUntil(
    generatePrototype(env, prototypeId, organizationId, orgName, options ?? undefined),
  );

  return new Response(
    JSON.stringify({ success: true, data: { prototypeId, status: "generating", message: "Working Prototype generation started" } }),
    { status: 202, headers: { "Content-Type": "application/json" } },
  );
}

// ── GET /prototype ──────────────────────────────

interface PrototypeRow {
  prototype_id: string;
  organization_id: string;
  version: string;
  status: string;
  r2_key: string | null;
  doc_count: number;
  policy_count: number;
  term_count: number;
  skill_count: number;
  generation_params: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export async function handleListPrototypes(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("org");
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 100);
  const offset = Number(url.searchParams.get("offset") ?? "0");

  let query = "SELECT * FROM prototypes WHERE 1=1";
  const binds: (string | number)[] = [];

  if (orgId) {
    query += " AND organization_id = ?";
    binds.push(orgId);
  }
  if (status) {
    query += " AND status = ?";
    binds.push(status);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  binds.push(limit, offset);

  const result = await env.DB_SKILL.prepare(query).bind(...binds).all<PrototypeRow>();

  // count
  let countQuery = "SELECT COUNT(*) as cnt FROM prototypes WHERE 1=1";
  const countBinds: string[] = [];
  if (orgId) {
    countQuery += " AND organization_id = ?";
    countBinds.push(orgId);
  }
  if (status) {
    countQuery += " AND status = ?";
    countBinds.push(status);
  }
  const countResult = await env.DB_SKILL.prepare(countQuery).bind(...countBinds).first<{ cnt: number }>();

  return ok({
    prototypes: result.results.map(formatRow),
    total: countResult?.cnt ?? 0,
  });
}

// ── GET /prototype/:id ──────────────────────────

export async function handleGetPrototype(
  env: Env,
  prototypeId: string,
): Promise<Response> {
  const row = await env.DB_SKILL.prepare(
    "SELECT * FROM prototypes WHERE prototype_id = ?",
  ).bind(prototypeId).first<PrototypeRow>();

  if (!row) {
    return notFound("Prototype not found");
  }

  return ok(formatRow(row));
}

// ── GET /prototype/:id/download ─────────────────

export async function handleDownloadPrototype(
  env: Env,
  prototypeId: string,
): Promise<Response> {
  const row = await env.DB_SKILL.prepare(
    "SELECT r2_key, status FROM prototypes WHERE prototype_id = ?",
  ).bind(prototypeId).first<{ r2_key: string | null; status: string }>();

  if (!row) {
    return notFound("Prototype not found");
  }
  if (row.status !== "completed" || !row.r2_key) {
    return badRequest(`Prototype is not ready: status=${row.status}`);
  }

  const object = await env.R2_SKILL_PACKAGES.get(row.r2_key);
  if (!object) {
    return notFound("ZIP file not found in R2");
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${prototypeId}.zip"`,
    },
  });
}

// ── 헬퍼 ────────────────────────────────────────

function formatRow(row: PrototypeRow) {
  return {
    prototypeId: row.prototype_id,
    organizationId: row.organization_id,
    version: row.version,
    status: row.status,
    r2Key: row.r2_key,
    docCount: row.doc_count,
    policyCount: row.policy_count,
    termCount: row.term_count,
    skillCount: row.skill_count,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}
