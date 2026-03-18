---
code: AIF-ANLS-014
title: "v0.7.4 PRD vs Implementation Gap Analysis v2.0"
version: "1.0"
status: Active
category: ANLS
created: 2026-03-08
updated: 2026-03-08
author: Sinclair Seo
---

# v0.7.4 PRD vs Implementation — Gap Analysis Report (v2.0)

> **Analysis Type**: PRD-Implementation Gap Analysis (Full Scope, Updated)
>
> **Project**: RES AI Foundry
> **Version**: v0.7.4
> **Analyst**: Claude Opus 4.6
> **Date**: 2026-03-06
> **PRD Reference**: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx`
> **Plan Reference**: `docs/01-plan/features/v074-pivot.plan.md`
> **Previous Version**: v1.0 (2026-03-06, Phase 2-B mid, 35% overall — superseded)
> **Implementation Verification**: `docs/03-analysis/v074-pivot-phase2e-full.analysis.md` (97%)

---

## 1. Executive Summary

### 1.1 Overall Progress

| Phase | PRD Section | Plan Section | Status | Progress |
|-------|------------|--------------|--------|:--------:|
| **Phase 2-A** Source Code Parsing | SS7.2-7.3 | SS4 | **Done** | 100% |
| **Phase 2-B** Fact Check Engine | SS4.3, SS7.2 | SS5 | **Done** | 100% |
| **Phase 2-C** Spec Export & KPI | SS5.3-5.4 | SS6 | **Done** | 100% |
| **Phase 2-D** Pilot Core UI | SS6.1, SS7.5 | SS7 | **Done** | 100% |
| **Phase 2-E** Pilot Execution & KPI | SS8, SS11 | SS8 | **Done** | 77% |
| **Phase 2-F** Pilot Plus | SS6.2 | SS9 | Not Started | 0% |

**Pilot Core Implementation: 97%** (148/151 design items PASS)
**Pilot Core KPI: CRITICAL FINDING** — Coverage 공식 불일치 (PRD vs 구현, Finding F-1)

### 1.2 Key Findings

| # | Finding | Type | Impact |
|---|---------|------|--------|
| **F-1** | **KPI Coverage 공식 불일치** — PRD는 `matched/문서항목`, 구현은 `matched/소스항목`. PRD 공식 적용 시 API 95.4%, Table 100%로 PASS | **Critical** | KPI 판정 전복 |
| F-2 | 전체 구현 코드는 설계와 97% 일치 (148/151 items PASS) | Positive | High |
| F-3 | PRD SS6.1 Pilot Core 종료 기능 8/8 구현 완료 | Positive | High |
| F-4 | MyBatis XML 선제 구현 — PRD Plus → Plan/구현 Core 격상 (적절) | Scope+ | Medium |
| F-5 | MID Gap type 추가 — PRD 4종 → 구현 5종 (Enhancement) | Enhancement | Medium |
| F-6 | PRD JavaParser → 구현 Regex (Workers 환경 제약, 적절) | Tech Change | Low |
| F-7 | PRD Phase 순서 재편 — PRD 2-C=UI → Plan 2-C=Export, 2-D=UI (SS7.5 준수) | Reorder | Low |
| F-8 | 리뷰어 미확보 + KPI 합의 미완 (착수 조건 2건 미충족) | Process | High |

### 1.3 v1.0 → v2.0 주요 변화

| v1.0 (Phase 2-B mid) | v2.0 (Phase 2-E 완료) |
|----------------------|----------------------|
| Pilot Core 37.5% (3/8 기능) | **100% (8/8 기능)** |
| KPI 측정 불가 | KPI 3/5 자동 측정 완료 |
| Spec Export 미구현 | 5 모듈 + 7 API + R2 저장 |
| UI 미구현 | 5 페이지 + 9 컴포넌트 |
| LLM Matcher 미구현 | llm-matcher.ts + 17건 매칭 |
| KPI 공식 미검토 | **F-1: 공식 불일치 발견** |

---

## 2. CRITICAL FINDING: KPI Coverage 공식 불일치 (F-1)

### 2.1 PRD 정의 (SS8.2)

> Coverage = (추출된 항목 ∩ 문서 기재 항목) / **문서 기재 항목 수**
> 분모는 문서(API정의서/테이블정의서)에 기재된 항목 수로 고정한다.
> 소스에만 있고 문서에 없는 항목은 분모에 포함하지 않으며, 해당 항목은 Missing Column / Missing API Gap으로 별도 집계한다.

### 2.2 구현 (factcheck.ts:867-871)

```typescript
const apiCoverage = totalSourceApis > 0
  ? Math.round((split.apiMatched / totalSourceApis) * 1000) / 10   // 분모 = 소스 항목
  : 0;
const tableCoverage = totalSourceTables > 0
  ? Math.round((split.tableMatched / totalSourceTables) * 1000) / 10
  : 0;
```

`totalDocApis`, `totalDocTables`를 계산(L864-865)해 두면서 실제 공식에 사용하지 않음.

### 2.3 설계 문서 (phase2c.design.md:682)

```
// KPI-1: Critical API Coverage
// = (소스 API 중 문서에도 존재하는 수) / (전체 소스 API 수) × 100
```

설계 단계에서 PRD와 다른 공식을 의도적으로 채택했으나, PRD deviation으로 기록하지 않음.

### 2.4 영향 분석

| KPI | 구현 공식 (소스 분모) | PRD 공식 (문서 분모) | 판정 변화 |
|-----|:-------------------:|:------------------:|:--------:|
| API Coverage | 104/230 = **45.2%** FAIL | 104/109 = **95.4%** PASS | FAIL → **PASS** |
| Table Coverage | 11/152 = **7.2%** FAIL | 11/11 = **100%** PASS | FAIL → **PASS** |

### 2.5 두 공식의 의미 차이

| 공식 | 측정 대상 | 질문 |
|------|----------|------|
| **PRD** (문서 분모) | 시스템 매칭 정확도 | "문서에 기재된 항목을 얼마나 정확히 소스에서 찾았는가?" |
| **구현** (소스 분모) | 문서화 완성도 | "소스 코드 중 얼마나 많은 부분이 문서로 커버되는가?" |

### 2.6 권장 조치

| # | 조치 | 우선순위 |
|---|------|:--------:|
| 1 | **PRD 공식을 기본으로 채택** — `matched / totalDocItems` 로 변경 | HIGH |
| 2 | 구현 공식은 보조 지표(`documentationCompleteness`)로 병행 제공 | MEDIUM |
| 3 | phase2c.design.md에 PRD deviation 기록 추가 | LOW |

---

## 3. PRD Section-by-Section Comparison

### 3.1 SS1 Project Overview — PASS

| PRD Requirement | Implementation | Status |
|-----------------|----------------|:------:|
| As-Designed vs As-Built Fact Check | factcheck/ 8 모듈 + 8 API endpoints | PASS |
| Dev Spec 재사용 (A site → B site) | export/ 5 모듈 + spec-api.json + spec-table.json | PASS |
| 암묵지 가시화 | v0.6 policy pipeline + MID gap type (문서에 없는 항목 발굴) | PASS |

### 3.2 SS2 Pilot Domain — PASS

| PRD Requirement | Implementation | Status |
|-----------------|----------------|:------:|
| 1차 파일럿: 온누리상품권 소스코드 | LPON 25/28 zips 업로드, 2,543 Java, 163 Controllers | PASS |
| .svn/.jar/.class/binary 제외 | zip-extractor SKIP_PATTERNS 17패턴 | PASS |
| 주요 보유 문서 | 62건 업로드, 59/62 parsed (95.2%) | PASS |
| Pilot Core 처리 우선순위 1: API정의서 | Fact Check 실행, 109 document API items | PASS |
| Pilot Core 처리 우선순위 1: 테이블정의서 | Fact Check 실행, 11 document table items | PASS |
| 2차 파일럿: 퇴직연금 서브프로세스 | Pilot Core 이후 | N/A |

### 3.3 SS3 Persona & Permissions — PARTIAL (설계대로)

| PRD Requirement | Implementation | Status | Note |
|-----------------|----------------|:------:|------|
| 10+ 페르소나 (TA/AA/DA/QA 등) | v0.6 5 RBAC 역할 유지 | GAP | Plan D-6: v0.6 RBAC + v0.7.4 매핑 레이어 |
| 페르소나별 전문 영역 편집 | 미구현 | GAP | Pilot Plus (SS6.2) |
| PM 단일 승인 게이트 | ApprovalGate.tsx (localStorage 기반) | PASS | |
| 파일럿 기간 권한 (간소화) | 기존 RBAC로 커버 가능 | PASS | |

### 3.4 SS4 Core Workflow — PASS

#### 3.4.1 전체 흐름 (SS4.1)

| Step | PRD | Implementation | Status |
|------|-----|----------------|:------:|
| 1. Upload & Parsing | 문서 + 소스코드 업로드 | svc-ingestion: 문서(PDF/DOCX/XLSX) + 소스(Java/SQL/ZIP) | PASS |
| 2. AI Extraction & Selection | 핵심/비핵심 선별 + Fact Check | relevance-scorer.ts (3-criteria) + factcheck/ 8 모듈 | PASS |
| 3. Review & Edit | Gap 결과 확인 + 편집 | 8 API endpoints + 5 pages + GapList/GapDetail components | PASS |
| 4. Approval & Export | PM 승인 + Spec 패키지 출력 | ApprovalGate + export/ 5 모듈 + R2 저장 | PASS |

#### 3.4.2 핵심/비핵심 선별 Option C (SS4.2)

| Step | PRD | Implementation | Status |
|------|-----|----------------|:------:|
| AI 분석 — 3기준 (외부 API, Core Entity, Transaction) | relevance-scorer.ts `scoreApi()` + `classifyAll()` | PASS |
| AI 제안 — 핵심 Spec 후보 + 신뢰도 점수 | API 137/230 core (59.6%), Table 53/152 core (34.9%) | PASS |
| 사용자 확인 — 수용/거부/범위 조정 | GET /specs/classified (필터 지원) | PASS |
| 집중 추출 — 확정 영역 심층 추출 | Core flag 기반 필터링 | PASS |

#### 3.4.3 Fact Check (SS4.3) — PASS+

| PRD Requirement | Implementation | Status |
|-----------------|----------------|:------:|
| API 정의서 일치성 (높은 신뢰도) | matcher.ts (exact+fuzzy) + llm-matcher.ts (semantic) | PASS |
| 테이블 정의서 일치성 (높은 신뢰도) | matcher.ts + gap-detector.ts | PASS |
| 정책 구현 현황 (중간 — 후보 생성) | 기존 v0.6 svc-policy HITL | N/A (Plus) |
| Gap 유형 4종 (SM/MC/PM/TM) | **5종 (SM/MC/PM/TM/MID)** | PASS+ |
| Gap Severity 3단계 (HIGH/MEDIUM/LOW) | severity.ts classifySeverity() | PASS |
| Gap 유형 x Severity 기본 매핑 | severity.ts (VO/DTO → LOW 하향 포함) | PASS |
| 유형별 precision 추적 | KPI endpoint에서 전체 precision만 집계 | PARTIAL |

> **MID Gap Type (Enhancement)**: PRD 4종에 "Missing In Document" 추가. MC는 컬럼 레벨, MID는 API/테이블 엔트리 레벨 누락 구분. PRD 의도에 부합.

#### 3.4.4 Gap Severity 체계 (SS4.3 v0.7.4)

| PRD Severity 규칙 | Implementation | Status |
|-------------------|----------------|:------:|
| HIGH: 외부 API 필수 파라미터 불일치, 핵심 테이블 컬럼 누락 | severity.ts 조건 반영 | PASS |
| MEDIUM: 데이터 타입 차이, 선택 파라미터 불일치 | severity.ts 기본 매핑 | PASS |
| LOW: 명명 규칙 차이, 내부 유틸 API | severity.ts 하향 조건 | PASS |
| 리뷰어가 severity 수정 가능 | Gap review API (POST /factcheck/gaps/:gapId/review) | PASS |
| HIGH Gap은 Core 종료 전 반드시 처리 | UI에 severity 필터 존재 (GapList) | PASS |

### 3.5 SS5 Dev Spec Structure — PASS

#### 3.5.1 Spec 유형 및 우선순위 (SS5.2)

| Spec Type | PRD Priority | Implementation | Status |
|-----------|:-----------:|----------------|:------:|
| API정의서 | Core | spec-api.ts → OpenAPI 3.0 호환 JSON (184KB) | PASS |
| 테이블정의서 | Core | spec-table.ts → ERD 구조화 JSON (307KB) | PASS |
| 정책정의서 | Plus | 기존 v0.6 policy pipeline | N/A |
| 요구사항정의서 | MVP 이후 | 미구현 | N/A |
| 화면설계서 | Out of Scope | 미구현 (SS6.3 명시적 제외) | N/A |

#### 3.5.2 출력물 샘플 형식 (SS5.3)

| Sample | PRD Format | Implementation | Status |
|--------|-----------|----------------|:------:|
| Sample A — API Spec JSON | OpenAPI 3.0 호환 | spec-api.ts: buildOpenApiWrapper() | PASS |
| Sample B — Table Spec JSON | ERD 구조화 JSON | spec-table.ts: buildTableSpecWrapper() | PASS |
| Sample C — Policy Spec | JSON 후보 목록 | Pilot Plus | N/A |

#### 3.5.3 출력 패키지 (SS5.4)

| File | PRD | Implementation | Status |
|------|-----|----------------|:------:|
| spec-api.json | OpenAPI 3.0 호환 | spec-api.ts (184KB) | PASS |
| spec-table.json | ERD 구조화 | spec-table.ts (307KB) | PASS |
| spec-policy.json | 조건-기준-결과 | Pilot Plus | N/A |
| fact-check-report.md | Markdown Gap report | report.ts (140KB) | PASS |
| spec-summary.xlsx | Excel 요약 | **CSV** (33KB, BOM prefix) | PARTIAL |

> **spec-summary**: PRD는 `.xlsx`, 구현은 `.csv`. Plan SS6.4에서 "간단한 CSV로 선행" 결정. Excel 변환은 Pilot Plus.

### 3.6 SS6 MVP Scope — PASS (기능 기준)

#### 3.6.1 Pilot Core 필수 기능 (SS6.1)

| # | Feature | PRD | Implementation | Status |
|---|---------|-----|----------------|:------:|
| 1 | 문서 + 소스코드 Upload & Parsing | 필수 | svc-ingestion: 14 parser files (7 parsers) | PASS |
| 2 | API Spec 자동 추출 | 필수 | java-controller.ts → 230 endpoints from 163 Controllers | PASS |
| 3 | Table Spec 자동 추출 | 필수 | java-datamodel.ts + mybatis-mapper.ts + ddl.ts → 152 tables | PASS |
| 4 | Source-Document Fact Check | 필수 | factcheck/ 8 modules, 8 API endpoints, 331 tests | PASS |
| 5 | 핵심/비핵심 선별 (Option C) | 필수 | relevance-scorer.ts (3-criteria), API 137 core, Table 53 core | PASS |
| 6 | 최소 검토 UI | 필수 | 5 pages + 9 components (GapList, GapDetail, CoverageCard 등) | PASS |
| 7 | PM 단일 승인 게이트 | 필수 | ApprovalGate.tsx (localStorage 기반) | PASS |
| 8 | Spec 패키지 Export | 필수 | packager.ts → R2 저장 (pkg-f1e20fb3, 664KB) | PASS |

**기능 구현: 8/8 PASS (100%)**

#### 3.6.2 Pilot Core 종료 조건 (SS6.1)

| # | 종료 조건 | 현재 상태 | Status |
|---|----------|----------|:------:|
| 1 | API/테이블 팩트 체크 결과가 SS5.3 형식으로 출력 | pkg-f1e20fb3 (spec-api + spec-table + report + csv) | PASS |
| 2 | DA/AA가 B 사이트 초기 설계에 '활용 가능' 평가 | **리뷰어 미확보 → 미측정** | FAIL |
| 3 | SS8.2 임시 KPI 수치 충족 | **공식 불일치 (F-1)**: 구현 공식 FAIL, PRD 공식 PASS | **REVIEW** |

> 종료 조건 #3은 F-1 해결 후 재판정 필요.

#### 3.6.3 Pilot Plus (SS6.2) — 미착수

| Feature | Status |
|---------|:------:|
| 정책 후보 생성 + 기획자 승인 UI | 미착수 (기존 v0.6 HITL 활용 가능) |
| 페르소나별 전문 영역 편집 UI | 미착수 |
| 다단계 승인 워크플로우 | 미착수 |
| 품질 점수 / 신뢰도 대시보드 | 미착수 |
| B 사이트 적용 반자동화 초안 | 미착수 |

#### 3.6.4 Out of Scope (SS6.3) — 준수

| Item | PRD 제외 사유 | 구현 | Status |
|------|-------------|------|:------:|
| Skill 패키지 (.skill.json) | 후속 단계 | 기존 v0.6 유지 | OK |
| No-code tool 연동 | 후속 단계 | 미구현 | OK |
| 완전 자동화 (Full Auto) | 반자동 목표 | 미구현 | OK |
| 화면설계 Spec (React 분석) | Pilot Plus 이후 완전 이연 | 미구현 | OK |

### 3.7 SS7 System Architecture — PASS

#### 3.7.1 Infrastructure Reuse (SS7.1)

| Component | PRD | Implementation | Status |
|-----------|-----|----------------|:------:|
| Cloudflare Workers/D1/R2/Queue | Reuse | 12 Workers + 10 D1 + 2 R2 | PASS |
| @ai-foundry/types, utils | Extend | spec.ts + factcheck.ts added | PASS |
| svc-llm-router / svc-security / svc-governance | Reuse | 변경 없음 | PASS |
| svc-ingestion | Extend | 14 parser files (Java/SQL/XML/ZIP) | PASS |
| svc-extraction | Redesign | factcheck/ 8 modules + export/ 5 modules + routes 3 files | PASS |
| svc-policy | Extend | 변경 없음 (Pilot Plus) | N/A |
| svc-queue-router | Reuse + new events | factcheck.requested/completed 추가, 재배포 완료 | PASS |
| app-web | Redesign | 5 new pages + 9 components + 3 API clients + 4 sidebar items | PASS |

#### 3.7.2 Pipeline (SS7.2)

| Stage | PRD | Implementation | Status |
|-------|-----|----------------|:------:|
| Stage 1-A: 문서 파싱 | 기존 유지 | svc-ingestion (Unstructured.io + xlsx + docx) | PASS |
| Stage 1-B: 소스코드 파싱 | 신규 | 7 parsers (java-controller, datamodel, service, ddl, mybatis, zip, classifier) | PASS |
| Stage 2: 통합 추출 + Fact Check | 핵심 | factcheck/ (aggregator + extractor + matcher + gap + severity + llm + report) | PASS |
| Stage 3-A: API/Table Spec 확정 | 높은 신뢰도 | export/ (spec-api + spec-table + relevance-scorer) | PASS |
| Stage 3-B: 정책 후보 생성 | Pilot Plus | 기존 v0.6 pipeline | N/A |
| Stage 4: Spec 정제 + 검토/수정 | HITL | GapDetail + review API (confirm/dismiss/modify) | PARTIAL |
| Stage 5: Spec 패키지 출력 | SS5.4 | packager.ts + export routes + R2 저장 | PASS |

> Stage 4 PARTIAL: 리뷰 API와 UI는 구현되었으나, 리뷰어 미확보로 실제 HITL 수행 0건.

#### 3.7.3 Source Code Parsing Scope (SS7.3)

| Parsing Target | PRD Scope | Implementation | Status |
|----------------|----------|----------------|:------:|
| Spring @Controller / @RestController | Core | java-controller.ts (329L) | PASS |
| @RequestMapping / @GetMapping 등 | Core | java-controller.ts | PASS |
| JPA @Entity / @Table / @Column | Core | java-datamodel.ts (258L) | PASS |
| DDL (schema.sql / Flyway) | Core | ddl.ts (201L) | PASS |
| @Transactional service methods | Core | java-service.ts (168L) | PASS |
| **MyBatis mapper / XML SQL** | **Plus** | **mybatis-mapper.ts (246L)** | **SCOPE+** |
| Dynamic SQL (QueryDSL, Criteria) | Plus | 미구현 | N/A |
| Stored Procedure | Plus | 미구현 | N/A |
| Feign Client / Gateway routing | Plus | 미구현 | N/A |
| React Component | Out of Scope | 미구현 | N/A |

> **SCOPE+**: PRD SS7.3은 MyBatis를 Plus로 분류. LPON .sql 0건 → MyBatis XML이 유일한 테이블 소스이므로 선제 구현. Plan DD-POST-1에서 근거 기록. **PRD 업데이트 필요**: MyBatis → Core 격상.

#### 3.7.4 LLM Cost Management (SS7.4)

| Strategy | PRD | Implementation | Status |
|----------|-----|----------------|:------:|
| AST Pre-parsing (LLM 미사용) | Stage 1-B | Regex 기반 정적 분석 (Workers 환경 제약) | PASS |
| 문서 청크 추출 (Haiku) | Stage 1-A | Unstructured.io + Haiku 분류 | PASS |
| 구조화 데이터 매칭 (Sonnet) | Stage 2 | matcher.ts (구조적 매칭, LLM 미사용) + llm-matcher.ts (미매칭만) | PASS |
| 정책 후보 추론 (Opus) | Stage 3-B | Pilot Plus | N/A |

> PRD "LLM은 구조화 이후에만 사용" 원칙 준수. 구조적 매칭 98건 vs LLM 17건 = 85:15 비율로 목표(10-20%) 부합.

#### 3.7.5 Development Priority (SS7.5) — 정확히 준수

| Priority | PRD Item | Actual Order | Status |
|:--------:|----------|:------------:|:------:|
| 1 | Fact Check Engine | Phase 2-B (1st) | MATCH |
| 2 | API / Table Extraction | Phase 2-A (선행, 적절) | MATCH |
| 3 | Export (SS5.4 package) | Phase 2-C (3rd) | MATCH |
| 4 | Review UI | Phase 2-D (4th) | MATCH |

#### 3.7.6 LLM Tier Strategy (SS7.6)

| Tier | PRD Model | Implementation | Status |
|------|-----------|----------------|:------:|
| Tier 1 (Opus) | Claude Opus | claude-opus-4-6 (정책 추론) | PASS |
| Tier 2 (Sonnet) | Claude Sonnet | claude-sonnet-4-6 (Spec 구조화) | PASS |
| Tier 3 (Haiku) | Claude Haiku | claude-haiku-4-5 (분류) | PASS |
| Pre-parsing | JavaParser/Tree-sitter | **Regex** (Workers 제약) | CHANGED |

### 3.8 SS8 Success Criteria

#### 3.8.1 정성적 기준 (SS8.1)

| Criterion | Status | Evidence |
|-----------|:------:|---------|
| B 사이트 초기 설계 착수 가능 수준 산출물 | PASS | pkg-f1e20fb3 (spec-api 230 APIs + spec-table 152 tables) |
| DA/AA '실제로 쓸 수 있다' 평가 | **FAIL** | 리뷰어 미확보 (SS11.1 #3) |
| 암묵지 최소 1건 발굴 | PASS | MID gaps 126건 (소스에만 존재, 문서 미기재 API) |

#### 3.8.2 정량적 KPI (SS8.2)

| KPI | Target | 구현 공식 결과 | PRD 공식 결과 | Status |
|-----|:------:|:-------------:|:------------:|:------:|
| Critical API Coverage | >= 80% | 45.2% (FAIL) | **95.4%** (PASS) | **F-1** |
| Critical Table Coverage | >= 80% | 7.2% (FAIL) | **100%** (PASS) | **F-1** |
| Gap Precision | >= 75% | 0% (미측정) | 0% (미측정) | FAIL |
| Reviewer Acceptance | >= 70% | N/A | N/A | N/A |
| Spec Edit Time Reduction | >= 30% | N/A | N/A | N/A |

> **Gap Precision 0%**: 리뷰어가 Gap을 confirm/dismiss한 건수 0. 기술적으로 준비 완료 (API + UI 구현됨). 리뷰어 확보가 전제 조건.

#### 3.8.3 Gap 유형별 KPI (SS8.2 v0.7.3)

| Gap Type | PRD Target | 구현 | Status |
|----------|:----------:|------|:------:|
| SM precision | >= 70% | 유형별 분리 추적 미구현 (전체만) | PARTIAL |
| MC precision | >= 80% | 상동 | PARTIAL |
| PM precision | >= 75% | 상동 | PARTIAL |
| TM precision | >= 80% | 상동 | PARTIAL |

> KPI endpoint가 전체 gapPrecision만 반환. 유형별 precision은 fact_check_gaps 테이블의 gap_type + review_status로 계산 가능하나, API에 노출되지 않음. Minor enhancement로 추가 가능.

### 3.9 SS9 Risk Management

| Risk | PRD Impact | Current Status | Mitigated? |
|------|-----------|----------------|:----------:|
| R-1: 소스 보안/기밀 | 높음 | PII masking 적용. LPON 25 zips 업로드 성공 | YES |
| R-2: 정책 코드 품질 | 중간 | Pilot Plus 범위. 현재 불해당 | N/A |
| R-3: Pilot Core 범위 크립 | 중간 | SS6.1 종료 조건 명시. 관리 양호 | YES |
| R-4: 승인 체계 불일치 | 낮음 | PM 단일 승인 (ApprovalGate) 구현 | YES |
| R-5: 리뷰 참여자 확보 | 낮음 | **미확보** — SS11.1 #3 미충족 | NO |

### 3.10 SS10 Development Roadmap

| PRD Phase | PRD 내용 | Plan 매핑 | 실제 | Alignment |
|-----------|---------|----------|------|:---------:|
| 2-A | 소스코드 파싱 구현 | Plan 2-A | Done (2 sessions) | MATCH |
| 2-B | 팩트 체크 엔진 구현 | Plan 2-B | Done (5 sessions) | MATCH |
| 2-C | **Pilot Core UI 구현** | Plan **2-C Export + 2-D UI** | Done (2+2 sessions) | REORDER |
| 2-D | **Pilot Core 실행 & KPI** | Plan **2-E** | Done (3 sessions) | REORDER |
| 2-E | Pilot Plus 구현 | Plan 2-F | Not started | MATCH |

> PRD 2-C(UI) → Plan에서 2-C(Export) + 2-D(UI)로 분리. PRD SS7.5 개발 우선순위(Export→UI) 반영. 적절한 개선.

### 3.11 SS11 Prerequisites Checklist

#### 3.11.1 Pilot Core 착수 조건

| # | Condition | PRD | Actual | Status |
|---|-----------|-----|--------|:------:|
| 1 | 소스코드 접근 | 확인 필요 | LPON 25/28 zips 업로드 (2,543 Java) | PASS |
| 2 | 산출물 20종+ 접근 | 확인 필요 | 62건 업로드 (59 parsed) | PASS |
| 3 | 리뷰 참여자 (DA+AA+기획자) | 확인 필요 | **미확보 — 0명 참여** | **FAIL** |
| 4 | Cloudflare + Anthropic 계약 | 확인됨 | 12/12 Workers healthy | PASS |
| 5 | 소스 보안 처리 방침 | 확인 필요 | PII masking 파이프라인 적용 중 | PASS |
| 6 | KPI 합의 | 확인 필요 | **미합의 — F-1 공식 불일치 미해결** | **FAIL** |
| 7 | 문서 품질 샘플링 | 확인 필요 | 59/62 파싱 성공 (95.2%) | PASS |

**착수 조건 Score: 5/7 PASS**

#### 3.11.2 Pilot Plus 착수 조건

| # | Condition | Status |
|---|-----------|:------:|
| 1 | Pilot Core 종료 조건 3가지 모두 충족 | PENDING (F-1 해결 + 리뷰어 확보 필요) |
| 2 | KT DS SI 승인 체계 인터뷰 완료 | 미착수 |
| 3 | 정책 후보 승인 역할 담당자 확정 | 미착수 |

---

## 4. PRD-Plan Deviation Analysis

Plan이 PRD와 다르게 구성한 부분 (모두 기록 완료):

| # | PRD | Plan/Implementation | Deviation | Judgment |
|---|-----|---------------------|-----------|:--------:|
| 1 | Phase 2-C = UI (SS10.1) | 2-C = Export, 2-D = UI | 순서 분리 | SS7.5 반영. **적절** |
| 2 | MyBatis = Plus (SS7.3) | Core로 격상 (DD-POST-1) | 범위 선행 | LPON 불가피. **적절** |
| 3 | Gap 4종 (SM/MC/PM/TM) | 5종 (+MID, DD-POST-2) | 타입 추가 | **적절** |
| 4 | JavaParser (SS7.3) | Regex 기반 | 기술 변경 | Workers 제약. **적절** |
| 5 | **Coverage = matched/문서항목** | **matched/소스항목** | 공식 변경 | **부적절 — F-1** |
| 6 | spec-summary.xlsx | CSV (.csv) | 형식 변경 | Plan에 근거. **허용** |

---

## 5. Consolidated Score Summary

### 5.1 PRD 섹션별 충족률

| PRD Section | Items | PASS | GAP | N/A | Score |
|-------------|:-----:|:----:|:---:|:---:|:-----:|
| SS1 Project Overview | 3 | 3 | 0 | 0 | 100% |
| SS2 Pilot Domain | 6 | 5 | 0 | 1 | 100% |
| SS3 Persona & Permissions | 4 | 2 | 2 | 0 | 50% |
| SS4 Core Workflow | 17 | 16 | 0 | 1 | 100% |
| SS5 Dev Spec Structure | 11 | 9 | 0 | 2 | 100% |
| SS6 MVP Scope | 14 | 10 | 1 | 3 | 91% |
| SS7 System Architecture | 24 | 22 | 0 | 2 | 100% |
| SS8 Success Criteria | 10 | 3 | 5 | 2 | 38% |
| SS9 Risk Management | 5 | 4 | 1 | 0 | 80% |
| SS10 Development Roadmap | 5 | 5 | 0 | 0 | 100% |
| SS11 Prerequisites | 7 | 5 | 2 | 0 | 71% |
| **Total** | **106** | **84** | **11** | **11** | **88%** |

### 5.2 GAP 분류

| Category | Count | Items |
|----------|:-----:|-------|
| **기술적 Gap (코드 수정 필요)** | 2 | F-1 KPI 공식 수정, 유형별 precision API |
| **프로세스 Gap (비기술적)** | 4 | 리뷰어 확보, KPI 합의, DA/AA 평가, 페르소나 매핑 |
| **범위 외 (Pilot Plus)** | 5 | 페르소나 편집, 다단계 승인, 정책 후보, 품질 대시보드, B 사이트 적용 |

---

## 6. Recommended Actions

### 6.1 Immediate — KPI 공식 수정 (1 session)

| # | Action | Impact | Effort |
|---|--------|--------|:------:|
| 1 | **factcheck.ts L867-871 공식 변경**: `totalSourceApis` → `totalDocApis` | API Coverage 45%→95%, Table 7%→100% | 0.5h |
| 2 | 보조 지표 추가: `documentationCompleteness = matched/sourceItems` | 두 관점 모두 제공 | 0.5h |
| 3 | 유형별 Gap precision 추가: `/factcheck/kpi`에 SM/MC/PM/TM/MID별 precision | SS8.2 v0.7.3 요구 충족 | 1h |
| 4 | phase2c.design.md 업데이트: PRD deviation 기록 | 문서 정합성 | 0.5h |

### 6.2 Short-term — 착수 조건 충족 (외부 의존)

| # | Action | Owner | Status |
|---|--------|-------|:------:|
| 5 | **리뷰어 1명 이상 확보** (DA or AA) | PM/팀장 | OPEN |
| 6 | **KPI 합의** — F-1 해결 후 팀 내 검토 | 개발팀 + PM | OPEN |
| 7 | DA/AA '활용 가능' 평가 수행 | 리뷰어 | OPEN (5 의존) |

### 6.3 Deferred — Pilot Plus (SS6.2)

| # | Action | Phase |
|---|--------|-------|
| 8 | 페르소나별 전문 영역 편집 UI | Phase 2-F |
| 9 | 다단계 승인 워크플로우 (SI 체계 인터뷰 기반) | Phase 2-F |
| 10 | 정책 후보 생성 + 기획자 승인 UI | Phase 2-F |
| 11 | spec-summary.xlsx (Excel 형식) | Phase 2-F |
| 12 | Tree-sitter WASM 도입 | Phase 2-F |

---

## 7. PRD Update Recommendations

PRD v0.7.4 → v0.7.5 업데이트가 필요한 항목:

| # | Section | 현행 PRD | 변경 제안 | 근거 |
|---|---------|---------|----------|------|
| 1 | SS7.3 | MyBatis = Plus | MyBatis = **Core** | LPON .sql 0개, XML mapper 유일한 테이블 소스 |
| 2 | SS4.3 | Gap 4종 (SM/MC/PM/TM) | Gap **5종** (+MID) | 소스-only 항목 엔트리 레벨 분류 필요 |
| 3 | SS7.3 | JavaParser | **Regex** (Workers 환경) | WASM 번들 제약, 95%+ 커버 확인 |
| 4 | SS8.2 | Coverage 공식 단일 | **2-metric**: Coverage(문서 분모) + Documentation Completeness(소스 분모) | 두 관점 모두 유의미 |
| 5 | SS5.4 | spec-summary.xlsx | spec-summary.**csv** (Core) / .xlsx (Plus) | Workers 환경 Excel 생성 제약 |

---

## 8. Conclusion

v0.7.4 Pivot의 **기능 구현은 PRD SS6.1 Pilot Core 종료 기능 8/8 완료 (100%)**. 전체 106개 PRD 요구사항 중 84개 PASS (88%), 11개 GAP, 11개 N/A (Pilot Plus 범위).

핵심 발견은 **F-1: KPI Coverage 공식 불일치**. PRD 공식(문서 분모) 적용 시 API Coverage 95.4%, Table Coverage 100%로 모두 80% 목표를 초과 달성. 이 수정은 약 0.5시간 코드 변경으로 해결 가능.

남은 Gap은 주로 **프로세스 제약** (리뷰어 미확보, KPI 합의 미완)이며, 기술적 미구현 항목은 2건 (KPI 공식 수정, 유형별 precision)으로 최소.

Pilot Core 종료 선언을 위한 필수 조치:
1. **F-1 해결** — KPI 공식을 PRD 기준으로 수정 (코드 변경 2줄)
2. **리뷰어 확보** — DA or AA 최소 1명 → Gap 리뷰 수행 → Precision 측정
3. **KPI 합의** — 팀 내 검토 완료

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-06 | Initial PRD-Implementation gap analysis (Phase 2-B mid, 35%) | Claude Opus 4.6 |
| **2.0** | **2026-03-06** | **Full update: Phase 2-A~2-E 완료 반영. F-1 KPI 공식 불일치 발견. 88% overall.** | **Claude Opus 4.6** |
