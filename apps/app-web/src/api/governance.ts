import type { ApiResponse } from "@ai-foundry/types";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const HEADERS = {
  "Content-Type": "application/json",
  "X-Internal-Secret":
    (import.meta.env["VITE_INTERNAL_SECRET"] as string | undefined) ??
    "dev-secret",
  "X-User-Id": "exec-001",
  "X-User-Role": "Executive",
  "X-Organization-Id": "org-001",
};

export interface CostSummary {
  totalRequests: number;
  totalTokens: number;
  estimatedCost: number;
  byTier: Record<string, { requests: number; tokens: number; cost: number }>;
  byService: Record<string, { requests: number; tokens: number; cost: number }>;
  period: string;
}

export async function fetchCostSummary(): Promise<ApiResponse<CostSummary>> {
  const res = await fetch(`${API_BASE}/cost`, { headers: HEADERS });
  return res.json() as Promise<ApiResponse<CostSummary>>;
}

export interface TrustData {
  byTargetType: Record<string, Record<string, { count: number; avgScore: number }>>;
  totalEvaluations: number;
}

export async function fetchTrust(): Promise<ApiResponse<TrustData>> {
  const res = await fetch(`${API_BASE}/trust`, { headers: HEADERS });
  return res.json() as Promise<ApiResponse<TrustData>>;
}

// --- HITL Stats (Trust Dashboard → HitlOperationsCard) ---

export interface HitlStats {
  completionRate: number;
  editRate: number;
  rejectionRate: number;
  avgReviewTimeLabel: string;
  weeklyCompleted: number;
  weeklyTotal: number;
  reviewers: Array<{
    name: string;
    count: number;
    avgTime: string;
    editRate: number;
  }>;
}

export async function fetchHitlStats(): Promise<ApiResponse<HitlStats>> {
  const res = await fetch(`${API_BASE}/policies/hitl/stats`, {
    headers: HEADERS,
  });
  return res.json() as Promise<ApiResponse<HitlStats>>;
}

// --- Quality Trend (Trust Dashboard → PolicyQualityChart) ---

export interface QualityTrendItem {
  date: string;
  aiAccuracy: number;
  hitlAccuracy: number;
}

export interface QualityTrend {
  days: number;
  trend: QualityTrendItem[];
}

export async function fetchQualityTrend(
  days = 30,
): Promise<ApiResponse<QualityTrend>> {
  const res = await fetch(
    `${API_BASE}/policies/quality-trend?days=${days}`,
    { headers: HEADERS },
  );
  return res.json() as Promise<ApiResponse<QualityTrend>>;
}

// --- Golden Tests (Trust Dashboard → GoldenTestCard) ---

export interface GoldenTestData {
  latestScore: number;
  latestRunAt: string | null;
  passed: boolean;
  recentRuns: number[];
  breakdown: Array<{ name: string; score: number }>;
}

export async function fetchGoldenTests(): Promise<
  ApiResponse<GoldenTestData>
> {
  const res = await fetch(`${API_BASE}/golden-tests`, { headers: HEADERS });
  return res.json() as Promise<ApiResponse<GoldenTestData>>;
}

// --- Reasoning Analysis (Trust Dashboard → ReasoningEngineCard) ---

export interface ReasoningAnalysis {
  conflicts: Array<{
    policyA: string;
    policyB: string;
    reason: string;
  }>;
  gaps: Array<{
    area: string;
    description: string;
    severity: "high" | "medium" | "low";
  }>;
  similarGroups: Array<{
    keyword: string;
    policies: Array<{
      code: string;
      title: string;
      organizationId: string;
    }>;
  }>;
  totalPoliciesAnalyzed: number;
}

export async function fetchReasoningAnalysis(): Promise<
  ApiResponse<ReasoningAnalysis>
> {
  const res = await fetch(`${API_BASE}/policies/reasoning-analysis`, {
    headers: HEADERS,
  });
  return res.json() as Promise<ApiResponse<ReasoningAnalysis>>;
}
