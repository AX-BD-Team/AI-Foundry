/**
 * 분석 리포트 API 라우트 — svc-extraction (SVC-02) 확장
 *
 * GET  /analysis/:documentId/summary          → ExtractionSummary (Layer 1)
 * GET  /analysis/:documentId/core-processes   → CoreIdentification (Layer 2)
 * GET  /analysis/:documentId/findings         → DiagnosisResult (Layer 3)
 * GET  /analysis/:documentId/findings/:id     → DiagnosisFinding (단일 소견)
 * POST /analysis/:documentId/findings/:id/review → HITL 리뷰 상태 업데이트
 * POST /analyze                               → 3-Pass 분석 트리거 (scoring → diagnosis)
 */

import { ok, notFound, badRequest } from "@ai-foundry/utils";
import {
  ExtractionSummarySchema,
  CoreIdentificationSchema,
  type DiagnosisFinding,
} from "@ai-foundry/types";
import { buildScoringPrompt, parseScoringResult, buildCoreSummary } from "../prompts/scoring.js";
import { buildDiagnosisPrompt, parseDiagnosisResult } from "../prompts/diagnosis.js";
import { callLlm, callLlmWithMeta } from "../llm/caller.js";
import type { LlmCallOptions } from "../llm/caller.js";
import type { LlmProvider } from "@ai-foundry/types";
import type { Env } from "../env.js";

// ── D1 행 타입 ─────────────────────────────────────────────────────────

interface FindingRow {
  finding_id: string;
  analysis_id: string;
  document_id: string;
  organization_id: string;
  type: string;
  severity: string;
  finding: string;
  evidence: string;
  recommendation: string;
  related_processes: string | null;
  related_entities: string | null;
  source_document_ids: string | null;
  confidence: number;
  hitl_status: string;
  reviewer_id: string | null;
  reviewer_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function rowToFinding(row: FindingRow): DiagnosisFinding {
  return {
    findingId: row.finding_id,
    type: row.type as DiagnosisFinding["type"],
    severity: row.severity as DiagnosisFinding["severity"],
    finding: row.finding,
    evidence: row.evidence,
    recommendation: row.recommendation,
    sourceDocumentIds: row.source_document_ids ? (JSON.parse(row.source_document_ids) as string[]) : [],
    relatedProcesses: row.related_processes ? (JSON.parse(row.related_processes) as string[]) : [],
    ...(row.related_entities ? { relatedEntities: JSON.parse(row.related_entities) as string[] } : {}),
    confidence: row.confidence,
    hitlStatus: row.hitl_status as DiagnosisFinding["hitlStatus"],
    ...(row.reviewer_comment ? { reviewerComment: row.reviewer_comment } : {}),
    ...(row.reviewer_id ? { reviewedBy: row.reviewer_id } : {}),
    ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
  };
}

// ── 라우트 핸들러 ──────────────────────────────────────────────────────

export async function handleAnalysisRoutes(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // GET /analysis/organizations — 분석 완료된 조직 목록
  if (method === "GET" && path === "/analysis/organizations") {
    return handleGetOrganizations(env);
  }

  // POST /analyze — 3-Pass 분석 트리거
  if (method === "POST" && path === "/analyze") {
    return handleAnalyzeTrigger(request, env, ctx);
  }

  // POST /analysis/:documentId/findings/:findingId/review
  const reviewMatch = path.match(/^\/analysis\/([^/]+)\/findings\/([^/]+)\/review$/);
  if (method === "POST" && reviewMatch) {
    const documentId = reviewMatch[1];
    const findingId = reviewMatch[2];
    if (!documentId || !findingId) return notFound("route");
    return handleFindingReview(request, env, findingId);
  }

  // GET /analysis/:documentId/findings/:findingId
  const findingDetailMatch = path.match(/^\/analysis\/([^/]+)\/findings\/([^/]+)$/);
  if (method === "GET" && findingDetailMatch) {
    const documentId = findingDetailMatch[1];
    const findingId = findingDetailMatch[2];
    if (!documentId || !findingId) return notFound("route");
    return handleGetFinding(env, findingId);
  }

  // GET /analysis/:documentId/findings
  const findingsMatch = path.match(/^\/analysis\/([^/]+)\/findings$/);
  if (method === "GET" && findingsMatch) {
    const documentId = findingsMatch[1];
    if (!documentId) return notFound("route");
    return handleGetFindings(env, documentId);
  }

  // GET /analysis/:documentId/core-processes
  const coreMatch = path.match(/^\/analysis\/([^/]+)\/core-processes$/);
  if (method === "GET" && coreMatch) {
    const documentId = coreMatch[1];
    if (!documentId) return notFound("route");
    return handleGetCoreProcesses(env, documentId);
  }

  // GET /analysis/:documentId/summary
  const summaryMatch = path.match(/^\/analysis\/([^/]+)\/summary$/);
  if (method === "GET" && summaryMatch) {
    const documentId = summaryMatch[1];
    if (!documentId) return notFound("route");
    return handleGetSummary(env, documentId);
  }

  return notFound("route");
}

// ── GET /analysis/organizations ──────────────────────────────────────

async function handleGetOrganizations(env: Env): Promise<Response> {
  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT organization_id,
            COUNT(*) AS analysis_count,
            SUM(process_count) AS total_processes,
            MAX(created_at) AS last_analysis_at
     FROM analyses
     WHERE status = 'completed'
     GROUP BY organization_id
     ORDER BY last_analysis_at DESC`
  )
    .all<{
      organization_id: string;
      analysis_count: number;
      total_processes: number;
      last_analysis_at: string;
    }>();

  return ok({
    organizations: results.map((r) => ({
      organizationId: r.organization_id,
      analysisCount: r.analysis_count,
      totalProcesses: r.total_processes,
      lastAnalysisAt: r.last_analysis_at,
    })),
  });
}

// ── GET /analysis/:documentId/summary ────────────────────────────────

async function handleGetSummary(env: Env, documentId: string): Promise<Response> {
  const row = await env.DB_EXTRACTION.prepare(
    `SELECT summary_json, llm_provider, llm_model FROM analyses WHERE document_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(documentId)
    .first<{ summary_json: string; llm_provider: string | null; llm_model: string | null }>();

  if (!row) return notFound("analysis", documentId);

  const parsed: unknown = JSON.parse(row.summary_json);
  const validated = ExtractionSummarySchema.safeParse(parsed);
  if (!validated.success) {
    return new Response(JSON.stringify({ success: false, error: { message: "Invalid analysis data" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return ok({ ...validated.data, llmProvider: row.llm_provider, llmModel: row.llm_model });
}

// ── GET /analysis/:documentId/core-processes ─────────────────────────

async function handleGetCoreProcesses(env: Env, documentId: string): Promise<Response> {
  const row = await env.DB_EXTRACTION.prepare(
    `SELECT core_identification_json FROM analyses WHERE document_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(documentId)
    .first<{ core_identification_json: string }>();

  if (!row) return notFound("analysis", documentId);

  const parsed: unknown = JSON.parse(row.core_identification_json);
  const validated = CoreIdentificationSchema.safeParse(parsed);
  if (!validated.success) {
    return new Response(JSON.stringify({ success: false, error: { message: "Invalid core identification data" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return ok(validated.data);
}

// ── GET /analysis/:documentId/findings ───────────────────────────────

async function handleGetFindings(env: Env, documentId: string): Promise<Response> {
  // 분석 ID + 메타데이터 조회
  const analysisRow = await env.DB_EXTRACTION.prepare(
    `SELECT analysis_id, extraction_id, organization_id, created_at
     FROM analyses WHERE document_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(documentId)
    .first<{ analysis_id: string; extraction_id: string; organization_id: string; created_at: string }>();

  if (!analysisRow) return notFound("analysis", documentId);

  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM diagnosis_findings WHERE analysis_id = ? ORDER BY severity ASC, created_at ASC`
  )
    .bind(analysisRow.analysis_id)
    .all<FindingRow>();

  const findings: DiagnosisFinding[] = results.map(rowToFinding);

  // byType 집계
  const byType = { missing: 0, duplicate: 0, overspec: 0, inconsistency: 0 };
  const bySeverity = { critical: 0, warning: 0, info: 0 };
  for (const f of findings) {
    byType[f.type]++;
    bySeverity[f.severity]++;
  }

  return ok({
    diagnosisId: analysisRow.analysis_id,
    documentId,
    extractionId: analysisRow.extraction_id,
    organizationId: analysisRow.organization_id,
    findings,
    summary: {
      totalFindings: findings.length,
      byType,
      bySeverity,
    },
    createdAt: analysisRow.created_at,
  });
}

// ── GET /analysis/:documentId/findings/:findingId ────────────────────

async function handleGetFinding(env: Env, findingId: string): Promise<Response> {
  const row = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM diagnosis_findings WHERE finding_id = ?`
  )
    .bind(findingId)
    .first<FindingRow>();

  if (!row) return notFound("finding", findingId);

  return ok(rowToFinding(row));
}

// ── POST /analysis/:documentId/findings/:findingId/review ─────────────

interface ReviewBody {
  action: "accept" | "reject" | "modify";
  comment?: string;
  reviewerId: string;
}

async function handleFindingReview(
  request: Request,
  env: Env,
  findingId: string
): Promise<Response> {
  let body: ReviewBody;
  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { action, comment, reviewerId } = body;

  if (!action || !["accept", "reject", "modify"].includes(action)) {
    return badRequest("action must be accept | reject | modify");
  }
  if (!reviewerId || typeof reviewerId !== "string") {
    return badRequest("reviewerId is required");
  }

  const hitlStatus = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "modified";
  const reviewedAt = new Date().toISOString();

  const result = await env.DB_EXTRACTION.prepare(
    `UPDATE diagnosis_findings
     SET hitl_status = ?, reviewer_id = ?, reviewer_comment = ?, reviewed_at = ?
     WHERE finding_id = ?`
  )
    .bind(hitlStatus, reviewerId, comment ?? null, reviewedAt, findingId)
    .run();

  if (result.meta.rows_written === 0) {
    return notFound("finding", findingId);
  }

  return ok({ findingId, hitlStatus, reviewedAt });
}

// ── POST /analyze — 3-Pass 분석 트리거 ───────────────────────────────

interface AnalyzeBody {
  documentId: string;
  extractionId: string;
  organizationId: string;
  mode: "standard" | "diagnosis" | "diagnosis-sync";
  preferredProvider?: LlmProvider;
  preferredTier?: "sonnet" | "haiku";
}

async function handleAnalyzeTrigger(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let body: AnalyzeBody;
  try {
    body = (await request.json()) as AnalyzeBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { documentId, extractionId, organizationId, mode = "standard", preferredProvider, preferredTier } = body;

  if (!documentId || typeof documentId !== "string") return badRequest("documentId is required");
  if (!extractionId || typeof extractionId !== "string") return badRequest("extractionId is required");
  if (!organizationId || typeof organizationId !== "string") return badRequest("organizationId is required");

  const llmOptions: LlmCallOptions = {};
  if (preferredProvider) llmOptions.provider = preferredProvider;

  if (mode !== "diagnosis" && mode !== "diagnosis-sync") {
    return ok({ message: "Standard mode: no diagnosis analysis performed", documentId, extractionId });
  }

  // 기존 extraction 결과 조회
  const extractionRow = await env.DB_EXTRACTION.prepare(
    `SELECT result_json FROM extractions WHERE id = ?`
  )
    .bind(extractionId)
    .first<{ result_json: string | null }>();

  if (!extractionRow?.result_json) {
    return notFound("extraction", extractionId);
  }

  const extractionResult = JSON.parse(extractionRow.result_json) as {
    processes: Array<{ name: string; description: string; steps: string[] }>;
    entities: Array<{ name: string; type: string; attributes: string[] }>;
    rules: Array<{ condition: string; outcome: string }>;
    relationships: Array<{ from: string; to: string; type: string }>;
  };

  const analysisId = crypto.randomUUID();

  const passOpts = {
    analysisId,
    documentId,
    extractionId,
    organizationId,
    extractionResult,
    llmOptions,
    tier: preferredTier ?? "sonnet" as const,
  };

  if (mode === "diagnosis-sync") {
    // 동기 모드: 에러를 응답에 직접 포함
    try {
      await runAnalysisPasses(env, passOpts);
      return ok({ analysisId, status: "completed", documentId, extractionId, organizationId });
    } catch (e) {
      return Response.json({
        success: false,
        error: { code: "ANALYSIS_ERROR", message: String(e) },
      }, { status: 500 });
    }
  }

  // 비동기로 3-Pass 분석 실행 (non-blocking)
  ctx.waitUntil(runAnalysisPasses(env, passOpts));

  return ok({ analysisId, status: "processing", documentId, extractionId, organizationId });
}

// ── 3-Pass 분석 내부 함수 ─────────────────────────────────────────────

async function runAnalysisPasses(
  env: Env,
  opts: {
    analysisId: string;
    documentId: string;
    extractionId: string;
    organizationId: string;
    extractionResult: {
      processes: Array<{ name: string; description: string; steps: string[] }>;
      entities: Array<{ name: string; type: string; attributes: string[] }>;
      rules: Array<{ condition: string; outcome: string }>;
      relationships: Array<{ from: string; to: string; type: string }>;
    };
    llmOptions?: LlmCallOptions;
    tier?: "sonnet" | "haiku";
  }
): Promise<void> {
  const { analysisId, documentId, extractionId, organizationId, extractionResult, llmOptions, tier: requestedTier } = opts;
  const tier = requestedTier ?? "sonnet";

  try {
    // Pass 1: Scoring + Core Identification
    const scoringPrompt = buildScoringPrompt(extractionResult);
    let scoringResult;
    let llmProvider = "unknown";
    let llmModel = "unknown";
    try {
      const scoringMeta = await callLlmWithMeta(scoringPrompt, tier, env.LLM_ROUTER, env.INTERNAL_API_SECRET, 8192, llmOptions);
      scoringResult = parseScoringResult(scoringMeta.content);
      llmProvider = scoringMeta.provider;
      llmModel = scoringMeta.model;
    } catch {
      scoringResult = { scoredProcesses: [], coreJudgments: [], processTree: [] };
    }

    const coreSummary = buildCoreSummary(scoringResult.scoredProcesses);

    const summaryJson = JSON.stringify({
      documentId,
      organizationId,
      extractionId,
      counts: {
        processes: extractionResult.processes.length,
        entities: extractionResult.entities.length,
        rules: extractionResult.rules.length,
        relationships: extractionResult.relationships.length,
      },
      processes: scoringResult.scoredProcesses,
      entities: extractionResult.entities.map((e) => ({
        ...e,
        usageCount: 0,
        isOrphan: false,
      })),
      documentClassification: "general",
      analysisTimestamp: new Date().toISOString(),
    });

    const coreIdentificationJson = JSON.stringify({
      documentId,
      organizationId,
      coreProcesses: scoringResult.coreJudgments,
      processTree: scoringResult.processTree,
      summary: coreSummary,
    });

    const now = new Date().toISOString();
    await env.DB_EXTRACTION.prepare(
      `INSERT INTO analyses
       (analysis_id, document_id, extraction_id, organization_id,
        process_count, entity_count, rule_count, relationship_count,
        core_process_count, mega_process_count,
        summary_json, core_identification_json, llm_provider, llm_model, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`
    )
      .bind(
        analysisId,
        documentId,
        extractionId,
        organizationId,
        extractionResult.processes.length,
        extractionResult.entities.length,
        extractionResult.rules.length,
        extractionResult.relationships.length,
        coreSummary.coreProcessCount,
        coreSummary.megaProcessCount,
        summaryJson,
        coreIdentificationJson,
        llmProvider,
        llmModel,
        now
      )
      .run();

    // Pass 2: Diagnosis
    let findings: ReturnType<typeof parseDiagnosisResult> = [];
    try {
      const diagnosisPrompt = buildDiagnosisPrompt(scoringResult, extractionResult);
      const rawDiagnosis = await callLlm(diagnosisPrompt, tier, env.LLM_ROUTER, env.INTERNAL_API_SECRET, 8192, llmOptions);
      findings = parseDiagnosisResult(rawDiagnosis);
    } catch (diagErr) {
      console.error("[Pass2 Diagnosis error]", String(diagErr));
      findings = [];
    }

    // D1 diagnosis_findings INSERT
    if (findings.length > 0) {
      for (const finding of findings) {
        const fid = crypto.randomUUID();
        await env.DB_EXTRACTION.prepare(
          `INSERT INTO diagnosis_findings
           (finding_id, analysis_id, document_id, organization_id,
            type, severity, finding, evidence, recommendation,
            related_processes, related_entities, source_document_ids,
            confidence, hitl_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
        )
          .bind(
            fid,
            analysisId,
            documentId,
            organizationId,
            finding.type,
            finding.severity,
            finding.finding,
            finding.evidence,
            finding.recommendation,
            JSON.stringify(finding.relatedProcesses),
            finding.relatedEntities ? JSON.stringify(finding.relatedEntities) : null,
            JSON.stringify(finding.sourceDocumentIds),
            finding.confidence,
            now
          )
          .run();
      }
    }

    // analysis.completed 이벤트 발행
    await env.QUEUE_PIPELINE.send({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: "analysis.completed",
      payload: {
        documentId,
        extractionId,
        organizationId,
        analysisId,
        findingCount: findings.length,
        coreProcessCount: coreSummary.coreProcessCount,
      },
    });

    // diagnosis.completed 이벤트 발행
    await env.QUEUE_PIPELINE.send({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: "diagnosis.completed",
      payload: {
        analysisId,
        documentId,
        organizationId,
        findingCount: findings.length,
      },
    });
  } catch {
    // 분석 실패 — 기존 파이프라인에 영향 없도록 status='partial' 업데이트
    await env.DB_EXTRACTION.prepare(
      `UPDATE analyses SET status = 'partial' WHERE analysis_id = ?`
    )
      .bind(analysisId)
      .run();
  }
}
