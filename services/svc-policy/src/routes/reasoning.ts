/**
 * GET /policies/reasoning-analysis — policy conflict, gap, and similarity analysis
 * Used by Trust Dashboard → ReasoningEngineCard
 *
 * Phase 2 approach: SQL-based keyword analysis on policies table.
 * Full semantic analysis (via LLM) planned for Phase 3.
 */
import { ok, err } from "@ai-foundry/utils";
import type { Env } from "../env.js";

interface PolicyRow {
  policy_id: string;
  policy_code: string;
  title: string;
  condition: string;
  outcome: string;
  status: string;
  organization_id: string;
}

interface ConflictPair {
  policyA: string;
  policyB: string;
  reason: string;
}

interface GapItem {
  area: string;
  description: string;
  severity: "high" | "medium" | "low";
}

interface SimilarGroup {
  keyword: string;
  policies: Array<{ code: string; title: string; organizationId: string }>;
}

export async function handleGetReasoningAnalysis(
  _request: Request,
  env: Env,
): Promise<Response> {
  try {
    const db = env.DB_POLICY;

    const allPolicies = await db.prepare(`
      SELECT policy_id, policy_code, title, condition, outcome,
             status, organization_id
      FROM policies
      ORDER BY created_at DESC
      LIMIT 200
    `).all<PolicyRow>();

    const policies = allPolicies.results ?? [];

    // 1. Conflict detection: policies with similar conditions but different outcomes
    const conflicts: ConflictPair[] = [];
    for (let i = 0; i < policies.length; i++) {
      for (let j = i + 1; j < policies.length; j++) {
        const a = policies[i]!;
        const b = policies[j]!;
        if (
          a.condition && b.condition &&
          hasSignificantOverlap(a.condition, b.condition) &&
          a.outcome !== b.outcome
        ) {
          conflicts.push({
            policyA: a.policy_code,
            policyB: b.policy_code,
            reason: `유사 조건 ("${truncate(a.condition, 40)}")에 다른 결과`,
          });
        }
      }
      if (conflicts.length >= 10) break;
    }

    // 2. Gap analysis: check for expected policy areas with no coverage
    const expectedAreas = [
      { area: "중도인출", keywords: ["중도인출", "중도"] },
      { area: "해지", keywords: ["해지", "해약"] },
      { area: "이전", keywords: ["이전", "이관"] },
      { area: "수급", keywords: ["수급", "연금수령"] },
      { area: "가입", keywords: ["가입", "신규"] },
    ];

    const gaps: GapItem[] = [];
    for (const area of expectedAreas) {
      const covered = policies.some((p) =>
        area.keywords.some((k) =>
          p.title.includes(k) || p.condition.includes(k),
        ),
      );
      if (!covered) {
        gaps.push({
          area: area.area,
          description: `"${area.area}" 관련 정책이 아직 생성되지 않음`,
          severity: "medium",
        });
      }
    }

    // 3. Similar policies: group by keyword across organizations
    const keywordGroups = new Map<string, Array<{ code: string; title: string; organizationId: string }>>();
    const keywords = ["중도인출", "해지", "이전", "수급", "가입", "한도", "세액공제"];
    for (const p of policies) {
      for (const kw of keywords) {
        if (p.title.includes(kw) || p.condition.includes(kw)) {
          const existing = keywordGroups.get(kw) ?? [];
          existing.push({ code: p.policy_code, title: p.title, organizationId: p.organization_id });
          keywordGroups.set(kw, existing);
        }
      }
    }

    const similarGroups: SimilarGroup[] = [];
    for (const [keyword, group] of keywordGroups) {
      if (group.length >= 2) {
        similarGroups.push({ keyword, policies: group.slice(0, 5) });
      }
    }

    return ok({
      conflicts,
      gaps,
      similarGroups,
      totalPoliciesAnalyzed: policies.length,
    });
  } catch (e) {
    return err({ code: "INTERNAL_ERROR", message: String(e) });
  }
}

/** Check if two Korean text strings share significant keyword overlap */
function hasSignificantOverlap(a: string, b: string): boolean {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length >= 2));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length >= 2));
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return wordsA.size > 0 && overlap / wordsA.size >= 0.5;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
