import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const EXTRACTION_API_BASE =
  (import.meta.env["VITE_EXTRACTION_API_BASE"] as string | undefined) ?? "/api/extraction";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId, contentType: "application/json" });
}

function headersNoContentType(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId });
}

// --- Local Types ---

export interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  source: string;
}

export interface FactCheckRef {
  totalGaps: number;
  highGaps: number;
  gapIds: string[];
  coveragePct: number;
}

export interface ApiSpecItem {
  specId: string;
  endpoint: string;
  httpMethod: string;
  sourceLocation: string;
  parameters: ApiParam[];
  responseSchema: Record<string, unknown>;
  documentRef: string;
  factCheck: FactCheckRef;
  confidence: number;
  classification: "core" | "non-core" | "unknown";
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  pk: boolean;
  fk: string | null;
}

export interface TableSpecItem {
  specId: string;
  tableName: string;
  sourceLocation: string;
  columns: TableColumn[];
  documentRef: string;
  factCheck: FactCheckRef;
  confidence: number;
  classification: "core" | "non-core" | "unknown";
}

export interface ClassifiedSpecs {
  apiSpecs: ApiSpecItem[];
  tableSpecs: TableSpecItem[];
  totalApiSpecs: number;
  totalTableSpecs: number;
  coreApiCount: number;
  coreTableCount: number;
}

// --- API Functions ---

export async function classifySpecs(
  organizationId: string,
): Promise<ApiResponse<{ status: string; classified: number }>> {
  const res = await fetch(`${EXTRACTION_API_BASE}/specs/classify`, {
    method: "POST",
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<{ status: string; classified: number }>>;
}

export async function fetchClassified(
  organizationId: string,
  filters?: { classification?: string; search?: string; specType?: string },
): Promise<ApiResponse<ClassifiedSpecs>> {
  const qs = new URLSearchParams();
  if (filters?.classification) qs.set("classification", filters.classification);
  if (filters?.search) qs.set("search", filters.search);
  if (filters?.specType) qs.set("specType", filters.specType);
  const query = qs.toString();
  const url = `${EXTRACTION_API_BASE}/specs/classified${query ? `?${query}` : ""}`;
  const res = await fetch(url, {
    headers: headersNoContentType(organizationId),
  });
  return res.json() as Promise<ApiResponse<ClassifiedSpecs>>;
}
