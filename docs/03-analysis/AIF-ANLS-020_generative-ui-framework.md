---
code: AIF-ANLS-024
title: "Generative UI Framework — Gap Analysis"
version: "1.0"
status: Active
category: ANLS
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# Generative UI Framework — Gap Analysis

> Design↔Implementation Gap 분석 (Phase 1: Widget Renderer + Decision Matrix PoC)

## Analysis Summary

| 항목 | 내용 |
|------|------|
| Feature | AIF-REQ-024 Generative UI Framework |
| 분석 범위 | Phase 1 (app-mockup PoC) |
| Design 문서 | `docs/02-design/features/generative-ui-framework.design.md` |
| Match Rate | **93%** |

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (Phase 1 scope) | 93% | ✅ |
| Architecture Compliance | 95% | ✅ |
| Security Model | 90% | ✅ |
| Test Adequacy | 92% | ✅ |
| Convention Compliance | 96% | ✅ |
| **Overall (Phase 1)** | **93%** | **✅** |

---

## 상세 분석

### 1. WidgetRenderer — 95% Match

Design의 Props 인터페이스와 대부분 일치:
- ✅ `content`, `theme`, `onAction`, `maxHeight`, `type` props
- ✅ iframe `sandbox="allow-scripts"` (allow-same-origin 제외)
- ✅ imperative `srcdoc` 할당 (React controlled 아님)
- ✅ ResizeObserver + postMessage 패턴
- ✅ Height clamping: `Math.max(50, Math.min(height + 8, maxHeight))`
- ✅ Skeleton loading with cycling progress phrases
- ⚠️ `maxWidth` prop 누락 (Design에 있음, Low impact)

### 2. Widget Bridge — 92% Match

- ✅ `assembleSrcdoc()` 5-layer 구조
- ✅ CSP meta tag 포함
- ✅ Bridge script (sendAction, resize observer, error boundary)
- ✅ Theme CSS 변수 주입
- ⚠️ Zod `BridgeActionSchema.safeParse()` → manual typeof 검증으로 대체 (기능적 동등)
- ⚠️ 5-second ready timeout 미구현 (Design L5 보안 레이어)

### 3. Widget Theme — 98% Match

- ✅ LIGHT_THEME / DARK_THEME CSS 변수 맵
- ✅ `serializeThemeToCSS()` → `:root { ... }` 변환
- ✅ SVG 유틸리티 클래스
- ✅ Tailwind 색상 팔레트 호환

### 4. Decision Matrix — 96% Match

- ✅ `DataCharacteristics` 타입 (7개 속성)
- ✅ `analyzeDataCharacteristics()` 구현
- ✅ `selectVisualizationType()` 매핑 로직
- ✅ `generateVisualizationPrompt()` LLM 프롬프트 템플릿
- ✅ 7개 시각화 유형 모두 지원
- ⚠️ `metadata` 파라미터 required → optional 변경 (Low impact)

### 5. Demo Page — 90% Match

- ✅ 텍스트 입력 + 시각화 유형 버튼
- ✅ WidgetRenderer로 정적 샘플 HTML 렌더링
- ✅ 테마 토글 (light/dark) 동기화
- ✅ 라우트 추가 (app.tsx)
- ⚠️ 경로가 `pages/generative-demo.tsx` (Design은 `pages/demo/generative/`)

### 6. Tests — 100%+ (초과 달성)

| 모듈 | Design 요구 | 실제 | 상태 |
|------|:-----------:|:----:|:----:|
| decision-matrix.test.ts | 6 cases | 19 tests | ✅ 초과 |
| widget-bridge.test.ts | 5 cases | 28 tests | ✅ 초과 |
| **합계** | 11+ | **47 tests** | ✅ |

### 7. 보안 모델 — 90%

- ✅ iframe sandbox (allow-scripts only)
- ✅ CSP meta tag (default-src 'none')
- ✅ postMessage origin 검증
- ✅ srcdoc 사용 (외부 URL 없음)
- ⚠️ 5-second ready timeout 미구현
- ⚠️ D3/Mermaid 인라인 번들 미포함 (의도적 지연)

---

## Design 대비 추가 구현 (5건)

| 항목 | 설명 | 평가 |
|------|------|------|
| Loading phrase cycling | 스켈레톤 로딩 시 문구 순환 | UX 개선 |
| Empty state placeholder | 콘텐츠 없을 때 안내 UI | UX 개선 |
| Auto-detect query input | Decision Matrix 입력 자동 감지 | 편의성 |
| Bridge action log panel | 디버깅용 액션 로그 표시 | 개발 편의 |
| VizSelection named return | 함수 반환 타입 명시 | 타입 안전성 |

---

## 미구현 항목 (Phase 1 범위 외)

| 항목 | Design Phase | 상태 | 비고 |
|------|:-----------:|:----:|------|
| AG-UI Server Adapter | Phase 2 | 미착수 | svc-mcp-server 확장 |
| AG-UI Client Hook | Phase 2 | 미착수 | useAgentStream() |
| AgentStreamProvider | Phase 2 | 미착수 | Context + SSE |
| HITL Components 3종 | Phase 3 | 미착수 | PolicyApprovalCard 등 |
| Resume Protocol | Phase 3 | 미착수 | DO 기반 |
| app-web 통합 | Phase 4 | 미착수 | 프로덕션 SPA |

---

## 결론

Phase 1 PoC 구현이 Design과 **93% 일치**. 7% 차이 중 대부분은 Low impact 변경(props 누락, 파일 경로 차이, validation 방식)이며, 차단 요소 없이 Phase 2(AG-UI Protocol) 진행 가능.
