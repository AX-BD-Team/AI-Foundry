/**
 * KPI and dashboard endpoints for svc-analytics.
 * GET /kpi        — pipeline KPI summary (aggregated from pipeline_metrics)
 * GET /cost       — LLM cost breakdown by tier
 * GET /dashboards — combined dashboard data (pipeline + cost + usage)
 */

import { createLogger, ok } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-analytics:kpi");

interface PipelineRow {
  date: string;
  documents_uploaded: number | null;
  extractions_completed: number | null;
  policies_generated: number | null;
  policies_approved: number | null;
  skills_packaged: number | null;
  avg_pipeline_duration_ms: number | null;
}

interface CostRow {
  date: string;
  tier: string;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_requests: number | null;
  cached_requests: number | null;
}

interface SkillUsageRow {
  skill_id: string;
  date: string;
  adapter_type: string;
  download_count: number | null;
}

function parseDateRange(url: URL): { startDate: string; endDate: string } {
  const endDate = url.searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const startDate = url.searchParams.get("startDate") ?? defaultStart;
  return { startDate, endDate };
}

export async function handleGetKpi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId") ?? "default";
  const { startDate, endDate } = parseDateRange(url);

  const result = await env.DB_ANALYTICS.prepare(
    `SELECT
       SUM(COALESCE(documents_uploaded, 0)) AS documents_uploaded,
       SUM(COALESCE(extractions_completed, 0)) AS extractions_completed,
       SUM(COALESCE(policies_generated, 0)) AS policies_generated,
       SUM(COALESCE(policies_approved, 0)) AS policies_approved,
       SUM(COALESCE(skills_packaged, 0)) AS skills_packaged,
       AVG(COALESCE(avg_pipeline_duration_ms, 0)) AS avg_pipeline_duration_ms
     FROM pipeline_metrics
     WHERE organization_id = ? AND date BETWEEN ? AND ?`,
  )
    .bind(organizationId, startDate, endDate)
    .first<Record<string, number | null>>();

  const kpi = {
    documentsUploaded: result?.["documents_uploaded"] ?? 0,
    extractionsCompleted: result?.["extractions_completed"] ?? 0,
    policiesGenerated: result?.["policies_generated"] ?? 0,
    policiesApproved: result?.["policies_approved"] ?? 0,
    skillsPackaged: result?.["skills_packaged"] ?? 0,
    avgPipelineDurationMs: result?.["avg_pipeline_duration_ms"] ?? 0,
  };

  logger.info("KPI queried", { organizationId, startDate, endDate });

  return ok({ organizationId, period: { startDate, endDate }, kpi });
}

export async function handleGetCost(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const { startDate, endDate } = parseDateRange(url);

  const result = await env.DB_ANALYTICS.prepare(
    `SELECT tier,
       SUM(COALESCE(total_input_tokens, 0)) AS total_input_tokens,
       SUM(COALESCE(total_output_tokens, 0)) AS total_output_tokens,
       SUM(COALESCE(total_requests, 0)) AS total_requests,
       SUM(COALESCE(cached_requests, 0)) AS cached_requests
     FROM cost_metrics
     WHERE date BETWEEN ? AND ?
     GROUP BY tier
     ORDER BY tier`,
  )
    .bind(startDate, endDate)
    .all<CostRow>();

  const byTier: Record<string, {
    inputTokens: number;
    outputTokens: number;
    requests: number;
    cachedRequests: number;
  }> = {};

  let totalInput = 0;
  let totalOutput = 0;
  let totalRequests = 0;

  for (const row of result.results) {
    const input = row.total_input_tokens ?? 0;
    const output = row.total_output_tokens ?? 0;
    const requests = row.total_requests ?? 0;
    byTier[row.tier] = {
      inputTokens: input,
      outputTokens: output,
      requests,
      cachedRequests: row.cached_requests ?? 0,
    };
    totalInput += input;
    totalOutput += output;
    totalRequests += requests;
  }

  return ok({
    period: { startDate, endDate },
    byTier,
    total: { inputTokens: totalInput, outputTokens: totalOutput, requests: totalRequests },
  });
}

export async function handleGetDashboard(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const { startDate, endDate } = parseDateRange(url);
  const organizationId = url.searchParams.get("organizationId") ?? "default";

  // Pipeline trend (daily)
  const pipelineResult = await env.DB_ANALYTICS.prepare(
    `SELECT date,
       COALESCE(documents_uploaded, 0) AS documents_uploaded,
       COALESCE(extractions_completed, 0) AS extractions_completed,
       COALESCE(policies_generated, 0) AS policies_generated,
       COALESCE(policies_approved, 0) AS policies_approved,
       COALESCE(skills_packaged, 0) AS skills_packaged
     FROM pipeline_metrics
     WHERE organization_id = ? AND date BETWEEN ? AND ?
     ORDER BY date`,
  )
    .bind(organizationId, startDate, endDate)
    .all<PipelineRow>();

  // Cost trend (daily by tier)
  const costResult = await env.DB_ANALYTICS.prepare(
    `SELECT date, tier,
       COALESCE(total_input_tokens, 0) AS total_input_tokens,
       COALESCE(total_output_tokens, 0) AS total_output_tokens,
       COALESCE(total_requests, 0) AS total_requests
     FROM cost_metrics
     WHERE date BETWEEN ? AND ?
     ORDER BY date, tier`,
  )
    .bind(startDate, endDate)
    .all<CostRow>();

  // Top skills by usage
  const usageResult = await env.DB_ANALYTICS.prepare(
    `SELECT skill_id, SUM(COALESCE(download_count, 0)) AS download_count
     FROM skill_usage_metrics
     WHERE date BETWEEN ? AND ?
     GROUP BY skill_id
     ORDER BY download_count DESC
     LIMIT 10`,
  )
    .bind(startDate, endDate)
    .all<{ skill_id: string; download_count: number }>();

  const pipeline = pipelineResult.results.map((r) => ({
    date: r.date,
    documentsUploaded: r.documents_uploaded ?? 0,
    extractionsCompleted: r.extractions_completed ?? 0,
    policiesGenerated: r.policies_generated ?? 0,
    policiesApproved: r.policies_approved ?? 0,
    skillsPackaged: r.skills_packaged ?? 0,
  }));

  const cost = costResult.results.map((r) => ({
    date: r.date,
    tier: r.tier,
    inputTokens: r.total_input_tokens ?? 0,
    outputTokens: r.total_output_tokens ?? 0,
    requests: r.total_requests ?? 0,
  }));

  const topSkills = usageResult.results.map((r) => ({
    skillId: r.skill_id,
    downloads: r.download_count,
  }));

  logger.info("Dashboard queried", { organizationId, startDate, endDate });

  return ok({
    organizationId,
    period: { startDate, endDate },
    pipeline,
    cost,
    topSkills,
  });
}
