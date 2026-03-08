# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Foundry** (v0.6, Draft) — a domain knowledge extraction platform that reverse-engineers SI project deliverables (ERD, screen designs, API specs, ISP, requirements docs) to extract tacit knowledge and package it as reusable **AI Skill assets**. Built by KTDS AX BD팀. Pilot domain: 퇴직연금 (Retirement Pension).

Full product requirements and technical design are in `docs/AI_Foundry_PRD_TDS_v0.7.4.docx` (latest) and `docs/AI_Foundry_PRD_TDS_v0.6.docx`. This is the authoritative reference for all design decisions.

> **Status**: Phase 4 Sprint 2 완료. 12 Workers + Pages 배포, 1,586 tests (93 test files), staging/production 환경 분리. 퇴직연금 실문서 파일럿: 13/15 문서 파싱, policies 2,827, terms 1,441. LPON 온누리상품권: 85/88 파싱, policies 848, ontologies 848, terms 7,332, skills 859. Production: policies 3,675, skills 3,924 (2-org). 멀티 프로바이더 LLM (Anthropic/OpenAI/Google/Workers AI) fallback + MCP Server (Streamable HTTP) 완비.

---

## Commands

```bash
# Install
bun install

# Dev / Build / Check (via Turborepo)
bun run dev          # turbo run dev --parallel (all services)
bun run typecheck    # turbo run typecheck
bun run lint         # turbo run lint
bun run test         # turbo run test
bun run build        # turbo run build

# Single service dev
cd services/svc-ingestion && wrangler dev

# Deploy a service
cd services/svc-ingestion && CLOUDFLARE_API_TOKEN="..." wrangler deploy

# Set a secret (use printf, not echo — avoids trailing newline)
printf 'value' | CLOUDFLARE_API_TOKEN="..." wrangler secret put SECRET_NAME
```

---

## Repo Structure

```
res-ai-foundry/
├── apps/app-web/              # Cloudflare Pages SPA (React + Vite)
├── packages/
│   ├── types/                 # @ai-foundry/types — shared Zod schemas & TS types
│   └── utils/                 # @ai-foundry/utils — shared utilities
├── services/
│   ├── svc-ingestion/         # SVC-01  Document Ingestion (R2, Queue)
│   ├── svc-extraction/        # SVC-02  Structure Extraction (Claude, Neo4j)
│   ├── svc-policy/            # SVC-03  Policy Inference (Opus, DO, Queue)
│   ├── svc-ontology/          # SVC-04  Ontology (Neo4j, Workers AI)
│   ├── svc-skill/             # SVC-05  Skill Packaging (Sonnet, R2)
│   ├── svc-llm-router/        # SVC-06  LLM Router (AI Gateway)
│   ├── svc-security/          # SVC-07  Security (Access, RBAC, masking)
│   ├── svc-governance/        # SVC-08  Governance (Prompt Registry, cost)
│   ├── svc-notification/      # SVC-09  Notification (Queue alerts)
│   ├── svc-analytics/         # SVC-10  Analytics (KPI, dashboards)
│   ├── svc-queue-router/      # Queue Router (pipeline event bus, fan-out)
│   └── svc-mcp-server/        # SVC-11  MCP Server (Streamable HTTP, Skill tools)
├── docs/                      # PRD, CHANGELOG
├── infra/                     # Infrastructure config
├── turbo.json                 # Turborepo task config
├── tsconfig.base.json         # Shared TS config (strict)
└── package.json               # Bun workspaces root
```

Each service has its own `wrangler.toml` and deploys independently.

---

## Architecture

### 6-Layer System
| Layer | Responsibility |
|---|---|
| **Core Engine** | 5-stage document-to-Skill pipeline |
| **AI Governing** | LLM policy, prompt versioning, cost/data governance, audit |
| **Evaluation** | 3-level trust scoring (individual output → Skill package → system) |
| **DevSecOps** | RBAC, CI/CD, env separation, monitoring, resilience |
| **AI UX** | 13 screens across 5 personas (Cloudflare Pages SPA) |
| **Data & Ontology** | D1 (10 DBs), Neo4j Aura (graph), SKOS/JSON-LD (ontology), R2 (objects) |

### 5-Stage Core Engine Pipeline
```
Stage 1: Document Ingestion
  Input: PDF, PPT, DOCX, Excel, Image (ERD)
  Engine: Unstructured.io (main) + Claude Vision (ERD) + Custom Excel parser
  Output: Structured chunks + classification labels

Stage 2: Structure Extraction
  Engine: Claude Sonnet (complex) / Haiku (standard)
  Output: Process graph + entity relation map + trace matrix

Stage 3: Policy Inference  ← competitive moat; HITL core
  Engine: Claude Opus (policy gen) + Cloudflare HITL (DO + Queues)
  Output: Policy candidates → HITL review → confirmed policies (condition-criteria-outcome triples)

Stage 4: Ontology Normalization
  Engine: SKOS/JSON-LD + Neo4j Aura + Haiku/Workers AI (embedding)
  Output: Domain ontology graph + terminology dictionary

Stage 5: Skill Packaging
  Engine: Custom Skill Spec + Claude Sonnet (docs)
  Output: .skill.json (AI Foundry Spec) + MCP adapter + OpenAPI adapter
```

### MSA — 12 Cloudflare Workers Services
**Domain (Pipeline):**
- `SVC-01` Document Ingestion — Workers, R2, Queue
- `SVC-02` Structure Extraction — Claude, Neo4j
- `SVC-03` Policy Inference — Claude Opus, Durable Objects, Queue
- `SVC-04` Ontology — Neo4j Aura, Workers AI
- `SVC-05` Skill Packaging — Claude Sonnet, R2

**Platform (Cross-cutting):**
- `SVC-06` LLM Router — AI Gateway (tier routing, caching, fallback)
- `SVC-07` Security — Cloudflare Access, RBAC, masking pipeline, audit
- `SVC-08` Governance — Prompt Registry, cost monitoring, trust dashboard
- `SVC-09` Notification — Queue-based review alerts
- `SVC-10` Analytics — KPI aggregation, business dashboards

**Infrastructure:**
- Queue Router — pipeline event bus, fan-out to stages (service bindings)
- `SVC-11` MCP Server — Streamable HTTP, Skill tools for Claude Desktop

### Infrastructure (Cloudflare-native)
- **Compute**: Workers (12 SVCs) + Durable Objects (HITL session state)
- **Storage**: D1 (10 separate DBs, one per SVC) + R2 (documents, Skill packages) + KV (cache)
- **Async**: Cloudflare Queues (pipeline event bus: 6 event types)
- **Frontend**: Cloudflare Pages (SPA, 13 screens)
- **LLM gateway**: Cloudflare AI Gateway (logging, caching, rate limiting for all LLM calls — Anthropic/OpenAI/Google)
- **Auth**: Cloudflare Access (Zero Trust, SSO with KT DS IdP)
- **Graph DB**: Neo4j Aura (Free → Pro as needed)

### LLM Tier Routing (via SVC-06)
- **Tier 1** (Opus): complexity score > 0.7 — Stage 3 policy inference
- **Tier 2** (Sonnet/Haiku): complexity 0.4–0.7 / < 0.4 — Stages 2, 4, 5
- **Tier 3** (Workers AI): embeddings, classification, similarity

### Skill Package Output Format
- File: `.skill.json` (JSON Schema Draft 2020-12), stored in R2 `skill-packages/`
- Core fields: `skillId`, `metadata`, `policies[]` (condition-criteria-outcome triples), `trust`, `provenance`, `ontologyRef`
- Policy code format: `POL-{DOMAIN}-{TYPE}-{SEQ}` (e.g., `POL-PENSION-WD-HOUSING-001`)
- Adapters are generated projections from the core spec (MCP in Phase 3, OpenAPI in Phase 4)

---

## Key Design Decisions
| ID | Decision |
|---|---|
| T-1 | Hybrid document parsing: Unstructured.io + Claude Vision + custom Excel parser |
| T-2 | Claude-centric tiered LLM: Opus/Sonnet/Haiku + Workers AI (60–70% cost reduction) |
| T-3 | SKOS/JSON-LD ontology schema + Neo4j Aura execution layer |
| T-4 | Custom AI Foundry Skill Spec as single source of truth; MCP/OpenAPI are adapters |
| T-5 | HITL workflow via Cloudflare native primitives (Workers + DO + Queues + D1) |
| T-6 | Full Cloudflare stack + Anthropic API + Neo4j Aura |

---

## RBAC Roles
5 roles: `Analyst` (upload/run), `Reviewer` (HITL policy review), `Developer` (Skill integration), `Client` (read-only), `Executive` (dashboards). Details in PRD §18.

## Development Phases
Phase 1 ✅ → 2 ✅ → 3 ✅ → **4 (진행중)**. 각 Phase 상세는 PRD §44 및 `SPEC.md` 참조.

---

## Data & Ontology Architecture
- **10 D1 databases** — one per SVC (`db-ingestion`, `db-structure`, `db-policy`, `db-ontology`, `db-skill`, `db-llm`, `db-security`, `db-governance`, `db-notification`, `db-analytics`). Cross-DB references use ID-based loose coupling.
- **Neo4j schema** — 12 node types (Domain, Process, Policy, Entity, Attribute, Screen, API, Document, Term, Skill, Organization, Reviewer) and 20 relationship types.
- **SKOS/JSON-LD** — manages cross-organization term mappings; each `Term` node in Neo4j maps 1:1 to a SKOS Concept.

---

## Security & Data Governance
- All documents are masked before any external API call (PII → tokens, stored encrypted in D1)
- Data classification: Confidential (no LLM) → Internal (masked only) → Public (all tiers)
- Audit logs: 5-year retention (financial regulation compliance)
- Prompt Registry: every prompt versioned (semver), regression-tested against Golden Test Set before deploy, Blue-Green rollout (10% → 50% → 100%)

---

## Environments
| Resource | Dev | Staging | Production |
|---|---|---|---|
| Workers | `wrangler dev` local | Staging deployment | Production |
| D1 | Local SQLite | Staging DB | Encrypted prod DB |
| LLM | Haiku only | Sonnet | Full tier routing |
| Data | Synthetic only | Anonymized samples | Real (masked) |

---

## Code Patterns & Gotchas

### TypeScript Strictness
`tsconfig.base.json`에 아래 옵션이 활성화되어 있다. 코드 생성 시 반드시 준수:
- `exactOptionalPropertyTypes: true` — optional prop에 `undefined`를 명시적으로 할당하면 에러. `delete obj.prop` 사용하거나 타입에 `| undefined`를 명시
- `noUncheckedIndexedAccess: true` — `array[i]`와 `record[key]`가 `T | undefined`를 반환. 반드시 null check 필요
- `noImplicitOverride: true` — 상속 메서드 재정의 시 `override` 키워드 필수
- `noPropertyAccessFromIndexSignature: true` — index signature 타입에 dot notation 접근 불가. `obj["key"]` 사용

### Inter-Service Communication
- **인증**: 모든 내부 호출에 `X-Internal-Secret` 헤더 필수 (값: `INTERNAL_API_SECRET` secret)
- **예외**: `/health` 엔드포인트는 인증 없이 접근 가능
- **LLM 호출**: 모든 서비스는 직접 Anthropic API를 호출하지 않고 `svc-llm-router`를 경유
- **LlmRequestSchema 필수 필드**: `tier`, `messages[]`, `callerService`

### Shared Packages
- `@ai-foundry/types`, `@ai-foundry/utils`는 raw `.ts` 파일을 export (빌드 스텝 없음)
- Wrangler의 esbuild가 번들링 시 직접 처리
- import 예: `import { MaskRequest } from '@ai-foundry/types'`

### Worker Patterns
- 비동기 D1 쓰기는 `ctx.waitUntil()`로 non-blocking 처리
- 각 서비스마다 독립 D1 DB (cross-DB 참조는 ID 기반 loose coupling)

---

## IMPORTANT: 워크플로우 우선순위 (SDD-primary)

SPEC.md 기반 SDD(Spec-Driven Development)가 이 프로젝트의 **주 워크플로우**이다.

### 세션 시작/종료
- 세션 시작: `/ax-01-start [작업]` (MEMORY.md 자동 로딩 → SPEC.md 보충 읽기)
- 세션 종료: `/ax-02-end [메모]` (Git 커밋 + SPEC.md §5 지표 + MEMORY.md 컨텍스트 + CHANGELOG.md 세션 기록 + git push)
- 세션 히스토리: `docs/CHANGELOG.md` (SPEC.md에 세션 로그 누적 금지)

### Validation Discipline
코드 변경 후 아래 검증을 기본 수행:
```bash
bun run typecheck && bun run lint
```

### 커밋 & 배포
- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `style:`, `chore:`
- `main` 단일 브랜치 운영, 직접 push
- 배포: `/ax-02-end`에 git push 포함. `/ax-03-deploy --preview`는 프리뷰 전용

### 스킬

#### ax 플러그인 (user scope, 범용)
| 스킬 | 용도 |
|------|------|
| `/ax-01-start [작업]` | 세션 시작 (MEMORY.md 자동 + SPEC.md 보충) |
| `/ax-02-end [메모]` | 세션 종료 (커밋 + push + SPEC.md/MEMORY.md/CHANGELOG 동기화) |
| `/ax-03-deploy [--preview]` | 프리뷰 배포 또는 명시적 재배포 |
| `/ax-04-lint` | 변경 파일 ESLint + TypeScript 점검/수정 |
| `/ax-05-sync [push\|pull\|status]` | 멀티 환경 Git 코드 동기화 |
| `/ax-06-team <설명>` | Agent Teams 병렬 작업 (tmux) |
| `/ax-07-gov [list\|check\|apply]` | 거버넌스 표준 관리 |
| `/ax-08-ver [status\|bump\|tag\|check]` | 버전 관리 |
| `/ax-09-doc [new\|index\|version\|archive\|check]` | 문서 관리 |
| `/ax-10-req [new\|triage\|list\|status\|sync]` | 요구사항 관리 |
| `/ax-11-risk [add\|list\|resolve]` | 리스크 관리 |
| `/ax-12-retro` | 마일스톤 회고 |
| `/ax-13-selfcheck` | ax plugin 자율점검 |

#### 프로젝트 스킬 (res-ai-foundry 전용)
| 스킬 | 용도 |
|------|------|
| `/deploy` | Cloudflare Workers 배포 (CI/CD + DB migration 체크 + health check) |
| `/sync` | SPEC.md ↔ GitHub 이슈 상태 동기화 |
| `/db-migrate` | D1 마이그레이션 생성→적용→검증 |
| `/secrets-check` | 전 서비스 wrangler secrets 상태 환경별 검증 |
| `/e2e-pipeline` | 5-Stage 파이프라인 E2E 테스트 실행+결과 요약 |
| `/ralph` | 자율 태스크 루프 (PRD 추출 → 반복 구현 → 품질 검증 → 커밋) |

### 에이전트
- `security-reviewer`
- `migration-checker`
- `status-transition-reviewer`
- `wrangler-config-reviewer` — 12개 서비스 wrangler.toml 일관성 검증

### Agent Teams
- agent team 작업 시 항상 `/ax-06-team` 스킬 사용 (tmux split pane)

### MCP Servers
- `.mcp.json` (repo root, git 커밋) — 팀 공유 MCP: context7 (라이브러리 문서 조회)
- `settings.local.json` — 개인 MCP: Cloudflare Developer Platform (API 토큰 필요)

### Hooks (자동 실행)
- **PreToolUse (Edit|Write)**: `.env`/`.dev.vars` 편집 차단 + 시크릿 하드코딩 차단
- **PostToolUse (Edit|Write)**: typecheck+lint 자동 실행 + migration 파일 변경 알림

### 상태 추적 (3-Tier)
- **Tier 1**: CLAUDE.md + `MEMORY.md` (자동 로딩) → **Tier 2**: SPEC.md (세션 시작 시 Read) → **Tier 3**: docs/CHANGELOG.md (검색 시에만)

### Project Management Rules
1. SPEC.md를 SSOT로 유지
2. 변경 이력은 CHANGELOG.md에 기록
3. 작은 단위 커밋 + 명확한 커밋 메시지(Conventional Commits)
4. 보안/권한/감사 설계를 초기에 반영

### 요구사항 관리 (GOV-003)
> 이 프로젝트의 오버라이드. 글로벌 표준: `~/.claude/standards/requirements-governance.md`

- **ID**: `AIF-REQ-{NNN}` (일련번호, 결번 허용)
- **분류**: [유형/도메인] — 유형: Feature/Bug/Improvement/Chore, 도메인: Pipeline/UX/Infra/Governance/Data/Integration
- **우선순위**: P0(즉시) / P1(이번 마일스톤) / P2(다음) / P3(백로그)
- **상태**: OPEN → TRIAGED → PLANNED → IN_PROGRESS → DONE / REJECTED
- **등록처**: SPEC.md §7 "Requirements Backlog"
- 새 작업/버그 발견 시 SPEC.md §7에 등록 → TRIAGED 후 Sprint에 배치

