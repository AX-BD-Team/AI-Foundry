---
code: AIF-PLAN-026
title: "Foundry-X 통합 — 제품군 통합 로드맵"
version: "1.0"
status: Draft
category: PLAN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
feature: foundry-x-integration
---

# Foundry-X 통합 — 제품군 통합 로드맵

> **Summary**: AI Foundry(역공학 엔진)와 Foundry-X(순공학 협업 플랫폼)를 하나의 제품군으로 통합. MCP 프로토콜 기반 즉시 연동 → 반제품 파이프라인 구축 → UI/런타임 통합.
>
> **Project**: AI Foundry × Foundry-X
> **Version**: v0.6.0 × v1.2.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-18
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | AI Foundry는 SI 산출물에서 Skill 자산을 추출하지만 "추출 후 활용"이 불명확. Foundry-X는 에이전트 협업 플랫폼이지만 기존 프로젝트의 도메인 지식을 활용할 수단이 없음. 두 프로젝트가 독립적으로 운영되어 제품 가치가 분절됨 |
| **Solution** | MCP 프로토콜을 연결 인터페이스로 활용하여 AI Foundry Skill 도구를 Foundry-X 에이전트에 자동 연동. Stage 5를 확장하여 Working Prototype(반제품)을 생성하고, `foundry-x init --from-foundry`로 핸드오프. 4단계 점진적 통합 |
| **Function/UX Effect** | Foundry-X 대시보드에서 AI Foundry Skill 도구를 에이전트가 자동 선택·호출. 기존 SI 산출물 업로드 → 반제품 생성 → 에이전트 협업으로 완성품 구축까지 단일 워크플로우 |
| **Core Value** | "신규 프로젝트가 제로에서 시작하지 않는다." — 기존 SI 산출물의 도메인 지식이 새 프로젝트의 출발점이 되어, PoC 구축 시간을 2~4주 → 수일로 단축 |

---

## 1. Overview

### 1.1 Purpose

AI Foundry(역공학 → 반제품 생성)와 Foundry-X(SDD Triangle + 에이전트 오케스트레이션)를 하나의 제품군으로 통합하여, **기존 SI 산출물 → 도메인 지식 추출 → 새 프로젝트 부트스트래핑 → 에이전트 협업 완성**이라는 End-to-End 파이프라인을 구축한다.

### 1.2 Background

**AI Foundry 현재 상태 (v0.6.0)**:
- 12 Workers + Pages, 1,801 tests, 2-org 파일럿 (퇴직연금 + 온누리상품권)
- 5-Stage Pipeline: 문서 파싱 → 구조 추출 → 정책 추론 → 온톨로지 → Skill 패키징
- MCP Server: svc-mcp-server (Streamable HTTP, Skill tools for Claude Desktop)
- Production: policies 3,675, skills 3,924 (11 bundled + 3,065 draft)

**Foundry-X 현재 상태 (v1.2.0)**:
- Phase 2 Sprint 14 완료. CLI + Hono API(50 endpoints) + Next.js 대시보드(9 pages)
- 429 tests + 20 E2E. 에이전트 오케스트레이션 + MCP 클라이언트(13 API)
- MCP 구현: registry, runner, resources, sampling, transport (클라이언트 측)
- 에이전트 → MCP 도구 자동 선택: `selectRunner()` → MCP 레지스트리 기반 라우팅

**계보**: `Discovery-X → AI Foundry → Foundry-X`

### 1.3 핵심 전제

1. AI Foundry는 독립 서비스로 유지 (Cloudflare Workers 배포)
2. Foundry-X는 AI Foundry를 플러그인/MCP 서버로 소비
3. MCP 프로토콜이 통합 인터페이스 (양쪽 모두 JSON-RPC 2.0 + HTTP transport 구현 완료)
4. "반제품(Working Prototype)" 출력 포맷을 표준화하여 `foundry-x init` 입력으로 사용
5. 점진적 통합 — 각 Phase가 독립적으로 가치를 제공

---

## 2. Integration Strategy — 플러그인 패턴

### 2.1 아키텍처

```
┌─────────────────────────────────────────┐
│           Foundry-X (순공학)              │
│                                         │
│  AgentOrchestrator                      │
│    ├─ selectRunner(taskType)            │
│    │    ├─ ClaudeApiRunner (기본)        │
│    │    └─ McpRunner ─── transport ──┐  │
│    └─ executeTask()                  │  │
│                                      │  │
│  McpServerRegistry (D1)              │  │
│    └─ AI Foundry 서버 등록            │  │
└──────────────────────────────────────┼──┘
                                       │
                 HTTP transport (JSON-RPC 2.0)
                 Bearer: INTERNAL_API_SECRET
                                       │
┌──────────────────────────────────────┼──┐
│           AI Foundry (역공학)          │  │
│                                      ▼  │
│  svc-mcp-server                         │
│    POST /mcp/:skillId                   │
│    ├─ tools/list → Skill 정책 도구      │
│    └─ tools/call → policy evaluation    │
└─────────────────────────────────────────┘
```

### 2.2 왜 플러그인 패턴인가

| 기준 | API Gateway (A) | 모노레포 통합 (B) | 플러그인 (C) ✅ |
|------|:-:|:-:|:-:|
| 변경 규모 | 소 | 대 | 소~중 |
| 독립 배포 | ✅ | ❌ | ✅ |
| 코드 공유 | ❌ | ✅ | 🟡 |
| MCP 활용 | ❌ | ❌ | ✅ (이미 구현) |
| 점진적 통합 | ✅ | ❌ | ✅ |
| 즉시 연동 | ❌ | ❌ | ✅ |

### 2.3 MCP 연동 상세

**기술 검증 결과** (`.team-tmp/fx-technical-notes.md` 참조):

- Foundry-X는 MCP **클라이언트**, AI Foundry는 MCP **서버** → 상호보완적
- HTTP transport로 즉시 연동 가능 (양쪽 모두 stateless JSON-RPC 2.0)
- Foundry-X의 `selectRunner()` → MCP 레지스트리에서 자동 라우팅 → **서버 등록만으로 에이전트가 Skill 도구 사용 가능**
- Bearer token 인증 → AI Foundry `INTERNAL_API_SECRET`과 호환

**즉시 연동 시나리오**:
```
1. Foundry-X POST /mcp/servers → AI Foundry svc-mcp-server 등록
2. POST /mcp/servers/:id/test → Skill 도구 자동 캐시 (5분 TTL)
3. 에이전트 태스크 실행 → selectRunner() → McpRunner 선택
4. McpRunner → tools/call → AI Foundry evaluatePolicy()
```

### 2.4 공유 타입 전략

| 영역 | 현재 | 통합 후 |
|------|------|--------|
| MCP 프로토콜 | 양쪽 자체 정의 | 공통 `@foundry-x/mcp-types` 패키지 |
| 정책/스킬 | AI Foundry 전용 | MCP tool 인터페이스로 추상화 (변환 불요) |
| 에이전트 | Foundry-X 전용 | 그대로 유지 |
| UIHint/AG-UI | 각각 다른 구조 | 양방향 변환 어댑터 |

---

## 3. 반제품(Working Prototype) 생성 파이프라인

### 3.1 Input → Process → Output

| 단계 | Input | AI Foundry Process | Output (반제품) |
|:----:|-------|-------------------|----------------|
| 1 | 소스코드 (.java, .ts) | AST 파싱 + 구조 분석 | ARCHITECTURE.md 초안, API 엔드포인트 목록 |
| 2 | 요구사항 정의서 | 문서 파싱 + 정책 추론 | Spec 초안 (구조화된 요구사항) |
| 3 | 프로그램 명세서 | 구조 추출 (프로세스/엔티티) | 비즈니스 로직 명세 (condition-criteria-outcome) |
| 4 | API 명세서 | 파싱 + FactCheck 매칭 | OpenAPI 3.x 스키마 초안 |
| 5 | 테이블 정의서 | 파싱 + 관계 추출 | DDL + ORM 스키마 초안 |
| 6 | 화면 설계서 | 이미지 분석 + 컴포넌트 추출 | 와이어프레임 + 컴포넌트 트리 |
| 7 | 전체 | Skill 패키징 + MCP 어댑터 | MCP 도구 세트 + 반제품 스캐폴딩 |

### 3.2 Stage 5 확장 — 반제품 생성기

기존 Stage 5(Skill Packaging)에 반제품 출력 기능을 추가:

```
Stage 5 (확장): Skill Packaging + Working Prototype Generation
  Input: Stage 1~4 결과물 전체
  Engine: Custom Skill Spec + Claude Sonnet (docs) + Template Engine
  Output:
    [기존] .skill.json + MCP adapter + OpenAPI adapter
    [신규] Working Prototype:
      ├── .foundry/origin.json           # 원천 추적 메타데이터
      ├── CLAUDE.md                      # 에이전트 컨텍스트 (자동 생성)
      ├── ARCHITECTURE.md                # 모듈 맵
      ├── specs/requirements.md          # 구조화된 요구사항
      ├── specs/api-spec.yaml            # OpenAPI 3.x
      ├── schemas/database.sql           # DDL
      ├── schemas/types.ts               # Zod 타입
      ├── rules/business-rules.json      # 비즈니스 룰
      ├── ontology/terms.jsonld          # 도메인 용어
      └── mcp-tools.json                 # MCP 도구 정의
```

### 3.3 Foundry-X 핸드오프

```bash
# AI Foundry가 생성한 반제품을 Foundry-X에 주입
foundry-x init --from-foundry ./working-prototype/

# 내부 동작:
# 1. .foundry/origin.json 읽기 → 원천 산출물 추적
# 2. ARCHITECTURE.md → Brownfield 분석 스킵 (이미 분석됨)
# 3. specs/ → SDD Triangle의 Spec 초기값 주입
# 4. schemas/ → 데이터 모델 기반 코드 생성 준비
# 5. mcp-tools.json → MCP 레지스트리에 AI Foundry 도구 자동 등록
```

---

## 4. 통합 로드맵

### Phase 0: 기반 정비 (현재 ~ 즉시)

> 목표: 전략 문서화 + 정체성 재정의 완료

| # | 태스크 | 산출물 | 상태 |
|---|--------|--------|:----:|
| 0-1 | AIF-REQ-026 등록 | SPEC.md §7 | ✅ |
| 0-2 | 비교 분석서 (AIF-ANLS-026) | `docs/03-analysis/AIF-ANLS-026_*.md` | ✅ |
| 0-3 | AI Foundry 정체성 재정의 | `docs/AI_Foundry_Identity.md` | ✅ |
| 0-4 | CLAUDE.md / SPEC.md 갱신 | Project Overview, §1 | ✅ |
| 0-5 | 통합 Plan (AIF-PLAN-026) | 본 문서 | ✅ |
| 0-6 | Foundry-X PRD v5에 AI Foundry Engine 섹션 추가 | Foundry-X `docs/specs/prd-v5.md` | 📋 |

### Phase 1: MCP 연동 (1~2일)

> 목표: AI Foundry Skill을 Foundry-X 에이전트가 호출 가능

| # | 태스크 | 산출물 | 예상 |
|---|--------|--------|------|
| 1-1 | PoC: Foundry-X에 AI Foundry MCP 서버 1개 등록 + tools/list + tools/call 왕복 검증 | E2E 검증 로그 | 0.5일 |
| 1-2 | AI Foundry에 Skill 통합 엔드포인트 추가 (`/mcp/org/:orgId`) — 조직별 전체 Skill 도구 단일 서버 노출 | svc-mcp-server 코드 | 1일 |
| 1-3 | Foundry-X TaskType 확장 — `policy-evaluation`, `skill-query`, `ontology-lookup` 추가 | packages/api/src/services/mcp-runner.ts | 0.5일 |

**Phase 1 완료 기준**: Foundry-X 에이전트가 "온누리상품권 충전 정책을 알려줘" → AI Foundry Skill 도구 호출 → 정책 평가 결과 반환

### Phase 2: 반제품 파이프라인 (3~5일)

> 목표: AI Foundry Stage 5에서 Working Prototype 출력

| # | 태스크 | 산출물 | 예상 |
|---|--------|--------|------|
| 2-1 | Working Prototype 출력 포맷 정의 (JSON Schema) | `@ai-foundry/types` 확장 | 0.5일 |
| 2-2 | Stage 5 반제품 생성기 구현 — 기존 파이프라인 결과를 WP 구조로 변환 | svc-skill 확장 | 2일 |
| 2-3 | `foundry-x init --from-foundry` 커맨드 구현 | Foundry-X packages/cli 확장 | 1일 |
| 2-4 | MCP 도구 자동 등록 (WP 내 mcp-tools.json → Foundry-X registry) | packages/api 확장 | 0.5일 |
| 2-5 | E2E 검증: 온누리상품권 산출물 → WP 생성 → Foundry-X init → 에이전트 태스크 | E2E 스크립트 | 1일 |

**Phase 2 완료 기준**: `온누리상품권 88건 산출물 → AI Foundry 5-Stage → Working Prototype → foundry-x init → 에이전트가 도메인 지식 기반으로 코드 생성 시작` 검증

### Phase 3: UI/UX + 인증 통합 (5~7일)

> 목표: 단일 사용자 경험

| # | 태스크 | 산출물 | 예상 |
|---|--------|--------|------|
| 3-1 | Foundry-X 대시보드에 AI Foundry 분석 뷰 임베드 (iframe 또는 API 직접 호출) | packages/web 확장 | 2일 |
| 3-2 | 통합 인증 — Cloudflare Access JWT → Foundry-X JWT 브릿지 | 인증 미들웨어 | 2일 |
| 3-3 | UIHint ↔ AG-UI 양방향 변환 어댑터 | 공유 패키지 | 1일 |
| 3-4 | 프론트엔드 수렴 검토 (Vite SPA → Next.js 마이그레이션 또는 iframe 유지 결정) | ADR 문서 | 1일 |
| 3-5 | 보안 강화: Foundry-X `encryptApiKey()` AES-GCM 전환 | packages/api | 1일 |

### Phase 4: 런타임 정합 (장기, 별도 계획)

> 목표: 기술 스택 일관성

| # | 태스크 | 비고 |
|---|--------|------|
| 4-1 | AI Foundry 핵심 로직의 Node.js 호환 레이어 추출 | Workers API → Node.js 추상화 |
| 4-2 | 패키지 매니저 통일 검토 (Bun ↔ pnpm) | 양쪽 모두 Turborepo |
| 4-3 | 또는 Foundry-X API를 Workers로 마이그레이션 | Hono → Workers Hono |
| 4-4 | 공유 모노레포 검토 (단일 리포 vs 독립 리포 + 패키지 공유) | ADR 필요 |

---

## 5. 기술 결정 포인트

| ID | 결정 | 선택지 | 권장 | 근거 |
|----|------|--------|------|------|
| T-7 | Reverse-to-Forward Bridge 아키텍처 | A: Stage 5 확장 / B: 별도 서비스 | **A** | 기존 파이프라인에 출력 포맷만 추가, 최소 변경 |
| T-8 | 통합 인터페이스 | A: REST API / B: MCP / C: gRPC | **B** | 양쪽 모두 MCP 구현 완료, 에이전트 생태계 표준 |
| D-1 | 런타임 전략 | A: 독립 유지 / B: Workers 통일 / C: Node.js 통일 | **A (Phase 1~3)** | 마이그레이션 비용 대비 MCP 연동으로 충분한 통합 |
| D-2 | 프론트엔드 전략 | A: 각각 유지 / B: Next.js 통일 / C: iframe 합성 | **C→B** | 단기 iframe, 장기 Next.js 수렴 |
| D-3 | 인증 전략 | A: 각각 유지 / B: CF Access 통일 / C: JWT 통일 | **A→B** | 단기 API Key, 장기 Cloudflare Access SSO |
| D-4 | 패키지 매니저 | A: Bun 유지 / B: pnpm 통일 | **A** | 각 리포 독립 유지 시 변경 불필요 |
| D-5 | Skill 통합 엔드포인트 | A: Skill당 1서버 / B: Org당 1서버 | **B** | 확장성 (11→N 스킬 증가 시 레지스트리 관리 비용) |

---

## 6. 리스크 & 의존성

| # | 유형 | 리스크 | 영향 | 대응 |
|---|------|--------|------|------|
| R-1 | Tech | 런타임 차이 (Workers V8 vs Node.js) | 공유 코드 제한, API 호환성 이슈 | MCP 프로토콜로 격리 — 내부 구현 무관 |
| R-2 | Tech | 도구 입력 스키마 불일치 | Foundry-X `{ files, spec }` vs AI Foundry `{ context, parameters }` | McpRunner.buildToolArguments() 확장 |
| R-3 | Tech | SSE Transport 패턴 차이 | Foundry-X `/sse`+`/message` 이원 vs AI Foundry 단일 POST | HTTP transport 사용으로 우회 |
| R-4 | Security | Foundry-X API Key 암호화 미흡 (base64만) | 프로덕션 보안 리스크 | Phase 3에서 AES-GCM 전환 필수 |
| R-5 | Resource | 두 프로젝트 동시 개발 리소스 분산 | 진행 속도 저하 | Phase별 집중 — Phase 1은 최소 변경 |
| R-6 | Dep | AI Foundry 계정 이전 (AIF-REQ-020) | 서비스 URL 변경 시 MCP 등록 재설정 | 이전 완료 후 Phase 1 시작 권장 |
| R-7 | Quality | 반제품 품질 = 역공학 정확도에 의존 | 잘못된 정책/스키마가 코드 생성에 전파 | FactCheck 커버리지 확대 + HITL 강화 |

### 의존성

```
Phase 0 (완료) → Phase 1 (MCP 연동)
                     ↓
              Phase 2 (반제품)
                     ↓
              Phase 3 (UI/인증)
                     ↓
              Phase 4 (런타임, 장기)

외부 의존: AIF-REQ-020 (계정 이전) — Phase 1 시작 전 완료 권장
```

---

## 7. 성공 지표

| # | 지표 | 목표 | 측정 방법 | Phase |
|---|------|------|-----------|:-----:|
| K-1 | MCP 도구 호출 왕복 성공률 | > 95% | Foundry-X 에이전트 로그 | 1 |
| K-2 | 반제품 생성 시간 (88건 산출물 기준) | < 30분 | Stage 5 실행 시간 | 2 |
| K-3 | `foundry-x init --from-foundry` 후 에이전트 첫 코드 생성까지 시간 | < 5분 | CLI 로그 | 2 |
| K-4 | 도메인 지식 기반 코드 품질 (정책 준수율) | > 80% | 생성된 코드의 비즈니스 룰 반영 비율 | 2 |
| K-5 | 통합 인증 단일 로그인 | SSO 1회로 양쪽 접근 | 사용자 테스트 | 3 |
| K-6 | PoC 구축 시간 단축 | 2~4주 → < 3일 | 파일럿 프로젝트 측정 | 3 |

---

## 8. 다음 단계 (즉시 실행)

1. **AIF-REQ-020 (계정 이전) 우선 완료** — 서비스 URL이 확정되어야 MCP 등록이 안정적
2. **Phase 1-1 PoC**: Foundry-X에 AI Foundry svc-mcp-server 1개 등록 → `tools/list` + `tools/call` 왕복 검증 (0.5일)
3. **Foundry-X PRD v5 갱신**: AI Foundry Engine 섹션 추가 — 제품군 정체성 양쪽 모두 반영

---

## 참조 문서

| 문서 | 위치 |
|------|------|
| 비교 분석서 | `docs/03-analysis/AIF-ANLS-026_foundry-x-integration-analysis.md` |
| 정체성 정의서 | `docs/AI_Foundry_Identity.md` |
| Foundry-X MCP/API 기술 분석 | `.team-tmp/fx-technical-notes.md` |
| Foundry-X CLAUDE.md | `github.com/KTDS-AXBD/Foundry-X/CLAUDE.md` |
| Foundry-X PRD v4 | `github.com/KTDS-AXBD/Foundry-X/docs/specs/prd-v4.md` |
