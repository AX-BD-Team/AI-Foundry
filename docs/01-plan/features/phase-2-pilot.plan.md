# Phase 2 Pilot — 실제 퇴직연금 문서 투입 파일럿

> **Summary**: Phase 1에서 구축한 5-Stage 파이프라인에 실제 퇴직연금 도메인 문서를 투입하여, 문서→Skill 자산 변환의 End-to-End 품질을 검증하는 파일럿
>
> **Project**: RES AI Foundry
> **Version**: v0.7 (Phase 2)
> **Author**: Sinclair Seo
> **Date**: 2026-03-01
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

Phase 1은 합성 데이터로 파이프라인 "배관"을 검증했다. Phase 2는 **실제 퇴직연금 도메인 문서**를 투입하여:
- 문서 파싱(Unstructured.io)이 실제 PDF/DOCX/Excel에서 동작하는지 검증
- LLM 추출 품질이 도메인 전문가 기대치를 충족하는지 확인
- HITL 워크플로우가 실무 리뷰 시나리오에서 작동하는지 확인
- 최종 .skill.json 산출물의 재사용 가능성을 평가

### 1.2 Background

- Phase 1 완료 상태: 11 Workers 배포, 709 tests, E2E 8/8 PASS (합성 데이터)
- 파일럿 도메인: **퇴직연금** (KT DS SI 프로젝트 경험 기반)
- 합성 데이터 → 실제 데이터 전환 시 발견된 Critical 갭 3건 존재
- PRD §44 Phase 2 요구사항: "실 데이터 투입 + 도메인 전문가 리뷰 + 품질 기준 수립"

### 1.3 Related Documents

- PRD/TDS: `docs/AI_Foundry_PRD_TDS_v0.6.docx` (§44 Phase 2)
- Phase 1 상태: `SPEC.md` (Current Status 섹션)
- 세션 히스토리: `docs/CHANGELOG.md`
- 파이프라인 아키텍처: `CLAUDE.md` (5-Stage Core Engine Pipeline)

---

## 2. Scope

### 2.1 In Scope

- [ ] **P0** Unstructured.io API 연결 — staging/production API 키 설정 + 실제 파싱 검증
- [ ] **P0** 청크 처리량 상향 — 문서당 50→200 청크, LLM 투입 5→20 청크
- [ ] **P0** 퇴직연금 샘플 문서 3~5건 준비 (PDF/DOCX/Excel)
- [ ] **P1** Stage 1→2 queue 자동화 실증 — 실제 문서 업로드 → 자동 파싱 → 자동 추출
- [ ] **P1** Stage 3 정책 추론 품질 검증 — 도메인 전문가 기대치 대비 정확도 측정
- [ ] **P1** HITL 리뷰 워크플로우 시나리오 테스트 (approve/modify/reject)
- [ ] **P1** Stage 4→5 자동화 검증 — 실제 정책으로 온톨로지 + Skill 생성
- [ ] **P2** 추출 품질 메트릭 정의 (precision, recall, domain coverage)
- [ ] **P2** organizationId 하드코딩 해소 — 실제 조직 정보 전파
- [ ] **P2** E2E 테스트 스크립트 확장 — 실제 문서 기반 자동화 테스트 모드

### 2.2 Out of Scope

- 프로덕션 실 데이터 투입 (staging 환경에서만 진행)
- 다중 도메인 확장 (퇴직연금 단일 도메인만)
- Workers AI embedding 구현 (Phase 3으로 이관)
- OpenAPI 어댑터 생성 (Phase 4 예정)
- app-web UI 고도화 (기존 13 화면 그대로 사용)
- 대규모 성능/부하 테스트

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Unstructured.io API 키를 staging/production에 설정하고, 실제 PDF를 파싱하여 구조화된 청크를 반환 | High | Pending |
| FR-02 | 문서당 청크 한도를 50→200으로 상향, LLM 투입 청크를 5→20으로 상향 | High | Pending |
| FR-03 | 퇴직연금 샘플 문서(중도인출, 가입자격, 급여계산) 3건 이상을 Stage 1→5 전 구간 통과 | High | Pending |
| FR-04 | HITL approve 후 Stage 4→5 자동 파이프라인이 실제 정책 데이터로 동작 | High | Pending |
| FR-05 | 추출된 정책의 condition-criteria-outcome 트리플이 퇴직연금 규정에 부합하는지 검증 | High | Pending |
| FR-06 | organizationId를 업로드 시점의 실제 조직 정보에서 전파 | Medium | Pending |
| FR-07 | policy code SEQ 중복 방지 로직 추가 (D1 기반 시퀀스 또는 UUID suffix) | Medium | Pending |
| FR-08 | 추출 품질 리포트 생성 — 문서별 추출 항목 수, 정확도 메트릭 | Medium | Pending |
| FR-09 | E2E 테스트 스크립트에 실제 문서 모드 추가 (--real-doc 플래그) | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 단일 문서(50페이지) Stage 1→2 완료 < 5분 | staging 환경 timer |
| Performance | Stage 3 (Opus) 정책 추론 < 2분/문서 | LLM router cost log |
| Accuracy | 정책 추출 precision ≥ 70% (파일럿 기준) | 도메인 전문가 수동 검증 |
| Accuracy | 용어 추출 coverage ≥ 60% (핵심 도메인 용어) | 사전 정의 용어 리스트 대비 |
| Cost | 문서 1건당 LLM 비용 < $5 (Opus+Sonnet) | AI Gateway 로그 집계 |
| Reliability | 5건 연속 투입 시 파이프라인 실패율 < 20% | E2E 반복 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] Unstructured.io 실제 연동 — PDF/DOCX 파싱이 PARSE_PENDING이 아닌 실제 텍스트 반환
- [ ] 퇴직연금 문서 3건 이상 Stage 1→5 전 구간 통과 (.skill.json 생성)
- [ ] HITL 리뷰 시나리오 3종 (approve/modify/reject) 실제 수행
- [ ] 추출 품질 리포트 1회 이상 작성 (정책 수, 정확도, 누락 항목)
- [ ] 청크 처리량 상향 후 typecheck + lint + 기존 709 tests PASS 유지

### 4.2 Quality Criteria

- [ ] 기존 테스트 709건 전체 통과 (regression 없음)
- [ ] 새로 추가되는 코드 lint error 0건
- [ ] staging 환경에서 E2E 파이프라인 성공률 ≥ 80%
- [ ] 추출된 정책 중 도메인 전문가가 "유의미"로 판정한 비율 ≥ 50%

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Unstructured.io API가 한국어 PDF/한글 문서를 제대로 파싱하지 못함 | High | Medium | 파싱 결과 샘플링 후 Claude Vision 보조 파서 fallback 구현 검토 |
| 청크 상향(200개)으로 D1 쓰기 한도 초과 | Medium | Low | D1 batch insert 사용, 필요 시 chunks를 R2 JSON으로 이관 |
| Opus 정책 추론 비용이 예산 초과 | High | Medium | 복잡도 기반 tiering 강화 — 단순 규정은 Sonnet으로 처리 |
| 실제 문서에 PII/기밀정보 포함 — 외부 API 전송 리스크 | High | High | 기존 svc-security 마스킹 파이프라인 통과 필수, data classification 규칙 적용 |
| 한국어 도메인 용어 regex 추출의 낮은 정확도 | Medium | High | Phase 2 범위 내에서 stopword 리스트 확장 + LLM 보조 용어 추출 검토 |
| Queue 이벤트 유실로 파이프라인 중단 | Medium | Low | svc-queue-router dead letter 로깅, retry 로직 확인 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites | ☐ |
| **Dynamic** | Feature-based modules, BaaS | Web apps, SaaS MVPs | ☐ |
| **Enterprise** | Strict layer separation, microservices | High-traffic, complex architectures | ☑ |

> 기존 Enterprise 레벨 유지. 10 Workers MSA + Cloudflare 전 스택.

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 문서 파싱 | Unstructured.io only / + Claude Vision / + Custom parser | Unstructured.io + Claude Vision fallback | 한국어 PDF 특수 레이아웃 대응 |
| 청크 저장 | D1 only / D1 + R2 hybrid | D1 (상향 200) | 200 이내면 D1 충분, 초과 시 R2 이관 검토 |
| LLM 투입 전략 | 전 청크 / Top-K 청크 / 요약 후 투입 | Top-K (20) + 분류별 샘플링 | 비용/품질 균형 |
| 정책 SEQ | LLM 생성 / D1 시퀀스 / UUID suffix | D1 MAX(seq)+1 | 중복 방지 확실 |
| organizationId | 하드코딩 / 업로드 메타데이터 전파 | 업로드 메타 전파 | pipeline event에 orgId 포함 |

### 6.3 변경 영향 범위

```
변경 대상 서비스:
┌─────────────────────────────────────────────────────┐
│ svc-ingestion   — 청크 한도 상향, Unstructured 설정   │
│ svc-extraction  — LLM 투입 청크 수 상향 (5→20)       │
│ svc-policy      — SEQ 중복 방지, orgId 전파           │
│ svc-ontology    — orgId 전파 (minor)                  │
│ svc-skill       — orgId 전파 (minor)                  │
│ svc-queue-router — orgId 이벤트 필드 전파 (minor)     │
│ packages/types  — PipelineEvent에 orgId 필드 추가    │
└─────────────────────────────────────────────────────┘

변경 없음: svc-llm-router, svc-security, svc-governance,
           svc-notification, svc-analytics, app-web
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` has coding conventions section
- [ ] `docs/01-plan/conventions.md` exists
- [ ] `CONVENTIONS.md` exists at project root
- [x] ESLint configuration (turbo.json + per-service)
- [ ] Prettier configuration
- [x] TypeScript configuration (`tsconfig.base.json` strict)

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **Naming** | exists (CLAUDE.md) | 파일럿 문서 네이밍 규칙 | Medium |
| **Folder structure** | exists | 테스트 문서 저장 경로 (R2 prefix) | Medium |
| **Error handling** | exists | 파싱 실패 시 재시도 정책 | High |
| **Environment variables** | exists | UNSTRUCTURED_API_KEY 추가 | High |

### 7.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `UNSTRUCTURED_API_KEY` | 문서 파싱 API 인증 | svc-ingestion (staging/prod) | ☑ |
| (기존) `ANTHROPIC_API_KEY` | LLM 호출 | svc-llm-router | ✅ 설정 완료 |
| (기존) `NEO4J_URI/USERNAME/PASSWORD/DATABASE` | 그래프 DB | svc-ontology | ✅ 설정 완료 |
| (기존) `INTERNAL_API_SECRET` | 서비스 간 인증 | 전 서비스 | ✅ 설정 완료 |

---

## 8. Implementation Phases

### Phase 2-A: 파이프라인 강화 (코드 변경)

| Step | Task | Service | Effort |
|------|------|---------|--------|
| A-1 | Unstructured.io API 키 설정 (staging/prod) | svc-ingestion | 30min |
| A-2 | 청크 한도 50→200 상향 | svc-ingestion | 1h |
| A-3 | LLM 투입 청크 5→20 상향 + 분류별 샘플링 | svc-extraction | 2h |
| A-4 | organizationId 이벤트 전파 (types → 6 services) | packages/types + 6 svcs | 2h |
| A-5 | policy code SEQ 중복 방지 (D1 시퀀스) | svc-policy | 1h |
| A-6 | typecheck + lint + 기존 테스트 통과 확인 | 전체 | 30min |

### Phase 2-B: 실제 문서 투입 + 검증

| Step | Task | Description | Effort |
|------|------|-------------|--------|
| B-1 | 퇴직연금 샘플 문서 3건 준비 | 중도인출 규정, 가입자격, 급여계산 (PDF/DOCX) | 1h |
| B-2 | Stage 1 실증 — 문서 업로드 → Unstructured 파싱 | staging에서 실제 파싱 결과 확인 | 1h |
| B-3 | Stage 1→2 자동화 실증 — 파싱 → 구조 추출 | queue 자동 연결 검증, 추출 결과 품질 확인 | 1h |
| B-4 | Stage 3 실증 — Opus 정책 추론 + HITL 리뷰 | condition-criteria-outcome 품질, HITL 시나리오 | 2h |
| B-5 | Stage 4→5 자동화 실증 — approve → 온톨로지 → Skill | .skill.json 산출물 검증 | 1h |
| B-6 | 품질 리포트 작성 — 추출 항목 수, 정확도, 누락 분석 | 정량 메트릭 + 정성 피드백 | 2h |

### Phase 2-C: 안정화 + 문서화

| Step | Task | Effort |
|------|------|--------|
| C-1 | E2E 테스트 스크립트 실제 문서 모드 추가 | 1h |
| C-2 | SPEC.md Phase 2 상태 업데이트 | 30min |
| C-3 | CHANGELOG 세션 로그 작성 | 30min |

---

## 9. Next Steps

1. [ ] → Design 문서 작성 (`phase-2-pilot.design.md`) — 코드 변경 상세 설계
2. [ ] 팀 리뷰: 샘플 문서 선정 + 품질 기준 합의
3. [ ] Implementation 시작 (Phase 2-A)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-01 | Initial draft — 코드베이스 탐색 기반 | Sinclair Seo |
