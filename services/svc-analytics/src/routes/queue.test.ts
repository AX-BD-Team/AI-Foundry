import { describe, it, expect, vi } from "vitest";
import { processQueueEvent, upsertPipelineMetric, upsertCostMetric, upsertSkillUsage } from "./queue.js";
import type { Env } from "../env.js";

function mockDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(): Env {
  return {
    DB_ANALYTICS: mockDb(),
    SECURITY: { fetch: vi.fn() } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-analytics",
    INTERNAL_API_SECRET: "test",
  };
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn() } as unknown as ExecutionContext;
}

function jsonReq(body: unknown): Request {
  return new Request("https://test.internal/internal/queue-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── upsertPipelineMetric ─────────────────────────────────────────

describe("upsertPipelineMetric", () => {
  it("calls INSERT OR IGNORE then UPDATE", async () => {
    const db = mockDb();
    await upsertPipelineMetric(db, "org-1", "documents_uploaded");
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });
});

describe("upsertCostMetric", () => {
  it("calls INSERT OR IGNORE then UPDATE with token counts", async () => {
    const db = mockDb();
    await upsertCostMetric(db, "opus", 5000, 2000);
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });
});

describe("upsertSkillUsage", () => {
  it("calls INSERT OR IGNORE then UPDATE for download count", async () => {
    const db = mockDb();
    await upsertSkillUsage(db, "sk-1", "mcp");
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });
});

// ── processQueueEvent ────────────────────────────────────────────

describe("processQueueEvent", () => {
  it("returns 400 for invalid JSON", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/", { method: "POST", body: "bad" });
    const res = await processQueueEvent(req, env, mockCtx());
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid event schema", async () => {
    const env = mockEnv();
    const res = await processQueueEvent(
      jsonReq({ type: "unknown.event" }),
      env,
      mockCtx(),
    );
    expect(res.status).toBe(400);
  });

  it("processes document.uploaded", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const res = await processQueueEvent(
      jsonReq({
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
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it("processes policy.approved", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const res = await processQueueEvent(
      jsonReq({
        eventId: "550e8400-e29b-41d4-a716-446655440001",
        occurredAt: "2026-02-28T00:00:00.000Z",
        type: "policy.approved",
        payload: {
          policyId: "p-1",
          hitlSessionId: "s-1",
          approvedBy: "rev-1",
          approvedAt: "2026-02-28T00:00:00.000Z",
          policyCount: 3,
        },
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { eventType: string } };
    expect(body.data.eventType).toBe("policy.approved");
  });

  it("processes skill.packaged and records usage", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const res = await processQueueEvent(
      jsonReq({
        eventId: "550e8400-e29b-41d4-a716-446655440002",
        occurredAt: "2026-02-28T00:00:00.000Z",
        type: "skill.packaged",
        payload: {
          skillId: "sk-1",
          ontologyId: "ont-1",
          r2Key: "skill-packages/sk-1.skill.json",
          policyCount: 5,
          trustScore: 0.85,
        },
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it("handles ontology.normalized without error", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const res = await processQueueEvent(
      jsonReq({
        eventId: "550e8400-e29b-41d4-a716-446655440003",
        occurredAt: "2026-02-28T00:00:00.000Z",
        type: "ontology.normalized",
        payload: {
          policyId: "p-1",
          ontologyId: "ont-1",
          termCount: 10,
        },
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
  });
});
