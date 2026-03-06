import { describe, it, expect, vi, beforeEach } from "vitest";
import { assembleAndStore } from "../packager.js";
import type { ApiSpecEntry, TableSpecEntry } from "@ai-foundry/types";
import type { Env } from "../../env.js";

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
    columns: [
      { name: "voucher_id", dataType: "VARCHAR(36)", nullable: false, isPrimaryKey: true },
    ],
    factCheck: { totalGaps: 2, highGaps: 1, gapIds: ["gap-2", "gap-3"], coveragePct: 85.0 },
    relevance: "core",
    confidence: 0.90,
    ...overrides,
  };
}

// ── Mock Env ────────────────────────────────────────────────────

interface PutCall {
  key: string;
  body: unknown;
  options: unknown;
}

function createMockEnv(): { env: Env; putCalls: PutCall[]; dbBindArgs: unknown[][] } {
  const putCalls: PutCall[] = [];
  const dbBindArgs: unknown[][] = [];

  const mockR2: Partial<R2Bucket> = {
    put: vi.fn(async (key: string, body: unknown, options?: unknown) => {
      putCalls.push({ key, body, options });
      return null as unknown as R2Object;
    }),
  };

  const mockStmt = {
    bind: vi.fn((...args: unknown[]) => {
      dbBindArgs.push(args);
      return {
        run: vi.fn(async () => ({ success: true, meta: { rows_written: 1 } })),
      };
    }),
  };

  const mockDb: Partial<D1Database> = {
    prepare: vi.fn(() => mockStmt as unknown as D1PreparedStatement),
  };

  const env = {
    R2_SPEC_PACKAGES: mockR2 as R2Bucket,
    DB_EXTRACTION: mockDb as D1Database,
  } as unknown as Env;

  return { env, putCalls, dbBindArgs };
}

// ── Tests ───────────────────────────────────────────────────────

describe("assembleAndStore", () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
  });

  it("stores 5 files in R2 (api + table + report + csv + manifest)", async () => {
    const manifest = await assembleAndStore(
      mockEnv.env,
      "LPON",
      "result-1",
      [makeApiEntry()],
      [makeTableEntry()],
      "# Report",
      "\uFEFFSpec Type,Name\n",
    );

    // 5 R2 puts: api, table, report, csv, manifest
    expect(mockEnv.putCalls).toHaveLength(5);

    const keys = mockEnv.putCalls.map((c) => c.key);
    expect(keys.some((k) => k.endsWith("/spec-api.json"))).toBe(true);
    expect(keys.some((k) => k.endsWith("/spec-table.json"))).toBe(true);
    expect(keys.some((k) => k.endsWith("/fact-check-report.md"))).toBe(true);
    expect(keys.some((k) => k.endsWith("/spec-summary.csv"))).toBe(true);
    expect(keys.some((k) => k.endsWith("/manifest.json"))).toBe(true);

    // Verify all keys share the same prefix
    const prefix = `spec-packages/LPON/${manifest.packageId}`;
    for (const key of keys) {
      expect(key.startsWith(prefix)).toBe(true);
    }
  });

  it("creates D1 spec_packages record", async () => {
    const manifest = await assembleAndStore(
      mockEnv.env,
      "LPON",
      "result-1",
      [makeApiEntry()],
      [makeTableEntry()],
      "# Report",
      "\uFEFFSpec Type,Name\n",
    );

    expect(mockEnv.env.DB_EXTRACTION.prepare).toHaveBeenCalled();
    expect(mockEnv.dbBindArgs).toHaveLength(1);

    const args = mockEnv.dbBindArgs[0]!;
    expect(args[0]).toBe(manifest.packageId);
    expect(args[1]).toBe("LPON");
    expect(args[2]).toBe("result-1");
  });

  it("computes manifest stats accurately", async () => {
    const manifest = await assembleAndStore(
      mockEnv.env,
      "LPON",
      undefined,
      [makeApiEntry(), makeApiEntry({ specId: "spec-api-002", relevance: "non-core" })],
      [makeTableEntry()],
      "# Report",
      "CSV",
    );

    expect(manifest.stats.totalApis).toBe(2);
    expect(manifest.stats.coreApis).toBe(1);
    expect(manifest.stats.totalTables).toBe(1);
    expect(manifest.stats.coreTables).toBe(1);
    expect(manifest.stats.totalGaps).toBe(4); // 1 + 1 + 2
    expect(manifest.stats.highGaps).toBe(1); // 0 + 0 + 1
  });

  it("manifest includes all 5 file entries", async () => {
    const manifest = await assembleAndStore(
      mockEnv.env,
      "LPON",
      "result-1",
      [makeApiEntry()],
      [makeTableEntry()],
      "# Report",
      "CSV",
    );

    expect(manifest.files).toHaveLength(4); // api, table, report, csv (manifest not in files list)
    const fileNames = manifest.files.map((f) => f.name);
    expect(fileNames).toContain("spec-api.json");
    expect(fileNames).toContain("spec-table.json");
    expect(fileNames).toContain("fact-check-report.md");
    expect(fileNames).toContain("spec-summary.csv");
  });

  it("handles undefined resultId correctly", async () => {
    const manifest = await assembleAndStore(
      mockEnv.env,
      "LPON",
      undefined,
      [],
      [],
      "",
      "",
    );

    expect(manifest.resultId).toBeUndefined();
    // D1 bind should get null for resultId
    const args = mockEnv.dbBindArgs[0]!;
    expect(args[2]).toBeNull();
  });
});
