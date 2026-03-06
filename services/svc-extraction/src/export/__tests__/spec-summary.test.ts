import { describe, it, expect } from "vitest";
import { generateCsvSummary } from "../spec-summary.js";
import type { ApiSpecEntry, TableSpecEntry } from "@ai-foundry/types";

// ── Helpers ─────────────────────────────────────────────────────

function makeApiEntry(overrides: Partial<ApiSpecEntry> = {}): ApiSpecEntry {
  return {
    specId: "spec-api-001",
    endpoint: "/api/v2/vouchers/issue",
    httpMethod: "POST",
    controllerClass: "VoucherController",
    methodName: "issueVoucher",
    sourceLocation: "VoucherController.java",
    parameters: [],
    returnType: "ResponseEntity",
    factCheck: { totalGaps: 1, highGaps: 0, gapIds: ["gap-1"], coveragePct: 95.0 },
    relevance: "core",
    confidence: 0.95,
    ...overrides,
  };
}

function makeTableEntry(overrides: Partial<TableSpecEntry> = {}): TableSpecEntry {
  return {
    specId: "spec-tbl-001",
    tableName: "TB_VOUCHER",
    sourceLocation: "VoucherMapper.xml",
    columns: [],
    factCheck: { totalGaps: 2, highGaps: 1, gapIds: ["gap-2", "gap-3"], coveragePct: 85.0 },
    relevance: "core",
    confidence: 0.90,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe("generateCsvSummary", () => {
  it("includes UTF-8 BOM prefix", () => {
    const csv = generateCsvSummary([], []);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it("includes header row", () => {
    const csv = generateCsvSummary([], []);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Spec Type,Name,Source Location");
  });

  it("API + Table rows are both included", () => {
    const csv = generateCsvSummary([makeApiEntry()], [makeTableEntry()]);
    const lines = csv.split("\n").filter((l) => l.trim().length > 0);

    // BOM + header + 1 API + 1 TABLE = 3 content lines
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("API");
    expect(lines[1]).toContain("/api/v2/vouchers/issue");
    expect(lines[2]).toContain("TABLE");
    expect(lines[2]).toContain("TB_VOUCHER");
  });

  it("Korean field names are preserved", () => {
    const csv = generateCsvSummary(
      [makeApiEntry({ documentRef: "인터페이스설계서.xlsx:Row5" })],
      [],
    );
    expect(csv).toContain("인터페이스설계서");
  });

  it("fields with commas are properly escaped", () => {
    const csv = generateCsvSummary(
      [makeApiEntry({ sourceLocation: "path,with,commas.java" })],
      [],
    );
    expect(csv).toContain('"path,with,commas.java"');
  });

  it("numeric values are formatted correctly", () => {
    const csv = generateCsvSummary([makeApiEntry()], []);
    const lines = csv.split("\n");
    const dataLine = lines[1]!;
    // Should contain gap counts and coverage
    expect(dataLine).toContain("1"); // totalGaps
    expect(dataLine).toContain("0"); // highGaps
    expect(dataLine).toContain("95.0"); // coveragePct
    expect(dataLine).toContain("0.95"); // confidence
  });

  it("empty documentRef produces empty field", () => {
    const csv = generateCsvSummary([makeApiEntry()], []);
    const lines = csv.split("\n");
    const dataLine = lines[1]!;
    const fields = dataLine.split(",");
    // Document Ref is field index 3 (0-based)
    expect(fields[3]).toBe("");
  });
});
