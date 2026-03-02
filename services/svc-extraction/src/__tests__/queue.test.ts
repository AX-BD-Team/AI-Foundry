import { describe, it, expect, vi, beforeEach } from "vitest";
import { processQueueEvent, handleQueueBatch } from "../queue/handler.js";
import type { Env } from "../env.js";

// ── Mock LLM caller ──────────────────────────────────────────────

vi.mock("../llm/caller.js", () => ({
  callLlm: vi.fn().mockResolvedValue(
    JSON.stringify({
      processes: [{ name: "퇴직연금 신청", description: "처리 절차", steps: ["접수", "심사"] }],
      entities: [{ name: "계좌", type: "account", attributes: ["계좌번호"] }],
      relationships: [{ from: "가입자", to: "계좌", type: "소유" }],
      rules: [{ condition: "가입기간 >= 10년", outcome: "수령 가능", domain: "pension" }],
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

function mockEnv(): Env {
  return {
    DB_EXTRACTION: mockDb(),
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
        new Response(
          JSON.stringify({
            success: true,
            data: {
              documentId: "doc-1",
              chunks: [
                { masked_text: "퇴직연금 가입 조건 및 절차" },
                { masked_text: "중도인출 요건" },
              ],
            },
          }),
          { status: 200 },
        ),
      ),
    } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-extraction",
    INTERNAL_API_SECRET: "test-secret",
  };
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

const validIngestionCompletedEvent = {
  eventId: "550e8400-e29b-41d4-a716-446655440000",
  occurredAt: "2026-02-28T00:00:00.000Z",
  type: "ingestion.completed" as const,
  payload: {
    documentId: "doc-1",
    organizationId: "org-1",
    chunkCount: 5,
    classification: "requirements",
    r2Key: "documents/org-1/doc-1/file.pdf",
  },
};

// ── processQueueEvent ────────────────────────────────────────────

describe("processQueueEvent", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = mockEnv();
    ctx = mockCtx();
    vi.clearAllMocks();
  });

  it("returns 200 with skipped=true for invalid pipeline event", async () => {
    const res = await processQueueEvent({ bad: "data" }, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { skipped: boolean };
    expect(body.skipped).toBe(true);
  });

  it("returns 200 with skipped for non-ingestion.completed events", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440001",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "document.uploaded",
      payload: {
        documentId: "doc-1",
        organizationId: "org-1",
        uploadedBy: "user-1",
        r2Key: "documents/org-1/doc-1/file.pdf",
        fileType: "pdf",
        fileSizeByte: 1024,
        originalName: "file.pdf",
      },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { skipped: boolean; reason: string };
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("not_our_event");
  });

  it("processes ingestion.completed event successfully", async () => {
    const res = await processQueueEvent(validIngestionCompletedEvent, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      extractionId: string;
      processNodeCount: number;
      entityCount: number;
    };
    expect(body.success).toBe(true);
    expect(body.extractionId).toBeDefined();
    // 1 process + 1 relationship = 2
    expect(body.processNodeCount).toBe(2);
    // 1 entity
    expect(body.entityCount).toBe(1);
  });

  it("fetches chunks from svc-ingestion", async () => {
    await processQueueEvent(validIngestionCompletedEvent, env, ctx);
    expect(env.SVC_INGESTION.fetch).toHaveBeenCalledWith(
      "http://internal/documents/doc-1/chunks",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Internal-Secret": "test-secret",
        }),
      }),
    );
  });

  it("inserts pending extraction record before processing", async () => {
    await processQueueEvent(validIngestionCompletedEvent, env, ctx);
    const prepareMock = env.DB_EXTRACTION.prepare as ReturnType<typeof vi.fn>;
    const insertCalls = prepareMock.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO extractions"),
    );
    expect(insertCalls.length).toBeGreaterThan(0);
  });

  it("emits extraction.completed event via queue send", async () => {
    await processQueueEvent(validIngestionCompletedEvent, env, ctx);
    const sendMock = env.QUEUE_PIPELINE.send as ReturnType<typeof vi.fn>;
    expect(sendMock).toHaveBeenCalledOnce();
    const sentEvent = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sentEvent["type"]).toBe("extraction.completed");
  });

  it("returns 500 when svc-ingestion returns non-ok response", async () => {
    const failEnv = mockEnv();
    (failEnv.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    );
    const res = await processQueueEvent(validIngestionCompletedEvent, failEnv, ctx);
    expect(res.status).toBe(500);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("Failed to fetch chunks");
  });

  it("returns 500 when no chunks are returned", async () => {
    const emptyEnv = mockEnv();
    (emptyEnv.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { documentId: "doc-1", chunks: [] } }), { status: 200 }),
    );
    const res = await processQueueEvent(validIngestionCompletedEvent, emptyEnv, ctx);
    expect(res.status).toBe(500);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("No chunks found");
  });

  it("returns 500 when LLM call fails", async () => {
    const { callLlm } = await import("../llm/caller.js");
    (callLlm as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("LLM timeout"));

    const res = await processQueueEvent(validIngestionCompletedEvent, env, ctx);
    expect(res.status).toBe(500);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("LLM timeout");
  });

  it("uses sonnet tier for large chunk content", async () => {
    const largeChunkEnv = mockEnv();
    (largeChunkEnv.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            documentId: "doc-1",
            chunks: [
              { masked_text: "A".repeat(6000) },
              { masked_text: "B".repeat(6000) },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    await processQueueEvent(validIngestionCompletedEvent, largeChunkEnv, ctx);

    const { callLlm } = await import("../llm/caller.js");
    const callMock = callLlm as ReturnType<typeof vi.fn>;
    const tierArg = callMock.mock.calls[callMock.mock.calls.length - 1]?.[1];
    expect(tierArg).toBe("sonnet");
  });

  it("uses haiku tier for small chunk content", async () => {
    // Default mock has 2 small chunks
    await processQueueEvent(validIngestionCompletedEvent, env, ctx);

    const { callLlm } = await import("../llm/caller.js");
    const callMock = callLlm as ReturnType<typeof vi.fn>;
    const tierArg = callMock.mock.calls[callMock.mock.calls.length - 1]?.[1];
    expect(tierArg).toBe("haiku");
  });

  it("handles non-JSON LLM response gracefully", async () => {
    const { callLlm } = await import("../llm/caller.js");
    (callLlm as ReturnType<typeof vi.fn>).mockResolvedValueOnce("not json");

    const res = await processQueueEvent(validIngestionCompletedEvent, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      processNodeCount: number;
      entityCount: number;
    };
    expect(body.success).toBe(true);
    // Empty parsed result
    expect(body.processNodeCount).toBe(0);
    expect(body.entityCount).toBe(0);
  });
});

// ── handleQueueBatch (legacy) ────────────────────────────────────

describe("handleQueueBatch", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = mockEnv();
    ctx = mockCtx();
    vi.clearAllMocks();
  });

  function createMessage(body: unknown, id = "msg-1"): Message<unknown> {
    return {
      id,
      timestamp: new Date(),
      body,
      ack: vi.fn(),
      retry: vi.fn(),
      attempts: 1,
    } as unknown as Message<unknown>;
  }

  function createBatch(messages: Message<unknown>[]): MessageBatch<unknown> {
    return {
      messages,
      queue: "pipeline-queue",
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    } as unknown as MessageBatch<unknown>;
  }

  it("acks invalid pipeline events", async () => {
    const msg = createMessage({ bad: "data" });
    const batch = createBatch([msg]);
    await handleQueueBatch(batch, env, ctx);
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it("acks non-ingestion.completed events", async () => {
    const msg = createMessage({
      eventId: "550e8400-e29b-41d4-a716-446655440001",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "document.uploaded",
      payload: {
        documentId: "doc-1",
        organizationId: "org-1",
        uploadedBy: "user-1",
        r2Key: "documents/file.pdf",
        fileType: "pdf",
        fileSizeByte: 1024,
        originalName: "file.pdf",
      },
    });
    const batch = createBatch([msg]);
    await handleQueueBatch(batch, env, ctx);
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it("processes ingestion.completed event and acks on success", async () => {
    const msg = createMessage(validIngestionCompletedEvent);
    const batch = createBatch([msg]);
    await handleQueueBatch(batch, env, ctx);
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("retries on extraction failure", async () => {
    const { callLlm } = await import("../llm/caller.js");
    (callLlm as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("LLM error"));

    const msg = createMessage(validIngestionCompletedEvent);
    const batch = createBatch([msg]);
    await handleQueueBatch(batch, env, ctx);
    expect(msg.retry).toHaveBeenCalledOnce();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it("processes multiple messages in batch", async () => {
    const msg1 = createMessage(validIngestionCompletedEvent, "msg-1");
    const msg2 = createMessage({ bad: "data" }, "msg-2");
    const batch = createBatch([msg1, msg2]);
    await handleQueueBatch(batch, env, ctx);
    expect(msg1.ack).toHaveBeenCalledOnce();
    expect(msg2.ack).toHaveBeenCalledOnce();
  });
});
