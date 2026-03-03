import { describe, it, expect, beforeEach } from "vitest";
import { HitlSession } from "./hitl-session.js";

/** In-memory mock of DurableObjectState storage */
function createMockState(): DurableObjectState {
  const store = new Map<string, unknown>();
  let alarmTime: number | null = null;
  return {
    storage: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      put: async (entries: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(entries)) {
          store.set(k, v);
        }
      },
      setAlarm: async (time: number) => {
        alarmTime = time;
      },
      deleteAlarm: async () => {
        alarmTime = null;
      },
      getAlarm: async () => alarmTime,
    },
    id: { toString: () => "test-do-id" },
  } as unknown as DurableObjectState;
}

function jsonReq(path: string, method: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`https://hitl.internal${path}`, opts);
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

describe("HitlSession Durable Object", () => {
  let session: HitlSession;
  let mockState: DurableObjectState;

  beforeEach(() => {
    mockState = createMockState();
    session = new HitlSession(mockState, {});
  });

  // ── Init ──────────────────────────────────────────────────

  it("initializes a new session", async () => {
    const res = await session.fetch(jsonReq("/init", "POST", { policyId: "p-1", sessionId: "s-1" }));
    expect(res.status).toBe(201);
    const body = await parseJson(res);
    expect(body["status"]).toBe("open");
    expect(body["policyId"]).toBe("p-1");
  });

  it("rejects double initialization", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    const res = await session.fetch(jsonReq("/init", "POST", { policyId: "p-2" }));
    expect(res.status).toBe(409);
  });

  it("rejects init without policyId", async () => {
    const res = await session.fetch(jsonReq("/init", "POST", {}));
    expect(res.status).toBe(400);
  });

  // ── GetStatus ─────────────────────────────────────────────

  it("returns 404 for uninitialized session", async () => {
    const res = await session.fetch(jsonReq("/", "GET"));
    expect(res.status).toBe(404);
  });

  it("returns full state after init", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    const res = await session.fetch(jsonReq("/", "GET"));
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body["status"]).toBe("open");
    expect(body["policyId"]).toBe("p-1");
    expect(body["actions"]).toEqual([]);
    expect(body["expiredAt"]).toBeNull();
  });

  // ── Assign ────────────────────────────────────────────────

  it("transitions open -> in_progress on assign", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    const res = await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body["status"]).toBe("in_progress");
    expect(body["reviewerId"]).toBe("rev-1");
  });

  it("rejects assign on non-open session", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    // Already in_progress
    const res = await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-2" }));
    expect(res.status).toBe(409);
  });

  it("rejects assign without reviewerId", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    const res = await session.fetch(jsonReq("/assign", "POST", {}));
    expect(res.status).toBe(400);
  });

  // ── Action ────────────────────────────────────────────────

  it("completes session on approve action", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    const res = await session.fetch(
      jsonReq("/action", "POST", { reviewerId: "rev-1", action: "approve", comment: "LGTM" }),
    );
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body["status"]).toBe("completed");
  });

  it("completes session on reject action", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    const res = await session.fetch(
      jsonReq("/action", "POST", { reviewerId: "rev-1", action: "reject", comment: "Not valid" }),
    );
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body["status"]).toBe("completed");
  });

  it("completes session on modify action", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    const res = await session.fetch(
      jsonReq("/action", "POST", {
        reviewerId: "rev-1",
        action: "modify",
        modifiedFields: { condition: "updated condition" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body["status"]).toBe("completed");
  });

  it("rejects action on non-in_progress session", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    // Session is 'open', not 'in_progress'
    const res = await session.fetch(
      jsonReq("/action", "POST", { reviewerId: "rev-1", action: "approve" }),
    );
    expect(res.status).toBe(409);
  });

  it("rejects invalid action type", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    const res = await session.fetch(
      jsonReq("/action", "POST", { reviewerId: "rev-1", action: "invalid" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects action without reviewerId", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    const res = await session.fetch(
      jsonReq("/action", "POST", { action: "approve" }),
    );
    expect(res.status).toBe(400);
  });

  // ── Full lifecycle ────────────────────────────────────────

  it("tracks action history through full lifecycle", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    await session.fetch(
      jsonReq("/action", "POST", { reviewerId: "rev-1", action: "approve", comment: "Good" }),
    );

    const res = await session.fetch(jsonReq("/", "GET"));
    const body = await parseJson(res);
    expect(body["status"]).toBe("completed");
    const actions = body["actions"] as Array<Record<string, unknown>>;
    expect(actions).toHaveLength(1);
    expect(actions[0]?.["action"]).toBe("approve");
    expect(actions[0]?.["comment"]).toBe("Good");
    expect(body["completedAt"]).toBeDefined();
  });

  // ── Routing ───────────────────────────────────────────────

  it("returns 404 for unknown path", async () => {
    const res = await session.fetch(new Request("https://hitl.internal/unknown"));
    expect(res.status).toBe(404);
  });

  // ── Alarm / TTL ───────────────────────────────────────────

  it("sets alarm on init", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    const alarmTime = await mockState.storage.getAlarm();
    expect(alarmTime).toBeTypeOf("number");
    // Alarm should be ~7 days in the future
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(alarmTime).toBeGreaterThan(Date.now() + sevenDaysMs - 5000);
  });

  it("expires open session on alarm", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.alarm();
    const res = await session.fetch(jsonReq("/", "GET"));
    const body = await parseJson(res);
    expect(body["status"]).toBe("expired");
    expect(body["expiredAt"]).toBeDefined();
  });

  it("expires in_progress session on alarm", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    await session.alarm();
    const res = await session.fetch(jsonReq("/", "GET"));
    const body = await parseJson(res);
    expect(body["status"]).toBe("expired");
  });

  it("does not expire completed session on alarm", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    await session.fetch(jsonReq("/action", "POST", { reviewerId: "rev-1", action: "approve" }));
    await session.alarm();
    const res = await session.fetch(jsonReq("/", "GET"));
    const body = await parseJson(res);
    expect(body["status"]).toBe("completed");
  });

  it("rejects assign on expired session with 410", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.alarm();
    const res = await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    expect(res.status).toBe(410);
  });

  it("rejects action on expired session with 410", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    await session.alarm();
    const res = await session.fetch(
      jsonReq("/action", "POST", { reviewerId: "rev-1", action: "approve" }),
    );
    expect(res.status).toBe(410);
  });

  it("cancels alarm on completion", async () => {
    await session.fetch(jsonReq("/init", "POST", { policyId: "p-1" }));
    await session.fetch(jsonReq("/assign", "POST", { reviewerId: "rev-1" }));
    await session.fetch(jsonReq("/action", "POST", { reviewerId: "rev-1", action: "approve" }));
    const alarmTime = await mockState.storage.getAlarm();
    expect(alarmTime).toBeNull();
  });
});
