---
code: AIF-PLAN-026B
title: "Foundry-X MCP 통합 Phase 1-2 — 다중 Skill 등록 + R2 수정"
version: "1.0"
status: Active
category: PLAN
created: 2026-03-19
updated: 2026-03-19
author: Sinclair Seo
feature: req-026-phase-1-2
refs: "[[AIF-PLAN-026]] [[AIF-RPRT-028]]"
---

# Foundry-X MCP 통합 Phase 1-2 — 다중 Skill 등록 + R2 수정

> **Parent**: [[AIF-PLAN-026]] Foundry-X 통합 로드맵 Phase 1
> **Predecessor**: Phase 1-1 PoC 완료 (9/9 PASS, 세션 173)
> **REQ**: AIF-REQ-026 (P1, IN_PROGRESS)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Phase 1-1에서 단일 skill MCP 왕복이 검증되었으나, bundled skills(12개)가 R2에 미업로드되어 MCP adapter가 404 반환. 26개 bundled skills를 Foundry-X에 개별 등록하면 레지스트리 관리 비용이 선형 증가 |
| **Solution** | (1) rebundle 스크립트로 R2에 bundled skills 재업로드, (2) org 단위 통합 MCP 엔드포인트(`POST /mcp/org/:orgId`) 추가로 조직별 전체 skill 도구를 단일 서버에서 노출, (3) Foundry-X에 org 단위 MCP 서버 등록 |
| **Function/UX Effect** | Foundry-X 에이전트가 "LPON 온누리상품권 충전 정책" 같은 도메인 질문에 대해 848개 정책 도구 중 적합한 것을 자동 선택·호출. org 1개 등록으로 전체 skill 도구 접근 가능 |
| **Core Value** | Skill당 1서버에서 Org당 1서버로 전환하여 MCP 등록·관리 복잡도를 O(N)→O(1)로 축소. bundled skills R2 gap 해소로 26개 전체 skill MCP 활성화 |

---

## 1. 배경 및 현재 상태

### 1.1 Phase 1-1 PoC 결과

| 항목 | 결과 |
|------|------|
| MCP 왕복 검증 | 9/9 PASS (initialize → tools/list → tools/call) |
| 검증 대상 | superseded skill 1개 (R2 존재) |
| Foundry-X 등록 | McpServerRegistry D1 등록 + HttpTransport 연동 확인 |
| 프로토콜 | Streamable HTTP, `Accept: application/json, text/event-stream` |
| 인증 | Bearer INTERNAL_API_SECRET |

### 1.2 미해결 이슈

| # | 이슈 | 영향 |
|---|------|------|
| I-1 | **Bundled skills R2 미업로드** — rebundle 시 `wrangler r2 object put`이 `--remote` 없이 로컬에만 저장됨 (84d31d0에서 수정) | MCP adapter 404 (D1 r2_key는 있지만 R2 파일 없음) |
| I-2 | **Skill당 1 MCP 서버** — 현재 `POST /mcp/:skillId`가 skill별 독립 서버 | 26개 bundled skills → 26번 개별 등록 필요 |
| I-3 | **KV 캐시 무효화** — bundled skills R2 업로드 후 기존 KV 캐시가 404를 캐시할 수 있음 | MCP adapter가 캐시된 에러 반환 |

---

## 2. 목표

### 2.1 Phase 1-2 완료 기준

1. ✅ LPON 12개 bundled skills가 R2에 업로드되어 MCP adapter 200 반환
2. ✅ `POST /mcp/org/:orgId` 엔드포인트에서 org 전체 skill 도구 단일 서버 노출
3. ✅ Foundry-X에 org 단위 MCP 서버 1개 등록 → tools/list → 848개 도구 반환
4. ✅ Foundry-X 에이전트가 tools/call → 정책 평가 결과 반환 (E2E 왕복)

### 2.2 비목표

- Miraeasset rebundle (별도 세션)
- Phase 2 반제품 파이프라인 (후속)
- Foundry-X TaskType 확장 (Phase 1-3)

---

## 3. 실행 계획

### Task 1: Bundled Skills R2 재업로드 (30분)

**목적**: I-1 해소 — 12개 bundled skills를 production R2에 업로드

**방법**:
1. `scripts/rebundle-production.ts`의 R2 업로드 로직 확인 (이미 `--remote` 수정 완료)
2. D1에서 bundled skill 목록 조회 (`status='bundled' AND organization_id='LPON'`)
3. 각 skill의 `r2_key`에 해당하는 파일을 R2에 업로드
4. KV 캐시 무효화 (`mcp-adapter:*` 키 삭제)

**검증**:
```bash
# bundled skill 1개의 MCP adapter 확인
curl -H "X-Internal-Secret: ..." \
  https://svc-skill.ktds-axbd.workers.dev/skills/{bundledSkillId}/mcp
# 200 + tools[] 반환 확인
```

**산출물**: R2에 12개 `.skill.json` 파일 + KV 캐시 초기화

### Task 2: Org 단위 통합 MCP 엔드포인트 (1~2시간)

**목적**: I-2 해소 — org별 전체 skill 도구를 단일 MCP 서버에서 노출

**변경 대상**: `services/svc-mcp-server/src/index.ts`

**설계**:
```
POST /mcp/org/:orgId
  ├─ initialize → "ai-foundry-{orgId}" 서버 정보
  ├─ tools/list → org의 모든 bundled skills 정책 → 도구 목록 (합산)
  └─ tools/call → toolName에서 policyCode 추출 → 해당 skill 찾아 evaluate
```

**핵심 로직**:
1. `GET /skills?organizationId={orgId}&status=bundled` → D1에서 org의 bundled skills 목록 조회
2. 각 skill의 MCP adapter를 병렬로 fetch → 도구 목록 합산
3. tools/call 시 tool name에서 policy code 역매핑 → 해당 skillId 찾기
4. KV 캐시: `mcp-org-adapter:{orgId}` 키로 합산 결과 캐싱 (TTL 1h)

**svc-skill 확장** (선행):
- `GET /skills?organizationId={orgId}&status=bundled` — 기존 list API에 status 필터 추가 (이미 존재 확인 필요)
- `GET /skills/org/:orgId/mcp` — org 전체 MCP adapter 합산 엔드포인트 (신규)

**산출물**: svc-mcp-server + svc-skill 코드 변경 + 테스트

### Task 3: Foundry-X Org 단위 MCP 등록 (30분)

**목적**: Foundry-X McpServerRegistry에 org 단위 서버 등록

**방법**:
```bash
# Foundry-X에 LPON org 서버 등록
curl -X POST https://foundry-x.../api/mcp-servers \
  -H "Authorization: Bearer ..." \
  -d '{
    "name": "ai-foundry-lpon",
    "url": "https://svc-mcp-server.ktds-axbd.workers.dev/mcp/org/LPON",
    "description": "AI Foundry 온누리상품권 도메인 — 848 정책 도구",
    "apiKey": "INTERNAL_API_SECRET_VALUE"
  }'
```

**검증**: `GET /mcp-servers/{id}/tools` → 848개 도구 반환 확인

### Task 4: E2E 왕복 검증 (30분)

**목적**: Foundry-X 에이전트가 org 단위 MCP 서버를 통해 정책 평가 성공

**시나리오**:
```
1. Foundry-X에서 tools/list 호출 → 848개 도구 확인
2. tools/call: "온누리상품권 충전 한도가 얼마인지 확인해줘"
   → AI Foundry evaluatePolicy() → 정책 평가 결과 반환
3. 결과에 policyCode, confidence, reasoning 포함 확인
```

**산출물**: E2E 검증 로그 + 성공/실패 기록

---

## 4. 기술 상세

### 4.1 Org MCP 서버 아키텍처

```
Foundry-X AgentRunner
  └─ McpRunner.connect("ai-foundry-lpon")
       │
       ▼
svc-mcp-server POST /mcp/org/LPON
  ├─ initialize: { name: "ai-foundry-lpon", version: "0.6.0" }
  ├─ tools/list:
  │    └─ svc-skill GET /skills/org/LPON/mcp
  │         ├─ DB: SELECT * FROM skills WHERE organization_id='LPON' AND status='bundled'
  │         ├─ R2: 12개 .skill.json fetch (병렬)
  │         └─ 848개 도구 합산 반환 (KV 캐시 1h)
  └─ tools/call:
       ├─ toolName → policyCode 대문자 변환
       ├─ policyCode → skillId 역매핑 (합산 시 매핑 테이블 구축)
       └─ svc-skill POST /skills/{skillId}/evaluate { policyCode, context }
```

### 4.2 도구 이름 충돌 해결

- 현재 도구 이름 = `policy.code.toLowerCase()` (예: `pol-gv-sec-001`)
- 12개 bundled skills 내 정책 코드는 고유 (도메인별 분류)
- 충돌 가능성 낮으나, 합산 시 중복 체크 로직 추가

### 4.3 성능 고려

- 848개 도구의 tools/list 페이로드 크기: ~200KB (JSON)
- KV 캐시로 반복 요청 최소화
- tools/call은 개별 skill evaluate 호출 → 기존 성능 동일

---

## 5. 변경 파일 예상

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `services/svc-mcp-server/src/index.ts` | **수정** | `/mcp/org/:orgId` 라우트 추가 |
| `services/svc-skill/src/routes/mcp.ts` | **수정** | org 단위 합산 MCP adapter 핸들러 추가 |
| `services/svc-skill/src/index.ts` | **수정** | 새 라우트 등록 |
| `scripts/upload-bundled-r2.ts` | **신규** | bundled skills R2 재업로드 스크립트 |
| `services/svc-mcp-server/tests/*.test.ts` | **수정** | org MCP 엔드포인트 테스트 추가 |
| `services/svc-skill/tests/*.test.ts` | **수정** | org MCP adapter 테스트 추가 |

---

## 6. 리스크

| # | 리스크 | 영향 | 대응 |
|---|--------|------|------|
| R-1 | 848개 도구가 MCP 클라이언트 한도 초과 가능 | tools/list 타임아웃 또는 메모리 초과 | 페이지네이션 또는 도메인별 분할 검토 |
| R-2 | rebundle 스크립트 R2 업로드 실패 시 부분 업로드 | 일부 skill만 MCP 활성화 | 업로드 후 D1 r2_key 기준 전수 검증 |
| R-3 | Foundry-X HttpTransport가 대량 tools/list에 대한 SSE 스트리밍 미지원 | 연결 실패 | enableJsonResponse: true (현재 설정) 유지 |

---

## 7. 일정

| Task | 예상 | 의존성 |
|------|------|--------|
| Task 1: R2 재업로드 | 30분 | 없음 |
| Task 2: Org MCP 엔드포인트 | 1~2시간 | Task 1 완료 후 |
| Task 3: Foundry-X 등록 | 30분 | Task 2 배포 후 |
| Task 4: E2E 검증 | 30분 | Task 3 |
| **합계** | **3~4시간** | |

---

## 참조 문서

| 문서 | 위치 |
|------|------|
| 전체 통합 로드맵 | `docs/01-plan/features/foundry-x-integration.plan.md` [[AIF-PLAN-026]] |
| Phase 1-1 완료 보고서 | `docs/04-report/AIF-RPRT-028_mcp-integration-phase-1-1.md` [[AIF-RPRT-028]] |
| 비교 분석서 | `docs/03-analysis/AIF-ANLS-026_foundry-x-integration-analysis.md` [[AIF-ANLS-026]] |
