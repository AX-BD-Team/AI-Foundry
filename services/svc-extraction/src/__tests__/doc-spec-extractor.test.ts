import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseMarkdownTables,
  extractApiSpecs,
  extractTableSpecs,
  extractDocSpec,
} from "../factcheck/doc-spec-extractor.js";
import type { Env } from "../env.js";

// ── Helpers ──────────────────────────────────────────────────────

function mockEnv(overrides?: {
  documentsResponse?: unknown;
  chunksResponses?: Record<string, unknown>;
}): Env {
  const documentsResponse = overrides?.documentsResponse ?? {
    success: true,
    data: { documents: [], total: 0 },
  };
  const chunksResponses = overrides?.chunksResponses ?? {};

  return {
    DB_EXTRACTION: {} as D1Database,
    QUEUE_PIPELINE: { send: vi.fn() } as unknown as Queue,
    SECURITY: { fetch: vi.fn() } as unknown as Fetcher,
    LLM_ROUTER: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_INGESTION: {
      fetch: vi.fn().mockImplementation((url: string) => {
        const urlObj = new URL(url);
        const path = urlObj.pathname;

        // GET /documents
        if (path === "/documents") {
          return Promise.resolve(
            new Response(JSON.stringify(documentsResponse), { status: 200 }),
          );
        }

        // GET /documents/:id/chunks
        const chunksMatch = path.match(/^\/documents\/([^/]+)\/chunks$/);
        if (chunksMatch?.[1]) {
          const docId = chunksMatch[1];
          const resp = chunksResponses[docId] ?? {
            success: true,
            data: { documentId: docId, chunks: [] },
          };
          return Promise.resolve(
            new Response(JSON.stringify(resp), { status: 200 }),
          );
        }

        return Promise.resolve(new Response("Not Found", { status: 404 }));
      }),
    } as unknown as Fetcher,
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-extraction",
    INTERNAL_API_SECRET: "test-secret",
    R2_SPEC_PACKAGES: {} as unknown as R2Bucket,
  };
}

// ── Sample Markdown ──────────────────────────────────────────────

const API_TABLE_MD = `
| 인터페이스ID | 인터페이스명 | URL | Method | 설명 |
|---|---|---|---|---|
| IF-001 | 상품권발행 | /api/v2/voucher/issue | POST | 발행 처리 |
| IF-002 | 상품권조회 | /api/v2/voucher/list | GET | 목록 조회 |
`;

const TABLE_DEF_MD = `
### 테이블명: TB_VOUCHER

| 번호 | 컬럼명(영문) | 컬럼명(한글) | 데이터타입 | 길이 | NULL | PK | 설명 |
|---|---|---|---|---|---|---|---|
| 1 | voucher_id | 상품권ID | VARCHAR | 36 | N | Y | 상품권 식별자 |
| 2 | issue_date | 발행일자 | DATE | - | N | N | 발행일 |
| 3 | memo | 비고 | TEXT | 500 | Y | N | 메모 |
`;

const MIXED_MD = `
Some introductory text.

| Endpoint | HTTP | Description |
|---|---|---|
| /api/health | GET | Health check |

More text in between.

### TB_ACCOUNT

| Field | 데이터타입 | PK | NULL |
|---|---|---|---|
| account_no | VARCHAR(20) | Y | N |
| balance | DECIMAL(18,2) | N | Y |
`;

// ── parseMarkdownTables ──────────────────────────────────────────

describe("parseMarkdownTables", () => {
  it("인터페이스설계서 Markdown 테이블 파싱", () => {
    const tables = parseMarkdownTables(API_TABLE_MD);
    expect(tables.length).toBe(1);

    const t = tables[0]!;
    expect(t.headers).toEqual(["인터페이스ID", "인터페이스명", "URL", "Method", "설명"]);
    expect(t.rows.length).toBe(2);
    expect(t.rows[0]).toEqual(["IF-001", "상품권발행", "/api/v2/voucher/issue", "POST", "발행 처리"]);
    expect(t.rows[1]).toEqual(["IF-002", "상품권조회", "/api/v2/voucher/list", "GET", "목록 조회"]);
  });

  it("테이블정의서 Markdown 테이블 파싱", () => {
    const tables = parseMarkdownTables(TABLE_DEF_MD);
    expect(tables.length).toBe(1);

    const t = tables[0]!;
    expect(t.headers.length).toBe(8);
    expect(t.rows.length).toBe(3);
    expect(t.precedingContext).toContain("TB_VOUCHER");
  });

  it("복수 테이블 추출", () => {
    const tables = parseMarkdownTables(MIXED_MD);
    expect(tables.length).toBe(2);
  });

  it("빈 텍스트 -> 빈 배열", () => {
    const tables = parseMarkdownTables("");
    expect(tables.length).toBe(0);
  });

  it("테이블 없는 텍스트 -> 빈 배열", () => {
    const tables = parseMarkdownTables("Just some plain text without any tables.");
    expect(tables.length).toBe(0);
  });
});

// ── extractApiSpecs ──────────────────────────────────────────────

describe("extractApiSpecs", () => {
  it("인터페이스설계서 Markdown -> DocApi[] 추출", () => {
    const tables = parseMarkdownTables(API_TABLE_MD);
    const apis = extractApiSpecs(tables, "doc-001", "test.xlsx:chunk-0");

    expect(apis.length).toBe(2);

    const first = apis[0]!;
    expect(first.path).toBe("/api/v2/voucher/issue");
    expect(first.httpMethod).toBe("POST");
    expect(first.interfaceId).toBe("IF-001");
    // "인터페이스명" matches description keyword first (before "설명")
    expect(first.description).toBe("상품권발행");
    expect(first.documentId).toBe("doc-001");
    expect(first.location).toBe("test.xlsx:chunk-0");

    const second = apis[1]!;
    expect(second.path).toBe("/api/v2/voucher/list");
    expect(second.httpMethod).toBe("GET");
    expect(second.interfaceId).toBe("IF-002");
  });

  it("다양한 헤더 키워드 인식 — Endpoint/HTTP", () => {
    const md = `
| Endpoint | HTTP | Description |
|---|---|---|
| /api/health | GET | Health check |
| /api/status | POST | Status update |
`;
    const tables = parseMarkdownTables(md);
    const apis = extractApiSpecs(tables, "doc-002", "loc");

    expect(apis.length).toBe(2);
    expect(apis[0]!.path).toBe("/api/health");
    expect(apis[0]!.httpMethod).toBe("GET");
    expect(apis[1]!.path).toBe("/api/status");
    expect(apis[1]!.httpMethod).toBe("POST");
  });

  it("다양한 헤더 키워드 인식 — 경로/방식", () => {
    const md = `
| 경로 | 방식 |
|---|---|
| /api/v1/users | GET |
`;
    const tables = parseMarkdownTables(md);
    const apis = extractApiSpecs(tables, "doc-003", "loc");

    expect(apis.length).toBe(1);
    expect(apis[0]!.path).toBe("/api/v1/users");
    expect(apis[0]!.httpMethod).toBe("GET");
  });

  it("다양한 헤더 키워드 인식 — URI", () => {
    const md = `
| URI | Method |
|---|---|
| /api/v1/items | DELETE |
`;
    const tables = parseMarkdownTables(md);
    const apis = extractApiSpecs(tables, "doc-004", "loc");

    expect(apis.length).toBe(1);
    expect(apis[0]!.path).toBe("/api/v1/items");
    expect(apis[0]!.httpMethod).toBe("DELETE");
  });

  it("path 컬럼이 없으면 빈 배열", () => {
    const md = `
| Name | Value |
|---|---|
| foo | bar |
`;
    const tables = parseMarkdownTables(md);
    const apis = extractApiSpecs(tables, "doc-005", "loc");
    expect(apis.length).toBe(0);
  });

  it("path처럼 보이지 않는 값은 건너뜀", () => {
    const md = `
| URL | Method |
|---|---|
| not-a-path | GET |
| /valid/path | POST |
`;
    const tables = parseMarkdownTables(md);
    const apis = extractApiSpecs(tables, "doc-006", "loc");

    expect(apis.length).toBe(1);
    expect(apis[0]!.path).toBe("/valid/path");
  });

  it("파라미터 컬럼 파싱", () => {
    const md = `
| URL | Method | Parameter |
|---|---|---|
| /api/test | POST | userId: String, amount: Integer |
`;
    const tables = parseMarkdownTables(md);
    const apis = extractApiSpecs(tables, "doc-007", "loc");

    expect(apis.length).toBe(1);
    expect(apis[0]!.parameters).toBeDefined();
    expect(apis[0]!.parameters!.length).toBe(2);
    expect(apis[0]!.parameters![0]!.name).toBe("userId");
    expect(apis[0]!.parameters![0]!.type).toBe("String");
    expect(apis[0]!.parameters![1]!.name).toBe("amount");
    expect(apis[0]!.parameters![1]!.type).toBe("Integer");
  });
});

// ── extractTableSpecs ────────────────────────────────────────────

describe("extractTableSpecs", () => {
  it("테이블정의서 Markdown -> DocTable[] 추출", () => {
    const tables = parseMarkdownTables(TABLE_DEF_MD);
    const tblSpecs = extractTableSpecs(tables, "doc-010", "test.xlsx:chunk-1");

    expect(tblSpecs.length).toBe(1);

    const tbl = tblSpecs[0]!;
    expect(tbl.tableName).toBe("TB_VOUCHER");
    expect(tbl.documentId).toBe("doc-010");
    expect(tbl.columns.length).toBe(3);

    const col0 = tbl.columns[0]!;
    expect(col0.name).toBe("voucher_id");
    expect(col0.dataType).toBe("VARCHAR");
    expect(col0.nullable).toBe(false); // NULL=N -> not nullable
    expect(col0.isPrimaryKey).toBe(true); // PK=Y
    expect(col0.description).toBe("상품권 식별자");

    const col2 = tbl.columns[2]!;
    expect(col2.name).toBe("memo");
    expect(col2.nullable).toBe(true); // NULL=Y -> nullable
    expect(col2.isPrimaryKey).toBe(false); // PK=N
  });

  it("PK/NULL 값 Y/N 파싱", () => {
    const md = `
| 컬럼명 | 데이터타입 | PK | NULL |
|---|---|---|---|
| id | INT | Y | N |
| name | VARCHAR | N | Y |
| code | CHAR | Y | Y |
`;
    const tables = parseMarkdownTables(md);
    const tblSpecs = extractTableSpecs(tables, "doc-011", "loc");

    expect(tblSpecs.length).toBe(1);
    const cols = tblSpecs[0]!.columns;

    // id: PK=Y, NULL=N
    expect(cols[0]!.isPrimaryKey).toBe(true);
    expect(cols[0]!.nullable).toBe(false);

    // name: PK=N, NULL=Y
    expect(cols[1]!.isPrimaryKey).toBe(false);
    expect(cols[1]!.nullable).toBe(true);

    // code: PK=Y, NULL=Y
    expect(cols[2]!.isPrimaryKey).toBe(true);
    expect(cols[2]!.nullable).toBe(true);
  });

  it("필수 헤더 반전 처리 — 필수=Y 이면 nullable=false", () => {
    const md = `
| 컬럼명 | 타입 | 필수 |
|---|---|---|
| user_id | VARCHAR | Y |
| memo | TEXT | N |
`;
    const tables = parseMarkdownTables(md);
    const tblSpecs = extractTableSpecs(tables, "doc-012", "loc");

    expect(tblSpecs.length).toBe(1);
    // 필수=Y means NOT nullable
    expect(tblSpecs[0]!.columns[0]!.nullable).toBe(false);
    // 필수=N means nullable
    expect(tblSpecs[0]!.columns[1]!.nullable).toBe(true);
  });

  it("테이블명 추출 from 헤딩", () => {
    const md = `
### 테이블명: TB_ORDER

| 컬럼명 | 타입 |
|---|---|
| order_id | INT |
`;
    const tables = parseMarkdownTables(md);
    const tblSpecs = extractTableSpecs(tables, "doc-013", "loc");

    expect(tblSpecs.length).toBe(1);
    expect(tblSpecs[0]!.tableName).toBe("TB_ORDER");
  });

  it("테이블명 추출 from TB_ 접두사 헤딩", () => {
    const md = `
## TB_PAYMENT

| Field | Type |
|---|---|
| payment_id | INT |
`;
    const tables = parseMarkdownTables(md);
    const tblSpecs = extractTableSpecs(tables, "doc-014", "loc");

    expect(tblSpecs.length).toBe(1);
    expect(tblSpecs[0]!.tableName).toBe("TB_PAYMENT");
  });

  it("테이블명 없으면 UNKNOWN", () => {
    const md = `
Some random text before.

| 컬럼명 | 타입 |
|---|---|
| field_a | INT |
`;
    const tables = parseMarkdownTables(md);
    const tblSpecs = extractTableSpecs(tables, "doc-015", "loc");

    expect(tblSpecs.length).toBe(1);
    expect(tblSpecs[0]!.tableName).toBe("UNKNOWN");
  });

  it("테이블명 컬럼에서 추출", () => {
    const md = `
| 테이블명 | 컬럼명 | 타입 |
|---|---|---|
| TB_USER | user_id | INT |
| TB_USER | name | VARCHAR |
`;
    const tables = parseMarkdownTables(md);
    const tblSpecs = extractTableSpecs(tables, "doc-016", "loc");

    expect(tblSpecs.length).toBe(1);
    expect(tblSpecs[0]!.tableName).toBe("TB_USER");
  });

  it("컬럼명 헤더 없으면 건너뜀", () => {
    const md = `
| A | B | C |
|---|---|---|
| 1 | 2 | 3 |
`;
    const tables = parseMarkdownTables(md);
    const tblSpecs = extractTableSpecs(tables, "doc-017", "loc");
    expect(tblSpecs.length).toBe(0);
  });
});

// ── general classification: API + Table 모두 시도 ────────────────

describe("mixed extraction (general classification)", () => {
  it("general classification -> API+Table 모두 시도", () => {
    const tables = parseMarkdownTables(MIXED_MD);

    // First table has API data (Endpoint/HTTP)
    const apis = extractApiSpecs(tables, "doc-020", "loc");
    expect(apis.length).toBe(1);
    expect(apis[0]!.path).toBe("/api/health");

    // Second table has Table data (Field/데이터타입/PK/NULL)
    const tblSpecs = extractTableSpecs(tables, "doc-020", "loc");
    expect(tblSpecs.length).toBe(1);
    expect(tblSpecs[0]!.tableName).toBe("TB_ACCOUNT");
    expect(tblSpecs[0]!.columns.length).toBe(2);
  });
});

// ── extractDocSpec (integration with mocked service binding) ─────

describe("extractDocSpec", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("빈 문서 -> 빈 DocSpec", async () => {
    const env = mockEnv();
    const result = await extractDocSpec(env, "org-test");

    expect(result.apis.length).toBe(0);
    expect(result.tables.length).toBe(0);
    expect(result.stats.apiDocCount).toBe(0);
    expect(result.stats.tableDocCount).toBe(0);
    expect(result.stats.totalApis).toBe(0);
    expect(result.stats.totalTables).toBe(0);
  });

  it("api_spec 문서에서 API 추출", async () => {
    const env = mockEnv({
      documentsResponse: {
        success: true,
        data: {
          documents: [
            {
              document_id: "doc-a",
              organization_id: "org-test",
              uploaded_by: "user-1",
              r2_key: "files/doc-a",
              file_type: "xlsx",
              file_size_byte: 1000,
              original_name: "인터페이스설계서.xlsx",
              status: "parsed",
              uploaded_at: "2026-01-01T00:00:00Z",
              error_message: null,
              error_type: null,
            },
          ],
          total: 1,
        },
      },
      chunksResponses: {
        "doc-a": {
          success: true,
          data: {
            documentId: "doc-a",
            chunks: [
              {
                chunk_id: "c-1",
                chunk_index: 0,
                element_type: "Table",
                masked_text: API_TABLE_MD,
                classification: "api_spec",
                word_count: 50,
              },
            ],
          },
        },
      },
    });

    const result = await extractDocSpec(env, "org-test");

    expect(result.apis.length).toBe(2);
    expect(result.tables.length).toBe(0);
    expect(result.stats.apiDocCount).toBe(1);
    expect(result.stats.totalApis).toBe(2);
    expect(result.apis[0]!.path).toBe("/api/v2/voucher/issue");
    expect(result.apis[0]!.documentId).toBe("doc-a");
  });

  it("erd 문서에서 Table 추출", async () => {
    const env = mockEnv({
      documentsResponse: {
        success: true,
        data: {
          documents: [
            {
              document_id: "doc-b",
              organization_id: "org-test",
              uploaded_by: "user-1",
              r2_key: "files/doc-b",
              file_type: "xlsx",
              file_size_byte: 2000,
              original_name: "테이블정의서.xlsx",
              status: "parsed",
              uploaded_at: "2026-01-01T00:00:00Z",
              error_message: null,
              error_type: null,
            },
          ],
          total: 1,
        },
      },
      chunksResponses: {
        "doc-b": {
          success: true,
          data: {
            documentId: "doc-b",
            chunks: [
              {
                chunk_id: "c-2",
                chunk_index: 0,
                element_type: "Table",
                masked_text: TABLE_DEF_MD,
                classification: "erd",
                word_count: 80,
              },
            ],
          },
        },
      },
    });

    const result = await extractDocSpec(env, "org-test");

    expect(result.apis.length).toBe(0);
    expect(result.tables.length).toBe(1);
    expect(result.stats.tableDocCount).toBe(1);
    expect(result.stats.totalTables).toBe(1);
    expect(result.tables[0]!.tableName).toBe("TB_VOUCHER");
    expect(result.tables[0]!.columns.length).toBe(3);
  });

  it("general 문서에서 API+Table 모두 추출", async () => {
    const env = mockEnv({
      documentsResponse: {
        success: true,
        data: {
          documents: [
            {
              document_id: "doc-c",
              organization_id: "org-test",
              uploaded_by: "user-1",
              r2_key: "files/doc-c",
              file_type: "xlsx",
              file_size_byte: 3000,
              original_name: "종합설계서.xlsx",
              status: "parsed",
              uploaded_at: "2026-01-01T00:00:00Z",
              error_message: null,
              error_type: null,
            },
          ],
          total: 1,
        },
      },
      chunksResponses: {
        "doc-c": {
          success: true,
          data: {
            documentId: "doc-c",
            chunks: [
              {
                chunk_id: "c-3",
                chunk_index: 0,
                element_type: "Table",
                masked_text: MIXED_MD,
                classification: "general",
                word_count: 100,
              },
            ],
          },
        },
      },
    });

    const result = await extractDocSpec(env, "org-test");

    expect(result.apis.length).toBe(1);
    expect(result.tables.length).toBe(1);
    expect(result.stats.apiDocCount).toBe(1);
    expect(result.stats.tableDocCount).toBe(1);
  });

  it("parsed 아닌 문서는 건너뜀", async () => {
    const env = mockEnv({
      documentsResponse: {
        success: true,
        data: {
          documents: [
            {
              document_id: "doc-d",
              organization_id: "org-test",
              uploaded_by: "user-1",
              r2_key: "files/doc-d",
              file_type: "xlsx",
              file_size_byte: 1000,
              original_name: "pending.xlsx",
              status: "pending",
              uploaded_at: "2026-01-01T00:00:00Z",
              error_message: null,
              error_type: null,
            },
          ],
          total: 1,
        },
      },
    });

    const result = await extractDocSpec(env, "org-test");
    expect(result.apis.length).toBe(0);
    expect(result.tables.length).toBe(0);
  });

  it("source_controller classification 은 건너뜀", async () => {
    const env = mockEnv({
      documentsResponse: {
        success: true,
        data: {
          documents: [
            {
              document_id: "doc-e",
              organization_id: "org-test",
              uploaded_by: "user-1",
              r2_key: "files/doc-e",
              file_type: "zip",
              file_size_byte: 5000,
              original_name: "source.zip",
              status: "parsed",
              uploaded_at: "2026-01-01T00:00:00Z",
              error_message: null,
              error_type: null,
            },
          ],
          total: 1,
        },
      },
      chunksResponses: {
        "doc-e": {
          success: true,
          data: {
            documentId: "doc-e",
            chunks: [
              {
                chunk_id: "c-5",
                chunk_index: 0,
                element_type: "CodeController",
                masked_text: API_TABLE_MD,
                classification: "source_controller",
                word_count: 200,
              },
            ],
          },
        },
      },
    });

    const result = await extractDocSpec(env, "org-test");
    // source_controller is not in DOC_CLASSIFICATIONS, so skipped
    expect(result.apis.length).toBe(0);
    expect(result.tables.length).toBe(0);
  });
});
