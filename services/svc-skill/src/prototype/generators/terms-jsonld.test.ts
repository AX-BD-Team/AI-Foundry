import { describe, it, expect } from "vitest";
import { generateTermsJsonld } from "./terms-jsonld.js";
import type { TermRow } from "../collector.js";

function makeTerm(overrides?: Partial<TermRow>): TermRow {
  return {
    term_id: "t-001",
    ontology_id: "ont-001",
    label: "충전",
    definition: "온누리상품권에 금액을 입금하는 행위",
    skos_uri: "urn:aif:term:t-001",
    broader_term_id: null,
    term_type: "entity",
    ...overrides,
  };
}

describe("generateTermsJsonld", () => {
  it("단일 term → 올바른 SKOS/JSON-LD 구조", () => {
    const result = generateTermsJsonld([makeTerm()]);

    expect(result.path).toBe("ontology/terms.jsonld");
    expect(result.type).toBe("ontology");
    expect(result.generatedBy).toBe("mechanical");
    expect(result.sourceCount).toBe(1);

    const parsed = JSON.parse(result.content);
    expect(parsed["@context"]["skos"]).toBe("http://www.w3.org/2004/02/skos/core#");
    expect(parsed["@graph"]).toHaveLength(1);

    const node = parsed["@graph"][0];
    expect(node["@id"]).toBe("urn:aif:term:t-001");
    expect(node["@type"]).toBe("skos:Concept");
    expect(node["skos:prefLabel"]).toBe("충전");
    expect(node["skos:definition"]).toBe("온누리상품권에 금액을 입금하는 행위");
    expect(node["ai-foundry:termType"]).toBe("entity");
  });

  it("skos_uri가 null이면 urn:ai-foundry:term:{id} 자동 생성", () => {
    const result = generateTermsJsonld([makeTerm({ skos_uri: null, term_id: "t-999" })]);
    const parsed = JSON.parse(result.content);
    expect(parsed["@graph"][0]["@id"]).toBe("urn:ai-foundry:term:t-999");
  });

  it("broader_term_id → skos:broader 매핑", () => {
    const result = generateTermsJsonld([makeTerm({ broader_term_id: "t-parent" })]);
    const parsed = JSON.parse(result.content);
    expect(parsed["@graph"][0]["skos:broader"]).toBe("urn:ai-foundry:term:t-parent");
  });

  it("broader_term_id가 null이면 skos:broader 생략", () => {
    const result = generateTermsJsonld([makeTerm({ broader_term_id: null })]);
    const parsed = JSON.parse(result.content);
    expect(parsed["@graph"][0]).not.toHaveProperty("skos:broader");
  });

  it("definition이 null이면 skos:definition 생략", () => {
    const result = generateTermsJsonld([makeTerm({ definition: null })]);
    const parsed = JSON.parse(result.content);
    expect(parsed["@graph"][0]).not.toHaveProperty("skos:definition");
  });

  it("빈 배열 → 빈 @graph", () => {
    const result = generateTermsJsonld([]);
    const parsed = JSON.parse(result.content);
    expect(parsed["@graph"]).toEqual([]);
    expect(result.sourceCount).toBe(0);
  });

  it("다수 terms → 전부 변환", () => {
    const terms = [
      makeTerm({ term_id: "t-1", label: "충전", term_type: "entity" }),
      makeTerm({ term_id: "t-2", label: "잔액", term_type: "attribute" }),
      makeTerm({ term_id: "t-3", label: "belongs_to", term_type: "relation" }),
    ];
    const result = generateTermsJsonld(terms);
    const parsed = JSON.parse(result.content);
    expect(parsed["@graph"]).toHaveLength(3);
    expect(result.sourceCount).toBe(3);
  });

  it("term_type이 결과에 반영됨", () => {
    const result = generateTermsJsonld([makeTerm({ term_type: "attribute" })]);
    const parsed = JSON.parse(result.content);
    expect(parsed["@graph"][0]["ai-foundry:termType"]).toBe("attribute");
  });
});
