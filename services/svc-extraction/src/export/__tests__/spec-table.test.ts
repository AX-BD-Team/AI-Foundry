import { describe, it, expect } from "vitest";
import { generateTableSpec, buildTableSpecWrapper } from "../spec-table.js";
import type { SourceSpec, SourceTable, SourceTableColumn } from "../../factcheck/types.js";
import type { MatchResult } from "../../factcheck/matcher.js";
import type { FactCheckGap } from "@ai-foundry/types";

// ── Helpers ─────────────────────────────────────────────────────

function makeColumn(overrides: Partial<SourceTableColumn> = {}): SourceTableColumn {
  return {
    name: "voucher_id",
    sqlType: "VARCHAR(36)",
    javaType: "String",
    javaProperty: "voucherId",
    nullable: false,
    isPrimaryKey: true,
    ...overrides,
  };
}

function makeSourceTable(overrides: Partial<SourceTable> = {}): SourceTable {
  return {
    tableName: "TB_VOUCHER",
    columns: [makeColumn()],
    source: "mybatis",
    documentId: "src-doc-1",
    sourceFile: "VoucherMapper.xml",
    ...overrides,
  };
}

function makeSourceSpec(tables: SourceTable[] = [makeSourceTable()]): SourceSpec {
  return {
    apis: [],
    tables,
    stats: { controllerCount: 0, endpointCount: 0, tableCount: tables.length, mapperCount: 1 },
  };
}

function makeMatchResult(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    matchedItems: [],
    unmatchedSourceApis: [],
    unmatchedDocApis: [],
    unmatchedSourceTables: [],
    unmatchedDocTables: [],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe("generateTableSpec", () => {
  it("SourceTable + matched doc -> TableSpecEntry with columns", () => {
    const matchResult = makeMatchResult({
      matchedItems: [{
        sourceRef: { name: "TB_VOUCHER", type: "table", documentId: "src-doc-1", location: "VoucherMapper.xml" },
        docRef: { name: "TB_VOUCHER", type: "table", documentId: "doc-1", location: "테이블정의서.xlsx:Sheet3" },
        matchScore: 1.0,
        matchMethod: "exact",
      }],
    });

    const result = generateTableSpec({
      sourceSpec: makeSourceSpec(),
      matchResult,
      gaps: [],
      relevanceMap: new Map(),
    });

    expect(result).toHaveLength(1);
    const entry = result[0]!;
    expect(entry.specId).toBe("spec-tbl-001");
    expect(entry.tableName).toBe("TB_VOUCHER");
    expect(entry.documentRef).toBe("테이블정의서.xlsx:Sheet3");
    expect(entry.columns).toHaveLength(1);
    expect(entry.columns[0]!.name).toBe("voucher_id");
    expect(entry.columns[0]!.dataType).toBe("VARCHAR(36)");
    expect(entry.columns[0]!.isPrimaryKey).toBe(true);
    expect(entry.confidence).toBe(1.0);
  });

  it("MyBatis-based table -> includes both sqlType and javaType info", () => {
    const table = makeSourceTable({
      columns: [
        makeColumn({ sqlType: "BIGINT", javaType: "Long", javaProperty: "voucherId" }),
      ],
    });

    const result = generateTableSpec({
      sourceSpec: makeSourceSpec([table]),
      matchResult: makeMatchResult(),
      gaps: [],
      relevanceMap: new Map(),
    });

    const entry = result[0]!;
    const col = entry.columns[0]!;
    expect(col.dataType).toBe("BIGINT");
    expect(col.description).toContain("voucherId");
  });

  it("TM gap on column -> factCheck reflects it", () => {
    const gap: FactCheckGap = {
      gapId: "gap-tm-1",
      resultId: "result-1",
      organizationId: "LPON",
      gapType: "TM",
      severity: "HIGH",
      sourceItem: JSON.stringify({ table: "TB_VOUCHER", column: "voucher_id", type: "String" }),
      description: "Type mismatch",
      autoResolved: false,
      reviewStatus: "pending",
      createdAt: "2026-03-06T00:00:00Z",
    };

    const result = generateTableSpec({
      sourceSpec: makeSourceSpec(),
      matchResult: makeMatchResult(),
      gaps: [gap],
      relevanceMap: new Map(),
    });

    const entry = result[0]!;
    expect(entry.factCheck.totalGaps).toBe(1);
    expect(entry.factCheck.highGaps).toBe(1);
  });

  it("empty tables -> empty result", () => {
    const result = generateTableSpec({
      sourceSpec: makeSourceSpec([]),
      matchResult: makeMatchResult(),
      gaps: [],
      relevanceMap: new Map(),
    });

    expect(result).toHaveLength(0);
  });

  it("column without sqlType falls back to javaType", () => {
    const table = makeSourceTable({
      columns: [
        { name: "status", nullable: true, isPrimaryKey: false, javaType: "String" },
      ],
    });

    const result = generateTableSpec({
      sourceSpec: makeSourceSpec([table]),
      matchResult: makeMatchResult(),
      gaps: [],
      relevanceMap: new Map(),
    });

    const col = result[0]!.columns[0]!;
    expect(col.dataType).toBe("String");
  });

  it("column without any type -> UNKNOWN", () => {
    const table = makeSourceTable({
      columns: [
        { name: "unknown_col", nullable: true, isPrimaryKey: false },
      ],
    });

    const result = generateTableSpec({
      sourceSpec: makeSourceSpec([table]),
      matchResult: makeMatchResult(),
      gaps: [],
      relevanceMap: new Map(),
    });

    const col = result[0]!.columns[0]!;
    expect(col.dataType).toBe("UNKNOWN");
  });
});

describe("buildTableSpecWrapper", () => {
  it("produces correct wrapper structure", () => {
    const entries = generateTableSpec({
      sourceSpec: makeSourceSpec(),
      matchResult: makeMatchResult(),
      gaps: [],
      relevanceMap: new Map(),
    });

    const wrapper = buildTableSpecWrapper(entries, "LPON", "pkg-test") as Record<string, unknown>;
    expect(wrapper["version"]).toBe("1.0.0");

    const info = wrapper["info"] as Record<string, unknown>;
    expect(info["title"]).toContain("LPON");

    const tables = wrapper["tables"] as Array<Record<string, unknown>>;
    expect(tables).toHaveLength(1);
    expect(tables[0]!["tableName"]).toBe("TB_VOUCHER");
  });
});
