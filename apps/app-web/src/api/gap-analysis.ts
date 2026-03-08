import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_EXTRACTION_API_BASE"] as string | undefined) ?? "/api";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId });
}

// --- Types ---

export interface PerspectiveItem {
  name: string;
  source: "document" | "code" | "both";
  status: "matched" | "gap-in-doc" | "gap-in-code" | "mismatch";
  severity: "HIGH" | "MEDIUM" | "LOW";
  detail?: string;
  documentId?: string;
}

export interface PerspectiveSummary {
  asIsCount: number;
  toBeCount: number;
  matchedCount: number;
  gapCount: number;
  coveragePct: number;
  items: PerspectiveItem[];
}

export interface FindingSummary {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  topFindings: Array<{
    findingId: string;
    type: string;
    severity: string;
    finding: string;
    recommendation: string;
  }>;
}

export interface SourceStats {
  controllerCount: number;
  endpointCount: number;
  tableCount: number;
  mapperCount: number;
  transactionCount: number;
}

export interface GapOverview {
  organizationId: string;
  perspectives: {
    process: PerspectiveSummary;
    architecture: PerspectiveSummary;
    api: PerspectiveSummary;
    table: PerspectiveSummary;
  };
  findings: FindingSummary;
  sourceStats: SourceStats;
  generatedAt: string;
}

// --- API ---

export async function fetchGapOverview(
  organizationId: string,
): Promise<ApiResponse<GapOverview>> {
  const res = await fetch(`${API_BASE}/gap-analysis/overview`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<GapOverview>>;
}
