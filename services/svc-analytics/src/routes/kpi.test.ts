import { describe, it, expect, vi } from "vitest";
import { handleGetKpi, handleGetCost, handleGetDashboard } from "./kpi.js";
import type { Env } from "../env.js";

interface ApiOk<T> { success: true; data: T }

function mockDb(overrides?: {
  firstResult?: Record<string, unknown> | null;
  allResults?: Record<string, unknown>[];
}) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(overrides?.firstResult ?? null),
        all: vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_ANALYTICS: mockDb(dbOverrides),
    SECURITY: { fetch: vi.fn() } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-analytics",
    INTERNAL_API_SECRET: "test",
  };
}

// ── handleGetKpi ─────────────────────────────────────────────────

describe("handleGetKpi", () => {
  it("returns zero KPIs when no data", async () => {
    const env = mockEnv({ firstResult: null });
    const req = new Request("https://test.internal/kpi?organizationId=org-1");
    const res = await handleGetKpi(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{
      organizationId: string;
      kpi: { documentsUploaded: number };
    }>;
    expect(body.data.organizationId).toBe("org-1");
    expect(body.data.kpi.documentsUploaded).toBe(0);
  });

  it("returns aggregated KPIs", async () => {
    const env = mockEnv({
      firstResult: {
        documents_uploaded: 42,
        extractions_completed: 40,
        policies_generated: 35,
        policies_approved: 30,
        skills_packaged: 28,
        avg_pipeline_duration_ms: 45000,
      },
    });
    const req = new Request("https://test.internal/kpi");
    const res = await handleGetKpi(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{
      kpi: {
        documentsUploaded: number;
        policiesApproved: number;
        skillsPackaged: number;
      };
    }>;
    expect(body.data.kpi.documentsUploaded).toBe(42);
    expect(body.data.kpi.policiesApproved).toBe(30);
    expect(body.data.kpi.skillsPackaged).toBe(28);
  });

  it("uses default date range when not provided", async () => {
    const env = mockEnv({ firstResult: null });
    const req = new Request("https://test.internal/kpi");
    const res = await handleGetKpi(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ period: { startDate: string; endDate: string } }>;
    expect(body.data.period.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.data.period.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── handleGetCost ────────────────────────────────────────────────

describe("handleGetCost", () => {
  it("returns empty cost when no data", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/cost");
    const res = await handleGetCost(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ byTier: Record<string, unknown>; total: { requests: number } }>;
    expect(body.data.byTier).toEqual({});
    expect(body.data.total.requests).toBe(0);
  });

  it("returns cost breakdown by tier", async () => {
    const env = mockEnv({
      allResults: [
        { date: "2026-02-28", tier: "haiku", total_input_tokens: 10000, total_output_tokens: 5000, total_requests: 50, cached_requests: 10 },
        { date: "2026-02-28", tier: "opus", total_input_tokens: 50000, total_output_tokens: 25000, total_requests: 20, cached_requests: 5 },
      ],
    });
    const req = new Request("https://test.internal/cost?startDate=2026-02-01&endDate=2026-02-28");
    const res = await handleGetCost(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{
      byTier: Record<string, { inputTokens: number; requests: number }>;
      total: { inputTokens: number; requests: number };
    }>;
    expect(body.data.byTier["haiku"]?.inputTokens).toBe(10000);
    expect(body.data.byTier["opus"]?.requests).toBe(20);
    expect(body.data.total.inputTokens).toBe(60000);
    expect(body.data.total.requests).toBe(70);
  });
});

// ── handleGetDashboard ───────────────────────────────────────────

describe("handleGetDashboard", () => {
  it("returns empty dashboard when no data", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/dashboards");
    const res = await handleGetDashboard(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{
      pipeline: unknown[];
      cost: unknown[];
      topSkills: unknown[];
    }>;
    expect(body.data.pipeline).toEqual([]);
    expect(body.data.cost).toEqual([]);
    expect(body.data.topSkills).toEqual([]);
  });

  it("returns dashboard with pipeline data", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn()
            .mockResolvedValueOnce({
              results: [{
                date: "2026-02-28",
                documents_uploaded: 5,
                extractions_completed: 4,
                policies_generated: 3,
                policies_approved: 2,
                skills_packaged: 1,
              }],
            })
            .mockResolvedValueOnce({ results: [] })
            .mockResolvedValueOnce({ results: [] }),
        }),
      }),
    } as unknown as D1Database;

    const env: Env = {
      DB_ANALYTICS: db,
      SECURITY: { fetch: vi.fn() } as unknown as Fetcher,
      ENVIRONMENT: "development",
      SERVICE_NAME: "svc-analytics",
      INTERNAL_API_SECRET: "test",
    };

    const req = new Request("https://test.internal/dashboards?organizationId=org-1");
    const res = await handleGetDashboard(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{
      organizationId: string;
      pipeline: Array<{ documentsUploaded: number }>;
    }>;
    expect(body.data.organizationId).toBe("org-1");
    expect(body.data.pipeline).toHaveLength(1);
    expect(body.data.pipeline[0]?.documentsUploaded).toBe(5);
  });
});
