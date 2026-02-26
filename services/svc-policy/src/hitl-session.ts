/**
 * HitlSession — Durable Object
 *
 * Manages the lifecycle of a single Human-in-the-Loop review session.
 * Each session corresponds to one policy candidate awaiting Reviewer approval.
 * Session state (status, reviewer assignment, timestamps) is persisted via
 * the Durable Object storage API.
 *
 * Sessions are addressed by policy candidate ID:
 *   const id = env.HITL_SESSION.idFromName(policyId);
 *   const stub = env.HITL_SESSION.get(id);
 */

export class HitlSession implements DurableObject {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const id = this.state.id;

    return new Response(
      JSON.stringify({ status: "ok", sessionId: id.toString() }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
}
