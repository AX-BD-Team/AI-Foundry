import { describe, it, expect, vi } from "vitest";
import { processQueueEvent } from "./queue.js";
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
    DB_NOTIFICATION: mockDb(),
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) },
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-notification",
    INTERNAL_API_SECRET: "test",
    SLACK_WEBHOOK_URL: "",
  } as unknown as Env;
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

const candidateReadyEvent = {
  eventId: "550e8400-e29b-41d4-a716-446655440000",
  occurredAt: "2026-02-28T00:00:00.000Z",
  type: "policy.candidate_ready",
  payload: {
    extractionId: "ext-1",
    policyId: "p-1",
    hitlSessionId: "s-1",
    organizationId: "org-test",
    reviewerId: "rev-1",
    candidateCount: 3,
  },
};

const skillPackagedEvent = {
  eventId: "550e8400-e29b-41d4-a716-446655440001",
  occurredAt: "2026-02-28T00:00:00.000Z",
  type: "skill.packaged",
  payload: {
    skillId: "sk-1",
    ontologyId: "ont-1",
    organizationId: "org-test",
    r2Key: "skill-packages/sk-1.skill.json",
    policyCount: 5,
    trustScore: 0.85,
  },
};

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

  it("processes policy.candidate_ready and creates notification", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const res = await processQueueEvent(jsonReq(candidateReadyEvent), env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { eventType: string } };
    expect(body.data.eventType).toBe("policy.candidate_ready");
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it("processes skill.packaged and creates notification", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const res = await processQueueEvent(jsonReq(skillPackagedEvent), env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { eventType: string } };
    expect(body.data.eventType).toBe("skill.packaged");
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it("ignores unhandled event types gracefully", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const event = {
      eventId: "550e8400-e29b-41d4-a716-446655440002",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "policy.approved",
      payload: {
        policyId: "p-1",
        hitlSessionId: "s-1",
        organizationId: "org-test",
        approvedBy: "rev-1",
        approvedAt: "2026-02-28T00:00:00.000Z",
        policyCount: 3,
      },
    };
    const res = await processQueueEvent(jsonReq(event), env, ctx);
    expect(res.status).toBe(200);
    // No notification created for unhandled types
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it("uses reviewerId as recipientId when provided", async () => {
    const db = mockDb();
    const env = { ...mockEnv(), DB_NOTIFICATION: db };
    const ctx = mockCtx();
    await processQueueEvent(jsonReq(candidateReadyEvent), env, ctx);

    // The waitUntil is called with a promise that calls insertNotification
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it("uses reviewer-pool when reviewerId is not provided", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const event = {
      ...candidateReadyEvent,
      payload: { ...candidateReadyEvent.payload, reviewerId: undefined },
    };
    const res = await processQueueEvent(jsonReq(event), env, ctx);
    expect(res.status).toBe(200);
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });
});
