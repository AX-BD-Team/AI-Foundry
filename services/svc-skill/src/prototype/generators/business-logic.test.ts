import { describe, it, expect } from "vitest";
import { generateBusinessLogic } from "./business-logic.js";
import type { Env } from "../../env.js";
import type { PolicyRow } from "../collector.js";

function makePolicy(overrides?: Partial<PolicyRow>): PolicyRow {
  return {
    policy_id: "pol-001",
    policy_code: "POL-GIFTVOUCHER-CHARGE-001",
    title: "충전 한도",
    condition: "월 충전 요청",
    criteria: "50만원 이하",
    outcome: "즉시 충전",
    source_document_id: "doc-1",
    source_page_ref: "p.3",
    source_excerpt: null,
    status: "approved",
    trust_level: "reviewed",
    trust_score: 0.85,
    tags: "[]",
    ...overrides,
  };
}

// skipLlm=true로 기계적 변환만 테스트 (LLM 의존 없음)
const mockEnv = {} as Env;

describe("generateBusinessLogic (mechanical mode)", () => {
  it("단일 정책 → 마크다운 구조 생성", async () => {
    const result = await generateBusinessLogic(mockEnv, [makePolicy()], { skipLlm: true });

    expect(result.path).toBe("specs/01-business-logic.md");
    expect(result.type).toBe("spec");
    expect(result.generatedBy).toBe("mechanical");
    expect(result.sourceCount).toBe(1);

    expect(result.content).toContain("# 비즈니스 로직 명세");
    expect(result.content).toContain("GIFTVOUCHER — CHARGE");
    expect(result.content).toContain("POL-GIFTVOUCHER-CHARGE-001");
  });

  it("도메인별 그룹핑", async () => {
    const policies = [
      makePolicy({ policy_code: "POL-GIFTVOUCHER-CHARGE-001" }),
      makePolicy({ policy_id: "p2", policy_code: "POL-GIFTVOUCHER-CANCEL-001" }),
      makePolicy({ policy_id: "p3", policy_code: "POL-PENSION-WD-001" }),
    ];

    const result = await generateBusinessLogic(mockEnv, policies, { skipLlm: true });

    expect(result.content).toContain("GIFTVOUCHER — CHARGE");
    expect(result.content).toContain("GIFTVOUCHER — CANCEL");
    expect(result.content).toContain("PENSION — WD");
    expect(result.sourceCount).toBe(3);
  });

  it("목차에 도메인별 건수 표시", async () => {
    const policies = [
      makePolicy({ policy_code: "POL-GIFTVOUCHER-CHARGE-001" }),
      makePolicy({ policy_id: "p2", policy_code: "POL-GIFTVOUCHER-CHARGE-002" }),
    ];

    const result = await generateBusinessLogic(mockEnv, policies, { skipLlm: true });

    expect(result.content).toContain("(2건)");
  });

  it("테이블 행에 condition/criteria/outcome 포함", async () => {
    const result = await generateBusinessLogic(mockEnv, [makePolicy({
      condition: "월 충전 요청",
      criteria: "50만원 이하",
      outcome: "즉시 충전",
    })], { skipLlm: true });

    expect(result.content).toContain("월 충전 요청");
    expect(result.content).toContain("50만원 이하");
    expect(result.content).toContain("즉시 충전");
  });

  it("파이프 문자가 포함된 텍스트 이스케이프", async () => {
    const result = await generateBusinessLogic(mockEnv, [makePolicy({
      condition: "A|B 조건",
    })], { skipLlm: true });

    expect(result.content).toContain("A\\|B 조건");
  });

  it("빈 policies → 헤더와 빈 목차", async () => {
    const result = await generateBusinessLogic(mockEnv, [], { skipLlm: true });

    expect(result.content).toContain("# 비즈니스 로직 명세");
    expect(result.content).toContain("총 정책: 0건");
    expect(result.content).toContain("도메인 그룹: 0개");
    expect(result.sourceCount).toBe(0);
  });

  it("도메인 알파벳순 정렬", async () => {
    const policies = [
      makePolicy({ policy_code: "POL-PENSION-WD-001" }),
      makePolicy({ policy_id: "p2", policy_code: "POL-GIFTVOUCHER-CHARGE-001" }),
      makePolicy({ policy_id: "p3", policy_code: "POL-AUTH-LOGIN-001" }),
    ];

    const result = await generateBusinessLogic(mockEnv, policies, { skipLlm: true });

    const authIdx = result.content.indexOf("AUTH — LOGIN");
    const gvIdx = result.content.indexOf("GIFTVOUCHER — CHARGE");
    const pensionIdx = result.content.indexOf("PENSION — WD");

    expect(authIdx).toBeLessThan(gvIdx);
    expect(gvIdx).toBeLessThan(pensionIdx);
  });
});
