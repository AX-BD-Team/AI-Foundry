import { CreateTrustEvaluationSchema } from "@ai-foundry/types";
import { ok, created, badRequest, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-governance:trust");

interface TrustAggRow {
  target_type: string;
  level: string;
  cnt: number;
  avg_score: number;
}

/** GET /trust — aggregated trust dashboard metrics */
export async function handleGetTrust(
  request: Request,
  env: Env,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id") ?? "unknown";

  const result = await env.DB_GOVERNANCE.prepare(
    `SELECT target_type, level, COUNT(*) AS cnt, AVG(score) AS avg_score
     FROM trust_evaluations
     WHERE organization_id = ?
     GROUP BY target_type, level`,
  ).bind(organizationId).all();

  const rows = (result.results ?? []) as unknown as TrustAggRow[];

  const byTargetType: Record<string, Record<string, { count: number; avgScore: number }>> = {};
  let totalEvaluations = 0;

  for (const row of rows) {
    const tt = row.target_type;
    const lv = row.level;
    if (!byTargetType[tt]) {
      byTargetType[tt] = {};
    }
    const bucket = byTargetType[tt];
    if (bucket) {
      bucket[lv] = { count: row.cnt, avgScore: Math.round(row.avg_score * 1000) / 1000 };
    }
    totalEvaluations += row.cnt;
  }

  return ok({ byTargetType, totalEvaluations });
}

/** POST /trust — record a trust evaluation */
export async function handleCreateTrustEvaluation(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = CreateTrustEvaluationSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.flatten());
  }

  const { targetType, targetId, level, score, evaluator, notes } = parsed.data;
  const organizationId = request.headers.get("X-Organization-Id") ?? "unknown";
  const evaluationId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB_GOVERNANCE.prepare(
    `INSERT INTO trust_evaluations
      (eval_id, target_type, target_id, level, score, evaluator, notes, evaluated_at, organization_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(evaluationId, targetType, targetId, level, score, evaluator, notes ?? null, createdAt, organizationId)
    .run();

  logger.info("Trust evaluation recorded", { evaluationId, targetType, targetId, level, score });

  return created({
    evaluationId,
    targetType,
    targetId,
    level,
    score,
    evaluator,
    notes: notes ?? null,
    evaluatedAt: createdAt,
  });
}
