import { describe, it, expect, vi, beforeEach } from "vitest";
import { aggregateSourceSpec, combinePath, extractShortClassName } from "../factcheck/source-aggregator.js";
import type { Env } from "../env.js";

// ── Helpers ──────────────────────────────────────────────────────

/** Build a mock Env with SVC_INGESTION fetcher. */
function createMockEnv(fetchResponses: Map<string, unknown>): Env {
  return {
    DB_EXTRACTION: {} as D1Database,
    QUEUE_PIPELINE: { send: vi.fn() } as unknown as Queue,
    SECURITY: { fetch: vi.fn() } as unknown as Fetcher,
    LLM_ROUTER: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_INGESTION: {
      fetch: vi.fn().mockImplementation((url: string) => {
        // Match URL pattern against registered responses
        for (const [pattern, data] of fetchResponses) {
          if (url.includes(pattern)) {
            return Promise.resolve(
              new Response(JSON.stringify(data), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            );
          }
        }
        // Default: empty success
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }),
        );
      }),
    } as unknown as Fetcher,
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-extraction",
    INTERNAL_API_SECRET: "test-secret",
    R2_SPEC_PACKAGES: {} as unknown as R2Bucket,
  };
}

function makeControllerChunkText(overrides?: Partial<{
  className: string;
  basePath: string;
  endpoints: Array<{
    httpMethod: string[];
    path: string;
    methodName: string;
    parameters: Array<{ name: string; type: string; required: boolean }>;
    returnType: string;
    swaggerSummary?: string;
  }>;
  sourceFile: string;
}>): string {
  return JSON.stringify({
    className: overrides?.className ?? "BalanceController",
    packageName: "com.kt.onnuri.controller",
    basePath: overrides?.basePath ?? "/api/balance",
    endpoints: overrides?.endpoints ?? [
      {
        httpMethod: ["GET"],
        path: "/{id}",
        methodName: "getBalance",
        parameters: [{ name: "id", type: "Long", required: true, annotation: "@PathVariable" }],
        returnType: "BalanceVO",
        swaggerSummary: "잔액 조회",
      },
      {
        httpMethod: ["POST"],
        path: "",
        methodName: "createBalance",
        parameters: [{ name: "body", type: "BalanceVO", required: true, annotation: "@RequestBody" }],
        returnType: "ResponseEntity",
      },
    ],
    sourceFile: overrides?.sourceFile ?? "BalanceController.java",
  });
}

function makeMapperChunkText(overrides?: Partial<{
  namespace: string;
  mapperName: string;
  resultMaps: Array<{
    id: string;
    type: string;
    typeName: string;
    columns: Array<{ column: string; property: string; javaType?: string; jdbcType?: string; isPrimaryKey?: boolean }>;
  }>;
  queries: Array<{ id: string; queryType: string; tables: string[]; columnNames: string[] }>;
  tables: string[];
  sourceFile: string;
}>): string {
  return JSON.stringify({
    namespace: overrides?.namespace ?? "com.kt.onnuri.mapper.BalanceMapper",
    mapperName: overrides?.mapperName ?? "BalanceMapper",
    resultMaps: overrides?.resultMaps ?? [
      {
        id: "BalanceResultMap",
        type: "com.kt.onnuri.model.BalanceVO",
        typeName: "BalanceVO",
        columns: [
          { column: "BALANCE_ID", property: "balanceId", javaType: "Long", jdbcType: "BIGINT", isPrimaryKey: true },
          { column: "AMOUNT", property: "amount", javaType: "BigDecimal", jdbcType: "DECIMAL", isPrimaryKey: false },
          { column: "USER_ID", property: "userId", javaType: "String", jdbcType: "VARCHAR", isPrimaryKey: false },
        ],
      },
    ],
    queries: overrides?.queries ?? [
      { id: "selectBalance", queryType: "select", tables: ["TB_BALANCE"], parameterType: "Long", resultMapRef: "BalanceResultMap", columnNames: ["BALANCE_ID", "AMOUNT", "USER_ID"] },
    ],
    tables: overrides?.tables ?? ["TB_BALANCE"],
    sourceFile: overrides?.sourceFile ?? "BalanceMapper.xml",
  });
}

function makeDataModelChunkText(overrides?: Partial<{
  className: string;
  packageName: string;
  fields: Array<{ name: string; type: string; nullable: boolean }>;
  sourceFile: string;
}>): string {
  return JSON.stringify({
    className: overrides?.className ?? "BalanceVO",
    packageName: overrides?.packageName ?? "com.kt.onnuri.model",
    modelType: "vo",
    fields: overrides?.fields ?? [
      { name: "balanceId", type: "Long", nullable: false },
      { name: "amount", type: "BigDecimal", nullable: true },
      { name: "userId", type: "String", nullable: false },
    ],
    sourceFile: overrides?.sourceFile ?? "BalanceVO.java",
  });
}

// ── Tests ────────────────────────────────────────────────────────

describe("aggregateSourceSpec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("빈 소스 문서 → 빈 SourceSpec 반환", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents", {
      success: true,
      data: { documents: [], total: 0 },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    expect(spec.apis).toEqual([]);
    expect(spec.tables).toEqual([]);
    expect(spec.stats.controllerCount).toBe(0);
    expect(spec.stats.endpointCount).toBe(0);
    expect(spec.stats.tableCount).toBe(0);
    expect(spec.stats.mapperCount).toBe(0);
  });

  it("CodeController → SourceApi 변환 (basePath + endpoint.path 결합)", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents?", {
      success: true,
      data: {
        documents: [
          { document_id: "doc-ctrl-1", status: "parsed", original_name: "test.zip", file_type: "zip" },
        ],
        total: 1,
      },
    });
    responses.set("/documents/doc-ctrl-1/chunks", {
      success: true,
      data: {
        documentId: "doc-ctrl-1",
        chunks: [
          {
            chunk_id: "c-1",
            chunk_index: 0,
            element_type: "CodeController",
            masked_text: makeControllerChunkText(),
            classification: "source_controller",
            word_count: 100,
          },
        ],
      },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    expect(spec.stats.controllerCount).toBe(1);
    expect(spec.stats.endpointCount).toBe(2);
    expect(spec.apis).toHaveLength(2);

    // Verify basePath + endpoint path combination
    const getApi = spec.apis.find((a) => a.methodName === "getBalance");
    expect(getApi).toBeDefined();
    expect(getApi?.path).toBe("/api/balance/{id}");
    expect(getApi?.httpMethods).toEqual(["GET"]);
    expect(getApi?.controllerClass).toBe("BalanceController");
    expect(getApi?.documentId).toBe("doc-ctrl-1");
    expect(getApi?.parameters).toHaveLength(1);
    expect(getApi?.parameters[0]?.name).toBe("id");

    // Empty endpoint path → basePath only
    const postApi = spec.apis.find((a) => a.methodName === "createBalance");
    expect(postApi?.path).toBe("/api/balance");
    expect(postApi?.httpMethods).toEqual(["POST"]);
  });

  it("CodeMapper → SourceTable 변환 (resultMap columns → SourceTableColumn)", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents?", {
      success: true,
      data: {
        documents: [
          { document_id: "doc-mapper-1", status: "parsed", original_name: "mapper.zip", file_type: "zip" },
        ],
        total: 1,
      },
    });
    responses.set("/documents/doc-mapper-1/chunks", {
      success: true,
      data: {
        documentId: "doc-mapper-1",
        chunks: [
          {
            chunk_id: "c-m1",
            chunk_index: 0,
            element_type: "CodeMapper",
            masked_text: makeMapperChunkText(),
            classification: "source_mapper",
            word_count: 200,
          },
        ],
      },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    expect(spec.stats.mapperCount).toBe(1);
    expect(spec.tables.length).toBeGreaterThanOrEqual(1);

    // Find the table created from resultMap
    const balanceTable = spec.tables.find((t) => t.tableName === "TB_BALANCE");
    expect(balanceTable).toBeDefined();
    expect(balanceTable?.source).toBe("mybatis");
    expect(balanceTable?.voClassName).toBe("BalanceVO");
    expect(balanceTable?.columns).toHaveLength(3);

    const idCol = balanceTable?.columns.find((c) => c.name === "BALANCE_ID");
    expect(idCol?.javaProperty).toBe("balanceId");
    expect(idCol?.isPrimaryKey).toBe(true);
    expect(idCol?.sqlType).toBe("BIGINT");
  });

  it("CodeDataModel VO ↔ Mapper 매칭 (voClassName 교차 참조)", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents?", {
      success: true,
      data: {
        documents: [
          { document_id: "doc-vo-1", status: "parsed", original_name: "vo.zip", file_type: "zip" },
        ],
        total: 1,
      },
    });
    responses.set("/documents/doc-vo-1/chunks", {
      success: true,
      data: {
        documentId: "doc-vo-1",
        chunks: [
          {
            chunk_id: "c-dm1",
            chunk_index: 0,
            element_type: "CodeDataModel",
            masked_text: makeDataModelChunkText(),
            classification: "source_vo",
            word_count: 50,
          },
          {
            chunk_id: "c-m2",
            chunk_index: 1,
            element_type: "CodeMapper",
            masked_text: makeMapperChunkText(),
            classification: "source_vo",
            word_count: 150,
          },
        ],
      },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    // Mapper resultMap.type "com.kt.onnuri.model.BalanceVO" → short name "BalanceVO"
    // Should match CodeDataModel className "BalanceVO"
    const table = spec.tables.find((t) => t.voClassName === "BalanceVO");
    expect(table).toBeDefined();

    // VO fields should enrich table columns
    const userIdCol = table?.columns.find((c) => c.javaProperty === "userId");
    expect(userIdCol).toBeDefined();
    // VO field nullable=false should override mapper default
    expect(userIdCol?.nullable).toBe(false);

    // javaType from VO enrichment
    const amountCol = table?.columns.find((c) => c.javaProperty === "amount");
    expect(amountCol?.javaType).toBeDefined();
  });

  it("source_* 분류만 필터링 (비소스 문서 제외)", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents?", {
      success: true,
      data: {
        documents: [
          { document_id: "doc-src", status: "parsed", original_name: "src.zip", file_type: "zip" },
          { document_id: "doc-pdf", status: "parsed", original_name: "report.pdf", file_type: "pdf" },
          { document_id: "doc-pending", status: "pending", original_name: "wait.zip", file_type: "zip" },
        ],
        total: 3,
      },
    });
    // Source doc with CodeController
    responses.set("/documents/doc-src/chunks", {
      success: true,
      data: {
        documentId: "doc-src",
        chunks: [
          {
            chunk_id: "c-src-1",
            chunk_index: 0,
            element_type: "CodeController",
            masked_text: makeControllerChunkText({
              className: "UserController",
              basePath: "/api/user",
              endpoints: [{
                httpMethod: ["GET"],
                path: "/list",
                methodName: "listUsers",
                parameters: [],
                returnType: "List",
              }],
              sourceFile: "UserController.java",
            }),
            classification: "source_controller",
            word_count: 80,
          },
        ],
      },
    });
    // Non-source doc (PDF classification)
    responses.set("/documents/doc-pdf/chunks", {
      success: true,
      data: {
        documentId: "doc-pdf",
        chunks: [
          {
            chunk_id: "c-pdf-1",
            chunk_index: 0,
            element_type: "Title",
            masked_text: "퇴직연금 설계서",
            classification: "requirements",
            word_count: 3,
          },
        ],
      },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    // Only the source controller doc should be processed
    expect(spec.apis).toHaveLength(1);
    expect(spec.apis[0]?.controllerClass).toBe("UserController");
    expect(spec.stats.controllerCount).toBe(1);
    // PDF doc and pending doc should be excluded
    expect(spec.tables).toHaveLength(0);
  });

  it("잘못된 JSON chunk는 안전하게 무시", async () => {
    const responses = new Map<string, unknown>();
    responses.set("/documents?", {
      success: true,
      data: {
        documents: [
          { document_id: "doc-bad", status: "parsed", original_name: "bad.zip", file_type: "zip" },
        ],
        total: 1,
      },
    });
    responses.set("/documents/doc-bad/chunks", {
      success: true,
      data: {
        documentId: "doc-bad",
        chunks: [
          {
            chunk_id: "c-bad",
            chunk_index: 0,
            element_type: "CodeController",
            masked_text: "this is not valid json {{{",
            classification: "source_controller",
            word_count: 5,
          },
        ],
      },
    });
    const env = createMockEnv(responses);

    const spec = await aggregateSourceSpec(env, "org-test");

    // Should return empty spec without throwing
    expect(spec.apis).toEqual([]);
    expect(spec.stats.controllerCount).toBe(0);
  });
});

// ── Pure helper tests ────────────────────────────────────────────

describe("combinePath", () => {
  it("basePath + endpoint path 결합", () => {
    expect(combinePath("/api/balance", "/{id}")).toBe("/api/balance/{id}");
  });

  it("빈 endpoint path → basePath만 반환", () => {
    expect(combinePath("/api/balance", "")).toBe("/api/balance");
  });

  it("빈 basePath → /endpoint 반환", () => {
    expect(combinePath("", "/list")).toBe("/list");
  });

  it("중복 슬래시 제거", () => {
    expect(combinePath("/api/", "/items")).toBe("/api/items");
  });

  it("basePath에 / 없이 시작", () => {
    expect(combinePath("api/v1", "users")).toBe("/api/v1/users");
  });
});

describe("extractShortClassName", () => {
  it("FQCN에서 짧은 클래스명 추출", () => {
    expect(extractShortClassName("com.kt.onnuri.model.BalanceVO")).toBe("BalanceVO");
  });

  it("패키지 없는 클래스명 → 그대로 반환", () => {
    expect(extractShortClassName("BalanceVO")).toBe("BalanceVO");
  });

  it("중첩 패키지", () => {
    expect(extractShortClassName("a.b.c.d.MyClass")).toBe("MyClass");
  });
});
