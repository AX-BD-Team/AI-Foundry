/**
 * Gap Analysis Routes — svc-extraction (SVC-02)
 *
 * GET /gap-analysis/overview  → 4-perspective As-Is/To-Be gap summary
 *
 * Aggregates existing data from:
 * - fact_check_results/gaps → API + Table perspectives
 * - analyses (summary_json) + aggregateSourceSpec() → Process + Architecture perspectives
 * - diagnosis_findings → cross-cutting findings
 *
 * Part of AIF-REQ-010.
 */

import { ok, badRequest } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { aggregateSourceSpec } from "../factcheck/source-aggregator.js";
import type { SourceSpec } from "../factcheck/types.js";
import { buildTermMappings, findBestTermMatch } from "../factcheck/term-matcher.js";
import type { TermMapping } from "../factcheck/term-matcher.js";

// ── Cache ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getCachedOverview(env: Env, orgId: string): Promise<GapOverview | null> {
  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT snapshot_json, expires_at FROM gap_analysis_snapshots
     WHERE organization_id = ? AND perspective_type = 'all'
     LIMIT 1`,
  )
    .bind(orgId)
    .all<{ snapshot_json: string; expires_at: string }>();

  const row = results[0];
  if (!row) return null;

  // Check TTL
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  const parsed = safeParseJson(row.snapshot_json);
  if (!parsed || !isRecord(parsed)) return null;
  return parsed as unknown as GapOverview;
}

async function cacheOverview(env: Env, orgId: string, overview: GapOverview): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
  await env.DB_EXTRACTION.prepare(
    `INSERT OR REPLACE INTO gap_analysis_snapshots
       (snapshot_id, organization_id, perspective_type, snapshot_json, source_stats_json, findings_json, created_at, expires_at)
     VALUES (?, ?, 'all', ?, ?, ?, datetime('now'), ?)`,
  )
    .bind(
      `gap-${orgId}-all`,
      orgId,
      JSON.stringify(overview),
      JSON.stringify(overview.sourceStats),
      JSON.stringify(overview.findings),
      expiresAt,
    )
    .run();
}

async function handleCacheInvalidation(request: Request, env: Env): Promise<Response> {
  const orgId = request.headers.get("X-Organization-Id");
  if (!orgId) return badRequest("X-Organization-Id header required");

  await env.DB_EXTRACTION.prepare(
    `DELETE FROM gap_analysis_snapshots WHERE organization_id = ?`,
  )
    .bind(orgId)
    .run();

  return ok({ deleted: true, organizationId: orgId });
}

// ── Types ─────────────────────────────────────────────────────────

interface PerspectiveSummary {
  asIsCount: number;
  toBeCount: number;
  matchedCount: number;
  gapCount: number;
  coveragePct: number;
  items: PerspectiveItem[];
}

interface PerspectiveItem {
  name: string;
  source: "document" | "code" | "both";
  status: "matched" | "gap-in-doc" | "gap-in-code" | "mismatch";
  severity: "HIGH" | "MEDIUM" | "LOW";
  detail?: string;
  documentId?: string;
}

interface GapOverview {
  organizationId: string;
  perspectives: {
    process: PerspectiveSummary;
    architecture: PerspectiveSummary;
    api: PerspectiveSummary;
    table: PerspectiveSummary;
  };
  findings: FindingSummary;
  sourceStats: SourceStats;
  generatedAt: string;
}

interface SourceStats {
  controllerCount: number;
  endpointCount: number;
  tableCount: number;
  mapperCount: number;
  transactionCount: number;
}

interface FindingSummary {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  topFindings: Array<{
    findingId: string;
    type: string;
    severity: string;
    finding: string;
    recommendation: string;
  }>;
}

// ── Router ────────────────────────────────────────────────────────

export async function handleGapAnalysisRoutes(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  path: string,
  method: string,
): Promise<Response | null> {
  if (method === "GET" && path === "/gap-analysis/overview") {
    return handleOverview(request, env, ctx);
  }
  if (method === "DELETE" && path === "/gap-analysis/cache") {
    return handleCacheInvalidation(request, env);
  }
  return null;
}

// ── GET /gap-analysis/overview ────────────────────────────────────

async function handleOverview(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const orgId = request.headers.get("X-Organization-Id");
  if (!orgId) return badRequest("X-Organization-Id header required");

  // Cache check (skip with ?refresh=true)
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "true";
  if (!refresh) {
    const cached = await getCachedOverview(env, orgId);
    if (cached) return ok(cached);
  }

  // Fetch source spec + term mappings once, reuse for process + architecture perspectives
  const [sourceSpec, termMappings] = await Promise.all([
    aggregateSourceSpec(env, orgId),
    buildTermMappings(env, orgId),
  ]);

  const [apiTable, process, architecture, findings] = await Promise.all([
    buildApiTablePerspectives(env, orgId),
    buildProcessPerspective(env, orgId, sourceSpec, termMappings),
    buildArchitecturePerspective(env, orgId, sourceSpec, termMappings),
    buildFindingsSummary(env, orgId),
  ]);

  const overview: GapOverview = {
    organizationId: orgId,
    perspectives: {
      process,
      architecture,
      api: apiTable.api,
      table: apiTable.table,
    },
    findings,
    sourceStats: {
      controllerCount: sourceSpec.stats.controllerCount,
      endpointCount: sourceSpec.stats.endpointCount,
      tableCount: sourceSpec.stats.tableCount,
      mapperCount: sourceSpec.stats.mapperCount,
      transactionCount: sourceSpec.transactions.length,
    },
    generatedAt: new Date().toISOString(),
  };

  ctx.waitUntil(cacheOverview(env, orgId, overview));

  return ok(overview);
}

// ── API + Table perspectives (from FactCheck) ─────────────────────

interface FactCheckAggRow {
  spec_type: string;
  total_source: number;
  total_doc: number;
  total_matched: number;
  total_gaps: number;
}

interface GapItemRow {
  gap_id: string;
  gap_type: string;
  severity: string;
  source_item: string;
  document_item: string | null;
  description: string;
}

async function buildApiTablePerspectives(
  env: Env,
  orgId: string,
): Promise<{ api: PerspectiveSummary; table: PerspectiveSummary }> {
  const { results: aggRows } = await env.DB_EXTRACTION.prepare(
    `SELECT
       CASE WHEN spec_type = 'mixed' THEN 'api' ELSE spec_type END AS spec_type,
       COALESCE(SUM(total_source_items), 0) AS total_source,
       COALESCE(SUM(total_doc_items), 0) AS total_doc,
       COALESCE(SUM(matched_items), 0) AS total_matched,
       COALESCE(SUM(gap_count), 0) AS total_gaps
     FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'
     GROUP BY CASE WHEN spec_type = 'mixed' THEN 'api' ELSE spec_type END`,
  )
    .bind(orgId)
    .all<FactCheckAggRow>();

  const { results: resultIds } = await env.DB_EXTRACTION.prepare(
    `SELECT result_id FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'
     ORDER BY created_at DESC LIMIT 5`,
  )
    .bind(orgId)
    .all<{ result_id: string }>();

  const rids = resultIds.map((r) => r.result_id);

  const apiItems: PerspectiveItem[] = [];
  const tableItems: PerspectiveItem[] = [];

  if (rids.length > 0) {
    const placeholders = rids.map(() => "?").join(",");
    const { results: gapRows } = await env.DB_EXTRACTION.prepare(
      `SELECT g.gap_id, g.gap_type, g.severity, g.source_item, g.document_item, g.description
       FROM fact_check_gaps g
       WHERE g.result_id IN (${placeholders}) AND g.organization_id = ?
       ORDER BY CASE g.severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END
       LIMIT 200`,
    )
      .bind(...rids, orgId)
      .all<GapItemRow>();

    for (const row of gapRows) {
      const item = gapRowToItem(row);
      const sourceObj = safeParseJson(row.source_item);
      if (isRecord(sourceObj)) {
        if ("path" in sourceObj || "httpMethods" in sourceObj || "methodName" in sourceObj) {
          apiItems.push(item);
        } else if ("tableName" in sourceObj || "columns" in sourceObj) {
          tableItems.push(item);
        } else {
          apiItems.push(item);
        }
      } else {
        apiItems.push(item);
      }
    }
  }

  const apiAgg = aggRows.find((r) => r.spec_type === "api");
  const tableAgg = aggRows.find((r) => r.spec_type === "table");

  return {
    api: {
      asIsCount: apiAgg?.total_doc ?? 0,
      toBeCount: apiAgg?.total_source ?? 0,
      matchedCount: apiAgg?.total_matched ?? 0,
      gapCount: apiAgg?.total_gaps ?? 0,
      coveragePct: apiAgg && apiAgg.total_source > 0
        ? Math.round((apiAgg.total_matched / apiAgg.total_source) * 1000) / 10
        : 0,
      items: apiItems,
    },
    table: {
      asIsCount: tableAgg?.total_doc ?? 0,
      toBeCount: tableAgg?.total_source ?? 0,
      matchedCount: tableAgg?.total_matched ?? 0,
      gapCount: tableAgg?.total_gaps ?? 0,
      coveragePct: tableAgg && tableAgg.total_source > 0
        ? Math.round((tableAgg.total_matched / tableAgg.total_source) * 1000) / 10
        : 0,
      items: tableItems,
    },
  };
}

function gapRowToItem(row: GapItemRow): PerspectiveItem {
  const sourceObj = safeParseJson(row.source_item);
  let name: string = row.gap_id;
  if (isRecord(sourceObj)) {
    const candidate =
      (sourceObj["path"] as string | undefined)
      ?? (sourceObj["tableName"] as string | undefined)
      ?? (sourceObj["methodName"] as string | undefined);
    if (candidate) name = candidate;
  }

  const statusMap: Record<string, PerspectiveItem["status"]> = {
    MID: "gap-in-doc",
    MC: "gap-in-code",
    SM: "mismatch",
    TM: "mismatch",
    PM: "mismatch",
  };

  return {
    name: String(name),
    source: row.gap_type === "MID" ? "code" : row.gap_type === "MC" ? "document" : "both",
    status: statusMap[row.gap_type] ?? "mismatch",
    severity: row.severity as PerspectiveItem["severity"],
    detail: row.description,
  };
}

// ── Process perspective (analyses + source transactions/APIs) ──────

interface AnalysisSummaryRow {
  document_id: string;
  process_count: number;
  entity_count: number;
  rule_count: number;
  summary_json: string;
}

interface DocProcess {
  documentCount: number;
  category: string;
  avgScore: number;
  scores: number[];
  steps: string[];
}

async function buildProcessPerspective(
  env: Env,
  orgId: string,
  sourceSpec: SourceSpec,
  termMappings: TermMapping[],
): Promise<PerspectiveSummary> {
  // ── Document side: processes from analyses ──
  const { results: analysisRows } = await env.DB_EXTRACTION.prepare(
    `SELECT document_id, process_count, entity_count, rule_count, summary_json
     FROM analyses
     WHERE organization_id = ? AND status = 'completed'`,
  )
    .bind(orgId)
    .all<AnalysisSummaryRow>();

  const docProcesses = new Map<string, DocProcess>();

  for (const row of analysisRows) {
    const summary = safeParseJson(row.summary_json) as {
      processes?: Array<{
        name: string;
        importanceScore: number;
        category: string;
        steps?: string[];
      }>;
    } | null;
    if (!summary?.processes) continue;
    for (const proc of summary.processes) {
      const entry = docProcesses.get(proc.name);
      if (entry) {
        entry.documentCount++;
        entry.scores.push(proc.importanceScore);
        entry.avgScore = entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length;
        if (proc.steps) entry.steps.push(...proc.steps);
      } else {
        docProcesses.set(proc.name, {
          documentCount: 1,
          category: proc.category,
          avgScore: proc.importanceScore,
          scores: [proc.importanceScore],
          steps: proc.steps ? [...proc.steps] : [],
        });
      }
    }
  }

  // ── Source side: aggregate from SourceSpec ──
  // Build a set of source "process units" from controllers + transactions
  const sourceProcessUnits = new Map<string, {
    type: "controller" | "transaction";
    className: string;
    methods: string[];
    endpointCount: number;
    sourceFile: string;
  }>();

  // Group APIs by controller class → each controller is a "process unit"
  for (const api of sourceSpec.apis) {
    const key = api.controllerClass;
    const entry = sourceProcessUnits.get(key);
    if (entry) {
      if (!entry.methods.includes(api.methodName)) {
        entry.methods.push(api.methodName);
      }
      entry.endpointCount++;
    } else {
      sourceProcessUnits.set(key, {
        type: "controller",
        className: api.controllerClass,
        methods: [api.methodName],
        endpointCount: 1,
        sourceFile: api.sourceFile,
      });
    }
  }

  // Add standalone transactions (not already covered by controllers)
  for (const tx of sourceSpec.transactions) {
    const key = `${tx.className}.${tx.methodName}`;
    if (!sourceProcessUnits.has(tx.className)) {
      sourceProcessUnits.set(key, {
        type: "transaction",
        className: tx.className,
        methods: [tx.methodName],
        endpointCount: 0,
        sourceFile: "",
      });
    }
  }

  // ── Cross-reference matching ──
  // For each doc process, try to find a matching source unit
  const matchedSourceKeys = new Set<string>();
  const items: PerspectiveItem[] = [];

  const sourceUnitKeys = [...sourceProcessUnits.keys()];

  for (const [name, data] of docProcesses) {
    const normalizedName = normalizeName(name);
    let matched = false;
    let matchDetail = "";

    // 1) Direct name normalization matching
    for (const [key, unit] of sourceProcessUnits) {
      const normalizedClass = normalizeName(unit.className);
      if (
        normalizedClass.includes(normalizedName)
        || normalizedName.includes(normalizedClass)
        || unit.methods.some((m) => normalizedName.includes(normalizeName(m)))
      ) {
        matched = true;
        matchedSourceKeys.add(key);
        matchDetail = `→ ${unit.className} (${unit.methods.length} methods)`;
        break;
      }
    }

    // 2) Fallback: indirect matching via fact_check term mappings
    if (!matched && termMappings.length > 0) {
      const termMatch = findBestTermMatch(name, sourceUnitKeys, termMappings);
      if (termMatch) {
        matched = true;
        matchedSourceKeys.add(termMatch.sourceName);
        matchDetail = `→ ${termMatch.sourceName} (용어매칭, 신뢰도 ${Math.round(termMatch.confidence * 100)}%)`;
      }
    }

    items.push({
      name,
      source: matched ? "both" : "document",
      status: matched ? "matched" : "gap-in-code",
      severity: data.avgScore >= 0.7 ? "HIGH" : data.avgScore >= 0.4 ? "MEDIUM" : "LOW",
      detail: matched
        ? `${data.category} 프로세스, 중요도 ${Math.round(data.avgScore * 100)}% ${matchDetail}`
        : `${data.category} 프로세스, 중요도 ${Math.round(data.avgScore * 100)}%, 소스 매칭 없음`,
    });
  }

  // Source-only items (code exists but no document process)
  for (const [key, unit] of sourceProcessUnits) {
    if (matchedSourceKeys.has(key)) continue;
    items.push({
      name: unit.className,
      source: "code",
      status: "gap-in-doc",
      severity: unit.endpointCount > 3 ? "HIGH" : unit.endpointCount > 0 ? "MEDIUM" : "LOW",
      detail: unit.type === "controller"
        ? `Controller, ${unit.endpointCount} endpoints, ${unit.methods.length} methods`
        : `@Transactional service method`,
    });
  }

  items.sort((a, b) => {
    const sevOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  const matchedCount = items.filter((i) => i.status === "matched").length;
  const totalUnique = docProcesses.size + (sourceProcessUnits.size - matchedSourceKeys.size);

  return {
    asIsCount: docProcesses.size,
    toBeCount: sourceProcessUnits.size,
    matchedCount,
    gapCount: totalUnique - matchedCount,
    coveragePct: totalUnique > 0
      ? Math.round((matchedCount / totalUnique) * 1000) / 10
      : 0,
    items: items.slice(0, 100),
  };
}

// ── Architecture perspective (analyses + source tables/models) ─────

async function buildArchitecturePerspective(
  env: Env,
  orgId: string,
  sourceSpec: SourceSpec,
  termMappings: TermMapping[],
): Promise<PerspectiveSummary> {
  // ── Document side: entities from analyses ──
  const { results: analysisRows } = await env.DB_EXTRACTION.prepare(
    `SELECT document_id, entity_count, summary_json
     FROM analyses
     WHERE organization_id = ? AND status = 'completed'`,
  )
    .bind(orgId)
    .all<{ document_id: string; entity_count: number; summary_json: string }>();

  const docEntities = new Map<string, {
    documentCount: number;
    type: string;
    attributes: number;
  }>();

  for (const row of analysisRows) {
    const summary = safeParseJson(row.summary_json) as {
      entities?: Array<{
        name: string;
        type?: string;
        attributeCount?: number;
      }>;
    } | null;
    if (!summary?.entities) continue;
    for (const ent of summary.entities) {
      const entry = docEntities.get(ent.name);
      if (entry) {
        entry.documentCount++;
      } else {
        docEntities.set(ent.name, {
          documentCount: 1,
          type: ent.type ?? "entity",
          attributes: ent.attributeCount ?? 0,
        });
      }
    }
  }

  // ── Source side: tables from SourceSpec ──
  // Build table map (deduplicated by tableName)
  const sourceTables = new Map<string, {
    tableName: string;
    columnCount: number;
    voClassName: string | undefined;
    source: string;
    sourceFile: string;
  }>();

  for (const t of sourceSpec.tables) {
    const existing = sourceTables.get(t.tableName);
    if (!existing || t.columns.length > existing.columnCount) {
      const entry: {
        tableName: string;
        columnCount: number;
        voClassName: string | undefined;
        source: string;
        sourceFile: string;
      } = {
        tableName: t.tableName,
        columnCount: t.columns.length,
        voClassName: t.voClassName ?? undefined,
        source: t.source,
        sourceFile: t.sourceFile,
      };
      sourceTables.set(t.tableName, entry);
    }
  }

  // ── Cross-reference matching ──
  const matchedTableKeys = new Set<string>();
  const items: PerspectiveItem[] = [];
  const tableKeys = [...sourceTables.keys()];

  for (const [name, data] of docEntities) {
    const normalizedName = normalizeName(name);
    let matched = false;
    let matchDetail = "";

    // 1) Direct name normalization matching
    for (const [key, table] of sourceTables) {
      const normalizedTable = normalizeName(key);
      const normalizedVo = table.voClassName ? normalizeName(table.voClassName) : "";

      if (
        normalizedTable.includes(normalizedName)
        || normalizedName.includes(normalizedTable)
        || (normalizedVo && (normalizedVo.includes(normalizedName) || normalizedName.includes(normalizedVo)))
      ) {
        matched = true;
        matchedTableKeys.add(key);
        matchDetail = `→ ${key} (${table.columnCount} columns, ${table.source})`;
        if (table.voClassName) matchDetail += ` [VO: ${table.voClassName}]`;
        break;
      }
    }

    // 2) Fallback: indirect matching via fact_check term mappings
    if (!matched && termMappings.length > 0) {
      const termMatch = findBestTermMatch(name, tableKeys, termMappings);
      if (termMatch) {
        matched = true;
        matchedTableKeys.add(termMatch.sourceName);
        matchDetail = `→ ${termMatch.sourceName} (용어매칭, 신뢰도 ${Math.round(termMatch.confidence * 100)}%)`;
      }
    }

    items.push({
      name,
      source: matched ? "both" : "document",
      status: matched ? "matched" : "gap-in-code",
      severity: data.attributes > 5 ? "HIGH" : data.attributes > 2 ? "MEDIUM" : "LOW",
      detail: matched
        ? `${data.type}, ${data.attributes}개 속성 ${matchDetail}`
        : `${data.type}, ${data.attributes}개 속성, ${data.documentCount}개 문서 — 소스 매칭 없음`,
    });
  }

  // Source-only tables (code exists but no document entity)
  for (const [key, table] of sourceTables) {
    if (matchedTableKeys.has(key)) continue;
    items.push({
      name: key,
      source: "code",
      status: "gap-in-doc",
      severity: table.columnCount > 10 ? "HIGH" : table.columnCount > 5 ? "MEDIUM" : "LOW",
      detail: `${table.source} 테이블, ${table.columnCount} columns${table.voClassName ? `, VO: ${table.voClassName}` : ""}`,
    });
  }

  items.sort((a, b) => {
    const sevOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  const matchedCount = items.filter((i) => i.status === "matched").length;
  const totalUnique = docEntities.size + (sourceTables.size - matchedTableKeys.size);

  return {
    asIsCount: docEntities.size,
    toBeCount: sourceTables.size,
    matchedCount,
    gapCount: totalUnique - matchedCount,
    coveragePct: totalUnique > 0
      ? Math.round((matchedCount / totalUnique) * 1000) / 10
      : 0,
    items: items.slice(0, 100),
  };
}

// ── Findings summary ──────────────────────────────────────────────

interface FindingAggRow {
  type: string;
  severity: string;
  cnt: number;
}

interface TopFindingRow {
  finding_id: string;
  type: string;
  severity: string;
  finding: string;
  recommendation: string;
}

async function buildFindingsSummary(
  env: Env,
  orgId: string,
): Promise<FindingSummary> {
  const [aggResult, topResult] = await Promise.all([
    env.DB_EXTRACTION.prepare(
      `SELECT type, severity, COUNT(*) AS cnt
       FROM diagnosis_findings WHERE organization_id = ?
       GROUP BY type, severity`,
    )
      .bind(orgId)
      .all<FindingAggRow>(),
    env.DB_EXTRACTION.prepare(
      `SELECT finding_id, type, severity, finding, recommendation
       FROM diagnosis_findings WHERE organization_id = ?
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END
       LIMIT 10`,
    )
      .bind(orgId)
      .all<TopFindingRow>(),
  ]);

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let total = 0;

  for (const row of aggResult.results) {
    total += row.cnt;
    byType[row.type] = (byType[row.type] ?? 0) + row.cnt;
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + row.cnt;
  }

  return {
    total,
    byType,
    bySeverity,
    topFindings: topResult.results.map((r) => ({
      findingId: r.finding_id,
      type: r.type,
      severity: r.severity,
      finding: r.finding,
      recommendation: r.recommendation,
    })),
  };
}

// ── Helpers ───────────────────────────────────────────────────────

function safeParseJson(str: string | null | undefined): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Normalize a name for fuzzy matching:
 * - lowercase
 * - strip common suffixes (Controller, Service, VO, DTO, Mapper, Impl)
 * - remove underscores, hyphens, spaces
 * - split camelCase/PascalCase into segments
 *
 * "BalanceController" → "balance"
 * "TB_ACCOUNT_INFO" → "tbaccountinfo"
 * "계좌조회" → "계좌조회"
 */
function normalizeName(name: string): string {
  let s = name;
  // Remove package prefix (com.foo.bar.ClassName → ClassName)
  const dotIdx = s.lastIndexOf(".");
  if (dotIdx >= 0) s = s.slice(dotIdx + 1);
  // Strip common suffixes
  s = s.replace(/(Controller|Service|Impl|VO|DTO|Mapper|Repository|Dao)$/gi, "");
  // lowercase
  s = s.toLowerCase();
  // Remove separators
  s = s.replace(/[_\-\s]/g, "");
  return s;
}
