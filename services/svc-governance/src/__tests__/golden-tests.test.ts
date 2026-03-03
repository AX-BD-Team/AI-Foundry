import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGetGoldenTests } from "../routes/golden-tests.js";
import type { Env } from "../env.js";

// ── Mock helpers ────────────────────────────────────────────────────

function mockDb(overrides?: {
  recentRunsResults?: Record<string, unknown>[];
  byStageResults?: Record<string, unknown>[];
}) {
  // handleGetGoldenTests calls db.prepare().all() twice via Promise.all.
  // First call: recent runs, second call: by stage aggregation.
  let callCount = 0;
  return {
    prepare: vi.fn().mockReturnValue({
      all: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            results: overrides?.recentRunsResults ?? [],
          });
        }
        return Promise.resolve({
          results: overrides?.byStageResults ?? [],
        });
      }),
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_GOVERNANCE: mockDb(dbOverrides),
    KV_PROMPTS: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace,
    SECURITY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { allowed: true } }),
          { status: 200 },
        ),
      ),
    } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-governance",
    INTERNAL_API_SECRET: "test-secret",
  };
}

// ── handleGetGoldenTests ───────────────────────────────────────────

describe("handleGetGoldenTests", () => {
  let env: Env;

  beforeEach(() => {
    env = mockEnv();
  });

  it("returns 200 with empty data when no prompt versions exist", async () => {
    const req = new Request("https://test.internal/golden-tests");
    const res = await handleGetGoldenTests(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        latestScore: number;
        latestRunAt: string | null;
        passed: boolean;
        recentRuns: number[];
        breakdown: unknown[];
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.latestScore).toBe(0);
    expect(body.data.latestRunAt).toBeNull();
    expect(body.data.passed).toBe(false);
    expect(body.data.recentRuns).toHaveLength(0);
    expect(body.data.breakdown).toHaveLength(0);
  });

  it("computes overall pass rate as latestScore", async () => {
    const recentRuns = [
      {
        prompt_version_id: "pv-1",
        prompt_name: "extraction",
        version: "1.0.0",
        stage: "extraction",
        golden_test_passed: 1,
        created_at: "2026-03-03T10:00:00Z",
      },
      {
        prompt_version_id: "pv-2",
        prompt_name: "policy",
        version: "1.0.0",
        stage: "policy",
        golden_test_passed: 0,
        created_at: "2026-03-02T10:00:00Z",
      },
      {
        prompt_version_id: "pv-3",
        prompt_name: "ontology",
        version: "1.0.0",
        stage: "ontology",
        golden_test_passed: 1,
        created_at: "2026-03-01T10:00:00Z",
      },
    ];
    const envWithRuns = mockEnv({
      recentRunsResults: recentRuns as unknown as Record<string, unknown>[],
    });
    const req = new Request("https://test.internal/golden-tests");
    const res = await handleGetGoldenTests(req, envWithRuns);
    const body = (await res.json()) as {
      data: { latestScore: number; passed: boolean; latestRunAt: string };
    };
    // 2 passed out of 3 = 0.67
    expect(body.data.latestScore).toBe(0.67);
    expect(body.data.passed).toBe(true); // Latest run passed
    expect(body.data.latestRunAt).toBe("2026-03-03T10:00:00Z");
  });

  it("returns recentRuns as array of 1.0/0.0 scores (max 5)", async () => {
    const recentRuns = Array.from({ length: 8 }, (_, i) => ({
      prompt_version_id: `pv-${i}`,
      prompt_name: `prompt-${i}`,
      version: "1.0.0",
      stage: "extraction",
      golden_test_passed: i % 2 === 0 ? 1 : 0,
      created_at: `2026-03-0${i + 1}T10:00:00Z`,
    }));
    const envWithManyRuns = mockEnv({
      recentRunsResults: recentRuns as unknown as Record<string, unknown>[],
    });
    const req = new Request("https://test.internal/golden-tests");
    const res = await handleGetGoldenTests(req, envWithManyRuns);
    const body = (await res.json()) as {
      data: { recentRuns: number[] };
    };
    // Only first 5 runs
    expect(body.data.recentRuns).toHaveLength(5);
    // First is passed (index 0 → golden_test_passed=1 → 1.0)
    expect(body.data.recentRuns[0]).toBe(1.0);
    expect(body.data.recentRuns[1]).toBe(0.0);
  });

  it("returns breakdown by stage with pass rates", async () => {
    const byStage = [
      { stage: "extraction", total: 10, passed: 8 },
      { stage: "policy", total: 5, passed: 3 },
      { stage: "ontology", total: 4, passed: 4 },
    ];
    const envWithStages = mockEnv({
      byStageResults: byStage as unknown as Record<string, unknown>[],
    });
    const req = new Request("https://test.internal/golden-tests");
    const res = await handleGetGoldenTests(req, envWithStages);
    const body = (await res.json()) as {
      data: {
        breakdown: Array<{ name: string; score: number }>;
      };
    };
    expect(body.data.breakdown).toHaveLength(3);
    const extraction = body.data.breakdown.find(
      (b) => b.name === "extraction",
    );
    expect(extraction?.score).toBe(0.8); // 8/10
    const policy = body.data.breakdown.find((b) => b.name === "policy");
    expect(policy?.score).toBe(0.6); // 3/5
    const ontology = body.data.breakdown.find((b) => b.name === "ontology");
    expect(ontology?.score).toBe(1.0); // 4/4
  });

  it("handles stage with zero total gracefully", async () => {
    const byStage = [{ stage: "empty-stage", total: 0, passed: 0 }];
    const envWithEmpty = mockEnv({
      byStageResults: byStage as unknown as Record<string, unknown>[],
    });
    const req = new Request("https://test.internal/golden-tests");
    const res = await handleGetGoldenTests(req, envWithEmpty);
    const body = (await res.json()) as {
      data: { breakdown: Array<{ name: string; score: number }> };
    };
    const empty = body.data.breakdown.find((b) => b.name === "empty-stage");
    expect(empty?.score).toBe(0);
  });

  it("sets passed=false when latest run has golden_test_passed=0", async () => {
    const recentRuns = [
      {
        prompt_version_id: "pv-1",
        prompt_name: "extraction",
        version: "1.0.0",
        stage: "extraction",
        golden_test_passed: 0,
        created_at: "2026-03-03T10:00:00Z",
      },
    ];
    const envFailed = mockEnv({
      recentRunsResults: recentRuns as unknown as Record<string, unknown>[],
    });
    const req = new Request("https://test.internal/golden-tests");
    const res = await handleGetGoldenTests(req, envFailed);
    const body = (await res.json()) as { data: { passed: boolean } };
    expect(body.data.passed).toBe(false);
  });

  it("queries prompt_versions table", async () => {
    const req = new Request("https://test.internal/golden-tests");
    await handleGetGoldenTests(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    // Two prepare calls (recent runs + by stage)
    expect(prepareMock).toHaveBeenCalledTimes(2);
    const sql1 = prepareMock.mock.calls[0]?.[0] as string;
    const sql2 = prepareMock.mock.calls[1]?.[0] as string;
    expect(sql1).toContain("prompt_versions");
    expect(sql2).toContain("GROUP BY stage");
  });

  it("returns 100% latestScore when all runs passed", async () => {
    const recentRuns = [
      {
        prompt_version_id: "pv-1",
        prompt_name: "a",
        version: "1.0.0",
        stage: "extraction",
        golden_test_passed: 1,
        created_at: "2026-03-03T10:00:00Z",
      },
      {
        prompt_version_id: "pv-2",
        prompt_name: "b",
        version: "1.0.0",
        stage: "policy",
        golden_test_passed: 1,
        created_at: "2026-03-02T10:00:00Z",
      },
    ];
    const envAllPassed = mockEnv({
      recentRunsResults: recentRuns as unknown as Record<string, unknown>[],
    });
    const req = new Request("https://test.internal/golden-tests");
    const res = await handleGetGoldenTests(req, envAllPassed);
    const body = (await res.json()) as { data: { latestScore: number } };
    expect(body.data.latestScore).toBe(1);
  });
});
