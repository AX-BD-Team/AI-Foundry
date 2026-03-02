import { describe, it, expect, vi } from "vitest";
import { handleGetQuality } from "../routes/quality.js";
import type { Env } from "../env.js";

function mockDb(overrides?: {
  firstResult?: Record<string, unknown> | null;
  allResults?: Record<string, unknown>[];
}) {
  const allFn = vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] });
  return {
    prepare: vi.fn().mockReturnValue({
      all: allFn,
      first: vi.fn().mockResolvedValue(overrides?.firstResult ?? null),
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(overrides?.firstResult ?? null),
        all: allFn,
        run: vi.fn().mockResolvedValue({ success: true }),
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
    INTERNAL_API_SECRET: "test-secret",
  };
}

describe("handleGetQuality", () => {
  it("returns 200 with zero metrics when no data", async () => {
    const env = mockEnv({ firstResult: null, allResults: [] });
    const req = new Request("https://test.internal/quality");
    const res = await handleGetQuality(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { parsing: { totalDocuments: number } } };
    expect(body.success).toBe(true);
    expect(body.data.parsing.totalDocuments).toBe(0);
  });

  it("computes parsing metrics correctly", async () => {
    const env = mockEnv({
      firstResult: {
        ingestion_count: 10, total_chunks: 50, total_valid_chunks: 45,
        total_parse_duration_ms: 5000, extraction_count: 0, total_rule_count: 0,
        total_extract_duration_ms: 0, policy_candidate_count: 0,
        policy_approved_count: 0, policy_modified_count: 0, total_trust_score: 0,
        skill_count: 0, total_skill_trust_score: 0, total_skill_term_count: 0,
      },
      allResults: [],
    });
    const req = new Request("https://test.internal/quality");
    const res = await handleGetQuality(req, env);
    const body = (await res.json()) as {
      data: { parsing: { totalDocuments: number; chunkValidityRate: number; avgChunksPerDoc: number; avgParseDurationMs: number } };
    };
    expect(body.data.parsing.totalDocuments).toBe(10);
    expect(body.data.parsing.chunkValidityRate).toBe(90);
    expect(body.data.parsing.avgChunksPerDoc).toBe(5);
    expect(body.data.parsing.avgParseDurationMs).toBe(500);
  });

  it("computes extraction metrics correctly", async () => {
    const env = mockEnv({
      firstResult: {
        ingestion_count: 0, total_chunks: 0, total_valid_chunks: 0,
        total_parse_duration_ms: 0, extraction_count: 8, total_rule_count: 40,
        total_extract_duration_ms: 16000, policy_candidate_count: 0,
        policy_approved_count: 0, policy_modified_count: 0, total_trust_score: 0,
        skill_count: 0, total_skill_trust_score: 0, total_skill_term_count: 0,
      },
      allResults: [],
    });
    const req = new Request("https://test.internal/quality");
    const res = await handleGetQuality(req, env);
    const body = (await res.json()) as {
      data: { extraction: { totalExtractions: number; totalRules: number; avgRulesPerExtraction: number; avgExtractionDurationMs: number } };
    };
    expect(body.data.extraction.totalExtractions).toBe(8);
    expect(body.data.extraction.totalRules).toBe(40);
    expect(body.data.extraction.avgRulesPerExtraction).toBe(5);
    expect(body.data.extraction.avgExtractionDurationMs).toBe(2000);
  });

  it("computes policy metrics correctly", async () => {
    const env = mockEnv({
      firstResult: {
        ingestion_count: 0, total_chunks: 0, total_valid_chunks: 0,
        total_parse_duration_ms: 0, extraction_count: 0, total_rule_count: 0,
        total_extract_duration_ms: 0, policy_candidate_count: 20,
        policy_approved_count: 15, policy_modified_count: 3, total_trust_score: 12.75,
        skill_count: 0, total_skill_trust_score: 0, total_skill_term_count: 0,
      },
      allResults: [],
    });
    const req = new Request("https://test.internal/quality");
    const res = await handleGetQuality(req, env);
    const body = (await res.json()) as {
      data: { policy: { candidateCount: number; approvedCount: number; modifiedCount: number; approvalRate: number; modificationRate: number; avgTrustScore: number } };
    };
    expect(body.data.policy.candidateCount).toBe(20);
    expect(body.data.policy.approvedCount).toBe(15);
    expect(body.data.policy.approvalRate).toBe(75);
    expect(body.data.policy.modifiedCount).toBe(3);
    expect(body.data.policy.modificationRate).toBe(20);
    expect(body.data.policy.avgTrustScore).toBe(0.85);
  });

  it("uses query params for filtering", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/quality?organizationId=org-002&startDate=2024-01-01&endDate=2024-12-31");
    await handleGetQuality(req, env);
    const prepareMock = env.DB_ANALYTICS.prepare as ReturnType<typeof vi.fn>;
    expect(prepareMock).toHaveBeenCalled();
  });

  it("includes stageLatencies in response", async () => {
    const env = mockEnv({
      firstResult: {
        ingestion_count: 0, total_chunks: 0, total_valid_chunks: 0,
        total_parse_duration_ms: 0, extraction_count: 0, total_rule_count: 0,
        total_extract_duration_ms: 0, policy_candidate_count: 0,
        policy_approved_count: 0, policy_modified_count: 0, total_trust_score: 0,
        skill_count: 0, total_skill_trust_score: 0, total_skill_term_count: 0,
      },
      allResults: [
        { stage: "ingestion", avg_ms: 1200, min_ms: 800, max_ms: 2000, samples: 5 },
        { stage: "extraction", avg_ms: 3500, min_ms: 2000, max_ms: 5000, samples: 3 },
      ],
    });
    const req = new Request("https://test.internal/quality");
    const res = await handleGetQuality(req, env);
    const body = (await res.json()) as {
      data: { stageLatencies: Record<string, { avgMs: number; minMs: number; maxMs: number; samples: number }> };
    };
    expect(body.data.stageLatencies["ingestion"]).toEqual({
      avgMs: 1200, minMs: 800, maxMs: 2000, samples: 5,
    });
    expect(body.data.stageLatencies["extraction"]).toEqual({
      avgMs: 3500, minMs: 2000, maxMs: 5000, samples: 3,
    });
  });
});
