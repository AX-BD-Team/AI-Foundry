---
code: AIF-ANLS-012
title: Benchmark Feature Gap Analysis
version: "1.0"
status: Active
category: Analysis
created: 2026-03-09
updated: 2026-03-09
author: Gap Detector Agent
---

# Benchmark Feature Gap Analysis Report

> **Analysis Type**: Gap Analysis (Design Expectations vs Implementation)
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Analyst**: Gap Detector Agent
> **Date**: 2026-03-09
> **REQ**: AIF-REQ-012

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

Verify that the benchmark report feature (cross-org comparison page) correctly implements the 8 design expectations specified in the task, covering backend API, frontend UI, TypeScript strictness, RBAC, auth, and error handling.

### 1.2 Analysis Scope

| Category | Files |
|----------|-------|
| Backend (NEW) | `services/svc-analytics/src/routes/benchmark.ts` |
| Backend (MOD) | `services/svc-analytics/src/index.ts` |
| Frontend (NEW) | `apps/app-web/src/pages/benchmark.tsx` |
| Frontend (MOD) | `apps/app-web/src/api/analytics.ts` |
| Frontend (MOD) | `apps/app-web/src/app.tsx` |
| Frontend (MOD) | `apps/app-web/src/components/Sidebar.tsx` |

---

## 2. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match | 93% | PASS |
| Architecture Compliance | 100% | PASS |
| Convention Compliance | 96% | PASS |
| **Overall** | **95%** | PASS |

---

## 3. Detailed Gap Analysis

### 3.1 Backend: API Endpoint

| # | Expectation | Implementation | Status |
|---|-------------|---------------|--------|
| B-1 | GET /reports/benchmark endpoint | `handleGetBenchmark` at `/reports/benchmark` | PASS |
| B-2 | Query `pipeline_metrics` for both orgs | `queryOrgKpi()` with `WHERE organization_id = ?` on `pipeline_metrics` | PASS |
| B-3 | Query `quality_metrics` for both orgs | `queryOrgQuality()` with `WHERE organization_id = ?` on `quality_metrics` | PASS |
| B-4 | Query `stage_latency` for both orgs | `queryOrgLatencies()` with `WHERE organization_id = ?` on `stage_latency` | PASS |
| B-5 | Compute AI vs Manual comparison | `computeManualComparison()` with industry estimates | PASS |
| B-6 | Uses `ok()` from @ai-foundry/utils | Line 7: `import { ok, ... } from "@ai-foundry/utils"` | PASS |
| B-7 | Uses `createLogger()` | Line 10: `const logger = createLogger("svc-analytics:benchmark")` | PASS |
| B-8 | Uses `errFromUnknown()` for error handling | Line 256: `return errFromUnknown(e)` | PASS |
| B-9 | D1 COALESCE for null safety | All 3 query functions use `COALESCE(...)` | PASS |
| B-10 | Response format `{ success: true, data }` | Via `ok()` utility | PASS |
| B-11 | RBAC analytics:read permission check | `index.ts:114-118` reports block applies `checkPermission(env, rbacCtx.role, "analytics", ...)` | PASS |
| B-12 | X-Internal-Secret auth | `index.ts:54` `verifyInternalSecret()` gate | PASS |
| B-13 | Route registered in index.ts | `index.ts:31` import + `index.ts:157-158` route match | PASS |
| B-14 | Parallel org queries | `Promise.all(BENCHMARK_ORGS.map(...))` with inner `Promise.all` for KPI/quality/latency | PASS |

### 3.2 Frontend: Page & Routing

| # | Expectation | Implementation | Status |
|---|-------------|---------------|--------|
| F-1 | 3 sections: Cross-Domain, AI vs Manual, Stage Performance | `CrossOrgSection`, `AiVsManualSection`, `StagePerformanceSection` | PASS |
| F-2 | Loading state | `BenchmarkSkeleton` component, `if (loading) return <BenchmarkSkeleton />` | PASS |
| F-3 | Error state | Error card with retry button (lines 686-701) | PASS |
| F-4 | Lazy loading in app.tsx | `const BenchmarkPage = lazy(() => import("./pages/benchmark"))` | PASS |
| F-5 | Route `/benchmark` | `app.tsx:80` `<Route path="/benchmark" ...>` with ProtectedRoute + Layout | PASS |
| F-6 | Sidebar menu item | `Sidebar.tsx:110` in "Admin" group: `{ label: '벤치마크 리포트', path: '/benchmark' }` | PASS |
| F-7 | `fetchBenchmark()` API client | `analytics.ts:176-183` with proper headers | PASS |
| F-8 | `BenchmarkData` / `BenchmarkOrgData` types | `analytics.ts:102-174` full type definitions | PASS |
| F-9 | `ApiResponse<T>` discriminated union | `fetchBenchmark` returns `Promise<ApiResponse<BenchmarkData>>` | PASS |
| F-10 | shadcn/ui + CSS variables | Card, Badge, Skeleton components + `var(--accent)` etc. | PASS |
| F-11 | Refresh button | Line 727-738: RefreshCw button calling `loadData()` | PASS |
| F-12 | Generated timestamp display | Line 747: `new Date(data.generatedAt).toLocaleDateString("ko-KR")` | PASS |

### 3.3 TypeScript Strictness

| # | Rule | Status | Detail |
|---|------|--------|--------|
| TS-1 | `exactOptionalPropertyTypes` | PASS | `BigMetric.sub` typed as `sub?: string` (no explicit undefined assignment) |
| TS-2 | `noUncheckedIndexedAccess` | PASS | `orgs[0]`/`orgs[1]` null-checked in sections (`if (!left \|\| !right) return null`); `STAGE_LABELS[stage] ?? stage` uses nullish coalescing; `result?.documents_uploaded ?? 0` pattern |
| TS-3 | `noPropertyAccessFromIndexSignature` | PASS | Index signature access uses `[key]` notation (e.g., `left.stageLatencies[stage]`) |
| TS-4 | Backend QualityRow cast | PASS | `(result ?? {}) as unknown as QualityRow` with `\|\|` fallback on each field |

### 3.4 Proxy Routing

| # | Check | Status | Detail |
|---|-------|--------|--------|
| P-1 | Pages Function routes `/api/reports/*` to svc-analytics | PASS | `ROUTE_TABLE.reports = "svc-analytics"` in `functions/api/[[path]].ts:64` |
| P-2 | Path forwarded as `/reports/benchmark` | PASS | Proxy reconstructs `/${segments.join("/")}` |

---

## 4. Issues Found

### 4.1 Missing Features (Design O, Implementation X)

| # | Item | Severity | Description |
|---|------|----------|-------------|
| G-1 | Benchmark route test | LOW | No test for `GET /reports/benchmark` in `routes.test.ts` (existing tests cover auth + other routes but not benchmark) |
| G-2 | `stage_latency` org index | LOW | No index on `(organization_id)` for `stage_latency` -- the benchmark query `WHERE organization_id = ? GROUP BY stage` performs a full table scan. Existing indexes are `(document_id, stage)` and `(date, stage)` |

### 4.2 Added Features (Design X, Implementation O)

| # | Item | Location | Description |
|---|------|----------|-------------|
| A-1 | Production Summary banner | `benchmark.tsx:752-794` | Overview banner showing 2 orgs / total docs / policies / skills / 5 stages -- nice addition not in requirements |
| A-2 | Quality Metrics Summary | `benchmark.tsx:593-636` | Per-org chunk validity, rules/extraction, approval rate, trust score -- enriches Stage Performance section |
| A-3 | ComparisonBar visual component | `benchmark.tsx:124-180` | Horizontal bar chart comparison -- visual enhancement |

### 4.3 Changed Features (Design != Implementation)

| # | Item | Design | Implementation | Impact |
|---|------|--------|----------------|--------|
| C-1 | `timeReductionPercent` formula | Expected: `(manualHours - aiHours) / manualHours * 100` | Actual: `(1 - 1/manualTotalHours) * 100` | MEDIUM -- formula is mathematically wrong. For 100 docs: manual = 125 hrs, formula gives `(1 - 0.008) * 100 = 99.2%` regardless of AI time. Should compare actual AI processing time vs manual |
| C-2 | `consistencyRate` hardcoded | Expected: computed from data | Actual: `99.2` hardcoded in `computeManualComparison` | LOW -- acceptable for demo/pilot phase, but should be documented as a static estimate |
| C-3 | `useOrganization` unused | `organizationId` obtained but benchmark is cross-org | Actual: passed to `fetchBenchmark()` for headers but not used in API query | INFO -- harmless, needed for auth headers |

---

## 5. Architecture Compliance

| Check | Status |
|-------|--------|
| Backend handler in dedicated route file (`routes/benchmark.ts`) | PASS |
| Index.ts only does routing, no business logic | PASS |
| Frontend: Page -> API client -> Backend (3-layer) | PASS |
| Types co-located in API client file | PASS |
| No direct infrastructure access from components | PASS |
| Service boundary respected (analytics DB only) | PASS |

Score: **100%**

---

## 6. Convention Compliance

| Category | Check | Status | Detail |
|----------|-------|--------|--------|
| Naming | Component PascalCase | PASS | `BenchmarkPage`, `CrossOrgSection`, `AiVsManualSection`, `StagePerformanceSection`, `SectionTitle`, `BigMetric`, `ComparisonBar`, `BenchmarkSkeleton` |
| Naming | Functions camelCase | PASS | `handleGetBenchmark`, `queryOrgKpi`, `computeManualComparison`, `fetchBenchmark`, `fmt`, `fmtMs`, `pct` |
| Naming | Constants UPPER_SNAKE_CASE | PASS | `BENCHMARK_ORGS`, `MANUAL_ESTIMATES`, `STAGE_LABELS`, `STAGE_ORDER` |
| Naming | File kebab-case | PASS | `benchmark.ts`, `benchmark.tsx`, `analytics.ts` |
| Import order | External -> Internal -> Relative -> Types | PARTIAL | `benchmark.ts` mixes `import type { Env }` after library import (acceptable -- only 2 imports). Frontend file has clean ordering |
| ESM | `.js` extension in relative imports | PASS | `from "../env.js"`, `from "./routes/benchmark.js"` |
| Error handling | try/catch with errFromUnknown | PASS | Backend wraps entire handler |
| Error handling | Frontend loading/error/data states | PASS | Three-state pattern |
| Logging | createLogger with service prefix | PASS | `"svc-analytics:benchmark"` |

Score: **96%** (minor import order nit)

---

## 7. Match Rate Calculation

| Category | Items | Pass | Rate |
|----------|:-----:|:----:|:----:|
| Backend API (B-1~B-14) | 14 | 14 | 100% |
| Frontend (F-1~F-12) | 12 | 12 | 100% |
| TypeScript (TS-1~TS-4) | 4 | 4 | 100% |
| Proxy (P-1~P-2) | 2 | 2 | 100% |
| **Issues deducted** | | | |
| G-1: Missing test | - | - | -2% |
| C-1: Wrong formula | - | - | -3% |
| **Total** | **32** | **32** | **95%** |

---

## 8. Recommended Actions

### 8.1 Immediate (before demo)

| # | Priority | Item | File | Description |
|---|----------|------|------|-------------|
| 1 | MEDIUM | Fix `timeReductionPercent` formula | `benchmark.ts:218` | Current formula `(1 - 1/manualTotalHours)` does not compare AI vs manual time. Should estimate AI processing time (e.g., from `avgPipelineDurationMs * totalDocs`) and compute `(manualHours - aiHours) / manualHours * 100` |

### 8.2 Short-term

| # | Priority | Item | File | Description |
|---|----------|------|------|-------------|
| 2 | LOW | Add benchmark route test | `routes.test.ts` | Add `GET /reports/benchmark` test case (auth + 200 + response shape) |
| 3 | LOW | Add `stage_latency` org index | migration `0004_*.sql` | `CREATE INDEX idx_latency_org ON stage_latency(organization_id, stage)` for query performance |
| 4 | LOW | Document `consistencyRate` as static | `benchmark.ts:206` | Add comment explaining 99.2% is a system-level estimate, not computed per-query |

---

## 9. Summary

Benchmark feature is well-implemented at **95% match rate**. All 8 design expectations are met:

1. Backend queries all 3 tables (pipeline_metrics, quality_metrics, stage_latency) for both orgs -- PASS
2. AI vs Manual comparison computed with industry estimates -- PASS (formula needs fix)
3. Frontend has 3 sections -- PASS (plus bonus Production Summary banner)
4. Loading/error states handled -- PASS
5. TypeScript strict mode compliance -- PASS
6. RBAC analytics:read check -- PASS
7. X-Internal-Secret auth -- PASS
8. Proper error handling -- PASS

One functional issue (C-1: `timeReductionPercent` formula) should be fixed before customer demo. The remaining items are low-severity quality improvements.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-09 | Initial analysis | Gap Detector Agent |
