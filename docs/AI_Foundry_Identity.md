# AI Foundry — 프로젝트 정체성 정의서

> 이 문서는 AI Foundry의 정체성, 포지셔닝, Foundry-X 제품군 내 역할을 정의한다.
> PRD(docx)를 대체하지 않으며, 정체성 재정의의 권위 소스로 기능한다.
> 작성: 2026-03-18 | 관련: AIF-REQ-026, AIF-ANLS-026

---

## 1. 한줄 정의

> **과거의 지식을 미래의 코드로 바꾸는 엔진 (Reverse-to-Forward Bridge)**

---

## 2. 정체성 변천

| 시기 | 정체성 | 핵심 가치 |
|------|--------|-----------|
| 초기 (v0.1~v0.3) | Domain Knowledge Extraction Platform | SI 산출물에서 암묵지를 추출 |
| 파일럿 (v0.4~v0.6) | Reverse Engineering System | 역공학으로 Skill 자산 패키징 |
| **현재 (v0.6+)** | **Reverse-to-Forward Bridge** | **역공학 → 반제품 → 순공학 부트스트래핑** |

---

## 3. 포지셔닝

### 3.1 독립 포지션

AI Foundry는 **반제품 생성 엔진**이다.

```
Input:  소스코드 + SI 산출물
         · 요구사항 정의서
         · 프로그램 명세서
         · API 명세서
         · 테이블 정의서
         · 화면 설계서
         · ERD
         · 소스코드 (.java, .ts 등)
              ↓
Process: 5-Stage 역공학 파이프라인
         · Stage 1: 문서 파싱 (구조화)
         · Stage 2: 구조 추출 (프로세스/엔티티/관계)
         · Stage 3: 정책 추론 (비즈니스 룰 명시화, HITL)
         · Stage 4: 온톨로지 정규화 (도메인 용어 통일)
         · Stage 5: Skill 패키징 + 반제품 생성
              ↓
Output: Working Prototype (반제품)
         · 하네스 산출물 (CLAUDE.md, ARCHITECTURE.md)
         · Spec 초안 (구조화된 요구사항)
         · 스키마 초안 (DDL + ORM 타입)
         · API 초안 (OpenAPI 3.x)
         · 비즈니스 룰 명세 (condition-criteria-outcome)
         · 도메인 용어 사전 (SKOS/JSON-LD)
         · MCP 도구 세트 (.skill.json)
```

### 3.2 Foundry-X 제품군 내 포지션

```
┌─────────────────────────────────────────────────────┐
│              Foundry-X 제품군                        │
│                                                     │
│  ┌──────────────┐        ┌────────────────────┐     │
│  │ AI Foundry   │ ──────▶│ Foundry-X          │     │
│  │ (역공학 엔진) │ 반제품  │ (순공학 플랫폼)     │     │
│  │              │ 핸드오프 │                    │     │
│  │ 기존 산출물   │        │ 에이전트 + 사람     │     │
│  │   ↓ 분석     │        │   ↓ 협업            │     │
│  │ 반제품 생성   │        │ 완성품 구축          │     │
│  └──────────────┘        └────────────────────┘     │
│                                                     │
│  역할 분담:                                          │
│  · AI Foundry = 지식 추출 + 반제품 생성               │
│  · Foundry-X  = 에이전트 오케스트레이션 + SDD 동기화   │
│  · 연결점: MCP 프로토콜 + Working Prototype 포맷      │
└─────────────────────────────────────────────────────┘
```

### 3.3 Discovery-X → AI Foundry → Foundry-X 계보

| 프로젝트 | 정신 | 역할 |
|---------|------|------|
| Discovery-X | 탐색과 발견 | 관찰→실험→기록 사이클 |
| AI Foundry | 구축과 추출 | 기존 산출물 → 지식 추출 → 반제품 |
| Foundry-X | 협업과 동기화 | 반제품 → 에이전트 협업 → 완성품 |

---

## 4. "반제품(Semi-Product)" 정의

### 4.1 반제품이란

기존 SI 프로젝트의 산출물과 소스코드를 분석하여, **새 프로젝트의 개발 시작점**이 되는 구조화된 자산 세트.

### 4.2 반제품의 7가지 구성요소

| # | 구성요소 | 원천 (AI Foundry 분석) | 활용 (Foundry-X 또는 직접) |
|---|---------|----------------------|--------------------------|
| 1 | **하네스 산출물** | 코드 구조 분석 → ARCHITECTURE.md, CONSTITUTION.md | `foundry-x init` Brownfield 입력 |
| 2 | **Spec 초안** | 요구사항 정의서 + 프로그램 명세서 역공학 | SDD Triangle Spec 초기값 |
| 3 | **스키마 초안** | 테이블 정의서 → DDL + Zod/Drizzle 타입 | 데이터 모델 기반 |
| 4 | **API 초안** | API 명세서 → OpenAPI 3.x | 라우트 스캐폴딩 |
| 5 | **비즈니스 룰** | 정책 추론 (condition-criteria-outcome) | 코드 생성 시 제약 조건 |
| 6 | **도메인 용어** | 온톨로지 (SKOS/JSON-LD) | 네이밍/주석 일관성 기준 |
| 7 | **MCP 도구** | .skill.json → MCP tool definitions | 에이전트 도구 팔레트 |

### 4.3 Working Prototype 디렉토리 구조

```
working-prototype/
├── .foundry/
│   ├── origin.json              # 원천 산출물 추적 메타데이터
│   ├── analysis-report.json     # AI Foundry 분석 결과 요약
│   └── skills/                  # 추출된 Skill 패키지들
├── CLAUDE.md                    # 에이전트용 컨텍스트 (자동 생성)
├── ARCHITECTURE.md              # 모듈 맵 (코드 분석 기반)
├── CONSTITUTION.md              # 코딩 규칙 (기존 코드 패턴 기반)
├── specs/
│   ├── requirements.md          # 구조화된 요구사항
│   ├── api-spec.yaml            # OpenAPI 3.x
│   └── domain-model.md          # 도메인 모델
├── schemas/
│   ├── database.sql             # DDL
│   └── types.ts                 # Zod/TypeScript 타입
├── rules/
│   └── business-rules.json      # 비즈니스 룰 (condition-criteria-outcome)
├── ontology/
│   └── terms.jsonld             # 도메인 용어 사전
└── mcp-tools.json               # MCP 도구 정의
```

---

## 5. 차별화된 가치

### 5.1 기존 도구와의 비교

| 접근법 | 설명 | AI Foundry와의 차이 |
|--------|------|---------------------|
| 수동 분석 | PM/아키텍트가 기존 산출물을 읽고 정리 | AI Foundry는 LLM으로 자동화, HITL로 품질 보증 |
| 코드 마이그레이션 | 기존 코드를 새 프레임워크로 변환 | AI Foundry는 코드뿐 아니라 문서/명세/설계서 전체를 분석 |
| RAG 기반 검색 | 기존 문서를 검색해서 참고 | AI Foundry는 검색이 아니라 구조화된 반제품을 생성 |
| 코드 생성 AI | 프롬프트로 새 코드 생성 | AI Foundry는 기존 자산의 맥락을 보존하면서 새 구조로 변환 |

### 5.2 핵심 가치 명제

> **"신규 프로젝트가 제로에서 시작하지 않는다."**
>
> 조직에 축적된 SI 산출물(소스코드, 요구사항, API 명세, 테이블 정의서)은
> 이미 도메인 지식의 보고(寶庫)다. AI Foundry는 이 지식을
> 구조화하고, 정제하고, 새 프로젝트에서 즉시 활용할 수 있는
> 반제품으로 변환한다.
>
> Foundry-X와 결합하면, 에이전트가 이 반제품을 기반으로
> 코드를 생성하고, 테스트를 작성하고, 명세와 동기화하면서
> Production-ready Software를 만들어낸다.

---

## 6. 실증 데이터 (파일럿 결과)

| 지표 | 퇴직연금 | 온누리상품권 |
|------|---------|-------------|
| 투입 문서 | 15건 | 88건 |
| 파싱 성공 | 13건 (87%) | 85건 (96.6%) |
| 추출 정책 | 2,827건 approved | 848건 approved |
| 도메인 용어 | 1,441건 | 7,332건 |
| Skill 패키지 | 3,065건 (draft) | 11 bundles (859 → 11) |
| FactCheck 커버리지 | — | 31.2% (외부API 83.7%) |

---

## 변경 이력

| 날짜 | 버전 | 변경 |
|------|------|------|
| 2026-03-18 | 1.0 | 초안 — 정체성 재정의 (Reverse Engineering → Reverse-to-Forward Bridge), 반제품 정의, Foundry-X 제품군 포지셔닝 |
