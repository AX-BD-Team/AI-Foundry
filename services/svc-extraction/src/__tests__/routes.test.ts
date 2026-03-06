import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleExtract } from "../routes/extract.js";
import type { Env } from "../env.js";

// ── Mock LLM caller ──────────────────────────────────────────────

vi.mock("../llm/caller.js", () => ({
  callLlm: vi.fn().mockResolvedValue(
    JSON.stringify({
      processes: [{ name: "퇴직연금 신청", description: "신청 절차", steps: ["접수", "심사", "승인"] }],
      entities: [
        { name: "퇴직연금계좌", type: "account", attributes: ["계좌번호", "잔액"] },
        { name: "가입자", type: "person", attributes: ["이름", "주민번호"] },
      ],
      relationships: [
        { from: "가입자", to: "퇴직연금계좌", type: "소유" },
      ],
      rules: [
        { condition: "가입기간 >= 10년", outcome: "일시금 수령 가능", domain: "pension" },
      ],
    }),
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────

function mockDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: {
  firstResult?: Record<string, unknown> | null;
  allResults?: Record<string, unknown>[];
}): Env {
  const db = dbOverrides
    ? {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
            first: vi.fn().mockResolvedValue(dbOverrides.firstResult ?? null),
            all: vi.fn().mockResolvedValue({ results: dbOverrides.allResults ?? [] }),
          }),
        }),
      } as unknown as D1Database
    : mockDb();

  return {
    DB_EXTRACTION: db,
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    SECURITY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { allowed: true } }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    LLM_ROUTER: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { content: "{}" } }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    SVC_INGESTION: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ chunks: [] }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-extraction",
    INTERNAL_API_SECRET: "test-secret",
    R2_SPEC_PACKAGES: {} as unknown as R2Bucket,
  };
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

function jsonReq(body: unknown): Request {
  return new Request("https://test.internal/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── handleExtract ────────────────────────────────────────────────

describe("handleExtract", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = mockEnv();
    ctx = mockCtx();
    vi.clearAllMocks();
  });

  it("returns 400 for non-JSON body", async () => {
    const req = new Request("https://test.internal/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json{",
    });
    const res = await handleExtract(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("valid JSON");
  });

  it("returns 400 when documentId is missing", async () => {
    const res = await handleExtract(
      jsonReq({ chunks: ["chunk1"] }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("documentId");
  });

  it("returns 400 when organizationId is missing", async () => {
    const res = await handleExtract(
      jsonReq({ documentId: "doc-1", chunks: ["text"] }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("organizationId");
  });

  it("returns 400 when chunks is empty", async () => {
    const res = await handleExtract(
      jsonReq({ documentId: "doc-1", organizationId: "org-1", chunks: [] }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("non-empty array");
  });

  it("returns 400 when chunks is not an array", async () => {
    const res = await handleExtract(
      jsonReq({ documentId: "doc-1", organizationId: "org-1", chunks: "not-array" }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("non-empty array");
  });

  it("creates extraction successfully with valid input", async () => {
    const res = await handleExtract(
      jsonReq({
        documentId: "doc-1",
        organizationId: "org-1",
        chunks: ["퇴직연금 설계서 내용"],
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: { extractionId: string; status: string; processNodeCount: number; entityCount: number };
    };
    expect(body.success).toBe(true);
    expect(body.data.extractionId).toBeDefined();
    expect(body.data.status).toBe("completed");
    // 1 process + 1 relationship = 2 process nodes
    expect(body.data.processNodeCount).toBe(2);
    // 2 entities
    expect(body.data.entityCount).toBe(2);
  });

  it("inserts pending record before extraction", async () => {
    await handleExtract(
      jsonReq({ documentId: "doc-1", organizationId: "org-1", chunks: ["text"] }),
      env,
      ctx,
    );
    const prepareMock = env.DB_EXTRACTION.prepare as ReturnType<typeof vi.fn>;
    const insertCalls = prepareMock.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO extractions"),
    );
    expect(insertCalls.length).toBeGreaterThan(0);
  });

  it("emits extraction.completed event via queue send", async () => {
    await handleExtract(
      jsonReq({ documentId: "doc-1", organizationId: "org-1", chunks: ["text"] }),
      env,
      ctx,
    );
    const sendMock = env.QUEUE_PIPELINE.send as ReturnType<typeof vi.fn>;
    expect(sendMock).toHaveBeenCalledOnce();
    const sentEvent = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sentEvent["type"]).toBe("extraction.completed");
  });

  it("uses default tier of sonnet", async () => {
    const { callLlm } = await import("../llm/caller.js");
    await handleExtract(
      jsonReq({ documentId: "doc-1", organizationId: "org-1", chunks: ["text"] }),
      env,
      ctx,
    );
    expect(callLlm).toHaveBeenCalledWith(
      expect.any(String),
      "sonnet",
      env.LLM_ROUTER,
      env.INTERNAL_API_SECRET,
    );
  });

  it("respects tier override from request", async () => {
    const { callLlm } = await import("../llm/caller.js");
    await handleExtract(
      jsonReq({ documentId: "doc-1", organizationId: "org-1", chunks: ["text"], tier: "haiku" }),
      env,
      ctx,
    );
    expect(callLlm).toHaveBeenCalledWith(
      expect.any(String),
      "haiku",
      env.LLM_ROUTER,
      env.INTERNAL_API_SECRET,
    );
  });

  it("handles non-JSON LLM response gracefully", async () => {
    const { callLlm } = await import("../llm/caller.js");
    (callLlm as ReturnType<typeof vi.fn>).mockResolvedValueOnce("not valid json at all");

    const res = await handleExtract(
      jsonReq({ documentId: "doc-1", organizationId: "org-1", chunks: ["text"] }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: { processNodeCount: number; entityCount: number };
    };
    expect(body.success).toBe(true);
    // Empty parsed result
    expect(body.data.processNodeCount).toBe(0);
    expect(body.data.entityCount).toBe(0);
  });

  it("marks extraction as failed when LLM throws", async () => {
    const { callLlm } = await import("../llm/caller.js");
    (callLlm as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("LLM timeout"));

    const res = await handleExtract(
      jsonReq({ documentId: "doc-1", organizationId: "org-1", chunks: ["text"] }),
      env,
      ctx,
    );
    expect(res.status).toBe(500);
    // Failed status update is done via ctx.waitUntil (error path only)
    expect(ctx.waitUntil).toHaveBeenCalled();
  });
});

// ── index.ts router ──────────────────────────────────────────────

describe("svc-extraction router (index.ts)", () => {
  let worker: ExportedHandler<Env>;

  beforeEach(async () => {
    const module = await import("../index.js");
    worker = module.default;
    vi.clearAllMocks();
  });

  it("returns health check without auth", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = new Request("https://test.internal/health");
     
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("svc-extraction");
  });

  it("returns 401 without X-Internal-Secret", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = new Request("https://test.internal/extract", { method: "POST" });
     
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong X-Internal-Secret", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = new Request("https://test.internal/extract", {
      method: "POST",
      headers: { "X-Internal-Secret": "wrong" },
    });
     
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown routes", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = new Request("https://test.internal/unknown", {
      headers: { "X-Internal-Secret": "test-secret" },
    });
     
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(404);
  });

  it("GET /extractions returns empty list when no documentId", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = new Request("https://test.internal/extractions", {
      headers: { "X-Internal-Secret": "test-secret" },
    });
     
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { extractions: unknown[] } };
    expect(body.data.extractions).toEqual([]);
  });

  it("GET /extractions?documentId=x queries database", async () => {
    const env = mockEnv({
      allResults: [
        {
          id: "ext-1",
          document_id: "doc-1",
          status: "completed",
          process_node_count: 3,
          entity_count: 5,
          created_at: "2026-02-28T00:00:00.000Z",
          updated_at: "2026-02-28T01:00:00.000Z",
        },
      ],
    });
    const ctx = mockCtx();
    const req = new Request("https://test.internal/extractions?documentId=doc-1", {
      headers: { "X-Internal-Secret": "test-secret" },
    });
     
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: { extractions: Array<{ extractionId: string; status: string; processNodeCount: number }> };
    };
    expect(body.data.extractions).toHaveLength(1);
    expect(body.data.extractions[0]?.extractionId).toBe("ext-1");
    expect(body.data.extractions[0]?.status).toBe("completed");
    expect(body.data.extractions[0]?.processNodeCount).toBe(3);
  });

  it("GET /extractions/:id returns extraction details", async () => {
    const env = mockEnv({
      firstResult: {
        id: "ext-1",
        document_id: "doc-1",
        status: "completed",
        process_node_count: 3,
        entity_count: 2,
        result_json: JSON.stringify({ processes: [{ name: "test" }] }),
        created_at: "2026-02-28T00:00:00.000Z",
        updated_at: "2026-02-28T01:00:00.000Z",
      },
    });
    const ctx = mockCtx();
    const req = new Request("https://test.internal/extractions/ext-1", {
      headers: { "X-Internal-Secret": "test-secret" },
    });
     
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: { extractionId: string; result: { processes: unknown[] } };
    };
    expect(body.data.extractionId).toBe("ext-1");
    expect(body.data.result.processes).toHaveLength(1);
  });

  it("GET /extractions/:id returns 404 when not found", async () => {
    const env = mockEnv({ firstResult: null });
    const ctx = mockCtx();
    const req = new Request("https://test.internal/extractions/ext-999", {
      headers: { "X-Internal-Secret": "test-secret" },
    });
     
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(404);
  });

  it("GET /extractions/:id handles null result_json", async () => {
    const env = mockEnv({
      firstResult: {
        id: "ext-2",
        document_id: "doc-2",
        status: "pending",
        process_node_count: null,
        entity_count: null,
        result_json: null,
        created_at: "2026-02-28T00:00:00.000Z",
        updated_at: "2026-02-28T00:00:00.000Z",
      },
    });
    const ctx = mockCtx();
    const req = new Request("https://test.internal/extractions/ext-2", {
      headers: { "X-Internal-Secret": "test-secret" },
    });
     
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: { result: unknown; processNodeCount: number; entityCount: number };
    };
    expect(body.data.result).toBeNull();
    expect(body.data.processNodeCount).toBe(0);
    expect(body.data.entityCount).toBe(0);
  });
});
