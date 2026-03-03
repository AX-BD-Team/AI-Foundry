import type { ApiResponse, HitlAction } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId, contentType: "application/json" });
}

export interface PolicyRow {
  policyId: string;
  extractionId: string;
  policyCode: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  status: "candidate" | "approved" | "rejected";
  sourceDocumentId: string;
  sourcePageRef?: string;
  sourceExcerpt?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HitlSession {
  status: string;
  policyId: string;
  reviewerId?: string;
  actions: HitlAction[];
  openedAt: string;
  completedAt?: string;
}

export async function fetchPolicies(
  organizationId: string,
  params?: {
    status?: string;
    limit?: number;
    offset?: number;
  },
): Promise<ApiResponse<{ policies: PolicyRow[]; total: number }>> {
  const qs = new URLSearchParams();
  if (params !== undefined) {
    if (params.status !== undefined) qs.set("status", params.status);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
  }
  const query = qs.toString();
  const res = await fetch(
    `${API_BASE}/policies${query ? `?${query}` : ""}`,
    { headers: headers(organizationId) },
  );
  return res.json() as Promise<
    ApiResponse<{ policies: PolicyRow[]; total: number }>
  >;
}

export async function fetchPolicy(
  organizationId: string,
  policyId: string,
): Promise<ApiResponse<PolicyRow>> {
  const res = await fetch(`${API_BASE}/policies/${policyId}`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<PolicyRow>>;
}

export async function approvePolicy(
  organizationId: string,
  policyId: string,
  body: { reviewerId: string; comment?: string },
): Promise<ApiResponse<{ policyId: string; status: "approved" }>> {
  const res = await fetch(`${API_BASE}/policies/${policyId}/approve`, {
    method: "POST",
    headers: headers(organizationId),
    body: JSON.stringify(body),
  });
  return res.json() as Promise<
    ApiResponse<{ policyId: string; status: "approved" }>
  >;
}

export async function modifyPolicy(
  organizationId: string,
  policyId: string,
  body: {
    reviewerId: string;
    comment?: string;
    modifiedFields: Record<string, string>;
  },
): Promise<ApiResponse<{ policyId: string; status: "approved" }>> {
  const res = await fetch(`${API_BASE}/policies/${policyId}/modify`, {
    method: "POST",
    headers: headers(organizationId),
    body: JSON.stringify(body),
  });
  return res.json() as Promise<
    ApiResponse<{ policyId: string; status: "approved" }>
  >;
}

export async function rejectPolicy(
  organizationId: string,
  policyId: string,
  body: { reviewerId: string; comment?: string },
): Promise<ApiResponse<{ policyId: string; status: "rejected" }>> {
  const res = await fetch(`${API_BASE}/policies/${policyId}/reject`, {
    method: "POST",
    headers: headers(organizationId),
    body: JSON.stringify(body),
  });
  return res.json() as Promise<
    ApiResponse<{ policyId: string; status: "rejected" }>
  >;
}

export async function fetchSession(
  organizationId: string,
  sessionId: string,
): Promise<ApiResponse<HitlSession>> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<HitlSession>>;
}
