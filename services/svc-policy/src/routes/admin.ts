/**
 * Admin routes for svc-policy.
 *
 * POST /admin/reopen-policies — revert approved policies to candidate status
 * for HITL re-review. Resets D1 projections and HitlSession Durable Objects.
 */

import { ok, badRequest, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-policy:admin");

export async function handleReopenPolicies(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { policyIds } = body as { policyIds?: string[] };
  if (!Array.isArray(policyIds) || policyIds.length === 0) {
    return badRequest("policyIds must be a non-empty array");
  }
  if (policyIds.length > 100) {
    return badRequest("Maximum 100 policies per request");
  }

  const now = new Date().toISOString();
  const reopened: string[] = [];
  const failed: { policyId: string; reason: string }[] = [];

  for (const policyId of policyIds) {
    try {
      // 1. Verify policy exists
      const policy = await env.DB_POLICY.prepare(
        "SELECT policy_id, status FROM policies WHERE policy_id = ?",
      ).bind(policyId).first();

      if (!policy) {
        failed.push({ policyId, reason: "Policy not found" });
        continue;
      }

      // 2. Update policy status to candidate
      await env.DB_POLICY.prepare(
        "UPDATE policies SET status = 'candidate', trust_level = 'unreviewed', updated_at = ? WHERE policy_id = ?",
      ).bind(now, policyId).run();

      // 3. Mark existing hitl_sessions as expired, then create a fresh one
      await env.DB_POLICY.prepare(
        "UPDATE hitl_sessions SET status = 'expired' WHERE policy_id = ? AND status != 'expired'",
      ).bind(policyId).run();

      const newSessionId = crypto.randomUUID();
      await env.DB_POLICY.prepare(
        "INSERT INTO hitl_sessions (session_id, policy_id, reviewer_id, status, do_id, opened_at, completed_at) VALUES (?, ?, NULL, 'open', ?, ?, NULL)",
      ).bind(newSessionId, policyId, policyId, now).run();

      // 4. Reset Durable Object and re-initialize
      const doId = env.HITL_SESSION.idFromName(policyId);
      const stub = env.HITL_SESSION.get(doId);

      await stub.fetch(new Request("https://hitl.internal/reset", { method: "POST" }));
      await stub.fetch(new Request("https://hitl.internal/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId }),
      }));

      reopened.push(policyId);
      logger.info("Policy reopened", { policyId, newSessionId });
    } catch (e) {
      failed.push({ policyId, reason: String(e) });
      logger.warn("Reopen failed", { policyId, error: String(e) });
    }
  }

  return ok({ reopened, failed, total: policyIds.length });
}
