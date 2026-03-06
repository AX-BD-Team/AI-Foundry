import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const FACTCHECK_API_BASE =
  (import.meta.env["VITE_FACTCHECK_API_BASE"] as string | undefined) ?? "/api";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId, contentType: "application/json" });
}

function headersNoContentType(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId });
}

// --- Local Types ---

export interface FactCheckResult {
  resultId: string;
  organizationId: string;
  specType: "api" | "table" | string;
  sourceDocumentIds: string[];
  docDocumentIds: string[];
  totalSourceItems: number;
  totalDocItems: number;
  matchedItems: number;
  gapCount: number;
  coveragePct: number;
  gapsByType: Record<string, number>;
  gapsBySeverity: Record<string, number>;
  status: "pending" | "completed" | "failed";
  errorMessage?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FactCheckGap {
  gapId: string;
  resultId: string;
  organizationId: string;
  gapType: "SM" | "MC" | "PM" | "TM" | "MID";
  severity: "HIGH" | "MEDIUM" | "LOW";
  sourceItem: string;
  sourceDocumentId?: string;
  documentItem?: string | null;
  documentId?: string | null;
  description: string;
  evidence?: string | null;
  autoResolved: boolean;
  reviewStatus: "pending" | "confirmed" | "dismissed" | "modified";
  reviewerId?: string | null;
  reviewerComment?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface FactCheckSummary {
  organizationId: string;
  resultCount: number;
  totalSourceItems: number;
  totalDocItems: number;
  totalMatchedItems: number;
  totalGaps: number;
  overallCoveragePct: number;
  lastCheckAt: string | null;
}

export interface FactCheckKpi {
  apiCoverage: number;
  apiCoverageTarget: number;
  apiCoveragePass: boolean;
  tableCoverage: number;
  tableCoverageTarget: number;
  tableCoveragePass: boolean;
  gapPrecision: number;
  gapPrecisionTarget: number;
  gapPrecisionPass: boolean;
  reviewerAcceptance: number;
  reviewerAcceptanceTarget: number;
  reviewerAcceptancePass: boolean;
  specEditTimeReduction: number;
  specEditTimeReductionTarget: number;
  specEditTimeReductionPass: boolean;
  apiDetail?: { sourceApis: number; documentApis: number; matchedApis: number };
  tableDetail?: { sourceTables: number; documentTables: number; matchedTables: number };
  gapDetail?: { totalGaps: number; confirmedGaps: number; dismissedGaps: number; pendingGaps: number };
  computedAt?: string;
}

// --- API Functions ---

export async function triggerFactCheck(
  organizationId: string,
  body: { documentId?: string; sourceDocumentId?: string },
): Promise<ApiResponse<{ resultId: string; status: string }>> {
  const res = await fetch(`${FACTCHECK_API_BASE}/factcheck`, {
    method: "POST",
    headers: headers(organizationId),
    body: JSON.stringify(body),
  });
  return res.json() as Promise<ApiResponse<{ resultId: string; status: string }>>;
}

export async function fetchResults(
  organizationId: string,
): Promise<ApiResponse<{ results: FactCheckResult[] }>> {
  const res = await fetch(`${FACTCHECK_API_BASE}/factcheck/results`, {
    headers: headersNoContentType(organizationId),
  });
  return res.json() as Promise<ApiResponse<{ results: FactCheckResult[] }>>;
}

export async function fetchResult(
  organizationId: string,
  resultId: string,
): Promise<ApiResponse<FactCheckResult>> {
  const res = await fetch(`${FACTCHECK_API_BASE}/factcheck/${resultId}`, {
    headers: headersNoContentType(organizationId),
  });
  return res.json() as Promise<ApiResponse<FactCheckResult>>;
}

export async function fetchGaps(
  organizationId: string,
  resultId: string,
  filters?: { type?: string; severity?: string; reviewStatus?: string },
): Promise<ApiResponse<{ gaps: FactCheckGap[] }>> {
  const qs = new URLSearchParams();
  if (filters?.type) qs.set("type", filters.type);
  if (filters?.severity) qs.set("severity", filters.severity);
  if (filters?.reviewStatus) qs.set("review_status", filters.reviewStatus);
  const query = qs.toString();
  const url = `${FACTCHECK_API_BASE}/factcheck/${resultId}/gaps${query ? `?${query}` : ""}`;
  const res = await fetch(url, {
    headers: headersNoContentType(organizationId),
  });
  return res.json() as Promise<ApiResponse<{ gaps: FactCheckGap[] }>>;
}

export async function fetchReport(
  organizationId: string,
  resultId: string,
): Promise<ApiResponse<{ markdown: string }>> {
  const res = await fetch(`${FACTCHECK_API_BASE}/factcheck/${resultId}/report`, {
    headers: headersNoContentType(organizationId),
  });
  return res.json() as Promise<ApiResponse<{ markdown: string }>>;
}

export async function reviewGap(
  organizationId: string,
  gapId: string,
  body: { action: "confirm" | "dismiss" | "modify"; comment?: string },
): Promise<ApiResponse<{ gapId: string; reviewStatus: string }>> {
  const res = await fetch(`${FACTCHECK_API_BASE}/factcheck/gaps/${gapId}/review`, {
    method: "POST",
    headers: headers(organizationId),
    body: JSON.stringify(body),
  });
  return res.json() as Promise<ApiResponse<{ gapId: string; reviewStatus: string }>>;
}

export async function triggerLlmMatch(
  organizationId: string,
  resultId: string,
): Promise<ApiResponse<{ resultId: string; status: string }>> {
  const res = await fetch(`${FACTCHECK_API_BASE}/factcheck/results/${resultId}/llm-match`, {
    method: "POST",
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<{ resultId: string; status: string }>>;
}

export async function fetchSummary(
  organizationId: string,
): Promise<ApiResponse<FactCheckSummary>> {
  const res = await fetch(`${FACTCHECK_API_BASE}/factcheck/summary`, {
    headers: headersNoContentType(organizationId),
  });
  return res.json() as Promise<ApiResponse<FactCheckSummary>>;
}

export async function fetchKpi(
  organizationId: string,
): Promise<ApiResponse<FactCheckKpi>> {
  const res = await fetch(`${FACTCHECK_API_BASE}/factcheck/kpi`, {
    headers: headersNoContentType(organizationId),
  });
  return res.json() as Promise<ApiResponse<FactCheckKpi>>;
}
