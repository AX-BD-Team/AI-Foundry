import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGetQualityTrend } from "../routes/quality-trend.js";
import { handleGetReasoningAnalysis } from "../routes/reasoning.js";
import type { Env } from "../env.js";

// ── Mock helpers ────────────────────────────────────────────────────

function mockDb(overrides?: {
  allResults?: Record<string, unknown>[];
}) {
  const allFn = vi
    .fn()
    .mockResolvedValue({ results: overrides?.allResults ?? [] });
  return {
    prepare: vi.fn().mockReturnValue({
      all: allFn,
      bind: vi.fn().mockReturnValue({
        all: allFn,
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_POLICY: mockDb(dbOverrides),
    SECURITY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { allowed: true } }),
          { status: 200 },
        ),
      ),
    } as unknown as Fetcher,
    LLM_ROUTER: { fetch: vi.fn() } as unknown as Fetcher,
    NOTIFICATION: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_EXTRACTION: { fetch: vi.fn() } as unknown as Fetcher,
    QUEUE_PIPELINE: {
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue,
    HITL_SESSION: {
      idFromName: vi.fn(),
      get: vi.fn(),
    } as unknown as DurableObjectNamespace,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-policy",
    INTERNAL_API_SECRET: "test-secret",
  };
}

// ── handleGetQualityTrend ──────────────────────────────────────────

describe("handleGetQualityTrend", () => {
  let env: Env;

  beforeEach(() => {
    env = mockEnv();
  });

  it("returns empty trend with default 30 days when no data", async () => {
    const req = new Request("https://test.internal/policies/quality-trend");
    const res = await handleGetQualityTrend(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { days: number; trend: unknown[] };
    };
    expect(body.success).toBe(true);
    expect(body.data.days).toBe(30);
    expect(body.data.trend).toHaveLength(0);
  });

  it("respects custom days query parameter", async () => {
    const req = new Request(
      "https://test.internal/policies/quality-trend?days=7",
    );
    const res = await handleGetQualityTrend(req, env);
    const body = (await res.json()) as { data: { days: number } };
    expect(body.data.days).toBe(7);
  });

  it("caps days at 90", async () => {
    const req = new Request(
      "https://test.internal/policies/quality-trend?days=365",
    );
    const res = await handleGetQualityTrend(req, env);
    const body = (await res.json()) as { data: { days: number } };
    expect(body.data.days).toBe(90);
  });

  it("defaults to 30 when days is non-numeric", async () => {
    const req = new Request(
      "https://test.internal/policies/quality-trend?days=abc",
    );
    const res = await handleGetQualityTrend(req, env);
    const body = (await res.json()) as { data: { days: number } };
    expect(body.data.days).toBe(30);
  });

  it("returns mapped trend data with aiAccuracy and hitlAccuracy", async () => {
    const dbRows = [
      { day: "2026-03-01", ai_avg: 0.756, hitl_avg: 0.923 },
      { day: "2026-03-02", ai_avg: 0.812, hitl_avg: null },
    ];
    const envWithData = mockEnv({
      allResults: dbRows as unknown as Record<string, unknown>[],
    });
    const req = new Request("https://test.internal/policies/quality-trend");
    const res = await handleGetQualityTrend(req, envWithData);
    const body = (await res.json()) as {
      data: {
        trend: Array<{
          date: string;
          aiAccuracy: number;
          hitlAccuracy: number;
        }>;
      };
    };
    expect(body.data.trend).toHaveLength(2);

    const first = body.data.trend[0]!;
    expect(first.date).toBe("2026-03-01");
    expect(first.aiAccuracy).toBe(76); // Math.round(0.756 * 100)
    expect(first.hitlAccuracy).toBe(92); // Math.round(0.923 * 100)

    const second = body.data.trend[1]!;
    expect(second.date).toBe("2026-03-02");
    expect(second.aiAccuracy).toBe(81); // Math.round(0.812 * 100)
    expect(second.hitlAccuracy).toBe(0); // null → 0
  });

  it("binds days parameter to the SQL query", async () => {
    const req = new Request(
      "https://test.internal/policies/quality-trend?days=14",
    );
    await handleGetQualityTrend(req, env);
    const prepareMock = env.DB_POLICY.prepare as ReturnType<typeof vi.fn>;
    expect(prepareMock).toHaveBeenCalledOnce();
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("policies");
    expect(sql).toContain("GROUP BY");
  });

  it("handles ai_avg as null (no policies on that day)", async () => {
    const dbRows = [{ day: "2026-03-03", ai_avg: null, hitl_avg: null }];
    const envWithData = mockEnv({
      allResults: dbRows as unknown as Record<string, unknown>[],
    });
    const req = new Request("https://test.internal/policies/quality-trend");
    const res = await handleGetQualityTrend(req, envWithData);
    const body = (await res.json()) as {
      data: {
        trend: Array<{ aiAccuracy: number; hitlAccuracy: number }>;
      };
    };
    expect(body.data.trend[0]?.aiAccuracy).toBe(0);
    expect(body.data.trend[0]?.hitlAccuracy).toBe(0);
  });
});

// ── handleGetReasoningAnalysis ─────────────────────────────────────

describe("handleGetReasoningAnalysis", () => {
  let env: Env;

  beforeEach(() => {
    env = mockEnv();
  });

  it("returns empty analysis when no policies exist", async () => {
    const req = new Request(
      "https://test.internal/policies/reasoning-analysis",
    );
    const res = await handleGetReasoningAnalysis(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        conflicts: unknown[];
        gaps: unknown[];
        similarGroups: unknown[];
        totalPoliciesAnalyzed: number;
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.conflicts).toHaveLength(0);
    expect(body.data.totalPoliciesAnalyzed).toBe(0);
  });

  it("detects gaps for uncovered expected areas", async () => {
    // No policies at all → all 5 expected areas should be gaps
    const req = new Request(
      "https://test.internal/policies/reasoning-analysis",
    );
    const res = await handleGetReasoningAnalysis(req, env);
    const body = (await res.json()) as {
      data: {
        gaps: Array<{ area: string; severity: string; description: string }>;
      };
    };
    expect(body.data.gaps.length).toBe(5);
    const areas = body.data.gaps.map((g) => g.area);
    expect(areas).toContain("중도인출");
    expect(areas).toContain("해지");
    expect(areas).toContain("이전");
    expect(areas).toContain("수급");
    expect(areas).toContain("가입");
    // All gaps should have medium severity
    for (const gap of body.data.gaps) {
      expect(gap.severity).toBe("medium");
    }
  });

  it("marks area as covered when a policy title matches", async () => {
    const policies = [
      {
        policy_id: "p1",
        policy_code: "POL-001",
        title: "중도인출 조건",
        condition: "가입자가 무주택자",
        outcome: "허용",
        status: "approved",
        organization_id: "org-1",
      },
    ];
    const envWithPolicies = mockEnv({
      allResults: policies as unknown as Record<string, unknown>[],
    });
    const req = new Request(
      "https://test.internal/policies/reasoning-analysis",
    );
    const res = await handleGetReasoningAnalysis(req, envWithPolicies);
    const body = (await res.json()) as {
      data: { gaps: Array<{ area: string }> };
    };
    // "중도인출" should NOT be in gaps
    const areas = body.data.gaps.map((g) => g.area);
    expect(areas).not.toContain("중도인출");
    // "가입" is also covered because condition "가입자가 무주택자" contains "가입"
    expect(areas).not.toContain("가입");
    // Remaining 3 areas still uncovered: 해지, 이전, 수급
    expect(body.data.gaps.length).toBe(3);
  });

  it("detects conflicts: similar conditions with different outcomes", async () => {
    const policies = [
      {
        policy_id: "p1",
        policy_code: "POL-001",
        title: "Policy A",
        condition: "가입자 무주택 5년 경과 DC형",
        outcome: "허용",
        status: "approved",
        organization_id: "org-1",
      },
      {
        policy_id: "p2",
        policy_code: "POL-002",
        title: "Policy B",
        condition: "가입자 무주택 5년 경과 DC형",
        outcome: "거부",
        status: "approved",
        organization_id: "org-2",
      },
    ];
    const envWithConflicts = mockEnv({
      allResults: policies as unknown as Record<string, unknown>[],
    });
    const req = new Request(
      "https://test.internal/policies/reasoning-analysis",
    );
    const res = await handleGetReasoningAnalysis(req, envWithConflicts);
    const body = (await res.json()) as {
      data: {
        conflicts: Array<{
          policyA: string;
          policyB: string;
          reason: string;
        }>;
      };
    };
    expect(body.data.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(body.data.conflicts[0]?.policyA).toBe("POL-001");
    expect(body.data.conflicts[0]?.policyB).toBe("POL-002");
  });

  it("does not flag conflict when conditions differ significantly", async () => {
    const policies = [
      {
        policy_id: "p1",
        policy_code: "POL-001",
        title: "Policy A",
        condition: "가입자 무주택 요건 충족",
        outcome: "허용",
        status: "approved",
        organization_id: "org-1",
      },
      {
        policy_id: "p2",
        policy_code: "POL-002",
        title: "Policy B",
        condition: "의료비 관련 서류 제출 완료 확인",
        outcome: "거부",
        status: "approved",
        organization_id: "org-2",
      },
    ];
    const envNoConflict = mockEnv({
      allResults: policies as unknown as Record<string, unknown>[],
    });
    const req = new Request(
      "https://test.internal/policies/reasoning-analysis",
    );
    const res = await handleGetReasoningAnalysis(req, envNoConflict);
    const body = (await res.json()) as {
      data: { conflicts: unknown[] };
    };
    expect(body.data.conflicts).toHaveLength(0);
  });

  it("groups similar policies by keyword across organizations", async () => {
    const policies = [
      {
        policy_id: "p1",
        policy_code: "POL-001",
        title: "중도인출 조건 A",
        condition: "중도인출 무주택",
        outcome: "허용",
        status: "approved",
        organization_id: "org-1",
      },
      {
        policy_id: "p2",
        policy_code: "POL-002",
        title: "중도인출 조건 B",
        condition: "중도인출 의료비",
        outcome: "허용",
        status: "approved",
        organization_id: "org-2",
      },
    ];
    const envWithSimilar = mockEnv({
      allResults: policies as unknown as Record<string, unknown>[],
    });
    const req = new Request(
      "https://test.internal/policies/reasoning-analysis",
    );
    const res = await handleGetReasoningAnalysis(req, envWithSimilar);
    const body = (await res.json()) as {
      data: {
        similarGroups: Array<{
          keyword: string;
          policies: Array<{ code: string; title: string }>;
        }>;
      };
    };
    const midoinchul = body.data.similarGroups.find(
      (g) => g.keyword === "중도인출",
    );
    expect(midoinchul).toBeDefined();
    expect(midoinchul!.policies).toHaveLength(2);
  });

  it("does not create a similar group when only one policy matches keyword", async () => {
    const policies = [
      {
        policy_id: "p1",
        policy_code: "POL-001",
        title: "해지 조건",
        condition: "해지 요청",
        outcome: "허용",
        status: "approved",
        organization_id: "org-1",
      },
    ];
    const envSingle = mockEnv({
      allResults: policies as unknown as Record<string, unknown>[],
    });
    const req = new Request(
      "https://test.internal/policies/reasoning-analysis",
    );
    const res = await handleGetReasoningAnalysis(req, envSingle);
    const body = (await res.json()) as {
      data: { similarGroups: unknown[] };
    };
    // Need >=2 for a similar group
    const haeji = (
      body.data.similarGroups as Array<{ keyword: string }>
    ).find((g) => g.keyword === "해지");
    expect(haeji).toBeUndefined();
  });

  it("returns correct totalPoliciesAnalyzed count", async () => {
    const policies = Array.from({ length: 5 }, (_, i) => ({
      policy_id: `p${i}`,
      policy_code: `POL-00${i}`,
      title: `Policy ${i}`,
      condition: `condition ${i}`,
      outcome: "허용",
      status: "approved",
      organization_id: "org-1",
    }));
    const envWithPolicies = mockEnv({
      allResults: policies as unknown as Record<string, unknown>[],
    });
    const req = new Request(
      "https://test.internal/policies/reasoning-analysis",
    );
    const res = await handleGetReasoningAnalysis(req, envWithPolicies);
    const body = (await res.json()) as {
      data: { totalPoliciesAnalyzed: number };
    };
    expect(body.data.totalPoliciesAnalyzed).toBe(5);
  });

  it("queries policies with ORDER BY and LIMIT 200", async () => {
    const req = new Request(
      "https://test.internal/policies/reasoning-analysis",
    );
    await handleGetReasoningAnalysis(req, env);
    const prepareMock = env.DB_POLICY.prepare as ReturnType<typeof vi.fn>;
    expect(prepareMock).toHaveBeenCalledOnce();
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("ORDER BY created_at DESC");
    expect(sql).toContain("LIMIT 200");
  });
});
