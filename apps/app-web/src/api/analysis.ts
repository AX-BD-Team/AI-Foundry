import type {
  ApiResponse,
  ExtractionSummary,
  CoreIdentification,
  DiagnosisResult,
  DiagnosisFinding,
  CrossOrgComparison,
} from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const USER_ID = "analyst-001";
const USER_ROLE = "Analyst";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({
    organizationId,
    userId: USER_ID,
    userRole: USER_ROLE,
    contentType: "application/json",
  });
}

export async function fetchAnalysisSummary(
  organizationId: string,
  documentId: string,
): Promise<ApiResponse<ExtractionSummary>> {
  const res = await fetch(`${API_BASE}/analysis/${documentId}/summary`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<ExtractionSummary>>;
}

export async function fetchCoreProcesses(
  organizationId: string,
  documentId: string,
): Promise<ApiResponse<CoreIdentification>> {
  const res = await fetch(
    `${API_BASE}/analysis/${documentId}/core-processes`,
    { headers: headers(organizationId) },
  );
  return res.json() as Promise<ApiResponse<CoreIdentification>>;
}

export async function fetchFindings(
  organizationId: string,
  documentId: string,
): Promise<ApiResponse<DiagnosisResult>> {
  const res = await fetch(`${API_BASE}/analysis/${documentId}/findings`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<DiagnosisResult>>;
}

export async function fetchFinding(
  organizationId: string,
  documentId: string,
  findingId: string,
): Promise<ApiResponse<DiagnosisFinding>> {
  const res = await fetch(
    `${API_BASE}/analysis/${documentId}/findings/${findingId}`,
    { headers: headers(organizationId) },
  );
  return res.json() as Promise<ApiResponse<DiagnosisFinding>>;
}

export async function reviewFinding(
  organizationId: string,
  documentId: string,
  findingId: string,
  body: { action: "accept" | "reject" | "modify"; comment?: string },
): Promise<ApiResponse<{ findingId: string; status: string }>> {
  const res = await fetch(
    `${API_BASE}/analysis/${documentId}/findings/${findingId}/review`,
    {
      method: "POST",
      headers: headers(organizationId),
      body: JSON.stringify(body),
    },
  );
  return res.json() as Promise<
    ApiResponse<{ findingId: string; status: string }>
  >;
}

import type { LlmProvider } from "@ai-foundry/types";
export type { LlmProvider };
export type LlmTier = "sonnet" | "haiku";

export async function triggerAnalysis(
  organizationId: string,
  body: {
    documentId: string;
    extractionId: string;
    organizationId: string;
    preferredProvider?: LlmProvider;
    preferredTier?: LlmTier;
  },
): Promise<ApiResponse<{ analysisId: string; status: string }>> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: headers(organizationId),
    body: JSON.stringify({ ...body, mode: "diagnosis-sync" }),
  });
  return res.json() as Promise<
    ApiResponse<{ analysisId: string; status: string }>
  >;
}

// ── Cross-Org Comparison ─────────────────────────────────────────────

export interface OrganizationSummary {
  organizationId: string;
  analysisCount: number;
  totalProcesses: number;
  lastAnalysisAt: string;
}

export async function fetchOrganizations(
  organizationId: string,
): Promise<ApiResponse<{ organizations: OrganizationSummary[] }>> {
  const res = await fetch(`${API_BASE}/analysis/organizations`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<
    ApiResponse<{ organizations: OrganizationSummary[] }>
  >;
}

export async function triggerComparison(
  organizationId: string,
  body: {
    organizationIds: string[];
    domain?: string;
  },
): Promise<ApiResponse<CrossOrgComparison>> {
  const res = await fetch(`${API_BASE}/analysis/compare`, {
    method: "POST",
    headers: headers(organizationId),
    body: JSON.stringify(body),
  });
  return res.json() as Promise<ApiResponse<CrossOrgComparison>>;
}

export async function fetchStandardization(
  organizationId: string,
  comparisonId: string,
): Promise<
  ApiResponse<{
    candidates: Array<{
      name: string;
      score: number;
      orgsInvolved: string[];
      note: string;
    }>;
  }>
> {
  const res = await fetch(
    `${API_BASE}/analysis/compare/${comparisonId}/standardization`,
    { headers: headers(organizationId) },
  );
  return res.json() as Promise<
    ApiResponse<{
      candidates: Array<{
        name: string;
        score: number;
        orgsInvolved: string[];
        note: string;
      }>;
    }>
  >;
}
