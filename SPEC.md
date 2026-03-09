# SPEC.md — res-ai-foundry

> Single Source of Truth (SSOT) for implementation status, architecture decisions, and execution plan.
> Product/requirement authority: `docs/AI_Foundry_PRD_TDS_v0.6.docx`

---

## 1) Project Summary

- **Project**: RES AI Foundry
- **Repo**: `AX-BD-Team/res-ai-foundry`
- **Goal**: SI 산출물에서 암묵지를 추출해 재사용 가능한 Skill 자산으로 패키징
- **Domain Pilot**: 퇴직연금
- **Current Phase**: Phase 4 Sprint 2 완료 (퇴직연금 실문서 파일럿)

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

- 6-Layer System + 5-Stage Pipeline + 12 Workers (10 SVC + Queue Router + MCP Server)
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

- **Last Updated**: 2026-03-09
- **Current Phase**: Phase 4 Sprint 2 완료 — 12 Workers + Pages 배포, 2-org 파일럿 (퇴직연금 + 온누리상품권), policies 3,675 / skills 3,924
- **Production E2E**: ✅ 8/8 PASS (synthetic) + 7/7 PASS (real-doc) + Batch 3: 7/11 parsed (SCDSA002 4건 → encrypted 상태)
- **Real Document Pilot**: ✅ 20/26 문서 파싱 완료 (Batch 1: 4건, Batch 2: 9/11건, Batch 3: 7/11건)
- **Production Data**: policies 3,675 approved (LPON 848 + Miraeasset 2,827), skills 3,924 (LPON 859 + Miraeasset 3,065). 2-org
- **Batch 3 Extraction**: Gap분석서 28proc/27ent, DDD설계 11proc/9ent, 요구사항정의서 8proc/5ent
- **Queue Fix**: default env consumer 충돌 해결 (wrangler.toml + DLQ). 수동: `wrangler delete --name svc-queue-router`
- **Multi-Provider LLM**: ✅ Anthropic→OpenAI→Google→Workers AI 4-provider fallback 구현 + 검증
- **Phase 3 Sprint 1**: ✅ Skill Evaluate endpoint (POST+GET) + D1 마이그레이션 + 3환경 배포 + E2E 검증
- **Phase 3 Sprint 2**: ✅ Skill 검색 API (q/tag/subdomain/sort + total) + 태그/통계 엔드포인트 + Marketplace UX + Skill Detail 페이지
- **Phase 3 Sprint 3**: ✅ svc-mcp-server — MCP Server Worker (Streamable HTTP 2025-03-26 spec, @modelcontextprotocol/sdk 1.27.1, 35 tests, 3환경 배포)
- **MCP 어댑터 개선**: ✅ AIF-REQ-009 완료 — SDK 1.27.1, KV 캐시(3환경), rate limiting, publish API, LPON 515건 published, MCP E2E 7/7 PASS(production), R2 domain 859건 pension→giftvoucher 갱신
- **Gap Analysis Cache**: ✅ 0007 마이그레이션 3환경 적용 + overview 캐싱 (TTL 1h, refresh/invalidate 엔드포인트)
- **분석 보고서 동적화**: ✅ AIF-REQ-011 — 하드코딩 보고서→API/DB 동적 콘텐츠 + 버전별 스냅샷 + 마크다운 문서 자동 생성 (LPON 10 + Miraeasset 14 섹션)
- **Phase 4 Sprint 1**: ✅ Tier 1 문서 11건 투입 — 7/11 파싱 성공, SCDSA002 4건 encrypted 상태. Queue 전파 fix + SCDSA002 탐지 + 배치 자동화 완료
- **Phase 3 Prep**: ✅ MCP 2024-11-05 protocol + OpenAPI 3.0 adapter (Staging 배포 완료)
- **Quality Infra**: ✅ DB 마이그레이션 + API + 대시보드 배포 완료 (org별 메트릭 기록)
- **Frontend API**: ✅ 11/11 페이지 API 연동 완료 (Skill Detail 추가, Settings Health 모니터링 + 알림 연동 포함)
- **LPON 온누리상품권 파일럿**: ✅ 5-Stage 파이프라인 완료
  - 문서: 88건 업로드, 85건 parsed (96.6%), 2건 pending (PDF), 1건 failed (PPTX 524 timeout)
  - Stage 1 (Ingestion): 85/88 parsed
  - Stage 2 (Extraction): 111건 completed (중복 6건 cancelled 처리)
  - Stage 3 (Policy): 848건 approved (세션 134에서 333건 벌크 승인)
  - Stage 4 (Ontology): 848건 completed, terms 7,332건. Neo4j 3,880건 전량 synced (TD-12 해소, 세션 136b)
  - Stage 5 (Skill): 859건 생성 → 515건 published (KV 3환경, MCP E2E 7/7 PASS)
  - 버그 수정: svc-skill queue handler INSERT에 organization_id 누락 → 수정
  - Wave 2 (Archive 127건): 미착수 (별도 세션)
- **LPON FactCheck**: 🔧 소스코드↔문서 API 커버리지 분석 진행
  - FactCheck 실행: resultId 11건 (반복 개선), 382 source / 109 doc items
  - 구조적 매칭: 98건 + LLM Match 17건 = **115건 총 매칭, 커버리지 30.1%**
  - Source-aggregator 개선: alternativePaths(4종 대안 경로) + stripAppPrefix + 노이즈 토큰 필터
  - LLM Semantic Match: 282건 처리 → 17건 신규 매칭 + 265건 confirmed gap + 2건 에러
  - 노이즈 필터: 테이블 7건 (dual/SQL alias/keyword) + API 14건 (test/utility/duplicate)
  - severity 재분류: HIGH 235 / MEDIUM 11 / LOW 136 (개선된 tokenizer 효과)
  - 도메인별 분류: 회원(79), 충전(49), 선물(42), 거래(40), 메시지(38) 등 17개 도메인
  - Gap 패턴: /gift/*, /manual/*, /chargeDealing/*, /v2/messages/* 다수 미문서화 (LLM confirmed)
  - **커버리지 분석 시각화**: Recharts 기반 도메인별 갭 차트 + 커버리지 트렌드 + 문서 보완 제안서 (진행현황 탭)
  - API 3종: `GET /factcheck/domain-summary`, `/trend`, `/document-suggestions`
  - 개선 로드맵: AIF-PLAN-017 (매칭 고도화 → AST 분석 → 문서 보완 제안, 3단계)
- **Multi-Org 코드 점검**: ✅ TD-02~08 해소 (7/12 이슈 해결, 잔여 5건은 LOW/기존)
  - ~~HIGH 4건~~: skills org_id 추가, HITL 통계/품질트렌드/Trust 쿼리 org 필터 추가 — **모두 해소**
  - ~~MEDIUM 3건~~: Neo4j org 격리, governance agent 하드코딩 제거 — **모두 해소**
  - 상세: SPEC.md §8 Tech Debt 참조
- **Cross-Org Comparison UI**: ✅ analysis-report 4번째 탭 구현 (조직 선택 → 비교 → 4-Group 대시보드)
- **Org-specific Status Report**: ✅ 진행 현황 탭 org-aware 리팩토링 — LPON 온누리상품권 보고서 신규, 퇴직연금 보고서 분리 보관
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
- **CI/CD Workflows**: ✅ GitHub Actions (CI + 통합 deploy-services.yml + deploy-pages.yml)
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
  - https://svc-mcp-server.sinclair-account.workers.dev — `GET /health` HTTP 200 ✅ (MCP Streamable HTTP)
- **Wrangler Secrets**: ✅ 전 서비스 INTERNAL_API_SECRET 설정 완료 (2026-02-28)
  - svc-llm-router: `INTERNAL_API_SECRET` / `ANTHROPIC_API_KEY` / `CLOUDFLARE_AI_GATEWAY_URL` ✅
  - svc-security: `INTERNAL_API_SECRET` / `JWT_SECRET`(auto-gen) ✅
  - svc-ingestion / svc-extraction / svc-policy / svc-ontology / svc-skill / svc-governance / svc-notification / svc-queue-router: `INTERNAL_API_SECRET` ✅
  - svc-ontology: `INTERNAL_API_SECRET` / `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` / `NEO4J_DATABASE` ✅
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
- **H-06 Neo4j Aura 연결**: ✅ Query API v2 클라이언트 리팩토링 + 4 secrets 설정 + 배포 + 그래프 검증 (2026-02-28)
  - Aura 5.x: HTTP Transaction API → 403 차단 → Query API v2 (`/db/{database}/query/v2`) 사용
  - neo4j/client.ts 전면 리팩토링, env.ts에 NEO4J_USERNAME/NEO4J_DATABASE 추가
  - `/graph RETURN 1` → HTTP 200, `/normalize` → Neo4j 노드+관계 upsert 검증 완료
- **H-07 Unit Test 확대**: ✅ svc-ingestion 53 tests (96.66%), svc-extraction 52 tests (100%) — 총 269 tests
- **H-08 환경 분리**: ✅ staging/production wrangler.toml + CI/CD (2026-02-28)
  - 12개 wrangler.toml에 [env.staging]/[env.production] 추가
  - deploy-services.yml: 통합 matrix 배포 (push→staging, release→production)
  - deploy-pages.yml: 환경별 Pages 배포
  - scripts/deploy.sh: 수동 배포 스크립트
- **I-01 RBAC 확장**: ✅ svc-notification + svc-analytics RBAC 미들웨어 추가 (2026-03-01)
  - packages/types/src/rbac.ts: "notification" 리소스 추가, 6개 역할별 권한 매트릭스
  - svc-notification: SECURITY service binding + notification:read/update RBAC + audit
  - svc-analytics: analytics:read RBAC + dashboards audit logging
- **I-02 Unit Test 대규모 확장**: ✅ 5개 서비스 440 tests 추가 (2026-03-01)
  - svc-governance: 59 tests (100% stmts)
  - svc-llm-router: 85 tests (98.85% stmts)
  - svc-ontology: 100 tests (100% stmts)
  - svc-security: 153 tests (97.14% stmts)
  - svc-queue-router: 43 tests (100% stmts)
- **Test Coverage**: 1,628 tests, 12 services + utils (vitest, 94 test files) — svc-extraction 373, svc-ingestion 306, svc-skill 166, svc-security 153, svc-llm-router 134, svc-ontology 110, svc-policy 109, svc-governance 83, svc-analytics 53, svc-queue-router 43, svc-mcp-server 35, svc-notification 28, packages/utils 35
- **Batch Scripts**: `scripts/batch-upload.sh` (bulk upload + resume + dry-run), `scripts/batch-status.sh` (status query + CSV export + polling)
- **Frontend**: https://ai-foundry-web.pages.dev (Cloudflare Pages) + https://ai-foundry.minu.best (커스텀 도메인)
  - 10/10 pages real API 연동 완료 (upload, analysis, hitl, audit, skill-catalog, dashboard, ontology, api-console, trust, settings)
- **E2E 스크립트**: `--staging`, `--real-doc <path>`, `--json`, `--wait-queue` 지원
- **샘플 문서**: test-docs/ (퇴직연금 합성 3건)
- **Staging 배포**: ✅ 11/11 Workers staging 배포 완료 + 12/12 healthy
  - URL 패턴: `https://svc-xxx-staging.sinclair-account.workers.dev`
  - Service binding: staging worker 간 격리 (`-staging` 접미사)
  - Secrets: INTERNAL_API_SECRET ×11 + OPENAI_API_KEY + GOOGLE_AI_API_KEY + AI_GATEWAY_URL + JWT_SECRET
- **Production 배포**: ✅ 11/11 Workers + Pages 배포 완료 + 12/12 healthy
  - CI/CD: push→staging, release/manual→production + svc-queue-router default env skip
  - Monitoring: health-check.sh + GitHub Actions cron (30분)
- **로컬 개발**: ✅ 11개 서비스 동시 기동 (`bun run dev:local`, HTTP 8701-8711)

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

### ✅ Phase H — Hardening + Production Readiness (완료)
- [x] Unit test 작성 — svc-policy 73.55%, svc-skill 80.41% (132 tests)
- [x] app-web Cloudflare Pages 배포 — https://ai-foundry-web.pages.dev
- [x] **H-06** Neo4j Aura 연결 — Query API v2 클라이언트, 4 secrets 설정, 그래프 검증
- [x] svc-notification 알림 로직 구현 + 배포 (16 tests, 96.72% coverage)
- [x] svc-analytics KPI 집계 + 배포 (16 tests, 89.65% coverage) + queue-router fan-out
- [x] **H-07** Unit test 확대 — svc-ingestion 53 tests (96.66%), svc-extraction 52 tests (100%). 총 269 tests
- [x] **H-08** 프로덕션 환경 분리 — staging/prod wrangler.toml + 통합 CI/CD + deploy.sh

### ✅ Phase I — Staging Provisioning + Polish (완료)
- [x] **I-01** — svc-notification + svc-analytics RBAC 미들웨어 추가 (notification 리소스 타입 포함)
- [x] **I-02** — 5개 서비스 unit test 추가 (440 tests, 97-100% coverage)
- [x] **I-03** — `/team` 스킬 interactive mode 안정화 (trap EXIT, 3-tier 모니터링, scope 관리)
- [x] **I-04** — Staging 리소스 프로비저닝 (D1×10, R2×2, Queue×1, KV×2) + wrangler.toml ID 교체 + D1 migration 적용
- [x] **I-05** — GitHub Environments 설정 (repo secrets + production deployment_branch_policy)
- [x] **I-06** — 프로덕션 모니터링 (health-check.sh + GitHub Actions cron 30분)

### ✅ Phase 2 — Real Document Pilot (완료)

#### ✅ Phase 2-A — Production E2E 검증 (완료)
- [x] Production 11/11 배포 + 12/12 healthy
- [x] E2E Pipeline 8/8 PASS (synthetic) + 7/7 PASS (real-doc)
- [x] UNSTRUCTURED_API_KEY 시크릿 설정

#### ✅ Phase 2-B — 품질 메트릭 인프라 (완료)
- [x] D1 마이그레이션: quality_metrics, stage_latency, quality_evaluations
- [x] 이벤트 페이로드 확장: parseDurationMs, ruleCount, wasModified, termCount
- [x] svc-analytics GET /quality + svc-governance /quality-evaluations API
- [x] 파일럿 대시보드 (Trust 페이지 탭 추가)
- [x] Settings 페이지: 시스템 Health 모니터링 + 알림 연동

#### ✅ Phase 2-C — Staging 배치 테스트 (완료)
- [x] 퇴직연금 합성 문서 10건 세트 준비 + 배치 E2E 10/10 PASS
- [x] svc-extraction 품질 개선 (적응형 프롬프트, 스마트 청크 선택)
- [x] org ID 전파 버그 수정 (Stage 3-5 이벤트 스키마 + 7개 서비스)
- [x] extraction pending 버그 해결 (fetchChunks 파싱 + failed 상태 전환)

#### ✅ Phase 2-D — 실문서 파일럿 (완료)
- [x] 멀티 프로바이더 LLM (Anthropic→OpenAI→Google→Workers AI fallback)
- [x] HITL 47건+34건 승인 — policies 134+, terms 1,441, skills 171
- [x] 퇴직연금 대표 문서 11건 업로드 (9/11 parsed, 2건 SCDSA002 비표준)
- [x] ~~SCDSA002 비표준 XLSX 조사~~ (AIF-REQ-001 REJECTED: DRM 암호화 파일 파싱 제외)
- [ ] Anthropic 크레딧 충전 후 품질 비교 (AIF-REQ-002 TRIAGED)
- [ ] 추가 문서 업로드 764건 XLSX 중 선별 (AIF-REQ-003 TRIAGED)
- [ ] PDF 대용량 문서 파싱 Unstructured.io 524 timeout 해결 (AIF-REQ-004 TRIAGED)

### ✅ Phase 3 — MCP/OpenAPI 실사용 (완료)
- [x] Sprint 1: Skill Evaluate 엔드포인트 (POST /skills/:id/evaluate + GET /evaluations)
- [x] Sprint 1: Multi-provider benchmark (Anthropic/OpenAI/Google 비교 + consensus)
- [x] Sprint 1: D1 skill_evaluations 테이블 + 3환경 배포 + E2E 검증
- [x] Sprint 2: Skill 검색 API + Marketplace UX + Detail 페이지
- [x] Sprint 3: MCP Server Worker + Skill 버전 관리
- [x] MCP adapter를 실제 MCP 클라이언트(Claude Desktop 등)에서 테스트 (AIF-REQ-005 DONE)
- [ ] OpenAPI adapter 외부 시스템 연동 검증 (AIF-REQ-006 TRIAGED)

### ✅ Phase 4 — Real Document Pipeline (완료)
- [x] Sprint 1: screen-design-parser + Batch 3 (7/11 파싱) + Queue fix + SCDSA002 탐지 + 배치 자동화
- [x] Sprint 2: bulk-approve 3,046건 + Tier 2+3 87건 업로드 + 파이프라인 완결 (26,825 terms, 3,104 skills)

---

## 7) Requirements Backlog

> GOV-003 요구사항 관리 표준 적용. ID: `AIF-REQ-{NNN}`, 우선순위: P0~P3.
> 상태: OPEN → TRIAGED → PLANNED → IN_PROGRESS → DONE / REJECTED

### 분류 체계

**유형**: Feature / Bug / Improvement / Chore
**도메인**: Pipeline / UX / Infra / Governance / Data / Integration

### 미완료 항목 (Phase 2-D, Phase 3에서 이관)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| ~~AIF-REQ-001~~ | ~~Improvement~~ | ~~Pipeline~~ | ~~P2~~ | REJECTED | ~~SCDSA002 비표준 XLSX 파싱 조사~~ — 거부: DRM 암호화 파일 파싱 제외 |
| AIF-REQ-002 | Improvement | Pipeline | P3 | TRIAGED | Anthropic vs OpenAI extraction 품질 비교 (크레딧 충전 후) |
| AIF-REQ-003 | Feature | Data | P2 | TRIAGED | 추가 문서 업로드 (764건 XLSX 중 선별) |
| AIF-REQ-004 | Bug | Pipeline | P2 | TRIAGED | PDF 대용량 문서 파싱 Unstructured.io 524 timeout 해결 |
| AIF-REQ-005 | Feature | Integration | P1 | DONE | MCP adapter 실제 클라이언트(Claude Desktop) E2E 테스트 |
| AIF-REQ-006 | Feature | Integration | P2 | TRIAGED | OpenAPI adapter 외부 시스템 연동 검증 |

### 온누리상품권 도메인 파일럿 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-007 | Feature | Pipeline | P0 | DONE | 온누리상품권 Stage 1-2 triage 완료 (88건/85 parsed/85 extracted, 3건 failed: 쿼터+타임아웃) |
| AIF-REQ-008 | Feature | Pipeline | P0 | DONE | 온누리상품권 정책 추론 완료 — policies 848 전량 approved, Neo4j 3,880건 synced, HITL 전건 처리 |
| AIF-REQ-009 | Feature | Pipeline | P1 | DONE | 온누리상품권 Skill 패키징 + MCP 어댑터 완료 — KV 3환경, 515건 published, MCP E2E 7/7 PASS, R2 domain 859건 갱신 완료 |
| AIF-REQ-010 | Feature | Data | P1 | DONE | SI 산출물 재구성 + As-Is/To-Be Gap 분석 완료 — 4-perspective API, 캐싱(TTL 1h), CSV 내보내기, trace matrix |
| AIF-REQ-011 | Feature | UX | P1 | DONE | 분석 보고서 동적화 — 하드코딩→API/DB, 버전별 스냅샷, 마크다운 문서 자동 생성 (LPON+Miraeasset 동시) |
| AIF-REQ-012 | Feature | UX | P2 | DONE | 3축 벤치마크 비교 보고서 페이지 — Cross-Domain + AI vs Manual + Stage Performance, 98% match rate (세션 153) |
| AIF-REQ-013 | Feature | UX | P1 | DONE | Cross-Org Comparison 대시보드 — 조직 비교 + 4-Group 시각화, org별 보고서 분리 |

### Phase 4 실문서 파이프라인 (신규 등록)

| ID | 유형 | 도메인 | 우선순위 | 상태 | 제목 |
|----|------|--------|:--------:|:----:|------|
| AIF-REQ-014 | Feature | Pipeline | P0 | DONE | Phase 4 Sprint 1 실문서 파이프라인 — screen-design-parser + Batch 3 (7/11 파싱) + Queue fix + SCDSA002 탐지 + 배치 자동화 (세션 071~078) |
| AIF-REQ-015 | Feature | Pipeline | P0 | DONE | Phase 4 Sprint 2 벌크 승인 + 파이프라인 완결 — bulk-approve 3,046건 + Tier 2+3 87건 업로드 (26,825 terms, 3,104 skills) (세션 079~085) |
| AIF-REQ-016 | Feature | Data | P1 | IN_PROGRESS | LPON FactCheck 소스코드↔문서 API 커버리지 분석 — 382 source/109 doc, 115건 매칭(구조 98+LLM 17), 커버리지 30.1% (세션 107~153) |

---

## 8) Risks & Constraints

> GOV-005 리스크 관리 표준 적용. 유형: Blocker / Dependency / Tech Debt / Constraint

### 기술 제약 (Constraint)

| ID | 제약 | 영향 | 대응 |
|----|------|------|------|
| C-01 | Cloudflare Workers 30초 CPU 타임아웃 | 대용량 PDF 파싱 시 524 에러 | AIF-REQ-004로 등록, 청크 분할 검토 |
| C-02 | D1 SQLite 단일 DB 용량 제한 (500MB Free) | 대규모 데이터 시 스케일링 | 서비스별 DB 분리로 완화 (현재 10 DB) |
| C-03 | Neo4j Aura Free 제한 (200K nodes, 400K rels) | 온톨로지 확장 시 Pro 필요 | 파일럿 규모에서는 충분 |
| C-04 | Anthropic API 크레딧 기반 과금 | 크레딧 소진 시 Tier 1/2 중단 | 멀티 프로바이더 fallback 구현 완료 |
| C-05 | PRD가 docx 단일 문서 | 구조적 참조 어려움 | SPEC.md + CLAUDE.md로 구조화 보완 |

### 기술부채 (Tech Debt)

| ID | 위치 | 내용 | 영향 | 등록일 |
|----|------|------|------|--------|
| TD-01 | `svc-governance/src/routes/cost.ts` | cost 집계 미구현 (TODO) | 비용 대시보드 부정확 | 2026-03-08 |
| ~~TD-02~~ | `infra/migrations/db-skill/0003_add_org_id.sql` | ✅ skills 테이블 organization_id 컬럼 추가 | 해소 (세션 131) | 2026-03-08 |
| ~~TD-03~~ | `svc-policy/src/routes/stats.ts` | ✅ HITL 통계 3개 쿼리 org 필터 추가 (JOIN policies) | 해소 (세션 131) | 2026-03-08 |
| ~~TD-04~~ | `svc-policy/src/routes/quality-trend.ts` | ✅ 정책 품질 트렌드 쿼리 org 필터 추가 | 해소 (세션 131) | 2026-03-08 |
| ~~TD-05~~ | `svc-governance/src/routes/trust.ts` | ✅ Trust 평가 집계 org 필터 추가 + 마이그레이션 | 해소 (세션 131) | 2026-03-08 |
| ~~TD-06~~ | `svc-skill/src/routes/skills.ts` | ✅ 5개 통계 쿼리 + INSERT org 필터 추가 | 해소 (세션 131) | 2026-03-08 |
| ~~TD-07~~ | `svc-ontology/src/neo4j/client.ts` | ✅ Neo4j 6종 노드 organizationId SET 추가 | 해소 (세션 131) | 2026-03-08 |
| ~~TD-08~~ | `svc-governance/src/agent/tools.ts` | ✅ "Miraeasset" 하드코딩 제거 → 동적 organizationId | 해소 (세션 131) | 2026-03-08 |
| ~~TD-09~~ | `svc-policy/src/routes/policies.ts`, `reasoning.ts` | ✅ 정책 목록·Reasoning 분석 org 필터 추가 | 해소 (세션 133) | 2026-03-08 |
| ~~TD-10~~ | `services/*/wrangler.toml` `[env.production]` | ✅ 전 서비스 production 서비스 바인딩 + DO script_name에 `-production` 접미사 추가 (9개 서비스, 33건) | 해소 (세션 151) | 2026-03-08 |
| ~~TD-11~~ | `svc-policy/src/prompts/policy.ts` | ✅ POL-PENSION-* 도메인 코드 하드코딩 → DOMAIN_CONFIGS 동적화 | 해소 (세션 141) | 2026-03-08 |
| ~~TD-12~~ | `svc-ontology` Neo4j Aura | ✅ 3,880건 ontology neo4j_graph_id NULL → backfill 완료 | 해소 (세션 136b) | 2026-03-08 |

> **Note**: TD-10 범위 확대 — 원래 svc-queue-router만 등록했으나, 실제로는 9개 서비스(svc-mcp-server 제외) 전체 production 서비스 바인딩이 default env를 참조하는 동일 이슈 확인 → 일괄 수정

### 가정 (Assumptions)

- HITL UX 범위를 MVP로 고정 (Reviewer 1인 승인 워크플로우)
- 퇴직연금 도메인 파일럿이 성공하면 다른 도메인으로 확장

---

## 9) Decision Log (요약)

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
- 2026-02-28: H-06 Neo4j Aura 연결 — Aura 5.x HTTP Transaction API 차단(403) 발견 → Query API v2 (`/db/{database}/query/v2`) 로 전면 리팩토링. multi-statement batch를 순차 실행 래퍼로 변환. NEO4J_USERNAME/NEO4J_DATABASE env 추가
- 2026-02-28: H-07 Unit test 확대 — svc-ingestion 53 tests (96.66%), svc-extraction 52 tests (100%). CfProperties→IncomingRequestCfProperties 타입 불일치는 테스트 내 `as any` 캐스트로 해결
- 2026-02-28: H-08 환경 분리 — 개별 deploy workflow 3개 → deploy-services.yml 통합 (matrix strategy). push→staging 자동, release→production 자동, workflow_dispatch→수동 선택. deploy.sh 스크립트 추가
- 2026-02-28: Phase H 완료 → Phase I (Staging Provisioning + Polish) 진입 결정
- 2026-03-01: I-01 RBAC 확장 — svc-notification/svc-analytics에 RBAC 미들웨어 적용. "notification" 리소스를 ResourceSchema에 추가. 선택적 RBAC: /internal/queue-event는 skip, 사용자 대면 엔드포인트만 적용
- 2026-03-01: I-02 Unit test 대규모 확장 — 5개 서비스 병렬 작성 (440 tests). svc-queue-router keyof Env 타입 이슈 해결 (ServiceBinding 축소 타입). 총 테스트: 269→709
- 2026-03-01: I-04 Staging 리소스 프로비저닝 — D1×10, R2×2, Queue×1, KV×2 생성 + 11개 wrangler.toml placeholder→실제 ID 교체 + D1 migration 13개 적용. D1 MCP에서 DROP TABLE은 WAF 차단 → wrangler CLI 우회
- 2026-03-01: I-05 GitHub Environments — repo secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) + production deployment_branch_policy (main only). required_reviewers는 유료 플랜 필요
- 2026-03-01: I-06 모니터링 — scripts/health-check.sh (12서비스+Pages, JSON/text 출력, svc-notification 알림) + .github/workflows/health-check.yml (30분 cron). 검증: 12/12 healthy
- 2026-03-01: Phase I 완료
- 2026-03-01: Staging service binding 수정 — `[env.staging]` service/DO binding에 `-staging` 접미사 추가. Cross-env 오염 방지 (9 파일, 20 변경)
- 2026-03-01: Staging 전체 배포 — 11 Workers staging 배포 + secrets 설정 + health 11/11 + API 기능 검증
- 2026-03-01: health-check.sh 수정 — `--env staging` 시 `-staging` worker URL 사용
- 2026-03-01: Frontend API 연동 — ontology/api-console/trust 3페이지 mock→실제 API 전환
- 2026-03-01: E2E 스크립트 확장 — --staging/--real-doc/--json/--wait-queue 옵션 추가
- 2026-03-01: UNSTRUCTURED_API_KEY staging secret 설정 + set-secret workflow 추가
- 2026-03-01: **Staging E2E 7/7 PASS** — 실제 pension-withdrawal.pdf 5-Stage 파이프라인 검증 성공
- 2026-03-01: **Production 배포 11/11** — 전체 Workers production 재배포 + UNSTRUCTURED_API_KEY production secret 설정
- 2026-03-02: 로컬 개발 환경 — 11 서비스 포트 할당 (8701-8711) + Wave 순차 기동 스크립트 (`dev-local.sh`)
- 2026-03-02: Phase 2-B 품질 메트릭 인프라 — db-analytics/db-governance 마이그레이션 + 이벤트 enrichment + quality API + 파일럿 대시보드
- 2026-03-02: Phase 2-B Production 배포 — 6서비스 + Pages + D1 마이그레이션 + 실문서 E2E 7/7 PASS
- 2026-03-02: Phase 2-C Staging 배치 E2E 10/10 PASS — 합성 문서 10건, 품질 메트릭 org별 수집 확인
- 2026-03-02: svc-extraction 품질 개선 — 적응형 프롬프트 (문서 분류별), 스마트 청크 선택 (head 3 + word_count top 17), maxTokens 4096
- 2026-03-02: CI/CD 수정 — multi-commit push 변경 감지 + production default env 동시 배포
- 2026-03-02: extraction pending 버그 해결 — fetchChunks 응답 파싱 + failed 상태 전환 + org ID 필수 검증
- 2026-03-02: **Production E2E 8/8 PASS** (real-doc pension-withdrawal.pdf, queue-driven)
- 2026-03-03: 멀티 프로바이더 LLM — Anthropic+OpenAI+Google+Workers AI 4-provider fallback. Provider adapter 패턴, D1 provider/fallback_from 컬럼 추가
- 2026-03-03: HITL 47건 승인 — 7개 org, Stage 4 terms 1,228건, Stage 5 skills 134건
- 2026-03-03: Production 전체 배포 동기화 — CI/CD svc-queue-router default env skip + 14/14 jobs success
- 2026-03-03: 퇴직연금 실문서 파일럿 — 카테고리별 대표 11건 업로드, 9/11 parsed, 34 policies, 220 terms, 37 skills
- 2026-03-03: SCDSA002 비표준 XLSX 발견 — 메뉴구조도/테이블정의서 2건 magic bytes 비표준 (Unstructured.io 파싱 불가)
