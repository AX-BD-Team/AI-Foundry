/**
 * SI Deliverable Export route handlers (AIF-REQ-017).
 * 6 GET endpoints under /deliverables/export/* that collect data from
 * svc-policy, svc-ontology, svc-extraction and render markdown documents.
 */
import { createLogger } from "@ai-foundry/utils";
import { collectPolicies, collectTerms, collectGapAnalysis } from "../collectors/data-collector.js";
import { renderBusinessRules } from "../renderers/business-rules-renderer.js";
import { renderInterfaceSpec } from "../renderers/interface-spec-renderer.js";
import { renderGlossary } from "../renderers/glossary-renderer.js";
import { renderGapReport } from "../renderers/gap-report-renderer.js";
import { renderComparison } from "../renderers/comparison-renderer.js";
import type { Env } from "../env.js";

const logger = createLogger("deliverable-export");

// ─── Helpers ──────────────────────────────────────────────────────

function getOrgId(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("organizationId");
}

function missingOrgResponse(): Response {
  return new Response(
    JSON.stringify({ error: "organizationId query parameter is required" }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}

function mdResponse(markdown: string, filename: string): Response {
  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Export: D1 인터페이스 명세서 ─────────────────────────────────

export async function handleExportInterfaceSpec(request: Request, env: Env): Promise<Response> {
  const orgId = getOrgId(request);
  if (!orgId) return missingOrgResponse();

  let overview;
  try {
    overview = await collectGapAnalysis(env.SVC_EXTRACTION, env.INTERNAL_API_SECRET, orgId);
  } catch (e) {
    logger.error("Failed to collect gap analysis for interface spec", { error: String(e), orgId });
    return mdResponse(
      `# D1 인터페이스 명세서\n\n> 데이터 수집 실패: ${String(e)}`,
      `D1-interface-spec-${orgId}-${today()}.md`,
    );
  }

  const markdown = renderInterfaceSpec(overview);
  return mdResponse(markdown, `D1-interface-spec-${orgId}-${today()}.md`);
}

// ─── Export: D2 업무규칙 정의서 ──────────────────────────────────

export async function handleExportBusinessRules(request: Request, env: Env): Promise<Response> {
  const orgId = getOrgId(request);
  if (!orgId) return missingOrgResponse();

  let policies;
  try {
    policies = await collectPolicies(env.SVC_POLICY, env.INTERNAL_API_SECRET, orgId);
  } catch (e) {
    logger.error("Failed to collect policies", { error: String(e), orgId });
    return mdResponse(
      `# D2 업무규칙 정의서\n\n> 데이터 수집 실패: ${String(e)}`,
      `D2-business-rules-${orgId}-${today()}.md`,
    );
  }

  const markdown = renderBusinessRules(policies);
  return mdResponse(markdown, `D2-business-rules-${orgId}-${today()}.md`);
}

// ─── Export: D3 용어사전 ─────────────────────────────────────────

export async function handleExportGlossary(request: Request, env: Env): Promise<Response> {
  const orgId = getOrgId(request);
  if (!orgId) return missingOrgResponse();

  // D3: collect stats first (lightweight), then terms sample
  // Stats and terms fetched separately to handle partial failures
  const termsData = await collectTerms(env.SVC_ONTOLOGY, env.INTERNAL_API_SECRET, orgId);

  const markdown = renderGlossary(termsData.terms, termsData.stats);
  return mdResponse(markdown, `D3-glossary-${orgId}-${today()}.md`);
}

// ─── Export: D4 Gap 분석 보고서 ──────────────────────────────────

export async function handleExportGapReport(request: Request, env: Env): Promise<Response> {
  const orgId = getOrgId(request);
  if (!orgId) return missingOrgResponse();

  let overview;
  try {
    overview = await collectGapAnalysis(env.SVC_EXTRACTION, env.INTERNAL_API_SECRET, orgId);
  } catch (e) {
    logger.error("Failed to collect gap analysis", { error: String(e), orgId });
    return mdResponse(
      `# D4 Gap 분석 보고서\n\n> 데이터 수집 실패: ${String(e)}`,
      `D4-gap-report-${orgId}-${today()}.md`,
    );
  }

  const markdown = renderGapReport(overview);
  return mdResponse(markdown, `D4-gap-report-${orgId}-${today()}.md`);
}

// ─── Export: D5 As-Is vs To-Be 비교 ─────────────────────────────

export async function handleExportComparison(request: Request, env: Env): Promise<Response> {
  const orgId = getOrgId(request);
  if (!orgId) return missingOrgResponse();

  let overview;
  let policyCount = 0;
  let termCount = 0;

  try {
    overview = await collectGapAnalysis(env.SVC_EXTRACTION, env.INTERNAL_API_SECRET, orgId);
  } catch (e) {
    logger.error("Failed to collect gap analysis for comparison", { error: String(e), orgId });
    return mdResponse(
      `# D5 As-Is vs To-Be 비교\n\n> Gap 분석 데이터 수집 실패: ${String(e)}`,
      `D5-comparison-${orgId}-${today()}.md`,
    );
  }

  try {
    const policies = await collectPolicies(env.SVC_POLICY, env.INTERNAL_API_SECRET, orgId);
    policyCount = policies.length;
  } catch (e) {
    logger.warn("Failed to collect policies for comparison", { error: String(e), orgId });
  }

  try {
    const termsData = await collectTerms(env.SVC_ONTOLOGY, env.INTERNAL_API_SECRET, orgId);
    termCount = termsData.terms.length;
  } catch (e) {
    logger.warn("Failed to collect terms for comparison", { error: String(e), orgId });
  }

  const markdown = renderComparison({ overview, policyCount, termCount });
  return mdResponse(markdown, `D5-comparison-${orgId}-${today()}.md`);
}

// ─── Export: All (D1~D5 통합) ────────────────────────────────────

export async function handleExportAll(request: Request, env: Env): Promise<Response> {
  const orgId = getOrgId(request);
  if (!orgId) return missingOrgResponse();

  const sections: string[] = [];

  // Collect all data with individual error handling
  let overview;
  let policies;
  let termsData;

  try {
    overview = await collectGapAnalysis(env.SVC_EXTRACTION, env.INTERNAL_API_SECRET, orgId);
  } catch (e) {
    logger.error("Failed to collect gap analysis for all", { error: String(e), orgId });
    overview = null;
  }

  try {
    policies = await collectPolicies(env.SVC_POLICY, env.INTERNAL_API_SECRET, orgId);
  } catch (e) {
    logger.error("Failed to collect policies for all", { error: String(e), orgId });
    policies = null;
  }

  try {
    termsData = await collectTerms(env.SVC_ONTOLOGY, env.INTERNAL_API_SECRET, orgId);
  } catch (e) {
    logger.error("Failed to collect terms for all", { error: String(e), orgId });
    termsData = null;
  }

  // D1 인터페이스 명세서
  if (overview) {
    sections.push(renderInterfaceSpec(overview));
  } else {
    sections.push("# D1 인터페이스 명세서\n\n> 데이터 수집 실패");
  }

  // D2 업무규칙 정의서
  if (policies) {
    sections.push(renderBusinessRules(policies));
  } else {
    sections.push("# D2 업무규칙 정의서\n\n> 데이터 수집 실패");
  }

  // D3 용어사전
  if (termsData) {
    sections.push(renderGlossary(termsData.terms, termsData.stats));
  } else {
    sections.push("# D3 용어사전\n\n> 데이터 수집 실패");
  }

  // D4 Gap 분석 보고서
  if (overview) {
    sections.push(renderGapReport(overview));
  } else {
    sections.push("# D4 Gap 분석 보고서\n\n> 데이터 수집 실패");
  }

  // D5 As-Is vs To-Be 비교
  if (overview) {
    sections.push(renderComparison({
      overview,
      policyCount: policies?.length ?? 0,
      termCount: termsData?.terms.length ?? 0,
    }));
  } else {
    sections.push("# D5 As-Is vs To-Be 비교\n\n> 데이터 수집 실패");
  }

  const markdown = sections.join("\n\n---\n\n");
  return mdResponse(markdown, `D-all-deliverables-${orgId}-${today()}.md`);
}
