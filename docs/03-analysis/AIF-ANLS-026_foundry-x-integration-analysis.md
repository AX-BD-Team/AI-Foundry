---
code: AIF-ANLS-026
title: Foundry-X 통합 비교 분석서
version: 1.0
status: Draft
category: ANLS
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
related: AIF-REQ-026
---

# Foundry-X 통합 비교 분석서

> AI Foundry(역공학 엔진)와 Foundry-X(순공학 협업 플랫폼)의 기능/기술/포지셔닝 비교 분석.
> 두 프로젝트를 하나의 제품군으로 통합하기 위한 근거 자료.

---

## 1. Executive Summary

### 프로젝트 개요

| 항목 | AI Foundry | Foundry-X |
|------|-----------|-----------|
| **한줄 정의** | SI 산출물 역공학 → 반제품 생성 엔진 | 사람+에이전트 협업 플랫폼 (SDD Triangle) |
| **버전** | v0.6.0 (Phase 4 Sprint 2) | v1.2.0 (Phase 2 Sprint 14) |
| **핵심 철학** | 암묵지 추출 → Skill 자산화 → Working Prototype | Git이 진실, Foundry-X는 렌즈 |
| **테스트** | 1,801 tests (99 files) | 429 tests + 20 E2E |
| **리포** | KTDS-AXBD/res-ai-foundry | KTDS-AXBD/Foundry-X |

### 통합 비전 — "역공학 → 반제품 → 순공학" 파이프라인

```
┌─────────────────────────────────────────────────────────────────────┐
│                     통합 제품군: Foundry-X                          │
│                                                                     │
│  ┌──────────────────────┐     ┌──────────────────────────────────┐  │
│  │   AI Foundry Engine  │     │    Foundry-X Platform            │  │
│  │   (역공학 → 반제품)   │────▶│    (순공학 → 완성품)              │  │
│  │                      │     │                                  │  │
│  │  Input:              │     │  Input:                          │  │
│  │  · 소스코드           │     │  · AI Foundry 반제품             │  │
│  │  · SI 산출물          │     │  · 자연어 요구사항               │  │
│  │  · API 명세서         │     │                                  │  │
│  │  · 테이블 정의서      │     │  Process:                        │  │
│  │                      │     │  · SDD Triangle 동기화            │  │
│  │  Process:            │     │  · 에이전트 오케스트레이션         │  │
│  │  · 5-Stage Pipeline  │     │  · 하네스 엔지니어링              │  │
│  │  · LLM 역공학        │     │                                  │  │
│  │  · 반제품화           │     │  Output:                         │  │
│  │                      │     │  · Production-ready Software     │  │
│  │  Output:             │     │  · 동기화된 Spec↔Code↔Test       │  │
│  │  · Working Prototype │     │                                  │  │
│  │  · Skill 자산        │     │                                  │  │
│  │  · 도메인 온톨로지    │     │                                  │  │
│  └──────────────────────┘     └──────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 포지셔닝 비교 — 역공학 vs 순공학

### 2.1 현재 포지셔닝

| 축 | AI Foundry (현재) | Foundry-X (현재) |
|----|-------------------|------------------|
| **방향** | Reverse Engineering (기존 → 분석) | Forward Engineering (설계 → 구현) |
| **Input** | 기존 SI 산출물 (ERD, 화면설계서, API 명세, 코드) | 자연어 요구사항, Spec 문서 |
| **Output** | Skill 패키지 (.skill.json), 정책, 온톨로지 | 동기화된 코드 + 테스트 + 명세 |
| **사용자** | Analyst, Reviewer, Developer | 의도 설계자, 에이전트 지휘자, 검증자 |
| **LLM 역할** | 구조 추출, 정책 추론, 번들링 | NL→Spec 변환, 에이전트 오케스트레이션 |

### 2.2 재정의된 포지셔닝

**AI Foundry의 정체성 확장:**

```
[기존] 역공학 분석 도구
  SI 산출물 → 암묵지 추출 → Skill 자산 (끝)

[확장] 반제품 생성 엔진
  Input: 소스코드 + SI 산출물
    ↓
  Process: 5-Stage 역공학 + 반제품화
    · Stage 1: 문서 파싱 (구조화)
    · Stage 2: 구조 추출 (프로세스, 엔티티, 관계)
    · Stage 3: 정책 추론 (비즈니스 룰 명시화)
    · Stage 4: 온톨로지 정규화 (도메인 용어 통일)
    · Stage 5: Skill 패키징 → ★ 반제품 생성 (NEW)
    ↓
  Output: Working Prototype
    · 하네스 산출물 (CLAUDE.md, ARCHITECTURE.md, CONSTITUTION.md)
    · Spec 초안 (기존 산출물 기반)
    · 스키마/API 초안 (테이블 정의서, API 명세서 기반)
    · MCP 도구 (Skill 자산 기반)
    ↓
  [Foundry-X로 핸드오프]
    · SDD Triangle 초기 상태로 주입
    · 에이전트가 코드 생성 시작
```

### 2.3 "반제품"의 정의

**반제품(半製品, Semi-Product)**: 기존 SI 산출물과 소스코드를 분석하여, 새 프로젝트의 개발 시작점이 되는 구조화된 자산 세트.

| 반제품 구성요소 | 원천 (AI Foundry) | 활용 (Foundry-X) |
|---------------|-------------------|------------------|
| **하네스 산출물** | 코드 구조 분석 → ARCHITECTURE.md, CONSTITUTION.md 생성 | `foundry-x init` Brownfield 모드의 입력 |
| **Spec 초안** | 요구사항 정의서 + API 명세서 → 구조화된 Spec | SDD Triangle의 Spec 계층 초기값 |
| **스키마 초안** | 테이블 정의서 → DDL + Drizzle/Zod 스키마 | 코드 생성의 데이터 모델 기반 |
| **비즈니스 룰** | 정책 추론 결과 (condition-criteria-outcome) | 에이전트 코드 생성 시 제약 조건 |
| **도메인 용어** | 온톨로지 (SKOS/JSON-LD + Neo4j) | 코드 네이밍, 주석, 문서의 일관성 기준 |
| **MCP 도구** | .skill.json → MCP tool definitions | Foundry-X 에이전트의 도구 팔레트 |

---

## 3. 기능 비교 매트릭스

### 3.1 핵심 기능 중복/차별 분석

| 기능 영역 | AI Foundry | Foundry-X | 중복도 | 통합 전략 |
|-----------|-----------|-----------|:------:|-----------|
| **문서 파싱** | ✅ Unstructured.io + Claude Vision + 커스텀 파서 (PDF/PPTX/XLSX/이미지) | ❌ 없음 | 없음 | AI Foundry 독점 |
| **LLM 추출** | ✅ 5-Stage Pipeline (Opus/Sonnet/Haiku) | ❌ 없음 | 없음 | AI Foundry 독점 |
| **정책 추론** | ✅ HITL 워크플로우 (DO + Queue) | ❌ 없음 | 없음 | AI Foundry 독점 |
| **온톨로지** | ✅ SKOS/JSON-LD + Neo4j Aura | ❌ 없음 | 없음 | AI Foundry 독점 |
| **MCP 서버** | ✅ svc-mcp-server (Skill tools) | ✅ mcp-adapter/registry/runner/transport | **높음** | 통합 필요 |
| **에이전트 오케스트레이션** | ❌ 없음 | ✅ agent-orchestrator/runner + SSE + PR 파이프라인 | 없음 | Foundry-X 독점 |
| **SDD Triangle** | ❌ 없음 | ✅ Spec↔Code↔Test 동기화 (Plumb 엔진) | 없음 | Foundry-X 독점 |
| **하네스 생성** | ❌ 없음 | ✅ init (Brownfield/Greenfield) + 4 Builder | 없음 | Foundry-X 독점 |
| **NL→Spec** | ❌ 없음 | ✅ 자연어 → 구조화 명세 변환 | 없음 | Foundry-X 독점 |
| **대시보드** | ✅ 21 화면 (5 persona) | ✅ 9 pages (대시보드+랜딩) | **중간** | UI 통합 또는 페더레이션 |
| **RBAC/인증** | ✅ Cloudflare Access + RBAC (5 roles) | ✅ JWT + RBAC 미들웨어 | **높음** | 통합 인증 |
| **API 서버** | ✅ 12 Workers (Cloudflare) | ✅ Hono API (50 endpoints) | **중간** | Gateway 패턴 |
| **Git 연동** | ❌ 없음 | ✅ simple-git + octokit (핵심) | 없음 | Foundry-X 독점 |
| **충돌 감지** | ❌ 없음 | ✅ conflict-detector + merge-queue | 없음 | Foundry-X 독점 |
| **CI/CD** | ✅ GitHub Actions (Workers 배포) | ✅ GitHub Actions (Cloudflare Pages) | **낮음** | 통합 가능 |

### 3.2 MCP 통합 포인트 (중복도 높음)

| 구성요소 | AI Foundry | Foundry-X | 통합 방안 |
|---------|-----------|-----------|-----------|
| **프로토콜** | Streamable HTTP (2025-03-26 spec) | MCP SDK (adapter/transport) | 프로토콜 동일, 통합 가능 |
| **도구 정의** | .skill.json → MCP tool 변환 (projection) | MCP registry (도구 등록/조회) | AI Foundry 도구를 FX registry에 등록 |
| **실행** | svc-mcp-server Worker | mcp-runner (Claude API 호출) | FX runner가 AIF 도구 호출 |
| **리소스** | Skill packages (R2) | MCP Resources (Sprint 14) | 리소스 타입으로 Skill 노출 |
| **Sampling** | ❌ 없음 | ✅ MCP Sampling (Sprint 13) | FX의 sampling으로 통합 |

---

## 4. 기술 스택 비교

### 4.1 인프라 & 런타임

| 영역 | AI Foundry | Foundry-X | Gap |
|------|-----------|-----------|-----|
| **런타임** | Cloudflare Workers (V8 isolates, 30s timeout) | Node.js 20 (무제한) | ⚠️ 큰 차이 |
| **프레임워크** | 없음 (vanilla Workers) | Hono (API) + Next.js 14 (Web) | Hono 공통 가능 |
| **데이터베이스** | D1 (SQLite) × 10개 | D1 + Drizzle ORM | D1 공통 |
| **그래프 DB** | Neo4j Aura | 없음 | AI Foundry 전용 |
| **오브젝트 스토리지** | R2 (문서, Skill 패키지) | 없음 | AI Foundry 전용 |
| **캐시** | KV (prompt, skill) | KV cache (서비스 내부) | 유사 |
| **비동기** | Cloudflare Queues + DO | SSE (Server-Sent Events) | 다른 패턴 |
| **프론트엔드** | React + Vite (Pages SPA) | Next.js 14 + shadcn/ui | 통합 필요 |
| **패키지 관리** | Bun workspaces + Turborepo | pnpm workspaces + Turborepo | 도구 차이 |
| **타입 공유** | @ai-foundry/types (Zod) | packages/shared (types.ts) | Zod 공통 |
| **LLM** | Anthropic/OpenAI/Google/Workers AI (4-provider) | Claude API (단일) | AIF가 풍부 |
| **인증** | Cloudflare Access (Zero Trust) | JWT (자체 구현) | 통합 필요 |

### 4.2 기술 정합성 평가

| 항목 | 정합도 | 비고 |
|------|:------:|------|
| TypeScript | ✅ 높음 | 양쪽 모두 strict TS |
| Turborepo | ✅ 높음 | 빌드 시스템 동일 |
| Zod 스키마 | ✅ 높음 | 타입 공유 용이 |
| Vitest | ✅ 높음 | 테스트 프레임워크 동일 |
| 런타임 | ⚠️ 낮음 | Workers V8 vs Node.js — API 호환성 차이 |
| 프론트엔드 | ⚠️ 중간 | Vite SPA vs Next.js — 통합 시 Next.js로 수렴 가능 |
| 패키지 매니저 | ⚠️ 중간 | Bun vs pnpm — 전환 가능 |
| 인증 | ⚠️ 낮음 | Cloudflare Access vs JWT — 통합 인증 레이어 필요 |

---

## 5. 통합 시나리오 분석

### 시나리오 A: API Gateway 패턴 (느슨한 통합)

```
                    ┌──────────────┐
                    │  Foundry-X   │
                    │  Web/CLI     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Foundry-X   │
                    │  API Server  │
                    │  (Hono)      │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──┐  ┌──────▼───┐  ┌────▼──────┐
     │ FX 내부   │  │ AI Foundry│  │ 외부 도구  │
     │ 서비스    │  │ Workers   │  │ (Jira 등) │
     │           │  │ (API 호출)│  │           │
     └───────────┘  └──────────┘  └───────────┘
```

**장점**: 최소 변경, 독립 배포 유지
**단점**: 네트워크 hop 추가, 인증 이중 관리

### 시나리오 B: 모노레포 통합 (긴밀한 통합)

```
foundry-x/
├── packages/
│   ├── cli/           # CLI (기존)
│   ├── api/           # API 서버 (기존)
│   ├── web/           # 웹 대시보드 (기존 + AI Foundry UI 머지)
│   ├── shared/        # 공유 타입 (기존 + @ai-foundry/types 머지)
│   ├── engine/        # ★ AI Foundry 5-Stage Pipeline (NEW)
│   │   ├── ingestion/
│   │   ├── extraction/
│   │   ├── policy/
│   │   ├── ontology/
│   │   └── skill/
│   └── workers/       # ★ Cloudflare Workers 배포 단위 (NEW)
│       ├── svc-ingestion/
│       ├── svc-extraction/
│       └── ...
```

**장점**: 코드 공유 극대화, 단일 CI/CD, 타입 안전성
**단점**: 대규모 마이그레이션 필요, 두 런타임(Workers + Node.js) 공존

### 시나리오 C: 플러그인 패턴 (권장)

```
foundry-x/
├── packages/
│   ├── cli/
│   ├── api/
│   ├── web/
│   ├── shared/
│   └── plugins/
│       └── ai-foundry/     # ★ AI Foundry를 플러그인으로 캡슐화
│           ├── client.ts    # AI Foundry API 클라이언트
│           ├── types.ts     # 공유 타입 (Skill, Policy, Ontology)
│           ├── mcp-tools.ts # MCP 도구 어댑터
│           └── harness.ts   # 반제품 → 하네스 변환기
```

**장점**: 최소 침습적, AI Foundry 독립 운영 가능, 점진적 통합
**단점**: 초기에 기능 제한적

---

## 6. "반제품화" 프로세스 정의

### 6.1 Input → Process → Output

| 단계 | Input | AI Foundry Process | Output (반제품) |
|:----:|-------|-------------------|----------------|
| 1 | 소스코드 (.java, .ts 등) | AST 파싱 + 구조 분석 | ARCHITECTURE.md 초안, API 엔드포인트 목록 |
| 2 | 요구사항 정의서 | 문서 파싱 + 정책 추론 | Spec 초안 (구조화된 요구사항) |
| 3 | 프로그램 명세서 | 구조 추출 (프로세스/엔티티) | 비즈니스 로직 명세 (condition-criteria-outcome) |
| 4 | API 명세서 | 파싱 + FactCheck 매칭 | OpenAPI 3.x 스키마 초안 |
| 5 | 테이블 정의서 | 파싱 + 관계 추출 | DDL + ORM 스키마 초안 (Drizzle/Prisma) |
| 6 | 화면 설계서 | 이미지 분석 + 컴포넌트 추출 | 와이어프레임 + 컴포넌트 트리 |
| 7 | 전체 | Skill 패키징 + MCP 어댑터 | MCP 도구 세트 + Working Prototype 스캐폴딩 |

### 6.2 Working Prototype의 구성

```
working-prototype/                # AI Foundry 출력
├── .foundry/
│   ├── origin.json              # 원천 산출물 추적 메타데이터
│   └── skills/                  # 추출된 Skill 패키지
├── CLAUDE.md                    # 에이전트용 컨텍스트 (AI Foundry 생성)
├── ARCHITECTURE.md              # 모듈 맵 (코드 분석 기반)
├── CONSTITUTION.md              # 코딩 규칙 (기존 코드 패턴 기반)
├── specs/
│   ├── requirements.md          # 구조화된 요구사항 (원본 역공학)
│   ├── api-spec.yaml            # OpenAPI 3.x (API 명세서 역공학)
│   └── domain-model.md          # 도메인 모델 (테이블 + 엔티티 기반)
├── schemas/
│   ├── database.sql             # DDL (테이블 정의서 역공학)
│   └── types.ts                 # Zod/TypeScript 타입 (스키마 기반)
├── src/                         # 스캐폴딩된 코드 (선택적)
│   ├── routes/                  # API 라우트 스텁
│   └── models/                  # 데이터 모델
└── mcp-tools.json               # MCP 도구 정의 (Foundry-X 에이전트용)
```

---

## 7. 통합 로드맵 (안)

### Phase 0: 기반 정비 (현재)

- [x] AIF-REQ-026 등록
- [x] 비교 분석서 작성 (본 문서)
- [ ] AI Foundry 프로젝트 정체성 재정의 (PRD 갱신)
- [ ] Foundry-X PRD에 AI Foundry Engine 섹션 추가

### Phase 1: MCP 연동 (최소 통합)

- [ ] AI Foundry MCP 도구를 Foundry-X mcp-registry에 등록
- [ ] Foundry-X 에이전트가 AI Foundry Skill 도구를 호출할 수 있도록 연동
- [ ] 공유 타입 패키지 생성 (@foundry-x/shared-types)

### Phase 2: 반제품 파이프라인 (핵심)

- [ ] AI Foundry Stage 5에 "반제품 생성" 기능 추가
- [ ] Working Prototype 출력 포맷 정의 및 구현
- [ ] `foundry-x init --from-foundry <prototype-path>` 커맨드 확장

### Phase 3: UI/UX 통합

- [ ] Foundry-X 대시보드에 AI Foundry 분석 뷰 통합
- [ ] 통합 인증 (Cloudflare Access → JWT bridge 또는 통합)
- [ ] 단일 프론트엔드로 수렴 (Next.js)

### Phase 4: 런타임 통합 (장기)

- [ ] AI Foundry 핵심 로직의 Node.js 호환 레이어 추출
- [ ] Workers 배포와 Node.js 배포의 공존 전략 확정
- [ ] 또는 Foundry-X API를 Workers로 마이그레이션 검토

---

## 8. 리스크 & 고려사항

| # | 리스크 | 영향 | 대응 |
|---|--------|------|------|
| R1 | 런타임 차이 (Workers vs Node.js) | API 호환성, 공유 코드 제한 | 플러그인 패턴으로 격리 + 점진적 통합 |
| R2 | 프론트엔드 이중 관리 (Vite SPA vs Next.js) | 개발 비용 증가 | Phase 3에서 Next.js로 수렴 |
| R3 | "반제품" 품질 보증 | 역공학 결과의 정확도가 반제품 품질 좌우 | FactCheck 커버리지 확대 + HITL 강화 |
| R4 | 인증 통합 복잡도 | 두 시스템 간 SSO/토큰 교환 | Phase 1에서 API 키 기반 시작, Phase 3에서 통합 |
| R5 | 팀 리소스 분산 | 두 프로젝트 동시 진행 | Phase별 집중 (현재 AIF Phase 4 완료 → FX 통합 집중) |

---

## 9. 결론

### AI Foundry 정체성 재정의

| 항목 | 기존 | 재정의 |
|------|------|--------|
| **정체성** | Reverse Engineering System | **Reverse-to-Forward Bridge** (역공학 → 반제품 → 순공학) |
| **포지션** | 독립 분석 도구 | Foundry-X 제품군의 **지식 추출 엔진** |
| **Output** | Skill 패키지 (분석 산출물) | **Working Prototype** (개발 시작점) |
| **가치** | 암묵지 가시화 | **신규 프로젝트 부트스트래핑 시간 단축** |

### 권장 통합 전략

**시나리오 C (플러그인 패턴)** 권장:
1. AI Foundry를 독립 서비스로 유지하면서 Foundry-X에 플러그인으로 연동
2. MCP가 자연스러운 통합 인터페이스 (양쪽 모두 이미 구현)
3. "반제품" 출력 포맷을 표준화하여 `foundry-x init` 입력으로 사용
4. UI는 점진적으로 Foundry-X 대시보드에 통합

### 핵심 메시지

> **AI Foundry는 "과거의 지식을 미래의 코드로 바꾸는 엔진"이다.**
> Foundry-X와 결합하면, 기존 SI 프로젝트의 산출물이 새 프로젝트의 출발점이 된다.
> 역공학과 순공학의 연결 — 이것이 Foundry-X 제품군의 차별화된 가치.
