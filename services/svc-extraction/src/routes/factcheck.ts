/**
 * Fact Check API Routes — svc-extraction (SVC-02) extension.
 *
 * POST /factcheck                          → Trigger fact check
 * GET  /factcheck/results                  → List results for org
 * GET  /factcheck/results/:resultId        → Single result detail
 * GET  /factcheck/results/:resultId/gaps   → Gaps with filters
 * GET  /factcheck/results/:resultId/report → Markdown report
 * POST /factcheck/gaps/:gapId/review       → Review a gap
 * POST /factcheck/results/:resultId/llm-match → LLM matching (placeholder)
 * GET  /factcheck/summary                  → Org-level coverage KPI
 *
 * Part of v0.7.4 Pivot Phase 2-B Session 3.
 */

import { ok, badRequest, notFound } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { generateFactCheckReport } from "../factcheck/report.js";
import { llmSemanticMatch } from "../factcheck/llm-matcher.js";
import { aggregateSourceSpec } from "../factcheck/source-aggregator.js";
import { extractDocSpec } from "../factcheck/doc-spec-extractor.js";
import { structuralMatch } from "../factcheck/matcher.js";
import type { MatchResult } from "../factcheck/matcher.js";
import type { SourceApi, SourceTable } from "../factcheck/types.js";
import type { FactCheckGap } from "@ai-foundry/types";

// ── D1 row types ──────────────────────────────────────────────────

interface ResultRow {
  result_id: string;
  organization_id: string;
  spec_type: string;
  source_document_ids: string | null;
  doc_document_ids: string | null;
  total_source_items: number;
  total_doc_items: number;
  matched_items: number;
  gap_count: number;
  coverage_pct: number;
  gaps_by_type: string | null;
  gaps_by_severity: string | null;
  status: string;
  match_result_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
}

interface GapRow {
  gap_id: string;
  result_id: string;
  organization_id: string;
  gap_type: string;
  severity: string;
  source_item: string;
  source_document_id: string | null;
  document_item: string | null;
  document_id: string | null;
  description: string;
  evidence: string | null;
  auto_resolved: number;
  review_status: string;
  reviewer_id: string | null;
  reviewer_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// ── Row → API object converters ───────────────────────────────────

function resultRowToApi(row: ResultRow) {
  return {
    resultId: row.result_id,
    organizationId: row.organization_id,
    specType: row.spec_type,
    sourceDocumentIds: safeParseJsonArray(row.source_document_ids),
    docDocumentIds: safeParseJsonArray(row.doc_document_ids),
    totalSourceItems: row.total_source_items,
    totalDocItems: row.total_doc_items,
    matchedItems: row.matched_items,
    gapCount: row.gap_count,
    coveragePct: row.coverage_pct,
    gapsByType: safeParseJsonRecord(row.gaps_by_type),
    gapsBySeverity: safeParseJsonRecord(row.gaps_by_severity),
    status: row.status,
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    createdAt: row.created_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

function gapRowToApi(row: GapRow): FactCheckGap {
  return {
    gapId: row.gap_id,
    resultId: row.result_id,
    organizationId: row.organization_id,
    gapType: row.gap_type as FactCheckGap["gapType"],
    severity: row.severity as FactCheckGap["severity"],
    sourceItem: row.source_item,
    ...(row.source_document_id ? { sourceDocumentId: row.source_document_id } : {}),
    ...(row.document_item ? { documentItem: row.document_item } : {}),
    ...(row.document_id ? { documentId: row.document_id } : {}),
    description: row.description,
    ...(row.evidence ? { evidence: row.evidence } : {}),
    autoResolved: row.auto_resolved === 1,
    reviewStatus: row.review_status as FactCheckGap["reviewStatus"],
    ...(row.reviewer_id ? { reviewerId: row.reviewer_id } : {}),
    ...(row.reviewer_comment ? { reviewerComment: row.reviewer_comment } : {}),
    ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
    createdAt: row.created_at,
  };
}

// ── JSON helpers ──────────────────────────────────────────────────

function safeParseJsonArray(val: string | null): string[] {
  if (!val) return [];
  try {
    return JSON.parse(val) as string[];
  } catch {
    return [];
  }
}

function safeParseJsonRecord(val: string | null): Record<string, number> {
  if (!val) return {};
  try {
    return JSON.parse(val) as Record<string, number>;
  } catch {
    return {};
  }
}

// ── Main route handler ────────────────────────────────────────────

export async function handleFactcheckRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  path: string,
  method: string,
  url: URL,
): Promise<Response | null> {

  // POST /factcheck — trigger fact check
  if (method === "POST" && path === "/factcheck") {
    return handleTriggerFactCheck(request, env);
  }

  // GET /factcheck/kpi — automated KPI metrics (PRD SS8.2)
  if (method === "GET" && path === "/factcheck/kpi") {
    return handleGetKpi(request, env);
  }

  // GET /factcheck/summary — org-level KPI
  if (method === "GET" && path === "/factcheck/summary") {
    return handleGetSummary(request, env);
  }

  // GET /factcheck/results — list results
  if (method === "GET" && path === "/factcheck/results") {
    return handleListResults(request, env);
  }

  // GET /factcheck/results/:resultId/gaps
  const gapsMatch = path.match(/^\/factcheck\/results\/([^/]+)\/gaps$/);
  if (method === "GET" && gapsMatch) {
    const resultId = gapsMatch[1];
    if (!resultId) return notFound("result");
    return handleGetGaps(env, resultId, url);
  }

  // GET /factcheck/results/:resultId/report
  const reportMatch = path.match(/^\/factcheck\/results\/([^/]+)\/report$/);
  if (method === "GET" && reportMatch) {
    const resultId = reportMatch[1];
    if (!resultId) return notFound("result");
    return handleGetReport(env, resultId);
  }

  // POST /factcheck/results/:resultId/llm-match
  const llmMatch = path.match(/^\/factcheck\/results\/([^/]+)\/llm-match$/);
  if (method === "POST" && llmMatch) {
    const resultId = llmMatch[1];
    if (!resultId) return notFound("result");
    return handleLlmMatch(env, resultId, request);
  }

  // GET /factcheck/results/:resultId — single result
  const resultDetailMatch = path.match(/^\/factcheck\/results\/([^/]+)$/);
  if (method === "GET" && resultDetailMatch) {
    const resultId = resultDetailMatch[1];
    if (!resultId) return notFound("result");
    return handleGetResult(env, resultId);
  }

  // POST /factcheck/gaps/:gapId/review
  const reviewMatch = path.match(/^\/factcheck\/gaps\/([^/]+)\/review$/);
  if (method === "POST" && reviewMatch) {
    const gapId = reviewMatch[1];
    if (!gapId) return notFound("gap");
    return handleReviewGap(request, env, gapId);
  }

  // No matching factcheck route
  return null;
}

// ── POST /factcheck ───────────────────────────────────────────────

interface TriggerBody {
  organizationId: string;
  specType?: "api" | "table" | "mixed";
}

async function handleTriggerFactCheck(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: TriggerBody;
  try {
    body = (await request.json()) as TriggerBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { organizationId } = body;
  if (!organizationId || typeof organizationId !== "string") {
    return badRequest("organizationId is required");
  }

  const specType = body.specType ?? "mixed";
  if (!["api", "table", "mixed"].includes(specType)) {
    return badRequest("specType must be api | table | mixed");
  }

  const resultId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Create result record in D1
  await env.DB_EXTRACTION.prepare(
    `INSERT INTO fact_check_results
     (result_id, organization_id, spec_type, source_document_ids, doc_document_ids,
      total_source_items, total_doc_items, matched_items, gap_count, coverage_pct,
      status, created_at, updated_at)
     VALUES (?, ?, ?, '[]', '[]', 0, 0, 0, 0, 0, 'processing', ?, ?)`,
  )
    .bind(resultId, organizationId, specType, now, now)
    .run();

  // Queue factcheck.requested event
  await env.QUEUE_PIPELINE.send({
    eventId: crypto.randomUUID(),
    occurredAt: now,
    type: "factcheck.requested",
    payload: {
      resultId,
      organizationId,
      specType,
    },
  });

  return ok({ resultId, status: "processing" });
}

// ── GET /factcheck/results ────────────────────────────────────────

async function handleListResults(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id");
  if (!organizationId) {
    return badRequest("X-Organization-Id header is required");
  }

  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_results
     WHERE organization_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(organizationId)
    .all<ResultRow>();

  return ok({ results: results.map(resultRowToApi) });
}

// ── GET /factcheck/results/:resultId ──────────────────────────────

async function handleGetResult(
  env: Env,
  resultId: string,
): Promise<Response> {
  const row = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_results WHERE result_id = ?`,
  )
    .bind(resultId)
    .first<ResultRow>();

  if (!row) {
    return notFound("result", resultId);
  }

  return ok(resultRowToApi(row));
}

// ── GET /factcheck/results/:resultId/gaps ─────────────────────────

async function handleGetGaps(
  env: Env,
  resultId: string,
  url: URL,
): Promise<Response> {
  // Verify result exists
  const resultRow = await env.DB_EXTRACTION.prepare(
    `SELECT result_id FROM fact_check_results WHERE result_id = ?`,
  )
    .bind(resultId)
    .first<{ result_id: string }>();

  if (!resultRow) {
    return notFound("result", resultId);
  }

  // Build filtered query
  const conditions: string[] = ["result_id = ?"];
  const bindings: (string | number)[] = [resultId];

  const typeFilter = url.searchParams.get("type");
  if (typeFilter) {
    conditions.push("gap_type = ?");
    bindings.push(typeFilter);
  }

  const severityFilter = url.searchParams.get("severity");
  if (severityFilter) {
    conditions.push("severity = ?");
    bindings.push(severityFilter);
  }

  const reviewStatusFilter = url.searchParams.get("reviewStatus");
  if (reviewStatusFilter) {
    conditions.push("review_status = ?");
    bindings.push(reviewStatusFilter);
  }

  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Number(url.searchParams.get("offset")) || 0;

  const whereClause = conditions.join(" AND ");

  // Count query
  const countRow = await env.DB_EXTRACTION.prepare(
    `SELECT COUNT(*) AS total FROM fact_check_gaps WHERE ${whereClause}`,
  )
    .bind(...bindings)
    .first<{ total: number }>();

  const total = countRow?.total ?? 0;

  // Data query
  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_gaps
     WHERE ${whereClause}
     ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
              created_at ASC
     LIMIT ? OFFSET ?`,
  )
    .bind(...bindings, limit, offset)
    .all<GapRow>();

  return ok({
    gaps: results.map(gapRowToApi),
    total,
    limit,
    offset,
  });
}

// ── GET /factcheck/results/:resultId/report ───────────────────────

async function handleGetReport(
  env: Env,
  resultId: string,
): Promise<Response> {
  // Fetch result
  const resultRow = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_results WHERE result_id = ?`,
  )
    .bind(resultId)
    .first<ResultRow>();

  if (!resultRow) {
    return notFound("result", resultId);
  }

  // Fetch all gaps for this result
  const { results: gapRows } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_gaps WHERE result_id = ?
     ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
              created_at ASC`,
  )
    .bind(resultId)
    .all<GapRow>();

  const gaps: FactCheckGap[] = gapRows.map(gapRowToApi);

  const markdown = generateFactCheckReport({
    resultId,
    organizationId: resultRow.organization_id,
    totalSourceItems: resultRow.total_source_items,
    totalDocItems: resultRow.total_doc_items,
    matchedItems: resultRow.matched_items,
    gapCount: resultRow.gap_count,
    coveragePct: resultRow.coverage_pct,
    gapsByType: safeParseJsonRecord(resultRow.gaps_by_type),
    gapsBySeverity: safeParseJsonRecord(resultRow.gaps_by_severity),
    gaps,
  });

  return new Response(markdown, {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

// ── POST /factcheck/gaps/:gapId/review ────────────────────────────

interface ReviewBody {
  reviewStatus: "confirmed" | "dismissed" | "modified";
  reviewerId: string;
  comment?: string;
}

async function handleReviewGap(
  request: Request,
  env: Env,
  gapId: string,
): Promise<Response> {
  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { reviewStatus, reviewerId, comment } = body;

  if (!reviewStatus || !["confirmed", "dismissed", "modified"].includes(reviewStatus)) {
    return badRequest("reviewStatus must be confirmed | dismissed | modified");
  }
  if (!reviewerId || typeof reviewerId !== "string") {
    return badRequest("reviewerId is required");
  }

  const reviewedAt = new Date().toISOString();

  const result = await env.DB_EXTRACTION.prepare(
    `UPDATE fact_check_gaps
     SET review_status = ?, reviewer_id = ?, reviewer_comment = ?, reviewed_at = ?
     WHERE gap_id = ?`,
  )
    .bind(reviewStatus, reviewerId, comment ?? null, reviewedAt, gapId)
    .run();

  if (result.meta.rows_written === 0) {
    return notFound("gap", gapId);
  }

  return ok({ gapId, reviewStatus, reviewedAt });
}

// ── POST /factcheck/results/:resultId/llm-match ──────────────────

interface LlmMatchBody {
  batchSize?: number;
  offset?: number;
}

async function handleLlmMatch(
  env: Env,
  resultId: string,
  request: Request,
): Promise<Response> {
  // Parse optional batch params from body
  let batchSize = 10;
  let offset = 0;
  try {
    const body = (await request.json()) as LlmMatchBody;
    if (body.batchSize && body.batchSize > 0) batchSize = Math.min(body.batchSize, 50);
    if (body.offset && body.offset >= 0) offset = body.offset;
  } catch {
    // Empty body is fine — use defaults
  }

  // Verify result exists and is completed
  const resultRow = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_results WHERE result_id = ?`,
  )
    .bind(resultId)
    .first<ResultRow>();

  if (!resultRow) {
    return notFound("result", resultId);
  }

  if (resultRow.status !== "completed") {
    return badRequest("Fact check must be completed before running LLM matching");
  }

  const organizationId = resultRow.organization_id;

  // Re-aggregate source and doc specs
  const sourceSpec = await aggregateSourceSpec(env, organizationId);
  const docSpec = await extractDocSpec(env, organizationId);

  // Re-run structural matching to get unmatched items
  const matchResult = structuralMatch(sourceSpec, docSpec);

  // Collect all unmatched items into a flat list for pagination
  const allUnmatched: Array<{ type: "api" | "table"; item: unknown }> = [
    ...matchResult.unmatchedSourceApis.map((a) => ({ type: "api" as const, item: a })),
    ...matchResult.unmatchedSourceTables.map((t) => ({ type: "table" as const, item: t })),
  ];

  const total = allUnmatched.length;
  const batch = allUnmatched.slice(offset, offset + batchSize);

  if (batch.length === 0) {
    return ok({
      resultId,
      llmMatching: { processed: 0, newMatches: 0, confirmedGaps: 0, errors: 0 },
      pagination: { offset, batchSize, total, hasMore: false },
      newMatches: [],
      confirmedGaps: [],
    });
  }

  // Build sliced MatchResult for batch processing
  const batchMatchResult: MatchResult = {
    matchedItems: [],
    unmatchedSourceApis: batch
      .filter((b) => b.type === "api")
      .map((b) => b.item as SourceApi),
    unmatchedDocApis: [],
    unmatchedSourceTables: batch
      .filter((b) => b.type === "table")
      .map((b) => b.item as SourceTable),
    unmatchedDocTables: [],
  };

  // Run LLM semantic matching on this batch
  const llmResult = await llmSemanticMatch(
    batchMatchResult,
    docSpec,
    env.LLM_ROUTER,
    env.INTERNAL_API_SECRET,
  );

  const now = new Date().toISOString();

  // Mark resolved gaps as auto_resolved in D1
  if (llmResult.newMatches.length > 0) {
    for (const match of llmResult.newMatches) {
      const docName = match.docRef?.name ?? "unknown";
      await env.DB_EXTRACTION.prepare(
        `UPDATE fact_check_gaps
         SET auto_resolved = 1, review_status = 'dismissed',
             reviewer_comment = ?, reviewed_at = ?
         WHERE result_id = ? AND source_item = ? AND gap_type = 'MID'
           AND auto_resolved = 0`,
      )
        .bind(
          `LLM match: ${docName} (score: ${match.matchScore})`,
          now,
          resultId,
          match.sourceRef.name,
        )
        .run();
    }

    // Recalculate totals from D1
    const statsRow = await env.DB_EXTRACTION.prepare(
      `SELECT
         COUNT(*) AS gap_count,
         SUM(CASE WHEN auto_resolved = 0 THEN 1 ELSE 0 END) AS active_gaps
       FROM fact_check_gaps WHERE result_id = ?`,
    )
      .bind(resultId)
      .first<{ gap_count: number; active_gaps: number }>();

    const newMatchedCount = resultRow.matched_items + llmResult.newMatches.length;
    const totalSourceItems = resultRow.total_source_items;
    const newCoverage = totalSourceItems > 0
      ? (newMatchedCount / totalSourceItems) * 100
      : 0;

    await env.DB_EXTRACTION.prepare(
      `UPDATE fact_check_results
       SET matched_items = ?, coverage_pct = ?, gap_count = ?,
           updated_at = ?
       WHERE result_id = ?`,
    )
      .bind(
        newMatchedCount,
        Math.round(newCoverage * 10) / 10,
        statsRow?.active_gaps ?? resultRow.gap_count,
        now,
        resultId,
      )
      .run();
  }

  const hasMore = offset + batchSize < total;

  return ok({
    resultId,
    llmMatching: {
      processed: llmResult.stats.processed,
      newMatches: llmResult.stats.matched,
      confirmedGaps: llmResult.stats.confirmed,
      errors: llmResult.stats.errors,
    },
    pagination: { offset, batchSize, total, hasMore },
    newMatches: llmResult.newMatches,
    confirmedGaps: llmResult.confirmedGaps,
  });
}

// ── GET /factcheck/kpi ────────────────────────────────────────────

async function handleGetKpi(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id");
  if (!organizationId) {
    return badRequest("X-Organization-Id header is required");
  }

  // Get the latest completed result for KPI calculation
  const resultRow = await env.DB_EXTRACTION.prepare(
    `SELECT result_id, total_source_items, total_doc_items, matched_items, gap_count, coverage_pct, spec_type
     FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(organizationId)
    .first<{
      result_id: string;
      total_source_items: number;
      total_doc_items: number;
      matched_items: number;
      gap_count: number;
      coverage_pct: number;
      spec_type: string;
    }>();

  // Default empty KPI
  if (!resultRow) {
    return ok({
      organizationId,
      criticalApiCoverage: {
        value: 0,
        target: 80,
        pass: false,
        detail: { sourceApis: 0, documentApis: 0, matchedApis: 0 },
      },
      criticalTableCoverage: {
        value: 0,
        target: 80,
        pass: false,
        detail: { sourceTables: 0, documentTables: 0, matchedTables: 0 },
      },
      gapPrecision: {
        value: 0,
        target: 75,
        pass: false,
        detail: { totalGaps: 0, confirmedGaps: 0, dismissedGaps: 0, pendingGaps: 0 },
      },
      reviewerAcceptanceRate: {
        value: null,
        target: 70,
        note: "Requires Phase 2-D UI tracking",
      },
      specEditTimeReduction: {
        value: null,
        target: 30,
        note: "Requires Phase 2-D UI tracking",
      },
      computedAt: new Date().toISOString(),
    });
  }

  // KPI-1 & KPI-2: Coverage from matched_items / total_source_items
  // For mixed results, we use total numbers; for specific types, use those
  const apiCoverage = resultRow.total_source_items > 0
    ? Math.round((resultRow.matched_items / resultRow.total_source_items) * 1000) / 10
    : 0;
  const tableCoverage = apiCoverage; // Same data for mixed; per-type breakdown needs separate queries

  // KPI-3: Gap Precision — confirmed / (confirmed + dismissed)
  const gapStatsRow = await env.DB_EXTRACTION.prepare(
    `SELECT
       COUNT(*) AS total_gaps,
       SUM(CASE WHEN review_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
       SUM(CASE WHEN review_status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed,
       SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) AS pending
     FROM fact_check_gaps
     WHERE result_id = ?`,
  )
    .bind(resultRow.result_id)
    .first<{
      total_gaps: number;
      confirmed: number;
      dismissed: number;
      pending: number;
    }>();

  const confirmed = gapStatsRow?.confirmed ?? 0;
  const dismissed = gapStatsRow?.dismissed ?? 0;
  const pending = gapStatsRow?.pending ?? 0;
  const totalGaps = gapStatsRow?.total_gaps ?? 0;

  const reviewedTotal = confirmed + dismissed;
  const gapPrecision = reviewedTotal > 0
    ? Math.round((confirmed / reviewedTotal) * 1000) / 10
    : 0;

  return ok({
    organizationId,
    criticalApiCoverage: {
      value: apiCoverage,
      target: 80,
      pass: apiCoverage >= 80,
      detail: {
        sourceApis: resultRow.total_source_items,
        documentApis: resultRow.total_doc_items,
        matchedApis: resultRow.matched_items,
      },
    },
    criticalTableCoverage: {
      value: tableCoverage,
      target: 80,
      pass: tableCoverage >= 80,
      detail: {
        sourceTables: resultRow.total_source_items,
        documentTables: resultRow.total_doc_items,
        matchedTables: resultRow.matched_items,
      },
    },
    gapPrecision: {
      value: gapPrecision,
      target: 75,
      pass: gapPrecision >= 75,
      detail: {
        totalGaps,
        confirmedGaps: confirmed,
        dismissedGaps: dismissed,
        pendingGaps: pending,
      },
    },
    reviewerAcceptanceRate: {
      value: null,
      target: 70,
      note: "Requires Phase 2-D UI tracking",
    },
    specEditTimeReduction: {
      value: null,
      target: 30,
      note: "Requires Phase 2-D UI tracking",
    },
    computedAt: new Date().toISOString(),
  });
}

// ── GET /factcheck/summary ────────────────────────────────────────

async function handleGetSummary(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id");
  if (!organizationId) {
    return badRequest("X-Organization-Id header is required");
  }

  const aggRow = await env.DB_EXTRACTION.prepare(
    `SELECT COUNT(*) AS result_count,
            COALESCE(SUM(total_source_items), 0) AS total_source,
            COALESCE(SUM(total_doc_items), 0) AS total_doc,
            COALESCE(SUM(matched_items), 0) AS total_matched,
            COALESCE(SUM(gap_count), 0) AS total_gaps,
            MAX(created_at) AS last_check_at
     FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'`,
  )
    .bind(organizationId)
    .first<{
      result_count: number;
      total_source: number;
      total_doc: number;
      total_matched: number;
      total_gaps: number;
      last_check_at: string | null;
    }>();

  if (!aggRow || aggRow.result_count === 0) {
    return ok({
      organizationId,
      resultCount: 0,
      totalSourceItems: 0,
      totalDocItems: 0,
      totalMatchedItems: 0,
      totalGaps: 0,
      overallCoveragePct: 0,
      lastCheckAt: null,
    });
  }

  const totalItems = aggRow.total_source + aggRow.total_doc;
  const overallCoverage = totalItems > 0
    ? (aggRow.total_matched * 2 / totalItems) * 100
    : 0;

  return ok({
    organizationId,
    resultCount: aggRow.result_count,
    totalSourceItems: aggRow.total_source,
    totalDocItems: aggRow.total_doc,
    totalMatchedItems: aggRow.total_matched,
    totalGaps: aggRow.total_gaps,
    overallCoveragePct: Math.round(overallCoverage * 10) / 10,
    lastCheckAt: aggRow.last_check_at ?? null,
  });
}
