import { describe, it, expect } from "vitest";
import { generateApiSpec, buildOpenApiWrapper } from "../spec-api.js";
import type { SourceSpec, SourceApi } from "../../factcheck/types.js";
import type { MatchResult } from "../../factcheck/matcher.js";
import type { FactCheckGap, RelevanceCriteria } from "@ai-foundry/types";

// ── Helpers ─────────────────────────────────────────────────────

function makeSourceApi(overrides: Partial<SourceApi> = {}): SourceApi {
  return {
    path: "/api/v2/vouchers/issue",
    httpMethods: ["POST"],
    methodName: "issueVoucher",
    controllerClass: "VoucherController",
    parameters: [
      { name: "voucherId", type: "String", required: true, annotation: "@PathVariable" },
    ],
    returnType: "ResponseEntity",
    documentId: "src-doc-1",
    sourceFile: "VoucherController.java",
    ...overrides,
  };
}

function makeSourceSpec(apis: SourceApi[] = [makeSourceApi()]): SourceSpec {
  return {
    apis,
    tables: [],
    transactions: [],
    queries: [],
    stats: { controllerCount: 1, endpointCount: apis.length, tableCount: 0, mapperCount: 0 },
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

function makeGap(overrides: Partial<FactCheckGap> = {}): FactCheckGap {
  return {
    gapId: "gap-1",
    resultId: "result-1",
    organizationId: "LPON",
    gapType: "PM",
    severity: "MEDIUM",
    sourceItem: JSON.stringify({ path: "/api/v2/vouchers/issue", param: "test" }),
    description: "Test gap",
    autoResolved: false,
    reviewStatus: "pending",
    createdAt: "2026-03-06T00:00:00Z",
    ...overrides,
  };
}

function makeRelevanceCriteria(overrides: Partial<RelevanceCriteria> = {}): RelevanceCriteria {
  return {
    isExternalApi: true,
    isCoreEntity: false,
    isTransactionCore: true,
    score: 2,
    relevance: "core",
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe("generateApiSpec", () => {
  it("SourceApi + matched doc -> ApiSpecEntry with factCheck", () => {
    const api = makeSourceApi();
    const matchResult = makeMatchResult({
      matchedItems: [{
        sourceRef: { name: api.path, type: "api", documentId: "src-doc-1", location: "VoucherController.issueVoucher" },
        docRef: { name: api.path, type: "api", documentId: "doc-1", location: "인터페이스설계서.xlsx:Row5" },
        matchScore: 1.0,
        matchMethod: "exact",
      }],
    });
    const relevanceMap = new Map<string, RelevanceCriteria>();
    relevanceMap.set(api.path, makeRelevanceCriteria());

    const result = generateApiSpec({
      sourceSpec: makeSourceSpec(),
      matchResult,
      gaps: [],
      relevanceMap,
    });

    expect(result).toHaveLength(1);
    const entry = result[0]!;
    expect(entry.specId).toBe("spec-api-001");
    expect(entry.endpoint).toBe(api.path);
    expect(entry.httpMethod).toBe("POST");
    expect(entry.controllerClass).toBe("VoucherController");
    expect(entry.documentRef).toBe("인터페이스설계서.xlsx:Row5");
    expect(entry.factCheck.totalGaps).toBe(0);
    expect(entry.relevance).toBe("core");
    expect(entry.confidence).toBe(1.0);
  });

  it("SourceApi without doc match -> confidence lower", () => {
    const result = generateApiSpec({
      sourceSpec: makeSourceSpec(),
      matchResult: makeMatchResult(),
      gaps: [],
      relevanceMap: new Map(),
    });

    expect(result).toHaveLength(1);
    const entry = result[0]!;
    expect(entry.documentRef).toBeUndefined();
    expect(entry.confidence).toBe(0.5);
    expect(entry.relevance).toBe("unknown");
  });

  it("HIGH gap -> confidence < 0.7", () => {
    const api = makeSourceApi();
    const gap = makeGap({
      severity: "HIGH",
      sourceItem: JSON.stringify({ path: api.path }),
    });

    const result = generateApiSpec({
      sourceSpec: makeSourceSpec(),
      matchResult: makeMatchResult(),
      gaps: [gap],
      relevanceMap: new Map(),
    });

    const entry = result[0]!;
    expect(entry.factCheck.highGaps).toBe(1);
    // confidence = 0.5 (no doc) - 0.15 (HIGH) = 0.35
    expect(entry.confidence).toBe(0.35);
  });

  it("empty SourceSpec -> empty array", () => {
    const result = generateApiSpec({
      sourceSpec: makeSourceSpec([]),
      matchResult: makeMatchResult(),
      gaps: [],
      relevanceMap: new Map(),
    });

    expect(result).toHaveLength(0);
  });

  it("parameters with annotations -> correct source inference", () => {
    const api = makeSourceApi({
      parameters: [
        { name: "id", type: "Long", required: true, annotation: "@PathVariable" },
        { name: "data", type: "VoucherDTO", required: true, annotation: "@RequestBody" },
        { name: "token", type: "String", required: false, annotation: "@RequestHeader" },
      ],
    });

    const result = generateApiSpec({
      sourceSpec: makeSourceSpec([api]),
      matchResult: makeMatchResult(),
      gaps: [],
      relevanceMap: new Map(),
    });

    const entry = result[0]!;
    expect(entry.parameters).toHaveLength(3);
    expect(entry.parameters[0]!.source).toBe("path");
    expect(entry.parameters[1]!.source).toBe("body");
    expect(entry.parameters[2]!.source).toBe("header");
  });
});

describe("buildOpenApiWrapper", () => {
  it("produces valid OpenAPI 3.0 structure", () => {
    const entries = generateApiSpec({
      sourceSpec: makeSourceSpec(),
      matchResult: makeMatchResult(),
      gaps: [],
      relevanceMap: new Map(),
    });

    const wrapper = buildOpenApiWrapper(entries, "LPON", "pkg-test") as Record<string, unknown>;
    expect(wrapper["openapi"]).toBe("3.0.0");

    const info = wrapper["info"] as Record<string, unknown>;
    expect(info["title"]).toContain("LPON");

    const paths = wrapper["paths"] as Record<string, unknown>;
    expect(paths["/api/v2/vouchers/issue"]).toBeDefined();
  });
});
