/**
 * Integration tests for svc-analytics top-level fetch handler.
 * Tests routing, authentication, and route-level behavior via the Worker entry point.
 */
import { describe, it, expect, vi } from "vitest";
import worker from "../index.js";
import type { Env } from "../env.js";

// ── Helpers ──────────────────────────────────────────────────────

function mockDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(): Env {
  return {
    DB_ANALYTICS: mockDb(),
    SECURITY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { allowed: true } }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-analytics",
    INTERNAL_API_SECRET: "test-secret",
  };
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

describe("svc-analytics auth", () => {
  it("GET /kpi without secret returns 401", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/kpi");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(401);
    const body = await res.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /cost without secret returns 401", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/cost");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(401);
  });

  it("GET /dashboards without secret returns 401", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/dashboards");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(401);
  });

  it("GET /quality without secret returns 401", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/quality");
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
    const req = new Request("https://test.internal/kpi", {
      headers: { "X-Internal-Secret": "wrong-secret" },
    });
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(401);
  });
});

// ── Health ───────────────────────────────────────────────────────

describe("svc-analytics /health", () => {
  it("GET /health returns 200 without auth", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/health");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as { service: string; status: string };
    expect(body.service).toBe("svc-analytics");
    expect(body.status).toBe("ok");
  });
});

// ── GET /kpi (via worker entry) ──────────────────────────────────

describe("svc-analytics GET /kpi", () => {
  it("returns 200 with KPI data", async () => {
    const env = mockEnv();
    const req = authedReq("https://test.internal/kpi?organizationId=org-1");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { organizationId: string } };
    expect(body.success).toBe(true);
    expect(body.data.organizationId).toBe("org-1");
  });
});

// ── GET /cost (via worker entry) ─────────────────────────────────

describe("svc-analytics GET /cost", () => {
  it("returns 200 with cost data", async () => {
    const env = mockEnv();
    const req = authedReq("https://test.internal/cost");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { byTier: Record<string, unknown> } };
    expect(body.success).toBe(true);
    expect(body.data.byTier).toBeDefined();
  });
});

// ── GET /dashboards (via worker entry) ───────────────────────────

describe("svc-analytics GET /dashboards", () => {
  it("returns 200 with dashboard data", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = authedReq("https://test.internal/dashboards?organizationId=org-1");
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { organizationId: string } };
    expect(body.success).toBe(true);
    expect(body.data.organizationId).toBe("org-1");
  });
});

// ── GET /quality (via worker entry) ──────────────────────────────

describe("svc-analytics GET /quality", () => {
  it("returns 200 with quality data", async () => {
    const env = mockEnv();
    const req = authedReq("https://test.internal/quality");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });
});

// ── POST /internal/queue-event (via worker entry) ────────────────

describe("svc-analytics POST /internal/queue-event", () => {
  it("returns 200 for valid document.uploaded event", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const req = authedReq("https://test.internal/internal/queue-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: "550e8400-e29b-41d4-a716-446655440000",
        occurredAt: "2026-02-28T00:00:00.000Z",
        type: "document.uploaded",
        payload: {
          documentId: "doc-1",
          organizationId: "org-1",
          uploadedBy: "user-1",
          r2Key: "docs/test.pdf",
          fileType: "pdf",
          fileSizeByte: 1024,
          originalName: "test.pdf",
        },
      }),
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { eventType: string } };
    expect(body.data.eventType).toBe("document.uploaded");
  });

  it("returns 400 for invalid event body", async () => {
    const env = mockEnv();
    const req = authedReq("https://test.internal/internal/queue-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "invalid" }),
    });
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(400);
  });
});

// ── 404 for unknown routes ───────────────────────────────────────

describe("svc-analytics unknown routes", () => {
  it("returns 404 for unknown path", async () => {
    const env = mockEnv();
    const req = authedReq("https://test.internal/unknown");
    const res = await worker.fetch(req, env, mockCtx());
    expect(res.status).toBe(404);
  });
});
