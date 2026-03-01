import { describe, it, expect, vi } from "vitest";
import { processQueueEvent } from "./handler.js";
import type { Env } from "../env.js";

// ── Mock LLM caller ────────────────────────────────────────────
vi.mock("../llm/caller.js", () => ({
  callOpusLlm: vi.fn().mockResolvedValue(
    JSON.stringify([
      {
        title: "중도인출 요건",
        condition: "무주택 세대주",
        criteria: "가입기간 5년 이상",
        outcome: "적립금 50% 인출 허용",
        policyCode: "POL-PENSION-WD-001",
        tags: ["퇴직연금", "중도인출"],
      },
    ]),
  ),
}));

// ── Mock extraction response ────────────────────────────────────
const MOCK_EXTRACTION_RESPONSE = {
  success: true,
  data: {
    extractionId: "ext-1",
    documentId: "doc-1",
    status: "completed",
    result: {
      processes: [
        { name: "인출심사", description: "중도인출 심사 프로세스", steps: ["서류접수", "심사", "승인"] },
      ],
      entities: [
        { name: "퇴직연금", type: "domain", attributes: ["가입기간", "적립금"] },
      ],
      relationships: [
        { from: "인출심사", to: "퇴직연금", type: "APPLIES_TO" },
      ],
      rules: [
        { condition: "무주택 세대주", outcome: "인출 허용", domain: "pension" },
      ],
    },
  },
};

// ── Helpers ──────────────────────────────────────────────────────

function mockEnv(): Env {
  const doStub = {
    fetch: vi.fn().mockResolvedValue(new Response("ok")),
  };
  return {
    DB_POLICY: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
          first: vi.fn().mockResolvedValue(null),
        }),
      }),
    } as unknown as D1Database,
    SECURITY: { fetch: vi.fn() } as unknown as Fetcher,
    LLM_ROUTER: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { content: "[]" } }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    NOTIFICATION: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_EXTRACTION: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(MOCK_EXTRACTION_RESPONSE), { status: 200 }),
      ),
    } as unknown as Fetcher,
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    HITL_SESSION: {
      idFromName: vi.fn().mockReturnValue({ toString: () => "do-id-1" }),
      get: vi.fn().mockReturnValue(doStub),
    } as unknown as DurableObjectNamespace,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-policy",
    INTERNAL_API_SECRET: "test-secret",
  };
}

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

// ── Tests ────────────────────────────────────────────────────────

describe("processQueueEvent (svc-policy)", () => {
  it("rejects invalid pipeline event", async () => {
    const res = await processQueueEvent({ bad: "data" }, mockEnv(), mockCtx());
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid pipeline event");
  });

  it("ignores non-extraction.completed events", async () => {
    const event = {
      eventId: "00000000-0000-0000-0000-000000000001",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "document.uploaded",
      payload: {
        documentId: "doc-1",
        organizationId: "org-1",
        uploadedBy: "user-1",
        r2Key: "docs/file.pdf",
        fileType: "pdf",
        fileSizeByte: 1024,
        originalName: "file.pdf",
      },
    };
    const res = await processQueueEvent(event, mockEnv(), mockCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ignored");
  });

  it("processes extraction.completed event with full pipeline", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const event = {
      eventId: "00000000-0000-0000-0000-000000000002",
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
    const body = (await res.json()) as { status: string; policyCount: number; policyIds: string[] };
    expect(body.status).toBe("processed");
    expect(body.policyCount).toBe(1);
    expect(body.policyIds).toHaveLength(1);

    // Verify D1 inserts (policy + hitl_session)
    expect(env.DB_POLICY.prepare).toHaveBeenCalled();
    // Verify HITL DO initialization
    expect(env.HITL_SESSION.idFromName).toHaveBeenCalled();
    // Verify queue event was emitted
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it("fetches extraction from svc-extraction via service binding", async () => {
    const env = mockEnv();
    const event = {
      eventId: "00000000-0000-0000-0000-000000000002",
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
    await processQueueEvent(event, env, mockCtx());

    const extractionFetch = env.SVC_EXTRACTION.fetch as ReturnType<typeof vi.fn>;
    expect(extractionFetch).toHaveBeenCalledOnce();
    const [url] = extractionFetch.mock.calls[0] as [string];
    expect(url).toBe("http://internal/extractions/ext-1");
  });

  it("returns error when extraction fetch fails", async () => {
    const env = mockEnv();
    (env.SVC_EXTRACTION.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("Not found", { status: 404 }),
    );
    const event = {
      eventId: "00000000-0000-0000-0000-000000000002",
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
    const res = await processQueueEvent(event, env, mockCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reason: string };
    expect(body.status).toBe("error");
    expect(body.reason).toContain("Extraction fetch failed");
  });

  it("rejects malformed event schema", async () => {
    const event = {
      eventId: "not-a-uuid",
      occurredAt: "bad-date",
      type: "extraction.completed",
      payload: {},
    };
    const res = await processQueueEvent(event, mockEnv(), mockCtx());
    expect(res.status).toBe(400);
  });
});
