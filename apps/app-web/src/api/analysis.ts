import type {
  ApiResponse,
  ExtractionSummary,
  CoreIdentification,
  DiagnosisResult,
  DiagnosisFinding,
  CrossOrgComparison,
} from "@ai-foundry/types";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "X-Internal-Secret":
    (import.meta.env["VITE_INTERNAL_SECRET"] as string | undefined) ??
    "dev-secret",
  "X-User-Id": "analyst-001",
  "X-User-Role": "Analyst",
  "X-Organization-Id": "org-001",
};

export async function fetchAnalysisSummary(
  documentId: string,
): Promise<ApiResponse<ExtractionSummary>> {
  const res = await fetch(`${API_BASE}/analysis/${documentId}/summary`, {
    headers: HEADERS,
  });
  return res.json() as Promise<ApiResponse<ExtractionSummary>>;
}

export async function fetchCoreProcesses(
  documentId: string,
): Promise<ApiResponse<CoreIdentification>> {
  const res = await fetch(
    `${API_BASE}/analysis/${documentId}/core-processes`,
    { headers: HEADERS },
  );
  return res.json() as Promise<ApiResponse<CoreIdentification>>;
}

export async function fetchFindings(
  documentId: string,
): Promise<ApiResponse<DiagnosisResult>> {
  const res = await fetch(`${API_BASE}/analysis/${documentId}/findings`, {
    headers: HEADERS,
  });
  return res.json() as Promise<ApiResponse<DiagnosisResult>>;
}

export async function fetchFinding(
  documentId: string,
  findingId: string,
): Promise<ApiResponse<DiagnosisFinding>> {
  const res = await fetch(
    `${API_BASE}/analysis/${documentId}/findings/${findingId}`,
    { headers: HEADERS },
  );
  return res.json() as Promise<ApiResponse<DiagnosisFinding>>;
}

export async function reviewFinding(
  documentId: string,
  findingId: string,
  body: { action: "accept" | "reject" | "modify"; comment?: string },
): Promise<ApiResponse<{ findingId: string; status: string }>> {
  const res = await fetch(
    `${API_BASE}/analysis/${documentId}/findings/${findingId}/review`,
    {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    },
  );
  return res.json() as Promise<
    ApiResponse<{ findingId: string; status: string }>
  >;
}

export type LlmProvider = "anthropic" | "openai" | "google" | "workers-ai";
export type LlmTier = "sonnet" | "haiku";

export async function triggerAnalysis(body: {
  documentId: string;
  extractionId: string;
  organizationId?: string;
  preferredProvider?: LlmProvider;
  preferredTier?: LlmTier;
}): Promise<ApiResponse<{ analysisId: string; status: string }>> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: HEADERS,
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

export async function fetchOrganizations(): Promise<
  ApiResponse<{ organizations: OrganizationSummary[] }>
> {
  const res = await fetch(`${API_BASE}/analysis/organizations`, {
    headers: HEADERS,
  });
  return res.json() as Promise<
    ApiResponse<{ organizations: OrganizationSummary[] }>
  >;
}

export async function triggerComparison(body: {
  organizationIds: string[];
  domain?: string;
}): Promise<ApiResponse<CrossOrgComparison>> {
  const res = await fetch(`${API_BASE}/analysis/compare`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  return res.json() as Promise<ApiResponse<CrossOrgComparison>>;
}

export async function fetchStandardization(
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
    { headers: HEADERS },
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
