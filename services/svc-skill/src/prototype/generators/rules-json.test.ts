import { describe, it, expect } from "vitest";
import { generateRulesJson } from "./rules-json.js";
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
    tags: '["충전","한도"]',
    ...overrides,
  };
}

describe("generateRulesJson", () => {
  it("단일 정책 → 올바른 JSON 구조", () => {
    const result = generateRulesJson([makePolicy()]);

    expect(result.path).toBe("rules/business-rules.json");
    expect(result.type).toBe("rules");
    expect(result.generatedBy).toBe("mechanical");
    expect(result.sourceCount).toBe(1);

    const parsed = JSON.parse(result.content);
    expect(parsed.$schema).toBe("https://ai-foundry.ktds.com/schemas/business-rules/v1");
    expect(parsed.totalRules).toBe(1);
    expect(parsed.domains).toEqual(["GIFTVOUCHER"]);
  });

  it("policy_code에서 domain/type 정확히 추출", () => {
    const policies = [
      makePolicy({ policy_code: "POL-GIFTVOUCHER-CHARGE-001" }),
      makePolicy({ policy_id: "pol-002", policy_code: "POL-GIFTVOUCHER-CANCEL-REFUND-001" }),
      makePolicy({ policy_id: "pol-003", policy_code: "POL-PENSION-WD-HOUSING-003" }),
    ];

    const result = generateRulesJson(policies);
    const parsed = JSON.parse(result.content);

    expect(parsed.totalRules).toBe(3);
    expect(parsed.domains).toContain("GIFTVOUCHER");
    expect(parsed.domains).toContain("PENSION");

    // GIFTVOUCHER 도메인에 2건
    const gv = parsed.rules["GIFTVOUCHER"] as Array<{ type: string }>;
    expect(gv).toHaveLength(2);
    expect(gv[0]!.type).toBe("CHARGE");
    expect(gv[1]!.type).toBe("CANCEL-REFUND");

    // PENSION 도메인에 1건
    const pension = parsed.rules["PENSION"] as Array<{ type: string }>;
    expect(pension).toHaveLength(1);
    expect(pension[0]!.type).toBe("WD-HOUSING");
  });

  it("tags JSON 파싱", () => {
    const result = generateRulesJson([makePolicy({ tags: '["a","b"]' })]);
    const parsed = JSON.parse(result.content);
    const rules = parsed.rules["GIFTVOUCHER"] as Array<{ tags: string[] }>;
    expect(rules[0]!.tags).toEqual(["a", "b"]);
  });

  it("잘못된 tags 문자열 → 빈 배열", () => {
    const result = generateRulesJson([makePolicy({ tags: "not-json" })]);
    const parsed = JSON.parse(result.content);
    const rules = parsed.rules["GIFTVOUCHER"] as Array<{ tags: string[] }>;
    expect(rules[0]!.tags).toEqual([]);
  });

  it("빈 policies → totalRules 0", () => {
    const result = generateRulesJson([]);
    const parsed = JSON.parse(result.content);
    expect(parsed.totalRules).toBe(0);
    expect(parsed.domains).toEqual([]);
  });

  it("condition/criteria/outcome 필드 매핑", () => {
    const result = generateRulesJson([makePolicy({
      condition: "조건A",
      criteria: "기준B",
      outcome: "결과C",
    })]);
    const parsed = JSON.parse(result.content);
    const rule = (parsed.rules["GIFTVOUCHER"] as Array<{ condition: string; criteria: string; outcome: string }>)[0]!;
    expect(rule.condition).toBe("조건A");
    expect(rule.criteria).toBe("기준B");
    expect(rule.outcome).toBe("결과C");
  });

  it("source 정보 매핑 (pageRef 포함/미포함)", () => {
    const withRef = generateRulesJson([makePolicy({ source_page_ref: "p.5" })]);
    const parsedWith = JSON.parse(withRef.content);
    const ruleWith = (parsedWith.rules["GIFTVOUCHER"] as Array<{ source: { pageRef: string | null } }>)[0]!;
    expect(ruleWith.source.pageRef).toBe("p.5");

    const withoutRef = generateRulesJson([makePolicy({ source_page_ref: null })]);
    const parsedWithout = JSON.parse(withoutRef.content);
    const ruleWithout = (parsedWithout.rules["GIFTVOUCHER"] as Array<{ source: { pageRef: string | null } }>)[0]!;
    expect(ruleWithout.source.pageRef).toBeNull();
  });
});
