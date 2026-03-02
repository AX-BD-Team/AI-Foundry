import { describe, it, expect, vi, beforeEach } from "vitest";
import { processQueueEvent } from "../queue/handler.js";
import type { Env } from "../env.js";

// ── Mock neo4j ──────────────────────────────────────────────────
vi.mock("../neo4j/client.js", () => ({
  neo4jQuery: vi.fn().mockResolvedValue({ results: [], errors: [] }),
}));

// ── Helpers ──────────────────────────────────────────────────────

const MOCK_POLICY_RESPONSE = {
  success: true,
  data: {
    policyId: "pol-123",
    extractionId: "ext-1",
    organizationId: "org-test",
    policyCode: "POL-PENSION-WD-001",
    title: "퇴직연금 중도인출 정책",
    condition: "무주택 세대주이면서 퇴직연금 가입기간이 5년 이상인 근로자",
    criteria: "주민등록등본으로 무주택 확인",
    outcome: "적립금의 50% 범위 내에서 중도인출 허용",
    sourceDocumentId: "doc-1",
    sourcePageRef: null,
    sourceExcerpt: null,
    status: "approved",
    trustLevel: "reviewed",
    trustScore: 0.75,
    tags: ["퇴직연금"],
    createdAt: "2026-02-01T12:00:00Z",
    updatedAt: "2026-02-01T12:00:00Z",
  },
};

function mockDb(overrides?: {
  runError?: Error;
}) {
  const runFn = overrides?.runError
    ? vi.fn().mockRejectedValue(overrides.runError)
    : vi.fn().mockResolvedValue({ success: true });
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: runFn,
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_ONTOLOGY: mockDb(dbOverrides),
    SECURITY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { allowed: true } }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    LLM_ROUTER: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_POLICY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(MOCK_POLICY_RESPONSE), { status: 200 }),
      ),
    } as unknown as Fetcher,
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-ontology",
    INTERNAL_API_SECRET: "test-secret",
    NEO4J_URI: "https://test.databases.neo4j.io",
    NEO4J_USERNAME: "neo4j",
    NEO4J_PASSWORD: "pass",
    NEO4J_DATABASE: "testdb",
  };
}

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function makePolicyApprovedEvent(overrides?: Record<string, unknown>) {
  return {
    eventId: "evt-001",
    occurredAt: "2026-02-01T12:00:00Z",
    type: "policy.approved",
    payload: {
      policyId: "pol-123",
      hitlSessionId: "hitl-456",
      organizationId: "org-test",
      approvedBy: "reviewer-1",
      approvedAt: "2026-02-01T11:59:00Z",
      policyCount: 3,
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("processQueueEvent", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = mockEnv();
    ctx = mockCtx();
    vi.clearAllMocks();
  });

  // ── Input validation ──────────────────────────────────────────

  it("returns 400 for invalid event (missing required fields)", async () => {
    const res = await processQueueEvent({}, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Invalid pipeline event");
  });

  it("returns 400 for null body", async () => {
    const res = await processQueueEvent(null, env, ctx);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Invalid pipeline event");
  });

  it("returns 400 for string body", async () => {
    const res = await processQueueEvent("not an object", env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for array body", async () => {
    const res = await processQueueEvent([1, 2, 3], env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when eventId is not a UUID", async () => {
    const event = makePolicyApprovedEvent({ eventId: "not-a-uuid" });
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when occurredAt is not a datetime", async () => {
    const event = makePolicyApprovedEvent({ occurredAt: "not-a-date" });
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when type is missing", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-02-01T12:00:00Z",
      payload: { policyId: "pol-123" },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when payload is missing required policy fields", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-02-01T12:00:00Z",
      type: "policy.approved",
      payload: {},
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(400);
  });

  // ── Event routing ─────────────────────────────────────────────

  it("ignores document.uploaded events", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-02-01T12:00:00Z",
      type: "document.uploaded",
      payload: {
        documentId: "doc-1",
        organizationId: "org-1",
        uploadedBy: "user-1",
        r2Key: "documents/org-1/file.pdf",
        fileType: "pdf",
        fileSizeByte: 1024,
        originalName: "file.pdf",
      },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; reason: string };
    expect(body.status).toBe("ignored");
    expect(body.reason).toContain("document.uploaded");
    expect(body.reason).toContain("not handled");
  });

  it("ignores ingestion.completed events", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-02-01T12:00:00Z",
      type: "ingestion.completed",
      payload: {
        documentId: "doc-1",
        organizationId: "org-1",
        chunkCount: 10,
        classification: "general",
        r2Key: "documents/org-1/file.pdf",
      },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ignored");
  });

  it("ignores extraction.completed events", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-02-01T12:00:00Z",
      type: "extraction.completed",
      payload: {
        documentId: "doc-1",
        extractionId: "ext-1",
        organizationId: "org-1",
        processNodeCount: 5,
        entityCount: 3,
      },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ignored");
  });

  it("ignores ontology.normalized events", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-02-01T12:00:00Z",
      type: "ontology.normalized",
      payload: {
        policyId: "pol-1",
        ontologyId: "ont-1",
        organizationId: "org-test",
        termCount: 5,
      },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ignored");
  });

  it("ignores skill.packaged events", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-02-01T12:00:00Z",
      type: "skill.packaged",
      payload: {
        skillId: "skill-1",
        ontologyId: "ont-1",
        organizationId: "org-test",
        r2Key: "skills/skill-1.json",
        policyCount: 3,
        trustScore: 0.85,
      },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ignored");
  });

  // ── policy.approved processing ────────────────────────────────

  it("processes policy.approved event successfully", async () => {
    const event = makePolicyApprovedEvent({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
    });
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      status: string;
      eventId: string;
      type: string;
      ontologyId: string;
      policyId: string;
      termCount: number;
    };
    expect(body.status).toBe("processed");
    expect(body.eventId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(body.type).toBe("policy.approved");
    expect(body.policyId).toBe("pol-123");
    expect(body.ontologyId).toBeDefined();
    expect(body.termCount).toBeGreaterThan(0);
  });

  it("fetches policy from svc-policy via service binding", async () => {
    const event = makePolicyApprovedEvent({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
    });
    await processQueueEvent(event, env, ctx);

    const fetchMock = env.SVC_POLICY.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://internal/policies/pol-123");
    expect((opts.headers as Record<string, string>)["X-Internal-Secret"]).toBe("test-secret");
  });

  it("inserts ontology record with processing status", async () => {
    const event = makePolicyApprovedEvent({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
    });
    await processQueueEvent(event, env, ctx);

    const prepareMock = env.DB_ONTOLOGY.prepare as ReturnType<typeof vi.fn>;
    const firstSql = prepareMock.mock.calls[0]?.[0] as string;
    expect(firstSql).toContain("INSERT INTO ontologies");
    expect(firstSql).toContain("processing");
  });

  it("extracts terms from policy text", async () => {
    const event = makePolicyApprovedEvent({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
    });
    const res = await processQueueEvent(event, env, ctx);
    const body = await res.json() as { termCount: number };
    // The mock policy has Korean terms in condition/criteria/outcome
    expect(body.termCount).toBeGreaterThan(0);
  });

  it("emits ontology.normalized event to queue", async () => {
    const event = makePolicyApprovedEvent({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
    });
    await processQueueEvent(event, env, ctx);

    expect(env.QUEUE_PIPELINE.send).toHaveBeenCalled();

    const sendMock = env.QUEUE_PIPELINE.send as ReturnType<typeof vi.fn>;
    const sentEvent = sendMock.mock.calls[0]?.[0] as {
      eventId: string;
      occurredAt: string;
      type: string;
      payload: { policyId: string; ontologyId: string; termCount: number };
    };
    expect(sentEvent.type).toBe("ontology.normalized");
    expect(sentEvent.payload.policyId).toBe("pol-123");
    expect(sentEvent.payload.termCount).toBeGreaterThan(0);
    expect(sentEvent.eventId).toBeDefined();
    expect(sentEvent.occurredAt).toBeDefined();
  });

  // ── Error handling ────────────────────────────────────────────

  it("returns error when policy fetch fails", async () => {
    const failEnv = mockEnv();
    (failEnv.SVC_POLICY.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("Not found", { status: 404 }),
    );
    const event = makePolicyApprovedEvent({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
    });
    const res = await processQueueEvent(event, failEnv, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; reason: string };
    expect(body.status).toBe("error");
    expect(body.reason).toContain("Policy fetch failed");
  });

  it("returns error when D1 ontology insert fails", async () => {
    const failEnv = mockEnv({ runError: new Error("D1 write failed") });
    const event = makePolicyApprovedEvent({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
    });
    const res = await processQueueEvent(event, failEnv, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; reason: string };
    expect(body.status).toBe("error");
    expect(body.reason).toContain("D1 insert failed");
  });

  it("does not emit queue event when D1 insert fails", async () => {
    const failEnv = mockEnv({ runError: new Error("D1 write failed") });
    const event = makePolicyApprovedEvent({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
    });
    await processQueueEvent(event, failEnv, ctx);
    expect(failEnv.QUEUE_PIPELINE.send).not.toHaveBeenCalled();
  });

  // ── Returns details from original event ───────────────────────

  it("returns original eventId in response", async () => {
    const event = makePolicyApprovedEvent({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
    });
    const res = await processQueueEvent(event, env, ctx);
    const body = await res.json() as { eventId: string };
    expect(body.eventId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("returns type in response", async () => {
    const event = makePolicyApprovedEvent({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
    });
    const res = await processQueueEvent(event, env, ctx);
    const body = await res.json() as { type: string };
    expect(body.type).toBe("policy.approved");
  });

  it("returns policyId from the event payload in response", async () => {
    const event = makePolicyApprovedEvent({
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      payload: {
        policyId: "pol-custom-789",
        hitlSessionId: "hitl-456",
        organizationId: "org-test",
        approvedBy: "reviewer-1",
        approvedAt: "2026-02-01T11:59:00Z",
        policyCount: 5,
      },
    });
    const res = await processQueueEvent(event, env, ctx);
    const body = await res.json() as { policyId: string };
    expect(body.policyId).toBe("pol-custom-789");
  });

  // ── Validation edge cases ─────────────────────────────────────

  it("returns 400 for event with invalid payload fields", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-02-01T12:00:00Z",
      type: "policy.approved",
      payload: {
        policyId: "pol-123",
        hitlSessionId: "hitl-456",
        organizationId: "org-test",
        approvedBy: "reviewer-1",
        approvedAt: "not-a-datetime", // invalid
        policyCount: 3,
      },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when policyCount is not an integer", async () => {
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440000",
      occurredAt: "2026-02-01T12:00:00Z",
      type: "policy.approved",
      payload: {
        policyId: "pol-123",
        hitlSessionId: "hitl-456",
        organizationId: "org-test",
        approvedBy: "reviewer-1",
        approvedAt: "2026-02-01T11:59:00Z",
        policyCount: 3.5, // not an integer
      },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(400);
  });

  it("handles policy.approved with traceId (optional field)", async () => {
    const event = {
      ...makePolicyApprovedEvent({
        eventId: "550e8400-e29b-41d4-a716-446655440000",
      }),
      traceId: "trace-abc-123",
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("processed");
  });
});
