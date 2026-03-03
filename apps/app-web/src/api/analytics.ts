import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId, contentType: "application/json" });
}

export interface QualityMetrics {
  organizationId: string;
  period: { startDate: string; endDate: string };
  parsing: {
    totalDocuments: number;
    totalChunks: number;
    chunkValidityRate: number;
    avgChunksPerDoc: number;
    avgParseDurationMs: number;
  };
  extraction: {
    totalExtractions: number;
    totalRules: number;
    avgRulesPerExtraction: number;
    avgExtractionDurationMs: number;
  };
  policy: {
    candidateCount: number;
    approvedCount: number;
    modifiedCount: number;
    approvalRate: number;
    modificationRate: number;
    avgTrustScore: number;
  };
  skill: {
    totalSkills: number;
    avgTrustScore: number;
    totalTerms: number;
  };
  stageLatencies: Record<
    string,
    { avgMs: number; minMs: number; maxMs: number; samples: number }
  >;
}

export async function fetchQualityMetrics(
  organizationId: string,
): Promise<ApiResponse<QualityMetrics>> {
  const res = await fetch(`${API_BASE}/quality`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<QualityMetrics>>;
}

export interface KpiMetrics {
  organizationId: string;
  period: { startDate: string; endDate: string };
  kpi: {
    documentsUploaded: number;
    extractionsCompleted: number;
    policiesGenerated: number;
    policiesApproved: number;
    skillsPackaged: number;
    avgPipelineDurationMs: number;
  };
}

export async function fetchKpiMetrics(
  organizationId: string,
): Promise<ApiResponse<KpiMetrics>> {
  const params = new URLSearchParams({ organizationId });
  const res = await fetch(`${API_BASE}/kpi?${params.toString()}`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<KpiMetrics>>;
}

export interface CostTierMetrics {
  inputTokens: number;
  outputTokens: number;
  requests: number;
  cachedRequests: number;
}

export interface CostMetrics {
  period: { startDate: string; endDate: string };
  byTier: Record<string, CostTierMetrics>;
  total: { inputTokens: number; outputTokens: number; requests: number };
}

export async function fetchCostMetrics(
  organizationId: string,
): Promise<ApiResponse<CostMetrics>> {
  const res = await fetch(`${API_BASE}/cost`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<CostMetrics>>;
}
