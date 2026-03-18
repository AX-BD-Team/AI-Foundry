import type {
  EvalResult,
  EvalIssue,
  ConsensusVerdict,
  ConsensusDecision,
} from "@ai-foundry/types";
import type { PolicyCandidate } from "@ai-foundry/types";
import {
  buildAdvocatePrompt,
  buildDevilPrompt,
  buildJudgePrompt,
  buildRound2Prompt,
} from "../prompts/consensus.js";

export interface ConsensusEnv {
  LLM_ROUTER: Fetcher;
  INTERNAL_API_SECRET: string;
}

/** Round 2 심화 질문 */
const ROUND_2_QUESTIONS = [
  "이 policy는 root cause인가, symptom인가?",
  "이 policy 없이도 outcome이 다른 규칙으로 보장되는가?",
];

/**
 * Deliberative Consensus Engine — Opus 다중 모델 합의.
 *
 * HITL needs_review 판정 건에만 적용하여 비용 최적화.
 * Round 1: Advocate → Devil → Judge (3 × Opus 호출)
 * Round 2: Judge가 split 판정 시 심화 질의 (1 × Opus 추가)
 */
export class ConsensusEngine {
  /**
   * Policy에 대한 다자 합의 토론을 실행한다.
   *
   * @param candidate - 평가 대상 policy
   * @param env - Service Binding 환경
   * @returns EvalResult with ConsensusVerdict metadata
   */
  async deliberate(
    candidate: PolicyCandidate,
    env: ConsensusEnv,
  ): Promise<EvalResult> {
    const startMs = Date.now();

    try {
      // ─── Round 1: 3자 토론 ─────────────────────────

      // 1. Advocate: 타당성 옹호
      const advocateArgs = await this.callRole(
        buildAdvocatePrompt(candidate),
        env,
      );

      // 2. Devil: 문제점 지적
      const devilArgs = await this.callRole(
        buildDevilPrompt(candidate),
        env,
      );

      // 3. Judge: 종합 판정
      const judgeResponse = await this.callRole(
        buildJudgePrompt(candidate, advocateArgs, devilArgs),
        env,
      );
      const round1Decision = this.parseJudgeDecision(judgeResponse);

      let finalDecision = round1Decision.decision;
      let rounds = 1;
      let round2Reasoning: string | undefined;

      // ─── Round 2: Split 심화 ─────────────────────────

      if (finalDecision === "split") {
        rounds = 2;

        const round2Response = await this.callRole(
          buildRound2Prompt(candidate, advocateArgs, devilArgs, ROUND_2_QUESTIONS),
          env,
        );
        const round2Decision = this.parseJudgeDecision(round2Response);
        finalDecision = round2Decision.decision === "split"
          ? "reject"  // Round 2에서도 split → 보수적으로 reject
          : round2Decision.decision;
        round2Reasoning = round2Decision.reasoning;
      }

      const consensusVerdict: ConsensusVerdict = {
        finalDecision,
        rounds,
        advocateArgs,
        devilArgs,
        judgeReasoning: round1Decision.reasoning,
        round2Questions: rounds === 2 ? ROUND_2_QUESTIONS : undefined,
        round2Reasoning,
      };

      // verdict 매핑 — consensusVerdict.finalDecision 사용 (타입 내로잉 우회)
      const fd = consensusVerdict.finalDecision;
      const verdictMap: Record<ConsensusDecision, "consensus_approve" | "consensus_reject" | "consensus_split"> = {
        approve: "consensus_approve",
        reject: "consensus_reject",
        split: "consensus_split",
      };
      const verdict = verdictMap[fd];

      const score = fd === "approve" ? 0.85
        : fd === "reject" ? 0.2
        : 0.5;

      const issues: EvalIssue[] = [];
      if (fd === "reject") {
        issues.push({
          code: "CON_REJECTED",
          severity: "error",
          message: `Consensus rejected: ${round1Decision.reasoning.slice(0, 200)}`,
        });
      }
      if (fd === "split") {
        issues.push({
          code: "CON_SPLIT",
          severity: "warning",
          message: "Consensus 토론에서 합의에 도달하지 못함 — 리뷰어 판단 필요",
        });
      }

      return {
        stage: "consensus",
        verdict,
        score,
        issues,
        evaluator: "opus-consensus",
        durationMs: Date.now() - startMs,
        timestamp: new Date().toISOString(),
        metadata: { consensusVerdict },
      };
    } catch (error) {
      // Fail-open: Consensus 실패 시 skipped
      return {
        stage: "consensus",
        verdict: "skipped",
        score: 0,
        issues: [{
          code: "CON_ERROR",
          severity: "warning",
          message: `Consensus evaluation skipped: ${String(error)}`,
        }],
        evaluator: "opus-consensus",
        durationMs: Date.now() - startMs,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 특정 역할(Advocate/Devil/Judge)로 Opus LLM을 호출한다.
   */
  private async callRole(
    prompt: { system: string; userContent: string },
    env: ConsensusEnv,
  ): Promise<string> {
    const response = await env.LLM_ROUTER.fetch(
      "https://svc-llm-router.internal/complete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
        },
        body: JSON.stringify({
          tier: "opus",
          messages: [{ role: "user", content: prompt.userContent }],
          system: prompt.system,
          callerService: "svc-policy",
          maxTokens: 2048,
          temperature: 0.3,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM Router error ${response.status}: ${text}`);
    }

    const json = (await response.json()) as {
      success: boolean;
      data: { content: string };
      error?: { message: string };
    };
    if (!json.success) {
      throw new Error(`LLM failure: ${json.error?.message ?? "unknown"}`);
    }

    return json.data.content;
  }

  /**
   * Judge 응답에서 decision과 reasoning을 추출한다.
   * 기대 JSON 형식: { "decision": "approve|reject|split", "reasoning": "..." }
   */
  private parseJudgeDecision(
    response: string,
  ): { decision: ConsensusDecision; reasoning: string } {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { decision: "split", reasoning: response.slice(0, 500) };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const decision = parsed["decision"];
      const reasoning = parsed["reasoning"];

      if (
        typeof decision === "string" &&
        (decision === "approve" || decision === "reject" || decision === "split")
      ) {
        return {
          decision,
          reasoning: typeof reasoning === "string" ? reasoning : "",
        };
      }
    } catch {
      // JSON parse failure — fallback
    }

    return { decision: "split", reasoning: response.slice(0, 500) };
  }
}
