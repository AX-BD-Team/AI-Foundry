import type { ApiResponse } from "@ai-foundry/types";
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

export interface TermRow {
  termId: string;
  ontologyId: string;
  label: string;
  definition: string | null;
  skosUri: string;
  broaderTermId: string | null;
  embeddingModel: string | null;
  createdAt: string;
}

export async function fetchTerms(
  organizationId: string,
  params?: {
    ontologyId?: string;
    limit?: number;
    offset?: number;
  },
): Promise<ApiResponse<{ terms: TermRow[]; limit: number; offset: number }>> {
  const qs = new URLSearchParams();
  if (params !== undefined) {
    if (params.ontologyId !== undefined) qs.set("ontologyId", params.ontologyId);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
  }
  const query = qs.toString();
  const res = await fetch(
    `${API_BASE}/terms${query ? `?${query}` : ""}`,
    { headers: headers(organizationId) },
  );
  return res.json() as Promise<
    ApiResponse<{ terms: TermRow[]; limit: number; offset: number }>
  >;
}

export async function fetchTerm(
  organizationId: string,
  id: string,
): Promise<ApiResponse<TermRow>> {
  const res = await fetch(`${API_BASE}/terms/${id}`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<TermRow>>;
}

export interface GraphResult {
  columns: string[];
  rows: unknown[][];
  query: string;
}

export async function fetchGraph(
  organizationId: string,
  query?: string,
): Promise<ApiResponse<GraphResult>> {
  const qs = new URLSearchParams();
  if (query !== undefined) qs.set("query", query);
  const q = qs.toString();
  const res = await fetch(
    `${API_BASE}/graph${q ? `?${q}` : ""}`,
    { headers: headers(organizationId) },
  );
  return res.json() as Promise<ApiResponse<GraphResult>>;
}
