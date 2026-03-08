/**
 * GET /policies/quality-trend — daily policy quality trend
 * Used by Trust Dashboard → PolicyQualityChart
 *
 * Returns daily AI accuracy (initial trust_score of candidates) vs
 * HITL accuracy (trust_score after review/approval).
 * Query param: ?days=30 (default 30)
 */
import { ok, err } from "@ai-foundry/utils";
import type { Env } from "../env.js";

interface DailyRow {
  day: string;
  ai_avg: number | null;
  hitl_avg: number | null;
}

export async function handleGetQualityTrend(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const days = Math.min(Number(url.searchParams.get("days")) || 30, 90);
    const organizationId = request.headers.get("X-Organization-Id") ?? "unknown";

    // AI accuracy: avg trust_score per day for all generated policies
    // HITL accuracy: avg trust_score per day for approved policies (post-review)
    const rows = await env.DB_POLICY.prepare(`
      SELECT
        date(created_at) AS day,
        AVG(trust_score) AS ai_avg,
        AVG(CASE WHEN status = 'approved' THEN trust_score ELSE NULL END) AS hitl_avg
      FROM policies
      WHERE created_at >= datetime('now', '-' || ? || ' days')
        AND organization_id = ?
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).bind(days, organizationId).all<DailyRow>();

    const trend = (rows.results ?? []).map((r) => ({
      date: r.day,
      aiAccuracy: r.ai_avg != null ? Math.round(r.ai_avg * 100) : 0,
      hitlAccuracy: r.hitl_avg != null ? Math.round(r.hitl_avg * 100) : 0,
    }));

    return ok({ days, trend });
  } catch (e) {
    return err({ code: "INTERNAL_ERROR", message: String(e) });
  }
}
