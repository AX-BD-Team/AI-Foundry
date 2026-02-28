# CHANGELOG

> 세션 히스토리 아카이브 (최신이 상단)

## 세션 012 — 2026-02-28

- ✅ **H-01: Unit test 인프라 + 테스트 작성** — 132 tests, 60%+ coverage 달성
  - vitest + @vitest/coverage-v8 설치 (root devDependencies)
  - svc-policy: 7 test files, 64 tests, 73.55% Stmts coverage
    - hitl-session.test.ts (16): DO 상태머신 init/assign/action/routing
    - hitl.test.ts (14): approve/modify/reject/getSession 핸들러
    - policies.test.ts (15): extractJsonArray + formatPolicyRow 순수함수
    - policies-handlers.test.ts (5): list/get 핸들러 D1 mock
    - policy.test.ts (6): buildPolicyInferencePrompt 프롬프트
    - caller.test.ts (4): callOpusLlm Fetcher mock
    - handler.test.ts (4): queue event 처리
  - svc-skill: 7 test files, 68 tests, 80.41% Stmts coverage
    - skill-builder.test.ts (18): aggregateTrust + buildSkillPackage
    - skills.test.ts (16): parseTags + rowToSummary + rowToDetail
    - skills-handlers.test.ts (9): list/get/download 핸들러
    - mcp.test.ts (13): toMcpAdapter policy→tool 변환
    - mcp-handler.test.ts (4): handleGetMcpAdapter
    - caller.test.ts (4): callSonnetLlm
    - handler.test.ts (4): queue event 처리
- ⏳ **H-02: app-web Pages 배포** — 빌드 성공 (51 modules), API 토큰 미설정으로 배포 보류

**검증**
- typecheck: svc-policy, svc-skill pass
- test: 132/132 pass

## 세션 011 — 2026-02-28

- ✅ **G-02b: svc-policy LLM 프롬프트 수정** — JSON-only 출력 강제 + extractJsonArray 로버스트 파싱
  - system prompt에 CRITICAL RULES 추가 (순수 JSON 배열만 반환)
  - `extractJsonArray()` 헬퍼: markdown fence 제거 + `[...]` 스팬 추출
  - E2E Stage 4 통과 (7 policy candidates 생성)
- ✅ **G-02c: E2E 8/8 PASS** — HITL + D1 race condition + UNIQUE 제약 해결
  - `handleApprovePolicy`: DO session `open` 시 자동 assign 후 action (auto-assign 패턴)
  - policy/session D1 INSERT: `ctx.waitUntil()` → `await` 동기화 (race condition 해소)
  - `db-policy/0002_drop_unique_policy_code.sql`: policy_code UNIQUE 제약 제거
  - E2E script: CreateSkillRequestSchema 정합 (PolicySchema, OntologyRef, Provenance)
- ✅ **G-03: MCP 어댑터** — `GET /skills/:id/mcp` 엔드포인트
  - `services/svc-skill/src/routes/mcp.ts`: .skill.json → MCP tool definitions on-the-fly 변환
  - 다운로드 로그 기록 (adapter_type: 'mcp')
- ✅ **G-04: app-web Persona 화면** — 9개 페이지 + API 클라이언트 5개
  - Persona A: upload.tsx, pipeline.tsx, comparison.tsx
  - Persona C: skill-catalog.tsx, skill-detail.tsx
  - Persona D: results.tsx, audit.tsx
  - Persona E: dashboard.tsx, cost.tsx
  - API clients: ingestion, extraction, skill, security, governance
- ✅ svc-policy + svc-skill 재배포 (3회)
- ✅ db-policy migration 0002 remote 적용
- ✅ **Phase G 완료** → Phase H (Hardening) 진입

**검증**
- typecheck: 16/16 pass
- E2E: **8/8 PASS** (upload → extraction → policy → approve → ontology → skill → download)

---

## 세션 010 — 2026-02-28

- ✅ **G-02 E2E 파이프라인 통합 테스트** — 이벤트 체인 3건 버그 수정 + E2E 스크립트
  - BUG-1: svc-ingestion `ingestion.completed` 이벤트 미발행 → ctx 추가 + QUEUE_PIPELINE.send()
  - BUG-2: svc-extraction 실제 청크 미조회 + `extraction.completed` 미발행 → SVC_INGESTION 바인딩 + 이벤트 발행
  - BUG-3: DB 스키마 `extraction_id → id` 불일치 + `organization_id` NOT NULL 대응
  - `packages/types/src/events.ts`: IngestionCompletedEventSchema 추가
  - `infra/migrations/db-structure/0002_fix_schema.sql`: 컬럼 rename + missing columns
  - `services/svc-ingestion/src/queue.ts`: ctx 추가 + ingestion.completed 발행
  - `services/svc-ingestion/src/index.ts`: GET /documents/:id/chunks 엔드포인트 추가
  - `services/svc-extraction/wrangler.toml` + `env.ts`: QUEUE_PIPELINE + SVC_INGESTION 바인딩
  - `services/svc-extraction/src/queue/handler.ts`: 전면 리팩토링 (fetchChunks + 이벤트 발행)
  - `services/svc-extraction/src/routes/extract.ts`: extraction.completed 이벤트 발행 + organizationId
  - `services/svc-queue-router/src/index.ts`: ingestion.completed → SVC_EXTRACTION 라우팅
  - `scripts/test-e2e-pipeline.sh`: 8단계 하이브리드 E2E 테스트
- ✅ 3개 서비스 재배포 (svc-queue-router, svc-ingestion, svc-extraction) + DB 마이그레이션 적용
- ✅ INTERNAL_API_SECRET 전 서비스 변경 (`e2e-test-secret-2026`)
- ⚠️ svc-policy LLM 프롬프트 이슈 잔여 (Opus가 non-JSON 반환 → E2E Stage 4 실패)

**검증**
- typecheck: 16/16 pass
- E2E: Stage 1-3 PASS, Stage 4 FAIL (policy LLM prompt issue)

---

## 세션 009 — 2026-02-28

- ✅ **G-01 Queue Router + 전 서비스 배포**
  - Cloudflare Queues single-consumer 제약 발견 → Queue Router 아키텍처 설계
  - `services/svc-queue-router/`: 신규 서비스 (sole queue consumer)
    - event type별 service binding fan-out (document.uploaded→ingestion, extraction.completed→policy 등)
  - 기존 6개 서비스 `[[queues.consumers]]` 제거 + `POST /internal/queue-event` HTTP 엔드포인트 추가
    - svc-ingestion, svc-extraction, svc-policy, svc-ontology, svc-skill, svc-notification
  - 각 서비스 queue handler → `processQueueEvent(body, env, ctx)` 리팩토링
  - 병렬 에이전트 4개 활용하여 6개 서비스 동시 수정
  - 11개 Workers 전체 배포 + /health HTTP 200 확인
  - INTERNAL_API_SECRET 전 서비스 설정 완료

**검증**
- typecheck: 16/16 pass (`bun run typecheck`)
- /health: 11/11 HTTP 200

---

## 세션 008 — 2026-02-28

- ✅ **Phase F — svc-ontology (Stage 4)** — Neo4j + SKOS/JSON-LD 온톨로지 정규화
  - `neo4j/client.ts`: Neo4j HTTP Transaction API (Workers Bolt 미지원 → REST)
  - `routes/normalize.ts`: POST /normalize — SKOS URI + D1 + Neo4j upsert (graceful fallback)
  - `routes/terms.ts`: GET /terms, /terms/:id (D1), GET /graph (Neo4j Cypher 프록시)
  - `queue/handler.ts`: policy.approved → ontology.normalized 이벤트
  - RBAC: ontology:create, ontology:read
- ✅ **Phase F — svc-skill (Stage 5)** — Skill 패키징 + R2 저장
  - `assembler/skill-builder.ts`: trust score 집계 + SkillPackageSchema Zod 검증
  - `routes/skills.ts`: POST /skills (R2+D1+이벤트), GET /skills, GET /skills/:id, GET /skills/:id/download
  - `llm/caller.ts`: Sonnet tier LLM caller
  - RBAC: skill:create, skill:read, skill:download
- ✅ **E-08 Review UI** — app-web Persona B(Reviewer)
  - `api/policy.ts`: svc-policy API 클라이언트
  - `review-queue.tsx`: 정책 목록 + 필터 + 페이지네이션
  - `review-detail.tsx`: 조건/기준/결과 카드 + 승인/수정/반려 액션
  - `components/StatusBadge.tsx`: 상태 뱃지

**검증**
- typecheck: 15/15 pass (`bun run typecheck`)

---

## 세션 007 — 2026-02-28

- ✅ **E-06 Stage 3 Policy Inference** — svc-policy 전체 구현
  - `packages/types/src/policy.ts`: PolicyInferRequestSchema, PolicyCandidateSchema, HitlActionSchema Zod 스키마
  - `services/svc-policy/src/prompts/policy.ts`: Claude Opus 퇴직연금 도메인 정책 추론 프롬프트 (10 TYPE 코드)
  - `services/svc-policy/src/llm/caller.ts`: svc-llm-router service binding (Opus tier, temperature 0.3)
  - `services/svc-policy/src/routes/policies.ts`: POST /policies/infer (추론 + D1 저장 + DO 초기화 + 이벤트 발행), GET /policies (페이지네이션), GET /policies/:id
  - `services/svc-policy/src/queue/handler.ts`: extraction.completed 큐 소비자 (TODO: cross-service 청크 조회)
  - D1 + DO 이중 영속: D1 = 쿼리용 프로젝션, HitlSession DO = 권한적 상태 머신
- ✅ **E-07 HitlSession DO** — HITL 리뷰 워크플로우 전체 구현
  - `services/svc-policy/src/hitl-session.ts`: Durable Object 상태 머신 (open → in_progress → completed)
    - POST /init, POST /assign, POST /action, GET / — 4개 DO 내부 라우트
    - HitlActionEntry 이력 추적, 잘못된 상태 전환 시 409 Conflict 반환
  - `services/svc-policy/src/routes/hitl.ts`: 외부 라우트 4개
    - POST /policies/:id/approve: DO 액션 → D1 갱신 → PolicyApprovedEvent 발행
    - POST /policies/:id/modify: 허용 필드(condition, criteria, outcome, title) 동적 UPDATE → 이벤트 발행
    - POST /policies/:id/reject: DO 액션 → D1 갱신 (이벤트 없음)
    - GET /sessions/:id: D1 lookup → DO proxy
  - `services/svc-policy/src/index.ts`: 7개 엔드포인트 라우팅 + RBAC 6개 권한 매핑 + Queue export
    - policy:create (infer), policy:read (list/get/session), policy:approve, policy:update (modify), policy:reject

**검증**
- typecheck: 15/15 pass (`bun run typecheck`)
- lint: 0 tasks (미구성)

---

## 세션 006 — 2026-02-28

- ✅ **.claude 설정 정비** — pnpm→bun 마이그레이션 잔재 제거, Discovery-X 잔재 정리
- ✅ **E-04 Prompt Registry** — svc-governance 전체 라우트 구현
  - `packages/types/src/governance.ts`: Zod 스키마 (CreatePromptVersionSchema, CreateTrustEvaluationSchema)
  - `services/svc-governance/src/routes/prompts.ts`: POST/GET /prompts, GET /prompts/:id (KV 캐시 + D1)
  - `services/svc-governance/src/routes/trust.ts`: GET/POST /trust (trust_evaluations 집계/기록)
  - `services/svc-governance/src/routes/cost.ts`: GET /cost (stub)
  - `services/svc-governance/src/index.ts`: 전체 라우팅 재구현 + RBAC 적용
- ✅ **E-05 RBAC 전 서비스 적용** — 선택적 RBAC 미들웨어
  - `packages/utils/src/rbac.ts`: extractRbacContext, checkPermission, logAudit 유틸
  - svc-governance: 모든 라우트에 RBAC (governance:read / governance:create)
  - svc-ingestion: POST /documents (document:upload), GET /documents/:id (document:read)
  - svc-extraction: POST /extract (extraction:execute), GET /extractions/:id (extraction:read)
  - 선택적 RBAC: X-User-Role 헤더 없으면 skip (inter-service 호출 허용)

**검증**
- typecheck: 15/15 pass (`bun run typecheck`)
- lint: 0 tasks (미구성)

---

## 세션 005 — 2026-02-26

- ✅ **E-02 Stage 1 완성** — svc-ingestion Queue consumer + Unstructured.io 연동
  - `parsing/unstructured.ts`: Unstructured.io `/general/v0/general` REST API 연동 (API key 없을 시 graceful fallback)
  - `parsing/masking.ts`: svc-security service binding 통한 `/mask` 호출, 청크별 PII 마스킹
  - `parsing/classifier.ts`: 키워드 기반 문서 분류 (erd/screen_design/api_spec/requirements/process/general)
  - `queue.ts`: `document.uploaded` 큐 이벤트 소비 → R2 fetch → parse → classify → mask → D1 chunks 저장
  - `infra/migrations/db-ingestion/0002_chunks.sql`: `document_chunks` 테이블 신규
  - `wrangler.toml`: Queue consumer 추가, `UNSTRUCTURED_API_URL` vars 추가
- ✅ **E-03 Stage 2 완성** — svc-extraction 구현 (Claude Sonnet 구조 추출)
  - `prompts/structure.ts`: 퇴직연금 도메인 구조 추출 프롬프트 (process/entity/rule JSON 형식)
  - `llm/caller.ts`: svc-llm-router service binding 통한 LLM 호출 (tier 선택 지원)
  - `routes/extract.ts`: `POST /extract` — 청크 수집 → 프롬프트 생성 → LLM 호출 → D1 저장
  - `queue/handler.ts`: `document.uploaded` 큐 이벤트 소비 → 자동 추출
  - `src/index.ts`: 전체 라우팅 + queue export (skeleton 대체)
  - `wrangler.toml`: `database_name = "db-structure"` 수정 (db-extraction 오타 수정), Queue consumer 추가

**검증**
- typecheck: 15/15 pass (`bun run typecheck`)
- lint: skip (미구성)
- E2E: 배포 전 (UNSTRUCTURED_API_KEY 설정 + D1 migration 적용 필요)

---

## 세션 004 — 2026-02-26

- ✅ **E-01 PII 마스킹 미들웨어** 구현 및 배포 (svc-security)
  - `POST /mask` 엔드포인트 신규 추가
  - PII 5종 정규식 패턴: SSN(주민번호), PHONE(전화번호), EMAIL, ACCOUNT(계좌번호), CORP_ID(법인번호)
  - 겹치는 패턴 중복 제거 로직 (먼저 정의된 패턴 우선)
  - 동일 값 → 동일 토큰 (한 요청 내 일관성 보장)
  - D1 `masking_tokens` 저장: `original_hash`만 기록 (원본 복원 불가 — 보안 설계)
  - `dataClassification: public` → pass-through (마스킹 없음)
  - `@ai-foundry/types`에 `security.ts` 추가 (MaskRequest / MaskResponse Zod 스키마)
- ✅ svc-security `INTERNAL_API_SECRET` printf 방식 재설정 (echo newline 이슈 해결)

**검증**
- typecheck: 15/15 pass
- lint: skip (미구성)
- E2E: `/mask` HTTP 200, 토큰 생성/중복제거 확인

---

## 세션 003 — 2026-02-26

- ✅ `wrangler deploy` 3개 서비스 배포 (tmux /team 병렬 실행)
  - svc-llm-router / svc-security / svc-ingestion — 전 서비스 `/health` HTTP 200 확인
- ✅ Wrangler secrets 실값 설정
  - `ANTHROPIC_API_KEY` (svc-llm-router)
  - `CLOUDFLARE_AI_GATEWAY_URL` = `https://gateway.ai.cloudflare.com/v1/.../ai-foundry`
  - `JWT_SECRET` auto-gen (svc-security)
  - `INTERNAL_API_SECRET` printf 방식 재설정 (echo newline 이슈 해결)
- ✅ Cloudflare AI Gateway `ai-foundry` 생성 + Authentication Off
- ✅ E2E LLM 파이프라인 검증
  - `/complete`: HTTP 200, Haiku 응답 확인
  - `/stream`: SSE 스트림 전체 수신 확인 (message_start → content_block → message_stop)

**검증**
- typecheck/lint: skip (소스 변경 없음, 배포/설정 작업만 수행)

---

## 세션 002 — 2026-02-26

- ✅ Cloudflare 인프라 프로비저닝 (REST API 직접 사용)
  - D1 × 10 database_id 취득 + `wrangler.toml` 반영
  - R2 × 2 / Queue × 2 / KV × 2 ID 확인
- ✅ D1 마이그레이션 remote 적용 — 10개 DB × `0001_init.sql` (`/raw` 엔드포인트 사용)
- ✅ typecheck 13/13 통과 (4개 타입 에러 수정)
- ✅ React Router v7 future flag 경고 수정

**검증**
- typecheck: 13/13 pass (`bun run typecheck`)
- lint: skip (미구성)

---

## 세션 001 — 2026-02-26

- `AX-BD-Team/res-ai-foundry` 저장소 생성 및 초기 push
- PRD 원본 문서 반입: `docs/AI_Foundry_PRD_TDS_v0.6.docx`
- Discovery-X 기반 운영 체계 이식:
  - `.claude/settings*.json`
  - `.claude/skills/*`
  - `.claude/agents/*`
- `SPEC.md` 초기 템플릿 생성
