# AI Foundry — 퇴직연금 도메인 프로세스 정밀 분석 시스템

## Product Requirements Document (PRD)

Version: v0.2
작성일: 2026-03-03
상위 문서: `docs/AI_Foundry_PRD_TDS_v0.6.docx` (AI Foundry 원본 PRD)
설계 문서: `docs/02-design/features/process-diagnosis.design.md`

---

# 1. Project Overview

## 1.1 배경

KT DS AX BD팀은 다수의 퇴직연금 SI 프로젝트(미래에셋, 현대증권, 한화투자증권 등)를 수행해 왔다. 각 프로젝트의 산출물(요구사항정의서, 프로세스정의서, ERD, API정의서, 화면설계서 등)은 엑셀, PPT, PDF, DOCX 등 다양한 포맷으로 분산되어 있으며, 프로젝트마다 독립적으로 관리된다.

이 산출물에는 다음과 같은 **숨겨진 가치**가 있다:

- **공통 모듈**: 퇴직연금 도메인의 표준 프로세스(가입, 중도인출, 급여계산 등)가 프로젝트마다 반복 구현됨
- **조직 고유 정책**: 미래에셋만의 자동이체 프로세스, 현대증권만의 위험등급 재평가 등 차별 요소
- **암묵지**: 문서에 명시되지 않았지만 실제 운영에서 적용되는 규칙과 로직
- **표준화 기회**: 공통 모듈을 식별하여 재사용 자산으로 전환할 수 있는 기회

그러나 현재는 이러한 가치를 **체계적으로 추출하고 비교할 수단이 없다**.

## 1.2 AI Foundry 연계

이 시스템은 AI Foundry(v0.6) 플랫폼의 **확장 기능**으로 구현한다:

- AI Foundry의 5-Stage 파이프라인(Ingestion→Extraction→Policy→Ontology→Skill)을 그대로 재활용
- Stage 2(Extraction) 이후에 **분석 레이어(Scoring→Diagnosis→Comparison)**를 추가
- 기존 HITL 워크플로우를 진단 소견 리뷰에도 활용
- 기존 Cloudflare Workers/TS 인프라 위에 구축 (별도 스택 불필요)

---

# 2. Problem Statement

## 2.1 핵심 문제

| # | 문제 | 영향 |
|---|------|------|
| P1 | 설계 문서가 포맷별/프로젝트별로 분산 | 전체 그림을 파악할 수 없음 |
| P2 | 핵심 프로세스와 메가 프로세스의 구분이 불명확 | 어디에 집중해야 하는지 판단 불가 |
| P3 | 프로젝트 간 공통/고유 모듈 식별이 수작업 | 표준화 기회를 놓침 |
| P4 | 암묵지가 문서에 기록되지 않음 | 담당자 이탈 시 지식 소실 |
| P5 | 누락/중복/과잉 스펙의 체계적 탐지 수단 부재 | 품질 이슈가 후공정에서 발견 |
| P6 | 프로세스-데이터-요구사항 간 정합성 검증 불가 | 설계 결함이 구현까지 전파 |

## 2.2 해결 방향

```
문서 업로드 → 자동 추출 → 핵심 식별(왜 핵심인가) → 진단(빠짐/중복/삭제 후보)
    → 조직 간 비교(공통/고유/암묵지/차별요소) → HITL 검증 → 개선 루프
```

---

# 3. Product Goal

## 3.1 1차 목표 — 분석 출력물 기반 의사결정

UI에서 **의사결정 가능한 분석 출력물**을 제공한다:

1. **추출 요약**: 업로드 문서에서 무엇을 추출했는가 (프로세스/엔티티/규칙/관계 + 중요도 스코어)
2. **핵심 식별**: 무엇이 핵심이고, 왜 핵심인가 (판정 근거: 빈도/의존성/도메인 중요도/데이터 흐름 중심성)
3. **진단 소견**: 무엇이 빠져있고(누락), 겹치고(중복), 불필요하고(오버스펙), 어긋나는가(정합성 위반)
4. **조직 비교**: 프로젝트 간 공통/고유 모듈 식별, 표준화 후보, 암묵지 탐지

## 3.2 2차 목표 — 지식 자산화

분석 결과를 재사용 가능한 자산으로 패키징:

- 공통 표준 프로세스 → 표준 Skill 자산
- 조직 고유 프로세스 → 고유 Skill 자산 (차별 요소 보존)
- 암묵지 → 명문화된 정책(Policy)으로 전환
- 핵심 차별 요소 → 영업/제안 시 활용 자산

---

# 4. Scope

## 4.1 In Scope (Phase 2-E)

**분석 리포트 (단일 조직)**
- 파일 업로드: xlsx, pptx, pdf, docx (기존 AI Foundry Stage 1)
- 구조 추출 + 중요도 스코어링 (Layer 1)
- 핵심 프로세스 판정 + 판정 근거 생성 (Layer 2)
- 4대 진단: 누락/중복/오버스펙/정합성 위반 (Layer 3)
- 진단 소견별 HITL 리뷰 (accept/reject/modify)

**조직 간 비교**
- 서비스 분석 4그룹 분류: 공통 표준 / 조직 고유 / 암묵지 / 핵심 차별 요소
- 표준화 후보 도출 + 적합도 점수
- 암묵지 탐지 (문서 미명시 + 흐름 추론)
- 조직별 변형(variant) 차이점 기록

**API**
- 분석 리포트 API 6종
- 조직 비교 API 3종

## 4.2 Out of Scope (1차 릴리즈)

- 프론트엔드 UI 구현 (API + 데이터 모델만, UI는 Phase 3)
- D3.js 프로세스 시각화 (Phase 3)
- 재분석 자동 루프 (Phase 3)
- 3개 이상 조직 동시 비교 (Phase 3)
- 자동 표준 프로세스 생성 (Phase 4)
- 코드 자동 생성 연계 (Phase 4)
- 외부 시스템 실시간 연동 (Phase 4)

---

# 5. Functional Requirements

## 5.1 Layer 1 — 추출 요약 (Extraction Summary)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-101 | 문서에서 추출된 프로세스, 엔티티, 규칙, 관계의 전체 목록 제공 | High |
| FR-102 | 각 프로세스에 중요도 스코어(0~1) 부여 + 스코어 근거 텍스트 | High |
| FR-103 | 각 엔티티의 사용 횟수(usageCount) + 고립 여부(isOrphan) 표시 | Medium |
| FR-104 | 문서 분류 정보 표시 (screen_design, api_spec, erd, requirements, process) | Medium |

**사용자 경험**: Analyst가 업로드 후 "이 문서에서 프로세스 47건, 엔티티 82건이 추출되었고, 가장 중요한 것은 '중도인출 프로세스'(score: 0.92)입니다" 형태로 즉시 확인.

## 5.2 Layer 2 — 핵심 프로세스 식별 (Core Identification)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-201 | 각 프로세스를 4단계로 분류: Mega / Core / Supporting / Peripheral | High |
| FR-202 | 핵심 판정 근거를 4요인으로 분해: 빈도(frequency), 의존성(dependency), 도메인 관련도(domainRelevance), 데이터 흐름 중심성(dataFlowCentrality) | High |
| FR-203 | 판정 이유를 자연어 서술로 제공 (e.g., "6개 문서에서 참조되고, 12개 규칙이 연관된 핵심 프로세스") | High |
| FR-204 | 프로세스 계층 트리 구성: Process → SubProcess → Method + 각 메서드의 트리거 조건 | Medium |
| FR-205 | 각 프로세스의 Actor(수행 역할/시스템), DataInput/DataOutput 표시 | Medium |
| FR-206 | 요구사항-프로세스 매핑 (어떤 요구사항이 어떤 프로세스에 의해 충족되는가) | Medium |

**사용자 경험**: Reviewer가 "이 프로세스가 왜 핵심이지?" 질문에 4요인 근거 + 자연어 설명으로 답변. 프로세스 트리에서 Mega→Core→Supporting 계층을 시각적으로 확인.

## 5.3 Layer 3 — 진단 소견 (Diagnosis Findings)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-301 | **누락 탐지**: 있어야 하는데 없는 프로세스/엔티티/규칙 식별 | High |
| FR-302 | **중복 탐지**: 이름이 다르지만 동일 기능의 프로세스, 동일 조건-결과의 규칙 | High |
| FR-303 | **오버스펙 탐지**: 참조되지 않는 고립 엔티티, 관계 없는 독립 프로세스 | High |
| FR-304 | **정합성 위반**: 문서 간 불일치 (프로세스정의서 vs 화면설계서 vs API정의서) | High |
| FR-305 | 각 소견을 **finding-evidence-recommendation 트리플**로 구조화 | High |
| FR-306 | 소견별 severity 분류: critical / warning / info | High |
| FR-307 | 소견별 confidence 점수(0~1): LLM 자체 신뢰도 평가 | Medium |
| FR-308 | 소견별 관련 프로세스/엔티티/문서 연결 | Medium |

**진단 소견 형식** (UI 카드에 표시):
```
[Critical] 누락 — 중도인출 프로세스에 퇴직급여 산정 단계 누락
  근거: 프로세스정의서 §3.2에 명시된 단계가 화면설계서 SC-045에 없음
  제안: 화면 SC-045에 퇴직급여 산정 단계를 추가하세요
  관련: 중도인출 프로세스, 퇴직급여 엔티티
  신뢰도: 0.87
```

## 5.4 HITL 리뷰

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-401 | 진단 소견별 리뷰 액션: accept(수락) / reject(거절) / modify(수정) | High |
| FR-402 | 리뷰 시 코멘트 입력 가능 | High |
| FR-403 | 리뷰어 ID + 리뷰 시각 기록 | High |
| FR-404 | severity=critical 소견은 반드시 리뷰 필수 (스킵 불가) | Medium |
| FR-405 | 리뷰 완료 후 통계: 수락률, 거절률, 수정률 | Medium |

## 5.5 조직 간 비교 (Cross-Organization Comparison)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-501 | 2개 조직의 분석 결과를 비교하여 **서비스 분석 4그룹**으로 분류 | High |
| FR-502 | **공통/표준(common_standard)**: 복수 조직에 존재하는 프로세스/정책 → 표준화 후보 | High |
| FR-503 | **조직 고유(org_specific)**: 한 조직에만 존재하는 프로세스/정책 | High |
| FR-504 | **암묵지(tacit_knowledge)**: 문서에 명시되지 않았지만 흐름에서 추론된 로직 | High |
| FR-505 | **핵심 차별(core_differentiator)**: 해당 조직의 경쟁 우위 요소 | High |
| FR-506 | 표준화 후보에 적합도 점수(0~1) 부여 + 조직별 변형 차이점 기록 | Medium |
| FR-507 | 각 분류에 판정 근거 텍스트 제공 | Medium |

**서비스 분석 4그룹 예시**:

```
미래에셋 퇴직연금  ←→  현대증권 퇴직연금 비교 결과:

🟢 공통/표준 (12건)
   • 중도인출 프로세스 — 표준화 적합도 0.92
     "두 조직 모두 5단계 프로세스. 미래에셋은 승인 권한이 팀장급, 현대는 부서장급 차이"
   • 가입자격 확인 — 표준화 적합도 0.88

🔵 조직 고유 (8건)
   • [미래에셋] 퇴직연금 자동이체 프로세스
   • [현대증권] 위험등급 재평가 프로세스

🟡 암묵지 (5건)
   • [미래에셋] 긴급인출 승인 규칙 — 화면 흐름에서 추론, 문서에 미명시
   • [현대증권] 연기금 배분 로직 — 데이터 흐름에서 추론, 정의서에 없음

🔴 핵심 차별 (3건)
   • [현대증권] 위험등급 재평가 — 실시간 시장데이터 연동, 업계 최초
```

## 5.6 암묵지 탐지

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-601 | 화면 흐름에서 중간 단계가 생략된 경우 탐지 (e.g., 신청→완료 사이 승인 누락) | High |
| FR-602 | 데이터 흐름에서 생산자 없는 소비 데이터 탐지 (e.g., "위험등급" 사용하지만 산출처 미정의) | High |
| FR-603 | 규칙이 참조하는 프로세스가 프로세스 정의에 없는 경우 탐지 | Medium |
| FR-604 | 업계 표준에서 기대되는 프로세스가 문서에 전혀 없는 경우 탐지 | Medium |
| FR-605 | 암묵지 항목에 추론 근거(tacitKnowledgeEvidence) + 신뢰도 점수 포함 | Medium |
| FR-606 | 암묵지 → 명문화 제안 (recommendation) 자동 생성 | Low |

---

# 6. 분석 출력물 구조

## 6.1 3-Layer 분석 모델

UI에서 직접 소비하는 분석 출력물의 계층 구조:

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Extraction Summary (추출 요약)                  │
│  ─ 프로세스 목록 + 중요도 스코어                           │
│  ─ 엔티티 목록 + 사용 빈도                                │
│  ─ 규칙 목록 + 관련 프로세스                               │
│  ─ 수치 요약 (건수, 분류별)                                │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Core Identification (핵심 식별)                 │
│  ─ Core Process 목록 + 4요인 판정 근거                    │
│  ─ 프로세스 계층 트리 (Mega→Core→Supporting→Peripheral)   │
│  ─ 데이터 흐름 맵                                         │
│  ─ 요구사항-프로세스 매핑                                  │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Diagnosis (진단 소견)                           │
│  ─ finding-evidence-recommendation 트리플 목록            │
│  ─ severity / confidence 분류                            │
│  ─ HITL 리뷰 상태                                        │
└─────────────────────────────────────────────────────────┘
```

## 6.2 조직 비교 모델

```
┌─────────────────────────────────────────────────────────┐
│  Cross-Org Comparison (조직 간 비교)                      │
│  ─ 🟢 공통/표준: 표준화 후보 + 적합도 점수 + 변형 차이     │
│  ─ 🔵 조직 고유: 해당 조직에만 존재하는 항목               │
│  ─ 🟡 암묵지: 문서 미명시 + 흐름 추론 항목                 │
│  ─ 🔴 핵심 차별: 경쟁 우위 요소                           │
│  ─ 그룹별 통계 + 판정 근거                                │
└─────────────────────────────────────────────────────────┘
```

---

# 7. Ontology Design

## 7.1 핵심 개념 (기존 AI Foundry 12종 + 확장 6종)

**기존 (변경 없음)**: Domain, Process, Policy, Entity, Attribute, Screen, API, Document, Term, Skill, Organization, Reviewer

**확장 (신규 6종)**:

| 개념 | 설명 | 관계 |
|------|------|------|
| SubProcess | 프로세스 하위 단계 | `(Process)-[:HAS_SUBPROCESS]->(SubProcess)` |
| Method | 프로세스 내 메서드/기능 | `(Process)-[:HAS_METHOD]->(Method)` |
| Condition | 메서드 트리거 조건 | `(Method)-[:TRIGGERED_BY]->(Condition)` |
| Actor | 수행 역할/시스템 | `(Actor)-[:PARTICIPATES_IN]->(Process)` |
| Requirement | 요구사항 | `(Requirement)-[:SATISFIED_BY]->(Process)` |
| DiagnosisFinding | 진단 소견 | `(DiagnosisFinding)-[:RELATES_TO]->(Process\|Entity)` |

## 7.2 데이터 흐름 관계

```
(Process)-[:CONSUMES]->(Entity)     // 프로세스가 소비하는 데이터
(Process)-[:PRODUCES]->(Entity)     // 프로세스가 생산하는 데이터
(Requirement)-[:VERIFIED_BY]->(Method)  // 요구사항 검증 메서드
(Condition)-[:EVALUATED_BY]->(Actor)    // 조건 평가 주체
```

---

# 8. System Architecture

## 8.1 기존 AI Foundry 파이프라인 위 확장

```
[기존 5-Stage 파이프라인]
Stage 1: Document Ingestion (Unstructured.io + Claude Vision)
Stage 2: Structure Extraction (Claude Sonnet/Haiku)
Stage 3: Policy Inference + HITL (Claude Opus + Durable Objects)
Stage 4: Ontology Normalization (Neo4j + SKOS/JSON-LD)
Stage 5: Skill Packaging (.skill.json + MCP/OpenAPI adapters)

[확장 — 프로세스 정밀분석 모드]
Stage 1 → Stage 2 (변경 없음)
                ↓
    ┌── Stage 2A: Scoring + Core Identification (Pass 1)
    │     중요도 스코어링 + 핵심 프로세스 판정 + 프로세스 트리
    │
    ├── Stage 2B: Diagnosis (Pass 2)
    │     4대 진단: 누락/중복/오버스펙/정합성
    │
    └── Stage 2C: Cross-Org Comparison (Pass 3, 별도 트리거)
          조직 비교 + 서비스 그룹 분류 + 표준화 후보
                ↓
Stage 3: HITL Review (진단 소견 + 정책 통합 리뷰)
Stage 4 → Stage 5 (확장 온톨로지 노드 포함)
```

## 8.2 Technical Stack

AI Foundry 기존 스택을 그대로 사용한다:

| Component | Technology | 비고 |
|-----------|-----------|------|
| Compute | Cloudflare Workers (11 services) | 기존 인프라 |
| Database | Cloudflare D1 (10 DBs) | 분석 테이블 추가 |
| Storage | Cloudflare R2 | 문서 + Skill 패키지 |
| Async | Cloudflare Queues | 파이프라인 이벤트 버스 |
| HITL State | Cloudflare Durable Objects | 리뷰 세션 관리 |
| Graph DB | Neo4j Aura (Query API v2) | 확장 온톨로지 |
| LLM | Claude Sonnet (분석) / Opus (복잡 진단) | via svc-llm-router |
| Frontend | React + Vite + Cloudflare Pages | 기존 SPA |

> **v0.1 대비 변경**: Python/FastAPI + Containerized 제안을 철회. 기존 Cloudflare Workers/TS 스택으로 통합하여 인프라 복잡도와 운영 비용을 최소화.

## 8.3 LLM 전략 — 3-Pass 분석

단일 거대 프롬프트 대신 **3-Pass 순차 분석**으로 품질과 디버깅 용이성을 확보:

| Pass | 목적 | LLM Tier | 예상 비용/문서 |
|------|------|----------|--------------|
| Pass 1 | Scoring + Core Identification | Sonnet | ~$0.09 |
| Pass 2 | 4대 Diagnosis | Sonnet/Opus | ~$0.11 |
| Pass 3 | Cross-Org Comparison | Sonnet | ~$0.16 |
| **합계** | | | **~$0.36/문서** |

---

# 9. User Flow

## 9.1 단일 조직 분석 플로우

```
1. Analyst가 "미래에셋 퇴직연금" 프로젝트 문서 15건을 업로드
2. 시스템이 자동으로:
   a. 파싱 (Stage 1) — PDF/DOCX/XLSX → 구조화된 청크
   b. 추출 (Stage 2) — 프로세스/엔티티/규칙/관계 추출
   c. 스코어링 (Pass 1) — 중요도 스코어 + 핵심 판정
   d. 진단 (Pass 2) — 누락/중복/오버스펙/정합성 소견
3. UI "분석 리포트" 화면에서:
   a. [추출 요약 탭] 프로세스 47건, 엔티티 82건 — 각각 중요도 바 차트
   b. [핵심 프로세스 탭] Core 판정 목록 + "왜 핵심인가" 근거 카드
   c. [진단 소견 탭] severity별 소견 카드 — 펼치면 근거 + 제안
4. Reviewer가 소견을 검토:
   a. [수락] 소견이 유효함 — 후속 조치 필요
   b. [거절] 소견이 부적절 — 코멘트 작성
   c. [수정] 소견은 유효하나 내용 수정 — 수정 후 저장
```

## 9.2 조직 비교 플로우

```
5. 현대증권 퇴직연금 산출물도 동일하게 분석 (1~4 반복)
6. Analyst가 "조직 비교" 실행: 미래에셋 vs 현대증권
7. 시스템이 자동으로 (Pass 3):
   a. 프로세스/정책 이름 + 의미 매칭
   b. 서비스 분석 4그룹 분류
   c. 표준화 후보 + 적합도 점수 도출
   d. 암묵지 항목 식별
8. UI "조직 비교" 화면에서:
   a. [공통/표준 탭] 표준화 후보 목록 + 변형 차이점
   b. [조직 고유 탭] 각 조직 전용 프로세스/정책
   c. [암묵지 탭] 문서 미명시 추론 항목 + 명문화 제안
   d. [핵심 차별 탭] 경쟁 우위 요소
9. 표준화 후보에 대한 HITL 의사결정:
   a. [표준화 승인] → 표준 Skill 자산으로 패키징
   b. [고유 유지] → 조직별 Skill 자산으로 분리 패키징
   c. [추가 조사] → 코멘트 작성 후 다음 리뷰 사이클로
```

---

# 10. API Endpoints

## 10.1 분석 리포트 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/analyze` | 문서 전체 분석 트리거 (3-Layer) |
| `GET` | `/analysis/{docId}/summary` | Layer 1: 추출 요약 |
| `GET` | `/analysis/{docId}/core-processes` | Layer 2: 핵심 프로세스 + 근거 |
| `GET` | `/analysis/{docId}/findings` | Layer 3: 진단 소견 목록 |
| `GET` | `/analysis/{docId}/findings/{findingId}` | Layer 3: 단일 소견 상세 |
| `POST` | `/analysis/{docId}/findings/{findingId}/review` | HITL 리뷰 |

## 10.2 조직 비교 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/analysis/compare` | 조직 비교 실행 |
| `GET` | `/analysis/{orgId}/service-groups` | 서비스 분석 그룹 |
| `GET` | `/analysis/compare/{comparisonId}/standardization` | 표준화 후보 |

---

# 11. Milestone

## 11.1 AI Foundry 전체 로드맵 내 위치

```
Phase 1 (완료) — 파이프라인 구축 + 배포 (11 Workers, 822 tests)
Phase 2-A~D (완료) — 실제 문서 투입 파일럿 (13/15 문서 파싱)
Phase 2-E (현재) — 프로세스 정밀분석 기능 추가 ← 이 PRD
Phase 3 (예정) — UI 시각화 + 재분석 루프 + 3+ 조직 비교
Phase 4 (예정) — 자동 표준화 + 코드 생성 연계 + 다중 도메인
```

## 11.2 Phase 2-E 세부 마일스톤

| Step | Task | 예상 소요 |
|------|------|----------|
| 2-E-1 | 타입 정의 (analysis.ts, diagnosis.ts, events.ts) | 1h |
| 2-E-2 | LLM 프롬프트 (Pass 1: Scoring, Pass 2: Diagnosis, Pass 3: Comparison) | 3h |
| 2-E-3 | API + DB (분석 라우트, 비교 라우트, D1 마이그레이션) | 3h |
| 2-E-4 | 온톨로지 + HITL (Neo4j 확장, 진단 HITL 통합) | 2h |
| 2-E-5 | 테스트 + 검증 (20+ unit tests, staging 배포, 실증) | 2h |

---

# 12. Success Metrics

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| 문서 구조 추출 정확도 | ≥ 85% | 파싱 성공률 (현재 87%) |
| 핵심 프로세스 식별 정확도 | ≥ 80% | 도메인 전문가 수동 검증 대비 precision |
| 진단 소견 유의미율 | ≥ 60% | HITL 리뷰에서 accept 비율 |
| 조직 간 공통 모듈 식별 정확도 | ≥ 70% | 수동 비교 대비 precision |
| 암묵지 탐지 건수 | ≥ 3건/조직 | 파일럿 기준 |
| 분석 리포트 생성 시간 | < 2분/문서 | E2E 파이프라인 측정 |
| LLM 분석 비용 | < $0.40/문서 | AI Gateway 로그 집계 |
| 사용자 수정률 감소 추이 | 2차 분석부터 측정 | HITL modify 비율 트래킹 |

---

# 13. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| LLM 핵심 판정 품질 불안정 | High | High | 3-Pass 분리 + confidence 필터링 + HITL 검증 |
| 조직 간 이름/의미 매칭 부정확 | High | Medium | LLM 유사도 비교 + 수동 매핑 HITL |
| 암묵지 탐지 false positive | Medium | High | confidence threshold 0.6+ 적용 + HITL |
| 추출 결과 빈약 시 분석 불가 | Medium | Medium | 최소 프로세스 3건 미만 시 경고 + 분석 스킵 |
| 한국어 도메인 용어 매칭 난이도 | Medium | High | 퇴직연금 용어사전 프롬프트 주입 |
| 기존 파이프라인 regression | High | Low | analysisMode 분기로 기존 경로 완전 격리 |

---

# 14. Security & Data Governance

- 모든 분석은 PII 마스킹된 데이터에서 수행 (기존 svc-security 파이프라인 그대로)
- 진단 소견에 원본 데이터 포함 금지 — 추상화된 설명만 저장
- 조직 비교 시 각 조직 데이터는 해당 orgId 권한 범위 내에서만 접근
- 분석 API 전체에 `X-Internal-Secret` 인증 적용
- 분석 결과 data classification: **Internal** (마스킹된 데이터 기반)
- 감사 로그: 모든 HITL 리뷰 액션 기록 (5년 보관)

---

# 15. Future Roadmap

| Phase | 기능 | 설명 |
|-------|------|------|
| **Phase 3** | D3.js 프로세스 시각화 | 프로세스 트리 + 데이터 흐름 인터랙티브 시각화 |
| **Phase 3** | 벤 다이어그램 비교 시각화 | 조직 비교 결과의 시각적 표현 |
| **Phase 3** | 재분석 자동 루프 | HITL 리뷰 후 자동 재추출 → 재진단 → 재비교 |
| **Phase 3** | 3+ 조직 동시 비교 | N개 조직의 교차 비교 |
| **Phase 4** | 자동 표준 프로세스 생성 | 공통 모듈에서 표준 프로세스 자동 합성 |
| **Phase 4** | 코드 생성 연계 | 표준 Skill → 코드 스캐폴딩 자동 생성 |
| **Phase 4** | 리스크 예측 모델 | 진단 소견 기반 프로젝트 리스크 예측 |
| **Phase 4** | 다중 도메인 확장 | 퇴직연금 외 보험, 카드, 증권 등 |

---

# Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-03 | Initial draft | Sinclair Seo |
| 0.2 | 2026-03-03 | 전면 재작성: UI/UX 중심 3-Layer 분석 + 조직 비교 + 서비스 분석 4그룹 + 기존 AI Foundry 스택 통합 | Sinclair Seo |

---

End of PRD
