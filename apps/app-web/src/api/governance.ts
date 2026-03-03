import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const USER_ID = "exec-001";
const USER_ROLE = "Executive";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({
    organizationId,
    userId: USER_ID,
    userRole: USER_ROLE,
    contentType: "application/json",
  });
}

export interface CostSummary {
  totalRequests: number;
  totalTokens: number;
  estimatedCost: number;
  byTier: Record<string, { requests: number; tokens: number; cost: number }>;
  byService: Record<string, { requests: number; tokens: number; cost: number }>;
  period: string;
}

export async function fetchCostSummary(
  organizationId: string,
): Promise<ApiResponse<CostSummary>> {
  const res = await fetch(`${API_BASE}/cost`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<CostSummary>>;
}

export interface TrustData {
  byTargetType: Record<string, Record<string, { count: number; avgScore: number }>>;
  totalEvaluations: number;
}

export async function fetchTrust(
  organizationId: string,
): Promise<ApiResponse<TrustData>> {
  const res = await fetch(`${API_BASE}/trust`, {
    headers: headers(organizationId),
  });
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

export async function fetchHitlStats(
  organizationId: string,
): Promise<ApiResponse<HitlStats>> {
  const res = await fetch(`${API_BASE}/policies/hitl/stats`, {
    headers: headers(organizationId),
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
  organizationId: string,
  days = 30,
): Promise<ApiResponse<QualityTrend>> {
  const res = await fetch(
    `${API_BASE}/policies/quality-trend?days=${days}`,
    { headers: headers(organizationId) },
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

export async function fetchGoldenTests(
  organizationId: string,
): Promise<ApiResponse<GoldenTestData>> {
  const res = await fetch(`${API_BASE}/golden-tests`, {
    headers: headers(organizationId),
  });
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

export async function fetchReasoningAnalysis(
  organizationId: string,
): Promise<ApiResponse<ReasoningAnalysis>> {
  const res = await fetch(`${API_BASE}/policies/reasoning-analysis`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<ReasoningAnalysis>>;
}
