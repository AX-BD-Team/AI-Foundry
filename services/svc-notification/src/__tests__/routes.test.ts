/**
 * Integration tests for svc-notification top-level fetch handler.
 * Tests routing, authentication, and route-level behavior via the Worker entry point.
 */
import { describe, it, expect, vi } from "vitest";
import worker from "../index.js";
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

const sampleRow = {
  notification_id: "ntf-001",
  recipient_id: "user-1",
  type: "hitl_review_needed",
  title: "Policy review requested",
  body: "3 policy candidate(s) ready",
  metadata: '{"policyId":"p-1"}',
  channel: "internal",
  status: "sent",
  created_at: "2026-02-28T00:00:00.000Z",
  sent_at: "2026-02-28T00:00:00.000Z",
  read_at: null,
};

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_NOTIFICATION: mockDb(dbOverrides),
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) },
    SECURITY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { allowed: true } }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-notification",
    INTERNAL_API_SECRET: "test-secret",
    SLACK_WEBHOOK_URL: "",
  } as unknown as Env;
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

function authedReq(url: string, init?: RequestInit): Request {
  return new Request(url, {
    ...init,
    headers: {
      ...init?.headers,
      "X-Internal-Secret": "test-secret",
    },
  });
}

// ── Auth: 401 without X-Internal-Secret ──────────────────────────

describe("svc-notification auth", () => {
  it("GET /notifications without secret returns 401", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/notifications?userId=user-1");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(401);
    const body = await res.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("PATCH /notifications/:id/read without secret returns 401", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/notifications/ntf-001/read", { method: "PATCH" });
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(401);
  });

  it("POST /internal/queue-event without secret returns 401", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/internal/queue-event", { method: "POST" });
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(401);
  });

  it("wrong secret returns 401", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/notifications?userId=user-1", {
      headers: { "X-Internal-Secret": "wrong-secret" },
    });
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(401);
  });
});

// ── Health ───────────────────────────────────────────────────────

describe("svc-notification /health", () => {
  it("GET /health returns 200 without auth", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/health");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as { service: string; status: string };
    expect(body.service).toBe("svc-notification");
    expect(body.status).toBe("ok");
  });
});

// ── GET /notifications ───────────────────────────────────────────

describe("svc-notification GET /notifications", () => {
  it("returns 200 with notifications for userId", async () => {
    const env = mockEnv({ allResults: [sampleRow] });
    const req = authedReq("https://test.internal/notifications?userId=user-1");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: { notifications: Array<{ notificationId: string }> };
    };
    expect(body.success).toBe(true);
    expect(body.data.notifications).toHaveLength(1);
    expect(body.data.notifications[0]?.notificationId).toBe("ntf-001");
  });

  it("returns 400 when userId is missing", async () => {
    const env = mockEnv();
    const req = authedReq("https://test.internal/notifications");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(400);
  });

  it("returns empty list when no notifications exist", async () => {
    const env = mockEnv({ allResults: [] });
    const req = authedReq("https://test.internal/notifications?userId=user-1");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { notifications: unknown[] } };
    expect(body.data.notifications).toEqual([]);
  });
});

// ── PATCH /notifications/:id/read ────────────────────────────────

describe("svc-notification PATCH /notifications/:id/read", () => {
  it("returns 200 when marking notification as read", async () => {
    const env = mockEnv({ firstResult: { notification_id: "ntf-001", status: "sent" } });
    const req = authedReq("https://test.internal/notifications/ntf-001/read", { method: "PATCH" });
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as {
      success: boolean;
      data: { notificationId: string; status: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.notificationId).toBe("ntf-001");
    expect(body.data.status).toBe("read");
  });

  it("returns 404 when notification not found", async () => {
    const env = mockEnv({ firstResult: null });
    const req = authedReq("https://test.internal/notifications/ntf-999/read", { method: "PATCH" });
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(404);
  });

  it("returns 200 with message when already read", async () => {
    const env = mockEnv({ firstResult: { notification_id: "ntf-001", status: "read" } });
    const req = authedReq("https://test.internal/notifications/ntf-001/read", { method: "PATCH" });
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { message: string } };
    expect(body.data.message).toBe("Already read");
  });
});

// ── 404 for unknown routes ───────────────────────────────────────

describe("svc-notification unknown routes", () => {
  it("returns 404 for unknown path", async () => {
    const env = mockEnv();
    const req = authedReq("https://test.internal/unknown");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(404);
  });
});
