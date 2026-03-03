/**
 * HitlSession — Durable Object
 *
 * Manages the lifecycle of a single Human-in-the-Loop review session.
 * Each session corresponds to one policy candidate awaiting Reviewer approval.
 * Session state (status, reviewer assignment, timestamps) is persisted via
 * the Durable Object storage API.
 *
 * State machine: open → in_progress → completed | expired
 *
 * Sessions are addressed by policy candidate ID:
 *   const id = env.HITL_SESSION.idFromName(policyId);
 *   const stub = env.HITL_SESSION.get(id);
 *
 * TTL: Sessions auto-expire after 7 days via DO alarm().
 */

interface HitlActionEntry {
  actionId: string;
  reviewerId: string;
  action: "approve" | "reject" | "modify";
  comment: string | null;
  modifiedFields: Record<string, string> | null;
  actedAt: string;
}

type SessionStatus = "open" | "in_progress" | "completed" | "expired";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class HitlSession implements DurableObject {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    if (method === "GET" && path === "/") {
      return this.getStatus();
    }
    if (method === "POST" && path === "/init") {
      return this.init(request);
    }
    if (method === "POST" && path === "/assign") {
      return this.assign(request);
    }
    if (method === "POST" && path === "/action") {
      return this.recordAction(request);
    }
    if (method === "POST" && path === "/reset") {
      return this.reset();
    }
    return new Response("Not Found", { status: 404 });
  }

  /** DO alarm handler — auto-expire stale sessions */
  async alarm(): Promise<void> {
    const status = await this.state.storage.get<string>("status");
    if (status === "completed" || status === "expired") {
      return;
    }
    await this.state.storage.put({
      status: "expired" as const satisfies SessionStatus,
      expiredAt: new Date().toISOString(),
    });
  }

  /** POST /init — initialize session with policyId (called once at creation) */
  private async init(request: Request): Promise<Response> {
    const existing = await this.state.storage.get<string>("status");
    if (existing) {
      return json({ error: "Session already initialized" }, 409);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { policyId } = body as { policyId?: string };
    if (!policyId) {
      return json({ error: "policyId is required" }, 400);
    }

    const now = new Date().toISOString();
    await this.state.storage.put({
      status: "open" as const satisfies SessionStatus,
      policyId,
      reviewerId: null,
      actions: [] as HitlActionEntry[],
      openedAt: now,
      completedAt: null,
      expiredAt: null,
    });

    // Set TTL alarm
    await this.state.storage.setAlarm(Date.now() + SESSION_TTL_MS);

    return json({
      sessionId: this.state.id.toString(),
      policyId,
      status: "open",
      openedAt: now,
    }, 201);
  }

  /** GET / — return full session state */
  private async getStatus(): Promise<Response> {
    const status = await this.state.storage.get<string>("status");
    if (!status) {
      return json({ error: "Session not initialized" }, 404);
    }

    const [policyId, reviewerId, actions, openedAt, completedAt, expiredAt] = await Promise.all([
      this.state.storage.get<string>("policyId"),
      this.state.storage.get<string | null>("reviewerId"),
      this.state.storage.get<HitlActionEntry[]>("actions"),
      this.state.storage.get<string>("openedAt"),
      this.state.storage.get<string | null>("completedAt"),
      this.state.storage.get<string | null>("expiredAt"),
    ]);

    return json({
      sessionId: this.state.id.toString(),
      policyId,
      status,
      reviewerId: reviewerId ?? null,
      actions: actions ?? [],
      openedAt,
      completedAt: completedAt ?? null,
      expiredAt: expiredAt ?? null,
    });
  }

  /** POST /assign — assign reviewer, open → in_progress */
  private async assign(request: Request): Promise<Response> {
    const status = await this.state.storage.get<string>("status");
    if (status === "expired") {
      return json({ error: "Session has expired" }, 410);
    }
    if (status !== "open") {
      return json(
        { error: `Cannot assign reviewer: session is '${status ?? "uninitialized"}', expected 'open'` },
        409,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { reviewerId } = body as { reviewerId?: string };
    if (!reviewerId) {
      return json({ error: "reviewerId is required" }, 400);
    }

    await this.state.storage.put({
      status: "in_progress" as const satisfies SessionStatus,
      reviewerId,
    });

    return json({
      sessionId: this.state.id.toString(),
      status: "in_progress",
      reviewerId,
    });
  }

  /** POST /action — approve/reject/modify, in_progress → completed */
  private async recordAction(request: Request): Promise<Response> {
    const status = await this.state.storage.get<string>("status");
    if (status === "expired") {
      return json({ error: "Session has expired" }, 410);
    }
    if (status !== "in_progress") {
      return json(
        { error: `Cannot record action: session is '${status ?? "uninitialized"}', expected 'in_progress'` },
        409,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { reviewerId, action, comment, modifiedFields } = body as {
      reviewerId?: string;
      action?: string;
      comment?: string;
      modifiedFields?: Record<string, string>;
    };

    if (!reviewerId || !action) {
      return json({ error: "reviewerId and action are required" }, 400);
    }
    if (action !== "approve" && action !== "reject" && action !== "modify") {
      return json({ error: "action must be 'approve', 'reject', or 'modify'" }, 400);
    }

    const now = new Date().toISOString();
    const entry: HitlActionEntry = {
      actionId: crypto.randomUUID(),
      reviewerId,
      action,
      comment: comment ?? null,
      modifiedFields: modifiedFields ?? null,
      actedAt: now,
    };

    const actions = (await this.state.storage.get<HitlActionEntry[]>("actions")) ?? [];
    actions.push(entry);

    await this.state.storage.put({
      status: "completed" as const satisfies SessionStatus,
      actions,
      completedAt: now,
    });

    // Cancel the expiry alarm since session is now completed
    await this.state.storage.deleteAlarm();

    return json({
      sessionId: this.state.id.toString(),
      status: "completed",
      action: entry,
    });
  }

  /** POST /reset — clear all storage so session can be re-initialized */
  private async reset(): Promise<Response> {
    await this.state.storage.deleteAll();
    await this.state.storage.deleteAlarm();
    return json({ reset: true });
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
