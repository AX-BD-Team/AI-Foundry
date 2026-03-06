import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const EXPORT_API_BASE =
  (import.meta.env["VITE_EXPORT_API_BASE"] as string | undefined) ?? "/api";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId, contentType: "application/json" });
}

function headersNoContentType(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId });
}

// --- Local Types ---

export interface ExportPackage {
  packageId: string;
  organizationId: string;
  status: "draft" | "pending_approval" | "approved" | "exported";
  apiSpecCount: number;
  tableSpecCount: number;
  gapCount: number;
  createdAt: string;
  updatedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectReason: string | null;
}

export interface ApprovalLogEntry {
  action: "request" | "approve" | "reject";
  userId: string;
  userName: string;
  comment: string;
  timestamp: string;
}

// --- API Functions ---

export async function createSpecPackage(
  organizationId: string,
  body?: { description?: string },
): Promise<ApiResponse<{ packageId: string; status: string }>> {
  const res = await fetch(`${EXPORT_API_BASE}/export/spec-package`, {
    method: "POST",
    headers: headers(organizationId),
    body: JSON.stringify(body ?? {}),
  });
  return res.json() as Promise<ApiResponse<{ packageId: string; status: string }>>;
}

export async function fetchPackages(
  organizationId: string,
): Promise<ApiResponse<{ packages: ExportPackage[] }>> {
  const res = await fetch(`${EXPORT_API_BASE}/export/packages`, {
    headers: headersNoContentType(organizationId),
  });
  return res.json() as Promise<ApiResponse<{ packages: ExportPackage[] }>>;
}

export async function fetchPackage(
  organizationId: string,
  packageId: string,
): Promise<ApiResponse<ExportPackage>> {
  const res = await fetch(`${EXPORT_API_BASE}/export/${packageId}`, {
    headers: headersNoContentType(organizationId),
  });
  return res.json() as Promise<ApiResponse<ExportPackage>>;
}

export async function downloadApiSpec(
  organizationId: string,
  packageId: string,
): Promise<Blob> {
  const res = await fetch(`${EXPORT_API_BASE}/export/${packageId}/api-spec`, {
    headers: headersNoContentType(organizationId),
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}

export async function downloadTableSpec(
  organizationId: string,
  packageId: string,
): Promise<Blob> {
  const res = await fetch(`${EXPORT_API_BASE}/export/${packageId}/table-spec`, {
    headers: headersNoContentType(organizationId),
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}

export async function downloadReport(
  organizationId: string,
  packageId: string,
): Promise<Blob> {
  const res = await fetch(`${EXPORT_API_BASE}/export/${packageId}/report`, {
    headers: headersNoContentType(organizationId),
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}

export async function downloadSummary(
  organizationId: string,
  packageId: string,
): Promise<Blob> {
  const res = await fetch(`${EXPORT_API_BASE}/export/${packageId}/summary`, {
    headers: headersNoContentType(organizationId),
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}
