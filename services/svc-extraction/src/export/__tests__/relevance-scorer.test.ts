import { describe, it, expect } from "vitest";
import {
  classifyRelevance,
  isExternalApi,
  isCoreEntity,
  isTransactionCore,
  isTableTransactionCore,
  scoreApi,
  scoreTable,
} from "../relevance-scorer.js";
import type { SourceApi, SourceTable } from "../../factcheck/types.js";
import type { CodeTransaction, MyBatisQuery } from "@ai-foundry/types";

// ── Helpers ─────────────────────────────────────────────────────

function makeSourceApi(overrides: Partial<SourceApi> = {}): SourceApi {
  return {
    path: "/api/v2/vouchers/issue",
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

function makeSourceTable(overrides: Partial<SourceTable> = {}): SourceTable {
  return {
    tableName: "TB_VOUCHER",
    columns: [],
    source: "mybatis",
    documentId: "src-doc-1",
    sourceFile: "VoucherMapper.xml",
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<CodeTransaction> = {}): CodeTransaction {
  return {
    className: "VoucherServiceImpl",
    methodName: "issueVoucher",
    parameters: [],
    returnType: "void",
    isTransactional: true,
    readOnly: false,
    sourceFile: "VoucherServiceImpl.java",
    ...overrides,
  };
}

function makeQuery(overrides: Partial<MyBatisQuery> = {}): MyBatisQuery {
  return {
    id: "selectVoucher",
    queryType: "select",
    tables: ["TB_VOUCHER"],
    columnNames: ["voucher_id"],
    ...overrides,
  };
}

// ── classifyRelevance ───────────────────────────────────────────

describe("classifyRelevance", () => {
  it("External API + Transaction Core -> 'core' (score 2)", () => {
    const result = classifyRelevance({
      isExternalApi: true,
      isCoreEntity: false,
      isTransactionCore: true,
    });
    expect(result).toBe("core");
  });

  it("Internal API only -> 'non-core' (score 0)", () => {
    const result = classifyRelevance({
      isExternalApi: false,
      isCoreEntity: false,
      isTransactionCore: false,
    });
    expect(result).toBe("non-core");
  });

  it("Core Entity only -> 'unknown' (score 1)", () => {
    const result = classifyRelevance({
      isExternalApi: false,
      isCoreEntity: true,
      isTransactionCore: false,
    });
    expect(result).toBe("unknown");
  });

  it("All 3 criteria -> 'core' (score 3)", () => {
    const result = classifyRelevance({
      isExternalApi: true,
      isCoreEntity: true,
      isTransactionCore: true,
    });
    expect(result).toBe("core");
  });

  it("External API only -> 'unknown' (score 1)", () => {
    const result = classifyRelevance({
      isExternalApi: true,
      isCoreEntity: false,
      isTransactionCore: false,
    });
    expect(result).toBe("unknown");
  });
});

// ── isExternalApi ───────────────────────────────────────────────

describe("isExternalApi", () => {
  it("/api/v2/vouchers/issue -> true", () => {
    expect(isExternalApi(makeSourceApi())).toBe(true);
  });

  it("/internal/health -> false", () => {
    expect(isExternalApi(makeSourceApi({ path: "/internal/health" }))).toBe(false);
  });

  it("/actuator/metrics -> false", () => {
    expect(isExternalApi(makeSourceApi({ path: "/actuator/metrics" }))).toBe(false);
  });

  it("/api/debug/trace -> false", () => {
    expect(isExternalApi(makeSourceApi({ path: "/api/debug/trace" }))).toBe(false);
  });

  it("/api/test/mock -> false", () => {
    expect(isExternalApi(makeSourceApi({ path: "/api/test/mock" }))).toBe(false);
  });

  it("/api/v1/users -> true", () => {
    expect(isExternalApi(makeSourceApi({ path: "/api/v1/users" }))).toBe(true);
  });
});

// ── isCoreEntity ────────────────────────────────────────────────

describe("isCoreEntity", () => {
  it("3 or more JOIN references -> true", () => {
    const queries: MyBatisQuery[] = [
      makeQuery({ tables: ["TB_VOUCHER", "TB_ORDER"] }),
      makeQuery({ tables: ["TB_VOUCHER", "TB_USER"] }),
      makeQuery({ tables: ["TB_VOUCHER", "TB_PAYMENT"] }),
    ];
    expect(isCoreEntity("TB_VOUCHER", queries)).toBe(true);
  });

  it("standalone table (no JOINs) -> false", () => {
    const queries: MyBatisQuery[] = [
      makeQuery({ tables: ["TB_VOUCHER"] }),
      makeQuery({ tables: ["TB_VOUCHER"] }),
    ];
    expect(isCoreEntity("TB_VOUCHER", queries)).toBe(false);
  });

  it("only 2 JOIN references -> false", () => {
    const queries: MyBatisQuery[] = [
      makeQuery({ tables: ["TB_VOUCHER", "TB_ORDER"] }),
      makeQuery({ tables: ["TB_VOUCHER", "TB_USER"] }),
    ];
    expect(isCoreEntity("TB_VOUCHER", queries)).toBe(false);
  });

  it("table not in any queries -> false", () => {
    const queries: MyBatisQuery[] = [
      makeQuery({ tables: ["TB_ORDER", "TB_USER"] }),
    ];
    expect(isCoreEntity("TB_VOUCHER", queries)).toBe(false);
  });
});

// ── isTransactionCore ───────────────────────────────────────────

describe("isTransactionCore", () => {
  it("method matches @Transactional service -> true", () => {
    const transactions: CodeTransaction[] = [
      makeTransaction({ methodName: "issueVoucher", isTransactional: true }),
    ];
    expect(isTransactionCore("issueVoucher", transactions)).toBe(true);
  });

  it("non-transactional method -> false", () => {
    const transactions: CodeTransaction[] = [
      makeTransaction({ methodName: "issueVoucher", isTransactional: false }),
    ];
    expect(isTransactionCore("issueVoucher", transactions)).toBe(false);
  });

  it("no matching method -> false", () => {
    const transactions: CodeTransaction[] = [
      makeTransaction({ methodName: "cancelOrder", isTransactional: true }),
    ];
    expect(isTransactionCore("issueVoucher", transactions)).toBe(false);
  });

  it("partial name match (substring) -> true", () => {
    const transactions: CodeTransaction[] = [
      makeTransaction({ methodName: "doIssueVoucher", isTransactional: true }),
    ];
    expect(isTransactionCore("issueVoucher", transactions)).toBe(true);
  });
});

// ── isTableTransactionCore ──────────────────────────────────────

describe("isTableTransactionCore", () => {
  it("2+ write queries -> true", () => {
    const queries: MyBatisQuery[] = [
      makeQuery({ queryType: "insert", tables: ["TB_VOUCHER"] }),
      makeQuery({ queryType: "update", tables: ["TB_VOUCHER"] }),
    ];
    expect(isTableTransactionCore("TB_VOUCHER", queries)).toBe(true);
  });

  it("only 1 write query -> false", () => {
    const queries: MyBatisQuery[] = [
      makeQuery({ queryType: "insert", tables: ["TB_VOUCHER"] }),
      makeQuery({ queryType: "select", tables: ["TB_VOUCHER"] }),
    ];
    expect(isTableTransactionCore("TB_VOUCHER", queries)).toBe(false);
  });

  it("no write queries -> false", () => {
    const queries: MyBatisQuery[] = [
      makeQuery({ queryType: "select", tables: ["TB_VOUCHER"] }),
    ];
    expect(isTableTransactionCore("TB_VOUCHER", queries)).toBe(false);
  });
});

// ── scoreApi ────────────────────────────────────────────────────

describe("scoreApi", () => {
  it("external API with transactional service -> core", () => {
    const api = makeSourceApi();
    const transactions = [makeTransaction({ isTransactional: true })];
    const result = scoreApi(api, transactions);
    expect(result.relevance).toBe("core");
    expect(result.isExternalApi).toBe(true);
    expect(result.isTransactionCore).toBe(true);
    expect(result.isCoreEntity).toBe(false);
    expect(result.score).toBe(2);
  });

  it("internal API without transactions -> non-core", () => {
    const api = makeSourceApi({ path: "/internal/health" });
    const result = scoreApi(api, []);
    expect(result.relevance).toBe("non-core");
    expect(result.score).toBe(0);
  });
});

// ── scoreTable ──────────────────────────────────────────────────

describe("scoreTable", () => {
  it("core entity + write operations -> core", () => {
    const table = makeSourceTable();
    const queries: MyBatisQuery[] = [
      makeQuery({ tables: ["TB_VOUCHER", "TB_ORDER"] }),
      makeQuery({ tables: ["TB_VOUCHER", "TB_USER"] }),
      makeQuery({ tables: ["TB_VOUCHER", "TB_PAYMENT"] }),
      makeQuery({ queryType: "insert", tables: ["TB_VOUCHER"] }),
      makeQuery({ queryType: "update", tables: ["TB_VOUCHER"] }),
    ];
    const result = scoreTable(table, queries);
    expect(result.relevance).toBe("core");
    expect(result.isCoreEntity).toBe(true);
    expect(result.isTransactionCore).toBe(true);
  });

  it("no references or writes -> non-core", () => {
    const table = makeSourceTable();
    const result = scoreTable(table, []);
    expect(result.relevance).toBe("non-core");
    expect(result.score).toBe(0);
  });
});
