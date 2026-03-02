/**
 * GET /golden-tests — golden test history from prompt versions
 * Used by Trust Dashboard → GoldenTestCard
 *
 * Returns: latest score, recent runs, breakdown by stage
 */
import { ok, err } from "@ai-foundry/utils";
import type { Env } from "../env.js";

interface RecentRunRow {
  prompt_version_id: string;
  prompt_name: string;
  version: string;
  stage: string;
  golden_test_passed: number;
  created_at: string;
}

interface StageRow {
  stage: string;
  total: number;
  passed: number;
}

export async function handleGetGoldenTests(
  _request: Request,
  env: Env,
): Promise<Response> {
  try {
    const db = env.DB_GOVERNANCE;

    const [recentRuns, byStage] = await Promise.all([
      db.prepare(`
        SELECT prompt_version_id, prompt_name, version, stage,
               golden_test_passed, created_at
        FROM prompt_versions
        ORDER BY created_at DESC
        LIMIT 10
      `).all<RecentRunRow>(),

      db.prepare(`
        SELECT
          stage,
          COUNT(*) AS total,
          SUM(CASE WHEN golden_test_passed = 1 THEN 1 ELSE 0 END) AS passed
        FROM prompt_versions
        GROUP BY stage
      `).all<StageRow>(),
    ]);

    const runs = recentRuns.results ?? [];
    const latestRun = runs[0];
    const latestScore = latestRun?.golden_test_passed === 1 ? 1.0 : 0.0;
    const recentScores = runs.slice(0, 5).map((r) =>
      r.golden_test_passed === 1 ? 1.0 : 0.0,
    );

    // Overall pass rate as a "score"
    const allResults = runs;
    const overallScore = allResults.length > 0
      ? Math.round(
          (allResults.filter((r) => r.golden_test_passed === 1).length /
            allResults.length) * 100,
        ) / 100
      : 0;

    const breakdown = (byStage.results ?? []).map((s) => ({
      name: s.stage,
      score: s.total > 0 ? Math.round((s.passed / s.total) * 100) / 100 : 0,
    }));

    return ok({
      latestScore: overallScore,
      latestRunAt: latestRun?.created_at ?? null,
      passed: latestRun?.golden_test_passed === 1,
      recentRuns: recentScores,
      breakdown,
    });
  } catch (e) {
    return err({ code: "INTERNAL_ERROR", message: String(e) });
  }
}
