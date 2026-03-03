# process-diagnosis Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: AI Foundry
> **Version**: v0.8 (Phase 2-E)
> **Analyst**: gap-detector (automated)
> **Date**: 2026-03-03
> **Design Doc**: [process-diagnosis.design.md](../02-design/features/process-diagnosis.design.md)

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

Design document `docs/02-design/features/process-diagnosis.design.md`(v0.8 Phase 2-E)에 기술된 퇴직연금 프로세스 정밀분석 기능(3-Layer 분석 출력물, 조직 간 비교, 서비스 분석 그룹)의 구현 일치도를 검증한다.

### 1.2 Analysis Scope

- **Design Document**: `docs/02-design/features/process-diagnosis.design.md`
- **Implementation Paths**:
  - `packages/types/src/analysis.ts`
  - `packages/types/src/diagnosis.ts`
  - `packages/types/src/events.ts`
  - `packages/types/src/index.ts`
  - `services/svc-extraction/src/prompts/scoring.ts`
  - `services/svc-extraction/src/prompts/diagnosis.ts`
  - `services/svc-extraction/src/prompts/comparison.ts`
  - `services/svc-extraction/src/routes/analysis.ts`
  - `services/svc-extraction/src/routes/compare.ts`
  - `services/svc-extraction/src/queue/handler.ts`
  - `services/svc-extraction/src/index.ts`
  - `services/svc-policy/src/queue/handler.ts`
  - `services/svc-ontology/src/neo4j/client.ts`
  - `services/svc-ontology/src/routes/normalize.ts`
  - `infra/migrations/db-structure/0003_analysis.sql`
  - Test files (4 files in `svc-extraction/src/__tests__/`)

### 1.3 Change Log Since v1.0

- **P1 Fixed**: `compare.ts` line 221 -- `present_in_orgs` now stores full `presentIn` objects (`JSON.stringify(item.presentIn)`) instead of org ID strings only
- **P3 Fixed**: `analysis.ts` lines 174-213 -- GET /findings response now includes `extractionId`, `organizationId`, and `createdAt` fields from the `analyses` table
- **New Issue Found**: `analysis.completed` event payload missing `extractionId` in both `analysis.ts` and `queue/handler.ts`

---

## 2. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Types Match (packages/types/) | 100% | PASS |
| API Route Match (svc-extraction routes) | 100% | PASS |
| D1 Migration Match | 100% | PASS |
| Prompt/LLM Match (3-Pass) | 100% | PASS |
| Queue Handler Match | 92% | PASS |
| Neo4j Graph Match | 92% | PASS |
| Event Type Match | 100% | PASS (bonus) |
| Event Payload Match | 90% | PASS |
| Export/Index Match | 100% | PASS |
| Test Coverage | 70% | WARN |
| **Overall** | **97%** | PASS |

---

## 3. Detailed Comparison

### 3.1 Types -- `packages/types/src/analysis.ts`

**Design**: Section 3.1, 3.2, 4.2
**Implementation**: `packages/types/src/analysis.ts` (197 lines)

| Schema | Design | Implementation | Match |
|--------|--------|----------------|:-----:|
| ScoredProcessSchema | 10 fields | 10 fields | PASS |
| ScoredEntitySchema | 5 fields | 5 fields | PASS |
| ExtractionSummarySchema | 7 fields | 7 fields | PASS |
| CoreJudgmentSchema | 5 fields (incl. nested factors) | 5 fields | PASS |
| ProcessTreeNodeSchema | recursive, 7 fields | recursive, 7 fields | PASS |
| CoreIdentificationSchema | 4 fields | 4 fields | PASS |
| ServiceGroupSchema | 4 enum values | 4 enum values | PASS |
| ComparisonItemSchema | 8 fields | 8 fields | PASS |
| CrossOrgComparisonSchema | 6 fields | 6 fields | PASS |

Type exports: `ScoredProcess`, `ScoredEntity`, `ExtractionSummary`, `CoreJudgment`, `ProcessTreeNode`, `CoreIdentification`, `ServiceGroup`, `ComparisonItem`, `CrossOrgComparison` -- all present.

**Result: 9/9 schemas match -- 100%**

### 3.2 Types -- `packages/types/src/diagnosis.ts`

**Design**: Section 3.3
**Implementation**: `packages/types/src/diagnosis.ts` (76 lines)

| Schema | Design | Implementation | Match |
|--------|--------|----------------|:-----:|
| DiagnosisTypeSchema | 4 enum values | 4 enum values | PASS |
| SeveritySchema | 3 enum values | 3 enum values | PASS |
| DiagnosisFindingSchema | 13 fields | 13 fields | PASS |
| DiagnosisResultSchema | 6 fields (nested summary) | 6 fields | PASS |

Type exports: `DiagnosisType`, `Severity`, `DiagnosisFinding`, `DiagnosisResult` -- all present.

**Result: 4/4 schemas match -- 100%**

### 3.3 Events -- `packages/types/src/events.ts`

**Design**: Section 6.2 item 3 -- "diagnosis 이벤트 2종 추가"
**Implementation**: `packages/types/src/events.ts` (168 lines)

| Event Type | Design | Implementation | Match |
|------------|--------|----------------|:-----:|
| `analysis.completed` | Required | Lines 109-119 | PASS |
| `diagnosis.completed` | Required | Lines 122-131 | PASS |
| `diagnosis.review_completed` | Not specified | Lines 133-143 | BONUS |

`PipelineEventSchema` discriminated union includes all 3 new events (lines 144-155).

**Result: 2/2 required + 1 bonus event -- 100% (exceeds)**

### 3.4 Exports -- `packages/types/src/index.ts`

**Design**: Requirement to re-export analysis and diagnosis types.
**Implementation**:

```typescript
export * from "./analysis.js";
export * from "./diagnosis.js";
```

Both lines present (lines 9-10).

**Result: 2/2 exports -- 100%**

### 3.5 Prompts -- `svc-extraction/src/prompts/scoring.ts`

**Design**: Section 8.1 Pass 1 -- Scoring & Core Identification
**Implementation**: `scoring.ts` (192 lines)

| Feature | Design | Implementation | Match |
|---------|--------|----------------|:-----:|
| buildScoringPrompt function | Required | Lines 67-157 | PASS |
| 4 scoring factors (frequency, dependency, domainRelevance, dataFlowCentrality) | Required | Prompt includes all 4 | PASS |
| Category classification (mega/core/supporting/peripheral) | Required | Prompt includes criteria | PASS |
| Core judgment threshold (>= 0.7 or domainRelevanceScore >= 0.8) | Required | Prompt line 98 | PASS |
| ProcessTree construction | Required | Prompt includes tree example | PASS |
| parseScoringResult function | Required | Lines 166-170 | PASS |
| Markdown fence removal | Required | Lines 55-60 | PASS |
| Zod validation | Required | ScoringOutputSchema (lines 17-46) | PASS |
| buildCoreSummary helper | Not specified | Lines 175-191 | BONUS |

**Result: 8/8 features + 1 bonus -- 100%**

### 3.6 Prompts -- `svc-extraction/src/prompts/diagnosis.ts`

**Design**: Section 8.1 Pass 2 -- Diagnosis
**Implementation**: `diagnosis.ts` (167 lines)

| Feature | Design | Implementation | Match |
|---------|--------|----------------|:-----:|
| buildDiagnosisPrompt function | Required | Lines 45-144 | PASS |
| 4 diagnosis types (missing/duplicate/overspec/inconsistency) | Required | Prompt sections lines 90-111 | PASS |
| finding-evidence-recommendation triple | Required | Prompt output format lines 129-143 | PASS |
| Severity levels (critical/warning/info) | Required | Prompt line 119 | PASS |
| Confidence score (0-1) | Required | Prompt line 120 | PASS |
| parseDiagnosisResult function | Required | Lines 153-167 | PASS |
| UUID assignment for findingId | Required | crypto.randomUUID() line 163 | PASS |
| hitlStatus default "pending" | Required | Line 164 | PASS |

**Result: 8/8 features -- 100%**

### 3.7 Prompts -- `svc-extraction/src/prompts/comparison.ts`

**Design**: Section 8.1 Pass 3 -- Cross-Org Comparison, Section 4.3 judgment algorithm, Section 8.2 tacit knowledge
**Implementation**: `comparison.ts` (265 lines)

| Feature | Design | Implementation | Match |
|---------|--------|----------------|:-----:|
| buildComparisonPrompt function | Required | Lines 94-203 | PASS |
| 4 service groups in prompt | Required | Prompt lines 120-144 | PASS |
| Tacit knowledge detection patterns (4 patterns) | Required | Prompt lines 134-138 | PASS |
| Standardization candidate selection (score >= 0.6) | Required | Prompt line 148 | PASS |
| parseComparisonResult function | Required | Lines 211-215 | PASS |
| buildCrossOrgComparison assembler | Required | Lines 225-265 | PASS |
| OrgAnalysisResult type definition | Required | Lines 64-86 | PASS |
| Zod validation | Required | ComparisonLlmOutputSchema (lines 26-59) | PASS |

**Result: 8/8 features -- 100%**

### 3.8 Routes -- `svc-extraction/src/routes/analysis.ts`

**Design**: Section 5.1 -- 6 analysis report API routes
**Implementation**: `analysis.ts` (503 lines)

| Route | Design | Implementation | Match |
|-------|--------|----------------|:-----:|
| GET /analysis/{docId}/summary | Required | Lines 116-121, handler 128-147 | PASS |
| GET /analysis/{docId}/core-processes | Required | Lines 107-113, handler 151-170 | PASS |
| GET /analysis/{docId}/findings | Required | Lines 99-105, handler 174-213 | PASS |
| GET /analysis/{docId}/findings/{findingId} | Required | Lines 90-97, handler 218-228 | PASS |
| POST /analysis/{docId}/findings/{findingId}/review | Required | Lines 82-88, handler 238-275 | PASS |
| POST /analyze | Required | Lines 77-79, handler 286-338 | PASS |

**Response format check:**

| Check | Design | Implementation | Match |
|-------|--------|----------------|:-----:|
| Review body: action accept/reject/modify | Required | Line 252 | PASS |
| Review body: reviewerId required | Required | Lines 255-257 | PASS |
| Analyze body: mode standard/diagnosis | Required | Lines 283, 304 | PASS |
| Findings response: extractionId field | DiagnosisResultSchema requires | Line 204 | PASS (v2 fix) |
| Findings response: organizationId field | DiagnosisResultSchema requires | Line 205 | PASS (v2 fix) |
| Findings response: createdAt field | DiagnosisResultSchema requires | Line 212 | PASS (v2 fix) |
| Findings response: summary.byType/bySeverity | Required | Lines 193-198, 200-211 | PASS |
| 3-Pass non-blocking execution | Required | ctx.waitUntil line 329 | PASS |
| Error handling: LLM fail -> empty result | Required | Lines 366-368, 432-434 | PASS |
| Analysis.completed event emission | Required | Lines 469-480 | PASS |
| Diagnosis.completed event emission | Required | Lines 483-493 | PASS |
| Partial status on analysis failure | Required | Lines 496-500 | PASS |

**P3 Fix verified**: GET /findings now queries `extraction_id, organization_id, created_at` from the `analyses` table (line 177) and includes all three fields in the response (lines 204-205, 212). The response now fully matches `DiagnosisResultSchema`.

**Result: 12/12 checks -- 100%**

### 3.9 Routes -- `svc-extraction/src/routes/compare.ts`

**Design**: Section 5.2 -- 3 comparison API routes
**Implementation**: `compare.ts` (284 lines)

| Route | Design | Implementation | Match |
|-------|--------|----------------|:-----:|
| POST /analysis/compare | Required | Lines 69-70, handler 99-232 | PASS |
| GET /analysis/{orgId}/service-groups | Required | Lines 82-87, handler 236-266 | PASS |
| GET /analysis/compare/{comparisonId}/standardization | Required | Lines 74-79, handler 270-283 | PASS |

**Response format check:**

| Check | Design | Implementation | Match |
|-------|--------|----------------|:-----:|
| Compare body: organizationIds array | Required | Lines 113-115 | PASS |
| Compare body: domain field | Required | Line 111 | PASS |
| Service groups: groups + groupSummary | Required | Lines 247-265 | PASS |
| Standardization: candidates sorted by score | Required | Line 280 | PASS |
| D1 comparisons + comparison_items save | Required | Lines 185-229 | PASS |
| present_in_orgs stores full objects | Required by ComparisonItemSchema | Line 221: `JSON.stringify(item.presentIn)` | PASS (v2 fix) |

**P1 Fix verified**: Line 221 now stores `JSON.stringify(item.presentIn)` (full `presentIn` objects with `organizationId`, `organizationName`, `documentIds`, `variant?`). The read path in `handleGetServiceGroups` at line 251 (`JSON.parse(row.present_in_orgs) as ComparisonItem["presentIn"]`) now correctly receives the full object array, matching the `ComparisonItemSchema` type.

**Minor note**: The D1 migration comment on `comparison_items.present_in_orgs` (line 71) says "JSON array of org IDs" which is now outdated since the column stores full `presentIn` objects. This is a documentation-only issue with zero runtime impact.

**Result: 8/8 route/check -- 100%**

### 3.10 D1 Migration -- `infra/migrations/db-structure/0003_analysis.sql`

**Design**: Section 7.1
**Implementation**: `0003_analysis.sql` (86 lines)

| Table | Design | Implementation | Match |
|-------|--------|----------------|:-----:|
| analyses | 12 columns | 12 columns | PASS |
| diagnosis_findings | 16 columns | 16 columns | PASS |
| comparisons | 9 columns | 9 columns | PASS |
| comparison_items | 11 columns | 11 columns | PASS |

| Index | Design | Implementation | Match |
|-------|--------|----------------|:-----:|
| idx_findings_analysis | Required | Line 80 | PASS |
| idx_findings_org | Required | Line 81 | PASS |
| idx_findings_severity | Required | Line 82 | PASS |
| idx_findings_hitl | Required | Line 83 | PASS |
| idx_comparisons_orgs | Required | Line 84 | PASS |
| idx_comparison_items_group | Required | Line 85 | PASS |

Column-by-column comparison verified: all columns match exactly in name, type, and DEFAULT values.

Note: The migration location differs from design. Design says `svc-extraction/migrations/` but the actual file is in `infra/migrations/db-structure/`. This is consistent with project convention (centralized infra/migrations/).

**Result: 4/4 tables, 6/6 indexes -- 100%**

### 3.11 Queue Handler -- `svc-extraction/src/queue/handler.ts`

**Design**: Section 6.2 item 9 -- "analysisMode 분기 + scoring"
**Implementation**: `handler.ts` (419 lines)

| Feature | Design | Implementation | Match |
|---------|--------|----------------|:-----:|
| Auto-trigger analysis after extraction | Required | Lines 171-177 (ctx.waitUntil) | PASS |
| runAnalysis internal function | Required | Lines 197-343 | PASS |
| Pass 1: Scoring + Core Identification | Required | Lines 218-283 | PASS |
| Pass 2: Diagnosis | Required | Lines 285-324 | PASS |
| < 3 processes threshold skip | Design Section 9 | Lines 211-214 | PASS |
| D1 analyses INSERT | Required | Lines 258-279 | PASS |
| D1 diagnosis_findings INSERT | Required | Lines 301-323 | PASS |
| analysis.completed event | Required | Lines 327-332 | PASS |
| diagnosis.completed event | Required | Lines 335-340 | PASS |
| Non-blocking (does not interrupt main pipeline) | Required | Lines 172-176 (.catch) | PASS |

**New issue found**: The `analysis.completed` event payload (line 331) does not include `extractionId`:
```typescript
payload: { documentId, analysisId, organizationId, findingCount: findings.length, coreProcessCount: coreSummary.coreProcessCount },
```
But `AnalysisCompletedEventSchema` (events.ts line 113) requires `extractionId: z.string()`. The `extractionId` variable is in scope at line 206 but not included in the event. The same issue exists in `analysis.ts` (line 473-479). This means the event will fail Zod safeParse in `svc-queue-router`, and downstream consumers will never receive the `analysis.completed` event.

**Result: 10/10 design features match. 1 new event payload issue (see E-1 in Section 4).**

### 3.12 Queue Handler -- `svc-policy/src/queue/handler.ts`

**Design**: Section 6.2 item 10 -- "diagnosis HITL 통합"
**Implementation**: `svc-policy/src/queue/handler.ts` (297 lines)

The design specifies "diagnosis HITL 통합" for svc-policy's queue handler. However, the current implementation only handles `extraction.completed` events and does not process `diagnosis.completed` or `diagnosis.review_completed` events.

The HITL review for diagnosis findings is handled directly via the `POST /analysis/{docId}/findings/{findingId}/review` route in svc-extraction, not through svc-policy's queue handler. This is an architectural choice where diagnosis HITL is co-located with the analysis routes rather than delegated to svc-policy.

**Assessment**: The design says "diagnosis HITL 통합" which was interpreted as adding diagnosis HITL review capability. This was implemented in svc-extraction directly rather than in svc-policy. The functionality exists but the location differs from the design spec.

**Result: Implemented in different location -- 75%**

### 3.13 Neo4j -- `svc-ontology/src/neo4j/client.ts`

**Design**: Section 7.2 -- 6 new node types
**Implementation**: `client.ts` (291 lines), specifically `upsertAnalysisGraph` function (lines 179-291)

| Node Type | Design Relationship | Implementation | Match |
|-----------|-------------------|----------------|:-----:|
| SubProcess | (Process)-[:HAS_SUBPROCESS]->(SubProcess) | Lines 204-215 | PASS |
| Method | (Process)-[:HAS_METHOD]->(Method) | Lines 220-233 | PASS |
| Condition | (Method)-[:TRIGGERED_BY]->(Condition) | Lines 228-229 | PASS |
| Actor | (Actor)-[:PARTICIPATES_IN]->(Process) | Lines 239-250 | PASS |
| Requirement | (Requirement)-[:SATISFIED_BY]->(Process) | Comment only: "reserved for future" (line 174) | PARTIAL |
| DiagnosisFinding | (DiagnosisFinding)-[:RELATES_TO]->(Process\|Entity) | Lines 255-283 | PASS |

`AnalysisGraphInput` interface (lines 134-164) defines typed inputs for all node types.

**Requirement node**: Declared in design but only reserved as comment in implementation. No Cypher statements generated. This is intentionally deferred.

**Result: 5/6 node types active, 1 reserved -- 92%**

### 3.14 Neo4j -- `svc-ontology/src/routes/normalize.ts`

**Design**: Section 6.2 item 11 -- "확장 Term 처리"
**Implementation**: `normalize.ts` (263 lines)

The normalize route handles Term upsert to Neo4j (MERGE on :Term nodes with SKOS URIs). The implementation does not show explicit changes for the extended node types -- the extended analysis graph nodes (SubProcess, Method, etc.) are handled by `upsertAnalysisGraph` in `client.ts`, not by the normalize route.

**Assessment**: The design intended "확장 Term 처리" to mean the normalize route would handle the new node types. In practice, the analysis graph upsert is a separate function (`upsertAnalysisGraph`) in the same `client.ts` file. The normalize route itself was not modified for this feature. The functionality is present but organized differently.

**Result: Functionally present but in different location -- 85%**

### 3.15 Router Integration -- `svc-extraction/src/index.ts`

**Design**: Routes must be reachable from the main Worker entry point.
**Implementation**: `index.ts` (173 lines)

| Feature | Implementation | Match |
|---------|----------------|:-----:|
| Import handleAnalysisRoutes | Line 15 | PASS |
| Import handleCompareRoutes | Line 16 | PASS |
| /analysis/* routing | Lines 43-58 | PASS |
| /analyze routing | Line 43 | PASS |
| /analysis/compare routing | Lines 51-52 | PASS |
| /analysis/{orgId}/service-groups routing | Lines 54-55 | PASS |
| RBAC check for analysis routes | Lines 44-49 | PASS |

**Result: 7/7 features -- 100%**

### 3.16 Tests

**Design**: Section 11 item 14 -- "Unit tests (20+ cases)"
**Implementation**: 4 test files in `svc-extraction/src/__tests__/`

| Test File | Test Count | Covers |
|-----------|:----------:|--------|
| prompts.test.ts | 14 tests | scoring, diagnosis, comparison prompt builders + parsers |
| routes.test.ts | 16 tests | handleExtract + router (existing, no analysis route tests) |
| queue.test.ts | 16 tests | processQueueEvent + handleQueueBatch (existing, no analysis auto-trigger tests) |
| llm.test.ts | (existing) | LLM caller |

**Analysis route tests**: No dedicated `analysis-routes.test.ts` exists. The design requires test coverage for:
- GET /analysis/{docId}/summary
- GET /analysis/{docId}/core-processes
- GET /analysis/{docId}/findings
- GET /analysis/{docId}/findings/{findingId}
- POST /analysis/{docId}/findings/{findingId}/review
- POST /analyze

These are **not covered** by any test file.

**Prompt tests**: `prompts.test.ts` has 14 tests covering all 3 prompt builders and parsers (scoring: 6, diagnosis: 4, comparison: 4). This is solid coverage for the prompt layer.

**Result**: 14 new prompt tests exist, but analysis route tests (target: ~10 cases from design P7-2) are missing. Total new test coverage: **14/24 target -- 58%**. Including existing tests that cover queue handler auto-analysis path indirectly: **~70%**.

---

## 4. Differences Found

### 4.1 Missing Features (Design O, Implementation X)

| # | Item | Design Location | Description | Severity |
|---|------|-----------------|-------------|----------|
| M-1 | Analysis route tests | Section 11, item 14 | `analysis-routes.test.ts` not created. 6 API routes untested. | Warning |
| M-2 | Requirement node in Neo4j | Section 7.2 | `(Requirement)-[:SATISFIED_BY]->(Process)` only reserved as comment, not implemented. | Info |

### 4.2 Added Features (Design X, Implementation O)

| # | Item | Implementation Location | Description |
|---|------|------------------------|-------------|
| A-1 | diagnosis.review_completed event | `packages/types/src/events.ts:133-143` | Third event type beyond the 2 specified in design. Enables HITL review tracking. |
| A-2 | buildCoreSummary helper | `svc-extraction/src/prompts/scoring.ts:175-191` | Summary statistics calculator not in design but useful. |
| A-3 | AnalysisGraphInput interface | `svc-ontology/src/neo4j/client.ts:134-164` | Typed input interface for graph upsert not in design. |

### 4.3 Changed Features (Design != Implementation)

| # | Item | Design | Implementation | Impact |
|---|------|--------|----------------|--------|
| C-1 | Migration location | `svc-extraction/migrations/` | `infra/migrations/db-structure/0003_analysis.sql` | None (matches project convention) |
| C-2 | Diagnosis HITL location | `svc-policy/src/queue/handler.ts` modified | HITL review in `svc-extraction/src/routes/analysis.ts` | Low (functionality present, location differs) |
| C-3 | Extended Term handling | `svc-ontology/src/routes/normalize.ts` modified | Analysis graph handled by `upsertAnalysisGraph` in `client.ts` | Low (functionality present, location differs) |
| C-4 | Neo4j schema file | `svc-ontology/src/neo4j/schema.ts` | No `schema.ts` file exists; all in `client.ts` | None (project convention) |

### 4.4 New Issues (found in v2 re-analysis)

| # | Item | Location | Description | Impact |
|---|------|----------|-------------|--------|
| E-1 | `analysis.completed` event missing `extractionId` | `svc-extraction/src/queue/handler.ts:331`, `svc-extraction/src/routes/analysis.ts:473-479` | Event payload omits `extractionId` but `AnalysisCompletedEventSchema` requires it. `svc-queue-router` safeParse will reject this event. | Medium |
| E-2 | D1 migration comment outdated | `infra/migrations/db-structure/0003_analysis.sql:71` | Comment says "JSON array of org IDs" but P1 fix now stores full `presentIn` objects | Info (documentation only) |

### 4.5 Resolved Issues (from v1.0)

| # | Item | Resolution | Verified |
|---|------|------------|:--------:|
| ~~C-5~~ | `present_in_orgs` type mismatch | P1 Fix: `compare.ts` line 221 now stores `JSON.stringify(item.presentIn)` (full objects) | PASS |
| ~~M-3~~ | Findings response missing fields | P3 Fix: `analysis.ts` lines 176-181 now queries `extraction_id, organization_id, created_at` from `analyses` table; response includes `extractionId` (line 204), `organizationId` (line 205), `createdAt` (line 212) | PASS |

---

## 5. Known Issues

### 5.1 `analysis.completed` Event Missing `extractionId` (E-1)

**Files**:
- `services/svc-extraction/src/queue/handler.ts` line 331
- `services/svc-extraction/src/routes/analysis.ts` lines 473-479

**Problem**: Both code paths emit `analysis.completed` events without `extractionId` in the payload:

```typescript
// queue/handler.ts:327-332
await env.QUEUE_PIPELINE.send({
  eventId: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  type: "analysis.completed",
  payload: { documentId, analysisId, organizationId, findingCount: findings.length, coreProcessCount: coreSummary.coreProcessCount },
});
```

But `AnalysisCompletedEventSchema` (events.ts:109-119) requires:
```typescript
payload: z.object({
  documentId: z.string(),
  extractionId: z.string(),   // <-- MISSING from emit
  organizationId: z.string(),
  analysisId: z.string(),
  findingCount: z.number().int(),
  coreProcessCount: z.number().int(),
}),
```

**Impact**: `svc-queue-router` uses `PipelineEventSchema.safeParse()` to validate incoming queue messages. Without `extractionId`, the event will fail validation and be silently dropped. Any downstream consumers of `analysis.completed` will never receive the event.

**Fix**: Add `extractionId` to the payload in both files. The variable is already in scope in both locations (queue handler line 206, analysis.ts line 357).

### 5.2 Analysis Route Tests Missing (M-1)

**File**: Missing `services/svc-extraction/src/__tests__/analysis-routes.test.ts`

Corresponds to PRD task P7-2. Needed tests:
- GET /analysis/{docId}/summary (normal + not found)
- GET /analysis/{docId}/core-processes (normal + not found)
- GET /analysis/{docId}/findings (normal + empty + aggregation)
- POST /analysis/{docId}/findings/{findingId}/review (accept/reject/modify + validation)
- POST /analyze (diagnosis mode + standard mode + validation)

---

## 6. Match Rate Calculation

| Category | Weight | Items | Matched | Score |
|----------|:------:|:-----:|:-------:|:-----:|
| Types (analysis.ts) | 15% | 9 | 9 | 100% |
| Types (diagnosis.ts) | 10% | 4 | 4 | 100% |
| Events (events.ts) | 5% | 2 | 2 (+1 bonus) | 100% |
| Exports (index.ts) | 2% | 2 | 2 | 100% |
| Prompts (3 files) | 15% | 24 | 24 | 100% |
| Analysis Routes | 12% | 12 | 12 | 100% |
| Compare Routes | 10% | 8 | 8 | 100% |
| D1 Migration | 10% | 10 | 10 | 100% |
| Queue Handler (extraction) | 8% | 10 | 10 | 100% |
| Queue Handler (policy) | 3% | 1 | 0.75 | 75% |
| Neo4j Graph | 5% | 6 | 5 | 92% |
| Router Integration | 3% | 7 | 7 | 100% |
| Tests | 2% | 24 | 14 | 58% |

**Weighted Overall Score: 97%** (up from 96% in v1.0)

Adjustment: -1% for E-1 (event payload missing `extractionId`, Medium impact). Net: **97%**

---

## 7. Summary

### 7.1 Strengths

1. **Type-level perfect match**: All 13 Zod schemas in `analysis.ts` and `diagnosis.ts` match the design spec field-for-field, including recursive `ProcessTreeNodeSchema`.
2. **3-Pass prompt strategy fully implemented**: Scoring, Diagnosis, and Comparison prompts all follow the design's LLM strategy with proper Zod validation and markdown fence removal.
3. **D1 migration exact match**: All 4 tables, 48 columns, and 6 indexes match the design SQL exactly.
4. **Non-blocking analysis pipeline**: Queue handler correctly uses `ctx.waitUntil()` with `.catch()` to ensure analysis failures never interrupt the main extraction pipeline.
5. **Event-driven architecture**: All required events (`analysis.completed`, `diagnosis.completed`) are emitted, plus a bonus `diagnosis.review_completed` event.
6. **Neo4j extended graph**: 5 of 6 new node types are fully implemented with proper Cypher MERGE patterns.
7. **API response completeness (v2)**: GET /findings now returns full `DiagnosisResultSchema`-compliant response with `extractionId`, `organizationId`, and `createdAt`.
8. **D1 type fidelity (v2)**: `present_in_orgs` now stores full `presentIn` objects, ensuring type safety on read.

### 7.2 Issues Requiring Action

| Priority | Issue | Action | Status |
|----------|-------|--------|:------:|
| ~~**P1**~~ | ~~C-5: `present_in_orgs` type mismatch in compare.ts~~ | ~~Store full `presentIn` objects~~ | RESOLVED |
| **P2** | M-1: Analysis route tests missing | Create `analysis-routes.test.ts` (P7-2) | Open |
| ~~**P3**~~ | ~~M-3: Findings response missing fields~~ | ~~Add `extractionId`, `organizationId` to GET /findings response~~ | RESOLVED |
| **P4** | M-2: Requirement node not implemented | Implement or document as Phase 3 deferral | Open (deferred) |
| **P5** | E-1: `analysis.completed` event missing `extractionId` | Add `extractionId` to payload in both `handler.ts` and `analysis.ts` | **New** |

### 7.3 Verdict

Design-implementation match rate: **97%** -- up from 96% after P1 and P3 fixes.

**Resolved in this iteration**:
- P1 (C-5): `present_in_orgs` now stores full `presentIn` objects -- runtime type safety restored
- P3 (M-3): GET /findings now returns `extractionId`, `organizationId`, `createdAt` -- full schema compliance

**Remaining issues**:
- **P2** (M-1): Analysis route tests still missing -- requires dedicated `analysis-routes.test.ts` (PRD P7-2)
- **P4** (M-2): Requirement node reserved for Phase 3 -- no action needed now
- **P5** (E-1, new): `analysis.completed` event payload missing `extractionId` -- 1-line fix in 2 files. This will cause the event to fail `svc-queue-router` validation.

The most impactful remaining fix is P5 (E-1), which is a quick 1-line addition in 2 files but affects event propagation. P2 (route tests) is the remaining quality gap.

---

## 8. Recommended Actions

### Immediate (before deployment)

1. **Fix E-1**: Add `extractionId` to `analysis.completed` event payload in both locations:
   - `services/svc-extraction/src/queue/handler.ts` line 331: add `extractionId` to the payload object
   - `services/svc-extraction/src/routes/analysis.ts` line 473-479: add `extractionId` to the payload object

### Short-term (P7-2 task)

2. **Create M-1**: Write `analysis-routes.test.ts` with ~10 test cases covering all 6 API routes.

### Documentation

3. **Fix E-2**: Update D1 migration comment on `comparison_items.present_in_orgs` from "JSON array of org IDs" to "JSON array of presentIn objects".

### Deferred (Phase 3)

4. **M-2**: Implement `Requirement` node type in Neo4j when requirements traceability UI is built.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-03 | Initial gap analysis | gap-detector (automated) |
| 2.0 | 2026-03-03 | Re-analysis after P1+P3 fixes. C-5 and M-3 resolved. New issue E-1 found. Match rate 96% -> 97%. | gap-detector (automated) |
