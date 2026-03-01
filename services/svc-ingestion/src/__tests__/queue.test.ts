import { describe, it, expect, vi, beforeEach } from "vitest";
import { processQueueEvent } from "../queue.js";
import type { Env } from "../env.js";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("../parsing/unstructured.js", () => ({
  parseDocument: vi.fn().mockResolvedValue([
    { type: "Title", text: "퇴직연금 설계서" },
    { type: "NarrativeText", text: "요구사항 정의 문서입니다." },
    { type: "Text", text: "" }, // blank — should be skipped
  ]),
}));

vi.mock("../parsing/masking.js", () => ({
  maskText: vi.fn().mockImplementation(
    (_docId: string, text: string) => Promise.resolve(`[MASKED]${text}`),
  ),
}));

function mockDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockR2(objectExists = true): R2Bucket {
  const body = new ArrayBuffer(10);
  return {
    get: vi.fn().mockResolvedValue(
      objectExists
        ? { arrayBuffer: vi.fn().mockResolvedValue(body) }
        : null,
    ),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    head: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket;
}

function mockEnv(r2Exists = true): Env {
  return {
    DB_INGESTION: mockDb(),
    R2_DOCUMENTS: mockR2(r2Exists),
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    SECURITY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { maskedText: "masked" } }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-ingestion",
    MAX_FILE_SIZE_MB: "50",
    INTERNAL_API_SECRET: "test-secret",
    UNSTRUCTURED_API_URL: "https://api.unstructured.io",
    UNSTRUCTURED_API_KEY: "",
  };
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

const validDocumentUploadedEvent = {
  eventId: "550e8400-e29b-41d4-a716-446655440000",
  occurredAt: "2026-02-28T00:00:00.000Z",
  type: "document.uploaded" as const,
  payload: {
    documentId: "doc-1",
    organizationId: "org-1",
    uploadedBy: "user-1",
    r2Key: "documents/org-1/doc-1/file.pdf",
    fileType: "pdf" as const,
    fileSizeByte: 1024,
    originalName: "file.pdf",
  },
};

// ── Tests ────────────────────────────────────────────────────────

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
    const body = await res.json() as { ok: boolean; skipped: boolean; reason: string };
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("invalid_event");
  });

  it("returns 200 with skipped=true for non-document.uploaded events", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440001",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "extraction.completed",
      payload: {
        documentId: "doc-1",
        extractionId: "ext-1",
        organizationId: "org-1",
        processNodeCount: 5,
        entityCount: 10,
      },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; skipped: boolean; reason: string };
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("not_our_event");
  });

  it("processes document.uploaded event successfully", async () => {
    const res = await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; documentId: string; chunkCount: number };
    expect(body.ok).toBe(true);
    expect(body.documentId).toBe("doc-1");
    // 2 non-blank elements (Title + NarrativeText), blank Text is skipped
    expect(body.chunkCount).toBe(2);
  });

  it("fetches R2 object with correct key", async () => {
    await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    expect(env.R2_DOCUMENTS.get).toHaveBeenCalledWith("documents/org-1/doc-1/file.pdf");
  });

  it("returns 500 when R2 object not found", async () => {
    const envNoR2 = mockEnv(false);
    const res = await processQueueEvent(validDocumentUploadedEvent, envNoR2, ctx);
    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("r2_object_not_found");
  });

  it("marks document as failed when R2 object not found", async () => {
    const envNoR2 = mockEnv(false);
    await processQueueEvent(validDocumentUploadedEvent, envNoR2, ctx);
    expect(envNoR2.DB_INGESTION.prepare).toHaveBeenCalled();
  });

  it("updates document status to parsed on success", async () => {
    await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    // The DB should have been called with UPDATE ... status = 'parsed'
    const prepareMock = env.DB_INGESTION.prepare as ReturnType<typeof vi.fn>;
    const prepareCalls = prepareMock.mock.calls as Array<[string]>;
    const updateCalls = prepareCalls.filter(
      (call) => call[0].includes("parsed"),
    );
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it("publishes ingestion.completed event via waitUntil", async () => {
    await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it("inserts chunks into document_chunks table", async () => {
    await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    const prepareMock = env.DB_INGESTION.prepare as ReturnType<typeof vi.fn>;
    const prepareCalls = prepareMock.mock.calls as Array<[string]>;
    const insertCalls = prepareCalls.filter(
      (call) => call[0].includes("INSERT INTO document_chunks"),
    );
    // 2 non-blank chunks
    expect(insertCalls).toHaveLength(2);
  });

  it("uses correct MIME mapping for file types", async () => {
    const xlsxEvent = {
      ...validDocumentUploadedEvent,
      payload: {
        ...validDocumentUploadedEvent.payload,
        fileType: "xlsx" as const,
        originalName: "data.xlsx",
      },
    };
    const res = await processQueueEvent(xlsxEvent, env, ctx);
    expect(res.status).toBe(200);
  });

  it("marks document as failed when processing throws", async () => {
    // Make parseDocument throw by re-mocking
    const unstructured = await import("../parsing/unstructured.js");
    const parseDocMock = unstructured.parseDocument as ReturnType<typeof vi.fn>;
    parseDocMock.mockRejectedValueOnce(new Error("Parse failed"));

    const res = await processQueueEvent(validDocumentUploadedEvent, env, ctx);
    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Parse failed");
  });
});
