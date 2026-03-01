/**
 * Queue event handler — processes extraction.completed events
 * dispatched by svc-queue-router via POST /internal/queue-event.
 *
 * Flow:
 *  1. Receive extraction.completed event
 *  2. Fetch extraction result (rules) from svc-extraction via service binding
 *  3. Build policy inference prompt from extracted rules
 *  4. Call Opus LLM for policy candidate generation
 *  5. Store candidates in D1 + create HITL sessions
 *  6. Emit policy.candidate_ready events
 */

import {
  PipelineEventSchema,
  PolicyCandidateSchema,
  type PolicyCandidate,
  type PolicyCandidateReadyEvent,
} from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";
import { buildPolicyInferencePrompt } from "../prompts/policy.js";
import { callOpusLlm } from "../llm/caller.js";
import { extractJsonArray } from "../routes/policies.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-policy:queue");

interface ExtractionApiResponse {
  success: boolean;
  data: {
    extractionId: string;
    documentId: string;
    status: string;
    result: {
      processes: Array<{ name: string; description: string; steps: string[] }>;
      entities: Array<{ name: string; type: string; attributes: string[] }>;
      relationships: Array<{ from: string; to: string; type: string }>;
      rules: Array<{ condition: string; outcome: string; domain: string }>;
    } | null;
  };
}

/**
 * Process a single pipeline event delivered by svc-queue-router.
 * Expects the body to be a valid PipelineEvent (extraction.completed).
 */
export async function processQueueEvent(
  body: unknown,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const parsed = PipelineEventSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("Invalid pipeline event", {
      error: parsed.error.message,
    });
    return new Response(
      JSON.stringify({ error: "Invalid pipeline event", details: parsed.error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const event = parsed.data;
  if (event.type !== "extraction.completed") {
    logger.info("Ignoring non-extraction event", { type: event.type });
    return new Response(
      JSON.stringify({ status: "ignored", reason: `Event type '${event.type}' not handled by svc-policy` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const { extractionId, documentId, organizationId: eventOrgId } = event.payload;
  const organizationId = eventOrgId ?? "system";
  logger.info("Processing extraction.completed event", { extractionId, documentId, organizationId });

  // 1. Fetch extraction result from svc-extraction
  let extractionResult: ExtractionApiResponse["data"]["result"];
  try {
    const resp = await env.SVC_EXTRACTION.fetch(
      `http://internal/extractions/${extractionId}`,
      {
        method: "GET",
        headers: {
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
        },
      },
    );

    if (!resp.ok) {
      logger.error("Failed to fetch extraction", { extractionId, status: resp.status });
      return new Response(
        JSON.stringify({ status: "error", reason: `Extraction fetch failed: ${resp.status}` }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const data = (await resp.json()) as ExtractionApiResponse;
    extractionResult = data.data.result;
  } catch (e) {
    logger.error("Extraction fetch error", { extractionId, error: String(e) });
    return new Response(
      JSON.stringify({ status: "error", reason: `Extraction fetch error: ${String(e)}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!extractionResult) {
    logger.warn("Extraction result is null", { extractionId });
    return new Response(
      JSON.stringify({ status: "skipped", reason: "Extraction result is null" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 2. Build chunks from extraction result for policy inference
  const chunks: string[] = [];
  for (const rule of extractionResult.rules) {
    chunks.push(`조건: ${rule.condition} → 결과: ${rule.outcome} (도메인: ${rule.domain})`);
  }
  for (const process of extractionResult.processes) {
    const stepsText = process.steps.join(", ");
    chunks.push(`프로세스: ${process.name} — ${process.description}. 단계: ${stepsText}`);
  }
  for (const entity of extractionResult.entities) {
    const attrsText = entity.attributes.join(", ");
    chunks.push(`엔티티: ${entity.name} (${entity.type}) — 속성: ${attrsText}`);
  }

  if (chunks.length === 0) {
    logger.warn("No chunks to infer from", { extractionId });
    return new Response(
      JSON.stringify({ status: "skipped", reason: "No extractable content" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 3. Determine starting SEQ to avoid duplicates
  const maxSeqRow = await env.DB_POLICY.prepare(
    `SELECT MAX(CAST(SUBSTR(policy_code, -3) AS INTEGER)) as max_seq
     FROM policies WHERE organization_id = ?`,
  ).bind(organizationId).first<{ max_seq: number | null }>();
  const startingSeq = (maxSeqRow?.max_seq ?? 0) + 1;

  // 4. Call Opus LLM for policy inference
  const { system, userContent } = buildPolicyInferencePrompt(chunks, startingSeq);

  let rawContent: string;
  try {
    rawContent = await callOpusLlm(system, userContent, env.LLM_ROUTER, env.INTERNAL_API_SECRET);
  } catch (e) {
    logger.error("Opus LLM call failed", { extractionId, error: String(e) });
    return new Response(
      JSON.stringify({ status: "error", reason: `LLM call failed: ${String(e)}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 4. Parse JSON response into PolicyCandidate[]
  const cleaned = extractJsonArray(rawContent);
  let candidates: PolicyCandidate[];
  try {
    const jsonParsed: unknown = JSON.parse(cleaned);
    if (!Array.isArray(jsonParsed)) {
      logger.warn("LLM returned non-array JSON", { extractionId });
      return new Response(
        JSON.stringify({ status: "error", reason: "LLM returned non-array JSON" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
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
    return new Response(
      JSON.stringify({ status: "error", reason: "LLM returned invalid JSON" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (candidates.length === 0) {
    logger.info("No valid policies inferred", { extractionId });
    return new Response(
      JSON.stringify({ status: "processed", policyCount: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 5. Insert each candidate into D1 + create HITL sessions
  const now = new Date().toISOString();
  const policyIds: string[] = [];
  const sessionIds: string[] = [];

  for (const candidate of candidates) {
    const policyId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();

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
          documentId,
          candidate.sourcePageRef ?? null,
          candidate.sourceExcerpt ?? null,
          JSON.stringify(candidate.tags),
          now,
          now,
        )
        .run();
    } catch (e) {
      logger.warn("Failed to insert policy", { policyId, error: String(e) });
      continue;
    }

    policyIds.push(policyId);
    sessionIds.push(sessionId);

    const doId = env.HITL_SESSION.idFromName(policyId);
    await env.DB_POLICY.prepare(
      `INSERT INTO hitl_sessions (
        session_id, policy_id, reviewer_id, status, do_id, opened_at, completed_at
      ) VALUES (?, ?, NULL, 'open', ?, ?, NULL)`,
    )
      .bind(sessionId, policyId, doId.toString(), now)
      .run();

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

    const outEvent: PolicyCandidateReadyEvent = {
      eventId: crypto.randomUUID(),
      occurredAt: now,
      type: "policy.candidate_ready",
      payload: {
        extractionId,
        policyId: pid,
        hitlSessionId: sid,
        candidateCount: candidates.length,
      },
    };
    ctx.waitUntil(env.QUEUE_PIPELINE.send(outEvent));
  }

  logger.info("Queue-triggered policy inference completed", {
    extractionId,
    documentId,
    candidateCount: candidates.length,
    policyIds,
  });

  return new Response(
    JSON.stringify({
      status: "processed",
      eventId: event.eventId,
      type: event.type,
      extractionId,
      policyCount: candidates.length,
      policyIds,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
