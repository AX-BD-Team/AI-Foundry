/**
 * Quality evaluation routes for svc-governance.
 * POST /quality-evaluations — create evaluation
 * GET  /quality-evaluations — list evaluations (filtered)
 * GET  /quality-evaluations/summary — aggregated summary
 */

import { CreateQualityEvaluationSchema } from "@ai-foundry/types";
import { ok, badRequest, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-governance:quality-eval");

export async function handleCreateQualityEvaluation(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = CreateQualityEvaluationSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.flatten());
  }

  const { batchId, targetType, targetId, dimension, score, evaluator, notes } = parsed.data;
  const evaluationId = `qe-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await env.DB_GOVERNANCE.prepare(
    `INSERT INTO quality_evaluations
     (evaluation_id, batch_id, target_type, target_id, dimension, score, evaluator, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(evaluationId, batchId ?? null, targetType, targetId, dimension, score, evaluator, notes ?? null, now)
    .run();

  logger.info("Quality evaluation created", { evaluationId, targetType, targetId, dimension });

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        evaluationId,
        targetType,
        targetId,
        dimension,
        score,
        evaluator,
        notes: notes ?? null,
        createdAt: now,
      },
    }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
}

export async function handleListQualityEvaluations(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const targetType = url.searchParams.get("targetType");
  const batchId = url.searchParams.get("batchId");
  const dimension = url.searchParams.get("dimension");

  let sql = "SELECT * FROM quality_evaluations WHERE 1=1";
  const bindings: string[] = [];

  if (targetType) {
    sql += " AND target_type = ?";
    bindings.push(targetType);
  }
  if (batchId) {
    sql += " AND batch_id = ?";
    bindings.push(batchId);
  }
  if (dimension) {
    sql += " AND dimension = ?";
    bindings.push(dimension);
  }
  sql += " ORDER BY created_at DESC LIMIT 100";

  const stmt = env.DB_GOVERNANCE.prepare(sql);
  const result = await (bindings.length > 0
    ? stmt.bind(...bindings)
    : stmt
  ).all();

  return new Response(
    JSON.stringify({ success: true, data: result.results }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export async function handleQualityEvaluationsSummary(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId");

  let sql = `SELECT target_type, dimension, COUNT(*) as count,
             ROUND(AVG(score), 3) as avg_score,
             MIN(score) as min_score, MAX(score) as max_score
             FROM quality_evaluations`;
  const bindings: string[] = [];

  if (batchId) {
    sql += " WHERE batch_id = ?";
    bindings.push(batchId);
  }
  sql += " GROUP BY target_type, dimension ORDER BY target_type, dimension";

  const stmt = env.DB_GOVERNANCE.prepare(sql);
  const result = await (bindings.length > 0
    ? stmt.bind(...bindings)
    : stmt
  ).all();

  return new Response(
    JSON.stringify({ success: true, data: result.results }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
