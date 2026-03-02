/**
 * GET /quality — Quality metrics dashboard endpoint.
 * Returns aggregated quality metrics for a given organization and date range.
 */

import { ok, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-analytics:quality");

interface QualityMetricRow {
  ingestion_count: number;
  total_chunks: number;
  total_valid_chunks: number;
  total_parse_duration_ms: number;
  extraction_count: number;
  total_rule_count: number;
  total_extract_duration_ms: number;
  policy_candidate_count: number;
  policy_approved_count: number;
  policy_modified_count: number;
  total_trust_score: number;
  skill_count: number;
  total_skill_trust_score: number;
  total_skill_term_count: number;
}

interface LatencyRow {
  stage: string;
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  samples: number;
}

export async function handleGetQuality(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? "org-001";
  const startDate = url.searchParams.get("startDate") ?? "2020-01-01";
  const endDate = url.searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);

  try {
    const metricsResult = await env.DB_ANALYTICS.prepare(
      `SELECT
        COALESCE(SUM(ingestion_count), 0) AS ingestion_count,
        COALESCE(SUM(total_chunks), 0) AS total_chunks,
        COALESCE(SUM(total_valid_chunks), 0) AS total_valid_chunks,
        COALESCE(SUM(total_parse_duration_ms), 0) AS total_parse_duration_ms,
        COALESCE(SUM(extraction_count), 0) AS extraction_count,
        COALESCE(SUM(total_rule_count), 0) AS total_rule_count,
        COALESCE(SUM(total_extract_duration_ms), 0) AS total_extract_duration_ms,
        COALESCE(SUM(policy_candidate_count), 0) AS policy_candidate_count,
        COALESCE(SUM(policy_approved_count), 0) AS policy_approved_count,
        COALESCE(SUM(policy_modified_count), 0) AS policy_modified_count,
        COALESCE(SUM(total_trust_score), 0) AS total_trust_score,
        COALESCE(SUM(skill_count), 0) AS skill_count,
        COALESCE(SUM(total_skill_trust_score), 0) AS total_skill_trust_score,
        COALESCE(SUM(total_skill_term_count), 0) AS total_skill_term_count
      FROM quality_metrics
      WHERE organization_id = ? AND date >= ? AND date <= ?`,
    )
      .bind(organizationId, startDate, endDate)
      .first();

    const m = (metricsResult ?? {}) as unknown as QualityMetricRow;

    const latencyResult = await env.DB_ANALYTICS.prepare(
      `SELECT
        stage,
        ROUND(AVG(duration_ms), 0) AS avg_ms,
        MIN(duration_ms) AS min_ms,
        MAX(duration_ms) AS max_ms,
        COUNT(*) AS samples
      FROM stage_latency
      WHERE organization_id = ? AND date >= ? AND date <= ?
      GROUP BY stage`,
    )
      .bind(organizationId, startDate, endDate)
      .all();

    const latencyRows = (latencyResult.results ?? []) as unknown as LatencyRow[];
    const stageLatencies: Record<string, { avgMs: number; minMs: number; maxMs: number; samples: number }> = {};
    for (const row of latencyRows) {
      stageLatencies[row.stage] = {
        avgMs: row.avg_ms,
        minMs: row.min_ms,
        maxMs: row.max_ms,
        samples: row.samples,
      };
    }

    const ingestionCount = m.ingestion_count || 0;
    const extractionCount = m.extraction_count || 0;
    const policyApprovedCount = m.policy_approved_count || 0;
    const skillCount = m.skill_count || 0;

    return ok({
      organizationId,
      period: { startDate, endDate },
      parsing: {
        totalDocuments: ingestionCount,
        totalChunks: m.total_chunks || 0,
        chunkValidityRate: m.total_chunks > 0
          ? Math.round((m.total_valid_chunks / m.total_chunks) * 10000) / 100
          : 0,
        avgChunksPerDoc: ingestionCount > 0
          ? Math.round((m.total_chunks / ingestionCount) * 100) / 100
          : 0,
        avgParseDurationMs: ingestionCount > 0
          ? Math.round(m.total_parse_duration_ms / ingestionCount)
          : 0,
      },
      extraction: {
        totalExtractions: extractionCount,
        totalRules: m.total_rule_count || 0,
        avgRulesPerExtraction: extractionCount > 0
          ? Math.round((m.total_rule_count / extractionCount) * 100) / 100
          : 0,
        avgExtractionDurationMs: extractionCount > 0
          ? Math.round(m.total_extract_duration_ms / extractionCount)
          : 0,
      },
      policy: {
        candidateCount: m.policy_candidate_count || 0,
        approvedCount: policyApprovedCount,
        modifiedCount: m.policy_modified_count || 0,
        approvalRate: m.policy_candidate_count > 0
          ? Math.round((policyApprovedCount / m.policy_candidate_count) * 10000) / 100
          : 0,
        modificationRate: policyApprovedCount > 0
          ? Math.round((m.policy_modified_count / policyApprovedCount) * 10000) / 100
          : 0,
        avgTrustScore: policyApprovedCount > 0
          ? Math.round((m.total_trust_score / policyApprovedCount) * 1000) / 1000
          : 0,
      },
      skill: {
        totalSkills: skillCount,
        avgTrustScore: skillCount > 0
          ? Math.round((m.total_skill_trust_score / skillCount) * 1000) / 1000
          : 0,
        totalTerms: m.total_skill_term_count || 0,
      },
      stageLatencies,
    });
  } catch (e) {
    logger.error("Failed to fetch quality metrics", { error: String(e) });
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
}
