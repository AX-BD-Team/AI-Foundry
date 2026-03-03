import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const USER_ID = "exec-001";
const USER_ROLE = "Executive";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({
    organizationId,
    userId: USER_ID,
    userRole: USER_ROLE,
    contentType: "application/json",
  });
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
