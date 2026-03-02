import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleUpload, handleGetDocument } from "../routes/upload.js";
import type { Env } from "../env.js";

// ── Helpers ──────────────────────────────────────────────────────

function mockDb(overrides?: {
  firstResult?: Record<string, unknown> | null;
  allResults?: Record<string, unknown>[];
}) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(overrides?.firstResult ?? null),
        all: vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockR2(): R2Bucket {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    head: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_INGESTION: mockDb(dbOverrides),
    R2_DOCUMENTS: mockR2(),
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    SECURITY: { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { allowed: true } }), { status: 200 })) } as unknown as Fetcher,
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

function createMultipartRequest(
  file: File,
  headers?: Record<string, string>,
): Request {
  const formData = new FormData();
  formData.append("file", file);
  return new Request("https://test.internal/documents", {
    method: "POST",
    headers: {
      "X-Organization-Id": "org-1",
      "X-User-Id": "user-1",
      ...headers,
    },
    body: formData,
  });
}

// ── handleUpload ─────────────────────────────────────────────────

describe("handleUpload", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = mockEnv();
    ctx = mockCtx();
  });

  it("returns 400 when X-Organization-Id is missing", async () => {
    const formData = new FormData();
    formData.append("file", new File(["test"], "doc.pdf", { type: "application/pdf" }));
    const req = new Request("https://test.internal/documents", {
      method: "POST",
      headers: { "X-User-Id": "user-1" },
      body: formData,
    });
    const res = await handleUpload(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("X-Organization-Id");
  });

  it("returns 400 when X-User-Id is missing", async () => {
    const formData = new FormData();
    formData.append("file", new File(["test"], "doc.pdf", { type: "application/pdf" }));
    const req = new Request("https://test.internal/documents", {
      method: "POST",
      headers: { "X-Organization-Id": "org-1" },
      body: formData,
    });
    const res = await handleUpload(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("X-User-Id");
  });

  it("returns 400 when Content-Type is not multipart/form-data", async () => {
    const req = new Request("https://test.internal/documents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Organization-Id": "org-1",
        "X-User-Id": "user-1",
      },
      body: JSON.stringify({ file: "data" }),
    });
    const res = await handleUpload(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("multipart/form-data");
  });

  it("returns 400 when file field is missing", async () => {
    const formData = new FormData();
    formData.append("notFile", "some text");
    const req = new Request("https://test.internal/documents", {
      method: "POST",
      headers: {
        "X-Organization-Id": "org-1",
        "X-User-Id": "user-1",
      },
      body: formData,
    });
    const res = await handleUpload(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("file");
  });

  it("returns 400 for unsupported file type", async () => {
    const file = new File(["test"], "bad.txt", { type: "text/plain" });
    const req = createMultipartRequest(file);
    const res = await handleUpload(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("Unsupported file type");
  });

  it("returns 400 when file exceeds max size", async () => {
    // Create a file larger than 50MB — use a small env with 0MB limit to test
    env.MAX_FILE_SIZE_MB = "0";
    const file = new File(["a"], "doc.pdf", { type: "application/pdf" });
    const req = createMultipartRequest(file);
    const res = await handleUpload(req, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain("exceeds maximum");
  });

  it("uploads PDF successfully and returns 201", async () => {
    const file = new File(["pdf-content"], "test.pdf", { type: "application/pdf" });
    const req = createMultipartRequest(file);
    const res = await handleUpload(req, env, ctx);
    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean; data: { documentId: string; status: string; r2Key: string } };
    expect(body.success).toBe(true);
    expect(body.data.documentId).toBeDefined();
    expect(body.data.status).toBe("pending");
    expect(body.data.r2Key).toContain("documents/org-1/");
  });

  it("stores file in R2 with correct metadata", async () => {
    const file = new File(["content"], "report.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const req = createMultipartRequest(file);
    await handleUpload(req, env, ctx);
    expect(env.R2_DOCUMENTS.put).toHaveBeenCalledOnce();
    const putMock = env.R2_DOCUMENTS.put as ReturnType<typeof vi.fn>;
    const putCall = putMock.mock.calls[0] as [string, ...unknown[]];
    expect(putCall).toBeDefined();
    const r2Key = putCall[0];
    expect(r2Key).toContain("documents/org-1/");
    expect(r2Key).toContain("report.docx");
  });

  it("inserts document record into D1", async () => {
    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });
    const req = createMultipartRequest(file);
    await handleUpload(req, env, ctx);
    expect(env.DB_INGESTION.prepare).toHaveBeenCalled();
  });

  it("publishes document.uploaded event to queue", async () => {
    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });
    const req = createMultipartRequest(file);
    await handleUpload(req, env, ctx);
    expect(env.QUEUE_PIPELINE.send).toHaveBeenCalled();
  });

  it("handles all supported MIME types", async () => {
    const supportedTypes = [
      { mime: "application/pdf", name: "test.pdf" },
      { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", name: "test.docx" },
      { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name: "test.xlsx" },
      { mime: "image/png", name: "test.png" },
      { mime: "image/jpeg", name: "test.jpg" },
    ];

    for (const { mime, name } of supportedTypes) {
      const freshEnv = mockEnv();
      const freshCtx = mockCtx();
      const file = new File(["content"], name, { type: mime });
      const req = createMultipartRequest(file);
      const res = await handleUpload(req, freshEnv, freshCtx);
      expect(res.status).toBe(201);
    }
  });
});

// ── handleGetDocument ────────────────────────────────────────────

describe("handleGetDocument", () => {
  it("returns 404 when document not found", async () => {
    const env = mockEnv({ firstResult: null });
    const req = new Request("https://test.internal/documents/doc-999");
    const res = await handleGetDocument(req, env, "doc-999");
    expect(res.status).toBe(404);
    const body = await res.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns document when found", async () => {
    const row = {
      document_id: "doc-1",
      organization_id: "org-1",
      status: "parsed",
      file_type: "pdf",
      original_name: "report.pdf",
    };
    const env = mockEnv({ firstResult: row });
    const req = new Request("https://test.internal/documents/doc-1");
    const res = await handleGetDocument(req, env, "doc-1");
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: typeof row };
    expect(body.success).toBe(true);
    expect(body.data.document_id).toBe("doc-1");
    expect(body.data.status).toBe("parsed");
  });
});

// ── index.ts router ──────────────────────────────────────────────

describe("svc-ingestion router (index.ts)", () => {
  // Import the default export from index to test routing
  let worker: ExportedHandler<Env>;

  beforeEach(async () => {
    const module = await import("../index.js");
    worker = module.default;
  });

  it("returns health check without auth", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = new Request("https://test.internal/health");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { status: string; service: string } };
    expect(body.data.status).toBe("ok");
    expect(body.data.service).toBe("svc-ingestion");
  });

  it("returns 401 without X-Internal-Secret", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = new Request("https://test.internal/documents", { method: "POST" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong X-Internal-Secret", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = new Request("https://test.internal/documents", {
      method: "POST",
      headers: { "X-Internal-Secret": "wrong-secret" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown routes", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = new Request("https://test.internal/unknown", {
      headers: { "X-Internal-Secret": "test-secret" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(404);
  });

  it("GET /documents/:id returns document via handleGetDocument", async () => {
    const docRow = {
      document_id: "doc-abc",
      organization_id: "org-1",
      status: "pending",
    };
    const env = mockEnv({ firstResult: docRow });
    const ctx = mockCtx();
    const req = new Request("https://test.internal/documents/doc-abc", {
      headers: { "X-Internal-Secret": "test-secret" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { document_id: string } };
    expect(body.success).toBe(true);
    expect(body.data.document_id).toBe("doc-abc");
  });

  it("GET /documents/:id/chunks returns chunks", async () => {
    const env = mockEnv({
      allResults: [
        { chunk_id: "c-1", chunk_index: 0, element_type: "Text", masked_text: "hello", classification: "general", word_count: 1 },
      ],
    });
    const ctx = mockCtx();
    const req = new Request("https://test.internal/documents/doc-1/chunks", {
      headers: { "X-Internal-Secret": "test-secret" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await worker.fetch!(req as any, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { documentId: string; chunks: Array<{ chunk_id: string }> };
    expect(body.documentId).toBe("doc-1");
    expect(body.chunks).toHaveLength(1);
    expect(body.chunks[0]?.chunk_id).toBe("c-1");
  });
});
