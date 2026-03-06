# Phase 2-B Design: Fact Check Engine + MyBatis XML Parser

> **Summary**: 소스코드(Stage 1-B)와 문서(Stage 1-A)를 교차 비교하여 Gap을 탐지하는 Fact Check Engine. Phase 2-A의 Table Coverage 0% 문제를 해결하기 위해 MyBatis XML mapper 파서도 포함.
>
> **Project**: RES AI Foundry
> **Version**: v1.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-06
> **Status**: Draft
> **Plan Reference**: `docs/01-plan/features/v074-pivot.plan.md` Phase 2-B (SS5)
> **PRD Reference**: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx` SS4.3, SS7.4, SS8.2
> **Depends On**: Phase 2-A (Source Code Parsing) — completed

---

## 0. Design Decisions (Plan Corrections)

| # | Plan 원안 | 설계 보정 | 근거 |
|---|----------|----------|------|
| DD-1 | Phase 2-B = Fact Check Engine only | **MyBatis XML Parser 추가** | LPON .sql 0건 → Table Coverage 0%. MyBatis XML에 테이블 정의 존재. 팩트 체크 전에 파싱 필수 |
| DD-2 | Gap 유형 4종 고정 (SM/MC/PM/TM) | **MID (Missing in Document) 추가** — 총 5종 | 소스에만 있고 문서에 없는 항목을 별도 분류. Plan의 MC/PM에 포함되던 것을 분리 |
| DD-3 | 소스-문서 쌍 지정 방식 | **Organization 레벨 자동 매칭** | 개별 문서 쌍 지정은 비현실적 (LPON: 28 소스 zip + 61 문서). classification 기반 자동 분류 |
| DD-4 | LLM 매칭 동시 수행 | **2단계 분리 실행** | Step 1(구조적)만으로도 80%+ 커버. Step 2(LLM)는 비용 관리 위해 별도 트리거 |
| DD-5 | Document Spec 추출 미언급 | **doc-spec-extractor 모듈 추가** | 문서 chunks는 Markdown 텍스트 → 비교 전에 API/Table 구조 추출 필요 |

---

## 1. Phase 2-A Results & Coverage Gap

### 1.1 Phase 2-A 달성

| KPI | 목표 | 달성 | 상태 |
|-----|------|------|------|
| Parser Accuracy | >= 90% | 100% | PASS |
| API Coverage | >= 80% | 100% | PASS |
| Table Coverage | >= 80% | **0%** | **FAIL** |

### 1.2 Table Coverage 0%의 원인

```
LPON 소스코드 분석:
  Java files:  2,612개 (30+ zips)
  SQL files:   0개           ← 문제
  XML mappers: 미파싱        ← Phase 2-B에서 해결
```

LPON은 JPA `@Entity` 대신 **MyBatis + VO/DTO 패턴**을 사용. 테이블 정의는 MyBatis XML mapper의 `<resultMap>`, `<select>`, `<insert>` 내부 SQL에만 존재.

### 1.3 비교 가능 데이터 현황

**소스 측 (이미 추출됨)**:
- `CodeController` — API endpoints (path, method, parameters)
- `CodeDataModel` — VO/DTO fields (name, type)
- `CodeTransaction` — Service methods (@Transactional)
- `CodeDdl` — 0건 (SQL 없음)

**소스 측 (Phase 2-B 추가)**:
- `CodeMapper` — MyBatis resultMap (VO↔테이블 매핑, 컬럼, SQL 쿼리)

**문서 측 (파싱 완료, 구조화 미완)**:
- `XlSheet:인터페이스설계` → API 정의 (경로, 메서드, 파라미터)
- `XlSheet:테이블정의` → 테이블 정의 (테이블명, 컬럼, 타입)
- `XlSheet:화면설계` → 화면-API 매핑 (참조 정보)
- Unstructured.io 텍스트 → 서술형 요구사항, 프로세스 정의

---

## 2. MyBatis XML Parser (svc-ingestion)

### 2.1 Type Definitions (`packages/types/src/spec.ts` 확장)

```typescript
// === MyBatis XML Mapper Types ===

export const MyBatisResultColumnSchema = z.object({
  column: z.string(),                    // DB column name: "account_no"
  property: z.string(),                  // Java property: "accountNo"
  javaType: z.string().optional(),       // "java.lang.String"
  jdbcType: z.string().optional(),       // "VARCHAR"
  isPrimaryKey: z.boolean().default(false),
});

export const MyBatisResultMapSchema = z.object({
  id: z.string(),                        // resultMap id
  type: z.string(),                      // Full class: "com.kt...BalanceVO"
  typeName: z.string(),                  // Short: "BalanceVO"
  columns: z.array(MyBatisResultColumnSchema),
});

export const MyBatisQuerySchema = z.object({
  id: z.string(),                        // method name: "selectBalance"
  queryType: z.enum(["select", "insert", "update", "delete"]),
  tables: z.array(z.string()),           // FROM/INTO/UPDATE tables
  parameterType: z.string().optional(),  // Input VO class
  resultMapRef: z.string().optional(),   // Linked resultMap id
  columnNames: z.array(z.string()),      // Columns in query
});

export const CodeMapperSchema = z.object({
  namespace: z.string(),                 // "com.kt.onnuripay...CommonMapper"
  mapperName: z.string(),                // "CommonMapper"
  resultMaps: z.array(MyBatisResultMapSchema),
  queries: z.array(MyBatisQuerySchema),
  tables: z.array(z.string()),           // All unique table names
  sourceFile: z.string(),
});

export type MyBatisResultColumn = z.infer<typeof MyBatisResultColumnSchema>;
export type MyBatisResultMap = z.infer<typeof MyBatisResultMapSchema>;
export type MyBatisQuery = z.infer<typeof MyBatisQuerySchema>;
export type CodeMapper = z.infer<typeof CodeMapperSchema>;
```

### 2.2 Parser Design (`svc-ingestion/src/parsing/mybatis-mapper.ts`)

**Regex Patterns**:

```typescript
// 1. Mapper namespace
const RE_MAPPER_NS = /<mapper\s+namespace\s*=\s*["']([^"']+)["']/;

// 2. ResultMap block
const RE_RESULT_MAP = /<resultMap\s+id\s*=\s*["']([^"']+)["']\s+type\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/resultMap>/g;

// 3. ResultMap columns (<id> and <result>)
const RE_RESULT_COL = /<(id|result)\s+([^/>]+)\/?\s*>/g;
// Attributes: column="...", property="...", javaType="...", jdbcType="..."

// 4. Query blocks (select, insert, update, delete)
const RE_QUERY = /<(select|insert|update|delete)\s+id\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>/g;

// 5. Table names from SQL
const RE_FROM_TABLE = /\bFROM\s+([`"]?\w+[`"]?)/gi;
const RE_INTO_TABLE = /\bINTO\s+([`"]?\w+[`"]?)/gi;
const RE_UPDATE_TABLE = /\bUPDATE\s+([`"]?\w+[`"]?)/gi;
const RE_JOIN_TABLE = /\bJOIN\s+([`"]?\w+[`"]?)/gi;

// 6. Column names from SELECT/INSERT
const RE_SELECT_COLS = /\bSELECT\s+([\s\S]+?)\bFROM\b/gi;
const RE_INSERT_COLS = /\(\s*([\w\s,`"]+)\s*\)\s*VALUES/gi;
```

**파싱 흐름**:
1. Mapper namespace 추출
2. 모든 `<resultMap>` 블록 추출 → `<id>`, `<result>` 속성 파싱
3. 모든 `<select|insert|update|delete>` 블록 추출 → SQL 내 테이블/컬럼 추출
4. 테이블명 집합 취합 (FROM + INTO + UPDATE + JOIN)
5. `CodeMapper` 객체로 조립

**MyBatis 동적 SQL 처리**:
```xml
<!-- 동적 SQL은 파싱하되, 조건부 내용은 "있을 수 있음"으로 처리 -->
<if test="status != null">
  AND status = #{status}
</if>
<foreach item="id" collection="ids" ...>
  #{id}
</foreach>
```
- `<if>`, `<choose>`, `<foreach>`, `<where>`, `<set>` 태그 내 SQL도 파싱
- 단, 이들은 선택적 컬럼이므로 fact check 시 `required: false`로 마킹

**제외 패턴**:
- `<![CDATA[` 내부 SQL → CDATA 제거 후 SQL 파싱
- `<include refid="...">` → namespace 내 `<sql>` 블록 참조 (Phase 2-B에서는 inline SQL만)
- `mybatis-config.xml` → 스킵 (설정 파일, 구조 정보 없음)

### 2.3 zip-extractor.ts 통합

```diff
 // zip-extractor.ts — parseSourceProject()
 // 현재: "xml/properties — skip for now (Phase 2-A scope)"
+// Phase 2-B: XML mapper 파싱 활성화
+if (file.type === "xml" && isMyBatisMapper(file.content)) {
+  const mapper = parseMyBatisMapper(file.content, file.filename);
+  if (mapper) {
+    elements.push({
+      type: "CodeMapper",
+      text: JSON.stringify(mapper),
+    });
+  }
+}
```

**`isMyBatisMapper()` 판별**:
```typescript
function isMyBatisMapper(content: string): boolean {
  return content.includes("mybatis.org/dtd/mybatis-3-mapper.dtd")
    || (content.includes("<mapper") && content.includes("namespace="));
}
```

### 2.4 code-classifier.ts 확장

```typescript
// source_mapper classification 추가
if (filename.endsWith(".xml") && isMyBatisMapper(content)) return "source_mapper";
```

`source_mapper`를 DocumentCategory 타입에 추가.

---

## 3. Fact Check Type Definitions (`packages/types/src/factcheck.ts` — 신규)

```typescript
import { z } from "zod";

// === Gap Types ===
export const GapTypeSchema = z.enum([
  "SM",   // Schema Mismatch — 구조 불일치
  "MC",   // Missing Column — 문서에 있으나 소스에 없는 컬럼
  "PM",   // Parameter Mismatch — API 파라미터 불일치
  "TM",   // Type Mismatch — 데이터 타입 불일치
  "MID",  // Missing in Document — 소스에 있으나 문서에 없는 항목
]);

export const GapSeveritySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

export const ReviewStatusSchema = z.enum([
  "pending", "confirmed", "dismissed", "modified",
]);

// === Matched Item (소스↔문서 매칭 결과 단위) ===
export const MatchedItemSchema = z.object({
  sourceRef: z.object({
    name: z.string(),           // "CommonController.getNow"
    type: z.string(),           // "api" | "table" | "column" | "parameter"
    documentId: z.string(),     // 소스 document_id
    location: z.string(),       // "CommonController.java:L42"
  }),
  docRef: z.object({
    name: z.string(),           // "/api/v2/common/utils/getNow"
    type: z.string(),
    documentId: z.string(),     // 문서 document_id
    location: z.string(),       // "인터페이스설계서.xlsx:Sheet1:Row5"
  }).optional(),                // null = Missing in Document
  matchScore: z.number().min(0).max(1),  // 유사도 (1.0 = exact)
  matchMethod: z.enum(["exact", "fuzzy", "llm", "unmatched"]),
});

// === Fact Check Result (비교 실행 단위) ===
export const FactCheckResultSchema = z.object({
  resultId: z.string(),
  organizationId: z.string(),
  specType: z.enum(["api", "table", "mixed"]),
  // 입력
  sourceDocumentIds: z.array(z.string()),
  docDocumentIds: z.array(z.string()),
  // 수치
  totalSourceItems: z.number().int(),
  totalDocItems: z.number().int(),
  matchedItems: z.number().int(),
  gapCount: z.number().int(),
  coveragePct: z.number(),
  // 세부
  gapsByType: z.record(GapTypeSchema, z.number().int()),
  gapsBySeverity: z.record(GapSeveritySchema, z.number().int()),
  // 상태
  status: z.enum(["pending", "processing", "completed", "failed"]),
  matchResultJson: z.string().optional(),   // MatchedItem[] JSON
  errorMessage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

// === Fact Check Gap (개별 Gap) ===
export const FactCheckGapSchema = z.object({
  gapId: z.string(),
  resultId: z.string(),
  organizationId: z.string(),
  gapType: GapTypeSchema,
  severity: GapSeveritySchema,
  // 소스 측
  sourceItem: z.string(),       // JSON: { name, type, location, documentId }
  sourceDocumentId: z.string().optional(),
  // 문서 측
  documentItem: z.string().optional(),  // JSON (null = MID)
  documentId: z.string().optional(),
  // 설명
  description: z.string(),
  evidence: z.string().optional(),
  // 해결
  autoResolved: z.boolean().default(false),
  reviewStatus: ReviewStatusSchema,
  reviewerId: z.string().optional(),
  reviewerComment: z.string().optional(),
  reviewedAt: z.string().optional(),
  createdAt: z.string(),
});

// Type exports
export type GapType = z.infer<typeof GapTypeSchema>;
export type GapSeverity = z.infer<typeof GapSeveritySchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type MatchedItem = z.infer<typeof MatchedItemSchema>;
export type FactCheckResult = z.infer<typeof FactCheckResultSchema>;
export type FactCheckGap = z.infer<typeof FactCheckGapSchema>;
```

### 3.1 Event Types (`events.ts` 확장)

```typescript
export const FactCheckRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal("factcheck.requested"),
  payload: z.object({
    resultId: z.string(),
    organizationId: z.string(),
    specType: z.enum(["api", "table", "mixed"]),
  }),
});

export const FactCheckCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("factcheck.completed"),
  payload: z.object({
    resultId: z.string(),
    organizationId: z.string(),
    matchedItems: z.number().int(),
    gapCount: z.number().int(),
    coveragePct: z.number(),
  }),
});
```

`PipelineEventSchema` discriminatedUnion에 추가.

---

## 4. Fact Check Engine (svc-extraction/src/factcheck/)

### 4.1 Architecture Overview

```
POST /factcheck { organizationId, specType }
     │
     ▼
┌─── Source Aggregator ────────────────┐
│  Fetch source chunks (source_*)     │
│  Parse JSON → CodeController[]      │
│              CodeDataModel[]        │
│              CodeMapper[]           │
│  Build SourceSpec { apis[], tables[] } │
└──────────────────────────────────────┘
     │                    │
     │                    ▼
     │        ┌── Doc Spec Extractor ──────┐
     │        │  Fetch doc chunks          │
     │        │  (api_spec, erd)           │
     │        │  Parse Markdown tables     │
     │        │  Build DocSpec             │
     │        │  { apis[], tables[] }      │
     │        └────────────────────────────┘
     │                    │
     ▼                    ▼
┌─── Structural Matcher ───────────────┐
│  Step 1: Exact path/name match      │
│  Step 2: Fuzzy token match (≥0.6)   │
│  Output: MatchedItem[]              │
└──────────────────────────────────────┘
     │
     ▼
┌─── Gap Detector ─────────────────────┐
│  Unmatched source → MID gaps        │
│  Unmatched doc → MC gaps            │
│  Matched but diff → SM/PM/TM gaps  │
└──────────────────────────────────────┘
     │
     ▼
┌─── Severity Classifier ─────────────┐
│  Rules-based: HIGH/MEDIUM/LOW       │
│  + Java↔SQL type mapping table      │
└──────────────────────────────────────┘
     │
     ▼
┌─── D1 Insert ────────────────────────┐
│  fact_check_results + gaps           │
│  Emit factcheck.completed           │
└──────────────────────────────────────┘
     │ (선택적)
     ▼
┌─── LLM Semantic Matcher ────────────┐
│  Unmatched items + context chunks   │
│  → Sonnet: "명명 차이 vs 실제 Gap?"  │
│  Gap 목록 조정                       │
└──────────────────────────────────────┘
```

### 4.2 Internal Types (`factcheck/types.ts`)

```typescript
// Source-side aggregated structures
export interface SourceApi {
  path: string;                    // Full: "/api/v2/common/utils/getNow"
  httpMethods: string[];           // ["GET", "POST"]
  methodName: string;              // "getNow"
  controllerClass: string;        // "CommonController"
  parameters: Array<{ name: string; type: string; required: boolean; annotation?: string }>;
  returnType: string;
  swaggerSummary?: string;
  documentId: string;              // Source document_id (provenance)
  sourceFile: string;              // "CommonController.java"
}

export interface SourceTable {
  tableName: string;               // "account_balance"
  columns: Array<{
    name: string;                  // "account_no"
    javaProperty?: string;         // "accountNo" (from MyBatis mapping)
    sqlType?: string;              // "VARCHAR(100)"
    javaType?: string;             // "String"
    nullable: boolean;
    isPrimaryKey: boolean;
  }>;
  voClassName?: string;            // "BalanceVO" (from resultMap type)
  source: "ddl" | "mybatis" | "entity";
  documentId: string;
  sourceFile: string;
}

export interface SourceSpec {
  apis: SourceApi[];
  tables: SourceTable[];
  stats: {
    controllerCount: number;
    endpointCount: number;
    tableCount: number;
    mapperCount: number;
  };
}

// Document-side extracted structures
export interface DocApi {
  path: string;                    // "/api/v2/voucher/issue"
  httpMethod?: string;             // "POST"
  interfaceId?: string;            // "IF-001"
  description?: string;
  parameters?: Array<{ name: string; type?: string; required?: boolean }>;
  documentId: string;
  location: string;                // "인터페이스설계서.xlsx:Sheet1:Row5"
}

export interface DocTable {
  tableName: string;               // "TB_VOUCHER"
  columns: Array<{
    name: string;                  // "voucher_id"
    dataType?: string;             // "VARCHAR(36)"
    nullable?: boolean;
    isPrimaryKey?: boolean;
    description?: string;
  }>;
  documentId: string;
  location: string;                // "테이블정의서.xlsx:Sheet3:Row2"
}

export interface DocSpec {
  apis: DocApi[];
  tables: DocTable[];
  stats: {
    apiDocCount: number;
    tableDocCount: number;
    totalApis: number;
    totalTables: number;
  };
}
```

### 4.3 Source Aggregator (`factcheck/source-aggregator.ts`)

**역할**: 조직의 모든 소스 코드 chunks에서 구조화 데이터를 추출·집계.

**데이터 흐름**:
1. svc-ingestion service binding으로 조직의 document 목록 조회
   - `GET /documents?organizationId=:id&status=parsed`
2. classification이 `source_*`인 문서 필터
3. 각 문서의 chunks 조회
   - `GET /documents/:id/chunks`
4. element_type별 JSON 파싱:
   - `CodeController` → SourceApi[] 변환 (basePath + endpoint.path 결합)
   - `CodeDataModel` → VO/DTO 메타데이터 (SourceTable의 voClassName 매칭용)
   - `CodeMapper` → SourceTable[] 변환 (resultMap columns + query tables)
   - `CodeDdl` → SourceTable[] 변환 (DDL 있으면)
5. VO↔Table 교차 참조 해결:
   - `CodeMapper.resultMap.type` = `CodeDataModel.className` → VO 필드와 DB 컬럼 매핑

**출력**: `SourceSpec`

### 4.4 Document Spec Extractor (`factcheck/doc-spec-extractor.ts`)

**역할**: 문서 chunks의 Markdown 텍스트에서 API/Table 구조를 추출.

**LPON 문서 패턴** (XLSX → Markdown table):

```markdown
<!-- 인터페이스설계서 패턴 -->
| 인터페이스ID | 인터페이스명 | URL | Method | 설명 |
|---|---|---|---|---|
| IF-001 | 상품권발행 | /api/v2/voucher/issue | POST | 발행 처리 |

<!-- 테이블정의서 패턴 -->
| 번호 | 컬럼명(영문) | 컬럼명(한글) | 데이터타입 | 길이 | NULL | PK | 설명 |
|---|---|---|---|---|---|---|---|
| 1 | voucher_id | 상품권ID | VARCHAR | 36 | N | Y | 상품권 식별자 |
```

**Markdown Table Parser**:

```typescript
// 1단계: Markdown 테이블 추출
const RE_MD_TABLE = /\|[^\n]+\|\n\|[-:\s|]+\|\n(\|[^\n]+\|\n)+/g;

// 2단계: 헤더 컬럼 키워드 매칭으로 스키마 감지
const API_KEYWORDS = {
  path: ["URL", "경로", "URI", "Path", "Endpoint", "엔드포인트"],
  method: ["Method", "메소드", "HTTP", "방식"],
  id: ["인터페이스ID", "API ID", "IF-ID", "I/F ID"],
  description: ["설명", "비고", "Description", "인터페이스명"],
  param: ["파라미터", "Parameter", "입력", "Input"],
};

const TABLE_KEYWORDS = {
  tableName: ["테이블명", "Table Name", "테이블", "TABLE"],
  columnName: ["컬럼명", "Column", "필드명", "Field", "영문명"],
  dataType: ["데이터타입", "Type", "타입", "DataType", "자료형"],
  nullable: ["NULL", "Nullable", "필수", "NOT NULL"],
  pk: ["PK", "Primary", "기본키"],
  description: ["설명", "비고", "한글명", "Description"],
};

// 3단계: 감지된 스키마에 따라 DocApi[] 또는 DocTable[] 생성
function extractApiSpecs(chunks: Chunk[]): DocApi[]
function extractTableSpecs(chunks: Chunk[]): DocTable[]
```

**Classification 기반 라우팅**:
- `classification = "api_spec"` → `extractApiSpecs()`
- `classification = "erd"` → `extractTableSpecs()`
- `classification = "general"` → 양쪽 모두 시도 (keyword 감지)

### 4.5 Structural Matcher (`factcheck/matcher.ts`)

**API 매칭 알고리즘**:

```typescript
// Step 1: 경로 정규화
function normalizePath(path: string): string {
  return path
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")         // trim slashes
    .replace(/\{[^}]+\}/g, ":param")   // path variables
    .replace(/\/+/g, "/");             // double slashes
}

// Step 2: Exact match
// normalizePath(sourceApi.path) === normalizePath(docApi.path)

// Step 3: Fuzzy match (for unmatched)
function tokenizePath(path: string): string[] {
  return path.split(/[/\-_.]/).filter(Boolean).map(t => t.toLowerCase());
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

// Threshold: >= 0.6 for candidate match
```

**Table 매칭 알고리즘**:

```typescript
// Step 1: 테이블명 정규화
function normalizeTableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(tb_|t_|tbl_)/, "");  // 공통 접두사 제거
}

// Step 2: Exact match (normalized)
// Step 3: Fuzzy match (Levenshtein < 3 OR Jaccard > 0.5)
```

**Column 매칭 (매칭된 테이블 내부)**:

```typescript
// camelCase ↔ snake_case 변환
function camelToSnake(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

// 이름 매칭: exact OR camelCase↔snake_case 변환 후 비교
function matchColumnName(sourceName: string, docName: string): boolean {
  const sNorm = sourceName.toLowerCase();
  const dNorm = docName.toLowerCase();
  return sNorm === dNorm
    || camelToSnake(sourceName) === dNorm
    || sNorm === camelToSnake(docName);
}
```

**출력**: `MatchedItem[]` — 각 항목에 matchScore + matchMethod 포함.

### 4.6 Gap Detector (`factcheck/gap-detector.ts`)

**Gap 분류 로직**:

```typescript
function detectGaps(
  matchedItems: MatchedItem[],
  sourceSpec: SourceSpec,
  docSpec: DocSpec,
): FactCheckGap[] {
  const gaps: FactCheckGap[] = [];

  // 1. Missing in Document (MID) — 소스에만 존재
  for (const unmatched of unmatchedSourceItems) {
    gaps.push({
      gapType: "MID",
      sourceItem: JSON.stringify(unmatched),
      documentItem: undefined,
      description: `소스 코드에 ${unmatched.type} "${unmatched.name}"이 존재하나 문서에서 찾을 수 없음`,
    });
  }

  // 2. Missing Column (MC) — 문서에만 존재
  for (const unmatched of unmatchedDocItems) {
    gaps.push({
      gapType: "MC",
      sourceItem: undefined,
      documentItem: JSON.stringify(unmatched),
      description: `문서에 ${unmatched.type} "${unmatched.name}"이 정의되어 있으나 소스 코드에서 구현을 찾을 수 없음`,
    });
  }

  // 3. Schema/Parameter/Type Mismatch — 매칭되었으나 차이 존재
  for (const matched of matchedWithDiff) {
    // 3a. 컬럼 수 차이 → SM (Schema Mismatch)
    if (matched.sourceColumns.length !== matched.docColumns.length) {
      gaps.push({ gapType: "SM", ... });
    }

    // 3b. 파라미터 차이 → PM
    if (parameterDiff(matched.source, matched.doc)) {
      gaps.push({ gapType: "PM", ... });
    }

    // 3c. 타입 차이 → TM
    if (typeMismatch(matched.sourceType, matched.docType)) {
      gaps.push({ gapType: "TM", ... });
    }
  }

  return gaps;
}
```

### 4.7 Severity Classifier (`factcheck/severity.ts`)

**Rules-based 분류**:

```typescript
const SEVERITY_RULES: SeverityRule[] = [
  // HIGH: 핵심 기능 영향
  { condition: "외부 API 필수 파라미터 누락",          severity: "HIGH" },
  { condition: "PK 컬럼 불일치",                      severity: "HIGH" },
  { condition: "핵심 테이블 전체 누락 (MID)",          severity: "HIGH" },
  { condition: "FK 관계 불일치 (참조 무결성 위험)",     severity: "HIGH" },

  // MEDIUM: 검토 권장
  { condition: "데이터 타입 불일치 (호환 가능)",        severity: "MEDIUM" },
  { condition: "선택 파라미터 누락",                   severity: "MEDIUM" },
  { condition: "Nullable 불일치",                     severity: "MEDIUM" },
  { condition: "내부 API 파라미터 차이",               severity: "MEDIUM" },

  // LOW: 자동 수용 가능
  { condition: "naming convention 차이 (camelCase↔snake_case)", severity: "LOW" },
  { condition: "설명 텍스트만 상이",                    severity: "LOW" },
  { condition: "내부 유틸 API 표기 차이",               severity: "LOW" },
  { condition: "테스트/내부 전용 API 누락",              severity: "LOW" },
];
```

**Java↔SQL 타입 매핑 테이블** (TM 판별용):

```typescript
const JAVA_SQL_TYPE_MAP: Record<string, string[]> = {
  "String":       ["VARCHAR", "CHAR", "TEXT", "NVARCHAR", "CLOB"],
  "Long":         ["BIGINT", "NUMBER", "NUMERIC", "INT8"],
  "Integer":      ["INT", "INTEGER", "NUMBER", "INT4"],
  "Double":       ["DOUBLE", "DECIMAL", "FLOAT", "NUMBER", "NUMERIC"],
  "BigDecimal":   ["DECIMAL", "NUMERIC", "NUMBER"],
  "Boolean":      ["BOOLEAN", "BIT", "TINYINT", "CHAR(1)"],
  "LocalDate":    ["DATE"],
  "LocalDateTime":["DATETIME", "TIMESTAMP"],
  "Date":         ["DATE", "DATETIME", "TIMESTAMP"],
  "byte[]":       ["BLOB", "BYTEA", "BINARY", "VARBINARY"],
};

function isTypeCompatible(javaType: string, sqlType: string): boolean {
  const baseJava = javaType.replace(/\?$/, ""); // remove nullable ?
  const baseSql = sqlType.replace(/\(\d+.*\)/, "").toUpperCase(); // "VARCHAR(100)" → "VARCHAR"
  const compatible = JAVA_SQL_TYPE_MAP[baseJava];
  return compatible ? compatible.includes(baseSql) : false;
}
```

### 4.8 LLM Semantic Matcher (`factcheck/llm-matcher.ts`)

**트리거 조건**: structural matching에서 unmatched로 남은 항목 중 `matchScore > 0.3` (완전 무관하지 않은 후보).

**프롬프트 구조**:

```typescript
function buildSemanticMatchPrompt(
  unmatchedSource: SourceApi | SourceTable,
  candidateDocChunks: string[],  // 관련 문서 텍스트
): string {
  return `
당신은 SI 프로젝트 산출물 검수 전문가입니다.

[소스 코드 항목]
${JSON.stringify(unmatchedSource, null, 2)}

[관련 문서 내용]
${candidateDocChunks.join("\n---\n")}

질문:
1. 위 소스 코드 항목이 문서에 기술되어 있습니까?
2. 기술되어 있다면, 어디에 어떤 이름으로 있습니까?
3. 명명 규칙 차이인지, 실제 누락인지 판단해 주세요.
4. 실제 누락이라면 severity를 판단해 주세요 (HIGH/MEDIUM/LOW).

JSON으로 응답:
{ "found": boolean, "docRef": string?, "isNamingDiff": boolean, "severity": string?, "reasoning": string }
`;
}
```

**LLM 호출**: 기존 `callLlm()` 패턴 재사용 (tier: "sonnet").
**비용 관리**: unmatched 항목 당 1회 호출. 전체의 10~20% 예상.

### 4.9 Report Generator (`factcheck/report.ts`)

Markdown 형식 Gap 리포트 생성:

```markdown
# Fact Check Report — {organizationId}

## Summary
- Total Source Items: 45 (APIs: 30, Tables: 15)
- Total Document Items: 40 (APIs: 25, Tables: 15)
- Matched: 35 (Coverage: 87.5%)
- Gaps Found: 12

## Gap Distribution
| Type | HIGH | MEDIUM | LOW | Total |
|------|------|--------|-----|-------|
| SM   | 1    | 2      | 0   | 3     |
| MC   | 0    | 1      | 1   | 2     |
| PM   | 2    | 1      | 0   | 3     |
| TM   | 0    | 2      | 1   | 3     |
| MID  | 1    | 0      | 0   | 1     |

## HIGH Severity Gaps
### GAP-001: [SM] 계좌 테이블 PK 불일치
- **소스**: account_balance.account_id (BIGINT, PK)
- **문서**: TB_ACCOUNT_BALANCE.acct_no (VARCHAR(20), PK)
- **영향**: Primary Key 타입 불일치 — 데이터 마이그레이션 시 변환 필요
...
```

---

## 5. D1 Schema Extension (`0005_factcheck.sql`)

```sql
-- Migration: 0005_factcheck.sql
-- Description: Fact Check Engine — 소스↔문서 교차 비교 결과 테이블
-- Service: svc-extraction (db-structure)
-- Date: 2026-03-07

CREATE TABLE IF NOT EXISTS fact_check_results (
  result_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  spec_type TEXT NOT NULL DEFAULT 'mixed',
  source_document_ids TEXT NOT NULL,      -- JSON array
  doc_document_ids TEXT NOT NULL,         -- JSON array
  total_source_items INTEGER DEFAULT 0,
  total_doc_items INTEGER DEFAULT 0,
  matched_items INTEGER DEFAULT 0,
  gap_count INTEGER DEFAULT 0,
  coverage_pct REAL DEFAULT 0,
  gaps_by_type TEXT,                      -- JSON: {"SM":1,"MC":2,...}
  gaps_by_severity TEXT,                  -- JSON: {"HIGH":1,"MEDIUM":2,"LOW":3}
  status TEXT NOT NULL DEFAULT 'pending',
  match_result_json TEXT,                 -- Full MatchedItem[] JSON
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS fact_check_gaps (
  gap_id TEXT PRIMARY KEY,
  result_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  gap_type TEXT NOT NULL,                 -- SM | MC | PM | TM | MID
  severity TEXT NOT NULL,                 -- HIGH | MEDIUM | LOW
  source_item TEXT,                       -- JSON: source side reference
  source_document_id TEXT,
  document_item TEXT,                     -- JSON: document side (NULL for MID)
  document_id TEXT,
  description TEXT NOT NULL,
  evidence TEXT,
  auto_resolved INTEGER DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'pending',
  reviewer_id TEXT,
  reviewer_comment TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fc_results_org ON fact_check_results(organization_id);
CREATE INDEX IF NOT EXISTS idx_fc_results_status ON fact_check_results(status);
CREATE INDEX IF NOT EXISTS idx_fc_gaps_result ON fact_check_gaps(result_id);
CREATE INDEX IF NOT EXISTS idx_fc_gaps_type ON fact_check_gaps(gap_type);
CREATE INDEX IF NOT EXISTS idx_fc_gaps_severity ON fact_check_gaps(severity);
CREATE INDEX IF NOT EXISTS idx_fc_gaps_review ON fact_check_gaps(review_status);
```

---

## 6. API Endpoints (`routes/factcheck.ts`)

| Method | Path | Auth | 설명 |
|--------|------|------|------|
| POST | `/factcheck` | Analyst+ | Fact Check 실행 트리거 |
| GET | `/factcheck/results` | Analyst+ | 조직의 Fact Check 결과 목록 |
| GET | `/factcheck/results/:resultId` | Analyst+ | 결과 상세 (summary + KPI) |
| GET | `/factcheck/results/:resultId/gaps` | Analyst+ | Gap 목록 (필터: type, severity, reviewStatus) |
| GET | `/factcheck/results/:resultId/report` | Analyst+ | Markdown 리포트 다운로드 |
| POST | `/factcheck/gaps/:gapId/review` | Reviewer+ | Gap 리뷰 (confirm/dismiss/modify) |
| POST | `/factcheck/results/:resultId/llm-match` | Analyst+ | LLM 시맨틱 매칭 트리거 (Step 2) |
| GET | `/factcheck/summary` | Executive+ | 조직별 Coverage KPI 대시보드 |

**`POST /factcheck` Request**:
```typescript
{
  organizationId: string;           // 필수
  specType?: "api" | "table" | "mixed";  // default: "mixed"
  sourceDocumentIds?: string[];     // 미지정 시 org의 모든 source_* 문서
  docDocumentIds?: string[];        // 미지정 시 org의 모든 api_spec/erd 문서
}
```

**`GET /factcheck/results/:resultId/gaps` Query Params**:
- `type` — SM, MC, PM, TM, MID (복수 가능, 콤마 구분)
- `severity` — HIGH, MEDIUM, LOW
- `reviewStatus` — pending, confirmed, dismissed, modified
- `limit` — default 50, max 200
- `offset` — default 0

---

## 7. Queue Events

```
[Source 업로드 or 수동 트리거]
    ↓
POST /factcheck
    ↓
fact_check_results INSERT (status=processing)
    ↓
QUEUE → factcheck.requested
    ↓
[Queue Router → svc-extraction]
    ↓
POST /internal/queue-event (factcheck.requested)
    ↓
[source-aggregator → doc-spec-extractor → matcher → gap-detector → severity]
    ↓
fact_check_results UPDATE (status=completed) + gaps INSERT
    ↓
QUEUE → factcheck.completed
```

**svc-queue-router 라우팅 추가**:
```typescript
case "factcheck.requested":
case "factcheck.completed":
  targets.push("svc-extraction");  // self-consumption for async processing
  break;
```

---

## 8. Integration Changes

### 8.1 svc-extraction 변경

| 파일 | 변경 | 설명 |
|------|------|------|
| `src/index.ts` | 수정 | factcheck routes 등록 |
| `src/env.ts` | 확인 | SVC_INGESTION binding 이미 존재 (chunks 조회용) |
| `src/queue/handler.ts` | 수정 | factcheck.requested 이벤트 핸들러 추가 |

### 8.2 svc-ingestion 변경

| 파일 | 변경 | 설명 |
|------|------|------|
| `src/parsing/zip-extractor.ts` | 수정 | XML mapper 라우팅 활성화 |
| `src/parsing/code-classifier.ts` | 수정 | source_mapper classification |
| `src/parsing/classifier.ts` | 수정 | DocumentCategory에 source_mapper 추가 |

### 8.3 packages/types 변경

| 파일 | 변경 | 설명 |
|------|------|------|
| `src/spec.ts` | 수정 | CodeMapper 스키마 추가 |
| `src/factcheck.ts` | **신규** | FactCheckResult, Gap 등 |
| `src/events.ts` | 수정 | factcheck.requested/completed |
| `src/index.ts` | 수정 | factcheck.ts export 추가 |

### 8.4 svc-queue-router 재배포

events.ts 변경 (factcheck event types) → safeParse 재직렬화에 영향 → 재배포 필수.

---

## 9. Limits & Performance

| 항목 | 한도 | 근거 |
|------|------|------|
| 조직당 동시 Fact Check | 1건 | 리소스 과다 방지 |
| 최대 소스 문서 수 (per run) | 100 | LPON 28 zips |
| 최대 문서 chunks (per run) | 10,000 | 구조 추출 메모리 |
| 최대 Gap 수 (per result) | 5,000 | D1 batch insert |
| Structural matching 타임아웃 | 30초 | Worker CPU limit |
| LLM matching 타임아웃 | 120초 | Queue-based async |
| Markdown table 파싱 | 행 5,000 row max | 단일 문서 한도 |
| MyBatis XML 파일 크기 | 500KB | zip-extractor 기존 한도 |

**성능 최적화**:
- 구조적 매칭은 O(n*m) → n=소스 항목, m=문서 항목. LPON 규모(~200 APIs, ~50 tables)에서 ~10K 비교 → 밀리초 수준
- LLM 매칭은 비동기 Queue 처리. unmatched 항목만 (전체의 10~20%)
- D1 batch insert: 50건 단위 (기존 패턴)

---

## 10. Test Strategy

### 10.1 MyBatis XML Parser 테스트

```typescript
describe("parseMyBatisMapper", () => {
  test("resultMap with id/result columns", () => { ... });
  test("SELECT with FROM/JOIN tables", () => { ... });
  test("INSERT with INTO table + columns", () => { ... });
  test("UPDATE/DELETE table extraction", () => { ... });
  test("dynamic SQL (if/choose/foreach)", () => { ... });
  test("CDATA wrapped SQL", () => { ... });
  test("namespace extraction", () => { ... });
  test("isMyBatisMapper detection", () => { ... });
});
```

### 10.2 Doc Spec Extractor 테스트

```typescript
describe("extractApiSpecs", () => {
  test("인터페이스설계서 Markdown table → DocApi[]", () => { ... });
  test("다양한 컬럼 헤더 (URL/경로/Endpoint)", () => { ... });
  test("HTTP method 추출", () => { ... });
});

describe("extractTableSpecs", () => {
  test("테이블정의서 Markdown table → DocTable[]", () => { ... });
  test("PK/NULL 컬럼 감지", () => { ... });
  test("데이터타입 + 길이 파싱", () => { ... });
});
```

### 10.3 Matcher 테스트

```typescript
describe("structuralMatcher", () => {
  test("exact path match", () => { ... });
  test("fuzzy path match (token overlap >= 0.6)", () => { ... });
  test("table name match (prefix removed)", () => { ... });
  test("column name match (camelCase↔snake_case)", () => { ... });
  test("unmatched items classified correctly", () => { ... });
});
```

### 10.4 Gap Detection + Severity 테스트

```typescript
describe("gapDetector", () => {
  test("source-only → MID gap", () => { ... });
  test("doc-only → MC gap", () => { ... });
  test("type mismatch (String vs BIGINT) → TM HIGH", () => { ... });
  test("compatible type (String vs VARCHAR) → no gap", () => { ... });
  test("parameter mismatch → PM", () => { ... });
  test("schema structure diff → SM", () => { ... });
});

describe("severityClassifier", () => {
  test("PK mismatch → HIGH", () => { ... });
  test("nullable diff → MEDIUM", () => { ... });
  test("naming convention → LOW", () => { ... });
});
```

### 10.5 E2E 테스트

```typescript
describe("Fact Check E2E", () => {
  test("LPON 소스 + 문서 → Coverage >= 80%", () => {
    // 1. Setup: mock source chunks (CodeController, CodeMapper)
    // 2. Setup: mock doc chunks (Markdown API/Table specs)
    // 3. POST /factcheck { organizationId: "LPON" }
    // 4. GET /factcheck/results/:id → verify coveragePct
    // 5. GET /factcheck/results/:id/gaps → verify gap types/severity
  });
});
```

### 10.6 실파일 테스트

```typescript
// LPON api-master.zip XML + LPON 인터페이스설계서 실데이터
describe.skipIf(!HAS_REAL_FILES)("LPON real data fact check", () => {
  test("api-master XML mappers → CodeMapper extraction", () => { ... });
  test("source↔document comparison → Gap report", () => { ... });
});
```

---

## 11. Implementation Order

```
Session 1: Types + MyBatis XML Parser
  ├── packages/types/src/spec.ts — CodeMapper schema 추가
  ├── packages/types/src/factcheck.ts — FactCheck types 신규
  ├── packages/types/src/events.ts — factcheck events
  ├── packages/types/src/index.ts — exports
  ├── svc-ingestion/src/parsing/mybatis-mapper.ts — XML parser + tests
  ├── svc-ingestion/src/parsing/zip-extractor.ts — XML routing 활성화
  ├── svc-ingestion/src/parsing/code-classifier.ts — source_mapper
  └── svc-ingestion/src/parsing/classifier.ts — category 추가
  → typecheck + lint + test

Session 2: Fact Check Core (aggregator + doc extractor + matcher)
  ├── svc-extraction/src/factcheck/types.ts
  ├── svc-extraction/src/factcheck/source-aggregator.ts + tests
  ├── svc-extraction/src/factcheck/doc-spec-extractor.ts + tests
  └── svc-extraction/src/factcheck/matcher.ts + tests
  → typecheck + lint + test

Session 3: Gap Detection + API + D1
  ├── svc-extraction/src/factcheck/gap-detector.ts + tests
  ├── svc-extraction/src/factcheck/severity.ts + tests
  ├── svc-extraction/src/factcheck/report.ts
  ├── svc-extraction/src/routes/factcheck.ts — API endpoints
  ├── svc-extraction/src/index.ts — route registration
  ├── svc-extraction/src/queue/handler.ts — event handler
  └── infra/migrations/db-structure/0005_factcheck.sql
  → typecheck + lint + test + db-migrate

Session 4: LLM Matcher + Deploy
  ├── svc-extraction/src/factcheck/llm-matcher.ts + tests
  ├── Deploy: svc-ingestion + svc-queue-router + svc-extraction
  └── LPON XML mapper re-parse (api-master.zip 재업로드)
  → E2E curl 테스트

Session 5: LPON E2E + KPI
  ├── LPON 실데이터 Fact Check 실행
  ├── KPI 측정: API Coverage, Table Coverage, Gap Precision
  ├── Gap 리뷰 (리뷰어 확인)
  └── Phase 2-B Gap Analysis 리포트
```

**예상**: 5세션 (Plan 원안 4-5 + MyBatis XML 추가 = 5)

---

## 12. Risk & Mitigation

| # | 리스크 | 영향 | 대응 |
|---|--------|------|------|
| R-1 | MyBatis XML regex가 복잡한 동적 SQL 파싱 실패 | 중 | `<include>` 참조는 Phase 2-B에서 skip. inline SQL만 추출. 커버리지 측정 후 보강 |
| R-2 | 문서 Markdown table 포맷이 예상과 다름 | 중 | LPON 실 문서 샘플 사전 확인. keyword 매칭 유연하게 설계 |
| R-3 | 소스-문서 chunks 조회 시 대량 I/O | 중 | 조직당 동시 1건 제한. chunks는 필요한 element_type만 필터 |
| R-4 | LLM 비용 초과 (시맨틱 매칭 빈도) | 저 | Step 1 우선, Step 2는 별도 API. unmatched의 10~20%만 LLM |
| R-5 | LPON XML mapper가 zip에 없을 가능성 | 저 | api-master.zip에 XML 유무 사전 확인. 없으면 다른 zip (backoffice-master 등) 탐색 |
| R-6 | doc-spec-extractor가 빈 결과 반환 | 중 | LPON 문서 중 api_spec/erd classification 문서 존재 여부 확인 필요. 없으면 general 문서에서 추출 시도 |
| R-7 | Worker CPU 30초 제한 내 매칭 완료 불가 | 저 | LPON 규모(~200 endpoints)는 밀리초 수준. 대규모 프로젝트는 Queue-based 분할 |

---

## 13. Files Changed Summary

### 신규 파일 (12)

| 파일 | 설명 |
|------|------|
| `packages/types/src/factcheck.ts` | FactCheckResult, Gap, MatchedItem Zod schemas |
| `services/svc-ingestion/src/parsing/mybatis-mapper.ts` | MyBatis XML Regex 파서 |
| `services/svc-extraction/src/factcheck/types.ts` | SourceSpec, DocSpec, SourceApi, DocTable 내부 타입 |
| `services/svc-extraction/src/factcheck/source-aggregator.ts` | 소스 chunks → SourceSpec 집계 |
| `services/svc-extraction/src/factcheck/doc-spec-extractor.ts` | 문서 Markdown → DocSpec 추출 |
| `services/svc-extraction/src/factcheck/matcher.ts` | 구조적 매칭 (exact + fuzzy) |
| `services/svc-extraction/src/factcheck/gap-detector.ts` | Gap 분류 (5종) |
| `services/svc-extraction/src/factcheck/severity.ts` | Severity 판정 + 타입 매핑 |
| `services/svc-extraction/src/factcheck/llm-matcher.ts` | LLM 시맨틱 매칭 (Sonnet) |
| `services/svc-extraction/src/factcheck/report.ts` | Markdown 리포트 생성 |
| `services/svc-extraction/src/routes/factcheck.ts` | API 라우트 8개 |
| `infra/migrations/db-structure/0005_factcheck.sql` | D1 마이그레이션 (2 tables + 6 indexes) |

### 수정 파일 (7)

| 파일 | 변경 | 설명 |
|------|------|------|
| `packages/types/src/spec.ts` | 추가 | CodeMapper 관련 Zod schemas |
| `packages/types/src/events.ts` | 추가 | factcheck.requested/completed events |
| `packages/types/src/index.ts` | 추가 | factcheck.ts export |
| `services/svc-ingestion/src/parsing/zip-extractor.ts` | 수정 | XML mapper 라우팅 활성화 |
| `services/svc-ingestion/src/parsing/code-classifier.ts` | 추가 | source_mapper classification |
| `services/svc-extraction/src/index.ts` | 추가 | factcheck routes 등록 |
| `services/svc-extraction/src/queue/handler.ts` | 추가 | factcheck.requested handler |

**신규 12 + 수정 7 = 총 19 파일**

---

## 14. Dependency Graph

```
packages/types (spec.ts, factcheck.ts, events.ts)
    ↓
svc-ingestion (mybatis-mapper.ts, zip-extractor.ts)
    ↓ (CodeMapper chunks 제공)
svc-extraction/factcheck (source-aggregator → doc-spec-extractor → matcher → gap-detector → severity)
    ↓ (결과 저장)
D1 db-structure (fact_check_results, fact_check_gaps)
    ↓ (이벤트 전파)
svc-queue-router (factcheck events 라우팅)
```
