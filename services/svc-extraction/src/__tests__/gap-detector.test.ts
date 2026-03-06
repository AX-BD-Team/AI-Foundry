import { describe, it, expect } from "vitest";
import { detectGaps } from "../factcheck/gap-detector.js";
import type { MatchResult } from "../factcheck/matcher.js";
import type {
  SourceSpec,
  DocSpec,
  SourceApi,
  SourceTable,
  SourceTableColumn,
  DocApi,
  DocTable,
  DocTableColumn,
} from "../factcheck/types.js";

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

function makeSourceColumn(overrides: Partial<SourceTableColumn> = {}): SourceTableColumn {
  return {
    name: "account_no",
    javaProperty: "accountNo",
    nullable: false,
    isPrimaryKey: true,
    ...overrides,
  };
}

function makeDocColumn(overrides: Partial<DocTableColumn> = {}): DocTableColumn {
  return {
    name: "account_no",
    dataType: "VARCHAR(20)",
    isPrimaryKey: true,
    ...overrides,
  };
}

function makeSourceTable(overrides: Partial<SourceTable> = {}): SourceTable {
  return {
    tableName: "account_balance",
    columns: [
      makeSourceColumn(),
      makeSourceColumn({ name: "balance", javaProperty: "balance", javaType: "Long", nullable: true, isPrimaryKey: false }),
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
      makeDocColumn(),
      makeDocColumn({ name: "balance", dataType: "BIGINT" }),
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

function emptyMatchResult(): MatchResult {
  return {
    matchedItems: [],
    unmatchedSourceApis: [],
    unmatchedDocApis: [],
    unmatchedSourceTables: [],
    unmatchedDocTables: [],
  };
}

const RESULT_ID = "result-001";
const ORG_ID = "org-test";

// ── detectGaps ──────────────────────────────────────────────────

describe("detectGaps", () => {
  // ── Empty MatchResult ─────────────────────────────────────────

  it("빈 MatchResult → gap 없음", () => {
    const result = detectGaps(
      emptyMatchResult(),
      makeSourceSpec(),
      makeDocSpec(),
      RESULT_ID,
      ORG_ID,
    );

    expect(result.gaps).toHaveLength(0);
    expect(result.stats.total).toBe(0);
  });

  // ── MID gaps (source only) ────────────────────────────────────

  describe("MID gaps — 소스에만 존재", () => {
    it("unmatched source API → MID gap", () => {
      const mr = emptyMatchResult();
      mr.unmatchedSourceApis = [makeSourceApi({ path: "/api/v2/voucher/issue" })];

      const result = detectGaps(
        mr,
        makeSourceSpec([makeSourceApi()]),
        makeDocSpec(),
        RESULT_ID,
        ORG_ID,
      );

      expect(result.gaps).toHaveLength(1);
      const gap = result.gaps[0];
      expect(gap).toBeDefined();
      expect(gap!.gapType).toBe("MID");
      expect(gap!.description).toContain("소스 API");
      expect(gap!.description).toContain("/api/v2/voucher/issue");
      expect(gap!.reviewStatus).toBe("pending");
      expect(gap!.autoResolved).toBe(false);
    });

    it("unmatched source table → MID gap (HIGH severity)", () => {
      const mr = emptyMatchResult();
      mr.unmatchedSourceTables = [makeSourceTable()];

      const result = detectGaps(
        mr,
        makeSourceSpec([], [makeSourceTable()]),
        makeDocSpec(),
        RESULT_ID,
        ORG_ID,
      );

      expect(result.gaps).toHaveLength(1);
      const gap = result.gaps[0];
      expect(gap).toBeDefined();
      expect(gap!.gapType).toBe("MID");
      expect(gap!.severity).toBe("HIGH");
      expect(gap!.description).toContain("소스 테이블");
    });

    it("내부 API (/internal/) → MID gap (LOW severity)", () => {
      const mr = emptyMatchResult();
      const internalApi = makeSourceApi({ path: "/api/v2/internal/health" });
      mr.unmatchedSourceApis = [internalApi];

      const result = detectGaps(
        mr,
        makeSourceSpec([internalApi]),
        makeDocSpec(),
        RESULT_ID,
        ORG_ID,
      );

      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0]!.severity).toBe("LOW");
    });
  });

  // ── MC gaps (doc only) ────────────────────────────────────────

  describe("MC gaps — 문서에만 존재", () => {
    it("unmatched doc API → MC gap", () => {
      const mr = emptyMatchResult();
      mr.unmatchedDocApis = [makeDocApi({ path: "/api/v2/payment/refund" })];

      const result = detectGaps(
        mr,
        makeSourceSpec(),
        makeDocSpec([makeDocApi()]),
        RESULT_ID,
        ORG_ID,
      );

      expect(result.gaps).toHaveLength(1);
      const gap = result.gaps[0];
      expect(gap).toBeDefined();
      expect(gap!.gapType).toBe("MC");
      expect(gap!.description).toContain("문서 API");
    });

    it("unmatched doc table → MC gap (HIGH severity, isRequired=true)", () => {
      const mr = emptyMatchResult();
      mr.unmatchedDocTables = [makeDocTable()];

      const result = detectGaps(
        mr,
        makeSourceSpec(),
        makeDocSpec([], [makeDocTable()]),
        RESULT_ID,
        ORG_ID,
      );

      expect(result.gaps).toHaveLength(1);
      const gap = result.gaps[0];
      expect(gap).toBeDefined();
      expect(gap!.gapType).toBe("MC");
      expect(gap!.severity).toBe("HIGH");
    });
  });

  // ── TM gaps (type mismatch) ───────────────────────────────────

  describe("TM gaps — 타입 불일치", () => {
    it("String vs BIGINT → TM gap (HIGH)", () => {
      const srcTable = makeSourceTable({
        tableName: "orders",
        columns: [
          makeSourceColumn({ name: "order_id", javaProperty: "orderId", javaType: "String", isPrimaryKey: true, nullable: false }),
        ],
      });
      const docTable = makeDocTable({
        tableName: "orders",
        columns: [
          makeDocColumn({ name: "order_id", dataType: "BIGINT", isPrimaryKey: true }),
        ],
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "orders", type: "table", documentId: "src-doc-1", location: "OrderMapper.xml" },
          docRef: { name: "orders", type: "table", documentId: "doc-doc-1", location: "테이블정의서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([], [srcTable]),
        makeDocSpec([], [docTable]),
        RESULT_ID,
        ORG_ID,
      );

      const tmGaps = result.gaps.filter((g) => g.gapType === "TM");
      expect(tmGaps).toHaveLength(1);
      expect(tmGaps[0]!.severity).toBe("HIGH");
      expect(tmGaps[0]!.description).toContain("String");
      expect(tmGaps[0]!.description).toContain("BIGINT");
    });

    it("Long vs BIGINT (호환 타입) → TM gap 없음", () => {
      const srcTable = makeSourceTable({
        tableName: "orders",
        columns: [
          makeSourceColumn({ name: "amount", javaProperty: "amount", javaType: "Long", isPrimaryKey: false, nullable: true }),
        ],
      });
      const docTable = makeDocTable({
        tableName: "orders",
        columns: [
          makeDocColumn({ name: "amount", dataType: "BIGINT", isPrimaryKey: false }),
        ],
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "orders", type: "table", documentId: "src-doc-1", location: "OrderMapper.xml" },
          docRef: { name: "orders", type: "table", documentId: "doc-doc-1", location: "테이블정의서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([], [srcTable]),
        makeDocSpec([], [docTable]),
        RESULT_ID,
        ORG_ID,
      );

      const tmGaps = result.gaps.filter((g) => g.gapType === "TM");
      expect(tmGaps).toHaveLength(0);
    });
  });

  // ── SM gaps (schema mismatch / column diff) ───────────────────

  describe("SM gaps — 컬럼 불일치", () => {
    it("소스에만 있는 컬럼 → SM gap", () => {
      const srcTable = makeSourceTable({
        tableName: "users",
        columns: [
          makeSourceColumn({ name: "user_id", javaProperty: "userId", isPrimaryKey: true, nullable: false }),
          makeSourceColumn({ name: "email", javaProperty: "email", isPrimaryKey: false, nullable: false }),
          makeSourceColumn({ name: "internal_flag", javaProperty: "internalFlag", isPrimaryKey: false, nullable: true }),
        ],
      });
      const docTable = makeDocTable({
        tableName: "users",
        columns: [
          makeDocColumn({ name: "user_id", dataType: "VARCHAR(20)", isPrimaryKey: true }),
          makeDocColumn({ name: "email", dataType: "VARCHAR(100)" }),
        ],
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "users", type: "table", documentId: "src-doc-1", location: "UserMapper.xml" },
          docRef: { name: "users", type: "table", documentId: "doc-doc-1", location: "테이블정의서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([], [srcTable]),
        makeDocSpec([], [docTable]),
        RESULT_ID,
        ORG_ID,
      );

      const smGaps = result.gaps.filter((g) => g.gapType === "SM");
      expect(smGaps).toHaveLength(1);
      expect(smGaps[0]!.description).toContain("internal_flag");
    });

    it("문서에만 있는 컬럼 → SM gap", () => {
      const srcTable = makeSourceTable({
        tableName: "products",
        columns: [
          makeSourceColumn({ name: "product_id", javaProperty: "productId", isPrimaryKey: true, nullable: false }),
        ],
      });
      const docTable = makeDocTable({
        tableName: "products",
        columns: [
          makeDocColumn({ name: "product_id", dataType: "VARCHAR(20)", isPrimaryKey: true }),
          makeDocColumn({ name: "extra_col", dataType: "VARCHAR(50)", isPrimaryKey: false }),
        ],
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "products", type: "table", documentId: "src-doc-1", location: "ProductMapper.xml" },
          docRef: { name: "products", type: "table", documentId: "doc-doc-1", location: "테이블정의서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([], [srcTable]),
        makeDocSpec([], [docTable]),
        RESULT_ID,
        ORG_ID,
      );

      const smGaps = result.gaps.filter((g) => g.gapType === "SM");
      expect(smGaps).toHaveLength(1);
      expect(smGaps[0]!.description).toContain("extra_col");
    });
  });

  // ── PM gaps (parameter mismatch) ──────────────────────────────

  describe("PM gaps — 파라미터 불일치", () => {
    it("소스 필수 파라미터(@RequestBody)가 문서에 없음 → PM gap (LOW, VO 다운그레이드)", () => {
      const srcApi = makeSourceApi({
        path: "/api/v2/payment/process",
        parameters: [
          { name: "orderId", type: "String", required: true, annotation: "@PathVariable" },
          { name: "amount", type: "Long", required: true, annotation: "@RequestBody" },
        ],
      });
      const docApi = makeDocApi({
        path: "/api/v2/payment/process",
        parameters: [
          { name: "orderId", type: "String", required: true },
        ],
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "/api/v2/payment/process", type: "api", documentId: "src-doc-1", location: "PaymentController.process" },
          docRef: { name: "/api/v2/payment/process", type: "api", documentId: "doc-doc-1", location: "인터페이스설계서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([srcApi]),
        makeDocSpec([docApi]),
        RESULT_ID,
        ORG_ID,
      );

      const pmGaps = result.gaps.filter((g) => g.gapType === "PM");
      expect(pmGaps).toHaveLength(1);
      expect(pmGaps[0]!.severity).toBe("LOW");
      expect(pmGaps[0]!.description).toContain("amount");
      expect(pmGaps[0]!.description).toContain("필수");
    });

    it("문서 파라미터가 소스에 없음 → PM gap", () => {
      const srcApi = makeSourceApi({
        path: "/api/v2/user/search",
        parameters: [
          { name: "keyword", type: "String", required: true, annotation: "@RequestParam" },
        ],
      });
      const docApi = makeDocApi({
        path: "/api/v2/user/search",
        parameters: [
          { name: "keyword", type: "String", required: true },
          { name: "sortBy", type: "String" },
        ],
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "/api/v2/user/search", type: "api", documentId: "src-doc-1", location: "UserController.search" },
          docRef: { name: "/api/v2/user/search", type: "api", documentId: "doc-doc-1", location: "인터페이스설계서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([srcApi]),
        makeDocSpec([docApi]),
        RESULT_ID,
        ORG_ID,
      );

      const pmGaps = result.gaps.filter((g) => g.gapType === "PM");
      expect(pmGaps).toHaveLength(1);
      expect(pmGaps[0]!.description).toContain("sortBy");
    });

    it("파라미터 없는 API → PM gap 없음", () => {
      const srcApi = makeSourceApi({
        path: "/api/v2/health",
        parameters: [],
      });
      const docApi = makeDocApi({
        path: "/api/v2/health",
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "/api/v2/health", type: "api", documentId: "src-doc-1", location: "HealthController.check" },
          docRef: { name: "/api/v2/health", type: "api", documentId: "doc-doc-1", location: "인터페이스설계서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([srcApi]),
        makeDocSpec([docApi]),
        RESULT_ID,
        ORG_ID,
      );

      expect(result.gaps).toHaveLength(0);
    });

    it("Auth 헤더 파라미터 → PM gap 제외", () => {
      const srcApi = makeSourceApi({
        path: "/api/v1/account/list",
        parameters: [
          { name: "Auth", type: "String", required: true },
          { name: "accountVO", type: "AccountVO", required: true, annotation: "@RequestBody" },
        ],
      });
      const docApi = makeDocApi({
        path: "/api/v1/account/list",
        parameters: [],
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "/api/v1/account/list", type: "api", documentId: "src-doc-1", location: "AccountController.list" },
          docRef: { name: "/api/v1/account/list", type: "api", documentId: "doc-doc-1", location: "인터페이스설계서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([srcApi]),
        makeDocSpec([docApi]),
        RESULT_ID,
        ORG_ID,
      );

      const pmGaps = result.gaps.filter((g) => g.gapType === "PM");
      // Auth is filtered out, only accountVO remains
      expect(pmGaps).toHaveLength(1);
      expect(pmGaps[0]!.description).toContain("accountVO");
    });

    it("@RequestHeader annotation → PM gap 제외", () => {
      const srcApi = makeSourceApi({
        path: "/api/v1/user/info",
        parameters: [
          { name: "Authorization", type: "String", required: true, annotation: "@RequestHeader" },
          { name: "userId", type: "Long", required: true, annotation: "@RequestParam" },
        ],
      });
      const docApi = makeDocApi({
        path: "/api/v1/user/info",
        parameters: [],
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "/api/v1/user/info", type: "api", documentId: "src-doc-1", location: "UserController.info" },
          docRef: { name: "/api/v1/user/info", type: "api", documentId: "doc-doc-1", location: "인터페이스설계서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([srcApi]),
        makeDocSpec([docApi]),
        RESULT_ID,
        ORG_ID,
      );

      const pmGaps = result.gaps.filter((g) => g.gapType === "PM");
      // Authorization is filtered by @RequestHeader, only userId remains
      expect(pmGaps).toHaveLength(1);
      expect(pmGaps[0]!.description).toContain("userId");
    });

    it("@RequestBody VO 파라미터 → PM gap LOW severity", () => {
      const srcApi = makeSourceApi({
        path: "/api/v1/store/register",
        parameters: [
          { name: "storeVO", type: "StoreVO", required: true, annotation: "@RequestBody" },
          { name: "userId", type: "Long", required: true, annotation: "@RequestParam" },
        ],
      });
      const docApi = makeDocApi({
        path: "/api/v1/store/register",
        parameters: [],
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "/api/v1/store/register", type: "api", documentId: "src-doc-1", location: "StoreController.register" },
          docRef: { name: "/api/v1/store/register", type: "api", documentId: "doc-doc-1", location: "인터페이스설계서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([srcApi]),
        makeDocSpec([docApi]),
        RESULT_ID,
        ORG_ID,
      );

      const pmGaps = result.gaps.filter((g) => g.gapType === "PM");
      expect(pmGaps).toHaveLength(2);
      const voGap = pmGaps.find((g) => g.description.includes("storeVO"));
      const paramGap = pmGaps.find((g) => g.description.includes("userId"));
      expect(voGap).toBeDefined();
      expect(voGap!.severity).toBe("LOW"); // @RequestBody → LOW
      expect(paramGap).toBeDefined();
      expect(paramGap!.severity).toBe("HIGH"); // @RequestParam required → HIGH
    });

    it("@PathVariable 또는 URL {param} → PM gap 제외", () => {
      const srcApi = makeSourceApi({
        path: "/api/v1/error/{flag}",
        parameters: [
          { name: "flag", type: "String", required: true },
          { name: "detail", type: "Boolean", required: false, annotation: "@PathVariable" },
        ],
      });
      const docApi = makeDocApi({
        path: "/api/v1/error/{flag}",
        parameters: [],
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "/api/v1/error/{flag}", type: "api", documentId: "src-doc-1", location: "ErrorController.error" },
          docRef: { name: "/api/v1/error/{flag}", type: "api", documentId: "doc-doc-1", location: "인터페이스설계서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([srcApi]),
        makeDocSpec([docApi]),
        RESULT_ID,
        ORG_ID,
      );

      const pmGaps = result.gaps.filter((g) => g.gapType === "PM");
      // flag is filtered by URL {flag}, detail is filtered by @PathVariable
      expect(pmGaps).toHaveLength(0);
    });
  });

  // ── Stats ─────────────────────────────────────────────────────

  describe("stats 집계", () => {
    it("복합 시나리오 — byType/bySeverity 집계", () => {
      const mr: MatchResult = {
        matchedItems: [],
        unmatchedSourceApis: [
          makeSourceApi({ path: "/api/v2/voucher/issue" }),
          makeSourceApi({ path: "/api/v2/internal/debug" }),
        ],
        unmatchedDocApis: [makeDocApi({ path: "/api/v2/payment/refund" })],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec(),
        makeDocSpec(),
        RESULT_ID,
        ORG_ID,
      );

      expect(result.stats.total).toBe(3);
      expect(result.stats["byType"]["MID"]).toBe(2);
      expect(result.stats["byType"]["MC"]).toBe(1);
    });
  });

  // ── Gap metadata ──────────────────────────────────────────────

  describe("gap 메타데이터", () => {
    it("gapId는 UUID 형식", () => {
      const mr = emptyMatchResult();
      mr.unmatchedSourceApis = [makeSourceApi()];

      const result = detectGaps(
        mr,
        makeSourceSpec([makeSourceApi()]),
        makeDocSpec(),
        RESULT_ID,
        ORG_ID,
      );

      expect(result.gaps).toHaveLength(1);
      const gap = result.gaps[0];
      expect(gap).toBeDefined();
      // UUID v4 format: 8-4-4-4-12 hex chars
      expect(gap!.gapId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it("resultId와 organizationId가 전달됨", () => {
      const mr = emptyMatchResult();
      mr.unmatchedSourceApis = [makeSourceApi()];

      const result = detectGaps(
        mr,
        makeSourceSpec([makeSourceApi()]),
        makeDocSpec(),
        "custom-result-id",
        "custom-org-id",
      );

      expect(result.gaps[0]!.resultId).toBe("custom-result-id");
      expect(result.gaps[0]!.organizationId).toBe("custom-org-id");
    });

    it("sourceItem은 JSON 문자열", () => {
      const mr = emptyMatchResult();
      mr.unmatchedSourceApis = [makeSourceApi({ path: "/api/v2/test" })];

      const result = detectGaps(
        mr,
        makeSourceSpec([makeSourceApi()]),
        makeDocSpec(),
        RESULT_ID,
        ORG_ID,
      );

      const parsed = JSON.parse(result.gaps[0]!.sourceItem) as Record<string, unknown>;
      expect(parsed["path"]).toBe("/api/v2/test");
    });

    it("createdAt은 ISO 형식", () => {
      const mr = emptyMatchResult();
      mr.unmatchedDocApis = [makeDocApi()];

      const result = detectGaps(
        mr,
        makeSourceSpec(),
        makeDocSpec([makeDocApi()]),
        RESULT_ID,
        ORG_ID,
      );

      const gap = result.gaps[0];
      expect(gap).toBeDefined();
      expect(new Date(gap!.createdAt).toISOString()).toBe(gap!.createdAt);
    });
  });

  // ── camelCase ↔ snake_case column matching ────────────────────

  describe("컬럼명 camelCase ↔ snake_case 매칭", () => {
    it("javaProperty(camelCase) ↔ doc column(snake_case) 매칭 → SM gap 없음", () => {
      const srcTable = makeSourceTable({
        tableName: "orders",
        columns: [
          makeSourceColumn({ name: "order_id", javaProperty: "orderId", isPrimaryKey: true, nullable: false }),
          makeSourceColumn({ name: "created_at", javaProperty: "createdAt", isPrimaryKey: false, nullable: true }),
        ],
      });
      const docTable = makeDocTable({
        tableName: "orders",
        columns: [
          makeDocColumn({ name: "order_id", dataType: "VARCHAR(20)", isPrimaryKey: true }),
          makeDocColumn({ name: "created_at", dataType: "TIMESTAMP" }),
        ],
      });

      const mr: MatchResult = {
        matchedItems: [{
          sourceRef: { name: "orders", type: "table", documentId: "src-doc-1", location: "OrderMapper.xml" },
          docRef: { name: "orders", type: "table", documentId: "doc-doc-1", location: "테이블정의서.xlsx" },
          matchScore: 1.0,
          matchMethod: "exact",
        }],
        unmatchedSourceApis: [],
        unmatchedDocApis: [],
        unmatchedSourceTables: [],
        unmatchedDocTables: [],
      };

      const result = detectGaps(
        mr,
        makeSourceSpec([], [srcTable]),
        makeDocSpec([], [docTable]),
        RESULT_ID,
        ORG_ID,
      );

      expect(result.gaps).toHaveLength(0);
    });
  });
});
