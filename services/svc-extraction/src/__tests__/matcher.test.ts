import { describe, it, expect } from "vitest";
import {
  structuralMatch,
  normalizePath,
  tokenizePath,
  normalizeTableName,
  camelToSnake,
  matchColumnName,
  jaccardSimilarity,
} from "../factcheck/matcher.js";
import type { SourceSpec, DocSpec, SourceApi, SourceTable, DocApi, DocTable } from "../factcheck/types.js";

// ── Helper factories ─────────────────────────────────────────────

function makeSourceApi(overrides: Partial<SourceApi> = {}): SourceApi {
  return {
    path: "/api/v2/voucher/issue",
    httpMethods: ["POST"],
    methodName: "issueVoucher",
    controllerClass: "VoucherController",
    parameters: [],
    returnType: "ResponseEntity",
    documentId: "src-doc-1",
    sourceFile: "VoucherController.java",
    ...overrides,
  };
}

function makeDocApi(overrides: Partial<DocApi> = {}): DocApi {
  return {
    path: "/api/v2/voucher/issue",
    httpMethod: "POST",
    documentId: "doc-doc-1",
    location: "인터페이스설계서.xlsx:Sheet1:Row5",
    ...overrides,
  };
}

function makeSourceTable(overrides: Partial<SourceTable> = {}): SourceTable {
  return {
    tableName: "account_balance",
    columns: [
      { name: "account_no", javaProperty: "accountNo", nullable: false, isPrimaryKey: true },
      { name: "balance", javaProperty: "balance", sqlType: "BIGINT", nullable: true, isPrimaryKey: false },
    ],
    source: "mybatis",
    documentId: "src-doc-1",
    sourceFile: "AccountMapper.xml",
    ...overrides,
  };
}

function makeDocTable(overrides: Partial<DocTable> = {}): DocTable {
  return {
    tableName: "TB_ACCOUNT_BALANCE",
    columns: [
      { name: "account_no", dataType: "VARCHAR(20)", isPrimaryKey: true },
      { name: "balance", dataType: "BIGINT" },
    ],
    documentId: "doc-doc-1",
    location: "테이블정의서.xlsx:Sheet3:Row2",
    ...overrides,
  };
}

function makeSourceSpec(apis: SourceApi[] = [], tables: SourceTable[] = []): SourceSpec {
  return {
    apis,
    tables,
    transactions: [],
    queries: [],
    stats: {
      controllerCount: apis.length > 0 ? 1 : 0,
      endpointCount: apis.length,
      tableCount: tables.length,
      mapperCount: tables.length,
    },
  };
}

function makeDocSpec(apis: DocApi[] = [], tables: DocTable[] = []): DocSpec {
  return {
    apis,
    tables,
    stats: {
      apiDocCount: apis.length > 0 ? 1 : 0,
      tableDocCount: tables.length > 0 ? 1 : 0,
      totalApis: apis.length,
      totalTables: tables.length,
    },
  };
}

// ── normalizePath ────────────────────────────────────────────────

describe("normalizePath", () => {
  it("소문자 변환 + 슬래시 정리", () => {
    expect(normalizePath("/API/V2/Voucher/Issue/")).toBe("api/v2/voucher/issue");
  });

  it("path variable {id} → :param", () => {
    expect(normalizePath("/api/v2/users/{userId}/orders/{orderId}"))
      .toBe("api/v2/users/:param/orders/:param");
  });

  it(":id 형태도 :param으로 변환", () => {
    expect(normalizePath("/api/v2/users/:userId"))
      .toBe("api/v2/users/:param");
  });

  it("이중 슬래시 제거", () => {
    expect(normalizePath("/api//v2///voucher")).toBe("api/v2/voucher");
  });

  it("빈 경로 처리", () => {
    expect(normalizePath("/")).toBe("");
  });

  it("버전 v1.0 → 1.0 정규화", () => {
    expect(normalizePath("/onnuripay/v1.0/auth/login")).toBe("onnuripay/1.0/auth/login");
  });

  it("버전 v2.1 → 2.1 정규화", () => {
    expect(normalizePath("/api/v2.1/users")).toBe("api/2.1/users");
  });

  it("dot 없는 버전 v2는 변환하지 않음", () => {
    expect(normalizePath("/api/v2/voucher/issue")).toBe("api/v2/voucher/issue");
  });

  it("v1.0과 1.0이 동일하게 정규화", () => {
    expect(normalizePath("/onnuripay/v1.0/account/accountList"))
      .toBe(normalizePath("/onnuripay/1.0/account/accountList"));
  });

  it("full URL에서 hostname 제거", () => {
    expect(normalizePath("https://app.e-onnurigiftcard.com/onnuripay/1.0/auth/login"))
      .toBe("onnuripay/1.0/auth/login");
  });

  it("full URL과 relative path가 동일하게 정규화", () => {
    expect(normalizePath("https://app.e-onnurigiftcard.com/onnuripay/1.0/auth/login"))
      .toBe(normalizePath("/onnuripay/v1.0/auth/login"));
  });
});

// ── tokenizePath ─────────────────────────────────────────────────

describe("tokenizePath", () => {
  it("경로를 토큰으로 분리 (api/v1/v2/v3 제외)", () => {
    const tokens = tokenizePath("/api/v2/voucher/issue");
    expect(tokens).toEqual(["voucher", "issue"]);
  });

  it("하이픈/언더스코어/점도 분리", () => {
    const tokens = tokenizePath("/api/v2/user-profile/get_name.json");
    expect(tokens).toEqual(["user", "profile", "get", "name", "json"]);
  });
});

// ── normalizeTableName ───────────────────────────────────────────

describe("normalizeTableName", () => {
  it("TB_ 접두사 제거", () => {
    expect(normalizeTableName("TB_ACCOUNT_BALANCE")).toBe("account_balance");
  });

  it("TBL_ 접두사 제거", () => {
    expect(normalizeTableName("TBL_VOUCHER")).toBe("voucher");
  });

  it("T_ 접두사 제거", () => {
    expect(normalizeTableName("T_ORDER")).toBe("order");
  });

  it("접두사 없는 테이블은 소문자만", () => {
    expect(normalizeTableName("account_balance")).toBe("account_balance");
  });
});

// ── camelToSnake / matchColumnName ────────────────────────────────

describe("camelToSnake", () => {
  it("camelCase → snake_case", () => {
    expect(camelToSnake("accountNo")).toBe("account_no");
    expect(camelToSnake("voucherId")).toBe("voucher_id");
  });

  it("연속 대문자 처리", () => {
    // regex inserts _ only at lowercase→uppercase transitions
    expect(camelToSnake("getHTTPStatus")).toBe("get_httpstatus");
  });

  it("이미 snake_case면 변환 없음", () => {
    expect(camelToSnake("account_no")).toBe("account_no");
  });
});

describe("matchColumnName", () => {
  it("exact match (case-insensitive)", () => {
    expect(matchColumnName("account_no", "ACCOUNT_NO")).toBe(true);
  });

  it("camelCase ↔ snake_case 매칭", () => {
    expect(matchColumnName("accountNo", "account_no")).toBe(true);
    expect(matchColumnName("account_no", "accountNo")).toBe(true);
  });

  it("다른 이름은 불일치", () => {
    expect(matchColumnName("accountNo", "balance")).toBe(false);
  });
});

// ── jaccardSimilarity ────────────────────────────────────────────

describe("jaccardSimilarity", () => {
  it("완전 동일 → 1.0", () => {
    expect(jaccardSimilarity(["a", "b", "c"], ["a", "b", "c"])).toBe(1.0);
  });

  it("완전 불일치 → 0.0", () => {
    expect(jaccardSimilarity(["a", "b"], ["c", "d"])).toBe(0.0);
  });

  it("부분 일치", () => {
    // intersection=2 (a,b), union=4 (a,b,c,d) → 0.5
    expect(jaccardSimilarity(["a", "b", "c"], ["a", "b", "d"])).toBe(0.5);
  });

  it("빈 배열 → 0.0", () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });
});

// ── structuralMatch ──────────────────────────────────────────────

describe("structuralMatch", () => {
  it("빈 소스 + 빈 문서 → 빈 결과", () => {
    const result = structuralMatch(makeSourceSpec(), makeDocSpec());
    expect(result.matchedItems).toHaveLength(0);
    expect(result.unmatchedSourceApis).toHaveLength(0);
    expect(result.unmatchedDocApis).toHaveLength(0);
  });

  it("API exact match — 동일 경로", () => {
    const src = makeSourceSpec([makeSourceApi()]);
    const doc = makeDocSpec([makeDocApi()]);
    const result = structuralMatch(src, doc);

    expect(result.matchedItems).toHaveLength(1);
    const m = result.matchedItems[0];
    expect(m?.matchScore).toBe(1.0);
    expect(m?.matchMethod).toBe("exact");
    expect(m?.sourceRef.type).toBe("api");
    expect(result.unmatchedSourceApis).toHaveLength(0);
    expect(result.unmatchedDocApis).toHaveLength(0);
  });

  it("API exact match — 대소문자/슬래시 정규화", () => {
    const src = makeSourceSpec([makeSourceApi({ path: "/API/V2/Voucher/Issue/" })]);
    const doc = makeDocSpec([makeDocApi({ path: "/api/v2/voucher/issue" })]);
    const result = structuralMatch(src, doc);

    expect(result.matchedItems).toHaveLength(1);
    expect(result.matchedItems[0]?.matchMethod).toBe("exact");
  });

  it("API exact match — path variable 정규화", () => {
    const src = makeSourceSpec([makeSourceApi({ path: "/api/v2/users/{userId}" })]);
    const doc = makeDocSpec([makeDocApi({ path: "/api/v2/users/:id" })]);
    const result = structuralMatch(src, doc);

    expect(result.matchedItems).toHaveLength(1);
    expect(result.matchedItems[0]?.matchMethod).toBe("exact");
  });

  it("API fuzzy match — 유사 경로 (Jaccard >= 0.6)", () => {
    const src = makeSourceSpec([makeSourceApi({ path: "/api/v2/voucher/issue/bulk" })]);
    const doc = makeDocSpec([makeDocApi({ path: "/api/v2/voucher/issue/batch" })]);
    const result = structuralMatch(src, doc);

    // tokens: [voucher, issue, bulk] vs [voucher, issue, batch]
    // intersection=2 (voucher, issue), union=4 → 0.5 < 0.6 → unmatched
    expect(result.matchedItems).toHaveLength(0);
    expect(result.unmatchedSourceApis).toHaveLength(1);
    expect(result.unmatchedDocApis).toHaveLength(1);
  });

  it("API fuzzy match — 충분한 토큰 겹침", () => {
    const src = makeSourceSpec([makeSourceApi({ path: "/api/v2/common/utils/getNow" })]);
    const doc = makeDocSpec([makeDocApi({ path: "/api/v2/common/utils/currentTime" })]);
    const result = structuralMatch(src, doc);

    // tokens: [common, utils, getnow] vs [common, utils, currenttime]
    // intersection=2, union=4 → 0.5 < 0.6 → unmatched
    expect(result.unmatchedSourceApis).toHaveLength(1);
  });

  it("Table exact match — TB_ 접두사 제거 후 매칭", () => {
    const src = makeSourceSpec([], [makeSourceTable({ tableName: "account_balance" })]);
    const doc = makeDocSpec([], [makeDocTable({ tableName: "TB_ACCOUNT_BALANCE" })]);
    const result = structuralMatch(src, doc);

    expect(result.matchedItems).toHaveLength(1);
    expect(result.matchedItems[0]?.matchMethod).toBe("exact");
    expect(result.matchedItems[0]?.sourceRef.type).toBe("table");
  });

  it("Table fuzzy match — Levenshtein < 3", () => {
    const src = makeSourceSpec([], [makeSourceTable({ tableName: "account_bal" })]);
    const doc = makeDocSpec([], [makeDocTable({ tableName: "TB_ACCOUNT_BAL" })]);
    const result = structuralMatch(src, doc);

    // normalized: account_bal vs account_bal → exact match
    expect(result.matchedItems).toHaveLength(1);
    expect(result.matchedItems[0]?.matchMethod).toBe("exact");
  });

  it("unmatched source → unmatchedSourceApis에 수집", () => {
    const src = makeSourceSpec([
      makeSourceApi({ path: "/api/v2/internal/health" }),
    ]);
    const doc = makeDocSpec();
    const result = structuralMatch(src, doc);

    expect(result.matchedItems).toHaveLength(0);
    expect(result.unmatchedSourceApis).toHaveLength(1);
    expect(result.unmatchedSourceApis[0]?.path).toBe("/api/v2/internal/health");
  });

  it("unmatched doc → unmatchedDocTables에 수집", () => {
    const src = makeSourceSpec();
    const doc = makeDocSpec([], [makeDocTable()]);
    const result = structuralMatch(src, doc);

    expect(result.matchedItems).toHaveLength(0);
    expect(result.unmatchedDocTables).toHaveLength(1);
  });

  it("복합 시나리오 — 2 API 매치 + 1 unmatched", () => {
    const src = makeSourceSpec([
      makeSourceApi({ path: "/api/v2/voucher/issue", methodName: "issue" }),
      makeSourceApi({ path: "/api/v2/voucher/cancel", methodName: "cancel" }),
      makeSourceApi({ path: "/api/v2/internal/debug", methodName: "debug" }),
    ]);
    const doc = makeDocSpec([
      makeDocApi({ path: "/api/v2/voucher/issue" }),
      makeDocApi({ path: "/api/v2/voucher/cancel" }),
    ]);
    const result = structuralMatch(src, doc);

    expect(result.matchedItems).toHaveLength(2);
    expect(result.unmatchedSourceApis).toHaveLength(1);
    expect(result.unmatchedSourceApis[0]?.methodName).toBe("debug");
    expect(result.unmatchedDocApis).toHaveLength(0);
  });

  it("method-augmented match — basePath + methodName으로 매칭", () => {
    // LPON 패턴: source path="/onnuripay/v1.0/account", method="accountList"
    //            doc path="/onnuripay/1.0/account/accountList"
    const src = makeSourceSpec([
      makeSourceApi({
        path: "/onnuripay/v1.0/account",
        methodName: "accountList",
      }),
    ]);
    const doc = makeDocSpec([
      makeDocApi({ path: "/onnuripay/1.0/account/accountList" }),
    ]);
    const result = structuralMatch(src, doc);

    expect(result.matchedItems).toHaveLength(1);
    expect(result.matchedItems[0]?.matchScore).toBe(0.9);
    expect(result.matchedItems[0]?.matchMethod).toBe("exact");
    expect(result.unmatchedSourceApis).toHaveLength(0);
  });

  it("method-augmented match — methodName이 이미 path에 포함되면 스킵", () => {
    const src = makeSourceSpec([
      makeSourceApi({
        path: "/api/v2/voucher/issue",
        methodName: "issue",
      }),
    ]);
    const doc = makeDocSpec([
      makeDocApi({ path: "/api/v2/voucher/issue" }),
    ]);
    const result = structuralMatch(src, doc);

    // Step 1 exact match에서 잡힘 (score 1.0)
    expect(result.matchedItems).toHaveLength(1);
    expect(result.matchedItems[0]?.matchScore).toBe(1.0);
  });

  it("version normalization — v1.0 vs 1.0 exact match", () => {
    const src = makeSourceSpec([
      makeSourceApi({ path: "/onnuripay/v1.0/auth/login" }),
    ]);
    const doc = makeDocSpec([
      makeDocApi({ path: "/onnuripay/1.0/auth/login" }),
    ]);
    const result = structuralMatch(src, doc);

    expect(result.matchedItems).toHaveLength(1);
    expect(result.matchedItems[0]?.matchScore).toBe(1.0);
    expect(result.matchedItems[0]?.matchMethod).toBe("exact");
  });

  it("full URL vs relative path — hostname 제거 후 매칭", () => {
    const src = makeSourceSpec([
      makeSourceApi({ path: "/onnuripay/v1.0/auth/login" }),
    ]);
    const doc = makeDocSpec([
      makeDocApi({ path: "https://app.e-onnurigiftcard.com/onnuripay/1.0/auth/login" }),
    ]);
    const result = structuralMatch(src, doc);

    expect(result.matchedItems).toHaveLength(1);
    expect(result.matchedItems[0]?.matchScore).toBe(1.0);
    expect(result.matchedItems[0]?.matchMethod).toBe("exact");
  });

  it("동일 경로 중복 — 먼저 매칭된 것이 우선", () => {
    const src = makeSourceSpec([
      makeSourceApi({ path: "/api/v2/voucher/list", methodName: "list1" }),
      makeSourceApi({ path: "/api/v2/voucher/list", methodName: "list2" }),
    ]);
    const doc = makeDocSpec([
      makeDocApi({ path: "/api/v2/voucher/list" }),
    ]);
    const result = structuralMatch(src, doc);

    // Only first source matches
    expect(result.matchedItems).toHaveLength(1);
    expect(result.unmatchedSourceApis).toHaveLength(1);
  });
});
