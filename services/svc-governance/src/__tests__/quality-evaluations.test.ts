import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleCreateQualityEvaluation,
  handleListQualityEvaluations,
  handleQualityEvaluationsSummary,
} from "../routes/quality-evaluations.js";
import type { Env } from "../env.js";

function mockDb(overrides?: { allResults?: Record<string, unknown>[] }) {
  const allFn = vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] });
  return {
    prepare: vi.fn().mockReturnValue({
      all: allFn,
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        all: allFn,
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_GOVERNANCE: mockDb(dbOverrides),
    KV_PROMPTS: { get: vi.fn(), put: vi.fn() } as unknown as KVNamespace,
    SECURITY: { fetch: vi.fn() } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-governance",
    INTERNAL_API_SECRET: "test-secret",
  };
}

const VALID_EVALUATION = {
  targetType: "document" as const,
  targetId: "doc-123",
  dimension: "parsing_accuracy" as const,
  score: 0.92,
  evaluator: "expert-1",
  notes: "Good parsing quality",
};

describe("handleCreateQualityEvaluation", () => {
  let env: Env;
  beforeEach(() => { env = mockEnv(); });

  it("returns 201 for valid evaluation", async () => {
    const req = new Request("https://test.internal/quality-evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_EVALUATION),
    });
    const res = await handleCreateQualityEvaluation(req, env);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; data: { evaluationId: string } };
    expect(body.success).toBe(true);
    expect(body.data.evaluationId).toBeDefined();
  });

  it("returns 400 for invalid score (> 1)", async () => {
    const req = new Request("https://test.internal/quality-evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_EVALUATION, score: 1.5 }),
    });
    const res = await handleCreateQualityEvaluation(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid dimension", async () => {
    const req = new Request("https://test.internal/quality-evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_EVALUATION, dimension: "invalid" }),
    });
    const res = await handleCreateQualityEvaluation(req, env);
    expect(res.status).toBe(400);
  });

  it("accepts optional batchId", async () => {
    const req = new Request("https://test.internal/quality-evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_EVALUATION, batchId: "batch-001" }),
    });
    const res = await handleCreateQualityEvaluation(req, env);
    expect(res.status).toBe(201);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("https://test.internal/quality-evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await handleCreateQualityEvaluation(req, env);
    expect(res.status).toBe(400);
  });

  it("returns all fields in the created evaluation response", async () => {
    const req = new Request("https://test.internal/quality-evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_EVALUATION),
    });
    const res = await handleCreateQualityEvaluation(req, env);
    const body = (await res.json()) as { data: {
      evaluationId: string;
      targetType: string;
      targetId: string;
      dimension: string;
      score: number;
      evaluator: string;
      notes: string | null;
      createdAt: string;
    }};
    expect(body.data.evaluationId).toMatch(/^qe-/);
    expect(body.data.targetType).toBe("document");
    expect(body.data.targetId).toBe("doc-123");
    expect(body.data.dimension).toBe("parsing_accuracy");
    expect(body.data.score).toBe(0.92);
    expect(body.data.evaluator).toBe("expert-1");
    expect(body.data.notes).toBe("Good parsing quality");
    expect(body.data.createdAt).toBeDefined();
  });

  it("inserts into quality_evaluations table", async () => {
    const req = new Request("https://test.internal/quality-evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_EVALUATION),
    });
    await handleCreateQualityEvaluation(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("INSERT INTO quality_evaluations");
  });

  it("returns 400 for score below 0", async () => {
    const req = new Request("https://test.internal/quality-evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_EVALUATION, score: -0.1 }),
    });
    const res = await handleCreateQualityEvaluation(req, env);
    expect(res.status).toBe(400);
  });

  it("accepts boundary score values 0 and 1", async () => {
    for (const score of [0, 1]) {
      const freshEnv = mockEnv();
      const req = new Request("https://test.internal/quality-evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_EVALUATION, score }),
      });
      const res = await handleCreateQualityEvaluation(req, freshEnv);
      expect(res.status).toBe(201);
    }
  });

  it("returns null notes when omitted", async () => {
    const { notes: _, ...payloadWithoutNotes } = VALID_EVALUATION;
    const req = new Request("https://test.internal/quality-evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadWithoutNotes),
    });
    const res = await handleCreateQualityEvaluation(req, env);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { notes: string | null } };
    expect(body.data.notes).toBeNull();
  });
});

describe("handleListQualityEvaluations", () => {
  it("returns empty list", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/quality-evaluations");
    const res = await handleListQualityEvaluations(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it("applies targetType filter", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/quality-evaluations?targetType=document");
    await handleListQualityEvaluations(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("target_type = ?");
  });

  it("applies batchId filter", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/quality-evaluations?batchId=batch-001");
    await handleListQualityEvaluations(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("batch_id = ?");
  });
});

describe("handleQualityEvaluationsSummary", () => {
  it("returns aggregated summary", async () => {
    const env = mockEnv({
      allResults: [
        { target_type: "document", dimension: "parsing_accuracy", count: 5, avg_score: 0.85, min_score: 0.7, max_score: 0.95 },
      ],
    });
    const req = new Request("https://test.internal/quality-evaluations/summary");
    const res = await handleQualityEvaluationsSummary(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: Array<{ target_type: string }> };
    expect(body.data).toHaveLength(1);
  });

  it("applies batchId filter for summary", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/quality-evaluations/summary?batchId=batch-001");
    await handleQualityEvaluationsSummary(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("WHERE batch_id = ?");
  });

  it("groups by target_type and dimension", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/quality-evaluations/summary");
    await handleQualityEvaluationsSummary(req, env);
    const prepareMock = env.DB_GOVERNANCE.prepare as ReturnType<typeof vi.fn>;
    const sql = prepareMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("GROUP BY target_type, dimension");
  });
});
