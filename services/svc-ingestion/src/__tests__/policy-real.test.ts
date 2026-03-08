/**
 * 실파일 파싱 테스트: LPON-D106 온누리상품권 정책정의서
 *
 * 실제 SI 산출물 Excel 파일로 parsePolicyWorkbook을 검증한다.
 * 파일 위치: docs/LPON 전자식 온누리상품권 플랫폼/LPON-D106_온누리상품권_정책정의서.xlsx
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — Bun provides Node.js fs module at runtime (not in Workers types)
import { readFileSync, existsSync } from "fs";
// @ts-expect-error — Bun provides Node.js path module at runtime (not in Workers types)
import { resolve } from "path";
import { parsePolicyWorkbook } from "../parsing/policy.js";

// @ts-expect-error — __dirname is available in Bun test runtime
const testDir: string = __dirname;
const FILE_PATH = resolve(
  testDir,
  "../../../../docs/LPON 전자식 온누리상품권 플랫폼/LPON-D106_온누리상품권_정책정의서.xlsx",
);

const fileExists = existsSync(FILE_PATH);

describe.skipIf(!fileExists)("D106 실파일 파싱", () => {
  const buf = fileExists
    ? readFileSync(FILE_PATH).buffer as ArrayBuffer
    : new ArrayBuffer(0);
  const result = parsePolicyWorkbook(buf, "LPON-D106_온누리상품권_정책정의서.xlsx");

  // ── 정책 (온누리)정책_2023 시트 기준 ──────────────────────

  it("정책이 40건 이상 파싱되어야 한다", () => {
    expect(result.policies.length).toBeGreaterThanOrEqual(40);
  });

  it("PP 코드가 있는 정책이 존재해야 한다", () => {
    const withCode = result.policies.filter((p) => p.policyCode.startsWith("PP"));
    expect(withCode.length).toBeGreaterThanOrEqual(40);
  });

  it("분류(classification)가 파싱되어야 한다", () => {
    const withClass = result.policies.filter((p) => p.classification.length > 0);
    expect(withClass.length).toBeGreaterThanOrEqual(10);
  });

  it("condition에 도메인 > 분류 형태가 포함되어야 한다", () => {
    const withCondition = result.policies.filter((p) =>
      p.condition.includes(" > "),
    );
    expect(withCondition.length).toBeGreaterThanOrEqual(10);
  });

  it("criteria(내용)와 outcome(정책설명)이 비어있지 않아야 한다", () => {
    const withContent = result.policies.filter(
      (p) => p.criteria.length > 0 && p.outcome.length > 0,
    );
    expect(withContent.length).toBeGreaterThanOrEqual(30);
  });

  // ── 거래유형 ──────────────────────────────────────────────

  it("거래유형이 10건 이상 파싱되어야 한다", () => {
    expect(result.transactionTypes.length).toBeGreaterThanOrEqual(10);
  });

  it("거래유형 코드가 A/C/S/Z/R 형식이어야 한다", () => {
    const valid = result.transactionTypes.filter((t) =>
      /^[ACSZR]\d{3}$/.test(t.code),
    );
    expect(valid.length).toBeGreaterThanOrEqual(10);
  });

  // ── 용어 ──────────────────────────────────────────────────

  it("용어가 10건 이상 파싱되어야 한다", () => {
    expect(result.terms.length).toBeGreaterThanOrEqual(10);
  });

  it("용어 정의(definition)가 비어있지 않아야 한다", () => {
    const withDef = result.terms.filter((t) => t.definition.length > 0);
    expect(withDef.length).toBeGreaterThanOrEqual(5);
  });

  // ── Elements 통합 ────────────────────────────────────────

  it("elements에 XlPolicy, XlTerm, XlTransactionType이 모두 있어야 한다", () => {
    const types = new Set(result.elements.map((e) => e.type));
    expect(types.has("XlPolicy")).toBe(true);
    expect(types.has("XlTerm")).toBe(true);
    expect(types.has("XlTransactionType")).toBe(true);
  });
});
