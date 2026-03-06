import { describe, it, expect } from "vitest";
import { parseMatchResultForKpi } from "../routes/factcheck.js";

describe("parseMatchResultForKpi", () => {
  it("match_result_json이 null이면 fallback으로 API-only 반환", () => {
    const result = parseMatchResultForKpi(null, 98, 382);

    expect(result.apiMatched).toBe(98);
    expect(result.tableMatched).toBe(0);
    expect(result.unmatchedSourceApis).toBe(284);
    expect(result.unmatchedSourceTables).toBe(0);
  });

  it("API + Table 매칭을 sourceRef.type으로 분리", () => {
    const json = JSON.stringify({
      matchedItems: [
        { sourceRef: { name: "/api/foo", type: "api", documentId: "d1", location: "Ctrl.foo" }, matchScore: 1.0, matchMethod: "exact" },
        { sourceRef: { name: "/api/bar", type: "api", documentId: "d1", location: "Ctrl.bar" }, matchScore: 0.8, matchMethod: "fuzzy" },
        { sourceRef: { name: "t_users", type: "table", documentId: "d2", location: "mapper.xml" }, matchScore: 1.0, matchMethod: "exact" },
      ],
      unmatchedSourceApis: 10,
      unmatchedDocApis: 3,
      unmatchedSourceTables: 5,
      unmatchedDocTables: 2,
    });

    const result = parseMatchResultForKpi(json, 3, 18);

    expect(result.apiMatched).toBe(2);
    expect(result.tableMatched).toBe(1);
    expect(result.unmatchedSourceApis).toBe(10);
    expect(result.unmatchedSourceTables).toBe(5);
    expect(result.unmatchedDocApis).toBe(3);
    expect(result.unmatchedDocTables).toBe(2);
  });

  it("matchedItems가 비어있으면 unmatched 카운트만 반환", () => {
    const json = JSON.stringify({
      matchedItems: [],
      unmatchedSourceApis: 50,
      unmatchedDocApis: 20,
      unmatchedSourceTables: 0,
      unmatchedDocTables: 0,
    });

    const result = parseMatchResultForKpi(json, 0, 50);

    expect(result.apiMatched).toBe(0);
    expect(result.tableMatched).toBe(0);
    expect(result.unmatchedSourceApis).toBe(50);
    expect(result.unmatchedSourceTables).toBe(0);
  });

  it("잘못된 JSON이면 fallback 반환", () => {
    const result = parseMatchResultForKpi("not-json{", 10, 100);

    expect(result.apiMatched).toBe(10);
    expect(result.tableMatched).toBe(0);
    expect(result.unmatchedSourceApis).toBe(90);
  });

  it("LPON 실데이터 시뮬레이션: API 98매칭 + Table 0매칭", () => {
    const matchedItems = Array.from({ length: 98 }, (_, i) => ({
      sourceRef: { name: `/api/endpoint${i}`, type: "api", documentId: `d${i}`, location: `Ctrl.m${i}` },
      matchScore: 1.0,
      matchMethod: "exact",
    }));

    const json = JSON.stringify({
      matchedItems,
      unmatchedSourceApis: 284,
      unmatchedDocApis: 11,
      unmatchedSourceTables: 0,
      unmatchedDocTables: 0,
    });

    const result = parseMatchResultForKpi(json, 98, 382);

    expect(result.apiMatched).toBe(98);
    expect(result.tableMatched).toBe(0);
    expect(result.unmatchedSourceApis).toBe(284);
    expect(result.unmatchedSourceTables).toBe(0);

    // Coverage calculation — PRD SS8.2: matched / document items
    const totalDocApis = result.apiMatched + result.unmatchedDocApis;
    const apiCov = Math.round((result.apiMatched / totalDocApis) * 1000) / 10;
    expect(apiCov).toBe(89.9); // 98 / 109 = 89.9%
    expect(totalDocApis).toBe(109);

    // Documentation completeness — supplementary: matched / source items
    const totalSourceApis = result.apiMatched + result.unmatchedSourceApis;
    const apiDocComp = Math.round((result.apiMatched / totalSourceApis) * 1000) / 10;
    expect(apiDocComp).toBe(25.7);
    expect(totalSourceApis).toBe(382);
  });
});
