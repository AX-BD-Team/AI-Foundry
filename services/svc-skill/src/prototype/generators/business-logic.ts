/**
 * Business Logic Generator — policies → specs/01-business-logic.md
 *
 * 1. policies를 도메인/유형별 그룹핑
 * 2. 그룹별 시나리오 마크다운 생성 (LLM 보강 또는 기계적 변환)
 */
import type { GeneratedFile } from "@ai-foundry/types";
import type { Env } from "../../env.js";
import type { PolicyRow } from "../collector.js";

interface PolicyGroup {
  domain: string;
  type: string;
  policies: PolicyRow[];
}

function parsePolicyCode(code: string): { domain: string; type: string } {
  const parts = code.split("-");
  return {
    domain: parts[1] ?? "UNKNOWN",
    type: parts.slice(2, -1).join("-") || "GENERAL",
  };
}

function groupPolicies(policies: PolicyRow[]): PolicyGroup[] {
  const map = new Map<string, PolicyGroup>();

  for (const p of policies) {
    const { domain, type } = parsePolicyCode(p.policy_code);
    const key = `${domain}::${type}`;
    const existing = map.get(key);
    if (existing) {
      existing.policies.push(p);
    } else {
      map.set(key, { domain, type, policies: [p] });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.domain.localeCompare(b.domain) || a.type.localeCompare(b.type),
  );
}

// ── 기계적 변환 (LLM 없이 표 형태) ─────────────

function generateMechanicalScenario(group: PolicyGroup): string {
  const lines: string[] = [];
  lines.push(`## ${group.domain} — ${group.type}`);
  lines.push("");
  lines.push(`> ${group.policies.length}개 정책`);
  lines.push("");
  lines.push("| ID | 조건 (When) | 판단 기준 (If) | 처리 (Then) |");
  lines.push("|-----|-------------|----------------|-------------|");

  for (const p of group.policies) {
    const condition = p.condition.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const criteria = p.criteria.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const outcome = p.outcome.replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(`| ${p.policy_code} | ${condition} | ${criteria} | ${outcome} |`);
  }

  lines.push("");
  return lines.join("\n");
}

// ── LLM 보강 시나리오 생성 ──────────────────────

async function generateLlmScenario(
  env: Env,
  group: PolicyGroup,
  maxPerBatch: number,
): Promise<string> {
  // batch로 분할 (maxPerBatch개씩)
  const batches: PolicyRow[][] = [];
  for (let i = 0; i < group.policies.length; i += maxPerBatch) {
    batches.push(group.policies.slice(i, i + maxPerBatch));
  }

  const sections: string[] = [];

  for (const batch of batches) {
    const policiesText = batch.map((p) =>
      `- ${p.policy_code}: 조건="${p.condition}" | 기준="${p.criteria}" | 결과="${p.outcome}"`,
    ).join("\n");

    const prompt = `아래는 "${group.domain} > ${group.type}" 도메인의 비즈니스 정책 ${batch.length}건이다.
각 정책은 condition(조건), criteria(판단기준), outcome(처리결과) 트리플이다.

${policiesText}

위 정책들을 통합하여 아래 형식의 마크다운을 생성하라. 한국어로 작성.

## 시나리오: [시나리오 제목]

### 전제 조건 (Preconditions)
- [해당 시나리오가 적용되는 상황/전제]

### 비즈니스 룰
| ID | 조건 (When) | 판단 기준 (If) | 처리 (Then) | 예외 (Else) |
|-----|-------------|----------------|-------------|-------------|
[각 정책을 행으로 매핑]

### 데이터 영향
- [변경되는 데이터/상태를 추론하여 기술]

### 엣지 케이스
- [예외 상황이나 경계 조건을 추론하여 기술]`;

    try {
      const llmRes = await env.LLM_ROUTER.fetch("https://internal/complete", {
        method: "POST",
        headers: {
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tier: "tier2",
          callerService: "svc-skill",
          messages: [{ role: "user", content: prompt }],
          maxTokens: 2000,
        }),
      });

      if (llmRes.ok) {
        const json = await llmRes.json() as { content?: string };
        if (json.content) {
          sections.push(json.content);
          continue;
        }
      }
    } catch {
      // LLM 실패 시 기계적 변환으로 fallback
    }

    // fallback: 기계적 변환
    sections.push(generateMechanicalScenario({ ...group, policies: batch }));
  }

  return sections.join("\n\n---\n\n");
}

// ── 메인 생성 함수 ──────────────────────────────

export async function generateBusinessLogic(
  env: Env,
  policies: PolicyRow[],
  options?: { skipLlm?: boolean; maxPoliciesPerScenario?: number },
): Promise<GeneratedFile> {
  const groups = groupPolicies(policies);
  const skipLlm = options?.skipLlm ?? false;
  const maxPerBatch = options?.maxPoliciesPerScenario ?? 20;

  const lines: string[] = [];
  lines.push("# 비즈니스 로직 명세");
  lines.push("");
  lines.push(`> AI Foundry 역공학 파이프라인에서 자동 생성됨`);
  lines.push(`> 생성일: ${new Date().toISOString()}`);
  lines.push(`> 총 정책: ${policies.length}건 | 도메인 그룹: ${groups.length}개`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // 목차
  lines.push("## 목차");
  lines.push("");
  for (const g of groups) {
    lines.push(`- [${g.domain} — ${g.type}](#${g.domain.toLowerCase()}-${g.type.toLowerCase()}) (${g.policies.length}건)`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // 각 그룹별 시나리오
  for (const group of groups) {
    if (skipLlm) {
      lines.push(generateMechanicalScenario(group));
    } else {
      const scenario = await generateLlmScenario(env, group, maxPerBatch);
      lines.push(`# ${group.domain} — ${group.type}\n\n${scenario}`);
    }
    lines.push("");
  }

  return {
    path: "specs/01-business-logic.md",
    content: lines.join("\n"),
    type: "spec",
    generatedBy: skipLlm ? "mechanical" : "llm-sonnet",
    sourceCount: policies.length,
  };
}
