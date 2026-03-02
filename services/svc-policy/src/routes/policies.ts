/**
 * Policy routes — inference trigger, CRUD, pagination.
 */

import {
  PolicyInferRequestSchema,
  PolicyCandidateSchema,
  type PolicyCandidate,
  type PolicyCandidateReadyEvent,
} from "@ai-foundry/types";
import { createLogger, ok, created, badRequest, notFound, errFromUnknown } from "@ai-foundry/utils";
import { buildPolicyInferencePrompt } from "../prompts/policy.js";
import { callOpusLlm } from "../llm/caller.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-policy:routes");

// ── POST /policies/infer ────────────────────────────────────────────

export async function handleInferPolicies(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // 1. Parse & validate body
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const parsed = PolicyInferRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest("Invalid request body", parsed.error.flatten());
  }
  const { extractionId, documentId, organizationId, chunks, sourceDocumentId } = parsed.data;

  // 2. Build prompt and call Opus
  const { system, userContent } = buildPolicyInferencePrompt(chunks);

  let rawContent: string;
  try {
    rawContent = await callOpusLlm(system, userContent, env.LLM_ROUTER, env.INTERNAL_API_SECRET);
  } catch (e) {
    logger.error("Opus LLM call failed", { extractionId, error: String(e) });
    return errFromUnknown(e);
  }

  // 3. Parse JSON response into PolicyCandidate[]
  const cleaned = extractJsonArray(rawContent);
  let candidates: PolicyCandidate[];
  try {
    const jsonParsed: unknown = JSON.parse(cleaned);
    if (!Array.isArray(jsonParsed)) {
      return badRequest("LLM returned non-array JSON");
    }
    candidates = [];
    for (const item of jsonParsed) {
      const result = PolicyCandidateSchema.safeParse(item);
      if (result.success) {
        candidates.push(result.data);
      } else {
        logger.warn("Skipping invalid policy candidate from LLM", {
          error: result.error.message,
        });
      }
    }
  } catch {
    logger.error("Failed to parse LLM JSON output", { rawContent: rawContent.slice(0, 500) });
    return badRequest("LLM returned invalid JSON");
  }

  if (candidates.length === 0) {
    return ok({ policies: [], sessionIds: [], message: "No valid policies inferred" });
  }

  // 4. Insert each candidate into D1 + create HITL sessions
  const now = new Date().toISOString();
  const policyIds: string[] = [];
  const sessionIds: string[] = [];

  for (const candidate of candidates) {
    const policyId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();

    // D1: insert policy (synchronous — must exist before returning)
    try {
      await env.DB_POLICY.prepare(
        `INSERT INTO policies (
          policy_id, extraction_id, organization_id, policy_code, title,
          condition, criteria, outcome, source_document_id,
          source_page_ref, source_excerpt, status, trust_level, trust_score,
          tags, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', 'unreviewed', 0.0, ?, ?, ?)`,
      )
        .bind(
          policyId,
          extractionId,
          organizationId,
          candidate.policyCode,
          candidate.title,
          candidate.condition,
          candidate.criteria,
          candidate.outcome,
          sourceDocumentId,
          candidate.sourcePageRef ?? null,
          candidate.sourceExcerpt ?? null,
          JSON.stringify(candidate.tags),
          now,
          now,
        )
        .run();
    } catch (e) {
      logger.warn("Failed to insert policy", { policyId, policyCode: candidate.policyCode, error: String(e) });
      continue;
    }

    policyIds.push(policyId);
    sessionIds.push(sessionId);

    // D1: insert HITL session (synchronous)
    const doId = env.HITL_SESSION.idFromName(policyId);
    await env.DB_POLICY.prepare(
      `INSERT INTO hitl_sessions (
        session_id, policy_id, reviewer_id, status, do_id, opened_at, completed_at
      ) VALUES (?, ?, NULL, 'open', ?, ?, NULL)`,
    )
      .bind(sessionId, policyId, doId.toString(), now)
      .run();

    // Activate Durable Object (non-blocking — OK for init)
    const stub = env.HITL_SESSION.get(doId);
    ctx.waitUntil(
      stub.fetch("https://hitl-session.internal/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId, sessionId }),
      }),
    );
  }

  // 6. Emit PolicyCandidateReadyEvent to QUEUE_PIPELINE
  for (let i = 0; i < policyIds.length; i++) {
    const pid = policyIds[i];
    const sid = sessionIds[i];
    if (pid == null || sid == null) continue;

    const event: PolicyCandidateReadyEvent = {
      eventId: crypto.randomUUID(),
      occurredAt: now,
      type: "policy.candidate_ready",
      payload: {
        extractionId,
        policyId: pid,
        hitlSessionId: sid,
        organizationId,
        candidateCount: candidates.length,
      },
    };
    await env.QUEUE_PIPELINE.send(event);
  }

  logger.info("Policy inference completed", {
    extractionId,
    candidateCount: candidates.length,
  });

  // 7. Return result
  const resultPolicies = candidates.map((c, i) => ({
    policyId: policyIds[i],
    policyCode: c.policyCode,
    title: c.title,
  }));

  return created({ policies: resultPolicies, sessionIds });
}

// ── GET /policies ───────────────────────────────────────────────────

export interface PolicyRow {
  policy_id: string;
  extraction_id: string;
  organization_id: string;
  policy_code: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  source_document_id: string;
  source_page_ref: string | null;
  source_excerpt: string | null;
  status: string;
  trust_level: string;
  trust_score: number;
  tags: string;
  created_at: string;
  updated_at: string;
}

export async function handleListPolicies(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const extractionId = url.searchParams.get("extractionId");
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);
  const offset = Number(url.searchParams.get("offset") ?? "0");

  let query = "SELECT * FROM policies WHERE 1=1";
  const binds: (string | number)[] = [];

  if (extractionId) {
    query += " AND extraction_id = ?";
    binds.push(extractionId);
  }
  if (status) {
    query += " AND status = ?";
    binds.push(status);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  binds.push(limit, offset);

  const result = await env.DB_POLICY.prepare(query).bind(...binds).all<PolicyRow>();

  const policies = (result.results ?? []).map(formatPolicyRow);

  return ok({ policies, limit, offset });
}

// ── GET /policies/:id ───────────────────────────────────────────────

export async function handleGetPolicy(
  _request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const row = await env.DB_POLICY.prepare(
    "SELECT * FROM policies WHERE policy_id = ?",
  )
    .bind(id)
    .first<PolicyRow>();

  if (!row) {
    return notFound("Policy", id);
  }

  return ok(formatPolicyRow(row));
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract a JSON array from LLM output that may contain markdown fences or
 * surrounding prose. Returns the cleaned string for JSON.parse().
 */
export function extractJsonArray(raw: string): string {
  let text = raw.trim();

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/m.exec(text);
  if (fenceMatch?.[1] != null) {
    text = fenceMatch[1].trim();
  }

  // Extract first [ ... last ] span
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }

  return text;
}

export function formatPolicyRow(row: PolicyRow) {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) {
      tags = parsed.filter((t): t is string => typeof t === "string");
    }
  } catch {
    // keep empty
  }

  return {
    policyId: row.policy_id,
    extractionId: row.extraction_id,
    organizationId: row.organization_id,
    policyCode: row.policy_code,
    title: row.title,
    condition: row.condition,
    criteria: row.criteria,
    outcome: row.outcome,
    sourceDocumentId: row.source_document_id,
    sourcePageRef: row.source_page_ref,
    sourceExcerpt: row.source_excerpt,
    status: row.status,
    trustLevel: row.trust_level,
    trustScore: row.trust_score,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
