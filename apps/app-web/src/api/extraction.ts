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

export interface ExtractionRow {
  extractionId: string;
  documentId: string;
  status: "pending" | "completed" | "failed";
  processNodeCount: number;
  entityCount: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface ExtractionDetail extends ExtractionRow {
  result: {
    processes: { name: string; description: string; steps: string[] }[];
    entities: { name: string; type: string; attributes: string[] }[];
    relationships: { from: string; to: string; type: string }[];
    rules: { condition: string; outcome: string; domain: string }[];
  } | null;
}

export async function fetchExtractions(
  organizationId: string,
  documentId: string,
): Promise<ApiResponse<{ extractions: ExtractionRow[] }>> {
  const qs = new URLSearchParams({ documentId });
  const res = await fetch(`${API_BASE}/extractions?${qs.toString()}`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<
    ApiResponse<{ extractions: ExtractionRow[] }>
  >;
}

export async function fetchExtraction(
  organizationId: string,
  id: string,
): Promise<ApiResponse<ExtractionDetail>> {
  const res = await fetch(`${API_BASE}/extractions/${id}`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<ExtractionDetail>>;
}
