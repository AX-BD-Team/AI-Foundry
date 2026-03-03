import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const USER_ID = "client-001";
const USER_ROLE = "Client";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({
    organizationId,
    userId: USER_ID,
    userRole: USER_ROLE,
    contentType: "application/json",
  });
}

export interface AuditRow {
  audit_id: string;
  user_id: string;
  organization_id: string;
  action: string;
  resource: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  occurred_at: string;
}

export async function fetchAuditLogs(
  organizationId: string,
  params?: {
    userId?: string;
    resource?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  },
): Promise<
  ApiResponse<{
    items: AuditRow[];
    pagination: { page: number; limit: number; total: number };
  }>
> {
  const qs = new URLSearchParams();
  if (params !== undefined) {
    if (params.userId !== undefined) qs.set("userId", params.userId);
    if (params.resource !== undefined) qs.set("resource", params.resource);
    if (params.fromDate !== undefined) qs.set("fromDate", params.fromDate);
    if (params.toDate !== undefined) qs.set("toDate", params.toDate);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
  }
  const query = qs.toString();
  const res = await fetch(
    `${API_BASE}/audit${query ? `?${query}` : ""}`,
    { headers: headers(organizationId) },
  );
  return res.json() as Promise<
    ApiResponse<{
      items: AuditRow[];
      pagination: { page: number; limit: number; total: number };
    }>
  >;
}
