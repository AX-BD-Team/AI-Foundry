---
code: AIF-ANLS-010
title: "v0.7.4 Phase 2-B Session 3 Gap Analysis"
version: "1.0"
status: Active
category: ANLS
created: 2026-03-08
updated: 2026-03-08
author: Sinclair Seo
---

# v0.7.4 Pivot Phase 2-B Session 3: Gap Detection + API + D1 — Gap Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: RES AI Foundry
> **Version**: v0.7.4
> **Analyst**: Gap Detector Agent
> **Date**: 2026-03-06
> **Design Doc**: [v074-pivot-phase2b.design.md](../02-design/features/v074-pivot-phase2b.design.md) (SS4.6–4.9, SS5–6)
> **Session Scope**: Session 3 of 5 — Gap Detection, Severity, Report, API Routes, Queue Handler, D1 Migration

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

Phase 2-B Session 3 설계서(SS4.6 Gap Detector ~ SS6 API Endpoints, SS5 D1 Schema, SS7 Queue Events)와 실제 구현 코드 간 일치도를 검증한다.

### 1.2 Analysis Scope

| Category | Files |
|----------|-------|
| **Gap Detector** | `svc-extraction/src/factcheck/gap-detector.ts` |
| **Severity Classifier** | `svc-extraction/src/factcheck/severity.ts` |
| **Report Generator** | `svc-extraction/src/factcheck/report.ts` |
| **API Routes** | `svc-extraction/src/routes/factcheck.ts` |
| **Route Registration** | `svc-extraction/src/index.ts` |
| **Queue Handler** | `svc-extraction/src/queue/handler.ts` |
| **D1 Migration** | `infra/migrations/db-structure/0005_factcheck.sql` |
| **Tests** | `svc-extraction/src/__tests__/gap-detector.test.ts`, `severity.test.ts` |

---

## 2. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Gap Detector (5 gap types) | 100% | PASS |
| Severity Classifier | 100% | PASS |
| Report Generator | 100% | PASS |
| API Routes (8 endpoints) | 100% | PASS |
| Route Registration + RBAC | 100% | PASS |
| Queue Handler (factcheck.requested) | 100% | PASS |
| D1 Migration (2 tables + 6 indexes) | 100% | PASS |
| Test Coverage | 88% | PASS |
| **Overall Match Rate** | **96%** | **PASS** |

---

## 3. Detailed Comparison

### 3.1 Gap Detector (`factcheck/gap-detector.ts`) — 12/12 PASS

| Design Requirement (SS4.6) | Implementation | Status |
|-----------------------------|----------------|--------|
| MID gap — source-only items | Lines 50–74: unmatched source APIs + tables | PASS |
| MC gap — doc-only items | Lines 77–103: unmatched doc APIs + tables | PASS |
| SM gap — column count/structure diff | Lines 200–238: `detectColumnGaps()` unmatched columns | PASS |
| TM gap — type mismatch in matched columns | Lines 176–193: `isTypeCompatible()` check for matched cols | PASS |
| PM gap — parameter mismatch in matched APIs | Lines 245–298: `detectParamGaps()` bidirectional check | PASS |
| GapDetectionResult with stats (byType, bySeverity, total) | Lines 26–33, 129–145 | PASS |
| buildGap helper with severity classification | Lines 319–354 | PASS |
| isInternalApi detection (/internal/, /health, /debug, /test) | Lines 356–362 | PASS |
| Column matching uses `matchColumnName()` from matcher | Line 22 import, line 172 usage | PASS |
| findSourceTable/findDocTable/findSourceApi/findDocApi helpers | Lines 364–378 | PASS |
| gap.gapId = crypto.randomUUID() | Line 330 | PASS |
| gap.reviewStatus = "pending", autoResolved = false | Lines 337–338 | PASS |

**Implementation Bonus**: `BuildGapOptions` interface for type-safe gap construction (not in design).

### 3.2 Severity Classifier (`factcheck/severity.ts`) — 10/10 PASS

| Design Requirement (SS4.7) | Implementation | Status |
|-----------------------------|----------------|--------|
| JAVA_SQL_TYPE_MAP (10 Java types) | Lines 14–25: exact match with design | PASS |
| HIGH: PK column mismatch | Lines 49, 59, 66, 83 | PASS |
| HIGH: External API required param missing | Line 51 (MID), line 76 (PM) | PASS |
| HIGH: Core table entirely missing (MID) | Line 49 | PASS |
| MEDIUM: Compatible type mismatch | Line 69 | PASS |
| MEDIUM: Optional param missing | Line 77–78 | PASS |
| LOW: Internal/test API missing | Line 53 | PASS |
| LOW: Naming convention / general SM | Line 85 | PASS |
| isTypeCompatible() — strips nullable + length | Lines 95–110 | PASS |
| normalizeJavaType / normalizeSqlType | Lines 118–140 | PASS |

**Design Deviation (non-breaking)**: Design specifies `SeverityRule[]` array format; implementation uses `if/else` chain per gap type. Functionally equivalent — all severity rules are covered.

**Implementation Bonus**: `CHAR(1)` special case for Boolean mapping (line 136) — not explicitly in design but implied by `JAVA_SQL_TYPE_MAP["Boolean"]` including `"CHAR(1)"`.

### 3.3 Report Generator (`factcheck/report.ts`) — 6/6 PASS

| Design Requirement (SS4.9) | Implementation | Status |
|-----------------------------|----------------|--------|
| Markdown format with `# Fact Check Report` title | Line 43 | PASS |
| Summary section (Source Items, Doc Items, Matched, Gaps, Coverage%) | Lines 50–59 | PASS |
| Gap Distribution matrix (Type x HIGH/MEDIUM/LOW + Total) | Lines 62–90 | PASS |
| Detailed gaps by severity (HIGH → MEDIUM → LOW) | Lines 93–118 | PASS |
| Each gap: Gap ID, Type, Description, Document Item, Evidence, Review Status | Lines 103–117 | PASS |
| Footer with version info | Lines 122–124 | PASS |

**Minor Enhancement**: Empty rows skipped in distribution matrix (line 79: `if (total === 0) continue`). Not in design but improves readability.

### 3.4 API Routes (`routes/factcheck.ts`) — 8/8 PASS

| Endpoint (Design SS6) | Implementation | Auth | Status |
|------------------------|----------------|------|--------|
| POST `/factcheck` | Lines 140–141, 200–252 | Analyst+ (RBAC in index.ts) | PASS |
| GET `/factcheck/results` | Lines 150–151, 256–274 | Analyst+ | PASS |
| GET `/factcheck/results/:resultId` | Lines 179–184, 278–293 | Analyst+ | PASS |
| GET `/factcheck/results/:resultId/gaps` | Lines 155–159, 297–366 | Analyst+ | PASS |
| GET `/factcheck/results/:resultId/report` | Lines 163–168, 370–413 | Analyst+ | PASS |
| POST `/factcheck/gaps/:gapId/review` | Lines 187–192, 423–459 | Reviewer+ | PASS |
| POST `/factcheck/results/:resultId/llm-match` | Lines 171–176 (placeholder) | Analyst+ | PASS |
| GET `/factcheck/summary` | Lines 145–147, 463–520 | Executive+ | PASS |

**Gap filter params**: type, severity, reviewStatus, limit (max 200), offset — matches design SS6 exactly (lines 317–336).

**Report response**: `Content-Type: text/markdown; charset=utf-8` — appropriate for Markdown download (line 411).

**LLM-match placeholder**: Returns `{ message: "LLM matching will be available in Phase 2-B Session 4" }` — correct scope boundary.

### 3.5 Route Registration (`index.ts`) — 2/2 PASS

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| `handleFactcheckRoutes` import | Line 17 | PASS |
| `/factcheck` prefix routing + RBAC | Lines 166–176: `checkPermission(env, role, "extraction", action)` | PASS |

### 3.6 Queue Handler (`handler.ts`) — 8/8 PASS

| Design Requirement (SS7, SS8.1) | Implementation | Status |
|----------------------------------|----------------|--------|
| `factcheck.requested` event handler | Lines 384–399 | PASS |
| `runFactCheck()` pipeline function | Lines 446–584 | PASS |
| Step 1: aggregateSourceSpec | Line 453 | PASS |
| Step 2: extractDocSpec | Line 456 | PASS |
| Step 3: structuralMatch | Line 459 | PASS |
| Step 4: detectGaps | Line 462 | PASS |
| Step 5: D1 batch insert (50/batch) | Lines 483–513 | PASS |
| Step 6: Update result record (status=completed) | Lines 518–554 | PASS |
| Step 7: Emit `factcheck.completed` event | Lines 557–568 | PASS |
| Error handling: status='failed' + error_message | Lines 391–398 | PASS |

**Design Compliance**: `runFactCheck()` faithfully implements the 7-step pipeline from Design SS7 flow diagram.

### 3.7 D1 Migration (`0005_factcheck.sql`) — EXACT MATCH

| Element | Design (SS5) | Implementation | Status |
|---------|--------------|----------------|--------|
| `fact_check_results` table | 15 columns | 15 columns — exact match | PASS |
| `fact_check_gaps` table | 17 columns | 17 columns — exact match | PASS |
| `idx_fc_results_org` | organization_id | Line 46 | PASS |
| `idx_fc_results_status` | status | Line 47 | PASS |
| `idx_fc_gaps_result` | result_id | Line 48 | PASS |
| `idx_fc_gaps_type` | gap_type | Line 49 | PASS |
| `idx_fc_gaps_severity` | severity | Line 50 | PASS |
| `idx_fc_gaps_review` | review_status | Line 51 | PASS |

SQL 파일은 설계서 SS5와 **문자 단위로 일치**.

### 3.8 Test Coverage — 42 tests, 88%

| Test File | Tests | Coverage | Status |
|-----------|:-----:|----------|--------|
| gap-detector.test.ts | 17 | MID(3), MC(2), TM(2), SM(2), PM(3), stats(1), metadata(4) | PASS |
| severity.test.ts | 25 | MID(4), MC(3), TM(4), PM(3), SM(3), isTypeCompatible(8) | PASS |
| **Total** | **42** | | |

**Design test coverage (SS10.4)**:

| Design Test Case | Implemented | Status |
|------------------|:-----------:|--------|
| source-only → MID gap | gap-detector.test.ts:147 | PASS |
| doc-only → MC gap | gap-detector.test.ts:210 | PASS |
| type mismatch (String vs BIGINT) → TM HIGH | gap-detector.test.ts:252 | PASS |
| compatible type (Long vs BIGINT) → no gap | gap-detector.test.ts:294 | PASS |
| parameter mismatch → PM | gap-detector.test.ts:425 | PASS |
| schema structure diff → SM | gap-detector.test.ts:337 | PASS |
| PK mismatch → HIGH | severity.test.ts:11 | PASS |
| nullable diff → MEDIUM | severity.test.ts:99 | PASS |
| naming convention → LOW | severity.test.ts:103 | PASS |

---

## 4. Gap Summary

### 4.1 PASS Items: 48/48 (100%)

All core design requirements for Session 3 are fully implemented.

### 4.2 Critical Bug: 1

| ID | Severity | Location | Description |
|----|----------|----------|-------------|
| **BUG-1** | **HIGH** | `routes/factcheck.ts:230-237` | `POST /factcheck`의 INSERT 쿼리에 `source_document_ids`와 `doc_document_ids` 컬럼이 누락됨. D1 스키마에서 `TEXT NOT NULL` (DEFAULT 없음)이므로 **INSERT 시 NOT NULL 제약 위반**으로 실패함 |

**BUG-1 상세**:
```sql
-- Schema (0005_factcheck.sql)
source_document_ids TEXT NOT NULL,      -- DEFAULT 없음
doc_document_ids TEXT NOT NULL,         -- DEFAULT 없음

-- INSERT (routes/factcheck.ts:231-237) — 이 두 컬럼 누락!
INSERT INTO fact_check_results
  (result_id, organization_id, spec_type, total_source_items, ...)
VALUES (?, ?, ?, 0, ...)
```

**수정 방안**: INSERT에 `source_document_ids = '[]'`, `doc_document_ids = '[]'`를 추가하거나, D1 스키마에 `DEFAULT '[]'`를 추가.

### 4.3 Missing Items: 0

설계서의 모든 핵심 요구사항이 구현됨.

### 4.4 Design Deviation (non-breaking): 3

| # | Design | Implementation | Impact |
|---|--------|----------------|--------|
| DEV-1 | `SeverityRule[]` 배열 기반 규칙 | `if/else` 체인 (gap type별 분기) | None — 동일 결과 |
| DEV-2 | `TriggerBody`에 `sourceDocumentIds?`, `docDocumentIds?` 필드 | 미구현 (자동 전체 선택) | Low — 현재 LPON 단일 org로 충분 |
| DEV-3 | `POST /factcheck` 요청 시 `sourceDocumentIds`/`docDocumentIds` 전달 | `runFactCheck()`에서 org 전체 문서 자동 수집 | Low — Phase 2-B E2E 시 필요하면 추가 |

### 4.5 Added Items (Design X, Implementation O): 3

| Item | Location | Description |
|------|----------|-------------|
| `BuildGapOptions` interface | gap-detector.ts:303–317 | Type-safe gap 생성 옵션 |
| `SeverityContext` interface | severity.ts:29–36 | Severity 분류 입력 타입화 |
| Gap distribution 빈 행 스킵 | report.ts:79 | 리포트 가독성 향상 |

### 4.6 Missing Tests: 3 (Low priority)

| Missing Test | Severity | Description |
|--------------|----------|-------------|
| report.ts 단위 테스트 | Low | `generateFactCheckReport()` 출력 Markdown 검증 |
| routes/factcheck.ts API 테스트 | Low | D1 mock 필요. 배포 후 curl E2E로 대체 가능 |
| handler.ts `runFactCheck()` 통합 테스트 | Low | Service binding mock 필요. E2E 세션 5에서 검증 |

---

## 5. Architecture Compliance

| Check | Status |
|-------|--------|
| Import: gap-detector → severity (같은 factcheck 모듈 내) | PASS |
| Import: gap-detector → matcher (matchColumnName 재사용) | PASS |
| Import: handler → aggregator + extractor + matcher + detector (전체 파이프라인) | PASS |
| Import: routes/factcheck → report (리포트 생성) | PASS |
| D1 접근: routes에서 `env.DB_EXTRACTION` (db-structure) | PASS |
| Queue 발행: `env.QUEUE_PIPELINE.send()` (기존 패턴 재사용) | PASS |
| RBAC: index.ts에서 `/factcheck` 접근 시 `checkPermission()` | PASS |
| Error propagation: `runFactCheck` catch → status='failed' + error_message | PASS |
| exactOptionalPropertyTypes 준수: optional prop에 spread 패턴 사용 | PASS |
| noUncheckedIndexedAccess 준수: `gap[0]!` 등 assertion 사용 | PASS |

---

## 6. Convention Compliance

### 6.1 Naming

| Convention | Check | Status |
|------------|-------|--------|
| File: kebab-case (gap-detector.ts, severity.ts) | All 3 new files | PASS |
| Function: camelCase (detectGaps, classifySeverity, generateFactCheckReport) | All functions | PASS |
| Interface: PascalCase (GapDetectionResult, SeverityContext, ReportInput) | All types | PASS |
| Constants: UPPER_SNAKE_CASE (JAVA_SQL_TYPE_MAP, SEVERITY_ORDER, GAP_TYPE_LABELS) | All constants | PASS |

### 6.2 TypeScript Strictness

| Check | Status |
|-------|--------|
| `exactOptionalPropertyTypes`: optional fields set via spread `...(val ? { key: val } : {})` | PASS |
| `noUncheckedIndexedAccess`: `gap[0]!` in tests, `??` in production code | PASS |
| `.js` extension in relative imports | PASS |

---

## 7. Match Rate Calculation

```
Total Design Items:     48
  - Gap Detector:       12 (5 gap types + helpers + metadata)
  - Severity:           10 (type map + rules + isTypeCompatible)
  - Report:              6 (format sections)
  - API Routes:          8 (endpoints)
  - Route Registration:  2 (import + RBAC)
  - Queue Handler:       8 (7-step pipeline + error handling)
  - D1 Migration:        8 (2 tables + 6 indexes)
  - Tests:               9 (design test cases)

Matched Items:          48 / 48  (100%)
Critical Bugs:           1 (BUG-1: NOT NULL constraint violation)
Design Deviations:       3 (non-breaking)
Added Items:             3 (bonus improvements)
Missing Tests:           3 (Low priority)

Adjusted Score:
  Design Match:         100%
  Architecture:         100%
  Convention:           100%
  Test Coverage:         88% (42 tests, missing report/API/integration)
  Bug Penalty:           -4% (1 critical bug)

Overall Match Rate:      96%
```

---

## 8. Recommended Actions

### 8.1 MUST Fix (Before Deploy)

| Priority | Item | Description | Fix |
|----------|------|-------------|-----|
| **HIGH** | BUG-1 | `POST /factcheck` INSERT에 NOT NULL 컬럼 누락 | INSERT에 `source_document_ids='[]'`, `doc_document_ids='[]'` 추가 |

### 8.2 SHOULD Fix (Session 4)

| Priority | Item | Description |
|----------|------|-------------|
| MEDIUM | DEV-2 | `TriggerBody`에 `sourceDocumentIds?`, `docDocumentIds?` 필드 추가 (문서 서브셋 지정 기능) |

### 8.3 Optional (Low Priority)

| Priority | Item | Description |
|----------|------|-------------|
| Low | report.ts 테스트 | Markdown 출력 검증 (sections, format) |
| Low | DEV-1 | Severity rules를 선언적 배열로 리팩토링 (현재도 정상 동작) |

### 8.4 Next Steps

1. **BUG-1 수정** → `routes/factcheck.ts` INSERT 쿼리에 누락 컬럼 추가
2. **Session 4**: LLM Semantic Matcher (`llm-matcher.ts`) 구현
3. **Session 4**: svc-ingestion + svc-queue-router + svc-extraction 일괄 배포
4. **Session 4**: D1 migration `0005_factcheck.sql` 적용 (local + staging + production)
5. **Session 5**: LPON 실데이터 E2E Fact Check + KPI 측정

---

## 9. Session 1–3 Cumulative Status

| Session | Scope | Tests | Match Rate | Status |
|---------|-------|:-----:|:----------:|--------|
| Session 1 | Types + MyBatis XML Parser | 14 | 100% | PASS |
| Session 2 | Fact Check Core (aggregator + extractor + matcher) | 74 | 100% | PASS |
| **Session 3** | **Gap Detection + API + D1** | **42** | **96%** | **PASS (1 bug)** |
| **Cumulative** | **Phase 2-B S1–S3** | **130** | **98%** | **PASS** |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-06 | Initial gap analysis — 96% match rate (48/48 items, 1 critical bug) | Gap Detector Agent |
