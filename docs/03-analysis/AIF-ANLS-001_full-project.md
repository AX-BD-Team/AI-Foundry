---
code: AIF-ANLS-001
title: "Full Project Gap Analysis"
version: "1.0"
status: Active
category: ANLS
created: 2026-03-08
updated: 2026-03-08
author: Sinclair Seo
---

# AI Foundry -- Full Project Gap Analysis Report

> **Summary**: Comprehensive design-vs-implementation gap analysis for the AI Foundry platform.
> Compares SPEC.md + CLAUDE.md design intent against actual codebase state.
>
> **Author**: gap-detector agent
> **Created**: 2026-03-01
> **Last Modified**: 2026-03-01
> **Status**: Draft

---

## Analysis Overview

- **Analysis Target**: AI Foundry full platform (all 11 services + frontend + shared packages)
- **Design Documents**: CLAUDE.md, AI_Foundry_PRD_TDS_v0.6.docx (referenced), agent memory
- **Implementation Path**: `/home/sinclair/work/axbd/res-ai-foundry/`
- **Analysis Date**: 2026-03-01
- **Total Tests**: 269 (per agent memory)
- **E2E Status**: 8/8 PASS

---

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Service Architecture | 100% | PASS |
| Endpoint Completeness | 95% | PASS |
| Business Logic Depth | 92% | PASS |
| D1 Schema Coverage | 100% | PASS |
| Queue Event Integration | 98% | PASS |
| RBAC Integration | 82% | WARN |
| Inter-Service Auth | 100% | PASS |
| Test Coverage | 62% | WARN |
| Wrangler Bindings | 100% | PASS |
| Environment Separation | 90% | PASS |
| Shared Packages | 95% | PASS |
| Frontend Screens | 92% | PASS |
| CI/CD Pipeline | 95% | PASS |
| **Overall** | **90%** | PASS |

---

## 1. Service Architecture Match

### Design: 10+1 Services

| Service | Design | Implemented | Routes | D1 | Status |
|---------|:------:|:-----------:|:------:|:--:|:------:|
| SVC-01 svc-ingestion | Yes | Yes | 5 | db-ingestion | PASS |
| SVC-02 svc-extraction | Yes | Yes | 4 | db-structure | PASS |
| SVC-03 svc-policy | Yes | Yes | 8 | db-policy | PASS |
| SVC-04 svc-ontology | Yes | Yes | 5 | db-ontology | PASS |
| SVC-05 svc-skill | Yes | Yes | 6 | db-skill | PASS |
| SVC-06 svc-llm-router | Yes | Yes | 3 | db-llm | PASS |
| SVC-07 svc-security | Yes | Yes | 5 | db-security | PASS |
| SVC-08 svc-governance | Yes | Yes | 6 | db-governance | PASS |
| SVC-09 svc-notification | Yes | Yes | 3 | db-notification | PASS |
| SVC-10 svc-analytics | Yes | Yes | 4 | db-analytics | PASS |
| svc-queue-router | Yes | Yes | 1+queue | N/A | PASS |

**Score: 100%** -- All 11 services are scaffolded, built, and deployed.

---

## 2. Endpoint Completeness (Per-Service)

### SVC-01 svc-ingestion

| Endpoint | Design | Implemented | Notes |
|----------|:------:|:-----------:|-------|
| GET /health | Yes | Yes | No auth |
| POST /documents | Yes | Yes | Upload + R2 + masking |
| GET /documents/:id | Yes | Yes | Full document metadata |
| GET /documents/:id/chunks | Yes | Yes | Parsed chunks list |
| POST /internal/queue-event | Yes | Yes | Queue router delivery |

**Score: 100%**

### SVC-02 svc-extraction

| Endpoint | Design | Implemented | Notes |
|----------|:------:|:-----------:|-------|
| GET /health | Yes | Yes | |
| POST /extract | Yes | Yes | Triggers LLM extraction |
| GET /extractions | Yes | Yes | List by documentId |
| GET /extractions/:id | Yes | Yes | Detail with result_json |
| POST /internal/queue-event | Yes | Yes | |

**Score: 100%**

### SVC-03 svc-policy

| Endpoint | Design | Implemented | Notes |
|----------|:------:|:-----------:|-------|
| GET /health | Yes | Yes | |
| POST /policies/infer | Yes | Yes | Claude Opus via LLM Router |
| GET /policies | Yes | Yes | List with filters |
| GET /policies/:id | Yes | Yes | Single policy detail |
| POST /policies/:id/approve | Yes | Yes | HITL approve |
| POST /policies/:id/modify | Yes | Yes | HITL modify |
| POST /policies/:id/reject | Yes | Yes | HITL reject |
| GET /sessions/:id | Yes | Yes | DO session proxy |
| POST /internal/queue-event | Yes | Yes | |

**Score: 100%**

### SVC-04 svc-ontology

| Endpoint | Design | Implemented | Notes |
|----------|:------:|:-----------:|-------|
| GET /health | Yes | Yes | |
| POST /normalize | Yes | Yes | Neo4j + SKOS normalization |
| GET /terms | Yes | Yes | List with ontologyId filter |
| GET /terms/:id | Yes | Yes | Single term |
| GET /graph | Yes | Yes | Neo4j Cypher proxy |
| POST /internal/queue-event | Yes | Yes | |

**Score: 100%**

### SVC-05 svc-skill

| Endpoint | Design | Implemented | Notes |
|----------|:------:|:-----------:|-------|
| GET /health | Yes | Yes | |
| POST /skills | Yes | Yes | Package .skill.json |
| GET /skills | Yes | Yes | Catalog list |
| GET /skills/:id | Yes | Yes | Detail |
| GET /skills/:id/download | Yes | Yes | R2 download |
| GET /skills/:id/mcp | Yes | Yes | MCP adapter projection |
| GET /skills/:id/openapi | No | No | Design mentions OpenAPI adapter, not yet implemented |
| POST /internal/queue-event | Yes | Yes | |

**Score: 93%** -- OpenAPI adapter endpoint missing (design says "Phase 4")

### SVC-06 svc-llm-router

| Endpoint | Design | Implemented | Notes |
|----------|:------:|:-----------:|-------|
| GET /health | Yes | Yes | |
| POST /complete | Yes | Yes | Synchronous LLM call |
| POST /stream | Yes | Yes | SSE streaming |

**Score: 100%**

### SVC-07 svc-security

| Endpoint | Design | Implemented | Notes |
|----------|:------:|:-----------:|-------|
| GET /health | Yes | Yes | |
| POST /rbac/check | Yes | Yes | Permission check |
| POST /rbac/permissions | Yes | Yes | Role permissions |
| POST /audit | Yes | Yes | Write audit log |
| GET /audit | Yes | Yes | Query audit log |
| POST /mask | Yes | Yes | PII masking pipeline |

**Score: 100%**

### SVC-08 svc-governance

| Endpoint | Design | Implemented | Notes |
|----------|:------:|:-----------:|-------|
| GET /health | Yes | Yes | |
| POST /prompts | Yes | Yes | Register prompt version |
| GET /prompts | Yes | Yes | List prompts |
| GET /prompts/:id | Yes | Yes | Get prompt |
| GET /cost | Yes | Yes | Cost monitoring |
| GET /trust | Yes | Yes | Trust dashboard |
| POST /trust | Yes | Yes | Create trust evaluation |

**Score: 100%**

### SVC-09 svc-notification

| Endpoint | Design | Implemented | Notes |
|----------|:------:|:-----------:|-------|
| GET /health | Yes | Yes | |
| GET /notifications | Yes | Yes | List by userId |
| PATCH /notifications/:id/read | Yes | Yes | Mark read |
| POST /internal/queue-event | Yes | Yes | |

**Score: 100%**

### SVC-10 svc-analytics

| Endpoint | Design | Implemented | Notes |
|----------|:------:|:-----------:|-------|
| GET /health | Yes | Yes | |
| GET /kpi | Yes | Yes | Pipeline KPI |
| GET /cost | Yes | Yes | Cost breakdown |
| GET /dashboards | Yes | Yes | Combined dashboard |
| POST /internal/queue-event | Yes | Yes | |

**Score: 100%**

### svc-queue-router

| Endpoint | Design | Implemented | Notes |
|----------|:------:|:-----------:|-------|
| GET /health | Yes | Yes | |
| queue() handler | Yes | Yes | Sole consumer, fan-out |

**Score: 100%**

**Overall Endpoint Score: 99%** -- Only OpenAPI adapter missing (deferred to Phase 4).

---

## 3. Business Logic Depth

### 3.1 Core Engine (5-Stage Pipeline)

| Stage | Service | Logic Depth | Notes |
|-------|---------|:-----------:|-------|
| Stage 1: Ingestion | svc-ingestion | Full | Upload, R2 storage, Unstructured.io parsing, classification, PII masking, chunking |
| Stage 2: Extraction | svc-extraction | Full | Claude via LLM Router, prompt templates, process/entity graph extraction |
| Stage 3: Policy Inference | svc-policy | Full | Claude Opus tier, policy candidate generation, condition-criteria-outcome triples |
| Stage 3: HITL | svc-policy | Full | Durable Object state machine (open/in_progress/completed), approve/modify/reject |
| Stage 4: Ontology | svc-ontology | Full | Neo4j Query API v2, SKOS term normalization, broader/narrower term mappings |
| Stage 5: Skill Packaging | svc-skill | Full | .skill.json assembly, R2 storage, MCP adapter projection, download tracking |

### 3.2 Platform Services

| Service | Logic Depth | Notes |
|---------|:-----------:|-------|
| svc-llm-router | Full | 4-tier routing (opus/sonnet/haiku/workers), AI Gateway integration, cost logging, streaming, opus authorization enforcement |
| svc-security | Full | RBAC check (5 roles + Admin), PII detection (6 patterns), tokenization, SHA-256 hashing, audit log write/query |
| svc-governance | Full | Prompt Registry with semver versioning, rollout percentage, golden test flag, trust evaluation (L1/L2/L3), cost monitoring |
| svc-notification | Full | Queue event processing, D1 CRUD, mark-read, filtering by status/type |
| svc-analytics | Full | KPI aggregation (pipeline_metrics), cost breakdown (cost_metrics), skill usage tracking, dashboard combining all three |
| svc-queue-router | Full | Zod validation, discriminated union routing, fan-out to all targets + analytics, X-Internal-Secret on fan-out calls |

**Score: 92%** -- Full implementation for all core stages. Minor gap: OpenAPI adapter generation in Stage 5.

---

## 4. D1 Schema Coverage

| Database | Tables | Indexes | Migrations | Status |
|----------|:------:|:-------:|:----------:|:------:|
| db-ingestion | 2 (documents, document_chunks) | 5 | 0001 + 0002 | PASS |
| db-structure | 2 (extractions, extraction_chunks) | 3 | 0001 + 0002 | PASS |
| db-policy | 3 (policies, hitl_sessions, hitl_actions) | 4 | 0001 + 0002 | PASS |
| db-ontology | 3 (ontologies, terms, term_mappings) | 3 | 0001 | PASS |
| db-skill | 2 (skills, skill_downloads) | 3 | 0001 | PASS |
| db-llm | 2 (llm_cost_log, prompt_registry) | 4 | 0001 | PASS |
| db-security | 3 (audit_log, masking_tokens, user_sessions) | 5 | 0001 | PASS |
| db-governance | 2 (prompt_versions, trust_evaluations) | 2 | 0001 | PASS |
| db-notification | 2 (notifications, notification_preferences) | 2 | 0001 | PASS |
| db-analytics | 3 (pipeline_metrics, cost_metrics, skill_usage_metrics) | 3 | 0001 | PASS |

**Total: 10 databases, 24 tables, 34 indexes, 13 migration files.**

**Score: 100%** -- All 10 D1 databases match design. Schema covers all required entities.

---

## 5. Queue Event Integration

### Design: 7 Event Types

| Event Type | Producer | Consumer (via queue-router) | Analytics | Status |
|------------|----------|:---------------------------:|:---------:|:------:|
| document.uploaded | svc-ingestion | svc-ingestion | Yes | PASS |
| ingestion.completed | svc-ingestion | svc-extraction | Yes | PASS |
| extraction.completed | svc-extraction | svc-policy | Yes | PASS |
| policy.candidate_ready | svc-policy | svc-notification | Yes | PASS |
| policy.approved | svc-policy | svc-ontology | Yes | PASS |
| ontology.normalized | svc-ontology | svc-skill | Yes | PASS |
| skill.packaged | svc-skill | svc-notification | Yes | PASS |

### Zod Schemas (packages/types/src/events.ts)

All 7 event types have Zod schemas with proper discriminated union (`PipelineEventSchema`).
Each schema includes `eventId`, `occurredAt`, optional `traceId`, and typed payload.

**Score: 100%** -- All event types defined, routed, and consumed correctly.

---

## 6. RBAC Integration

### Design: 5 Roles + Admin

| Role | Defined in Types | Permission Matrix | Used in Services | Status |
|------|:----------------:|:-----------------:|:----------------:|:------:|
| Analyst | Yes | Yes (9 perms) | Yes | PASS |
| Reviewer | Yes | Yes (7 perms) | Yes | PASS |
| Developer | Yes | Yes (5 perms) | Yes | PASS |
| Client | Yes | Yes (6 perms) | Yes | PASS |
| Executive | Yes | Yes (4 perms) | Yes | PASS |
| Admin | Yes | Yes (full) | Yes | PASS |

### Per-Service RBAC Middleware Application

| Service | RBAC via extractRbacContext+checkPermission | Audit via logAudit | Status |
|---------|:---------:|:-----:|:------:|
| svc-ingestion | Yes (upload, read) | Yes | PASS |
| svc-extraction | Yes (execute, read) | Yes | PASS |
| svc-policy | Yes (create, read, approve, update, reject) | Yes | PASS |
| svc-ontology | Yes (create, read) | Yes | PASS |
| svc-skill | Yes (create, read, download) | Yes | PASS |
| svc-llm-router | **No** | **No** | WARN |
| svc-security | **No** (it IS the auth service) | N/A | PASS |
| svc-governance | Yes (create, read) | Yes | PASS |
| svc-notification | **No** | **No** | WARN |
| svc-analytics | **No** | **No** | WARN |

**Findings:**

- **svc-llm-router**: No RBAC checks. This is defensible since only other services call it (inter-service auth via X-Internal-Secret is sufficient). Minor gap.
- **svc-notification**: No RBAC checks on `/notifications` and `/notifications/:id/read`. Any authenticated internal caller can list/read any user's notifications. Medium severity.
- **svc-analytics**: No RBAC checks on `/kpi`, `/cost`, `/dashboards`. Any authenticated internal caller can read all analytics data. Medium severity -- Executive/Analyst role filtering should be applied.

**Score: 82%** -- 8/11 services have proper RBAC. 3 services (LLM Router, Notification, Analytics) skip RBAC checks.

---

## 7. Inter-Service Auth (X-Internal-Secret)

| Service | Auth Check | Health Bypass | Status |
|---------|:----------:|:-------------:|:------:|
| svc-ingestion | Yes | Yes | PASS |
| svc-extraction | Yes | Yes | PASS |
| svc-policy | Yes | Yes | PASS |
| svc-ontology | Yes | Yes | PASS |
| svc-skill | Yes | Yes | PASS |
| svc-llm-router | Yes | Yes | PASS |
| svc-security | Yes | Yes | PASS |
| svc-governance | Yes | Yes | PASS |
| svc-notification | Yes | Yes | PASS |
| svc-analytics | Yes | Yes | PASS |
| svc-queue-router | N/A (queue handler) | Yes (fetch) | PASS |

**Score: 100%** -- All services validate `X-Internal-Secret` header on non-health routes.

---

## 8. Test Coverage

| Service | Test Files | Focus Areas | Coverage % | Status |
|---------|:----------:|-------------|:----------:|:------:|
| svc-ingestion | 3 | parsing, queue, routes | 96.66% | PASS |
| svc-extraction | 3 | queue, llm, routes | 100% | PASS |
| svc-policy | 7 | policies, hitl, prompts, llm, queue, handlers | 73.55% | PASS |
| svc-skill | 7 | skills, mcp, llm, queue, builder, handlers | 80.41% | PASS |
| svc-notification | 2 | queue, notifications | 96.72% | PASS |
| svc-analytics | 2 | queue, kpi | 89.65% | PASS |
| svc-ontology | 0 | -- | 0% | FAIL |
| svc-llm-router | 0 | -- | 0% | FAIL |
| svc-security | 0 | -- | 0% | FAIL |
| svc-governance | 0 | -- | 0% | FAIL |
| svc-queue-router | 0 | -- | 0% | FAIL |

**Services with Tests: 6/11 (55%)**
**Services without Tests: 5/11** (svc-ontology, svc-llm-router, svc-security, svc-governance, svc-queue-router)

**Score: 62%** -- 6 services have good test coverage. 5 services have zero tests.

---

## 9. Wrangler Bindings Accuracy

### D1 Databases (10/10)

| Service | Binding | Database Name | Real ID | Status |
|---------|---------|---------------|:-------:|:------:|
| svc-ingestion | DB_INGESTION | db-ingestion | 5a17... | PASS |
| svc-extraction | DB_EXTRACTION | db-structure | 1f45... | PASS |
| svc-policy | DB_POLICY | db-policy | e27a... | PASS |
| svc-ontology | DB_ONTOLOGY | db-ontology | 88cd... | PASS |
| svc-skill | DB_SKILL | db-skill | a3f5... | PASS |
| svc-llm-router | DB_LLM | db-llm | d50f... | PASS |
| svc-security | DB_SECURITY | db-security | 474a... | PASS |
| svc-governance | DB_GOVERNANCE | db-governance | 6b2a... | PASS |
| svc-notification | DB_NOTIFICATION | db-notification | 1a6e... | PASS |
| svc-analytics | DB_ANALYTICS | db-analytics | fe12... | PASS |

### R2 Buckets (2/2)

| Service | Binding | Bucket | Status |
|---------|---------|--------|:------:|
| svc-ingestion | R2_DOCUMENTS | ai-foundry-documents | PASS |
| svc-skill | R2_SKILL_PACKAGES | ai-foundry-skill-packages | PASS |

### Queue Producers (6/6)

All pipeline services declare `QUEUE_PIPELINE` producer bound to `ai-foundry-pipeline`.

### Queue Consumer (1/1)

`svc-queue-router` is the sole consumer with `max_batch_size=10`, `max_batch_timeout=30`.

### KV Namespaces (2/2)

| Service | Binding | ID | Status |
|---------|---------|:--:|:------:|
| svc-llm-router | KV_PROMPTS | 98ef... | PASS |
| svc-governance | KV_PROMPTS | 98ef... | PASS (shared) |

### Durable Objects (1/1)

`svc-policy` declares `HITL_SESSION` DO with class `HitlSession`, migration tag `v1`.

### Service Bindings

| Service | Bindings | Status |
|---------|----------|:------:|
| svc-ingestion | SECURITY | PASS |
| svc-extraction | SECURITY, LLM_ROUTER, SVC_INGESTION | PASS |
| svc-policy | SECURITY, LLM_ROUTER, NOTIFICATION | PASS |
| svc-ontology | SECURITY, LLM_ROUTER | PASS |
| svc-skill | SECURITY, LLM_ROUTER | PASS |
| svc-governance | SECURITY | PASS |
| svc-analytics | SECURITY | PASS |
| svc-queue-router | SVC_INGESTION, SVC_EXTRACTION, SVC_POLICY, SVC_ONTOLOGY, SVC_SKILL, SVC_NOTIFICATION, SVC_ANALYTICS | PASS |

**Score: 100%** -- All bindings match Env interfaces and wrangler.toml declarations.

---

## 10. Environment Separation

| Service | staging config | production config | staging D1 ID | Status |
|---------|:--------------:|:-----------------:|:-------------:|:------:|
| svc-ingestion | Yes | Yes | placeholder | WARN |
| svc-extraction | Yes | Yes | placeholder | WARN |
| svc-policy | Yes | Yes | placeholder | WARN |
| svc-ontology | Yes | Yes | placeholder | WARN |
| svc-skill | Yes | Yes | placeholder | WARN |
| svc-llm-router | Yes | Yes | placeholder | WARN |
| svc-security | Yes | Yes | placeholder | WARN |
| svc-governance | Yes | Yes | placeholder | WARN |
| svc-notification | Yes | Yes | placeholder | WARN |
| svc-analytics | Yes | Yes | placeholder | WARN |
| svc-queue-router | Yes | Yes | N/A | PASS |

All services have `[env.staging]` and `[env.production]` blocks.
**Staging IDs are all `placeholder-staging-id`** -- resources not yet provisioned.
Production IDs are real (match deployed infrastructure).

**Score: 90%** -- Structure is complete; staging resource IDs need replacement after provisioning.

---

## 11. Shared Packages

### @ai-foundry/types

| Schema | File | Validated | Status |
|--------|------|:---------:|:------:|
| API (ApiError, ApiResponse, Pagination) | api.ts | Yes | PASS |
| RBAC (Role, Resource, Action, PERMISSIONS) | rbac.ts | Yes | PASS |
| LLM (LlmRequest, LlmResponse, LlmTier) | llm.ts | Yes | PASS |
| Events (7 PipelineEvent types) | events.ts | Yes | PASS |
| Skill (SkillPackage, Policy, OntologyRef) | skill.ts | Yes | PASS |
| Security (MaskRequest, MaskResponse, PII) | security.ts | Yes | PASS |
| Governance (PromptVersion, TrustEvaluation) | governance.ts | Yes | PASS |
| Policy (PolicyInferRequest, HitlAction) | policy.ts | Yes | PASS |

**Missing types**: No dedicated type file for `ingestion`, `extraction`, or `notification` schemas. These are defined inline in services.

### @ai-foundry/utils

| Utility | File | Used By | Status |
|---------|------|---------|:------:|
| Error classes (AppError, NotFoundError, etc.) | errors.ts | All services | PASS |
| Response helpers (ok, created, err, etc.) | response.ts | All services | PASS |
| Logger (createLogger, child) | logger.ts | All services | PASS |
| RBAC (extractRbacContext, checkPermission, logAudit) | rbac.ts | 8 services | PASS |

**Score: 95%** -- Core types and utils are comprehensive. Minor gap: some domain types are inline rather than in shared package.

---

## 12. Frontend (app-web)

### Design: 13 Screens across 5 Personas

| Persona | Screen | Route | Page File | Status |
|---------|--------|-------|-----------|:------:|
| **Analyst** | Document Upload | /upload | upload.tsx | PASS |
| **Analyst** | Pipeline Monitor | /pipeline | pipeline.tsx | PASS |
| **Analyst** | Comparison View | /comparison | comparison.tsx | PASS |
| **Reviewer** | Review Queue | /review | review-queue.tsx | PASS |
| **Reviewer** | Review Detail | /review/:policyId | review-detail.tsx | PASS |
| **Developer** | Skill Catalog | /skills | skill-catalog.tsx | PASS |
| **Developer** | Skill Detail | /skills/:skillId | skill-detail.tsx | PASS |
| **Client** | Results View | /results | results.tsx | PASS |
| **Client** | Audit Trail | /audit | audit.tsx | PASS |
| **Executive** | Dashboard | /dashboard | dashboard.tsx | PASS |
| **Executive** | Cost Monitor | /cost | cost.tsx | PASS |
| **Common** | Login | /login | login.tsx | PASS |
| **Common** | 404 Not Found | * | not-found.tsx | PASS |

**Implemented: 13/13 screens** (11 persona screens + login + 404)

### Frontend API Layer

| API Module | Endpoints | Status |
|------------|-----------|:------:|
| ingestion.ts | Upload | PASS |
| extraction.ts | Extraction data | PASS |
| policy.ts | Policy CRUD + HITL actions | PASS |
| skill.ts | Skill catalog + detail | PASS |
| security.ts | Audit logs | PASS |
| governance.ts | Governance data | PASS |

### Frontend Architecture

- React 18 + Vite + react-router-dom v6
- Lazy-loaded routes with Suspense
- Inline styles (no CSS framework) -- matches design decision
- StatusBadge shared component

**Score: 92%** -- All 13 screens implemented. Minor gaps: no analytics/notification API module in frontend, dashboard fetches data from skill/security APIs rather than dedicated analytics endpoints.

---

## 13. CI/CD Pipeline

| Workflow | File | Trigger | Status |
|----------|------|---------|:------:|
| CI (typecheck + test) | ci.yml | push/PR to main | PASS |
| Deploy Workers | deploy-services.yml | push/dispatch/release | PASS |
| Deploy Pages | deploy-pages.yml | push/dispatch/release | PASS |

### CI/CD Features

- Bun setup with frozen lockfile
- Matrix deployment for 11 services (parallel 4)
- Changed-service detection (git diff)
- Shared package change triggers all-service deploy
- Environment-based deployment (staging auto, production manual/release)
- Pages staging/production branch strategy
- Concurrency control (no cancel-in-progress)

**Score: 95%** -- Comprehensive CI/CD. Minor: no explicit lint step in CI (only typecheck + test).

---

## 14. Key Design Decisions Compliance

| Decision | Description | Implemented | Status |
|----------|-------------|:-----------:|:------:|
| T-1 | Hybrid parsing (Unstructured.io + Claude Vision + Excel) | Unstructured.io integration present; Excel/Vision in pipeline | PASS |
| T-2 | Claude-centric tiered LLM (Opus/Sonnet/Haiku + Workers AI) | 4-tier routing with auth enforcement | PASS |
| T-3 | SKOS/JSON-LD ontology + Neo4j Aura | Neo4j Query API v2 client + SKOS term mappings | PASS |
| T-4 | Custom Skill Spec as SSOT; MCP/OpenAPI adapters | .skill.json schema + MCP adapter; OpenAPI deferred | PASS |
| T-5 | HITL via CF native primitives (DO + Queues + D1) | HitlSession DO with full state machine | PASS |
| T-6 | Full Cloudflare stack + Anthropic + Neo4j | All infrastructure on Cloudflare | PASS |

**Score: 100%**

---

## Differences Found

### CRITICAL: Missing Features (Design exists, Implementation missing)

None.

### MAJOR: Gaps Requiring Attention

| # | Item | Design Location | Implementation Location | Description | Severity |
|---|------|-----------------|------------------------|-------------|:--------:|
| M-1 | RBAC on svc-notification | CLAUDE.md RBAC | svc-notification/src/index.ts | No extractRbacContext/checkPermission calls on notification endpoints. Any internal caller can list/read notifications without role check. | Major |
| M-2 | RBAC on svc-analytics | CLAUDE.md RBAC | svc-analytics/src/index.ts | No RBAC checks on /kpi, /cost, /dashboards. Executive/Analyst role filtering should be applied. | Major |
| M-3 | Tests for svc-ontology | Test coverage target | services/svc-ontology/ | Zero test files. Neo4j client, normalize handler, terms handler, queue handler all untested. | Major |
| M-4 | Tests for svc-llm-router | Test coverage target | services/svc-llm-router/ | Zero test files. Tier routing logic, gateway integration, cost logging untested. | Major |
| M-5 | Tests for svc-security | Test coverage target | services/svc-security/ | Zero test files. RBAC check, audit, PII masking/tokenization untested. | Major |
| M-6 | Tests for svc-governance | Test coverage target | services/svc-governance/ | Zero test files. Prompt registry, cost monitor, trust evaluation untested. | Major |
| M-7 | Tests for svc-queue-router | Test coverage target | services/svc-queue-router/ | Zero test files. Event routing logic untested. | Major |
| M-8 | Staging resource IDs | Env separation (Phase 9) | All wrangler.toml staging blocks | All staging D1/R2/KV/Queue IDs are `placeholder-staging-id`. Cannot deploy to staging. | Major |

### MINOR: Differences and Improvements

| # | Item | Design | Implementation | Impact |
|---|------|--------|----------------|:------:|
| m-1 | OpenAPI adapter endpoint | Design mentions OpenAPI as Phase 4 adapter | GET /skills/:id/openapi not implemented | Minor |
| m-2 | RBAC on svc-llm-router | RBAC on all services | LLM router relies on X-Internal-Secret only (no RBAC headers) | Minor |
| m-3 | Admin role | Not in original 5-role design | Added as 6th role with full permissions in RBAC matrix | Minor (beneficial) |
| m-4 | CI lint step | CLAUDE.md says `bun run typecheck && bun run lint` | CI workflow only runs typecheck + test, no explicit lint | Minor |
| m-5 | Inline types for ingestion/extraction | Types should be in @ai-foundry/types | Some types (Document, Extraction result) defined inline in services | Minor |
| m-6 | Frontend analytics API | Frontend should call svc-analytics | Dashboard page calls skill + security APIs instead of analytics | Minor |
| m-7 | Notification SECURITY binding | Cross-cutting services need audit | svc-notification wrangler.toml has no SECURITY service binding | Minor |
| m-8 | prompt_registry in db-llm | Design: Prompt Registry in svc-governance | db-llm also has prompt_registry table; potential duplication with db-governance prompt_versions | Minor |

### Intentional Differences (Documented)

| # | Item | Notes |
|---|------|-------|
| I-1 | Neo4j Query API v2 | Design says "Neo4j Aura"; implementation correctly uses Query API v2 (Bolt unavailable in Workers) |
| I-2 | Single queue consumer | Design says per-service consumers; implemented as centralized svc-queue-router (better pattern) |
| I-3 | TIER_MODELS uses latest Claude models | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5 (updated from original model IDs) |
| I-4 | Policy code UNIQUE removed | 0002 migration drops UNIQUE on policy_code for multi-tenant support |
| I-5 | extraction table column rename | 0002 migration renames extraction_id to id and adds result_json/updated_at |

---

## 15. Convention Compliance

### Naming Convention

| Category | Convention | Compliance | Notes |
|----------|-----------|:----------:|-------|
| Service folders | kebab-case (svc-ingestion) | 100% | All 11 services |
| Source files | camelCase.ts (routes, utils) | 95% | StatusBadge.tsx is PascalCase (correct for components) |
| Env interfaces | PascalCase (Env) | 100% | All services |
| Zod schemas | PascalCase + Schema suffix | 100% | LlmRequestSchema, PipelineEventSchema, etc. |
| Types | PascalCase | 100% | LlmTier, Role, SkillPackage, etc. |
| Constants | UPPER_SNAKE_CASE | 100% | TIER_MODELS, PII_PATTERNS, PERMISSIONS |
| Functions | camelCase | 100% | handleUpload, processQueueEvent, etc. |

### Import Order

Consistent pattern across all services:
1. External (@ai-foundry/types, @ai-foundry/utils)
2. Internal relative (./env.js, ./routes/...)
3. Types (type imports)

### TypeScript Strictness

All code follows strict TypeScript patterns:
- Proper null checks with `noUncheckedIndexedAccess`
- `satisfies ExportedHandler<Env>` usage
- No `any` types detected in service code

**Convention Score: 97%**

---

## 16. Architecture Compliance

### Dependency Direction

```
Presentation (app-web)
    |
    v
Application (services)
    |
    v
Domain (@ai-foundry/types)
    |
Infrastructure (@ai-foundry/utils, D1, R2, Neo4j)
```

- Frontend pages call API modules (not services directly) -- PASS
- Services import from @ai-foundry/types and @ai-foundry/utils -- PASS
- No circular dependencies detected -- PASS
- Queue-router fans out via service bindings (not direct fetch) -- PASS

**Architecture Score: 98%**

---

## Summary Scores

| Category | Score | Weight | Weighted |
|----------|:-----:|:------:|:--------:|
| Service Architecture | 100% | 15% | 15.0% |
| Endpoint Completeness | 99% | 10% | 9.9% |
| Business Logic | 92% | 15% | 13.8% |
| D1 Schema | 100% | 10% | 10.0% |
| Queue Events | 100% | 5% | 5.0% |
| RBAC | 82% | 10% | 8.2% |
| Inter-Service Auth | 100% | 5% | 5.0% |
| Test Coverage | 62% | 10% | 6.2% |
| Wrangler Bindings | 100% | 5% | 5.0% |
| Environment Separation | 90% | 5% | 4.5% |
| Shared Packages | 95% | 3% | 2.85% |
| Frontend | 92% | 3% | 2.76% |
| CI/CD | 95% | 2% | 1.9% |
| Convention | 97% | 2% | 1.94% |
| | | | **92.1%** |

**Overall Match Rate: 92%** -- Design and implementation match well.

---

## Recommended Actions for Phase I

### Immediate (Before Staging Deploy)

1. **Provision staging resources** -- Replace all `placeholder-staging-id` values in wrangler.toml files for D1, R2, Queues, KV
2. **Add RBAC to svc-notification** -- Import extractRbacContext/checkPermission; add SECURITY service binding to wrangler.toml
3. **Add RBAC to svc-analytics** -- Import extractRbacContext/checkPermission; enforce Executive/Analyst role checks

### High Priority (Phase I Polish)

4. **Add unit tests for svc-llm-router** -- Test resolveTier() logic, opus authorization, cost logging
5. **Add unit tests for svc-security** -- Test RBAC check, PII detection patterns, tokenization, audit writing
6. **Add unit tests for svc-governance** -- Test prompt registry CRUD, trust evaluation
7. **Add unit tests for svc-ontology** -- Test Neo4j client, normalization, term CRUD
8. **Add unit tests for svc-queue-router** -- Test event routing, invalid event handling

### Medium Priority

9. **Add lint step to CI** -- Add `bun run lint` between typecheck and test in ci.yml
10. **Extract inline types to @ai-foundry/types** -- Move Document, Extraction, Notification row types to shared package
11. **Add SECURITY binding to svc-notification** -- Enable audit logging for notification actions
12. **Clean up prompt_registry duplication** -- db-llm has prompt_registry table that overlaps with db-governance prompt_versions

### Low Priority (Phase 2+)

13. **Implement OpenAPI adapter endpoint** -- GET /skills/:id/openapi
14. **Add frontend analytics API module** -- Create api/analytics.ts calling svc-analytics endpoints
15. **Add GitHub Environments** -- Configure staging/production protection rules
16. **Add monitoring/alerting** -- Cloudflare Workers analytics, error rate alerts

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-01 | Initial comprehensive analysis | gap-detector agent |
