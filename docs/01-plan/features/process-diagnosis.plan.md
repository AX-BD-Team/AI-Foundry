# 퇴직연금 프로세스 정밀분석 — Plan Document

> **Summary**: 업로드 문서에서 추출 → 핵심 식별(왜 핵심인가) → 진단(빠짐/중복/삭제 후보) → 조직 간 비교(공통/고유/암묵지/차별요소)의 분석 출력물을 UI에서 의사결정할 수 있도록 구현하는 계획
>
> **Project**: RES AI Foundry
> **Version**: v0.8 (Phase 2-E)
> **Author**: Sinclair Seo
> **Date**: 2026-03-03
> **Status**: Draft
> **Design Doc**: `docs/02-design/features/process-diagnosis.design.md`

---

## 1. Overview

### 1.1 핵심 목표

기존 AI Foundry 파이프라인에 **3-Layer 분석 출력물** + **조직 간 비교** 기능을 추가하여:

- **Layer 1 (추출 요약)**: 무엇을 뽑았는가 — 프로세스/엔티티/규칙 + 중요도 스코어
- **Layer 2 (핵심 식별)**: 무엇이 핵심이고 왜인가 — Core 판정 + 근거
- **Layer 3 (진단 소견)**: 무엇이 빠지고/중복되고/삭제해야 하는가 — finding-evidence-recommendation
- **Cross-Org (조직 비교)**: 공통 표준화 대상 / 조직 고유 / 암묵지 / 핵심 차별 요소

### 1.2 비즈니스 맥락

```
미래에셋 퇴직연금 프로젝트        현대증권 퇴직연금 프로젝트
       │                              │
       └──── AI Foundry 분석 ──────────┘
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
  공통/표준화     조직 고유     암묵지 발견
  (중도인출)   (자동이체)   (긴급인출 규칙)
```

- 복수 SI 프로젝트(미래에셋, 현대증권 등)의 퇴직연금 산출물을 분석
- 공통 모듈 → 표준화하여 재사용 자산으로
- 조직 고유 → 차별 요소로 분리 보존
- 암묵지 → 명문화하여 지식 자산으로 전환

### 1.3 Related Documents

- PRD v0.1: `docs/AI_Foundry_퇴직연금_프로세스_정밀분석_PRD_v0.1.md`
- Design: `docs/02-design/features/process-diagnosis.design.md`

---

## 2. Scope

### 2.1 In Scope

**P0 — 분석 리포트 (단일 문서)**
- [ ] 추출 요약 + 중요도 스코어링 (Layer 1)
- [ ] 핵심 프로세스 판정 + 판정 근거 (Layer 2)
- [ ] 4대 진단: 누락/중복/오버스펙/정합성 위반 (Layer 3)
- [ ] HITL 리뷰: 진단 소견별 수락/거절/수정

**P1 — 조직 간 비교**
- [ ] 서비스 분석 4그룹: 공통 표준 / 조직 고유 / 암묵지 / 핵심 차별
- [ ] 표준화 후보 도출 + 표준화 적합도 점수
- [ ] 암묵지 탐지 (문서 미명시 + 흐름 추론)

**P2 — API + 데이터**
- [ ] 분석 리포트 API 6종 (GET summary/core/findings + POST review)
- [ ] 조직 비교 API 3종 (POST compare + GET groups/standardization)
- [ ] D1 테이블 4종 (analyses, findings, comparisons, comparison_items)
- [ ] Neo4j 확장 노드 6종

### 2.2 Out of Scope

- 프론트엔드 UI 구현 (API + 데이터 모델만, UI는 Phase 3)
- D3.js 시각화 (→ Phase 3)
- 재분석 자동 루프 (→ Phase 3)
- 3+ 조직 동시 비교 (→ Phase 3, 현재 2조직)
- 자동 표준화 프로세스 생성 (→ Phase 4)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | 추출 결과에 importanceScore, isCore, category 부여 | High |
| FR-02 | 핵심 판정 근거를 빈도/의존성/도메인/중심성 4요인으로 분해 | High |
| FR-03 | 4대 진단 소견을 finding-evidence-recommendation 트리플로 구조화 | High |
| FR-04 | 진단 소견에 대한 HITL 리뷰 (accept/reject/modify + comment) | High |
| FR-05 | 2개 조직 분석 결과를 4개 서비스 그룹으로 분류 | High |
| FR-06 | 암묵지 탐지: 문서 미명시 + 흐름 추론 항목 식별 | High |
| FR-07 | 표준화 후보 도출 + 적합도 스코어 (0~1) | Medium |
| FR-08 | 조직별 변형(variant) 차이점 기록 | Medium |
| FR-09 | 프로세스 계층 트리 (Mega→Core→Supporting→Peripheral) | Medium |
| FR-10 | 분석 리포트 API 제공 | Medium |

### 3.2 Non-Functional Requirements

| Category | Criteria |
|----------|----------|
| Performance | 분석 리포트 생성 < 2분/문서 (3-Pass LLM) |
| Accuracy | 핵심 프로세스 식별 ≥ 80%, 진단 소견 유의미율 ≥ 60% |
| Cost | LLM 비용 < $0.40/문서 (Sonnet 기준) |
| Compatibility | 기존 822 tests 무결성 유지 |

---

## 4. Success Criteria

- [ ] 퇴직연금 문서 3건에서 Layer 1+2+3 분석 리포트 생성
- [ ] 핵심 프로세스 5건 이상 식별 + 판정 근거 포함
- [ ] 진단 소견 10건 이상 생성 (4대 유형 각 1건 이상)
- [ ] 2개 조직 비교 시 서비스 그룹 4종 모두 분류 결과 생성
- [ ] 암묵지 3건 이상 탐지
- [ ] 기존 822 tests + 신규 20+ tests 전체 통과

---

## 5. Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM 핵심 판정 품질 불안정 | High | 3-Pass 분리로 각 Pass 독립 검증 + confidence 필터링 |
| 조직 간 이름/의미 매칭 부정확 | High | LLM 유사도 비교 + 수동 매핑 HITL |
| 암묵지 탐지 false positive 과다 | Medium | confidence threshold (0.6+) + HITL 필터링 |
| 추출 결과 빈약 시 분석 불가 | Medium | 최소 프로세스 3건 미만 시 자동 스킵 + 경고 |
| 기존 파이프라인 regression | Low | analysisMode 분기로 기존 경로 격리 |

---

## 6. Architecture Decisions

| Decision | Selected | Rationale |
|----------|----------|-----------|
| 분석 엔진 위치 | svc-extraction 내부 | 추출 결과 직접 접근, Worker 추가 비용 절감 |
| LLM 전략 | 3-Pass 순차 (Scoring → Diagnosis → Comparison) | 단일 프롬프트보다 품질/디버깅 우수 |
| 진단 형식 | finding-evidence-recommendation | HITL UI 재활용, Policy 트리플과 구분 |
| 서비스 그룹 | 4종 (공통/고유/암묵지/차별요소) | 표준화와 차별화 의사결정 모두 지원 |
| Tech Stack | Cloudflare Workers/TS (기존) | Python/FastAPI 대신 기존 인프라 활용 |

---

## 7. Implementation Phases

### Phase 2-E-1: 타입 + 이벤트 (1h)
- `packages/types/src/analysis.ts` — ExtractionSummary, CoreIdentification, CrossOrgComparison
- `packages/types/src/diagnosis.ts` — DiagnosisFinding, DiagnosisResult
- `packages/types/src/events.ts` — 이벤트 2종 추가

### Phase 2-E-2: LLM 프롬프트 (3h)
- Pass 1 프롬프트: 중요도 스코어링 + 핵심 판정
- Pass 2 프롬프트: 4대 진단
- Pass 3 프롬프트: 조직 간 비교 + 서비스 그룹 분류

### Phase 2-E-3: API + 데이터 (3h)
- D1 마이그레이션 4 테이블
- 분석 리포트 API 라우트
- 조직 비교 API 라우트
- Queue handler analysisMode 분기

### Phase 2-E-4: 온톨로지 + HITL (2h)
- Neo4j 확장 노드 6종
- svc-policy 진단 HITL 통합

### Phase 2-E-5: 테스트 + 검증 (2h)
- Unit tests 20+ 케이스
- typecheck + lint + test
- Staging 배포 + 퇴직연금 문서 실증

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-03 | Initial draft — 기술 파이프라인 중심 | Sinclair Seo |
| 0.2 | 2026-03-03 | UI/UX 중심 재설계: 3-Layer + 조직 비교 + 서비스 그룹 | Sinclair Seo |
