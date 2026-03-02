/**
 * GET /policies/hitl/stats — aggregate HITL review statistics
 * Used by Trust Dashboard → HitlOperationsCard
 */
import { ok, err } from "@ai-foundry/utils";
import type { Env } from "../env.js";

interface ReviewerRow {
  reviewer_id: string;
  review_count: number;
  avg_review_seconds: number | null;
  modify_count: number;
}

interface ActionSummaryRow {
  total_actions: number;
  approve_count: number;
  reject_count: number;
  modify_count: number;
}

interface SessionSummaryRow {
  total_sessions: number;
  completed_sessions: number;
  avg_duration_seconds: number | null;
  weekly_total: number;
  weekly_completed: number;
}

export async function handleGetHitlStats(
  _request: Request,
  env: Env,
): Promise<Response> {
  try {
    const db = env.DB_POLICY;

    // Run all queries in parallel
    const [actionSummary, sessionSummary, reviewerRows] = await Promise.all([
      db.prepare(`
        SELECT
          COUNT(*) AS total_actions,
          SUM(CASE WHEN action = 'approve' THEN 1 ELSE 0 END) AS approve_count,
          SUM(CASE WHEN action = 'reject' THEN 1 ELSE 0 END) AS reject_count,
          SUM(CASE WHEN action = 'modify' THEN 1 ELSE 0 END) AS modify_count
        FROM hitl_actions
      `).first<ActionSummaryRow>(),

      db.prepare(`
        SELECT
          COUNT(*) AS total_sessions,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions,
          AVG(CASE
            WHEN completed_at IS NOT NULL AND opened_at IS NOT NULL
            THEN (julianday(completed_at) - julianday(opened_at)) * 86400
            ELSE NULL
          END) AS avg_duration_seconds,
          SUM(CASE WHEN opened_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS weekly_total,
          SUM(CASE
            WHEN opened_at >= datetime('now', '-7 days') AND status = 'completed'
            THEN 1 ELSE 0 END
          ) AS weekly_completed
        FROM hitl_sessions
      `).first<SessionSummaryRow>(),

      db.prepare(`
        SELECT
          a.reviewer_id,
          COUNT(*) AS review_count,
          AVG(CASE
            WHEN s.completed_at IS NOT NULL AND s.opened_at IS NOT NULL
            THEN (julianday(s.completed_at) - julianday(s.opened_at)) * 86400
            ELSE NULL
          END) AS avg_review_seconds,
          SUM(CASE WHEN a.action = 'modify' THEN 1 ELSE 0 END) AS modify_count
        FROM hitl_actions a
        JOIN hitl_sessions s ON a.session_id = s.session_id
        GROUP BY a.reviewer_id
        ORDER BY review_count DESC
        LIMIT 10
      `).all<ReviewerRow>(),
    ]);

    const totalActions = actionSummary?.total_actions ?? 0;
    const totalSessions = sessionSummary?.total_sessions ?? 0;
    const completedSessions = sessionSummary?.completed_sessions ?? 0;
    const avgDurationSec = sessionSummary?.avg_duration_seconds ?? 0;

    const completionRate = totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0;
    const editRate = totalActions > 0
      ? Math.round(((actionSummary?.modify_count ?? 0) / totalActions) * 100)
      : 0;
    const rejectionRate = totalActions > 0
      ? Math.round(((actionSummary?.reject_count ?? 0) / totalActions) * 100)
      : 0;

    const formatDuration = (sec: number): string => {
      const m = Math.floor(sec / 60);
      const s = Math.round(sec % 60);
      return `${m}분 ${s}초`;
    };

    const reviewers = (reviewerRows.results ?? []).map((r) => ({
      name: r.reviewer_id,
      count: r.review_count,
      avgTime: formatDuration(r.avg_review_seconds ?? 0),
      editRate: r.review_count > 0
        ? Math.round((r.modify_count / r.review_count) * 100)
        : 0,
    }));

    return ok({
      completionRate,
      editRate,
      rejectionRate,
      avgReviewTimeLabel: formatDuration(avgDurationSec),
      weeklyCompleted: sessionSummary?.weekly_completed ?? 0,
      weeklyTotal: sessionSummary?.weekly_total ?? 0,
      reviewers,
    });
  } catch (e) {
    return err({ code: "INTERNAL_ERROR", message: String(e) });
  }
}
