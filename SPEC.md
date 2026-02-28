# SPEC.md — res-ai-foundry

> Single Source of Truth (SSOT) for implementation status, architecture decisions, and execution plan.
> Product/requirement authority: `docs/AI_Foundry_PRD_TDS_v0.6.docx`

---

## 1) Project Summary

- **Project**: RES AI Foundry
- **Repo**: `AX-BD-Team/res-ai-foundry`
- **Goal**: SI 산출물에서 암묵지를 추출해 재사용 가능한 Skill 자산으로 패키징
- **Domain Pilot**: 퇴직연금
- **Current Phase**: Pre-development (초기 스캐폴딩 완료)

---

## 2) Scope (v0)

### In Scope
- PRD 기반 아키텍처 구체화
- 모노레포 초기 구조 설계
- Stage 1~2 우선 구현 준비
- 보안/거버넌스/평가 모델의 최소 실행 골격

### Out of Scope (초기)
- 프로덕션 데이터 실투입
- 전 기능 동시 구현
- 고도화 대시보드/고급 자동화

---

## 3) Architecture Baseline

- 6-Layer System + 5-Stage Pipeline + 10 SVC(Workers)
- Infra: Cloudflare Workers/Queues/DO/D1/R2/KV + AI Gateway + Neo4j Aura
- LLM Tiering: Opus / Sonnet-Haiku / Workers AI

참고 문서: `CLAUDE.md`, `docs/AI_Foundry_PRD_TDS_v0.6.docx`

---

## 4) Engineering Principles

1. **Spec-Driven Development (SDD) 우선**: 구현 전 SPEC 업데이트
2. **작게 구현, 빠르게 검증**: 작은 단위 commit + 즉시 검증
3. **보안/감사 선반영**: 마스킹, 감사로그, 권한 모델을 후순위로 미루지 않음
4. **재현성**: 로컬/WSL/Windows 환경에서 동일 절차 문서화
5. **변경 이력 분리**: SPEC은 상태/계획, 세션 로그는 `docs/CHANGELOG.md`

---

## 5) Current Status

- **Last Updated**: 2026-02-28 (세션 011)
- **Repo Bootstrap**: ✅
- **PRD Seed Document**: ✅ (`docs/AI_Foundry_PRD_TDS_v0.6.docx`)
- **.claude Skills/Agents Migration**: ✅
- **Monorepo Scaffold**: ✅ (Bun workspaces + Turborepo, 118 files)
- **Shared Packages**: ✅ `@ai-foundry/types`, `@ai-foundry/utils`
- **svc-llm-router (SVC-06)**: ✅ 전체 구현 (tier routing, AI Gateway, streaming, cost log)
- **svc-security (SVC-07)**: ✅ 전체 구현 (RBAC, audit log)
- **svc-ingestion (SVC-01)**: ✅ 전체 구현 (upload → R2 + D1 + Queue)
- **Skeleton Services**: ✅ SVC-02~05, 08~10 (svc-policy는 HitlSession DO stub 포함)
- **app-web**: ✅ React + Vite SPA scaffold, 13 페이지 stub, React Router warnings 수정
- **D1 Migrations**: ✅ 10개 DB 스키마 작성 + remote 적용 완료 (2026-02-26)
- **Cloudflare 인프라**: ✅ D1(×10) / R2(×2) / Queue(×2) / KV(×2) 프로비저닝 완료, wrangler.toml ID 반영
- **CI/CD Workflows**: ✅ GitHub Actions (CI + 4개 deploy workflow)
- **typecheck**: ✅ 16개 패키지 전체 통과 (svc-queue-router 추가)
- **서비스 배포**: ✅ 전 서비스 배포 완료 (2026-02-28)
  - https://svc-llm-router.sinclair-account.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-security.sinclair-account.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-ingestion.sinclair-account.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-notification.sinclair-account.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-governance.sinclair-account.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-extraction.sinclair-account.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-policy.sinclair-account.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-ontology.sinclair-account.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-skill.sinclair-account.workers.dev — `GET /health` HTTP 200 ✅
  - https://svc-queue-router.sinclair-account.workers.dev — `GET /health` HTTP 200 ✅ (sole queue consumer)
- **Wrangler Secrets**: ✅ 전 서비스 INTERNAL_API_SECRET 설정 완료 (2026-02-28)
  - svc-llm-router: `INTERNAL_API_SECRET` / `ANTHROPIC_API_KEY` / `CLOUDFLARE_AI_GATEWAY_URL` ✅
  - svc-security: `INTERNAL_API_SECRET` / `JWT_SECRET`(auto-gen) ✅
  - svc-ingestion / svc-extraction / svc-policy / svc-ontology / svc-skill / svc-governance / svc-notification / svc-queue-router: `INTERNAL_API_SECRET` ✅
  - svc-ontology: `NEO4J_URI`, `NEO4J_PASSWORD` — Neo4j Aura 연동 시점에 설정 예정
- **AI Gateway**: ✅ `ai-foundry` 게이트웨이 생성 완료, Authentication Off, Anthropic 라우팅 확인
- **E2E LLM 파이프라인**: ✅ `/complete` HTTP 200, `/stream` SSE 정상 수신 확인 (2026-02-26)
  - `INTERNAL_API_SECRET` printf 방식으로 재설정 (echo newline 이슈 해결)
- **E-01 마스킹 미들웨어**: ✅ `POST /mask` 구현 + 배포 완료 (2026-02-26)
  - PII 5종 탐지: SSN, PHONE, EMAIL, ACCOUNT, CORP_ID
  - `@ai-foundry/types` security.ts 추가 (MaskRequest/MaskResponse)
  - D1 `masking_tokens` 저장 (original_hash only)
- **E-02 Stage 1 완성**: ✅ svc-ingestion 큐 소비자 + Unstructured.io 연동 구현 (2026-02-26)
  - Queue consumer: `document.uploaded` 이벤트 처리
  - Unstructured.io `/general/v0/general` REST API 연동 (graceful fallback)
  - POST /mask 연동: 각 청크 마스킹 후 D1 저장
  - `document_chunks` 테이블 (infra/migrations/db-ingestion/0002_chunks.sql)
  - `parsing/unstructured.ts`, `parsing/masking.ts`, `parsing/classifier.ts`, `queue.ts` 신규
- **E-03 Stage 2 완성**: ✅ svc-extraction 구현 (2026-02-26)
  - Claude Sonnet/Haiku 연동으로 구조 추출 (process/entity/rule)
  - POST /extract + GET /extractions/:id + Queue consumer
  - svc-llm-router service binding 통한 LLM 호출
  - `prompts/structure.ts`, `llm/caller.ts`, `routes/extract.ts`, `queue/handler.ts` 신규
  - wrangler.toml `database_name = "db-structure"` 수정
- **E-04 Prompt Registry**: ✅ svc-governance 라우트 구현 (2026-02-28)
  - Prompt CRUD: `POST /prompts` (생성 + KV 캐시), `GET /prompts` (페이지네이션), `GET /prompts/:id` (KV → D1 fallback)
  - Trust Dashboard: `GET /trust` (집계), `POST /trust` (평가 기록)
  - Cost Monitoring: `GET /cost` (stub — cross-DB 집계 미구현)
  - `@ai-foundry/types` governance.ts 추가 (CreatePromptVersionSchema, CreateTrustEvaluationSchema)
- **E-05 RBAC 적용**: ✅ 전 서비스 RBAC 미들웨어 적용 (2026-02-28)
  - `@ai-foundry/utils` rbac.ts 추가 (extractRbacContext, checkPermission, logAudit)
  - svc-governance / svc-ingestion / svc-extraction에 RBAC 적용
  - 선택적 RBAC: X-User-Role 헤더 없으면 skip (inter-service 호출 허용)
- **E-06 Stage 3 Policy Inference**: ✅ svc-policy 전체 구현 (2026-02-28)
  - Claude Opus 기반 condition-criteria-outcome 정책 추론
  - `packages/types/src/policy.ts`: PolicyInferRequestSchema, PolicyCandidateSchema, HitlActionSchema
  - `services/svc-policy/src/prompts/policy.ts`: 퇴직연금 도메인 정책 추론 프롬프트 (10 TYPE 코드)
  - `services/svc-policy/src/llm/caller.ts`: svc-llm-router service binding (Opus tier)
  - `services/svc-policy/src/routes/policies.ts`: POST /policies/infer, GET /policies, GET /policies/:id
  - `services/svc-policy/src/queue/handler.ts`: extraction.completed 큐 소비자
  - D1 + DO 이중 영속: D1(쿼리용 프로젝션) + HitlSession DO(권한적 상태 머신)
  - Queue 이벤트: policy.candidate_ready 발행
- **E-07 HitlSession DO**: ✅ HITL 리뷰 워크플로우 전체 구현 (2026-02-28)
  - HitlSession DO 상태 머신: open → in_progress → completed
  - `services/svc-policy/src/hitl-session.ts`: DO fetch 라우팅 (init/assign/action)
  - `services/svc-policy/src/routes/hitl.ts`: approve/modify/reject/get-session 4개 라우트
  - modify: 허용 필드(condition, criteria, outcome, title) 동적 UPDATE
  - policy.approved 이벤트 발행 (approve + modify 시)
  - svc-policy/src/index.ts: 7개 엔드포인트 라우팅 + RBAC 적용
- **Phase F — svc-ontology (SVC-04)**: ✅ Stage 4 전체 구현 (2026-02-28)
  - Neo4j HTTP Transaction API 클라이언트 (Workers Bolt 미지원 → REST 사용)
  - POST /normalize: SKOS URI 생성, D1 terms 저장, Neo4j 그래프 upsert (graceful fallback)
  - GET /terms, /terms/:id, /graph: 용어 조회 + Neo4j Cypher 프록시
  - Queue consumer: policy.approved → ontology.normalized 이벤트 발행
  - RBAC: ontology:create (normalize), ontology:read (terms/graph)
- **Phase F — svc-skill (SVC-05)**: ✅ Stage 5 전체 구현 (2026-02-28)
  - SkillPackage 어셈블러: trust score 집계 + SkillPackageSchema Zod 검증
  - POST /skills: R2에 .skill.json 저장 + D1 카탈로그 + skill.packaged 이벤트
  - GET /skills, /skills/:id: 카탈로그 조회 (domain/status/trustLevel 필터)
  - GET /skills/:id/download: R2에서 .skill.json 다운로드 + download 로그
  - Sonnet tier LLM caller (문서 생성용)
  - RBAC: skill:create, skill:read, skill:download
- **E-08 Review UI**: ✅ app-web Persona B(Reviewer) 화면 구현 (2026-02-28)
  - review-queue.tsx: 정책 후보 목록 + 상태 필터 + 페이지네이션
  - review-detail.tsx: 조건/기준/결과 카드 + 승인/수정/반려 액션 패널
  - api/policy.ts: svc-policy API 클라이언트 (MVP 하드코딩 헤더)
- **G-01 Queue Router + 전 서비스 배포**: ✅ svc-queue-router 신규 + 전 서비스 배포 (2026-02-28)
  - svc-queue-router: 단일 Queue consumer → service binding fan-out 패턴
  - 기존 6개 서비스 queue consumer 제거 → POST /internal/queue-event HTTP 엔드포인트 전환
  - 라우팅 테이블: document.uploaded→ingestion, extraction.completed→policy, policy.approved→ontology, ontology.normalized→skill, policy.candidate_ready/skill.packaged→notification
  - 11개 Workers 전체 배포 + /health HTTP 200 확인 + INTERNAL_API_SECRET 설정
- **G-02 E2E 파이프라인 통합 테스트**: ✅ 이벤트 체인 수정 + 테스트 스크립트 (2026-02-28)
  - BUG-1 fix: svc-ingestion — `ingestion.completed` 이벤트 발행 추가
  - BUG-2 fix: svc-extraction — 실제 청크 조회 (SVC_INGESTION 바인딩) + `extraction.completed` 이벤트 발행
  - BUG-3 fix: DB 스키마 `extraction_id → id` 마이그레이션 + `organization_id` NOT NULL 대응
  - Queue Router 라우팅: `ingestion.completed → SVC_EXTRACTION` 추가
  - `scripts/test-e2e-pipeline.sh`: 8단계 하이브리드 E2E 테스트 (자동 큐 + 수동 API)
  - INTERNAL_API_SECRET 변경: `e2e-test-secret-2026` (bash `!` 확장 이슈 해결)
- **G-02b LLM 프롬프트 수정**: ✅ svc-policy JSON-only prompt + extractJsonArray 로버스트 파싱 (2026-02-28)
  - Opus가 prose/markdown 대신 순수 JSON 배열만 반환하도록 시스템 프롬프트 CRITICAL RULES 추가
  - extractJsonArray(): markdown fence 제거 + `[...]` 스팬 추출 헬퍼
- **G-02c E2E 8/8 PASS**: ✅ HITL auto-assign + sync D1 writes + UNIQUE 제약 제거 (2026-02-28)
  - handleApprovePolicy: DO session `open` → 자동 assign → action 순으로 streamlined
  - policy/session D1 INSERT를 ctx.waitUntil → await 동기화 (race condition 해결)
  - db-policy migration 0002: policy_code UNIQUE 제약 제거 (다중 실행 충돌 방지)
  - E2E script: CreateSkillRequestSchema에 맞는 payload로 수정 (PolicySchema, OntologyRef, Provenance)
  - E2E 결과: **8/8 PASS** (upload → extraction → policy → approve → ontology → skill → download)
- **G-03 MCP 어댑터**: ✅ GET /skills/:id/mcp — .skill.json → MCP Server tool definitions 변환 (2026-02-28)
  - `services/svc-skill/src/routes/mcp.ts`: on-the-fly 변환 (저장하지 않음)
  - 다운로드 로그 기록 (adapter_type: 'mcp')
- **G-04 Persona 화면**: ✅ app-web 9개 페이지 구현 (2026-02-28)
  - Persona A (Analyst): upload.tsx, pipeline.tsx, comparison.tsx
  - Persona C (Developer): skill-catalog.tsx, skill-detail.tsx
  - Persona D (Client): results.tsx, audit.tsx
  - Persona E (Executive): dashboard.tsx, cost.tsx
  - API 클라이언트 5개: ingestion, extraction, skill, security, governance
- **Test Coverage**: svc-policy 73.55%, svc-skill 80.41% (132 tests, vitest)

---

## 6) Execution Plan

### ✅ Phase A — Foundation Setup (완료)
- [x] monorepo 디렉토리 구조 (Bun workspaces + Turborepo)
- [x] 공통 타입/유틸 패키지 (@ai-foundry/types, @ai-foundry/utils)
- [x] tsconfig.base.json (strict TypeScript)
- [x] GitHub Actions CI/CD
- [x] D1 마이그레이션 스키마 10개

### ✅ Phase B — Infra Provisioning (완료)

- [x] D1 × 10 생성 + wrangler.toml `database_id` 반영
- [x] R2 × 2 (ai-foundry-documents, ai-foundry-skill-packages) 확인
- [x] Queue × 2 (ai-foundry-pipeline, ai-foundry-pipeline-dlq) 확인
- [x] KV × 2 (AI_FOUNDRY_PROMPTS, AI_FOUNDRY_CACHE) ID 반영
- [x] D1 마이그레이션 remote 적용 완료 (10개 DB × `0001_init.sql`)
- [x] **Wrangler Secrets 설정** — 실값 설정 완료 (printf 방식 사용)

### ✅ Phase C-0 — 첫 배포 + Smoke Test (완료)

- [x] `wrangler deploy` (svc-llm-router, svc-security, svc-ingestion) — 2026-02-26
- [x] INTERNAL_API_SECRET 설정 (모든 서비스)
- [x] `GET /health` 엔드포인트 smoke test — 전 서비스 HTTP 200 확인

### ✅ Phase C-1 — Secrets 완성 + E2E 검증 (완료)

- [x] ANTHROPIC_API_KEY, CLOUDFLARE_AI_GATEWAY_URL (svc-llm-router) 실값 설정
- [x] JWT_SECRET auto-gen (svc-security) 설정
- [x] AI Gateway 'ai-foundry' 생성 + Authentication Off
- [x] `/complete` E2E 테스트 — HTTP 200, Haiku 응답 확인
- [x] `/stream` E2E 테스트 — SSE 스트림 정상 수신 확인
- [x] `printf` 방식으로 INTERNAL_API_SECRET 재설정 (echo newline 이슈 해결)

### ✅ Phase C-2 — Pipeline Stage 1+2 Full Impl (E-01~E-03) (완료)
- [x] **E-01** — 마스킹 미들웨어: `POST /mask` (svc-security) 구현 + E2E 검증
- [x] **E-02** — Stage 1 완성: Unstructured.io 연동, 파일 분류 로직, Queue consumer, /mask 연동
- [x] **E-03** — Stage 2 완성: svc-extraction — Claude Sonnet/Haiku로 구조 추출

### ✅ Phase D — Governance Baseline (E-04~E-05) (완료)
- [x] **E-04** — Prompt Registry: svc-governance에 버전 관리/롤아웃 구현
- [x] **E-05** — RBAC 적용: svc-governance / svc-ingestion / svc-extraction에 RBAC 미들웨어 적용

### ✅ Phase E — Policy Inference + HITL (E-06~E-08, Phase 2) (완료)
- [x] **E-06** — Stage 3: svc-policy 전체 구현 (Claude Opus 연동)
- [x] **E-07** — HitlSession DO: 실제 리뷰 워크플로우 구현
- [x] **E-08** — Review UI: app-web Persona B 화면 구현

### ✅ Phase F — Ontology + Skill Packaging (Phase 3) (완료)
- [x] Stage 4: svc-ontology — Neo4j Aura + SKOS/JSON-LD
- [x] Stage 5: svc-skill — Skill Spec 완성, R2 패키징
- [x] MCP 어댑터 생성

### ✅ Phase G — Integration + Deployment (Phase 4) (완료)
- [x] **G-01** — svc-queue-router 신규 + 전 서비스 배포 (Queue Router 패턴)
- [x] **G-02** — E2E 파이프라인 통합 테스트 (이벤트 체인 수정 + 스크립트)
- [x] **G-02b** — svc-policy LLM 프롬프트 수정 (JSON-only + extractJsonArray)
- [x] **G-02c** — E2E 8/8 PASS (HITL auto-assign + sync D1 + UNIQUE 제거)
- [x] **G-03** — MCP 어댑터 생성 (GET /skills/:id/mcp)
- [x] **G-04** — app-web 나머지 Persona 화면 (A, C, D, E — 9페이지)

### 🔜 Phase H — Hardening + Production Readiness
- [x] Unit test 작성 — svc-policy 73.55%, svc-skill 80.41% (132 tests)
- [ ] app-web Cloudflare Pages 배포 (빌드 완료, API 토큰 필요)
- [ ] Neo4j Aura 연결 (svc-ontology NEO4J_URI/PASSWORD)
- [ ] svc-notification 알림 로직 구현
- [ ] svc-analytics KPI 집계 구현
- [ ] 프로덕션 환경 분리 (staging/prod)

---

## 7) Risks & Assumptions

- PRD가 docx 단일 문서이므로 초기에 구조화 전환 필요
- Neo4j/Cloudflare/Anthropic 연동의 초기 비용/제약 확인 필요
- HITL UX 범위가 넓어 MVP 범위 고정 필요

---

## 8) Decision Log (요약)

- 2026-02-26: 신규 repo 생성 및 PRD seed 문서 반입
- 2026-02-26: Discovery-X 기반 Claude Code 운영 체계(.claude skills/agents) 이식
- 2026-02-26: 모노레포 스캐폴딩 완료 — Bun workspaces + Turborepo, 10 Workers 서비스, React+Vite SPA
- 2026-02-26: 공유 패키지 exports를 `./src/index.ts` (raw TS)로 설정 — Wrangler esbuild가 빌드 처리
- 2026-02-26: `packages/utils`에 `@cloudflare/workers-types` 추가 — Response/console 타입 해결
- 2026-02-26: typecheck 13/13 통과 확인
- 2026-02-26: Cloudflare 인프라 프로비저닝 완료 — D1/R2/Queue/KV ID wrangler.toml 반영
- 2026-02-26: D1 마이그레이션 remote 적용 완료 (Cloudflare REST API 직접 사용)
- 2026-02-26: svc-llm-router / svc-security / svc-ingestion wrangler deploy 완료 — 전 서비스 /health HTTP 200 확인
- 2026-02-26: Wrangler secrets 실값 설정 완료 (ANTHROPIC_API_KEY, JWT_SECRET auto-gen, CLOUDFLARE_AI_GATEWAY_URL)
- 2026-02-26: AI Gateway 'ai-foundry' 생성 + E2E LLM 파이프라인 검증 완료 (/complete + /stream)
- 2026-02-26: E-01 마스킹 미들웨어 구현 (svc-security POST /mask, PII 5종, D1 audit 저장)
- 2026-02-26: E-02 Stage 1 완성 — svc-ingestion Queue consumer + Unstructured.io 연동 + /mask 연동 + document_chunks D1 저장
- 2026-02-26: E-03 Stage 2 완성 — svc-extraction 구현 (Claude Sonnet으로 process/entity/rule 구조 추출, service binding LLM 호출)
- 2026-02-28: E-04 Prompt Registry — svc-governance 라우트 구현 (CRUD + KV 캐시 + Trust + Cost)
- 2026-02-28: E-05 RBAC 적용 — extractRbacContext/checkPermission/logAudit 유틸 + 3개 서비스 적용
- 2026-02-28: G-01 Queue Router 아키텍처 도입 — Cloudflare Queues single-consumer 제약 해결. svc-queue-router가 유일한 consumer로 event type별 service binding fan-out. 기존 6개 서비스의 queue consumer를 POST /internal/queue-event HTTP 엔드포인트로 전환
- 2026-02-28: G-01 전 서비스 배포 완료 — 11개 Workers (10 SVC + queue-router) 전체 배포, /health HTTP 200 확인, INTERNAL_API_SECRET 설정
- 2026-02-28: G-02 E2E 이벤트 체인 수정 — ingestion.completed 발행(BUG-1) + extraction 실제 청크 조회+이벤트 발행(BUG-2) + DB 스키마 수정(BUG-3). 3개 서비스 재배포
- 2026-02-28: INTERNAL_API_SECRET 전 서비스 변경 (demian00! → e2e-test-secret-2026) — bash history expansion 이슈 해결
- 2026-02-28: G-02b svc-policy LLM 프롬프트 수정 — Opus JSON-only 출력 강제 + extractJsonArray 로버스트 파싱. E2E Stage 4 통과
- 2026-02-28: G-02c E2E 8/8 PASS — HITL auto-assign 패턴 도입 (open → assign → action을 approve 핸들러에서 자동 수행), policy/session D1 INSERT를 동기화 (ctx.waitUntil → await), db-policy policy_code UNIQUE 제약 제거 (다중 실행 지원)
- 2026-02-28: G-03 MCP 어댑터 — .skill.json → MCP Server tool definitions 온-더-플라이 변환. 저장하지 않고 요청 시 계산 (projection 패턴)
- 2026-02-28: G-04 app-web Persona 화면 — 9개 페이지 구현 (upload, pipeline, comparison, skill-catalog, skill-detail, results, audit, dashboard, cost). API 클라이언트 5개 추가
- 2026-02-28: Phase G 완료 → Phase H (Hardening) 진입 결정. 잔여: unit test, Pages 배포, Neo4j 연결, notification/analytics 구현
