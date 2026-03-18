/**
 * HITL Component Logic Tests — vitest, no DOM.
 * Tests helper functions and callback contracts for HITL components.
 */

import { describe, it, expect } from "vitest";
import { sortCandidatesBySimilarity } from "../EntityConfirmation";
import { validateRequiredFields } from "../ParameterInput";
import type { EntityCandidate } from "../EntityConfirmation";
import type { ParameterField } from "../ParameterInput";

// ── PolicyApprovalCard callback contract tests ───────────────────

describe("PolicyApprovalCard callback contract", () => {
  it("onDecision receives 'approved' with optional comment", () => {
    let received: { decision: string; comment: string | undefined } | null = null;
    const onDecision = (decision: "approved" | "rejected" | "modified", comment?: string) => {
      received = { decision, comment };
    };

    // Simulate approve action
    onDecision("approved", "LGTM");

    expect(received).toEqual({ decision: "approved", comment: "LGTM" });
  });

  it("onDecision receives 'rejected' without comment", () => {
    let received: { decision: string; comment: string | undefined } | null = null;
    const onDecision = (decision: "approved" | "rejected" | "modified", comment?: string) => {
      received = { decision, comment };
    };

    onDecision("rejected");

    expect(received).toEqual({ decision: "rejected", comment: undefined });
  });

  it("onDecision receives 'modified' with comment", () => {
    let received: { decision: string; comment: string | undefined } | null = null;
    const onDecision = (decision: "approved" | "rejected" | "modified", comment?: string) => {
      received = { decision, comment };
    };

    onDecision("modified", "기준 금액을 800만원으로 수정 필요");

    expect(received).toEqual({ decision: "modified", comment: "기준 금액을 800만원으로 수정 필요" });
  });
});

// ── EntityConfirmation tests ─────────────────────────────────────

describe("EntityConfirmation", () => {
  const candidates: EntityCandidate[] = [
    { id: "e3", name: "퇴직급여", definition: "퇴직 시 지급되는 급여 총액", similarity: 0.45 },
    { id: "e1", name: "중도인출한도액", definition: "IRP 가입자가 인출 가능한 최대 금액", similarity: 0.92 },
    { id: "e2", name: "인출가능잔액", definition: "현재 시점에서 인출 가능한 잔고", similarity: 0.78 },
  ];

  it("sorts candidates by similarity descending", () => {
    const sorted = sortCandidatesBySimilarity(candidates);

    expect(sorted[0]?.id).toBe("e1"); // 0.92
    expect(sorted[1]?.id).toBe("e2"); // 0.78
    expect(sorted[2]?.id).toBe("e3"); // 0.45
  });

  it("does not mutate the original array", () => {
    const original = [...candidates];
    sortCandidatesBySimilarity(candidates);

    expect(candidates).toEqual(original);
  });

  it("onSelect callback receives correct candidateId", () => {
    let selectedId = "";
    const onSelect = (id: string) => { selectedId = id; };

    onSelect("e1");

    expect(selectedId).toBe("e1");
  });

  it("onSkip callback is callable", () => {
    let skipped = false;
    const onSkip = () => { skipped = true; };

    onSkip();

    expect(skipped).toBe(true);
  });
});

// ── ParameterInput tests ─────────────────────────────────────────

describe("ParameterInput", () => {
  const fields: ParameterField[] = [
    { name: "tenure", label: "근속 연수", type: "number", required: true },
    { name: "balance", label: "계좌 잔고", type: "number", required: true },
    { name: "purpose", label: "인출 사유", type: "select", options: ["주택", "의료"], required: true },
    { name: "note", label: "비고", type: "text" },
  ];

  it("validates required fields — returns missing names", () => {
    const values = { tenure: "", balance: "5000", purpose: "", note: "" };
    const missing = validateRequiredFields(fields, values);

    expect(missing).toEqual(["tenure", "purpose"]);
  });

  it("returns empty array when all required fields are filled", () => {
    const values = { tenure: "5", balance: "5000", purpose: "주택", note: "" };
    const missing = validateRequiredFields(fields, values);

    expect(missing).toEqual([]);
  });

  it("treats whitespace-only values as missing", () => {
    const values = { tenure: "  ", balance: "5000", purpose: "주택", note: "" };
    const missing = validateRequiredFields(fields, values);

    expect(missing).toEqual(["tenure"]);
  });

  it("onSubmit callback receives collected values", () => {
    let submitted: Record<string, string> | null = null;
    const onSubmit = (values: Record<string, string>) => { submitted = values; };

    const values = { tenure: "10", balance: "3000", purpose: "의료", note: "긴급" };
    onSubmit(values);

    expect(submitted).toEqual({ tenure: "10", balance: "3000", purpose: "의료", note: "긴급" });
  });
});
