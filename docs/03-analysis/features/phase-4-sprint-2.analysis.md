---
code: AIF-ANLS-027
title: Phase 4 Sprint 2 Gap Analysis — evaluate-auto + CC Export + Mock-up UX
version: "1.0"
status: Active
category: analysis
created: 2026-03-19
updated: 2026-03-19
author: Claude Opus 4.6
---

# Phase 4 Sprint 2 Gap Analysis

## Executive Summary

| Item | Value |
|------|-------|
| Feature | phase-4-sprint-2 (REQ-022/025/019) |
| Analysis Date | 2026-03-19 |
| Match Rate | **98% (41/42)** |
| Test Files | 7 new (50 tests added) |
| Lines Added | +2,955 |

### Value Delivered

| Perspective | Description |
|-------------|-------------|
| **Problem** | 파이프라인 완료 후 품질 검증 수동, Skill 활용 채널 제한, UX 미완 |
| **Solution** | 3-Stage 자동 평가 + CC Skill ZIP Export + Mock-up Export 탭 |
| **Function / UX Effect** | Queue 이벤트 트리거로 자동 품질 평가, 원클릭 ZIP 다운로드, 5개 탭 완성 |
| **Core Value** | 파이프라인 신뢰도 자동 검증 + Skill 자산의 Claude Code 직접 활용 경로 확보 |

---

## Match Rate: 98% (41/42)

### Part 1: evaluate-auto API (REQ-022) — 17/17 PASS

| # | Plan Item | Status | File |
|---|-----------|--------|------|
| 1 | PipelineEvaluation Zod schema | PASS | packages/types/src/evaluation.ts (기존) |
| 2 | evaluation.completed event | PASS | packages/types/src/events.ts |
| 3 | Stage 1 — Mechanical evaluator | PASS | svc-governance/src/evaluators/mechanical.ts |
| 4 | Stage 2 — Semantic evaluator | PASS | svc-governance/src/evaluators/semantic.ts |
| 5 | Stage 3 — Consensus evaluator | PASS | svc-governance/src/evaluators/consensus.ts |
| 6 | 3-Stage orchestrator | PASS | svc-governance/src/evaluators/index.ts |
| 7 | POST /pipeline-evaluations/auto | PASS | svc-governance/src/routes/pipeline-evaluations.ts |
| 8 | GET /pipeline-evaluations | PASS | svc-governance/src/routes/pipeline-evaluations.ts |
| 9 | GET /pipeline-evaluations/summary | PASS | svc-governance/src/routes/pipeline-evaluations.ts |
| 10 | POST /internal/queue-event handler | PASS | svc-governance/src/index.ts |
| 11 | Route registration in index.ts | PASS | svc-governance/src/index.ts |
| 12 | Queue Router: skill.packaged → governance | PASS | svc-queue-router/src/index.ts |
| 13 | Queue Router: SVC_GOVERNANCE binding (3 envs) | PASS | svc-queue-router/wrangler.toml |
| 14 | mechanical.test.ts | PASS | 8 tests |
| 15 | semantic.test.ts | PASS | 6 tests |
| 16 | consensus.test.ts | PASS | 6 tests |
| 17 | pipeline-evaluations.test.ts | PASS | 11 tests |

### Part 2: CC Skill Export (REQ-025) — 10/10 PASS

| # | Plan Item | Status | File |
|---|-----------|--------|------|
| 18 | ExportCcRequest/Meta types | PASS | packages/types/src/skill.ts |
| 19 | skill-md-generator.ts | PASS | svc-skill/src/export/skill-md-generator.ts |
| 20 | policy-md-generator.ts | PASS | svc-skill/src/export/policy-md-generator.ts |
| 21 | zip-builder.ts (fflate) | PASS | svc-skill/src/export/zip-builder.ts |
| 22 | export/index.ts re-export | PASS | svc-skill/src/export/index.ts |
| 23 | GET /skills/:id/export-cc route | PASS | svc-skill/src/routes/export-cc.ts |
| 24 | Route registration in index.ts | PASS | svc-skill/src/index.ts |
| 25 | fflate dependency added | PASS | svc-skill/package.json |
| 26 | skill-md-generator.test.ts | PASS | 7 tests |
| 27 | zip-builder.test.ts | PASS | 6 tests |

### Part 3: Mock-up UX (REQ-019) — 12/13 (1 MINOR gap)

| # | Plan Item | Status | File |
|---|-----------|--------|------|
| 28 | Export tab in Home.tsx | PASS | apps/app-mockup/src/pages/Home.tsx |
| 29 | SkillExportDemo.tsx | PASS | apps/app-mockup/src/components/demo/export/ |
| 30 | SkillExportCard.tsx | PASS | apps/app-mockup/src/components/demo/export/ |
| 31 | SkillMdPreview.tsx | PASS | apps/app-mockup/src/components/demo/export/ |
| 32 | AutoEvalPanel.tsx | PASS | apps/app-mockup/src/components/demo/skill/ |
| 33 | SkillInvokerDemo + AutoEvalPanel | PASS | SkillInvokerDemo.tsx modified |
| 34 | Skeleton.tsx | PASS | apps/app-mockup/src/components/shared/ |
| 35 | EmptyState.tsx | PASS | apps/app-mockup/src/components/shared/ |
| 36 | Toast.tsx | PASS | apps/app-mockup/src/components/shared/ |
| 37 | evaluation.ts API client | PASS | apps/app-mockup/src/lib/api/ |
| 38 | export.ts API client | PASS | apps/app-mockup/src/lib/api/ |
| 39 | Vite proxy: pipeline-evaluations | PASS | vite.config.ts |

### Part 4: Queue Router — 2/2 PASS

| # | Plan Item | Status | File |
|---|-----------|--------|------|
| 40 | SVC_GOVERNANCE in Env + getTargets | PASS | svc-queue-router/src/index.ts |
| 41 | Service binding 3 environments | PASS | svc-queue-router/wrangler.toml |

---

## Gaps (1)

| # | Gap | Severity | Risk | Notes |
|---|-----|----------|------|-------|
| 42 | policy-md-generator.test.ts 미존재 | MINOR | LOW | 43줄 순수 함수, zip-builder + export-cc 테스트에서 간접 검증 |

---

## Bonus Items (계획 외 구현)

| # | Item | Description |
|---|------|-------------|
| B1 | Queue event auto-trigger | skill.packaged → svc-governance 자동 평가 트리거 |
| B2 | Skill package fetch fallback | skillPackageJson 없을 때 SVC_SKILL 서비스 바인딩으로 자동 fetch |
| B3 | Download tracking | export-cc에서 skill_downloads 테이블에 기록 |
| B4 | YAML safe escaping | SKILL.md frontmatter description의 특수문자 이스케이프 |
| B5 | Clipboard copy | SkillMdPreview에 SKILL.md 클립보드 복사 기능 |
| B6 | Org filtering | pipeline-evaluations API에 organization_id 필터 지원 |

---

## Test Summary

| Service | Test Files | Tests | Status |
|---------|-----------|-------|--------|
| svc-governance | 9 (+4 new) | 115 (+31 new) | ALL PASS |
| svc-skill | 17 (+3 new) | 209 (+19 new) | ALL PASS |
| svc-queue-router | 1 (modified) | 43 | ALL PASS |
| **Total** | **27** | **367** | **ALL PASS** |

---

## Notice: Plan Document Drift

기존 `phase-4-sprint-2.plan.md`는 "HITL 배치 승인 + Tier 2-3 문서 투입" 관련 내용.
실제 구현은 REQ-022/025/019 (3-Stage Eval + CC Export + Mock-up UX).
별도 계획서 작성 또는 기존 계획서 현행화 필요.
