/**
 * HITL review routes for svc-policy.
 *
 * Orchestrates between D1 (queryable projection) and HitlSession DO
 * (authoritative state machine) for policy approval workflows.
 */

import { HitlActionSchema } from "@ai-foundry/types";
import { ok, badRequest, notFound, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-policy:hitl");

// ── POST /policies/:id/approve ─────────────────────────────────────

export async function handleApprovePolicy(
  request: Request,
  env: Env,
  policyId: string,
  _ctx: ExecutionContext,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = HitlActionSchema.safeParse({ ...body as object, action: "approve" });
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.flatten());
  }
  const { reviewerId, comment } = parsed.data;

  // Verify policy exists and is reviewable
  const policy = await env.DB_POLICY.prepare(
    "SELECT policy_id, status, organization_id FROM policies WHERE policy_id = ?",
  ).bind(policyId).first();

  if (!policy) {
    return notFound("Policy", policyId);
  }
  const policyStatus = policy["status"] as string;
  if (policyStatus !== "candidate" && policyStatus !== "in_review") {
    return badRequest(`Policy status is '${policyStatus}', expected 'candidate' or 'in_review'`);
  }
  const organizationId = (policy["organization_id"] as string) ?? "unknown";

  // Look up HITL session for this policy
  const session = await env.DB_POLICY.prepare(
    "SELECT session_id FROM hitl_sessions WHERE policy_id = ? AND status NOT IN ('completed', 'expired') LIMIT 1",
  ).bind(policyId).first();

  if (!session) {
    return notFound("Active HITL session for policy", policyId);
  }
  const sessionId = session["session_id"] as string;

  // Forward action to HitlSession DO
  const doId = env.HITL_SESSION.idFromName(policyId);
  const stub = env.HITL_SESSION.get(doId);

  // Auto-assign reviewer if session is still 'open' (skip explicit assign step)
  const statusRes = await stub.fetch(new Request("https://hitl.internal/", { method: "GET" }));
  if (statusRes.ok) {
    const sessionState = await statusRes.json() as { status?: string };
    if (sessionState.status === "open") {
      await stub.fetch(new Request("https://hitl.internal/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerId }),
      }));
    }
  }

  const doRes = await stub.fetch(new Request("https://hitl.internal/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewerId, action: "approve", comment }),
  }));

  if (!doRes.ok) {
    const doBody = await doRes.text();
    logger.warn("DO action failed", { policyId, status: doRes.status, body: doBody });
    return new Response(doBody, { status: doRes.status, headers: { "Content-Type": "application/json" } });
  }

  const now = new Date().toISOString();
  const actionId = crypto.randomUUID();

  // Update D1 projections — must complete before response
  await Promise.all([
    env.DB_POLICY.prepare(
      "UPDATE policies SET status = 'approved', trust_level = 'reviewed', updated_at = ? WHERE policy_id = ?",
    ).bind(now, policyId).run(),
    env.DB_POLICY.prepare(
      "UPDATE hitl_sessions SET status = 'completed', completed_at = ? WHERE session_id = ?",
    ).bind(now, sessionId).run(),
    env.DB_POLICY.prepare(
      "INSERT INTO hitl_actions (action_id, session_id, reviewer_id, action, comment, modified_fields, acted_at) VALUES (?, ?, ?, 'approve', ?, NULL, ?)",
    ).bind(actionId, sessionId, reviewerId, comment ?? null, now).run(),
  ]);

  // Look up trust score for quality metrics
  const policyTrustRow = await env.DB_POLICY.prepare(
    "SELECT trust_score FROM policies WHERE policy_id = ?",
  ).bind(policyId).first();
  const trustScoreVal = policyTrustRow?.["trust_score"] as number | null;

  // Emit PolicyApprovedEvent — must be awaited for reliable pipeline delivery
  await env.QUEUE_PIPELINE.send({
    eventId: crypto.randomUUID(),
    occurredAt: now,
    type: "policy.approved" as const,
    payload: {
      policyId,
      hitlSessionId: sessionId,
      organizationId,
      approvedBy: reviewerId,
      approvedAt: now,
      policyCount: 1,
      ...(trustScoreVal !== null ? { trustScore: trustScoreVal } : {}),
      wasModified: false,
    },
  });

  logger.info("Policy approved", { policyId, sessionId, reviewerId });
  return ok({ policyId, status: "approved" });
}

// ── POST /policies/:id/modify ──────────────────────────────────────

export async function handleModifyPolicy(
  request: Request,
  env: Env,
  policyId: string,
  _ctx: ExecutionContext,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = HitlActionSchema.safeParse({ ...body as object, action: "modify" });
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.flatten());
  }
  const { reviewerId, comment, modifiedFields } = parsed.data;

  if (!modifiedFields || Object.keys(modifiedFields).length === 0) {
    return badRequest("modifiedFields is required for modify action");
  }

  // Only allow known policy fields to be modified
  const allowedFields = new Set(["condition", "criteria", "outcome", "title"]);
  for (const key of Object.keys(modifiedFields)) {
    if (!allowedFields.has(key)) {
      return badRequest(`Field '${key}' cannot be modified. Allowed: ${[...allowedFields].join(", ")}`);
    }
  }

  // Verify policy exists and is reviewable
  const policy = await env.DB_POLICY.prepare(
    "SELECT policy_id, status, organization_id FROM policies WHERE policy_id = ?",
  ).bind(policyId).first();

  if (!policy) {
    return notFound("Policy", policyId);
  }
  const policyStatus = policy["status"] as string;
  if (policyStatus !== "candidate" && policyStatus !== "in_review") {
    return badRequest(`Policy status is '${policyStatus}', expected 'candidate' or 'in_review'`);
  }
  const organizationId = (policy["organization_id"] as string) ?? "unknown";

  // Look up active HITL session
  const session = await env.DB_POLICY.prepare(
    "SELECT session_id FROM hitl_sessions WHERE policy_id = ? AND status NOT IN ('completed', 'expired') LIMIT 1",
  ).bind(policyId).first();

  if (!session) {
    return notFound("Active HITL session for policy", policyId);
  }
  const sessionId = session["session_id"] as string;

  // Forward to DO
  const doId = env.HITL_SESSION.idFromName(policyId);
  const stub = env.HITL_SESSION.get(doId);
  const doRes = await stub.fetch(new Request("https://hitl.internal/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewerId, action: "modify", comment, modifiedFields }),
  }));

  if (!doRes.ok) {
    const doBody = await doRes.text();
    logger.warn("DO action failed", { policyId, status: doRes.status, body: doBody });
    return new Response(doBody, { status: doRes.status, headers: { "Content-Type": "application/json" } });
  }

  const now = new Date().toISOString();
  const actionId = crypto.randomUUID();

  // Build dynamic UPDATE for modified policy fields
  const setClauses: string[] = ["status = 'approved'", "trust_level = 'reviewed'", "updated_at = ?"];
  const bindings: (string | null)[] = [now];

  for (const field of allowedFields) {
    const value = modifiedFields[field];
    if (value !== undefined) {
      setClauses.push(`${field} = ?`);
      bindings.push(value);
    }
  }
  bindings.push(policyId);

  await Promise.all([
    env.DB_POLICY.prepare(
      `UPDATE policies SET ${setClauses.join(", ")} WHERE policy_id = ?`,
    ).bind(...bindings).run(),
    env.DB_POLICY.prepare(
      "UPDATE hitl_sessions SET status = 'completed', completed_at = ? WHERE session_id = ?",
    ).bind(now, sessionId).run(),
    env.DB_POLICY.prepare(
      "INSERT INTO hitl_actions (action_id, session_id, reviewer_id, action, comment, modified_fields, acted_at) VALUES (?, ?, ?, 'modify', ?, ?, ?)",
    ).bind(actionId, sessionId, reviewerId, comment ?? null, JSON.stringify(modifiedFields), now).run(),
  ]);

  // Look up trust score for quality metrics
  const policyTrustRow = await env.DB_POLICY.prepare(
    "SELECT trust_score FROM policies WHERE policy_id = ?",
  ).bind(policyId).first();
  const trustScoreVal = policyTrustRow?.["trust_score"] as number | null;

  // Emit PolicyApprovedEvent (modify = approve with changes)
  await env.QUEUE_PIPELINE.send({
    eventId: crypto.randomUUID(),
    occurredAt: now,
    type: "policy.approved" as const,
    payload: {
      policyId,
      hitlSessionId: sessionId,
      organizationId,
      approvedBy: reviewerId,
      approvedAt: now,
      policyCount: 1,
      ...(trustScoreVal !== null ? { trustScore: trustScoreVal } : {}),
      wasModified: true,
    },
  });

  logger.info("Policy modified and approved", { policyId, sessionId, reviewerId, modifiedFields });
  return ok({ policyId, status: "approved", modifiedFields });
}

// ── POST /policies/:id/reject ──────────────────────────────────────

export async function handleRejectPolicy(
  request: Request,
  env: Env,
  policyId: string,
  _ctx: ExecutionContext,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = HitlActionSchema.safeParse({ ...body as object, action: "reject" });
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.flatten());
  }
  const { reviewerId, comment } = parsed.data;

  // Verify policy exists and is reviewable
  const policy = await env.DB_POLICY.prepare(
    "SELECT policy_id, status FROM policies WHERE policy_id = ?",
  ).bind(policyId).first();

  if (!policy) {
    return notFound("Policy", policyId);
  }
  const policyStatus = policy["status"] as string;
  if (policyStatus !== "candidate" && policyStatus !== "in_review") {
    return badRequest(`Policy status is '${policyStatus}', expected 'candidate' or 'in_review'`);
  }

  // Look up active HITL session
  const session = await env.DB_POLICY.prepare(
    "SELECT session_id FROM hitl_sessions WHERE policy_id = ? AND status NOT IN ('completed', 'expired') LIMIT 1",
  ).bind(policyId).first();

  if (!session) {
    return notFound("Active HITL session for policy", policyId);
  }
  const sessionId = session["session_id"] as string;

  // Forward to DO
  const doId = env.HITL_SESSION.idFromName(policyId);
  const stub = env.HITL_SESSION.get(doId);
  const doRes = await stub.fetch(new Request("https://hitl.internal/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewerId, action: "reject", comment }),
  }));

  if (!doRes.ok) {
    const doBody = await doRes.text();
    logger.warn("DO action failed", { policyId, status: doRes.status, body: doBody });
    return new Response(doBody, { status: doRes.status, headers: { "Content-Type": "application/json" } });
  }

  const now = new Date().toISOString();
  const actionId = crypto.randomUUID();

  // Update D1 projections — no pipeline event for rejections
  await Promise.all([
    env.DB_POLICY.prepare(
      "UPDATE policies SET status = 'rejected', updated_at = ? WHERE policy_id = ?",
    ).bind(now, policyId).run(),
    env.DB_POLICY.prepare(
      "UPDATE hitl_sessions SET status = 'completed', completed_at = ? WHERE session_id = ?",
    ).bind(now, sessionId).run(),
    env.DB_POLICY.prepare(
      "INSERT INTO hitl_actions (action_id, session_id, reviewer_id, action, comment, modified_fields, acted_at) VALUES (?, ?, ?, 'reject', ?, NULL, ?)",
    ).bind(actionId, sessionId, reviewerId, comment ?? null, now).run(),
  ]);

  logger.info("Policy rejected", { policyId, sessionId, reviewerId });
  return ok({ policyId, status: "rejected" });
}

// ── GET /sessions/:id ──────────────────────────────────────────────

export async function handleGetSession(
  _request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  // Look up session in D1 to get the policy_id (DO is keyed by policyId)
  const session = await env.DB_POLICY.prepare(
    "SELECT policy_id FROM hitl_sessions WHERE session_id = ?",
  ).bind(sessionId).first();

  if (!session) {
    return notFound("HITL session", sessionId);
  }
  const policyId = session["policy_id"] as string;

  // Proxy to HitlSession DO
  const doId = env.HITL_SESSION.idFromName(policyId);
  const stub = env.HITL_SESSION.get(doId);
  const doRes = await stub.fetch(new Request("https://hitl.internal/", { method: "GET" }));

  return new Response(doRes.body, {
    status: doRes.status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── GET /hitl/expired ──────────────────────────────────────────────

export async function handleListExpiredSessions(
  _request: Request,
  env: Env,
): Promise<Response> {
  const rows = await env.DB_POLICY.prepare(
    "SELECT session_id, policy_id, status, created_at FROM hitl_sessions WHERE status NOT IN ('completed', 'expired') AND created_at < datetime('now', '-7 days') ORDER BY created_at ASC LIMIT 100",
  ).all();

  return ok({
    expiredCandidates: rows.results,
    count: rows.results.length,
  });
}

// ── POST /hitl/cleanup ─────────────────────────────────────────────

export async function handleCleanupExpiredSessions(
  _request: Request,
  env: Env,
): Promise<Response> {
  const result = await env.DB_POLICY.prepare(
    "UPDATE hitl_sessions SET status = 'expired' WHERE status NOT IN ('completed', 'expired') AND created_at < datetime('now', '-7 days')",
  ).run();

  logger.info("Expired sessions cleaned up", { changes: result.meta.changes });
  return ok({ cleaned: result.meta.changes });
}
