---
code: AIF-PLAN-024
title: "Generative UI Framework"
version: "1.0"
status: Draft
category: PLAN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# Generative UI Framework

> **Summary**: AI Foundry의 추출 결과(Skill 3,924건, Policy 3,675건, Ontology 3,880 노드)를 에이전트가 **동적으로 시각화**할 수 있는 Generative UI 프레임워크를 구축한다. Sandboxed Widget Renderer(iframe 기반 안전 렌더링), AG-UI Protocol(에이전트↔UI 실시간 통신), HITL 컴포넌트(정책 승인 등 사용자 인터랙션), Decision Matrix(데이터 특성 기반 자동 시각화 선택)를 핵심 모듈로 한다.
>
> **Project**: RES AI Foundry
> **Version**: v0.7
> **Author**: Sinclair Seo
> **Date**: 2026-03-18
> **Status**: Draft
> **REQ**: AIF-REQ-024 (P1)
> **Depends On**: Phase 4 Sprint 2 완료 + [[AIF-REQ-019]] Working Mock-up 기반 인프라

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | AI Foundry의 시각화는 현재 Recharts/SVG/react-force-graph로 **코드에 하드코딩**되어 있다. 새로운 도메인이나 분석 관점이 추가될 때마다 개발자가 컴포넌트를 직접 구현해야 하며, 에이전트가 분석 결과를 동적으로 시각화할 수 없다. |
| **Solution** | OpenGenerativeUI 패턴을 적용하여 에이전트가 런타임에 HTML/SVG 시각화를 생성하고, Sandboxed iframe에서 안전하게 렌더링하는 프레임워크를 구축한다. AG-UI Protocol로 에이전트 실행 상태를 실시간 스트리밍하고, Decision Matrix로 데이터 특성에 맞는 최적 시각화 유형을 자동 선택한다. |
| **Function/UX Effect** | 사용자가 "이 도메인의 정책 의존성을 보여줘"라고 요청하면, 에이전트가 데이터를 분석하고 적절한 시각화(그래프/차트/다이어그램)를 자동 생성하여 실시간으로 표시한다. 정책 승인이 필요하면 HITL 카드가 에이전트 플로우 중간에 렌더링되어 사용자 입력을 받는다. |
| **Core Value** | "정적 대시보드에서 동적 AI 시각화로" — 도메인 확장 시 개발 비용 없이 에이전트가 시각화를 생성하며, HITL 워크플로우를 에이전트 대화 흐름에 자연스럽게 통합한다. |

---

## 1. Overview

### 1.1 Purpose

Phase 4까지 AI Foundry는 추출과 관리 대시보드에 집중했다. 시각화는 고정된 차트와 그래프로 제한되어 있으며, 새로운 분석 관점을 추가하려면 항상 프론트엔드 코드 수정이 필요하다.

Generative UI Framework는 이 한계를 해결한다:
- **에이전트가 시각화를 생성**: LLM이 데이터 특성을 분석하고 적절한 HTML/SVG/Mermaid를 생성
- **안전한 렌더링**: Sandboxed iframe으로 AI 생성 콘텐츠를 격리 실행
- **실시간 통신**: AG-UI Protocol로 에이전트 실행 상태를 UI에 스트리밍
- **사용자 참여**: HITL 컴포넌트로 에이전트 플로우 중 사용자 입력을 수집

### 1.2 Background

- **OpenGenerativeUI**: CopilotKit이 공개한 에이전트 UI 생성 패턴. 에이전트가 React 컴포넌트를 동적으로 선택·렌더링
- **AG-UI Protocol**: CopilotKit이 2025년 공개한 에이전트↔UI 통신 표준. Google, AWS, Microsoft가 채택. 이벤트 기반 양방향 스트리밍
- **현재 프론트엔드**: React 18 + Vite + Tailwind CSS + Recharts + react-force-graph-2d + Radix UI. iframe 사용 없음
- **MCP Server**: svc-mcp-server가 Streamable HTTP + JSON-RPC 2.0 프로토콜로 가동 중. 515 published skills

### 1.3 Relationship with AIF-REQ-019

| 관계 | 설명 |
|------|------|
| **REQ-019** (Working Mock-up) | 추출 결과물이 동작 가능함을 증명하는 데모 사이트. 4개 데모(정책 엔진, Skill 호출, 온톨로지, 산출물 Export) |
| **REQ-024** (Generative UI) | Mock-up 사이트가 **소비하는 렌더링 엔진**. 에이전트가 동적으로 시각화를 생성하는 프레임워크 |
| **통합 방향** | REQ-024의 Widget Renderer + AG-UI를 REQ-019 app-mockup에 먼저 PoC 적용 → app-web으로 확장 |

### 1.4 Related Documents

- Requirements: [[AIF-REQ-024]], SPEC.md §7
- Working Mock-up Plan: [[AIF-PLAN-020]]
- AI Foundry PRD: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx`
- MCP Server: svc-mcp-server (Streamable HTTP, 515 published skills)
- OpenGenerativeUI: https://github.com/CopilotKit/OpenGenerativeUI
- AG-UI Protocol: https://docs.ag-ui.com

---

## 2. 현황 분석

### 2.1 현재 시각화 역량

| 카테고리 | 기술 | 사용처 | 한계 |
|----------|------|--------|------|
| **차트** | Recharts 3.8 | PolicyQualityChart, FactCheckAnalysis | 정적 데이터 바인딩, 새 차트 추가 시 코드 필요 |
| **그래프** | react-force-graph-2d | OntologyGraph (220줄) | Canvas 기반, 커스텀 노드 모양은 코드로 구현 |
| **게이지** | Custom SVG | ScoreGauge, TrustGaugeCard, ReadinessBar | 재사용 가능하나 에이전트 생성 불가 |
| **레이더** | Custom SVG | RadarChart (4축 스파이더) | 하드코딩된 축, 동적 축 추가 불가 |
| **보고서** | DynamicStatusReport | 7가지 contentType 렌더러 | API 기반이나 렌더러가 코드에 고정 |
| **마크다운** | markdown-content.tsx | Export Center, 보고서 | 테이블/인용 지원, HTML 렌더링 제한 |

### 2.2 부재 역량

| 필요 역량 | 현재 상태 | Generative UI 해결 방안 |
|-----------|-----------|-------------------------|
| 동적 시각화 생성 | 없음 — 모든 차트가 빌드 타임 결정 | Decision Matrix + LLM 생성 |
| AI 생성 콘텐츠 렌더링 | 없음 — 텍스트만 표시 | Sandboxed Widget Renderer (iframe) |
| 에이전트 실행 상태 스트리밍 | use-chat-stream.ts (텍스트 전용) | AG-UI Protocol (구조화 이벤트) |
| 대화 중 사용자 입력 수집 | 없음 — HITL은 별도 페이지 | HITL 컴포넌트 (에이전트 플로우 내) |
| 테마 주입 (iframe) | 없음 — iframe 미사용 | Bridge Layer + CSS 변수 포워딩 |

### 2.3 app-mockup 현황

app-mockup은 4개 데모가 구현되어 있으며 Vite + React + Tailwind + Pages Function 구조를 갖추고 있다:
- 정책 엔진: 키워드 매칭 기반 정책 검색 + PolicyCard
- Skill 호출기: svc-skill API 직접 호출 (L1) + EvaluationPanel
- 온톨로지 탐색기: D1 terms + SVG 그래프 (d3-force 레이아웃)
- 산출물 Export: 마크다운 미리보기 + 다운로드

이 기반 위에 Generative UI를 PoC로 추가한다.

---

## 3. Architecture

### 3.1 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (app-mockup / app-web)                │
│                                                                   │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ AG-UI Client   │  │ Decision Matrix  │  │ HITL Component   │  │
│  │ (Event Stream) │  │ (Type Selector)  │  │ (Approval Card)  │  │
│  └───────┬────────┘  └────────┬────────┘  └────────┬─────────┘  │
│          │                    │                     │             │
│          ▼                    ▼                     ▼             │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              Widget Renderer (Sandboxed iframe)             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐  │   │
│  │  │ Bridge   │ │ Theme    │ │ SVG Utils │ │ CSP Policy │  │   │
│  │  │ Layer    │ │ Layer    │ │ Layer     │ │ Layer      │  │   │
│  │  └──────────┘ └──────────┘ └───────────┘ └────────────┘  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
└────────────────────────────────┬──────────────────────────────────┘
                                 │ AG-UI Events (SSE/WebSocket)
                                 ▼
                    ┌────────────────────────┐
                    │   AG-UI Server Adapter  │
                    │   (svc-mcp-server 확장) │
                    └────────────┬───────────┘
                                 │ Service Bindings
                    ┌────────────┼────────────────┐
                    ▼            ▼                 ▼
              svc-policy    svc-skill         svc-ontology
              (D1 3,675)   (KV 3,924)        (Neo4j 3,880)
```

### 3.2 핵심 모듈 상세

#### Module 1: Sandboxed Widget Renderer

AI가 생성한 HTML/SVG/CSS를 안전하게 렌더링하는 iframe 기반 샌드박스.

```
┌─ Parent (React Component) ──────────────────────────────────┐
│                                                              │
│  <WidgetRenderer                                             │
│    content={agentGeneratedHtml}                              │
│    theme={currentTheme}                                      │
│    onAction={handleUserAction}                               │
│    maxHeight={600}                                           │
│  />                                                          │
│                                                              │
│  ┌─ iframe (sandbox="allow-scripts") ─────────────────────┐ │
│  │                                                          │ │
│  │  Layer 1: CSP Policy                                     │ │
│  │    - script-src 'unsafe-inline' (iframe 내부만)          │ │
│  │    - style-src 'unsafe-inline'                           │ │
│  │    - no external resource loading                        │ │
│  │                                                          │ │
│  │  Layer 2: Bridge Layer                                   │ │
│  │    - window.parent.postMessage → onAction callback       │ │
│  │    - resize observer → auto height adjustment            │ │
│  │    - error boundary → parent notification                │ │
│  │                                                          │ │
│  │  Layer 3: Theme Layer                                    │ │
│  │    - CSS variables from parent (--primary, --bg, etc.)   │ │
│  │    - Dark mode class toggle                              │ │
│  │    - Typography (Inter, IBM Plex Sans)                   │ │
│  │                                                          │ │
│  │  Layer 4: SVG Utilities                                  │ │
│  │    - D3.js subset (scales, shapes, axes)                 │ │
│  │    - Mermaid.js (flowchart, sequence, class diagram)     │ │
│  │    - Animation helpers (CSS transitions)                 │ │
│  │                                                          │ │
│  │  Layer 5: AI-Generated Content                           │ │
│  │    - HTML/SVG markup                                     │ │
│  │    - Inline styles + scripts                             │ │
│  │                                                          │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**보안 모델**:
- `sandbox="allow-scripts"` — DOM 격리, 부모 접근 차단
- `srcdoc` 사용 — 외부 URL 로딩 없음
- Bridge는 `postMessage` 기반 — origin 검증 필수
- CSP 메타 태그로 외부 리소스 차단

#### Module 2: AG-UI Protocol Adapter

에이전트 실행 상태를 구조화된 이벤트로 UI에 스트리밍하는 프로토콜 레이어.

**이벤트 타입**:

| Event | 용도 | Payload |
|-------|------|---------|
| `RUN_STARTED` | 에이전트 실행 시작 | `{ runId, agentName, taskDescription }` |
| `TEXT_MESSAGE_CONTENT` | 텍스트 메시지 청크 | `{ delta: string }` |
| `TOOL_CALL_START` | 도구 호출 시작 | `{ toolCallId, toolName, args }` |
| `TOOL_CALL_END` | 도구 호출 완료 | `{ toolCallId, result }` |
| `STATE_SYNC` | UI 상태 동기화 | `{ widgetHtml, visualizationType }` |
| `CUSTOM` (HITL) | 사용자 입력 요청 | `{ componentType, props, resumeToken }` |
| `RUN_FINISHED` | 에이전트 실행 완료 | `{ runId, summary }` |
| `RUN_ERROR` | 에이전트 실행 에러 | `{ runId, error }` |

**MCP Server 확장**:
```
기존 MCP Flow:
  POST /mcp/:skillId → JSON-RPC → tools/call → result

AG-UI 확장 Flow:
  POST /agent/run → SSE stream
    → RUN_STARTED
    → TOOL_CALL_START (skill evaluation)
    → STATE_SYNC (widget HTML)
    → CUSTOM (HITL approval needed)
    ← user input via POST /agent/resume
    → TOOL_CALL_END
    → RUN_FINISHED
```

#### Module 3: HITL Components

에이전트 플로우 중간에 사용자 입력을 수집하는 인터랙티브 컴포넌트.

| 컴포넌트 | 용도 | 트리거 |
|----------|------|--------|
| `PolicyApprovalCard` | 정책 승인/반려/수정 | 정책 추론 결과 검토 시 |
| `EntityConfirmation` | 엔티티 매핑 확인 | 온톨로지 정규화 모호성 발생 시 |
| `ParameterInput` | 추가 파라미터 요청 | Skill 실행에 정보 부족 시 |
| `VisualizationFeedback` | 시각화 만족도 | 생성된 시각화 검토 후 |

**플로우 예시 (정책 승인)**:
```
1. 에이전트: "퇴직연금 중도인출 정책을 분석합니다" (RUN_STARTED)
2. 에이전트: svc-policy에서 관련 정책 3건 조회 (TOOL_CALL_START/END)
3. 에이전트: 의존성 그래프 HTML 생성 (STATE_SYNC → Widget Renderer)
4. 에이전트: "정책 POL-PENSION-WD-001 승인이 필요합니다" (CUSTOM/HITL)
   → PolicyApprovalCard 렌더링 (승인/반려/수정 버튼)
   → 사용자가 "승인" 클릭
   → POST /agent/resume { decision: "approved", comment: "..." }
5. 에이전트: 승인 반영 후 최종 보고서 생성 (RUN_FINISHED)
```

#### Module 4: Decision Matrix

데이터 특성을 분석하여 최적 시각화 유형을 자동 선택하는 알고리즘.

| 데이터 특성 | 시각화 유형 | 렌더링 방식 |
|-------------|-------------|-------------|
| 알고리즘/의존성 그래프 | Animated Force Graph | SVG + D3 (iframe 내) |
| 시계열/수치 데이터 | Line/Bar Chart | Recharts 또는 SVG |
| 프로세스 흐름 | Mermaid Flowchart | Mermaid.js (iframe 내) |
| 계층 구조 | Tree Diagram | SVG + D3 hierarchy |
| 비교/매트릭스 | Table + Heatmap | HTML table (iframe 내) |
| 입력 폼 | Form Component | React (HITL 컴포넌트) |
| 텍스트 요약 | Markdown Card | 기존 MarkdownContent |

**분류 알고리즘**:
```
analyzeDataCharacteristics(data) → {
  hasTimeSeries: boolean,      // 시간축 존재
  hasHierarchy: boolean,       // 트리 구조
  hasGraph: boolean,           // 노드-엣지 관계
  hasNumericComparison: boolean, // 수치 비교
  hasProcessFlow: boolean,     // 순서/흐름
  requiresInput: boolean,      // 사용자 입력 필요
}
→ selectVisualizationType() → WidgetType
→ generatePrompt(type, data) → LLM
→ renderWidget(html)
```

### 3.3 Theme Injection

iframe 내부에 부모의 CSS 변수를 주입하는 메커니즘.

```
Parent (app-web / app-mockup)          iframe (Widget Renderer)
┌────────────────────┐                ┌────────────────────────┐
│ :root {            │  ──srcdoc──→   │ :root {                │
│   --primary: #1A365D│                │   --primary: #1A365D   │
│   --bg: #FFFFFF    │                │   --bg: #FFFFFF        │
│   --text: #1A202C  │                │   --text: #1A202C      │
│   --accent: #F6AD55│                │   --accent: #F6AD55    │
│ }                  │                │   --font-body: ...     │
│                    │                │ }                      │
│ .dark :root {      │  ──toggle──→   │ .dark :root {          │
│   --primary: ...   │  postMessage   │   --primary: ...       │
│   --bg: #1A202C    │                │   --bg: #1A202C        │
│ }                  │                │ }                      │
└────────────────────┘                └────────────────────────┘
```

- 초기 로드: `srcdoc`에 현재 테마의 CSS 변수를 `<style>` 블록으로 주입
- 테마 변경 시: `postMessage({ type: 'theme-update', variables: {...} })` → iframe 내부 스크립트가 `:root` 업데이트

---

## 4. Implementation Plan

### 4.1 Phase 1: app-mockup PoC (세션 2~3회)

Sandboxed Widget Renderer + Decision Matrix를 app-mockup에 PoC로 구현.

- [ ] **P1-1: Widget Renderer 코어** — iframe 샌드박스 + Bridge Layer + Theme injection
  - `WidgetRenderer.tsx` (React 컴포넌트)
  - `widget-bridge.ts` (postMessage 프로토콜)
  - `widget-theme.ts` (CSS 변수 시리얼라이저)
  - CSP 메타 태그 + sandbox 속성 설정
- [ ] **P1-2: SVG/Mermaid 유틸리티** — iframe 내부에서 사용할 시각화 라이브러리 번들
  - D3 subset (scales, shapes, axes) — CDN이 아닌 인라인 번들
  - Mermaid.js 런타임 (flowchart, sequence diagram)
  - Auto-resize observer
- [ ] **P1-3: Decision Matrix** — 데이터 특성 분석 + 시각화 유형 자동 선택
  - `analyzeDataCharacteristics()` 함수
  - `selectVisualizationType()` 매핑 로직
  - `generateVisualizationPrompt()` LLM 프롬프트 템플릿
- [ ] **P1-4: Demo 5 — Generative Visualization** — 기존 4개 데모에 5번째 데모 추가
  - 정책 의존성 그래프 생성 (LLM → SVG → Widget Renderer)
  - Skill 실행 결과 동적 차트 (Decision Matrix 기반 자동 선택)
  - 온톨로지 관계 Mermaid 다이어그램
- [ ] **P1-5: 보안 검증** — CSP 정책 테스트 + XSS 공격 벡터 검증
  - 악의적 스크립트 주입 테스트
  - 외부 리소스 차단 확인
  - postMessage origin 검증

### 4.2 Phase 2: AG-UI Protocol 통합 (세션 2~3회)

MCP Server에 AG-UI 이벤트 스트리밍을 추가하고 프론트엔드에 AG-UI 클라이언트를 구현.

- [ ] **P2-1: AG-UI Server Adapter** — svc-mcp-server에 `/agent/run` 엔드포인트 추가
  - SSE(Server-Sent Events) 스트리밍 핸들러
  - AG-UI 이벤트 타입 정의 (Zod 스키마)
  - 기존 MCP tools/call과 병행 운영
- [ ] **P2-2: AG-UI Client** — 프론트엔드 이벤트 소비 모듈
  - `useAgentStream()` React hook (기존 use-chat-stream.ts 확장)
  - 이벤트 디스패처 (이벤트 타입별 UI 업데이트)
  - 연결 복구 + 에러 핸들링
- [ ] **P2-3: Agent Run Panel** — 에이전트 실행 상태를 실시간 표시하는 UI
  - RunProgress 표시 (시작 → 도구 호출 → 시각화 생성 → 완료)
  - 도구 호출 로그 (ToolCallCard)
  - 생성된 위젯 실시간 렌더링 (STATE_SYNC → Widget Renderer)

### 4.3 Phase 3: HITL 컴포넌트 (세션 1~2회)

에이전트 플로우 중 사용자 인터랙션을 지원하는 컴포넌트 계층.

- [ ] **P3-1: HITL 기반 컴포넌트** — 에이전트가 렌더링을 요청하는 인터랙티브 카드
  - `PolicyApprovalCard` — 정책 승인/반려/코멘트
  - `EntityConfirmation` — 엔티티 매핑 확인 (2-3 후보 중 선택)
  - `ParameterInput` — 추가 정보 입력 폼
- [ ] **P3-2: Resume Protocol** — 사용자 입력을 에이전트에 전달하는 메커니즘
  - `POST /agent/resume` 엔드포인트 (svc-mcp-server)
  - resumeToken 기반 세션 연결
  - Durable Objects를 활용한 에이전트 상태 보존 (기존 HITL DO 패턴 재활용)

### 4.4 Phase 4: app-web 통합 (세션 2~3회)

PoC를 프로덕션 SPA에 통합.

- [ ] **P4-1: Widget Renderer 포팅** — app-mockup → app-web 컴포넌트 마이그레이션
  - 공통 패키지 추출 검토 (`packages/generative-ui/`)
  - 기존 페이지에 Widget Renderer 탑재 (Dashboard, Analysis Report, Ontology)
- [ ] **P4-2: 기존 시각화 보강** — 에이전트 생성 시각화를 기존 페이지에 추가
  - Dashboard: 동적 KPI 시각화
  - Analysis Report: 에이전트 분석 요약 위젯
  - Ontology: 동적 관계 다이어그램
- [ ] **P4-3: HITL 통합** — 기존 HITL 워크플로우에 에이전트 플로우 연결
  - Policy Review 페이지에 AG-UI 기반 승인 플로우 추가
  - 기존 HITL DO 세션과 AG-UI Resume 통합

---

## 5. Scope

### 5.1 In Scope

- [ ] Sandboxed Widget Renderer (iframe + CSP + Bridge + Theme injection)
- [ ] Decision Matrix (데이터 특성 분석 → 시각화 유형 자동 선택)
- [ ] AG-UI Protocol Adapter (svc-mcp-server SSE 확장)
- [ ] AG-UI Client (React hook + 이벤트 디스패처)
- [ ] HITL 컴포넌트 3종 (PolicyApprovalCard, EntityConfirmation, ParameterInput)
- [ ] Resume Protocol (에이전트 상태 보존 + 사용자 입력 전달)
- [ ] Theme Injection (CSS 변수 포워딩 + 다크 모드)
- [ ] Demo 5: Generative Visualization (app-mockup 내)
- [ ] app-web 통합 (Dashboard, Analysis Report, Ontology 3개 페이지)

### 5.2 Out of Scope

- Three.js 기반 3D 시각화 (Phase 2 이후 검토)
- 에이전트 자체 개발 (기존 svc-mcp-server + LLM Router 활용)
- 모바일 반응형 최적화
- 실시간 협업 (멀티 사용자 동시 HITL)
- 에이전트 오케스트레이션 프레임워크 자체 구축 (Foundry-X에 위임)
- OpenAPI adapter 생성 (기존 Skill Spec 어댑터와 별개)

---

## 6. Technical Details

### 6.1 기술 스택

| 영역 | 선택 | 근거 |
|------|------|------|
| **Widget Renderer** | iframe + srcdoc + postMessage | 완전한 DOM 격리, CSP 적용 가능, 외부 라이브러리 불필요 |
| **차트 생성** | D3.js subset (인라인 번들) | iframe 내에서 동작, CDN 의존성 없음, SVG 생성에 최적 |
| **다이어그램** | Mermaid.js (인라인 번들) | Flowchart/Sequence/Class diagram, LLM이 Mermaid 문법 생성에 능숙 |
| **AG-UI 스트리밍** | Server-Sent Events (SSE) | 단방향 스트리밍에 최적, Workers 환경 호환, WebSocket 대비 단순 |
| **HITL 상태** | Durable Objects | 기존 svc-policy HITL DO 패턴 재활용, 에이전트 세션 상태 보존 |
| **LLM 시각화 생성** | svc-llm-router (Sonnet) | Tier 2 라우팅, HTML/SVG/Mermaid 생성에 적합 |
| **타입 정의** | @ai-foundry/types 확장 | AG-UI 이벤트 + Widget 타입을 공유 패키지에 추가 |

### 6.2 Widget Renderer 보안 계층

| 계층 | 메커니즘 | 방어 대상 |
|------|----------|-----------|
| **L1: iframe sandbox** | `sandbox="allow-scripts"` (allow-same-origin 제외) | 부모 DOM 접근, 쿠키/스토리지 접근 |
| **L2: CSP 메타 태그** | `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">` | 외부 리소스 로딩, fetch/XHR |
| **L3: postMessage origin 검증** | `event.origin === expectedOrigin` | 크로스 오리진 메시지 위조 |
| **L4: 콘텐츠 검증** | LLM 출력 → sanitize (script 태그 허용 목록) → srcdoc | 악의적 스크립트 주입 |
| **L5: 크기 제한** | `maxHeight`, `maxWidth` 속성 | 리소스 남용 |

### 6.3 AG-UI 이벤트 스키마 (Zod)

```typescript
// @ai-foundry/types에 추가
const AgUiEventBase = z.object({
  type: z.string(),
  timestamp: z.number(),
  runId: z.string(),
});

const RunStartedEvent = AgUiEventBase.extend({
  type: z.literal('RUN_STARTED'),
  agentName: z.string(),
  taskDescription: z.string(),
});

const StateSyncEvent = AgUiEventBase.extend({
  type: z.literal('STATE_SYNC'),
  widgetHtml: z.string(),
  visualizationType: z.enum(['chart', 'graph', 'diagram', 'table', 'form', 'markdown']),
});

const HitlRequestEvent = AgUiEventBase.extend({
  type: z.literal('CUSTOM'),
  subType: z.literal('HITL_REQUEST'),
  componentType: z.enum(['PolicyApprovalCard', 'EntityConfirmation', 'ParameterInput']),
  props: z.record(z.unknown()),
  resumeToken: z.string(),
});
```

---

## 7. Build Sequence

| 순서 | 작업 | 산출물 | 예상 규모 |
|------|------|--------|-----------|
| **S1** | Widget Renderer 코어 | iframe 컴포넌트 + Bridge + Theme | ~400줄 |
| **S2** | SVG/Mermaid 유틸리티 번들 | 인라인 라이브러리 + 헬퍼 | ~300줄 |
| **S3** | Decision Matrix | 데이터 분석 + 시각화 선택 로직 | ~250줄 |
| **S4** | LLM 시각화 프롬프트 | 시각화 유형별 프롬프트 템플릿 | ~200줄 |
| **S5** | Demo 5 (app-mockup) | Generative Visualization 데모 페이지 | ~500줄 |
| **S6** | AG-UI Server Adapter | svc-mcp-server SSE 엔드포인트 | ~400줄 |
| **S7** | AG-UI Client Hook | useAgentStream + 이벤트 디스패처 | ~300줄 |
| **S8** | Agent Run Panel | 실시간 실행 상태 UI | ~350줄 |
| **S9** | HITL 컴포넌트 3종 | 승인/확인/입력 카드 | ~450줄 |
| **S10** | Resume Protocol | svc-mcp-server DO + resume 엔드포인트 | ~300줄 |
| **S11** | app-web 통합 | 3개 페이지 Widget Renderer 탑재 | ~400줄 |
| **S12** | 보안 테스트 + 최적화 | CSP 검증 + 성능 프로파일링 | ~150줄 |

**총 예상**: ~4,000줄 신규 코드, 세션 7~11회

---

## 8. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **iframe 성능 오버헤드** | Medium | Medium | Widget 크기 제한 + lazy loading. 단순 시각화는 iframe 없이 직접 렌더링하는 하이브리드 전략 |
| **LLM 생성 HTML 품질 편차** | High | High | Decision Matrix가 생성 프롬프트를 표준화. 유형별 Golden Template 제공. 실패 시 fallback(텍스트 전용 표시) |
| **CSP/sandbox 호환성 이슈** | Medium | Low | 주요 브라우저(Chrome, Firefox, Safari) sandbox 속성 동작 검증. Safari의 srcdoc CSP 제한 사항 사전 확인 |
| **AG-UI Protocol 안정성** | Medium | Medium | AG-UI는 비교적 신규 표준 — 코어 이벤트 타입만 채택하고 커스텀 확장은 최소화. SSE 기반으로 Workers 환경 호환성 확보 |
| **HITL DO 상태 관리 복잡도** | Medium | Medium | 기존 svc-policy HITL DO 패턴을 그대로 재활용. 신규 구현은 최소화하고 인터페이스만 AG-UI에 맞춤 |
| **Mermaid.js 번들 크기** | Low | Medium | Mermaid full (~2MB) 대신 필요 다이어그램 타입만 트리셰이킹. 또는 서버사이드 렌더링 후 SVG만 전달 |
| **테마 동기화 지연** | Low | Low | postMessage 이벤트 기반 즉시 동기화. 초기 로드 시 srcdoc에 현재 테마 포함 |

---

## 9. Success Criteria

### 9.1 Definition of Done

- [ ] Widget Renderer가 AI 생성 HTML/SVG를 3가지 이상 유형으로 정상 렌더링
- [ ] Decision Matrix가 데이터 특성에 따라 4가지 이상 시각화 유형을 자동 선택
- [ ] AG-UI 이벤트 스트리밍으로 에이전트 실행 상태가 실시간 UI에 반영
- [ ] HITL 컴포넌트로 에이전트 플로우 중 사용자 입력 수집 후 에이전트 재개 동작
- [ ] 다크 모드 전환 시 iframe 내부 테마가 즉시 동기화
- [ ] CSP + sandbox로 XSS 공격 벡터 차단 검증 (3가지 이상 공격 시나리오)

### 9.2 Performance Criteria

| 항목 | 기준 | 측정 방법 |
|------|------|-----------|
| Widget 초기 렌더링 | < 500ms | Performance.mark() |
| AG-UI 이벤트 지연 | < 200ms (SSE 전송) | 서버 timestamp vs 클라이언트 수신 |
| LLM 시각화 생성 | < 5s (Sonnet 기준) | svc-llm-router 응답 시간 |
| HITL 재개 응답 | < 1s (사용자 입력 → 에이전트 재개) | DO alarm 트리거 시간 |
| Theme 동기화 | < 100ms | postMessage → 렌더링 완료 |

### 9.3 Quality Criteria

- [ ] TypeScript strict mode 통과 (모든 신규 코드)
- [ ] Lint 에러 0건
- [ ] Widget Renderer 단위 테스트 10건 이상
- [ ] AG-UI 이벤트 핸들링 테스트 8건 이상
- [ ] CSP 보안 테스트 5건 이상

---

## 10. Next Steps

1. [ ] Design 문서 작성 (`generative-ui-framework.design.md`) — 컴포넌트 상세 설계 + API 인터페이스
2. [ ] Widget Renderer PoC 시작 (P1-1: iframe + Bridge + Theme)
3. [ ] Decision Matrix 프로토타입 (P1-3: 데이터 분석 알고리즘)
4. [ ] AG-UI Protocol 스펙 상세 검토 (https://docs.ag-ui.com)
5. [ ] Mermaid.js 번들 크기 + Workers 환경 호환성 PoC

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-18 | Initial draft — 4 modules (Widget Renderer, AG-UI, HITL, Decision Matrix) + 4-phase plan + security model | Sinclair Seo |
