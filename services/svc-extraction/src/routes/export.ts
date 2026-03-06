/**
 * Export API Routes — spec package generation and download.
 *
 * POST /export/spec-package       → Generate spec package (R2 + D1)
 * GET  /export/packages           → List packages for org
 * GET  /export/:packageId         → Package manifest
 * GET  /export/:packageId/api-spec    → Download API Spec JSON
 * GET  /export/:packageId/table-spec  → Download Table Spec JSON
 * GET  /export/:packageId/report      → Download Markdown report
 * GET  /export/:packageId/summary     → Download CSV summary
 *
 * Part of v0.7.4 Phase 2-C.
 */

import { ok, badRequest, notFound } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import type { FactCheckGap } from "@ai-foundry/types";
import { aggregateSourceSpec } from "../factcheck/source-aggregator.js";
import { extractDocSpec } from "../factcheck/doc-spec-extractor.js";
import { structuralMatch } from "../factcheck/matcher.js";
import { generateFactCheckReport } from "../factcheck/report.js";
import { generateApiSpec } from "../export/spec-api.js";
import { generateTableSpec } from "../export/spec-table.js";
import { generateCsvSummary } from "../export/spec-summary.js";
import { classifyAll } from "../export/relevance-scorer.js";
import { assembleAndStore } from "../export/packager.js";

// ── D1 row types ────────────────────────────────────────────────

interface PackageRow {
  package_id: string;
  organization_id: string;
  result_id: string | null;
  r2_prefix: string;
  manifest_json: string;
  status: string;
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

// ── Main route handler ──────────────────────────────────────────

export async function handleExportRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  path: string,
  method: string,
  _url: URL,
): Promise<Response | null> {

  // POST /export/spec-package
  if (method === "POST" && path === "/export/spec-package") {
    return handleCreateSpecPackage(request, env);
  }

  // GET /export/packages
  if (method === "GET" && path === "/export/packages") {
    return handleListPackages(request, env);
  }

  // GET /export/:packageId/api-spec
  const apiSpecMatch = path.match(/^\/export\/([^/]+)\/api-spec$/);
  if (method === "GET" && apiSpecMatch) {
    const packageId = apiSpecMatch[1];
    if (!packageId) return notFound("package");
    return handleDownloadFile(env, packageId, "spec-api.json", "application/json");
  }

  // GET /export/:packageId/table-spec
  const tableSpecMatch = path.match(/^\/export\/([^/]+)\/table-spec$/);
  if (method === "GET" && tableSpecMatch) {
    const packageId = tableSpecMatch[1];
    if (!packageId) return notFound("package");
    return handleDownloadFile(env, packageId, "spec-table.json", "application/json");
  }

  // GET /export/:packageId/report
  const reportMatch = path.match(/^\/export\/([^/]+)\/report$/);
  if (method === "GET" && reportMatch) {
    const packageId = reportMatch[1];
    if (!packageId) return notFound("package");
    return handleDownloadFile(env, packageId, "fact-check-report.md", "text/markdown; charset=utf-8");
  }

  // GET /export/:packageId/summary
  const summaryMatch = path.match(/^\/export\/([^/]+)\/summary$/);
  if (method === "GET" && summaryMatch) {
    const packageId = summaryMatch[1];
    if (!packageId) return notFound("package");
    return handleDownloadFile(env, packageId, "spec-summary.csv", "text/csv; charset=utf-8");
  }

  // GET /export/:packageId — manifest
  const detailMatch = path.match(/^\/export\/([^/]+)$/);
  if (method === "GET" && detailMatch) {
    const packageId = detailMatch[1];
    if (!packageId) return notFound("package");
    return handleGetPackage(env, packageId);
  }

  return null;
}

// ── POST /export/spec-package ───────────────────────────────────

interface CreateBody {
  organizationId: string;
  resultId?: string;
  includeNonCore?: boolean;
}

async function handleCreateSpecPackage(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { organizationId } = body;
  if (!organizationId || typeof organizationId !== "string") {
    return badRequest("organizationId is required");
  }

  // Find result to use
  let resultId = body.resultId;
  let resultRow: ResultRow | null;

  if (resultId) {
    resultRow = await env.DB_EXTRACTION.prepare(
      `SELECT * FROM fact_check_results WHERE result_id = ?`,
    )
      .bind(resultId)
      .first<ResultRow>();

    if (!resultRow) {
      return notFound("result", resultId);
    }
  } else {
    // Use latest completed result for this org
    resultRow = await env.DB_EXTRACTION.prepare(
      `SELECT * FROM fact_check_results
       WHERE organization_id = ? AND status = 'completed'
       ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(organizationId)
      .first<ResultRow>();

    if (resultRow) {
      resultId = resultRow.result_id;
    }
  }

  if (!resultRow) {
    return badRequest("No completed fact check results found. Run /factcheck first.");
  }

  // Fetch gaps
  const { results: gapRows } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM fact_check_gaps WHERE result_id = ?`,
  )
    .bind(resultRow.result_id)
    .all<GapRow>();

  const gaps: FactCheckGap[] = gapRows.map(gapRowToApi);

  // Aggregate source and doc specs
  const sourceSpec = await aggregateSourceSpec(env, organizationId);
  const docSpec = await extractDocSpec(env, organizationId);
  const matchResult = structuralMatch(sourceSpec, docSpec);

  // Classify relevance (with empty transactions/queries for now — no D1 storage for those)
  const relevanceMap = classifyAll(sourceSpec, [], []);

  // Generate API spec entries
  const apiSpecs = generateApiSpec({
    sourceSpec,
    matchResult,
    gaps,
    relevanceMap,
  });

  // Generate table spec entries
  const tableSpecs = generateTableSpec({
    sourceSpec,
    matchResult,
    gaps,
    relevanceMap,
  });

  // Filter out non-core if requested
  const includeNonCore = body.includeNonCore !== false;
  const filteredApiSpecs = includeNonCore
    ? apiSpecs
    : apiSpecs.filter((a) => a.relevance === "core");
  const filteredTableSpecs = includeNonCore
    ? tableSpecs
    : tableSpecs.filter((t) => t.relevance === "core");

  // Generate markdown report
  const reportMarkdown = generateFactCheckReport({
    resultId: resultRow.result_id,
    organizationId,
    totalSourceItems: resultRow.total_source_items,
    totalDocItems: resultRow.total_doc_items,
    matchedItems: resultRow.matched_items,
    gapCount: resultRow.gap_count,
    coveragePct: resultRow.coverage_pct,
    gapsByType: safeParseJsonRecord(resultRow.gaps_by_type),
    gapsBySeverity: safeParseJsonRecord(resultRow.gaps_by_severity),
    gaps,
  });

  // Generate CSV summary
  const csvSummary = generateCsvSummary(filteredApiSpecs, filteredTableSpecs);

  // Assemble and store
  const manifest = await assembleAndStore(
    env,
    organizationId,
    resultId,
    filteredApiSpecs,
    filteredTableSpecs,
    reportMarkdown,
    csvSummary,
  );

  return ok({
    packageId: manifest.packageId,
    r2Prefix: `spec-packages/${organizationId}/${manifest.packageId}`,
    stats: manifest.stats,
    files: manifest.files.map((f) => ({
      name: f.name,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
    })),
  });
}

// ── GET /export/packages ────────────────────────────────────────

async function handleListPackages(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id");
  if (!organizationId) {
    return badRequest("X-Organization-Id header is required");
  }

  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT package_id, organization_id, result_id, r2_prefix, status, created_at
     FROM spec_packages
     WHERE organization_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(organizationId)
    .all<{
      package_id: string;
      organization_id: string;
      result_id: string | null;
      r2_prefix: string;
      status: string;
      created_at: string;
    }>();

  return ok({
    packages: results.map((r) => ({
      packageId: r.package_id,
      organizationId: r.organization_id,
      ...(r.result_id ? { resultId: r.result_id } : {}),
      r2Prefix: r.r2_prefix,
      status: r.status,
      createdAt: r.created_at,
    })),
  });
}

// ── GET /export/:packageId ──────────────────────────────────────

async function handleGetPackage(
  env: Env,
  packageId: string,
): Promise<Response> {
  const row = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM spec_packages WHERE package_id = ?`,
  )
    .bind(packageId)
    .first<PackageRow>();

  if (!row) {
    return notFound("package", packageId);
  }

  // Parse manifest to return structured data
  try {
    const manifest = JSON.parse(row.manifest_json) as Record<string, unknown>;
    return ok(manifest);
  } catch {
    return ok({
      packageId: row.package_id,
      organizationId: row.organization_id,
      r2Prefix: row.r2_prefix,
      status: row.status,
      createdAt: row.created_at,
    });
  }
}

// ── GET /export/:packageId/{file} ───────────────────────────────

async function handleDownloadFile(
  env: Env,
  packageId: string,
  fileName: string,
  contentType: string,
): Promise<Response> {
  // Look up the package to get the R2 prefix
  const row = await env.DB_EXTRACTION.prepare(
    `SELECT r2_prefix FROM spec_packages WHERE package_id = ?`,
  )
    .bind(packageId)
    .first<{ r2_prefix: string }>();

  if (!row) {
    return notFound("package", packageId);
  }

  const r2Key = `${row.r2_prefix}/${fileName}`;
  const object = await env.R2_SPEC_PACKAGES.get(r2Key);

  if (!object) {
    return notFound("file", fileName);
  }

  const body = await object.text();

  const headers: Record<string, string> = {
    "Content-Type": contentType,
  };

  // Add Content-Disposition for downloadable files
  if (fileName.endsWith(".json") || fileName.endsWith(".csv")) {
    headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
  }

  return new Response(body, { status: 200, headers });
}

// ── Helpers ─────────────────────────────────────────────────────

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

function safeParseJsonRecord(val: string | null): Record<string, number> {
  if (!val) return {};
  try {
    return JSON.parse(val) as Record<string, number>;
  } catch {
    return {};
  }
}
