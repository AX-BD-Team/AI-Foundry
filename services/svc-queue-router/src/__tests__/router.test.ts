import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Types ────────────────────────────────────────────────────────

interface Env {
  INTERNAL_API_SECRET: string;
  SVC_INGESTION: Fetcher;
  SVC_EXTRACTION: Fetcher;
  SVC_POLICY: Fetcher;
  SVC_ONTOLOGY: Fetcher;
  SVC_SKILL: Fetcher;
  SVC_NOTIFICATION: Fetcher;
  SVC_ANALYTICS: Fetcher;
}

// ── Helpers ──────────────────────────────────────────────────────

function mockFetcher(): Fetcher {
  return {
    fetch: vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
  } as unknown as Fetcher;
}

function mockEnv(): Env {
  return {
    INTERNAL_API_SECRET: "test-internal-secret",
    SVC_INGESTION: mockFetcher(),
    SVC_EXTRACTION: mockFetcher(),
    SVC_POLICY: mockFetcher(),
    SVC_ONTOLOGY: mockFetcher(),
    SVC_SKILL: mockFetcher(),
    SVC_NOTIFICATION: mockFetcher(),
    SVC_ANALYTICS: mockFetcher(),
  };
}

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

/** Create a valid pipeline event body */
function makeEvent(
  type: string,
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  const basePayloads: Record<string, Record<string, unknown>> = {
    "document.uploaded": {
      documentId: "doc-1",
      organizationId: "org-1",
      uploadedBy: "user-1",
      r2Key: "documents/org-1/test.pdf",
      fileType: "pdf",
      fileSizeByte: 1024,
      originalName: "test.pdf",
    },
    "ingestion.completed": {
      documentId: "doc-1",
      organizationId: "org-1",
      chunkCount: 5,
      classification: "requirements",
      r2Key: "documents/org-1/test.pdf",
    },
    "extraction.completed": {
      documentId: "doc-1",
      extractionId: "ext-1",
      organizationId: "org-1",
      processNodeCount: 3,
      entityCount: 7,
    },
    "policy.candidate_ready": {
      extractionId: "ext-1",
      policyId: "pol-1",
      hitlSessionId: "hitl-1",
      candidateCount: 4,
    },
    "policy.approved": {
      policyId: "pol-1",
      hitlSessionId: "hitl-1",
      approvedBy: "reviewer-1",
      approvedAt: "2026-01-15T10:00:00.000Z",
      policyCount: 3,
    },
    "ontology.normalized": {
      policyId: "pol-1",
      ontologyId: "onto-1",
      termCount: 12,
    },
    "skill.packaged": {
      skillId: "skill-1",
      ontologyId: "onto-1",
      r2Key: "skill-packages/skill-1.skill.json",
      policyCount: 3,
      trustScore: 0.85,
    },
  };

  return {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    occurredAt: "2026-01-15T10:00:00.000Z",
    type,
    payload: { ...(basePayloads[type] ?? {}), ...payload },
  };
}

interface MockMessage {
  id: string;
  body: unknown;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
}

function makeMessage(body: unknown, id = "msg-1"): MockMessage {
  return {
    id,
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function makeBatch(messages: MockMessage[]): MessageBatch<unknown> {
  return {
    messages,
    queue: "ai-foundry-pipeline",
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<unknown>;
}

// ── fetch handler tests ──────────────────────────────────────────

describe("svc-queue-router fetch handler", () => {
  let worker: { fetch: (req: Request) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
  });

  it("GET /health returns status ok", async () => {
    const res = await worker.fetch(new Request("https://internal/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("svc-queue-router");
  });

  it("GET / returns default response", async () => {
    const res = await worker.fetch(new Request("https://internal/"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("svc-queue-router");
  });

  it("GET /unknown returns 200 with default message", async () => {
    const res = await worker.fetch(new Request("https://internal/unknown"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("svc-queue-router");
  });
});

// ── queue handler — event routing tests ──────────────────────────

describe("svc-queue-router queue handler — event routing", () => {
  let worker: { fetch: (req: Request) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  // ── document.uploaded → SVC_INGESTION + SVC_ANALYTICS ──

  it("routes document.uploaded to SVC_INGESTION", async () => {
    const msg = makeMessage(makeEvent("document.uploaded"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://internal/internal/queue-event");
    expect(init.method).toBe("POST");
  });

  it("routes document.uploaded also to SVC_ANALYTICS", async () => {
    const msg = makeMessage(makeEvent("document.uploaded"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // ── ingestion.completed → SVC_EXTRACTION + SVC_ANALYTICS ──

  it("routes ingestion.completed to SVC_EXTRACTION", async () => {
    const msg = makeMessage(makeEvent("ingestion.completed"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_EXTRACTION.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("routes ingestion.completed also to SVC_ANALYTICS", async () => {
    const msg = makeMessage(makeEvent("ingestion.completed"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // ── extraction.completed → SVC_POLICY + SVC_ANALYTICS ──

  it("routes extraction.completed to SVC_POLICY", async () => {
    const msg = makeMessage(makeEvent("extraction.completed"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_POLICY.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("routes extraction.completed also to SVC_ANALYTICS", async () => {
    const msg = makeMessage(makeEvent("extraction.completed"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // ── policy.candidate_ready → SVC_NOTIFICATION + SVC_ANALYTICS ──

  it("routes policy.candidate_ready to SVC_NOTIFICATION", async () => {
    const msg = makeMessage(makeEvent("policy.candidate_ready"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_NOTIFICATION.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("routes policy.candidate_ready also to SVC_ANALYTICS", async () => {
    const msg = makeMessage(makeEvent("policy.candidate_ready"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // ── policy.approved → SVC_ONTOLOGY + SVC_ANALYTICS ──

  it("routes policy.approved to SVC_ONTOLOGY", async () => {
    const msg = makeMessage(makeEvent("policy.approved"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_ONTOLOGY.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("routes policy.approved also to SVC_ANALYTICS", async () => {
    const msg = makeMessage(makeEvent("policy.approved"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // ── ontology.normalized → SVC_SKILL + SVC_ANALYTICS ──

  it("routes ontology.normalized to SVC_SKILL", async () => {
    const msg = makeMessage(makeEvent("ontology.normalized"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_SKILL.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("routes ontology.normalized also to SVC_ANALYTICS", async () => {
    const msg = makeMessage(makeEvent("ontology.normalized"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // ── skill.packaged → SVC_NOTIFICATION + SVC_ANALYTICS ──

  it("routes skill.packaged to SVC_NOTIFICATION", async () => {
    const msg = makeMessage(makeEvent("skill.packaged"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_NOTIFICATION.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("routes skill.packaged also to SVC_ANALYTICS", async () => {
    const msg = makeMessage(makeEvent("skill.packaged"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

// ── queue handler — X-Internal-Secret ────────────────────────────

describe("svc-queue-router queue handler — internal auth header", () => {
  let worker: { fetch: (req: Request) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("includes X-Internal-Secret header in dispatches to primary target", async () => {
    const msg = makeMessage(makeEvent("document.uploaded"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Internal-Secret"]).toBe("test-internal-secret");
  });

  it("includes X-Internal-Secret header in dispatches to SVC_ANALYTICS", async () => {
    const msg = makeMessage(makeEvent("ingestion.completed"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Internal-Secret"]).toBe("test-internal-secret");
  });

  it("includes Content-Type application/json in dispatches", async () => {
    const msg = makeMessage(makeEvent("extraction.completed"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_POLICY.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

// ── queue handler — event body serialization ─────────────────────

describe("svc-queue-router queue handler — event body", () => {
  let worker: { fetch: (req: Request) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("sends the parsed event as JSON body to target service", async () => {
    const event = makeEvent("document.uploaded");
    const msg = makeMessage(event);
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody["type"]).toBe("document.uploaded");
    expect(sentBody["eventId"]).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect((sentBody["payload"] as Record<string, unknown>)["documentId"]).toBe("doc-1");
  });

  it("sends the same event body to both primary and analytics targets", async () => {
    const event = makeEvent("policy.approved");
    const msg = makeMessage(event);
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const primaryFetch = env.SVC_ONTOLOGY.fetch as ReturnType<typeof vi.fn>;
    const analyticsFetch = env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>;

    const [, primaryInit] = primaryFetch.mock.calls[0] as [string, RequestInit];
    const [, analyticsInit] = analyticsFetch.mock.calls[0] as [string, RequestInit];

    expect(primaryInit.body).toBe(analyticsInit.body);
  });
});

// ── queue handler — invalid/unknown events ───────────────────────

describe("svc-queue-router queue handler — invalid events", () => {
  let worker: { fetch: (req: Request) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("acks and skips messages with invalid event body", async () => {
    const msg = makeMessage({ invalid: "data" });
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    // Message should be acked (not retried)
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();

    // No service binding should have been called
    for (const svc of [
      env.SVC_INGESTION,
      env.SVC_EXTRACTION,
      env.SVC_POLICY,
      env.SVC_ONTOLOGY,
      env.SVC_SKILL,
      env.SVC_NOTIFICATION,
      env.SVC_ANALYTICS,
    ]) {
      expect((svc.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    }
  });

  it("acks and skips messages with unknown event type", async () => {
    const msg = makeMessage({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-01-15T10:00:00.000Z",
      type: "unknown.event.type",
      payload: { foo: "bar" },
    });
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("acks and skips messages with null body", async () => {
    const msg = makeMessage(null);
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("acks and skips messages with missing required fields", async () => {
    const msg = makeMessage({
      type: "document.uploaded",
      // missing eventId, occurredAt, payload
    });
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("acks and skips messages with missing payload fields", async () => {
    const msg = makeMessage({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-01-15T10:00:00.000Z",
      type: "document.uploaded",
      payload: {
        documentId: "doc-1",
        // missing other required fields
      },
    });
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });
});

// ── queue handler — error handling ───────────────────────────────

describe("svc-queue-router queue handler — error handling", () => {
  let worker: { fetch: (req: Request) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("still acks message when target service returns error status", async () => {
    // Target returns 500
    (env.SVC_INGESTION as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch =
      vi.fn().mockResolvedValue(new Response("Internal Server Error", { status: 500 }));

    const msg = makeMessage(makeEvent("document.uploaded"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    // Message is still acked because dispatch is async (waitUntil)
    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("logs error when target service returns non-ok status", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (env.SVC_EXTRACTION as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch =
      vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    const msg = makeMessage(makeEvent("ingestion.completed"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    // Wait for the dispatched promises to settle
    const waitUntilMock = ctx.waitUntil as ReturnType<typeof vi.fn>;
    if (waitUntilMock.mock.calls.length > 0) {
      const promise = waitUntilMock.mock.calls[0]?.[0] as Promise<unknown>;
      if (promise) await promise;
    }

    // The logger outputs JSON to console.error for "error" level
    expect(consoleSpy).toHaveBeenCalled();
    const errorCalls = consoleSpy.mock.calls;
    const hasDispatchError = errorCalls.some((call) => {
      const line = String(call[0]);
      return line.includes("Dispatch failed");
    });
    expect(hasDispatchError).toBe(true);

    consoleSpy.mockRestore();
  });

  it("uses ctx.waitUntil for async dispatch", async () => {
    const msg = makeMessage(makeEvent("document.uploaded"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    expect(ctx.waitUntil).toHaveBeenCalled();
  });
});

// ── queue handler — batch processing ─────────────────────────────

describe("svc-queue-router queue handler — batch processing", () => {
  let worker: { fetch: (req: Request) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("processes multiple messages in a single batch", async () => {
    const msg1 = makeMessage(makeEvent("document.uploaded"), "msg-1");
    const msg2 = makeMessage(makeEvent("ingestion.completed"), "msg-2");
    const msg3 = makeMessage(makeEvent("extraction.completed"), "msg-3");
    const batch = makeBatch([msg1, msg2, msg3]);

    await worker.queue(batch, env, ctx);

    // All three messages should be acked
    expect(msg1.ack).toHaveBeenCalledOnce();
    expect(msg2.ack).toHaveBeenCalledOnce();
    expect(msg3.ack).toHaveBeenCalledOnce();

    // Each routes to its primary + analytics
    expect((env.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_EXTRACTION.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_POLICY.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();

    // Analytics receives all three events
    expect((env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(3);
  });

  it("continues processing valid messages after an invalid one", async () => {
    const invalidMsg = makeMessage({ bad: "data" }, "msg-invalid");
    const validMsg = makeMessage(makeEvent("skill.packaged"), "msg-valid");
    const batch = makeBatch([invalidMsg, validMsg]);

    await worker.queue(batch, env, ctx);

    // Invalid is acked (skipped), valid is acked (processed)
    expect(invalidMsg.ack).toHaveBeenCalledOnce();
    expect(validMsg.ack).toHaveBeenCalledOnce();

    // skill.packaged routes to SVC_NOTIFICATION
    expect((env.SVC_NOTIFICATION.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });

  it("processes batch with all 7 event types", async () => {
    const eventTypes = [
      "document.uploaded",
      "ingestion.completed",
      "extraction.completed",
      "policy.candidate_ready",
      "policy.approved",
      "ontology.normalized",
      "skill.packaged",
    ] as const;

    const messages = eventTypes.map((type, i) =>
      makeMessage(makeEvent(type), `msg-${i}`),
    );
    const batch = makeBatch(messages);

    await worker.queue(batch, env, ctx);

    // All 7 messages should be acked
    for (const msg of messages) {
      expect(msg.ack).toHaveBeenCalledOnce();
    }

    // Each primary target should have been called
    expect((env.SVC_INGESTION.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_EXTRACTION.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_POLICY.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    // SVC_NOTIFICATION receives policy.candidate_ready + skill.packaged = 2
    expect((env.SVC_NOTIFICATION.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    expect((env.SVC_ONTOLOGY.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((env.SVC_SKILL.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();

    // Analytics receives ALL 7 events
    expect((env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(7);
  });

  it("handles empty batch gracefully", async () => {
    const batch = makeBatch([]);

    await worker.queue(batch, env, ctx);

    // No services should have been called
    for (const svc of [
      env.SVC_INGESTION,
      env.SVC_EXTRACTION,
      env.SVC_POLICY,
      env.SVC_ONTOLOGY,
      env.SVC_SKILL,
      env.SVC_NOTIFICATION,
      env.SVC_ANALYTICS,
    ]) {
      expect((svc.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    }
  });
});

// ── queue handler — fan-out target count ─────────────────────────

describe("svc-queue-router queue handler — fan-out target count", () => {
  let worker: { fetch: (req: Request) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  type ServiceBinding = "SVC_INGESTION" | "SVC_EXTRACTION" | "SVC_POLICY" | "SVC_ONTOLOGY" | "SVC_SKILL" | "SVC_NOTIFICATION" | "SVC_ANALYTICS";
  const eventTargetMap: Array<{ type: string; primaryBinding: ServiceBinding }> = [
    { type: "document.uploaded", primaryBinding: "SVC_INGESTION" },
    { type: "ingestion.completed", primaryBinding: "SVC_EXTRACTION" },
    { type: "extraction.completed", primaryBinding: "SVC_POLICY" },
    { type: "policy.candidate_ready", primaryBinding: "SVC_NOTIFICATION" },
    { type: "policy.approved", primaryBinding: "SVC_ONTOLOGY" },
    { type: "ontology.normalized", primaryBinding: "SVC_SKILL" },
    { type: "skill.packaged", primaryBinding: "SVC_NOTIFICATION" },
  ];

  for (const { type, primaryBinding } of eventTargetMap) {
    it(`dispatches ${type} to exactly 2 targets (primary + analytics)`, async () => {
      const msg = makeMessage(makeEvent(type));
      const batch = makeBatch([msg]);

      await worker.queue(batch, env, ctx);

      // Count total fetch calls across ALL service bindings
      let totalCalls = 0;
      for (const key of [
        "SVC_INGESTION",
        "SVC_EXTRACTION",
        "SVC_POLICY",
        "SVC_ONTOLOGY",
        "SVC_SKILL",
        "SVC_NOTIFICATION",
        "SVC_ANALYTICS",
      ] as const) {
        totalCalls += (env[key].fetch as ReturnType<typeof vi.fn>).mock.calls.length;
      }

      expect(totalCalls).toBe(2);

      // Verify the primary binding was called
      expect((env[primaryBinding].fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
      // Verify analytics was called
      expect((env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  }
});

// ── queue handler — dispatch URL ─────────────────────────────────

describe("svc-queue-router queue handler — dispatch endpoint", () => {
  let worker: { fetch: (req: Request) => Promise<Response>; queue: (batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) => Promise<void> };
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(async () => {
    const mod = await import("../index.js");
    worker = mod.default;
    env = mockEnv();
    ctx = mockCtx();
  });

  it("dispatches to http://internal/internal/queue-event endpoint", async () => {
    const msg = makeMessage(makeEvent("ontology.normalized"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    const fetchMock = env.SVC_SKILL.fetch as ReturnType<typeof vi.fn>;
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://internal/internal/queue-event");

    const analyticsFetch = env.SVC_ANALYTICS.fetch as ReturnType<typeof vi.fn>;
    const [analyticsUrl] = analyticsFetch.mock.calls[0] as [string, RequestInit];
    expect(analyticsUrl).toBe("http://internal/internal/queue-event");
  });

  it("uses POST method for all dispatches", async () => {
    const msg = makeMessage(makeEvent("policy.candidate_ready"));
    const batch = makeBatch([msg]);

    await worker.queue(batch, env, ctx);

    for (const key of ["SVC_NOTIFICATION", "SVC_ANALYTICS"] as const) {
      const fetchMock = env[key].fetch as ReturnType<typeof vi.fn>;
      if (fetchMock.mock.calls.length > 0) {
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(init.method).toBe("POST");
      }
    }
  });
});
