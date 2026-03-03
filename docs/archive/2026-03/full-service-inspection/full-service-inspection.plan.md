# Plan: 전체 서비스 점검 및 테스트 시나리오

> **Feature**: full-service-inspection
> **Created**: 2026-03-04
> **Phase**: Phase 3 완료 후 품질 점검
> **Scope**: 12 Workers + 2 packages + 1 SPA

---

## 1. 배경

Phase 3 Sprint 3까지 완료된 시점에서, 12개 서비스 전체의 코드 품질·테스트 커버리지·아키텍처 일관성을 점검한다.
현재 1,072 tests / 62 test files이 존재하며, 서비스별 편차가 크다.

---

## 2. 현재 상태 (As-Is)

### 테스트 커버리지

| Service | Tests | Files | 상태 |
|---------|-------|-------|------|
| svc-ingestion | 175 | 6 | Excellent |
| svc-security | 153 | 5 | Excellent |
| svc-skill | 151 | 12 | Excellent |
| svc-llm-router | 134 | 9 | Excellent |
| svc-extraction | 116 | 6 | Strong |
| svc-ontology | 100 | 4 | Strong |
| svc-policy | 75 | 7 | Gap: quality-trend, reasoning 미테스트 |
| svc-governance | 75 | 4 | Gap: golden-tests 미테스트 |
| svc-queue-router | 43 | 1 | Strong (단일 파일) |
| svc-analytics | 22 | 3 | Minimal |
| svc-notification | 16 | 2 | Minimal |
| svc-mcp-server | 12 | 1 | Critical: route 테스트 없음 |

### 미테스트 영역
- **packages/utils**: 테스트 0건
- **apps/app-web**: 컴포넌트 테스트 0건
- **svc-mcp-server**: handler 테스트만, HTTP route 테스트 없음
- **svc-policy**: quality-trend.ts, reasoning.ts route 미테스트
- **svc-governance**: golden-tests.ts route 미테스트

---

## 3. 점검 계획

### Phase A: Critical Gap 해소 (우선순위 높음)

#### A-1. svc-mcp-server route 테스트
- POST `/mcp/:skillId` — JSON-RPC initialize, tools/list, tools/call
- OPTIONS CORS preflight
- Bearer token + X-Internal-Secret 인증
- 잘못된 JSON-RPC request 에러 핸들링

#### A-2. svc-policy 미테스트 route
- GET `/policies/quality-trend` — 기간별 정책 품질 추이
- POST `/policies/:id/reasoning` — 정책 추론 근거 조회

#### A-3. svc-governance 미테스트 route
- GET `/golden-tests` — Golden Test Set 조회

### Phase B: Minimal 서비스 보강 (우선순위 중)

#### B-1. svc-analytics 테스트 확장
- GET `/kpi` — KPI 집계 정확성
- GET `/cost` — 비용 breakdown 계산
- GET `/dashboards` — 복합 대시보드 데이터
- GET `/quality` — 품질 메트릭
- POST `/internal/queue-event` — 이벤트 처리

#### B-2. svc-notification 테스트 확장
- GET `/notifications?userId=...` — 필터링, 페이지네이션
- PATCH `/notifications/:id/read` — 읽음 처리
- POST `/internal/queue-event` — 알림 생성

#### B-3. packages/utils 테스트 추가
- response.ts: ok, err, notFound, unauthorized, badRequest, forbidden, errFromUnknown
- rbac.ts: extractRbacContext, checkPermission, logAudit
- 기타 유틸 함수

### Phase C: 아키텍처 일관성 점검 (우선순위 중)

#### C-1. 인증 패턴 일관성
- 12개 서비스 모두 X-Internal-Secret 검증 동일한지
- /health 엔드포인트 인증 면제 일관성
- svc-mcp-server의 Bearer token 인증이 spec 대로인지

#### C-2. 응답 포맷 일관성
- `{success, data}` / `{success, error}` 패턴 전 서비스 준수 여부
- 에러 코드 (NOT_FOUND, VALIDATION_ERROR 등) 일관성

#### C-3. Queue 이벤트 처리 일관성
- 7개 서비스의 `/internal/queue-event` 핸들러 패턴
- safeParse → 처리 → D1 기록 패턴 일관성

#### C-4. RBAC + Audit 통합
- extractRbacContext + checkPermission 호출 일관성
- ctx.waitUntil 기반 비동기 audit 로깅

### Phase D: Frontend 검증 (우선순위 낮음)

#### D-1. app-web 빌드 검증
- `bun run build` 성공 여부
- TypeScript 에러 없음 확인

#### D-2. 페이지 라우팅 검증 (수동)
- 14개 페이지 라우트 접근 가능 여부

---

## 4. 테스트 시나리오

### TS-01: 서비스 Health Check (전체)

```
대상: 12개 서비스
방법: 각 서비스 GET /health → 200 + JSON
기대: { status: "ok", service: "<name>", timestamp: "<ISO>" }
실행: scripts/health-check.sh 또는 curl 수동
```

### TS-02: 인증 거부 시나리오

```
대상: 12개 서비스 (queue-router 제외)
방법: X-Internal-Secret 없이 API 호출
기대: 401 Unauthorized
변형:
  - 헤더 누락 → 401
  - 잘못된 값 → 401
  - /health는 인증 없이 200
```

### TS-03: 파이프라인 E2E (Stage 1→5)

```
대상: svc-ingestion → extraction → policy → ontology → skill
방법: /e2e-pipeline 스킬 실행
기대: 각 Stage 정상 완료, D1 기록 확인
입력: synthetic 문서 (txt, xlsx)
```

### TS-04: LLM Multi-Provider Fallback

```
대상: svc-llm-router
방법: tier 1/2/3 각각 호출
기대:
  - Anthropic 정상 시 → Anthropic 응답
  - Anthropic 실패 시 → OpenAI fallback
  - OpenAI 실패 시 → Google fallback
변형: streaming (POST /stream) + non-streaming (POST /complete)
```

### TS-05: MCP Server JSON-RPC

```
대상: svc-mcp-server
방법: curl로 JSON-RPC 2.0 호출
시나리오:
  1. POST /mcp/:skillId — {"method":"initialize"} → capabilities 응답
  2. POST /mcp/:skillId — {"method":"tools/list"} → 도구 목록
  3. POST /mcp/:skillId — {"method":"tools/call","params":{"name":"..."}} → 실행 결과
  4. 잘못된 method → JSON-RPC error (-32601)
  5. Bearer token 누락 → 401
```

### TS-06: HITL 세션 라이프사이클

```
대상: svc-policy (Durable Objects)
방법: 정책 추론 → 세션 생성 → 승인/반려 → 세션 종료
기대: DO 상태 전이, D1 기록, Queue 이벤트 발행
```

### TS-07: Queue Router 이벤트 디스패치

```
대상: svc-queue-router
방법: 10개 이벤트 타입 각각 전송
기대: 올바른 서비스로 fan-out
  - document.uploaded → svc-ingestion
  - document.parsed → svc-extraction
  - extraction.completed → svc-policy
  - policy.inferred → svc-ontology
  - ontology.normalized → svc-skill
  - (etc.)
```

### TS-08: 보안 — PII 마스킹

```
대상: svc-security
방법: POST /mask — 개인정보 포함 텍스트 전송
기대: PII 토큰 치환, 원본 매핑 D1 저장
변형:
  - 한국어 이름/주민번호
  - 영문 이메일/전화번호
  - 복합 PII (여러 유형 혼합)
```

### TS-09: Skill 검색 + Marketplace

```
대상: svc-skill
방법: GET /skills/search?q=...&tag=...&subdomain=...&sort=...
기대: 필터링, 정렬, 페이지네이션 정상
변형:
  - 키워드 검색
  - 태그 필터
  - subdomain 필터
  - 복합 조건
```

### TS-10: Frontend 빌드 + 타입체크

```
대상: apps/app-web
방법: cd apps/app-web && bun run build
기대: 에러 0건, dist/ 생성
```

---

## 5. 실행 순서

```
1. Phase A (Critical Gap)  → 테스트 코드 작성
2. Phase C (일관성 점검)    → 에이전트 기반 자동 검증
3. Phase B (Minimal 보강)  → 테스트 코드 작성
4. Phase D (Frontend)      → 빌드 + 수동 검증
5. TS-01~10 시나리오 실행   → 결과 기록
6. Gap Analysis            → /pdca analyze
```

---

## 6. 성공 기준

- [ ] 전체 테스트 PASS (0 failures)
- [ ] Critical Gap 3건 해소 (A-1, A-2, A-3)
- [ ] 아키텍처 일관성 검증 통과 (C-1~C-4)
- [ ] TS-01~TS-10 시나리오 실행 결과 기록
- [ ] 테스트 수 1,072 → 1,150+ 달성
