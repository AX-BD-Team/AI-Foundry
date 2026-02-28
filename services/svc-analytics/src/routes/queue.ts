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
  const orgId = "payload" in event && "organizationId" in event.payload
    ? (event.payload as { organizationId: string }).organizationId
    : "default";

  // Fire-and-forget metric upserts
  const work = (async () => {
    try {
      switch (event.type) {
        case "document.uploaded":
          await upsertPipelineMetric(env.DB_ANALYTICS, event.payload.organizationId, "documents_uploaded");
          break;
        case "ingestion.completed":
          await upsertPipelineMetric(env.DB_ANALYTICS, event.payload.organizationId, "extractions_completed");
          break;
        case "extraction.completed":
          await upsertPipelineMetric(env.DB_ANALYTICS, orgId, "extractions_completed");
          break;
        case "policy.candidate_ready":
          await upsertPipelineMetric(env.DB_ANALYTICS, orgId, "policies_generated");
          break;
        case "policy.approved":
          await upsertPipelineMetric(env.DB_ANALYTICS, orgId, "policies_approved");
          break;
        case "skill.packaged":
          await upsertPipelineMetric(env.DB_ANALYTICS, orgId, "skills_packaged");
          await upsertSkillUsage(env.DB_ANALYTICS, event.payload.skillId, "skill.json");
          break;
        case "ontology.normalized":
          // No specific metric column for ontology normalization
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
