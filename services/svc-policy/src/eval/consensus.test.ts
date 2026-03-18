import { describe, it, expect, beforeEach } from "vitest";
import { ConsensusEngine, type ConsensusEnv } from "./consensus.js";
import type { PolicyCandidate, ConsensusVerdict } from "@ai-foundry/types";

// ── Helpers ──────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<PolicyCandidate> = {}): PolicyCandidate {
  return {
    policyCode: "POL-PENSION-WD-001",
    title: "퇴직연금 중도인출 — 주택구입",
    condition: "가입자가 무주택 세대주이고 주택구입 목적으로 중도인출을 신청하는 경우",
    criteria: "주택매매계약서 및 무주택확인서를 제출하고, 가입기간이 1년 이상이어야 한다",
    outcome: "적립금의 50% 이내에서 중도인출을 승인한다",
    tags: ["퇴직연금", "중도인출", "주택구입"],
    sourceExcerpt: "제5조 중도인출 사유",
    sourcePageRef: "p.12",
    ...overrides,
  };
}

function llmSuccess(content: string): Response {
  return new Response(
    JSON.stringify({ success: true, data: { content } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function llmFailure(status = 500): Response {
  return new Response(
    JSON.stringify({ success: false, error: { message: "Internal error" } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function judgeJson(decision: "approve" | "reject" | "split", reasoning: string): string {
  return JSON.stringify({ decision, reasoning });
}

// ── Tests ────────────────────────────────────────────────────────────

describe("ConsensusEngine", () => {
  let engine: ConsensusEngine;
  const candidate = makeCandidate();

  beforeEach(() => {
    engine = new ConsensusEngine();
  });

  function buildEnv(fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): ConsensusEnv {
    return {
      LLM_ROUTER: { fetch: fetchFn } as unknown as Fetcher,
      INTERNAL_API_SECRET: "test-secret",
    };
  }

  // ── Round 1: approve ──────────────────────────────────────────────

  it("Judge가 approve → finalDecision 'approve', rounds = 1", async () => {
    let callCount = 0;
    const env = buildEnv(async () => {
      callCount++;
      if (callCount === 1) return llmSuccess("이 정책은 구체적인 조건을 갖추고 있습니다.");
      if (callCount === 2) return llmSuccess("주택구입 범위가 모호할 수 있습니다.");
      return llmSuccess(judgeJson("approve", "조건이 충분히 구체적이고 기준이 명확합니다."));
    });

    const result = await engine.deliberate(candidate, env);

    expect(result.stage).toBe("consensus");
    expect(result.verdict).toBe("consensus_approve");
    expect(result.score).toBe(0.85);
    expect(result.issues).toHaveLength(0);
    expect(callCount).toBe(3);

    const meta = result.metadata as { consensusVerdict: ConsensusVerdict } | undefined;
    expect(meta?.consensusVerdict.finalDecision).toBe("approve");
    expect(meta?.consensusVerdict.rounds).toBe(1);
  });

  // ── Round 1: reject ───────────────────────────────────────────────

  it("Judge가 reject → finalDecision 'reject', rounds = 1", async () => {
    let callCount = 0;
    const env = buildEnv(async () => {
      callCount++;
      if (callCount === 1) return llmSuccess("타당성 주장");
      if (callCount === 2) return llmSuccess("심각한 논리적 모순 발견");
      return llmSuccess(judgeJson("reject", "조건과 결과 사이에 논리적 모순이 있습니다."));
    });

    const result = await engine.deliberate(candidate, env);

    expect(result.verdict).toBe("consensus_reject");
    expect(result.score).toBe(0.2);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe("CON_REJECTED");
    expect(result.issues[0]?.severity).toBe("error");
    expect(callCount).toBe(3);

    const meta = result.metadata as { consensusVerdict: ConsensusVerdict } | undefined;
    expect(meta?.consensusVerdict.rounds).toBe(1);
  });

  // ── Round 1: split → Round 2 triggered ────────────────────────────

  it("Judge가 split → Round 2 실행, rounds = 2", async () => {
    let callCount = 0;
    const env = buildEnv(async () => {
      callCount++;
      if (callCount === 1) return llmSuccess("옹호 논거");
      if (callCount === 2) return llmSuccess("반론 논거");
      if (callCount === 3) return llmSuccess(judgeJson("split", "판단이 어렵습니다."));
      // Round 2
      return llmSuccess(judgeJson("approve", "심화 검토 결과 승인합니다."));
    });

    const result = await engine.deliberate(candidate, env);

    expect(result.verdict).toBe("consensus_approve");
    expect(callCount).toBe(4); // 3 (Round 1) + 1 (Round 2)

    const meta = result.metadata as { consensusVerdict: ConsensusVerdict } | undefined;
    expect(meta?.consensusVerdict.rounds).toBe(2);
    expect(meta?.consensusVerdict.round2Questions).toHaveLength(2);
    expect(meta?.consensusVerdict.round2Reasoning).toBe("심화 검토 결과 승인합니다.");
  });

  // ── Round 2: resolves to reject ───────────────────────────────────

  it("Round 2에서 reject → finalDecision 'reject'", async () => {
    let callCount = 0;
    const env = buildEnv(async () => {
      callCount++;
      if (callCount === 1) return llmSuccess("옹호");
      if (callCount === 2) return llmSuccess("반론");
      if (callCount === 3) return llmSuccess(judgeJson("split", "결정 불가"));
      return llmSuccess(judgeJson("reject", "root cause가 아닌 symptom입니다."));
    });

    const result = await engine.deliberate(candidate, env);

    expect(result.verdict).toBe("consensus_reject");
    expect(result.score).toBe(0.2);

    const meta = result.metadata as { consensusVerdict: ConsensusVerdict } | undefined;
    expect(meta?.consensusVerdict.rounds).toBe(2);
    expect(meta?.consensusVerdict.finalDecision).toBe("reject");
  });

  // ── Round 2: still split → conservative reject ────────────────────

  it("Round 2에서도 split → 보수적으로 reject 처리", async () => {
    let callCount = 0;
    const env = buildEnv(async () => {
      callCount++;
      if (callCount === 1) return llmSuccess("옹호");
      if (callCount === 2) return llmSuccess("반론");
      if (callCount === 3) return llmSuccess(judgeJson("split", "판단 불가"));
      return llmSuccess(judgeJson("split", "여전히 결정 불가"));
    });

    const result = await engine.deliberate(candidate, env);

    expect(result.verdict).toBe("consensus_reject");

    const meta = result.metadata as { consensusVerdict: ConsensusVerdict } | undefined;
    expect(meta?.consensusVerdict.finalDecision).toBe("reject");
    expect(meta?.consensusVerdict.rounds).toBe(2);
  });

  // ── Advocate arguments present ────────────────────────────────────

  it("Advocate 논거가 결과에 포함됨", async () => {
    const advocateText = "이 정책은 퇴직연금법 제22조에 근거합니다.";
    let callCount = 0;
    const env = buildEnv(async () => {
      callCount++;
      if (callCount === 1) return llmSuccess(advocateText);
      if (callCount === 2) return llmSuccess("반론");
      return llmSuccess(judgeJson("approve", "승인"));
    });

    const result = await engine.deliberate(candidate, env);

    const meta = result.metadata as { consensusVerdict: ConsensusVerdict } | undefined;
    expect(meta?.consensusVerdict.advocateArgs).toBe(advocateText);
  });

  // ── Devil arguments present ───────────────────────────────────────

  it("Devil 논거가 결과에 포함됨", async () => {
    const devilText = "주택구입의 범위가 정의되지 않았습니다.";
    let callCount = 0;
    const env = buildEnv(async () => {
      callCount++;
      if (callCount === 1) return llmSuccess("옹호");
      if (callCount === 2) return llmSuccess(devilText);
      return llmSuccess(judgeJson("approve", "승인"));
    });

    const result = await engine.deliberate(candidate, env);

    const meta = result.metadata as { consensusVerdict: ConsensusVerdict } | undefined;
    expect(meta?.consensusVerdict.devilArgs).toBe(devilText);
  });

  // ── Judge reasoning present ───────────────────────────────────────

  it("Judge reasoning이 결과에 포함됨", async () => {
    const reasoning = "조건과 기준이 명확하여 실무 적용이 가능합니다.";
    let callCount = 0;
    const env = buildEnv(async () => {
      callCount++;
      if (callCount === 1) return llmSuccess("옹호");
      if (callCount === 2) return llmSuccess("반론");
      return llmSuccess(judgeJson("approve", reasoning));
    });

    const result = await engine.deliberate(candidate, env);

    const meta = result.metadata as { consensusVerdict: ConsensusVerdict } | undefined;
    expect(meta?.consensusVerdict.judgeReasoning).toBe(reasoning);
  });

  // ── LLM failure in Advocate → graceful fallback ───────────────────

  it("Advocate LLM 실패 → skipped verdict로 graceful fallback", async () => {
    const env = buildEnv(async () => {
      return llmFailure(500);
    });

    const result = await engine.deliberate(candidate, env);

    expect(result.stage).toBe("consensus");
    expect(result.verdict).toBe("skipped");
    expect(result.score).toBe(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe("CON_ERROR");
    expect(result.evaluator).toBe("opus-consensus");
  });

  // ── LLM failure in Judge → graceful fallback ──────────────────────

  it("Judge LLM 실패 → skipped verdict로 graceful fallback", async () => {
    let callCount = 0;
    const env = buildEnv(async () => {
      callCount++;
      if (callCount === 1) return llmSuccess("옹호 성공");
      if (callCount === 2) return llmSuccess("반론 성공");
      // Judge call fails
      return llmFailure(503);
    });

    const result = await engine.deliberate(candidate, env);

    expect(result.verdict).toBe("skipped");
    expect(result.issues[0]?.code).toBe("CON_ERROR");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // ── EvalResult has correct stage ──────────────────────────────────

  it("EvalResult의 stage가 'consensus'이고 evaluator가 'opus-consensus'", async () => {
    let callCount = 0;
    const env = buildEnv(async () => {
      callCount++;
      if (callCount === 1) return llmSuccess("옹호");
      if (callCount === 2) return llmSuccess("반론");
      return llmSuccess(judgeJson("approve", "승인"));
    });

    const result = await engine.deliberate(candidate, env);

    expect(result.stage).toBe("consensus");
    expect(result.evaluator).toBe("opus-consensus");
    expect(result.timestamp).toBeTruthy();
    expect(typeof result.durationMs).toBe("number");
  });

  // ── Judge returns non-JSON → fallback to split ────────────────────

  it("Judge가 비정형 텍스트 반환 → split으로 파싱, Round 2 실행", async () => {
    let callCount = 0;
    const env = buildEnv(async () => {
      callCount++;
      if (callCount === 1) return llmSuccess("옹호");
      if (callCount === 2) return llmSuccess("반론");
      if (callCount === 3) return llmSuccess("이 정책은 판단하기 어렵습니다. 추가 검토가 필요합니다.");
      // Round 2
      return llmSuccess(judgeJson("approve", "최종 승인"));
    });

    const result = await engine.deliberate(candidate, env);

    expect(result.verdict).toBe("consensus_approve");
    expect(callCount).toBe(4); // Round 2까지 진행

    const meta = result.metadata as { consensusVerdict: ConsensusVerdict } | undefined;
    expect(meta?.consensusVerdict.rounds).toBe(2);
  });

  // ── LLM returns success:false → graceful fallback ─────────────────

  it("LLM Router가 200이지만 success:false → skipped fallback", async () => {
    const env = buildEnv(async () => {
      return new Response(
        JSON.stringify({ success: false, error: { message: "Rate limit exceeded" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await engine.deliberate(candidate, env);

    expect(result.verdict).toBe("skipped");
    expect(result.issues[0]?.message).toContain("Rate limit exceeded");
  });
});
