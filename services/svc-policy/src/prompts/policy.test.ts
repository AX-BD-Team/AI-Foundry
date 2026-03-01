import { describe, it, expect } from "vitest";
import { buildPolicyInferencePrompt } from "./policy.js";

describe("buildPolicyInferencePrompt", () => {
  it("returns system and userContent for single chunk", () => {
    const result = buildPolicyInferencePrompt(["퇴직연금 가입 절차"]);
    expect(result.system).toContain("policy analyst");
    expect(result.system).toContain("POL-PENSION-{TYPE}-{SEQ}");
    expect(result.userContent).toContain("--- 청크 1 ---");
    expect(result.userContent).toContain("퇴직연금 가입 절차");
  });

  it("numbers multiple chunks sequentially", () => {
    const chunks = ["첫 번째 청크", "두 번째 청크", "세 번째 청크"];
    const result = buildPolicyInferencePrompt(chunks);
    expect(result.userContent).toContain("--- 청크 1 ---");
    expect(result.userContent).toContain("--- 청크 2 ---");
    expect(result.userContent).toContain("--- 청크 3 ---");
  });

  it("handles empty chunks array", () => {
    const result = buildPolicyInferencePrompt([]);
    expect(result.system).toBeDefined();
    expect(result.userContent).toBeDefined();
    // No chunk markers
    expect(result.userContent).not.toContain("--- 청크");
  });

  it("system prompt includes all 10 policy TYPE codes", () => {
    const result = buildPolicyInferencePrompt(["test"]);
    const types = ["WD", "EN", "TR", "CT", "BN", "MG", "RG", "CL", "NF", "EX"];
    for (const t of types) {
      expect(result.system).toContain(t);
    }
  });

  it("system prompt enforces JSON-only output", () => {
    const result = buildPolicyInferencePrompt(["test"]);
    expect(result.system).toContain("CRITICAL RULES");
    expect(result.system).toContain("ONLY a JSON array");
    expect(result.system).toContain("Start your response with [");
  });

  it("preserves special characters in chunks", () => {
    const chunks = ['{"key": "value"}', "line1\nline2"];
    const result = buildPolicyInferencePrompt(chunks);
    expect(result.userContent).toContain('{"key": "value"}');
    expect(result.userContent).toContain("line1\nline2");
  });

  it("uses custom startingSeq in user prompt", () => {
    const result = buildPolicyInferencePrompt(["test chunk"], 42);
    expect(result.userContent).toContain("042");
    expect(result.userContent).toContain("SEQ 시작 번호: 042");
  });

  it("defaults startingSeq to 001", () => {
    const result = buildPolicyInferencePrompt(["test chunk"]);
    expect(result.userContent).toContain("SEQ 시작 번호: 001");
  });
});
