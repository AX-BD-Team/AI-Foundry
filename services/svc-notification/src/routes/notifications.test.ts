import { describe, it, expect, vi } from "vitest";
import { handleListNotifications, handleMarkRead } from "./notifications.js";
import type { Env } from "../env.js";

interface ApiOk<T> { success: true; data: T }

const sampleRow = {
  notification_id: "ntf-001",
  recipient_id: "rev-1",
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

function mockEnv(dbOverrides?: Parameters<typeof mockDb>[0]): Env {
  return {
    DB_NOTIFICATION: mockDb(dbOverrides),
    QUEUE_PIPELINE: { send: vi.fn() },
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-notification",
    INTERNAL_API_SECRET: "test",
    SLACK_WEBHOOK_URL: "",
  } as unknown as Env;
}

// ── handleListNotifications ──────────────────────────────────────

describe("handleListNotifications", () => {
  it("returns 400 when userId is missing", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/notifications");
    const res = await handleListNotifications(req, env);
    expect(res.status).toBe(400);
  });

  it("returns empty list when no notifications", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/notifications?userId=rev-1");
    const res = await handleListNotifications(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ notifications: unknown[]; limit: number }>;
    expect(body.data.notifications).toEqual([]);
    expect(body.data.limit).toBe(20);
  });

  it("returns formatted notifications", async () => {
    const env = mockEnv({ allResults: [sampleRow] });
    const req = new Request("https://test.internal/notifications?userId=rev-1");
    const res = await handleListNotifications(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ notifications: Array<{ notificationId: string; metadata: unknown }> }>;
    expect(body.data.notifications).toHaveLength(1);
    expect(body.data.notifications[0]?.notificationId).toBe("ntf-001");
    expect(body.data.notifications[0]?.metadata).toEqual({ policyId: "p-1" });
  });

  it("caps limit at 100", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/notifications?userId=rev-1&limit=500");
    const res = await handleListNotifications(req, env);
    const body = await res.json() as ApiOk<{ limit: number }>;
    expect(body.data.limit).toBe(100);
  });

  it("passes status and type filters", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/notifications?userId=rev-1&status=sent&type=hitl_review_needed");
    const res = await handleListNotifications(req, env);
    expect(res.status).toBe(200);
  });

  it("applies offset parameter", async () => {
    const env = mockEnv({ allResults: [] });
    const req = new Request("https://test.internal/notifications?userId=rev-1&offset=10");
    const res = await handleListNotifications(req, env);
    const body = await res.json() as ApiOk<{ offset: number }>;
    expect(body.data.offset).toBe(10);
  });
});

// ── handleMarkRead ───────────────────────────────────────────────

describe("handleMarkRead", () => {
  it("returns 404 when notification not found", async () => {
    const env = mockEnv({ firstResult: null });
    const req = new Request("https://test.internal/notifications/ntf-999/read", { method: "PATCH" });
    const res = await handleMarkRead(req, env, "ntf-999");
    expect(res.status).toBe(404);
  });

  it("returns success when already read", async () => {
    const env = mockEnv({ firstResult: { notification_id: "ntf-001", status: "read" } });
    const req = new Request("https://test.internal/notifications/ntf-001/read", { method: "PATCH" });
    const res = await handleMarkRead(req, env, "ntf-001");
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ status: string; message: string }>;
    expect(body.data.status).toBe("read");
    expect(body.data.message).toBe("Already read");
  });

  it("marks notification as read", async () => {
    const env = mockEnv({ firstResult: { notification_id: "ntf-001", status: "sent" } });
    const req = new Request("https://test.internal/notifications/ntf-001/read", { method: "PATCH" });
    const res = await handleMarkRead(req, env, "ntf-001");
    expect(res.status).toBe(200);
    const body = await res.json() as ApiOk<{ notificationId: string; status: string }>;
    expect(body.data.notificationId).toBe("ntf-001");
    expect(body.data.status).toBe("read");
  });
});
