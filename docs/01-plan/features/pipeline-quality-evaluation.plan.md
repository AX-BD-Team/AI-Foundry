---
code: AIF-PLAN-022
title: "Pipeline Quality Evaluation System"
version: "1.0"
status: Draft
category: PLAN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
feature: pipeline-quality-evaluation
---

# Pipeline Quality Evaluation System

> Ouroboros 패턴 기반 3-Stage Evaluation + Ambiguity Scoring + Deliberative Consensus + Brownfield Explorer

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Pipeline Quality Evaluation System (AIF-REQ-022) |
| 현재 | 단일 LLM 추론 → HITL 수동 승인. 기계적 검증 없음, 문서 품질 게이트 없음, 다중 모델 합의 없음 |
| 목표 | 3-Stage Eval (Mechanical → Semantic → Consensus) + Ambiguity Gate + Brownfield Context |
| 소요 세션 | 6~8 세션 (4 Phase) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| Problem | LLM 생성 policy/skill의 품질 검증이 사람(HITL)에게 전적으로 의존 — 리뷰어 부담 과중, 일관성 부재 |
| Solution | 3단계 자동 평가 파이프라인: 무비용 기계 검증 → LLM 시맨틱 평가 → 다중 모델 합의 (Advocate-Devil-Judge) |
| Function UX Effect | Ambiguity Score로 저품질 문서 조기 차단 + Brownfield 맥락으로 중복 감소 + 리뷰어에게 사전 평가 결과 제공 |
| Core Value | 파이프라인 출력물의 신뢰도를 정량적으로 측정·개선하여 AI Skill 자산의 품질 보증 체계 확립 |

---

## Overview

### Purpose

AI Foundry의 5-Stage 파이프라인은 문서에서 policy와 skill을 추출하지만, 현재 품질 검증은 Stage 3 HITL 수동 리뷰에만 의존한다. 이 시스템은 Ouroboros 패턴을 적용하여 자동화된 다층 품질 평가 체계를 구축한다.

### Background

**현재 흐름**:
```
Document → Ingestion → Extraction → Policy Inference (Opus) → HITL Review → Skill Packaging
                                                                    ↑
                                                        사람이 전부 판단
```

**목표 흐름**:
```
Document → [Ambiguity Gate] → Ingestion → [Brownfield Context] → Extraction
    → Policy Inference → [3-Stage Eval] → HITL Review (사전 평가 결과 제공)
    → Skill Packaging → [3-Stage Eval]
```

**Ouroboros 영감**: `Q00/ouroboros` 프로젝트의 핵심 패턴:
- **3-Stage Evaluation**: 비용 최적화 — 기계 검증($0) → 시맨틱(Sonnet) → 합의(Opus)
- **Deliberative Consensus**: Advocate-Devil-Judge 3자 토론 → 분할 투표 시 2라운드
- **Ambiguity Scoring**: 문서 명확도 정량 측정 → 임계값 미달 시 조기 반려

---

## 현황 분석

### 현재 품질 검증 현황

| 파이프라인 단계 | 현재 검증 방식 | 문제점 |
|----------------|---------------|--------|
| Stage 1 (Ingestion) | 파일 포맷 검증 + 분류 (confidence score) | 문서 내용 품질 미검사 — 모호한 문서도 통과 |
| Stage 2 (Extraction) | 없음 | 추출 결과 정합성 미확인 |
| Stage 3 (Policy) | HITL DO 세션 (approve/reject/modify) | 리뷰어가 원문 대조, 구조 검증, 의미 판단 모두 수행 |
| Stage 4 (Ontology) | 없음 | 용어 중복/충돌 미감지 |
| Stage 5 (Skill) | `aggregateTrust()` (policy score 평균) | 개별 skill 품질 미평가 |

### 기존 인프라 활용 가능 영역

| 기존 모듈 | 위치 | 활용 방법 |
|----------|------|----------|
| `classifier.ts` | `svc-ingestion/src/parsing/classifier.ts` | Ambiguity Score 계산 hook 추가 |
| `HitlSession` DO | `svc-policy/src/hitl-session.ts` | Consensus 결과를 session metadata로 주입 |
| `quality-evaluations` | `svc-governance/src/routes/quality-evaluations.ts` | 3-Stage Eval 결과 저장소 |
| `trust` | `svc-governance/src/routes/trust.ts` | Eval 결과 → trust score 연동 |
| `skill-builder.ts` | `svc-skill/src/assembler/skill-builder.ts` | Skill eval 결과 반영 |
| `callOpusLlm()` | `svc-policy/src/llm/caller.ts` | Consensus deliberation LLM 호출 |
| `svc-llm-router` | `services/svc-llm-router/` | 모든 LLM 호출 경유 (tier routing) |

---

## Implementation Plan

### Phase 1: Mechanical Verification (1~2 세션)

> 비용: $0 (LLM 호출 없음). Policy candidate와 Skill package의 구조적 정합성 기계 검증.

#### 1-1. Policy Mechanical Verifier

- [ ] `services/svc-policy/src/eval/mechanical.ts` — MechanicalVerifier 클래스
  - Zod 스키마 재검증 (PolicyCandidateSchema strict parse)
  - 필수 필드 존재 및 비어있지 않은지 확인 (condition, criteria, outcome 각 10자 이상)
  - policyCode 형식 검증 (`POL-{DOMAIN}-{TYPE}-{SEQ}` 정규식)
  - 중복 검출: 동일 org 내 기존 policy와 제목/condition Jaccard 유사도 > 0.8 → 중복 플래그
  - tags 배열 유효성 (빈 배열 허용, 빈 문자열 불허)
- [ ] `services/svc-policy/src/eval/mechanical.test.ts` — 단위 테스트
- [ ] `svc-policy/src/queue/handler.ts` 수정 — LLM 추론 후, D1 저장 전에 mechanical verification 삽입

**API 연동**: 검증 실패 시 `quality_evaluations` 테이블에 기록 (evaluator: `mechanical`, dimension: `structural_validity`)

#### 1-2. Skill Mechanical Verifier

- [ ] `services/svc-skill/src/eval/mechanical.ts` — SkillMechanicalVerifier
  - SkillPackageSchema strict parse
  - policies 배열 비어있지 않은지 확인
  - 모든 policy의 trust level이 `reviewed` 이상인지 검증
  - ontologyRef 유효성 (termCount > 0)
  - metadata 완전성 (domain, version, author 필수)
- [ ] `services/svc-skill/src/eval/mechanical.test.ts`
- [ ] `svc-skill/src/queue/handler.ts` 수정 — skill build 전 mechanical check

#### 1-3. Evaluation Result Schema

- [ ] `packages/types/src/evaluation.ts` — 공통 평가 결과 타입
  ```typescript
  EvalStage: 'mechanical' | 'semantic' | 'consensus'
  EvalResult: { stage, pass, score, issues[], evaluator, timestamp }
  EvalVerdict: 'pass' | 'fail' | 'needs_review'
  ```
- [ ] DB 마이그레이션: `svc-governance` — `pipeline_evaluations` 테이블 (eval_id, target_type, target_id, stage, pass, score, issues_json, evaluator, org_id, created_at)

### Phase 2: Ambiguity Scoring + Brownfield Explorer (1~2 세션)

> 파이프라인 입구(Stage 1)에서 저품질 문서를 걸러내고, 기존 데이터 맥락을 제공.

#### 2-1. Ambiguity Score Calculator

- [ ] `services/svc-ingestion/src/eval/ambiguity.ts` — AmbiguityScorer
  - **Score 공식**: `ambiguity = 1 - Σ(clarity_dimension × weight)`
  - 3 Dimensions:
    - **Goal Clarity (40%)**: 문서에 명시적 목적/목표 기술 존재 여부. 키워드 density 기반 (목적, 목표, 개요, 배경, purpose, objective)
    - **Constraint Clarity (30%)**: 조건/제약 사항 명시 여부. 조건문 패턴 (IF/WHEN/~인 경우/~할 때) 빈도
    - **Success Criteria (30%)**: 정량적 기준/임계값 존재 여부. 숫자 + 단위 패턴 (N일, N%, N원, N건)
  - 각 dimension score: 0.0 (완전 불명확) ~ 1.0 (완전 명확)
  - **판정**: ambiguity > 0.2 → 반려 (ingestion 거부), 반려 시 부족한 dimension 피드백 제공
- [ ] `services/svc-ingestion/src/eval/ambiguity.test.ts`
- [ ] `svc-ingestion/src/queue.ts` 수정 — 파싱 완료 후, chunks INSERT 전에 ambiguity check 삽입
  - 반려 시 document status → `rejected_ambiguous`, error_message에 상세 피드백

#### 2-2. Brownfield Explorer

- [ ] `services/svc-ingestion/src/eval/brownfield.ts` — BrownfieldExplorer
  - **목적**: 새 문서 ingestion 시, 해당 org의 기존 policy/ontology/term 데이터를 스캔하여 downstream stage에 맥락 제공
  - D1 조회: `db-policy`에서 org별 기존 policy code/title/domain 목록
  - D1 조회: `db-ontology`에서 org별 기존 term name/definition 목록
  - 출력: `BrownfieldContext { existingPolicyCodes[], existingTerms[], domainDistribution }`
  - 이 맥락을 `ingestion.completed` 이벤트의 payload에 `brownfieldContext` 필드로 추가
- [ ] `services/svc-ingestion/src/eval/brownfield.test.ts`
- [ ] `@ai-foundry/types` — `IngestionCompletedEvent` payload에 `brownfieldContext` optional 필드 추가
- [ ] `svc-policy/src/queue/handler.ts` — brownfieldContext를 받으면 policy inference 프롬프트에 "기존 정책 참조" 섹션 추가 (중복 생성 방지)

### Phase 3: Semantic Evaluation (1~2 세션)

> Sonnet 티어 LLM으로 추출물의 의미적 품질을 평가. 비용: Sonnet 기준 ~$0.05/policy.

#### 3-1. Policy Semantic Evaluator

- [ ] `services/svc-policy/src/eval/semantic.ts` — SemanticEvaluator
  - svc-llm-router 경유 Sonnet 호출 (tier: 2, callerService: `svc-policy`)
  - 평가 프롬프트: policy의 condition-criteria-outcome 트리플을 받아 5개 dimension 채점
    - **Specificity** (0~1): 조건과 기준이 구체적인가? (모호한 표현 감지)
    - **Consistency** (0~1): condition ↔ criteria ↔ outcome 논리적 일관성
    - **Completeness** (0~1): 필요한 경계 조건/예외 사항이 누락되지 않았는가?
    - **Actionability** (0~1): outcome이 실행 가능한 구체적 행동인가?
    - **Traceability** (0~1): sourceExcerpt/sourcePageRef로 원문 추적 가능한가?
  - 총점: 5개 dimension 가중 평균 (Specificity 25%, Consistency 25%, Completeness 20%, Actionability 20%, Traceability 10%)
  - **판정**: score < 0.5 → fail, 0.5~0.7 → needs_review, > 0.7 → pass
- [ ] `services/svc-policy/src/eval/semantic.test.ts`
- [ ] 평가 프롬프트 모듈: `services/svc-policy/src/prompts/semantic-eval.ts`

#### 3-2. Skill Semantic Evaluator

- [ ] `services/svc-skill/src/eval/semantic.ts` — SkillSemanticEvaluator
  - Sonnet 호출로 skill package 전체 평가
  - 평가 dimension:
    - **Coverage** (0~1): 도메인 내 주요 비즈니스 규칙이 충분히 포함되었는가?
    - **Coherence** (0~1): policies 간 상호 모순이 없는가?
    - **Granularity** (0~1): policy 단위가 적절한가? (너무 넓거나 좁지 않은가)
  - **판정**: 동일 기준 (< 0.5 fail, 0.5~0.7 needs_review, > 0.7 pass)
- [ ] `services/svc-skill/src/eval/semantic.test.ts`

#### 3-3. Evaluation Pipeline Integration

- [ ] `svc-policy/src/queue/handler.ts` — Phase 1 mechanical pass 후 semantic evaluation 순차 실행
- [ ] `svc-skill/src/queue/handler.ts` — 동일 순차 적용
- [ ] 결과를 `svc-governance` `/quality-evaluations` API로 POST (dimension별 개별 기록)
- [ ] HITL 세션 생성 시 evaluation 결과를 metadata로 첨부 → 리뷰어에게 사전 정보 제공

### Phase 4: Deliberative Consensus (2 세션)

> Opus 티어 다중 모델 합의 — HITL 리뷰 보조. 가장 비용이 높은 단계이므로 needs_review 판정 건에만 적용.

#### 4-1. Consensus Engine

- [ ] `services/svc-policy/src/eval/consensus.ts` — ConsensusEngine
  - **트리거 조건**: semantic evaluation verdict가 `needs_review`인 policy에만 적용
  - **Round 1 — 3자 토론**:
    - **Advocate** (Opus): "이 policy가 타당한 이유를 옹호하라"
    - **Devil** (Opus): "이 policy의 문제점, 모순, 누락을 지적하라"
    - **Judge** (Opus): Advocate와 Devil의 논거를 종합하여 판정
    - 각 역할의 프롬프트를 순차 호출 (3 × Opus 호출)
    - Judge 판정: `approve` / `reject` / `split` + reasoning
  - **Round 2 — Split 시 심화 질의** (Judge가 split 판정한 경우만):
    - 추가 질문: "이 policy는 root cause인가, symptom인가?"
    - "이 policy 없이도 outcome이 다른 규칙으로 보장되는가?"
    - Judge 최종 판정 (2 × Opus 추가)
  - **출력**: `ConsensusVerdict { finalDecision, advocateArgs, devilArgs, judgeReasoning, rounds }`
- [ ] `services/svc-policy/src/eval/consensus.test.ts`
- [ ] 프롬프트 모듈: `services/svc-policy/src/prompts/consensus.ts` — Advocate/Devil/Judge 역할별 system prompt

#### 4-2. HITL Session Integration

- [ ] `svc-policy/src/hitl-session.ts` — HitlSession DO에 consensus 결과 저장 (optional metadata)
- [ ] HITL 리뷰 UI에 consensus 결과 표시 (Advocate 논거, Devil 반론, Judge 판정)
- [ ] `svc-governance/src/routes/trust.ts` — consensus 결과를 trust evaluation에 반영
  - approve → trust_level `reviewed`, score +0.3
  - reject → trust_level `unreviewed`, score -0.2
  - needs_review (no consensus) → 기존 점수 유지, 리뷰어 판단에 위임

#### 4-3. Cost Optimization

- [ ] Consensus는 `needs_review` 판정 건에만 적용 (전체의 ~20% 예상)
- [ ] Round 2는 Round 1 split 시에만 (전체의 ~5% 예상)
- [ ] 예상 비용: policy당 ~$0.15 (Opus 3호출) + Round 2 시 ~$0.10 추가
- [ ] svc-governance cost 모듈에 consensus 비용 추적 항목 추가

---

## Architecture

### 영향 범위

| 서비스 | 변경 사항 | 신규 파일 |
|--------|----------|----------|
| **svc-ingestion** (SVC-01) | queue.ts 수정 (ambiguity gate + brownfield) | `src/eval/ambiguity.ts`, `src/eval/brownfield.ts` |
| **svc-policy** (SVC-03) | queue/handler.ts 수정 (3-stage eval 삽입) | `src/eval/mechanical.ts`, `src/eval/semantic.ts`, `src/eval/consensus.ts`, `src/prompts/semantic-eval.ts`, `src/prompts/consensus.ts` |
| **svc-skill** (SVC-05) | queue/handler.ts 수정 (mechanical + semantic eval) | `src/eval/mechanical.ts`, `src/eval/semantic.ts` |
| **svc-governance** (SVC-08) | 새 마이그레이션 (pipeline_evaluations 테이블) | 마이그레이션 SQL |
| **@ai-foundry/types** | EvalResult, BrownfieldContext 타입 추가 | `src/evaluation.ts` |

### 데이터 흐름

```
Document Upload
    │
    ▼
┌─────────────────────────────┐
│ SVC-01: Ingestion           │
│                             │
│ ① Ambiguity Scoring         │  ambiguity > 0.2 → rejected_ambiguous
│    (Goal 40% + Constraint   │
│     30% + Criteria 30%)     │
│                             │
│ ② Brownfield Explorer       │  기존 policy/term 맥락 스캔
│    (D1: db-policy, db-onto) │
│                             │
│ → ingestion.completed       │  payload += brownfieldContext
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ SVC-03: Policy Inference    │
│                             │
│ Opus LLM → Policy Candidates│
│                             │
│ ③ Mechanical Verification   │  $0 — 구조/형식/중복 체크
│    ↓ pass                   │
│ ④ Semantic Evaluation       │  Sonnet — 5-dimension 채점
│    ↓ pass/needs_review      │
│ ⑤ Deliberative Consensus    │  Opus — needs_review만
│    (Advocate-Devil-Judge)    │
│                             │
│ → HITL Session 생성          │  eval 결과 metadata 첨부
└─────────────┬───────────────┘
              │ (HITL 승인 후)
              ▼
┌─────────────────────────────┐
│ SVC-05: Skill Packaging     │
│                             │
│ ⑥ Mechanical Verification   │  $0 — 스키마/trust/완전성
│    ↓ pass                   │
│ ⑦ Semantic Evaluation       │  Sonnet — coverage/coherence
│                             │
│ → .skill.json 패키징         │
└─────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│ SVC-08: Governance          │
│                             │
│ pipeline_evaluations 저장    │  모든 eval 결과 집계
│ trust_evaluations 연동       │  trust score 자동 반영
│ quality dashboard 노출       │
└─────────────────────────────┘
```

### LLM Tier 사용

| Evaluation Stage | LLM Tier | 모델 | 예상 비용/건 |
|-----------------|---------|------|:----------:|
| Mechanical | 없음 | — | $0 |
| Ambiguity Score | 없음 (규칙 기반) | — | $0 |
| Semantic Eval | Tier 2 | Sonnet | ~$0.05 |
| Consensus Round 1 | Tier 1 | Opus | ~$0.15 |
| Consensus Round 2 | Tier 1 | Opus | ~$0.10 |

---

## Risk & Mitigation

| 항목 | 리스크 | 대응 |
|------|--------|------|
| LLM 비용 증가 | Semantic + Consensus로 policy당 $0.20~0.25 추가 | Mechanical에서 30%+ 걸러내고, Consensus는 needs_review만 적용 |
| Ambiguity Score 오탐 | 정상 문서를 모호하다고 반려 | 초기 threshold 0.2를 보수적으로 설정, 파일럿 후 조정. 반려 시 상세 피드백으로 재업로드 유도 |
| Consensus 지연 | Opus 3~5회 순차 호출로 응답 시간 증가 (15~30초) | 비동기 처리 (Queue 기반). HITL 세션 생성과 병렬 실행 → 결과 도착 시 metadata 업데이트 |
| Brownfield DB 부하 | org별 전체 policy/term 스캔 | 결과 캐싱 (KV, TTL 1h). org당 최근 N건만 조회 (LIMIT 500) |
| 프롬프트 품질 | Advocate/Devil/Judge 프롬프트가 의미 있는 토론을 못 할 수 있음 | Golden Test Set 기반 프롬프트 튜닝. 실제 HITL 결과와 consensus 결과 비교 분석 |
| 기존 파이프라인 성능 | Eval 단계 추가로 전체 처리 시간 증가 | Mechanical은 <100ms, Semantic/Consensus는 비동기. 기존 흐름은 blocking하지 않음 |

---

## Success Criteria

| 지표 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|:-------:|:-------:|:-------:|:-------:|
| Mechanical 검증 구현 | Policy + Skill | - | - | - |
| Mechanical 필터링률 | 10%+ | - | - | - |
| Ambiguity Gate 구현 | - | 3-dimension scorer | - | - |
| Ambiguity 반려 정확도 | - | 90%+ (오탐 < 10%) | - | - |
| Brownfield 맥락 제공 | - | 기존 policy/term 목록 | - | - |
| Semantic Eval 구현 | - | - | 5-dim (policy) + 3-dim (skill) | - |
| Semantic Eval ↔ HITL 일치율 | - | - | 70%+ | - |
| Consensus 구현 | - | - | - | Advocate-Devil-Judge |
| Consensus ↔ HITL 일치율 | - | - | - | 80%+ |
| 리뷰어 시간 절감 | - | - | - | 40%+ |

### 파일럿 검증 계획

- **대상**: LPON 온누리상품권 기존 848 approved policies
- **방법**: 기존 approved policy를 3-Stage Eval에 통과시켜 자동 판정과 사람 판정 비교
- **기준**: Eval pass ↔ HITL approve 일치율 70% 이상이면 Phase 3→4 진행

---

## 관련 문서

- [[AIF-REQ-022]] Pipeline Quality Evaluation System
- [[AIF-REQ-019]] Working Mock-up 사이트
- Ouroboros: `https://github.com/Q00/ouroboros` (Advocate-Devil-Judge 패턴 원본)
- SPEC.md §7 Requirements Backlog
