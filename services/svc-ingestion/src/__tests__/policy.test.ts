import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parsePolicyWorkbook,
  parsePolicySheet,
  parseTermSheet,
  parseTransactionTypeSheet,
  policyTriplesToElements,
} from "../parsing/policy.js";

// ── Helpers ─────────────────────────────────────────────────────

function createWorkbook(
  sheets: Array<{ name: string; data: string[][] }>,
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const { name, data } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as number[];
  return new Uint8Array(arr).buffer as ArrayBuffer;
}

function getWorkbook(
  sheets: Array<{ name: string; data: string[][] }>,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const { name, data } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return wb;
}

// ── Test Data (온누리상품권 도메인) ──────────────────────────────

const POLICY_HEADER = [
  "정책코드", "정책구분", "분류#1", "분류#2", "분류#3",
  "내용", "정책설명", "비고",
];

const POLICY_ROWS: string[][] = [
  ["PP1000", "발행", "상품권", "전자식", "", "온누리상품권 전자식 발행", "전자식 온누리상품권을 발행하는 정책", ""],
  ["PP1001", "발행", "상품권", "전자식", "한도", "1일 발행한도 100만원", "1인 1일 최대 100만원까지 발행 가능", ""],
  ["PP2000", "구매", "결제", "앱", "", "앱을 통한 온누리상품권 구매", "사용자 앱에서 온누리상품권을 구매하는 정책", ""],
  ["PP3000", "결제", "가맹점", "오프라인", "", "오프라인 가맹점 결제", "오프라인 가맹점에서 온누리상품권으로 결제", ""],
  ["PP4000", "환불", "취소", "", "", "구매 취소 및 환불", "구매 후 7일 이내 환불 가능", ""],
  ["PP5000", "선물", "전송", "개인", "", "개인 간 선물 전송", "온누리상품권을 다른 사용자에게 선물", ""],
];

const TERM_HEADER = ["용어", "영문명", "정의"];

const TERM_ROWS: string[][] = [
  ["온누리상품권", "Onnuri Gift Certificate", "소상공인 지원을 위한 정부 발행 상품권"],
  ["가맹점", "Franchise", "온누리상품권 결제를 수용하는 소상공인 매장"],
  ["충전", "Charge", "온누리상품권에 금액을 넣는 행위"],
];

const TX_HEADER = ["거래코드", "거래명", "APP표시명", "설명", "필터기준", "비고"];

const TX_ROWS: string[][] = [
  ["A101", "충전", "충전", "계좌이체를 통한 충전", "Y", ""],
  ["A201", "결제", "결제", "가맹점 결제", "Y", ""],
  ["Z401", "환불", "환불", "환불 처리", "Y", ""],
];

// ── parsePolicySheet ─────────────────────────────────────────────

describe("parsePolicySheet", () => {
  it("parses basic policy sheet with all fields", () => {
    const wb = getWorkbook([
      { name: "정책", data: [POLICY_HEADER, ...POLICY_ROWS] },
    ]);
    const sheet = wb.Sheets["정책"]!;
    const policies = parsePolicySheet(sheet, "정책");

    expect(policies).toHaveLength(6);
    const first = policies[0]!;
    expect(first.policyCode).toBe("PP1000");
    expect(first.category).toBe("발행");
    expect(first.condition).toBe("온누리상품권 전자식 발행");
    expect(first.criteria).toBe("온누리상품권 전자식 발행");
    expect(first.outcome).toBe("전자식 온누리상품권을 발행하는 정책");
    expect(first.source).toBe("정책");
  });

  it("parses policy code pattern PP{N} and builds classification array", () => {
    const wb = getWorkbook([
      { name: "정책", data: [POLICY_HEADER, ...POLICY_ROWS] },
    ]);
    const sheet = wb.Sheets["정책"]!;
    const policies = parsePolicySheet(sheet, "정책");

    // PP1001: 분류#1=상품권, 분류#2=전자식, 분류#3=한도
    const p1001 = policies[1]!;
    expect(p1001.policyCode).toBe("PP1001");
    expect(p1001.classification).toEqual(["상품권", "전자식", "한도"]);

    // PP4000: 분류#1=취소, 분류#2/3 empty
    const p4000 = policies[4]!;
    expect(p4000.policyCode).toBe("PP4000");
    expect(p4000.classification).toEqual(["취소"]);
  });

  it("skips empty rows", () => {
    const data = [
      POLICY_HEADER,
      POLICY_ROWS[0]!,
      ["", "", "", "", "", "", "", ""],  // empty row
      POLICY_ROWS[1]!,
    ];
    const wb = getWorkbook([{ name: "정책", data }]);
    const sheet = wb.Sheets["정책"]!;
    const policies = parsePolicySheet(sheet, "정책");

    expect(policies).toHaveLength(2);
  });

  it("auto-detects header when top rows contain metadata", () => {
    const data = [
      ["문서명: 온누리상품권 정책 정의서", "", "", "", "", "", "", ""],
      ["작성일: 2026-03-01", "", "", "", "", "", "", ""],
      POLICY_HEADER,
      POLICY_ROWS[0]!,
      POLICY_ROWS[1]!,
    ];
    const wb = getWorkbook([{ name: "정책", data }]);
    const sheet = wb.Sheets["정책"]!;
    const policies = parsePolicySheet(sheet, "정책");

    expect(policies).toHaveLength(2);
    expect(policies[0]!.policyCode).toBe("PP1000");
  });

  it("inherits previous policy code when cell is empty (merged cell simulation)", () => {
    const data = [
      POLICY_HEADER,
      ["PP1000", "발행", "상품권", "전자식", "", "전자식 발행", "전자식 상품권 발행 정책", ""],
      ["", "발행", "상품권", "전자식", "한도", "발행 한도", "1일 100만원 한도", ""],
      ["", "발행", "상품권", "지류식", "", "지류식 발행", "지류식 상품권 발행 정책", ""],
    ];
    const wb = getWorkbook([{ name: "정책", data }]);
    const sheet = wb.Sheets["정책"]!;
    const policies = parsePolicySheet(sheet, "정책");

    expect(policies).toHaveLength(3);
    expect(policies[0]!.policyCode).toBe("PP1000");
    expect(policies[1]!.policyCode).toBe("PP1000");
    expect(policies[2]!.policyCode).toBe("PP1000");
  });

  it("builds classification array from non-empty 분류 columns", () => {
    const data = [
      POLICY_HEADER,
      ["PP1000", "발행", "상품권", "전자식", "한도", "내용", "설명", ""],
      ["PP2000", "구매", "결제", "", "", "내용", "설명", ""],
      ["PP3000", "결제", "", "", "", "내용", "설명", ""],
    ];
    const wb = getWorkbook([{ name: "정책", data }]);
    const sheet = wb.Sheets["정책"]!;
    const policies = parsePolicySheet(sheet, "정책");

    expect(policies[0]!.classification).toEqual(["상품권", "전자식", "한도"]);
    expect(policies[1]!.classification).toEqual(["결제"]);
    expect(policies[2]!.classification).toEqual([]);
  });

  it("preserves Korean data correctly", () => {
    const data = [
      POLICY_HEADER,
      ["PP1000", "발행", "상품권", "전자식", "", "온누리상품권 전자식 발행", "전자식 온누리상품권을 발행하는 정책", ""],
    ];
    const wb = getWorkbook([{ name: "정책시트", data }]);
    const sheet = wb.Sheets["정책시트"]!;
    const policies = parsePolicySheet(sheet, "정책시트");

    expect(policies[0]!.condition).toBe("온누리상품권 전자식 발행");
    expect(policies[0]!.outcome).toBe("전자식 온누리상품권을 발행하는 정책");
    expect(policies[0]!.source).toBe("정책시트");
  });
});

// ── parseTermSheet ──────────────────────────────────────────────

describe("parseTermSheet", () => {
  it("extracts basic term definitions", () => {
    const wb = getWorkbook([
      { name: "용어", data: [TERM_HEADER, ...TERM_ROWS] },
    ]);
    const sheet = wb.Sheets["용어"]!;
    const terms = parseTermSheet(sheet, "용어");

    expect(terms).toHaveLength(3);
    const first = terms[0]!;
    expect(first.name).toBe("온누리상품권");
    expect(first.englishName).toBe("Onnuri Gift Certificate");
    expect(first.definition).toBe("소상공인 지원을 위한 정부 발행 상품권");
    expect(first.source).toBe("용어");
  });

  it("skips empty rows", () => {
    const data = [
      TERM_HEADER,
      TERM_ROWS[0]!,
      ["", "", ""],  // empty row
      TERM_ROWS[1]!,
    ];
    const wb = getWorkbook([{ name: "용어", data }]);
    const sheet = wb.Sheets["용어"]!;
    const terms = parseTermSheet(sheet, "용어");

    expect(terms).toHaveLength(2);
  });

  it("returns empty array for empty sheet", () => {
    const wb = getWorkbook([{ name: "용어", data: [TERM_HEADER] }]);
    const sheet = wb.Sheets["용어"]!;
    const terms = parseTermSheet(sheet, "용어");

    expect(terms).toEqual([]);
  });
});

// ── parseTransactionTypeSheet ───────────────────────────────────

describe("parseTransactionTypeSheet", () => {
  it("extracts basic transaction types", () => {
    const wb = getWorkbook([
      { name: "거래유형", data: [TX_HEADER, ...TX_ROWS] },
    ]);
    const sheet = wb.Sheets["거래유형"]!;
    const txTypes = parseTransactionTypeSheet(sheet, "거래유형");

    expect(txTypes).toHaveLength(3);
    const first = txTypes[0]!;
    expect(first.code).toBe("A101");
    expect(first.name).toBe("충전");
    expect(first.displayName).toBe("충전");
    expect(first.source).toBe("거래유형");
  });

  it("skips empty rows", () => {
    const data = [
      TX_HEADER,
      TX_ROWS[0]!,
      ["", "", "", "", "", ""],  // empty row
      TX_ROWS[1]!,
    ];
    const wb = getWorkbook([{ name: "거래유형", data }]);
    const sheet = wb.Sheets["거래유형"]!;
    const txTypes = parseTransactionTypeSheet(sheet, "거래유형");

    expect(txTypes).toHaveLength(2);
  });
});

// ── parsePolicyWorkbook ─────────────────────────────────────────

describe("parsePolicyWorkbook", () => {
  it("parses workbook with all three sheet types", () => {
    const buf = createWorkbook([
      { name: "정책정의", data: [POLICY_HEADER, ...POLICY_ROWS] },
      { name: "용어정의", data: [TERM_HEADER, ...TERM_ROWS] },
      { name: "거래유형", data: [TX_HEADER, ...TX_ROWS] },
    ]);
    const result = parsePolicyWorkbook(buf, "D106_온누리상품권_정책.xlsx");

    expect(result.policies).toHaveLength(6);
    expect(result.terms).toHaveLength(3);
    expect(result.transactionTypes).toHaveLength(3);
    expect(result.elements.length).toBeGreaterThan(0);
  });

  it("handles workbook with only policy sheet", () => {
    const buf = createWorkbook([
      { name: "정책", data: [POLICY_HEADER, ...POLICY_ROWS] },
    ]);
    const result = parsePolicyWorkbook(buf, "정책정의서.xlsx");

    expect(result.policies).toHaveLength(6);
    expect(result.terms).toEqual([]);
    expect(result.transactionTypes).toEqual([]);
  });

  it("auto-detects sheet types by name keywords", () => {
    const buf = createWorkbook([
      { name: "온누리 정책 시트", data: [POLICY_HEADER, ...POLICY_ROWS] },
      { name: "용어 목록", data: [TERM_HEADER, ...TERM_ROWS] },
      { name: "거래유형 코드", data: [TX_HEADER, ...TX_ROWS] },
    ]);
    const result = parsePolicyWorkbook(buf, "D106.xlsx");

    expect(result.policies.length).toBeGreaterThan(0);
    expect(result.terms.length).toBeGreaterThan(0);
    expect(result.transactionTypes.length).toBeGreaterThan(0);
  });

  it("ignores unrelated sheets", () => {
    const buf = createWorkbook([
      { name: "정책", data: [POLICY_HEADER, ...POLICY_ROWS] },
      { name: "커버시트", data: [["문서명"], ["온누리상품권 정책"]] },
      { name: "변경이력", data: [["버전", "일자"], ["1.0", "2026-01-01"]] },
    ]);
    const result = parsePolicyWorkbook(buf, "정책정의서.xlsx");

    expect(result.policies).toHaveLength(6);
    expect(result.terms).toEqual([]);
    expect(result.transactionTypes).toEqual([]);
  });

  it("elements array includes XlPolicy, XlTerm, XlTransactionType types", () => {
    const buf = createWorkbook([
      { name: "정책", data: [POLICY_HEADER, ...POLICY_ROWS] },
      { name: "용어", data: [TERM_HEADER, ...TERM_ROWS] },
      { name: "거래유형", data: [TX_HEADER, ...TX_ROWS] },
    ]);
    const result = parsePolicyWorkbook(buf, "D106.xlsx");

    const types = new Set(result.elements.map((e) => e.type));
    expect(types.has("XlPolicy")).toBe(true);
    expect(types.has("XlTerm")).toBe(true);
    expect(types.has("XlTransactionType")).toBe(true);
  });
});

// ── policyTriplesToElements ─────────────────────────────────────

describe("policyTriplesToElements", () => {
  it("converts PolicyTriple to UnstructuredElement", () => {
    const result = {
      policies: [
        {
          policyCode: "PP1000",
          category: "발행",
          classification: ["상품권", "전자식"],
          condition: "온누리상품권 전자식 발행",
          criteria: "온누리상품권 전자식 발행",
          outcome: "전자식 온누리상품권을 발행하는 정책",
          source: "정책",
        },
      ],
      terms: [],
      transactionTypes: [],
      elements: [],
    };
    const elements = policyTriplesToElements(result, "D106.xlsx");

    expect(elements).toHaveLength(1);
    expect(elements[0]!.type).toBe("XlPolicy");
    expect(elements[0]!.text).toContain("PP1000");
    expect(elements[0]!.text).toContain("발행");
    expect(elements[0]!.text).toContain("온누리상품권 전자식 발행");
  });

  it("converts TermDefinition to UnstructuredElement", () => {
    const result = {
      policies: [],
      terms: [
        {
          name: "온누리상품권",
          englishName: "Onnuri Gift Certificate",
          definition: "소상공인 지원을 위한 정부 발행 상품권",
          source: "용어",
        },
      ],
      transactionTypes: [],
      elements: [],
    };
    const elements = policyTriplesToElements(result, "D106.xlsx");

    expect(elements).toHaveLength(1);
    expect(elements[0]!.type).toBe("XlTerm");
    expect(elements[0]!.text).toContain("온누리상품권");
    expect(elements[0]!.text).toContain("Onnuri Gift Certificate");
  });

  it("converts TransactionType to UnstructuredElement", () => {
    const result = {
      policies: [],
      terms: [],
      transactionTypes: [
        {
          code: "A101",
          name: "충전",
          displayName: "충전",
          source: "거래유형",
        },
      ],
      elements: [],
    };
    const elements = policyTriplesToElements(result, "D106.xlsx");

    expect(elements).toHaveLength(1);
    expect(elements[0]!.type).toBe("XlTransactionType");
    expect(elements[0]!.text).toContain("A101");
    expect(elements[0]!.text).toContain("충전");
  });

  it("returns empty array for empty result", () => {
    const result = {
      policies: [],
      terms: [],
      transactionTypes: [],
      elements: [],
    };
    const elements = policyTriplesToElements(result, "D106.xlsx");

    expect(elements).toEqual([]);
  });

  it("combines all types in a single elements array", () => {
    const result = {
      policies: [
        {
          policyCode: "PP1000",
          category: "발행",
          classification: ["상품권"],
          condition: "발행",
          criteria: "발행",
          outcome: "발행 정책",
          source: "정책",
        },
      ],
      terms: [
        {
          name: "상품권",
          englishName: "Gift Certificate",
          definition: "상품권 정의",
          source: "용어",
        },
      ],
      transactionTypes: [
        {
          code: "A101",
          name: "충전",
          displayName: "충전",
          source: "거래유형",
        },
      ],
      elements: [],
    };
    const elements = policyTriplesToElements(result, "D106.xlsx");

    expect(elements).toHaveLength(3);
    const types = elements.map((e) => e.type);
    expect(types).toContain("XlPolicy");
    expect(types).toContain("XlTerm");
    expect(types).toContain("XlTransactionType");
  });

  it("includes fileName in element metadata", () => {
    const result = {
      policies: [
        {
          policyCode: "PP1000",
          category: "발행",
          classification: [],
          condition: "발행",
          criteria: "발행",
          outcome: "정책",
          source: "정책",
        },
      ],
      terms: [],
      transactionTypes: [],
      elements: [],
    };
    const elements = policyTriplesToElements(result, "D106_정책.xlsx");

    const meta = elements[0]!.metadata as Record<string, unknown>;
    expect(meta["fileName"]).toBe("D106_정책.xlsx");
  });
});
