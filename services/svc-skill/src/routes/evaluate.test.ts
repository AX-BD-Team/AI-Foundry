import { describe, it, expect, vi } from "vitest";
import { handleEvaluateSkill, handleListEvaluations } from "./evaluate.js";
import type { Env } from "../env.js";

// ── Test fixtures ───────────────────────────────────────────────────

const sampleSkillPackage = {
  $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
  skillId: "sk-001",
  metadata: {
    domain: "퇴직연금",
    language: "ko",
    version: "1.0.0",
    createdAt: "2026-02-28T00:00:00.000Z",
    updatedAt: "2026-02-28T00:00:00.000Z",
    author: "test",
    tags: [],
  },
  policies: [
    {
      code: "POL-PENSION-WD-001",
      title: "주택구입 중도인출",
      condition: "가입자가 무주택자이며 DC형 퇴직연금에 가입한 경우",
      criteria: "무주택 확인서 제출, 가입기간 1년 이상",
      outcome: "적립금의 50% 이내 중도인출 가능",
      source: { documentId: "doc-1" },
      trust: { level: "reviewed", score: 0.85 },
      tags: ["중도인출"],
    },
    {
      code: "POL-PENSION-WD-002",
      title: "의료비 중도인출",
      condition: "본인 또는 부양가족의 6개월 이상 요양이 필요한 경우",
      criteria: "의료비 영수증, 진단서 제출",
      outcome: "적립금의 100% 이내 중도인출 가능",
      source: { documentId: "doc-1" },
      trust: { level: "validated", score: 0.92 },
      tags: ["중도인출", "의료"],
    },
  ],
  trust: { level: "reviewed", score: 0.88 },
  ontologyRef: { graphId: "g-1", termUris: [] },
  provenance: {
    sourceDocumentIds: ["doc-1"],
    organizationId: "org-1",
    extractedAt: "2026-02-28T00:00:00.000Z",
    pipeline: { stages: ["s1"], models: {} },
  },
  adapters: {},
};

const llmSuccessResponse = JSON.stringify({
  result: "APPLICABLE — 가입자 A는 무주택자 조건을 충족합니다.",
  confidence: 0.92,
  reasoning: "1) 무주택자 조건 확인: 충족\n2) DC형 가입: 충족\n3) 가입기간 5년 > 1년: 충족",
});

// ── Mock factories ──────────────────────────────────────────────────

function mockDb(firstResult?: Record<string, unknown> | null) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(firstResult ?? null),
        run: vi.fn().mockResolvedValue({ success: true }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    }),
  } as unknown as D1Database;
}

function mockR2(pkg: unknown) {
  return {
    get: vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue(JSON.stringify(pkg)),
    }),
  } as unknown as R2Bucket;
}

function mockR2Null() {
  return { get: vi.fn().mockResolvedValue(null) } as unknown as R2Bucket;
}

function mockLlmRouter(content: string, provider = "anthropic", model = "claude-sonnet") {
  return {
    fetch: vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ success: true, data: { content, provider, model } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ),
  } as unknown as Fetcher;
}

function mockLlmRouterFail(status = 500) {
  return {
    fetch: vi.fn().mockImplementation(() =>
      Promise.resolve(new Response("LLM error", { status })),
    ),
  } as unknown as Fetcher;
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn() } as unknown as ExecutionContext;
}

function makeRequest(body: unknown): Request {
  return new Request("https://test.local/skills/sk-001/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeEnv(overrides?: Partial<Env>): Env {
  return {
    DB_SKILL: mockDb({ r2_key: "skill-packages/sk-001.skill.json", domain: "퇴직연금" }),
    R2_SKILL_PACKAGES: mockR2(sampleSkillPackage),
    LLM_ROUTER: mockLlmRouter(llmSuccessResponse),
    SECURITY: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_POLICY: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_ONTOLOGY: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_EXTRACTION: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_INGESTION: { fetch: vi.fn() } as unknown as Fetcher,
    KV_SKILL_CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace,
    QUEUE_PIPELINE: {} as unknown as Queue,
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-skill",
    INTERNAL_API_SECRET: "test-secret",
    ...overrides,
  };
}

// ── Tests: handleEvaluateSkill ──────────────────────────────────────

describe("handleEvaluateSkill", () => {
  it("evaluates a policy and returns structured result", async () => {
    const env = makeEnv();
    const ctx = mockCtx();
    const req = makeRequest({
      policyCode: "POL-PENSION-WD-001",
      context: "가입자 A는 무주택자이며 DC형에 5년 가입하였습니다.",
    });

    const res = await handleEvaluateSkill(req, env, "sk-001", ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success: boolean; data: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.data["policyCode"]).toBe("POL-PENSION-WD-001");
    expect(body.data["confidence"]).toBe(0.92);
    expect(body.data["result"]).toContain("APPLICABLE");
    expect(body.data["provider"]).toBe("anthropic");
  });

  it("returns 400 when policyCode is not found in skill", async () => {
    const env = makeEnv();
    const ctx = mockCtx();
    const req = makeRequest({
      policyCode: "POL-UNKNOWN-001",
      context: "some context",
    });

    const res = await handleEvaluateSkill(req, env, "sk-001", ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when context is missing", async () => {
    const env = makeEnv();
    const ctx = mockCtx();
    const req = makeRequest({ policyCode: "POL-PENSION-WD-001" });

    const res = await handleEvaluateSkill(req, env, "sk-001", ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when skill is not found", async () => {
    const env = makeEnv({ DB_SKILL: mockDb(null) });
    const ctx = mockCtx();
    const req = makeRequest({
      policyCode: "POL-PENSION-WD-001",
      context: "test context",
    });

    const res = await handleEvaluateSkill(req, env, "sk-999", ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 when R2 package is missing", async () => {
    const env = makeEnv({ R2_SKILL_PACKAGES: mockR2Null() });
    const ctx = mockCtx();
    const req = makeRequest({
      policyCode: "POL-PENSION-WD-001",
      context: "test context",
    });

    const res = await handleEvaluateSkill(req, env, "sk-001", ctx);
    expect(res.status).toBe(404);
  });

  it("returns 500 when LLM call fails", async () => {
    const env = makeEnv({ LLM_ROUTER: mockLlmRouterFail() });
    const ctx = mockCtx();
    const req = makeRequest({
      policyCode: "POL-PENSION-WD-001",
      context: "test context",
    });

    const res = await handleEvaluateSkill(req, env, "sk-001", ctx);
    expect(res.status).toBe(500);
  });

  it("records evaluation via ctx.waitUntil (non-blocking)", async () => {
    const env = makeEnv();
    const ctx = mockCtx();
    const req = makeRequest({
      policyCode: "POL-PENSION-WD-001",
      context: "test context",
    });

    await handleEvaluateSkill(req, env, "sk-001", ctx);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it("supports provider parameter for specific LLM", async () => {
    const llm = mockLlmRouter(llmSuccessResponse, "openai", "gpt-4.1");
    const env = makeEnv({ LLM_ROUTER: llm });
    const ctx = mockCtx();
    const req = makeRequest({
      policyCode: "POL-PENSION-WD-001",
      context: "test context",
      provider: "openai",
    });

    const res = await handleEvaluateSkill(req, env, "sk-001", ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data["provider"]).toBe("openai");
  });

  it("supports benchmark mode with multiple providers", async () => {
    const llm = mockLlmRouter(llmSuccessResponse);
    const env = makeEnv({ LLM_ROUTER: llm });
    const ctx = mockCtx();
    const req = makeRequest({
      policyCode: "POL-PENSION-WD-001",
      context: "test context",
      benchmark: true,
    });

    const res = await handleEvaluateSkill(req, env, "sk-001", ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        benchmark: boolean;
        results: unknown[];
        consensus: { agreementRate: number; summary: string };
      };
    };
    expect(body.data.benchmark).toBe(true);
    expect(body.data.results).toHaveLength(3);
    expect(body.data.consensus.agreementRate).toBeGreaterThan(0);
  });

  it("supports optional parameters field", async () => {
    const env = makeEnv();
    const ctx = mockCtx();
    const req = makeRequest({
      policyCode: "POL-PENSION-WD-001",
      context: "test context",
      parameters: { age: 45, tenure_years: 5 },
    });

    const res = await handleEvaluateSkill(req, env, "sk-001", ctx);
    expect(res.status).toBe(200);
  });
});

// ── Tests: handleListEvaluations ────────────────────────────────────

describe("handleListEvaluations", () => {
  it("returns evaluation history for a skill", async () => {
    const db = mockDb();
    const env = makeEnv({ DB_SKILL: db });
    const req = new Request("https://test.local/skills/sk-001/evaluations");

    const res = await handleListEvaluations(req, env, "sk-001");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { evaluations: unknown[]; total: number } };
    expect(body.data).toHaveProperty("evaluations");
    expect(body.data).toHaveProperty("total");
  });

  it("supports policyCode and provider filters", async () => {
    const db = mockDb();
    const env = makeEnv({ DB_SKILL: db });
    const req = new Request(
      "https://test.local/skills/sk-001/evaluations?policyCode=POL-PENSION-WD-001&provider=anthropic",
    );

    const res = await handleListEvaluations(req, env, "sk-001");
    expect(res.status).toBe(200);
  });

  it("respects limit and offset pagination", async () => {
    const db = mockDb();
    const env = makeEnv({ DB_SKILL: db });
    const req = new Request(
      "https://test.local/skills/sk-001/evaluations?limit=5&offset=10",
    );

    const res = await handleListEvaluations(req, env, "sk-001");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { limit: number; offset: number } };
    expect(body.data.limit).toBe(5);
    expect(body.data.offset).toBe(10);
  });
});
