/**
 * 조직 간 비교 API 라우트 — svc-extraction (SVC-02) 확장
 *
 * POST /analysis/compare                             → CrossOrgComparison 생성
 * GET  /analysis/:organizationId/service-groups      → 서비스 그룹별 조회
 * GET  /analysis/compare/:comparisonId/standardization → 표준화 후보 목록
 */

import { ok, notFound, badRequest } from "@ai-foundry/utils";
import {
  type ComparisonItem,
} from "@ai-foundry/types";
import {
  buildComparisonPrompt,
  parseComparisonResult,
  buildCrossOrgComparison,
  type OrgAnalysisResult,
} from "../prompts/comparison.js";
import { callLlm } from "../llm/caller.js";
import type { Env } from "../env.js";

// ── D1 행 타입 ─────────────────────────────────────────────────────────

interface ComparisonRow {
  comparison_id: string;
  organization_ids: string;
  domain: string;
  common_standard_count: number;
  org_specific_count: number;
  tacit_knowledge_count: number;
  core_differentiator_count: number;
  result_json: string;
  created_at: string;
}

interface ComparisonItemRow {
  item_id: string;
  comparison_id: string;
  name: string;
  type: string;
  service_group: string;
  present_in_orgs: string;
  classification_reason: string;
  standardization_score: number | null;
  standardization_note: string | null;
  tacit_knowledge_evidence: string | null;
  created_at: string;
}

interface AnalysisSummaryRow {
  organization_id: string;
  summary_json: string;
  core_identification_json: string;
  process_count: number;
}

// ── 라우트 핸들러 ──────────────────────────────────────────────────────

export async function handleCompareRoutes(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // POST /analysis/compare — 조직 비교 실행
  if (method === "POST" && path === "/analysis/compare") {
    return handleCompare(request, env, ctx);
  }

  // GET /analysis/compare/:comparisonId/standardization
  const standardizationMatch = path.match(/^\/analysis\/compare\/([^/]+)\/standardization$/);
  if (method === "GET" && standardizationMatch) {
    const comparisonId = standardizationMatch[1];
    if (!comparisonId) return notFound("route");
    return handleGetStandardization(env, comparisonId);
  }

  // GET /analysis/:organizationId/service-groups
  const serviceGroupsMatch = path.match(/^\/analysis\/([^/]+)\/service-groups$/);
  if (method === "GET" && serviceGroupsMatch) {
    const organizationId = serviceGroupsMatch[1];
    if (!organizationId) return notFound("route");
    return handleGetServiceGroups(env, organizationId);
  }

  return notFound("route");
}

// ── POST /analysis/compare ────────────────────────────────────────────

interface CompareBody {
  organizationIds: string[];
  domain: string;
}

async function handleCompare(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  let body: CompareBody;
  try {
    body = (await request.json()) as CompareBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { organizationIds, domain = "퇴직연금" } = body;

  if (!Array.isArray(organizationIds) || organizationIds.length < 2) {
    return badRequest("organizationIds must be an array of at least 2 organization IDs");
  }

  const orgAId = organizationIds[0];
  const orgBId = organizationIds[1];
  if (!orgAId || !orgBId) {
    return badRequest("organizationIds must contain valid organization IDs");
  }

  // 각 조직의 최신 분석 결과 조회
  const orgARow = await env.DB_EXTRACTION.prepare(
    `SELECT organization_id, summary_json, core_identification_json, process_count
     FROM analyses WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(orgAId)
    .first<AnalysisSummaryRow>();

  const orgBRow = await env.DB_EXTRACTION.prepare(
    `SELECT organization_id, summary_json, core_identification_json, process_count
     FROM analyses WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(orgBId)
    .first<AnalysisSummaryRow>();

  if (!orgARow) {
    return badRequest(`Organization ${orgAId} has no completed analysis`);
  }
  if (!orgBRow) {
    return badRequest(`Organization ${orgBId} has no completed analysis`);
  }

  // OrgAnalysisResult 구성
  const orgASummary = JSON.parse(orgARow.summary_json) as { processes: Array<{ name: string; category: string; isCore: boolean; importanceScore: number; importanceReason: string }> };
  const orgBSummary = JSON.parse(orgBRow.summary_json) as { processes: Array<{ name: string; category: string; isCore: boolean; importanceScore: number; importanceReason: string }> };
  const orgACore = JSON.parse(orgARow.core_identification_json) as { coreProcesses: Array<{ processName: string; isCore: boolean; score: number; reasoning: string }> };
  const orgBCore = JSON.parse(orgBRow.core_identification_json) as { coreProcesses: Array<{ processName: string; isCore: boolean; score: number; reasoning: string }> };

  const orgAResult: OrgAnalysisResult = {
    organizationId: orgAId,
    organizationName: orgAId,
    documentIds: [],
    scoredProcesses: orgASummary.processes ?? [],
    coreJudgments: orgACore.coreProcesses ?? [],
    findings: [],
  };

  const orgBResult: OrgAnalysisResult = {
    organizationId: orgBId,
    organizationName: orgBId,
    documentIds: [],
    scoredProcesses: orgBSummary.processes ?? [],
    coreJudgments: orgBCore.coreProcesses ?? [],
    findings: [],
  };

  // Pass 3: 조직 간 비교 LLM 호출
  const comparisonPrompt = buildComparisonPrompt(orgAResult, orgBResult);
  let llmOutput;
  try {
    const rawComparison = await callLlm(comparisonPrompt, "sonnet", env.LLM_ROUTER, env.INTERNAL_API_SECRET);
    llmOutput = parseComparisonResult(rawComparison);
  } catch {
    llmOutput = { items: [], standardizationCandidates: [] };
  }

  const comparisonId = crypto.randomUUID();
  const comparison = buildCrossOrgComparison(comparisonId, orgAResult, orgBResult, llmOutput);

  const now = new Date().toISOString();

  // D1 comparisons 저장
  await env.DB_EXTRACTION.prepare(
    `INSERT INTO comparisons
     (comparison_id, organization_ids, domain,
      common_standard_count, org_specific_count, tacit_knowledge_count, core_differentiator_count,
      result_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      comparisonId,
      JSON.stringify(organizationIds),
      domain,
      comparison.groupSummary.commonStandard,
      comparison.groupSummary.orgSpecific,
      comparison.groupSummary.tacitKnowledge,
      comparison.groupSummary.coreDifferentiator,
      JSON.stringify(comparison),
      now
    )
    .run();

  // D1 comparison_items 저장
  for (const item of comparison.items) {
    const itemId = crypto.randomUUID();
    await env.DB_EXTRACTION.prepare(
      `INSERT INTO comparison_items
       (item_id, comparison_id, name, type, service_group, present_in_orgs,
        classification_reason, standardization_score, standardization_note,
        tacit_knowledge_evidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        itemId,
        comparisonId,
        item.name,
        item.type,
        item.serviceGroup,
        JSON.stringify(item.presentIn.map((p) => p.organizationId)),
        item.classificationReason,
        item.standardizationScore ?? null,
        item.standardizationNote ?? null,
        item.tacitKnowledgeEvidence ?? null,
        now
      )
      .run();
  }

  return ok(comparison);
}

// ── GET /analysis/:organizationId/service-groups ──────────────────────

async function handleGetServiceGroups(env: Env, organizationId: string): Promise<Response> {
  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT ci.*
     FROM comparison_items ci
     JOIN comparisons c ON ci.comparison_id = c.comparison_id
     WHERE c.organization_ids LIKE ?
     ORDER BY ci.service_group ASC, ci.created_at DESC`
  )
    .bind(`%${organizationId}%`)
    .all<ComparisonItemRow>();

  const items: ComparisonItem[] = results.map((row) => ({
    name: row.name,
    type: row.type as ComparisonItem["type"],
    serviceGroup: row.service_group as ComparisonItem["serviceGroup"],
    presentIn: JSON.parse(row.present_in_orgs) as ComparisonItem["presentIn"],
    classificationReason: row.classification_reason,
    ...(row.standardization_score !== null ? { standardizationScore: row.standardization_score } : {}),
    ...(row.standardization_note ? { standardizationNote: row.standardization_note } : {}),
    ...(row.tacit_knowledge_evidence ? { tacitKnowledgeEvidence: row.tacit_knowledge_evidence } : {}),
  }));

  const groupSummary = {
    commonStandard: items.filter((i) => i.serviceGroup === "common_standard").length,
    orgSpecific: items.filter((i) => i.serviceGroup === "org_specific").length,
    tacitKnowledge: items.filter((i) => i.serviceGroup === "tacit_knowledge").length,
    coreDifferentiator: items.filter((i) => i.serviceGroup === "core_differentiator").length,
  };

  return ok({ groups: items, groupSummary });
}

// ── GET /analysis/compare/:comparisonId/standardization ──────────────

async function handleGetStandardization(env: Env, comparisonId: string): Promise<Response> {
  const row = await env.DB_EXTRACTION.prepare(
    `SELECT result_json FROM comparisons WHERE comparison_id = ?`
  )
    .bind(comparisonId)
    .first<ComparisonRow>();

  if (!row) return notFound("comparison", comparisonId);

  const comparison = JSON.parse(row.result_json) as { standardizationCandidates: Array<{ name: string; score: number; orgsInvolved: string[]; note: string }> };
  const candidates = [...(comparison.standardizationCandidates ?? [])].sort((a, b) => b.score - a.score);

  return ok({ candidates });
}
