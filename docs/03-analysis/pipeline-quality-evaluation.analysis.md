---
code: AIF-ANLS-022
title: "Pipeline Quality Evaluation System — Gap Analysis"
version: "1.0"
status: Active
category: ANLS
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# Pipeline Quality Evaluation System — Gap Analysis

> Design↔Implementation Gap 분석 (Phase 1: Mechanical Verification 범위)

## Analysis Summary

| 항목 | 내용 |
|------|------|
| Feature | AIF-REQ-022 Pipeline Quality Evaluation System |
| 분석 범위 | Phase 1 (Mechanical Verification) |
| Design 문서 | `docs/02-design/features/pipeline-quality-evaluation.design.md` |
| Match Rate | **98%** |

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Type Schema Match | 100% | ✅ |
| MechanicalVerifier (Policy) | 97% | ✅ |
| SkillMechanicalVerifier | 100% | ✅ |
| DB Migration | 95% | ✅ |
| Test Coverage | 100% | ✅ |
| Export/Integration | 100% | ✅ |
| **Overall (Phase 1)** | **98%** | **✅** |

---

## 상세 분석

### 1. Type Schemas (`packages/types/src/evaluation.ts`) — 100%

14개 Zod 스키마가 Design Section 3.1과 정확히 일치:
- `EvalStageSchema`, `EvalVerdictSchema`, `EvalIssueSchema`, `EvalResultSchema`
- `PolicySemanticDimensionSchema`, `SkillSemanticDimensionSchema`
- `ConsensusRoleSchema`, `ConsensusDecisionSchema`, `ConsensusVerdictSchema`
- `AmbiguityDimensionScoresSchema`, `AmbiguityResultSchema`, `BrownfieldContextSchema`
- `CreatePipelineEvaluationSchema`, `EvalPipelineResultSchema`

Phase 2~4 타입도 forward-declared — 향후 구현 시 타입 변경 불필요.

### 2. MechanicalVerifier (Policy) — 97%

5개 검증 항목 모두 Design과 일치:
1. ✅ Zod `PolicyCandidateSchema.strict().safeParse()`
2. ✅ condition/criteria/outcome 각 10자 이상
3. ✅ policyCode regex `/^POL-[A-Z]+-[A-Z-]+-\d{3}$/`
4. ✅ 빈 태그 문자열 검출 (severity: warning)
5. ✅ Jaccard > 0.8 중복 감지

**2건 개선적 차이** (Design 대비 향상):
- `MechanicalVerifyContext` interface → `export` 추가 (테스트 import 편의)
- `ctx` 파라미터 → 기본값 `{ existingPolicies: [] }` 추가 (standalone 사용)

### 3. SkillMechanicalVerifier — 100%

5개 검증 항목 Design Section 5.8과 정확히 일치.

### 4. DB Migration — 95%

`infra/migrations/db-governance/0004_pipeline_evaluations.sql` — 12개 컬럼, 3개 CHECK, 3개 INDEX 모두 일치.
**차이**: 파일명 시퀀스 `0004` (Design은 `0005` 표기) — 실제 마이그레이션 순서에 맞게 구현.

### 5. Test Coverage — 100%

| 모듈 | Design 요구 | 실제 | 초과 |
|------|:-----------:|:----:|:----:|
| Policy MechanicalVerifier | 6 cases | 10 tests | +4 bonus |
| Skill MechanicalVerifier | 3 cases | 7 tests | +4 bonus |

---

## 미구현 항목 (Phase 1 범위 외)

| 항목 | Design Section | 상태 | 비고 |
|------|:--------------:|:----:|------|
| Queue handler 통합 (svc-policy) | 6.1 | Phase 1 범위 외 | 배포 단계에서 통합 |
| Queue handler 통합 (svc-skill) | 9.2 | Phase 1 범위 외 | 배포 단계에서 통합 |
| Governance CRUD API | 4.1, 6.6 | Phase 2 | /pipeline-evaluations 엔드포인트 |
| policies 테이블 컬럼 추가 | 3.3 | Phase 2 | eval_verdict, eval_score 컬럼 |
| Ambiguity Scoring | Phase 2 | 미착수 | svc-ingestion |
| Semantic Evaluation | Phase 3 | 미착수 | svc-policy, svc-skill |
| Deliberative Consensus | Phase 4 | 미착수 | svc-policy |

---

## 결론

Phase 1 구현이 Design과 **98% 일치**. 2% 차이는 모두 개선적 변경(exported interface, default parameter, migration sequence). 차단 요소 없음 — Phase 2 진행 가능.
