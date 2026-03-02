/**
 * Queue event handler for svc-analytics.
 * Receives pipeline events and updates metric tables via daily upsert.
 */

import { PipelineEventSchema } from "@ai-foundry/types";
import { createLogger, ok, badRequest } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-analytics:queue");

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function generateId(): string {
  return `met-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Upsert a pipeline_metrics row: increment a single counter column for the given org+date.
 * Uses INSERT OR IGNORE + UPDATE pattern for SQLite (D1).
 */
export async function upsertPipelineMetric(
  db: D1Database,
  organizationId: string,
  column: string,
): Promise<void> {
  const date = today();
  const now = new Date().toISOString();

  // Ensure row exists
  await db
    .prepare(
      `INSERT OR IGNORE INTO pipeline_metrics (metric_id, organization_id, date, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(generateId(), organizationId, date, now)
    .run();

  // Increment counter
  await db
    .prepare(
      `UPDATE pipeline_metrics SET ${column} = COALESCE(${column}, 0) + 1
       WHERE organization_id = ? AND date = ?`,
    )
    .bind(organizationId, date)
    .run();
}

/** Upsert a cost_metrics row: accumulate tokens/requests for the given tier+date. */
export async function upsertCostMetric(
  db: D1Database,
  tier: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const date = today();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT OR IGNORE INTO cost_metrics (metric_id, date, tier, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(generateId(), date, tier, now)
    .run();

  await db
    .prepare(
      `UPDATE cost_metrics SET
         total_input_tokens = COALESCE(total_input_tokens, 0) + ?,
         total_output_tokens = COALESCE(total_output_tokens, 0) + ?,
         total_requests = COALESCE(total_requests, 0) + 1
       WHERE date = ? AND tier = ?`,
    )
    .bind(inputTokens, outputTokens, date, tier)
    .run();
}

/** Upsert skill_usage_metrics row: increment download count. */
export async function upsertSkillUsage(
  db: D1Database,
  skillId: string,
  adapterType: string,
): Promise<void> {
  const date = today();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT OR IGNORE INTO skill_usage_metrics (metric_id, skill_id, date, adapter_type, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(generateId(), skillId, date, adapterType, now)
    .run();

  await db
    .prepare(
      `UPDATE skill_usage_metrics SET download_count = COALESCE(download_count, 0) + 1
       WHERE skill_id = ? AND date = ? AND adapter_type = ?`,
    )
    .bind(skillId, date, adapterType)
    .run();
}

/**
 * Upsert quality_metrics: accumulate quality data for the given org+date.
 */
export async function upsertQualityMetric(
  db: D1Database,
  organizationId: string,
  updates: Record<string, number>,
): Promise<void> {
  const date = today();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT OR IGNORE INTO quality_metrics (metric_id, organization_id, date, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(generateId(), organizationId, date, now)
    .run();

  for (const [column, value] of Object.entries(updates)) {
    await db
      .prepare(
        `UPDATE quality_metrics SET ${column} = COALESCE(${column}, 0) + ?
         WHERE organization_id = ? AND date = ?`,
      )
      .bind(value, organizationId, date)
      .run();
  }
}

/**
 * Insert a single stage latency record.
 */
export async function insertStageLatency(
  db: D1Database,
  documentId: string,
  organizationId: string,
  stage: string,
  durationMs: number,
): Promise<void> {
  const date = today();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO stage_latency (latency_id, document_id, organization_id, stage, duration_ms, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(`lat-${crypto.randomUUID().slice(0, 8)}`, documentId, organizationId, stage, durationMs, date, now)
    .run();
}

export async function processQueueEvent(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = PipelineEventSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("Invalid pipeline event", { error: parsed.error.message });
    return badRequest("Invalid pipeline event");
  }

  const event = parsed.data;

  // Fire-and-forget metric upserts
  const work = (async () => {
    try {
      switch (event.type) {
        case "document.uploaded":
          await upsertPipelineMetric(env.DB_ANALYTICS, event.payload.organizationId, "documents_uploaded");
          break;
        case "ingestion.completed": {
          const { organizationId, documentId, chunkCount } = event.payload;
          await upsertPipelineMetric(env.DB_ANALYTICS, organizationId, "extractions_completed");
          const ingPayload = event.payload as Record<string, unknown>;
          const parseDuration = ingPayload["parseDurationMs"] as number | undefined;
          const chunksValid = ingPayload["chunksValid"] as number | undefined;
          const qIngUpdates: Record<string, number> = {
            ingestion_count: 1,
            total_chunks: chunkCount,
          };
          if (chunksValid !== undefined) qIngUpdates["total_valid_chunks"] = chunksValid;
          if (parseDuration !== undefined) qIngUpdates["total_parse_duration_ms"] = parseDuration;
          await upsertQualityMetric(env.DB_ANALYTICS, organizationId, qIngUpdates);
          if (parseDuration !== undefined) {
            await insertStageLatency(env.DB_ANALYTICS, documentId, organizationId, "ingestion", parseDuration);
          }
          break;
        }
        case "extraction.completed": {
          const { organizationId, documentId } = event.payload;
          await upsertPipelineMetric(env.DB_ANALYTICS, organizationId, "extractions_completed");
          const extPayload = event.payload as Record<string, unknown>;
          const processDuration = extPayload["processDurationMs"] as number | undefined;
          const ruleCount = extPayload["ruleCount"] as number | undefined;
          const qExtUpdates: Record<string, number> = { extraction_count: 1 };
          if (ruleCount !== undefined) qExtUpdates["total_rule_count"] = ruleCount;
          if (processDuration !== undefined) qExtUpdates["total_extract_duration_ms"] = processDuration;
          await upsertQualityMetric(env.DB_ANALYTICS, organizationId, qExtUpdates);
          if (processDuration !== undefined) {
            await insertStageLatency(env.DB_ANALYTICS, documentId, organizationId, "extraction", processDuration);
          }
          break;
        }
        case "policy.candidate_ready": {
          const { organizationId } = event.payload;
          await upsertPipelineMetric(env.DB_ANALYTICS, organizationId, "policies_generated");
          await upsertQualityMetric(env.DB_ANALYTICS, organizationId, { policy_candidate_count: 1 });
          break;
        }
        case "policy.approved": {
          const { organizationId } = event.payload;
          await upsertPipelineMetric(env.DB_ANALYTICS, organizationId, "policies_approved");
          const polPayload = event.payload as Record<string, unknown>;
          const trustScore = polPayload["trustScore"] as number | undefined;
          const wasModified = polPayload["wasModified"] as boolean | undefined;
          const qPolUpdates: Record<string, number> = { policy_approved_count: 1 };
          if (wasModified === true) qPolUpdates["policy_modified_count"] = 1;
          if (trustScore !== undefined) qPolUpdates["total_trust_score"] = trustScore;
          await upsertQualityMetric(env.DB_ANALYTICS, organizationId, qPolUpdates);
          break;
        }
        case "skill.packaged": {
          const { organizationId, skillId, trustScore } = event.payload;
          await upsertPipelineMetric(env.DB_ANALYTICS, organizationId, "skills_packaged");
          await upsertSkillUsage(env.DB_ANALYTICS, skillId, "skill.json");
          const skillPayload = event.payload as Record<string, unknown>;
          const termCount = skillPayload["termCount"] as number | undefined;
          const qSkillUpdates: Record<string, number> = {
            skill_count: 1,
            total_skill_trust_score: trustScore,
          };
          if (termCount !== undefined) qSkillUpdates["total_skill_term_count"] = termCount;
          await upsertQualityMetric(env.DB_ANALYTICS, organizationId, qSkillUpdates);
          break;
        }
        case "ontology.normalized":
          break;
      }
      logger.info("Metric recorded", { type: event.type, eventId: event.eventId });
    } catch (e) {
      logger.error("Failed to record metric", { error: String(e), type: event.type });
    }
  })();

  ctx.waitUntil(work);

  return ok({ status: "processed", eventType: event.type });
}
