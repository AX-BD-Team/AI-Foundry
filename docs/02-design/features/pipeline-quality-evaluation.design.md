---
code: AIF-DSGN-022
title: "Pipeline Quality Evaluation System — Design Document"
version: "1.0"
status: Draft
category: DSGN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# Pipeline Quality Evaluation System — Design Document

> **Summary**: 5-Stage 파이프라인 출력물에 대한 3-Stage 자동 평가 (Mechanical → Semantic → Consensus) + Ambiguity Gate + Brownfield Context
>
> **Project**: AI Foundry (res-ai-foundry)
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-18
> **Status**: Draft
> **Planning Doc**: [pipeline-quality-evaluation.plan.md](../../01-plan/features/pipeline-quality-evaluation.plan.md)
> **REQ**: AIF-REQ-022 (P1, Feature/Pipeline)

---

## 1. Overview

### 1.1 Design Goals

1. **비용 최적화된 다층 평가**: Mechanical($0) → Semantic(Sonnet ~$0.05) → Consensus(Opus ~$0.15) 순으로 비용 증가하는 파이프라인 구성
2. **기존 인프라 최대 재사용**: `svc-governance`의 `quality_evaluations` 테이블, `svc-policy`의 `callOpusLlm()`, `HitlSession` DO 확장
3. **비동기 비차단**: Eval 단계가 기존 파이프라인의 처리 시간을 blocking하지 않음 — Queue 기반 비동기 처리
4. **점진적 도입**: Phase 1~4 순차 구현, 각 Phase 독립 배포·롤백 가능

### 1.2 Design Principles

- **Fail-open**: Eval 실패 시 기존 흐름을 차단하지 않고 `eval_status: 'skipped'` 로 통과 (HITL에 위임)
- **기존 스키마 확장**: 새로운 D1 DB를 추가하지 않고 `svc-governance`의 `db-governance`에 `pipeline_evaluations` 테이블 추가
- **프롬프트 분리**: 모든 LLM 평가 프롬프트는 별도 모듈 (`prompts/*.ts`)로 분리하여 버전 관리
- **org 격리**: 모든 평가 결과에 `organization_id` 필수 — 멀티 org 환경 대응

---

## 2. Architecture

### 2.1 Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Pipeline Quality Evaluation                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────┐                                        │
│  │ SVC-01: Ingestion           │                                        │
│  │  ┌───────────────────────┐  │                                        │
│  │  │ eval/ambiguity.ts     │  │  문서 품질 Gate (규칙 기반, $0)          │
│  │  │ AmbiguityScorer       │  │  ambiguity > 0.2 → rejected_ambiguous  │
│  │  └───────────────────────┘  │                                        │
│  │  ┌───────────────────────┐  │                                        │
│  │  │ eval/brownfield.ts    │  │  기존 데이터 맥락 수집                   │
│  │  │ BrownfieldExplorer    │──┼──→ D1: db-policy, db-ontology           │
│  │  └───────────────────────┘  │                                        │
│  └─────────────┬───────────────┘                                        │
│                │ ingestion.completed (+ brownfieldContext)                │
│                ▼                                                         │
│  ┌─────────────────────────────┐                                        │
│  │ SVC-03: Policy Inference    │                                        │
│  │  ┌───────────────────────┐  │                                        │
│  │  │ eval/mechanical.ts    │  │  구조 검증 ($0)                         │
│  │  │ MechanicalVerifier    │  │  Zod strict + 길이 + 형식 + 중복        │
│  │  └───────────┬───────────┘  │                                        │
│  │              │ pass          │                                        │
│  │  ┌───────────▼───────────┐  │                                        │
│  │  │ eval/semantic.ts      │──┼──→ svc-llm-router (Sonnet, ~$0.05)     │
│  │  │ SemanticEvaluator     │  │  5-dimension 채점                       │
│  │  └───────────┬───────────┘  │                                        │
│  │              │ needs_review  │                                        │
│  │  ┌───────────▼───────────┐  │                                        │
│  │  │ eval/consensus.ts     │──┼──→ svc-llm-router (Opus, ~$0.15)       │
│  │  │ ConsensusEngine       │  │  Advocate-Devil-Judge 3자 토론          │
│  │  └───────────┬───────────┘  │                                        │
│  │              │               │                                        │
│  │  ┌───────────▼───────────┐  │                                        │
│  │  │ HitlSession DO        │  │  eval 결과를 metadata로 첨부            │
│  │  │ (기존 확장)            │  │                                        │
│  │  └───────────────────────┘  │                                        │
│  └─────────────┬───────────────┘                                        │
│                │                                                         │
│                ▼                                                         │
│  ┌─────────────────────────────┐                                        │
│  │ SVC-05: Skill Packaging     │                                        │
│  │  ┌───────────────────────┐  │                                        │
│  │  │ eval/mechanical.ts    │  │  스키마 + trust + 완전성 검증           │
│  │  │ SkillMechanicalVerifier│  │                                       │
│  │  └───────────┬───────────┘  │                                        │
│  │  ┌───────────▼───────────┐  │                                        │
│  │  │ eval/semantic.ts      │──┼──→ svc-llm-router (Sonnet)              │
│  │  │ SkillSemanticEvaluator│  │  3-dimension 채점                       │
│  │  └───────────────────────┘  │                                        │
│  └─────────────┬───────────────┘                                        │
│                │                                                         │
│                ▼                                                         │
│  ┌─────────────────────────────┐                                        │
│  │ SVC-08: Governance          │                                        │
│  │  pipeline_evaluations 저장   │  모든 eval 결과 집계                    │
│  │  trust_evaluations 연동      │  trust score 반영                      │
│  │  quality dashboard 노출      │                                        │
│  └─────────────────────────────┘                                        │
│                                                                          │
│  ┌─────────────────────────────┐                                        │
│  │ @ai-foundry/types           │                                        │
│  │  evaluation.ts (신규)        │  공통 Eval 타입/스키마                  │
│  └─────────────────────────────┘                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow — Policy 3-Stage Evaluation Sequence

```
processQueueEvent()  (extraction.completed 수신)
    │
    ├── 1. Fetch extraction result (기존)
    ├── 2. Build policy prompt + callOpusLlm() (기존)
    ├── 3. Parse candidates (기존)
    │
    │   ─── 여기서부터 신규 ──────────────────────────
    │
    ├── 4. for each candidate:
    │      │
    │      ├── 4a. MechanicalVerifier.verify(candidate)
    │      │       ├── pass   → continue to 4b
    │      │       └── fail   → D1 INSERT (status='rejected_mechanical')
    │      │                    + POST /pipeline-evaluations → skip 4b,4c
    │      │
    │      ├── 4b. SemanticEvaluator.evaluate(candidate)     [async, Sonnet]
    │      │       ├── pass         → evalVerdict = 'pass'
    │      │       ├── needs_review → continue to 4c
    │      │       └── fail         → evalVerdict = 'fail'
    │      │
    │      └── 4c. ConsensusEngine.deliberate(candidate)     [async, Opus ×3~5]
    │              ├── approve      → evalVerdict = 'consensus_approve'
    │              ├── reject       → evalVerdict = 'consensus_reject'
    │              └── split        → evalVerdict = 'consensus_split'
    │
    ├── 5. D1 INSERT (기존) + evalVerdict를 metadata 컬럼에 저장
    ├── 6. HITL Session init (기존) + eval 결과 첨부
    ├── 7. POST svc-governance /pipeline-evaluations (평가 결과 기록)
    └── 8. Emit policy.candidate_ready (기존)
```

### 2.3 Data Flow — Ambiguity Gate + Brownfield (Ingestion)

```
svc-ingestion queue.ts  (document.uploaded 수신)
    │
    ├── 1. R2에서 파일 다운로드 (기존)
    ├── 2. Unstructured.io / custom parser 파싱 (기존)
    ├── 3. Chunks 생성 (기존)
    │
    │   ─── 여기서부터 신규 ──────────────────────────
    │
    ├── 4. AmbiguityScorer.score(chunks)
    │      ├── ambiguity ≤ 0.2 → continue
    │      └── ambiguity > 0.2 → document status = 'rejected_ambiguous'
    │                             error_message = dimension별 부족 피드백
    │                             → STOP (ingestion.completed 이벤트 미발행)
    │
    ├── 5. BrownfieldExplorer.explore(orgId, env)
    │      → BrownfieldContext { existingPolicyCodes, existingTerms, domainDistribution }
    │
    ├── 6. D1 INSERT chunks (기존)
    └── 7. Emit ingestion.completed (기존 payload + brownfieldContext)
```

### 2.4 Service Dependencies

| Component | Service | Depends On | Communication |
|-----------|---------|-----------|---------------|
| AmbiguityScorer | svc-ingestion | — (순수 함수) | 없음 |
| BrownfieldExplorer | svc-ingestion | svc-policy, svc-ontology | Service Binding |
| MechanicalVerifier (Policy) | svc-policy | — (순수 함수) | 없음 |
| SemanticEvaluator (Policy) | svc-policy | svc-llm-router | Service Binding |
| ConsensusEngine | svc-policy | svc-llm-router | Service Binding |
| MechanicalVerifier (Skill) | svc-skill | — (순수 함수) | 없음 |
| SemanticEvaluator (Skill) | svc-skill | svc-llm-router | Service Binding |
| Pipeline Evaluations API | svc-governance | — (D1 only) | 내부 API |

---

## 3. Data Models

### 3.1 공통 평가 타입 — `packages/types/src/evaluation.ts` (신규)

```typescript
import { z } from "zod";

// ── Eval Stages ──────────────────────────────────────────────────────

export const EvalStageSchema = z.enum([
  "mechanical",
  "semantic",
  "consensus",
  "ambiguity",
  "brownfield",
]);
export type EvalStage = z.infer<typeof EvalStageSchema>;

// ── Eval Verdict ─────────────────────────────────────────────────────

export const EvalVerdictSchema = z.enum([
  "pass",
  "fail",
  "needs_review",
  "consensus_approve",
  "consensus_reject",
  "consensus_split",
  "skipped",
]);
export type EvalVerdict = z.infer<typeof EvalVerdictSchema>;

// ── Eval Issue (개별 문제 항목) ──────────────────────────────────────

export const EvalIssueSchema = z.object({
  code: z.string(),                 // e.g. "MECH_EMPTY_CONDITION", "SEM_LOW_SPECIFICITY"
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  dimension: z.string().optional(),  // semantic eval의 경우 dimension명
  detail: z.string().optional(),
});
export type EvalIssue = z.infer<typeof EvalIssueSchema>;

// ── Eval Result (단일 Stage 결과) ────────────────────────────────────

export const EvalResultSchema = z.object({
  stage: EvalStageSchema,
  verdict: EvalVerdictSchema,
  score: z.number().min(0).max(1),
  issues: z.array(EvalIssueSchema),
  evaluator: z.string(),            // "mechanical", "sonnet-semantic", "opus-consensus"
  durationMs: z.number().int(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(), // stage별 추가 데이터
});
export type EvalResult = z.infer<typeof EvalResultSchema>;

// ── Eval Pipeline Result (전체 파이프라인 결과) ──────────────────────

export const EvalPipelineResultSchema = z.object({
  targetType: z.enum(["policy", "skill", "document"]),
  targetId: z.string(),
  organizationId: z.string(),
  stages: z.array(EvalResultSchema),
  finalVerdict: EvalVerdictSchema,
  finalScore: z.number().min(0).max(1),
  completedAt: z.string().datetime(),
});
export type EvalPipelineResult = z.infer<typeof EvalPipelineResultSchema>;

// ── Semantic Eval Dimensions ─────────────────────────────────────────

/** Policy 시맨틱 평가 5개 차원 */
export const PolicySemanticDimensionSchema = z.object({
  specificity: z.number().min(0).max(1),
  consistency: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  actionability: z.number().min(0).max(1),
  traceability: z.number().min(0).max(1),
});
export type PolicySemanticDimension = z.infer<typeof PolicySemanticDimensionSchema>;

/** Skill 시맨틱 평가 3개 차원 */
export const SkillSemanticDimensionSchema = z.object({
  coverage: z.number().min(0).max(1),
  coherence: z.number().min(0).max(1),
  granularity: z.number().min(0).max(1),
});
export type SkillSemanticDimension = z.infer<typeof SkillSemanticDimensionSchema>;

// ── Consensus Types ──────────────────────────────────────────────────

export const ConsensusRoleSchema = z.enum(["advocate", "devil", "judge"]);
export type ConsensusRole = z.infer<typeof ConsensusRoleSchema>;

export const ConsensusDecisionSchema = z.enum(["approve", "reject", "split"]);
export type ConsensusDecision = z.infer<typeof ConsensusDecisionSchema>;

export const ConsensusVerdictSchema = z.object({
  finalDecision: ConsensusDecisionSchema,
  rounds: z.number().int().min(1).max(2),
  advocateArgs: z.string(),
  devilArgs: z.string(),
  judgeReasoning: z.string(),
  round2Questions: z.array(z.string()).optional(),
  round2Reasoning: z.string().optional(),
});
export type ConsensusVerdict = z.infer<typeof ConsensusVerdictSchema>;

// ── Ambiguity Score Types ────────────────────────────────────────────

export const AmbiguityDimensionScoresSchema = z.object({
  goalClarity: z.number().min(0).max(1),
  constraintClarity: z.number().min(0).max(1),
  successCriteria: z.number().min(0).max(1),
});
export type AmbiguityDimensionScores = z.infer<typeof AmbiguityDimensionScoresSchema>;

export const AmbiguityResultSchema = z.object({
  ambiguityScore: z.number().min(0).max(1),
  dimensions: AmbiguityDimensionScoresSchema,
  rejected: z.boolean(),
  feedback: z.array(z.string()),     // 부족한 dimension 피드백 목록
});
export type AmbiguityResult = z.infer<typeof AmbiguityResultSchema>;

// ── Brownfield Context ───────────────────────────────────────────────

export const BrownfieldContextSchema = z.object({
  existingPolicyCodes: z.array(z.string()),
  existingTerms: z.array(z.object({
    termId: z.string(),
    label: z.string(),
    termType: z.string(),
  })),
  domainDistribution: z.record(z.number()),  // domain → count
  totalPolicies: z.number().int(),
  totalTerms: z.number().int(),
  scannedAt: z.string().datetime(),
});
export type BrownfieldContext = z.infer<typeof BrownfieldContextSchema>;

// ── Pipeline Evaluation Record (DB row) ──────────────────────────────

export const CreatePipelineEvaluationSchema = z.object({
  targetType: z.enum(["policy", "skill", "document"]),
  targetId: z.string().min(1),
  organizationId: z.string().min(1),
  stage: EvalStageSchema,
  verdict: EvalVerdictSchema,
  score: z.number().min(0).max(1),
  issuesJson: z.string(),           // JSON.stringify(EvalIssue[])
  evaluator: z.string(),
  durationMs: z.number().int(),
  metadataJson: z.string().optional(), // JSON.stringify(stage-specific data)
});
export type CreatePipelineEvaluation = z.infer<typeof CreatePipelineEvaluationSchema>;
```

### 3.2 D1 마이그레이션 — `pipeline_evaluations` 테이블

**경로**: `infra/migrations/db-governance/0005_pipeline_evaluations.sql`

```sql
-- Pipeline Quality Evaluation results
-- 모든 eval stage (mechanical, semantic, consensus, ambiguity) 결과를 통합 저장
CREATE TABLE IF NOT EXISTS pipeline_evaluations (
  eval_id        TEXT PRIMARY KEY,
  target_type    TEXT NOT NULL CHECK(target_type IN ('policy', 'skill', 'document')),
  target_id      TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  stage          TEXT NOT NULL CHECK(stage IN ('mechanical', 'semantic', 'consensus', 'ambiguity', 'brownfield')),
  verdict        TEXT NOT NULL CHECK(verdict IN ('pass', 'fail', 'needs_review', 'consensus_approve', 'consensus_reject', 'consensus_split', 'skipped')),
  score          REAL NOT NULL CHECK(score >= 0 AND score <= 1),
  issues_json    TEXT NOT NULL DEFAULT '[]',       -- JSON array of EvalIssue
  evaluator      TEXT NOT NULL,                    -- 'mechanical', 'sonnet-semantic', 'opus-consensus'
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  metadata_json  TEXT,                             -- stage별 추가 데이터 (consensus verdict, dimension scores 등)
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 인덱스: target별 조회 (HITL 세션에서 eval 결과 참조)
CREATE INDEX IF NOT EXISTS idx_pe_target
  ON pipeline_evaluations(target_type, target_id);

-- 인덱스: org + stage별 집계 (대시보드)
CREATE INDEX IF NOT EXISTS idx_pe_org_stage
  ON pipeline_evaluations(organization_id, stage, created_at);

-- 인덱스: verdict 필터 (needs_review 건만 조회)
CREATE INDEX IF NOT EXISTS idx_pe_verdict
  ON pipeline_evaluations(verdict, created_at);
```

### 3.3 기존 테이블 확장

#### `policies` 테이블 — eval_metadata 컬럼 추가

```sql
-- infra/migrations/db-policy/00XX_add_eval_metadata.sql
ALTER TABLE policies ADD COLUMN eval_verdict TEXT;
ALTER TABLE policies ADD COLUMN eval_score REAL;
ALTER TABLE policies ADD COLUMN eval_metadata_json TEXT;
```

---

## 4. API Interfaces

### 4.1 신규 Endpoint — svc-governance

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/pipeline-evaluations` | 평가 결과 생성 | Internal |
| GET | `/pipeline-evaluations` | 평가 결과 목록 (필터) | Internal |
| GET | `/pipeline-evaluations/summary` | org별 stage별 집계 | Internal |
| GET | `/pipeline-evaluations/:targetId` | 특정 target의 전체 eval 이력 | Internal |

#### `POST /pipeline-evaluations`

**Request Body**: `CreatePipelineEvaluationSchema`

```typescript
{
  targetType: "policy",
  targetId: "uuid-...",
  organizationId: "org-lpon",
  stage: "mechanical",
  verdict: "pass",
  score: 1.0,
  issuesJson: "[]",
  evaluator: "mechanical",
  durationMs: 12
}
```

**Response** (201):

```typescript
{
  success: true,
  data: {
    evalId: "pe-abcd1234",
    targetType: "policy",
    targetId: "uuid-...",
    stage: "mechanical",
    verdict: "pass",
    score: 1.0,
    createdAt: "2026-03-18T10:00:00Z"
  }
}
```

#### `GET /pipeline-evaluations`

**Query Parameters**:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `organizationId` | Yes | 조직 ID |
| `targetType` | No | `policy` / `skill` / `document` |
| `stage` | No | `mechanical` / `semantic` / `consensus` |
| `verdict` | No | `pass` / `fail` / `needs_review` 등 |
| `limit` | No | 기본 100, 최대 500 |
| `offset` | No | 페이지네이션 |

#### `GET /pipeline-evaluations/summary`

**Query Parameters**: `organizationId` (필수)

**Response** (200):

```typescript
{
  success: true,
  data: {
    byStage: {
      mechanical: { total: 100, pass: 85, fail: 15, avgScore: 0.92 },
      semantic:   { total: 85,  pass: 60, needsReview: 20, fail: 5, avgScore: 0.74 },
      consensus:  { total: 20,  approve: 15, reject: 3, split: 2, avgScore: 0.78 }
    },
    byTargetType: {
      policy: { total: 95, passRate: 0.82 },
      skill:  { total: 10, passRate: 0.90 }
    },
    filterRate: {
      mechanicalFilterPct: 15.0,
      semanticPassPct: 70.6,
      consensusApprovePct: 75.0
    }
  }
}
```

#### `GET /pipeline-evaluations/:targetId`

특정 policy/skill의 전체 평가 이력을 시간순으로 반환.

**Response** (200):

```typescript
{
  success: true,
  data: {
    targetId: "uuid-...",
    targetType: "policy",
    evaluations: [
      { stage: "mechanical", verdict: "pass", score: 1.0, ... },
      { stage: "semantic",   verdict: "needs_review", score: 0.62, ... },
      { stage: "consensus",  verdict: "consensus_approve", score: 0.78, ... }
    ]
  }
}
```

### 4.2 기존 Endpoint 확장 — svc-policy

#### HITL Session — eval 결과 전달

`POST /internal/queue-event` 핸들러 내에서 HITL Session init 시 eval 결과를 함께 전달:

```typescript
// HitlSession DO init payload 확장
{
  policyId: string;
  sessionId: string;
  evalResult?: {              // 신규 optional 필드
    verdict: EvalVerdict;
    score: number;
    stages: EvalResult[];
    consensusVerdict?: ConsensusVerdict;
  };
}
```

`HitlSession` DO의 `getStatus()`에서 eval 결과를 함께 반환하여 리뷰어에게 노출.

---

## 5. Module Design

### 5.1 `services/svc-policy/src/eval/mechanical.ts` — MechanicalVerifier

```typescript
import { PolicyCandidateSchema, type PolicyCandidate } from "@ai-foundry/types";
import type { EvalResult, EvalIssue } from "@ai-foundry/types";

const POLICY_CODE_REGEX = /^POL-[A-Z]+-[A-Z-]+-\d{3}$/;
const MIN_FIELD_LENGTH = 10;

interface MechanicalVerifyContext {
  /** 동일 org의 기존 policy 목록 (중복 검출용) */
  existingPolicies: Array<{ policyCode: string; title: string; condition: string }>;
}

export class MechanicalVerifier {
  /**
   * Policy candidate 기계 검증.
   * LLM 호출 없이 규칙 기반으로 구조적 정합성을 검사한다.
   *
   * 검증 항목:
   * 1. Zod 스키마 strict parse
   * 2. 필수 필드 최소 길이 (condition, criteria, outcome 각 10자 이상)
   * 3. policyCode 형식 (POL-{DOMAIN}-{TYPE}-{SEQ})
   * 4. tags 배열 유효성 (빈 문자열 불허)
   * 5. 기존 policy와의 중복 검출 (Jaccard 유사도 > 0.8)
   */
  verify(
    candidate: PolicyCandidate,
    ctx: MechanicalVerifyContext,
  ): EvalResult {
    const startMs = Date.now();
    const issues: EvalIssue[] = [];

    // 1. Zod strict re-parse
    const strictResult = PolicyCandidateSchema.strict().safeParse(candidate);
    if (!strictResult.success) {
      issues.push({
        code: "MECH_SCHEMA_INVALID",
        severity: "error",
        message: `Schema validation failed: ${strictResult.error.message}`,
      });
    }

    // 2. 필수 필드 최소 길이
    this.checkMinLength(candidate.condition, "condition", issues);
    this.checkMinLength(candidate.criteria, "criteria", issues);
    this.checkMinLength(candidate.outcome, "outcome", issues);

    // 3. policyCode 형식
    if (!POLICY_CODE_REGEX.test(candidate.policyCode)) {
      issues.push({
        code: "MECH_INVALID_CODE_FORMAT",
        severity: "error",
        message: `policyCode '${candidate.policyCode}' does not match POL-{DOMAIN}-{TYPE}-{SEQ}`,
      });
    }

    // 4. tags 유효성
    for (const tag of candidate.tags) {
      if (tag.trim().length === 0) {
        issues.push({
          code: "MECH_EMPTY_TAG",
          severity: "warning",
          message: "tags 배열에 빈 문자열이 포함됨",
        });
        break;
      }
    }

    // 5. 중복 검출
    const duplicates = this.findDuplicates(candidate, ctx.existingPolicies);
    for (const dup of duplicates) {
      issues.push({
        code: "MECH_DUPLICATE_DETECTED",
        severity: "warning",
        message: `기존 정책 '${dup.policyCode}'와 유사도 ${dup.similarity.toFixed(2)} — 중복 가능성`,
        detail: dup.policyCode,
      });
    }

    const hasErrors = issues.some((i) => i.severity === "error");
    const durationMs = Date.now() - startMs;

    return {
      stage: "mechanical",
      verdict: hasErrors ? "fail" : "pass",
      score: hasErrors ? 0 : 1.0,
      issues,
      evaluator: "mechanical",
      durationMs,
      timestamp: new Date().toISOString(),
    };
  }

  private checkMinLength(
    value: string,
    fieldName: string,
    issues: EvalIssue[],
  ): void {
    if (value.length < MIN_FIELD_LENGTH) {
      issues.push({
        code: `MECH_SHORT_${fieldName.toUpperCase()}`,
        severity: "error",
        message: `${fieldName}이(가) ${MIN_FIELD_LENGTH}자 미만 (현재 ${value.length}자)`,
      });
    }
  }

  /**
   * 기존 policy와의 Jaccard 유사도 계산.
   * title + condition 토큰화 후 집합 유사도 비교.
   */
  private findDuplicates(
    candidate: PolicyCandidate,
    existing: MechanicalVerifyContext["existingPolicies"],
  ): Array<{ policyCode: string; similarity: number }> {
    const candidateTokens = this.tokenize(
      `${candidate.title} ${candidate.condition}`,
    );
    const result: Array<{ policyCode: string; similarity: number }> = [];

    for (const policy of existing) {
      const existingTokens = this.tokenize(
        `${policy.title} ${policy.condition}`,
      );
      const similarity = this.jaccardSimilarity(candidateTokens, existingTokens);
      if (similarity > 0.8) {
        result.push({ policyCode: policy.policyCode, similarity });
      }
    }

    return result;
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\sㄱ-힣]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1),
    );
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
```

### 5.2 `services/svc-ingestion/src/eval/ambiguity.ts` — AmbiguityScorer

```typescript
import type { AmbiguityResult, AmbiguityDimensionScores } from "@ai-foundry/types";

/** Ambiguity Score 가중치 */
const WEIGHTS = {
  goalClarity: 0.4,
  constraintClarity: 0.3,
  successCriteria: 0.3,
} as const;

/** Ambiguity 임계값 — 이 값 초과 시 반려 */
const AMBIGUITY_THRESHOLD = 0.2;

// ── 키워드 사전 ──────────────────────────────────────────────────

const GOAL_KEYWORDS = [
  "목적", "목표", "개요", "배경", "기능", "요구사항",
  "purpose", "objective", "overview", "goal", "requirement",
  "대상", "범위", "scope",
];

const CONSTRAINT_PATTERNS = [
  /(?:만약|만일|~인\s*경우|~할\s*때|~하면|조건|제약|제한)/g,
  /(?:if|when|unless|provided\s+that|constraint|condition)/gi,
  /(?:이상|이하|초과|미만|이내|까지|부터)/g,
];

const CRITERIA_PATTERN = /\d+\s*(?:일|건|원|%|시간|분|초|회|명|개|번|차|페이지|MB|GB)/g;

export class AmbiguityScorer {
  /**
   * 문서 chunks의 명확도를 3차원으로 측정하여 ambiguity score를 산출한다.
   *
   * ambiguity = 1 - Σ(clarity_dimension × weight)
   * ambiguity > 0.2 → 반려 (ingestion 거부)
   *
   * @param chunks - 파싱된 text chunks
   * @returns AmbiguityResult with score, dimensions, feedback
   */
  score(chunks: string[]): AmbiguityResult {
    const fullText = chunks.join(" ");
    const totalLength = fullText.length;

    if (totalLength === 0) {
      return {
        ambiguityScore: 1.0,
        dimensions: { goalClarity: 0, constraintClarity: 0, successCriteria: 0 },
        rejected: true,
        feedback: ["문서 내용이 비어있어요."],
      };
    }

    // 1. Goal Clarity (40%)
    const goalClarity = this.measureGoalClarity(fullText, totalLength);

    // 2. Constraint Clarity (30%)
    const constraintClarity = this.measureConstraintClarity(fullText, totalLength);

    // 3. Success Criteria (30%)
    const successCriteria = this.measureSuccessCriteria(fullText, totalLength);

    const dimensions: AmbiguityDimensionScores = {
      goalClarity,
      constraintClarity,
      successCriteria,
    };

    // 가중 합산 → clarity score → ambiguity = 1 - clarity
    const clarityScore =
      goalClarity * WEIGHTS.goalClarity +
      constraintClarity * WEIGHTS.constraintClarity +
      successCriteria * WEIGHTS.successCriteria;

    const ambiguityScore = Math.round((1 - clarityScore) * 1000) / 1000;
    const rejected = ambiguityScore > AMBIGUITY_THRESHOLD;

    // 피드백 생성
    const feedback: string[] = [];
    if (rejected) {
      if (goalClarity < 0.5) {
        feedback.push(
          "문서에 명시적인 목적/목표/범위 기술이 부족해요. " +
          "'목적', '배경', '요구사항' 등의 섹션을 추가해 주세요.",
        );
      }
      if (constraintClarity < 0.5) {
        feedback.push(
          "조건/제약 사항이 불명확해요. " +
          "'~인 경우', '~할 때' 등 조건문을 구체적으로 기술해 주세요.",
        );
      }
      if (successCriteria < 0.5) {
        feedback.push(
          "정량적 기준(수치, 임계값)이 부족해요. " +
          "'N일 이내', 'N% 이상' 등 구체적 수치를 포함해 주세요.",
        );
      }
    }

    return { ambiguityScore, dimensions, rejected, feedback };
  }

  /**
   * Goal Clarity: 목적/목표 관련 키워드 밀도 측정.
   * keyword 매칭 수를 정규화하여 0~1 score 산출.
   */
  private measureGoalClarity(text: string, totalLength: number): number {
    const lower = text.toLowerCase();
    let matchCount = 0;
    for (const keyword of GOAL_KEYWORDS) {
      const regex = new RegExp(keyword.toLowerCase(), "g");
      const matches = lower.match(regex);
      matchCount += matches?.length ?? 0;
    }
    // 1000자당 2개 이상이면 만점, 0개면 0점
    const density = (matchCount / totalLength) * 1000;
    return Math.min(1.0, density / 2.0);
  }

  /**
   * Constraint Clarity: 조건문 패턴 빈도 측정.
   */
  private measureConstraintClarity(text: string, totalLength: number): number {
    let matchCount = 0;
    for (const pattern of CONSTRAINT_PATTERNS) {
      const matches = text.match(pattern);
      matchCount += matches?.length ?? 0;
    }
    // 1000자당 3개 이상이면 만점
    const density = (matchCount / totalLength) * 1000;
    return Math.min(1.0, density / 3.0);
  }

  /**
   * Success Criteria: 숫자+단위 패턴 빈도 측정.
   */
  private measureSuccessCriteria(text: string, totalLength: number): number {
    const matches = text.match(CRITERIA_PATTERN);
    const matchCount = matches?.length ?? 0;
    // 1000자당 2개 이상이면 만점
    const density = (matchCount / totalLength) * 1000;
    return Math.min(1.0, density / 2.0);
  }
}
```

### 5.3 `services/svc-ingestion/src/eval/brownfield.ts` — BrownfieldExplorer

```typescript
import type { BrownfieldContext } from "@ai-foundry/types";

interface BrownfieldEnv {
  SVC_POLICY: Fetcher;
  SVC_ONTOLOGY: Fetcher;
  INTERNAL_API_SECRET: string;
}

interface PolicyListItem {
  policy_code: string;
  title: string;
  condition: string;
  domain?: string;
}

interface TermListItem {
  term_id: string;
  label: string;
  term_type: string;
}

/**
 * Brownfield Explorer — 새 문서 ingestion 시 기존 데이터 맥락을 수집한다.
 *
 * svc-policy와 svc-ontology의 Service Binding을 통해
 * 해당 org의 기존 policy/term 데이터를 스캔하여
 * downstream stage (특히 svc-policy)에 중복 방지 맥락을 제공한다.
 */
export class BrownfieldExplorer {
  /**
   * 기존 데이터 맥락을 수집한다.
   *
   * @param organizationId - 대상 org
   * @param env - Service Binding 환경
   * @returns BrownfieldContext 또는 null (수집 실패 시)
   */
  async explore(
    organizationId: string,
    env: BrownfieldEnv,
  ): Promise<BrownfieldContext | null> {
    const headers = {
      "X-Internal-Secret": env.INTERNAL_API_SECRET,
      "X-Organization-Id": organizationId,
    };

    try {
      // 병렬 수집: policy 목록 + term 목록
      const [policiesResult, termsResult] = await Promise.allSettled([
        this.fetchPolicies(env.SVC_POLICY, organizationId, headers),
        this.fetchTerms(env.SVC_ONTOLOGY, organizationId, headers),
      ]);

      const policies: PolicyListItem[] =
        policiesResult.status === "fulfilled" ? policiesResult.value : [];
      const terms: TermListItem[] =
        termsResult.status === "fulfilled" ? termsResult.value : [];

      // 도메인 분포 집계
      const domainDistribution: Record<string, number> = {};
      for (const policy of policies) {
        const domain = this.extractDomain(policy.policy_code);
        domainDistribution[domain] = (domainDistribution[domain] ?? 0) + 1;
      }

      return {
        existingPolicyCodes: policies.map((p) => p.policy_code),
        existingTerms: terms.map((t) => ({
          termId: t.term_id,
          label: t.label,
          termType: t.term_type,
        })),
        domainDistribution,
        totalPolicies: policies.length,
        totalTerms: terms.length,
        scannedAt: new Date().toISOString(),
      };
    } catch {
      // Fail-open: brownfield 수집 실패 시 null 반환 → 파이프라인 계속 진행
      return null;
    }
  }

  private async fetchPolicies(
    fetcher: Fetcher,
    organizationId: string,
    headers: Record<string, string>,
  ): Promise<PolicyListItem[]> {
    const resp = await fetcher.fetch(
      `http://internal/policies?organizationId=${organizationId}&status=approved&limit=500&fields=policy_code,title,condition`,
      { headers },
    );
    if (!resp.ok) return [];
    const json = (await resp.json()) as { success: boolean; data: PolicyListItem[] };
    return json.success ? json.data : [];
  }

  private async fetchTerms(
    fetcher: Fetcher,
    organizationId: string,
    headers: Record<string, string>,
  ): Promise<TermListItem[]> {
    const resp = await fetcher.fetch(
      `http://internal/terms?organizationId=${organizationId}&limit=500&fields=term_id,label,term_type`,
      { headers },
    );
    if (!resp.ok) return [];
    const json = (await resp.json()) as { success: boolean; data: TermListItem[] };
    return json.success ? json.data : [];
  }

  /**
   * policy_code에서 도메인 부분 추출.
   * POL-GIFTVOUCHER-IS-001 → "GIFTVOUCHER"
   */
  private extractDomain(policyCode: string): string {
    const parts = policyCode.split("-");
    return parts[1] ?? "UNKNOWN";
  }
}
```

### 5.4 `services/svc-policy/src/eval/semantic.ts` — SemanticEvaluator

```typescript
import type {
  EvalResult,
  EvalIssue,
  PolicySemanticDimension,
} from "@ai-foundry/types";
import type { PolicyCandidate } from "@ai-foundry/types";
import { buildSemanticEvalPrompt } from "../prompts/semantic-eval.js";

/** 시맨틱 평가 dimension 가중치 */
const SEMANTIC_WEIGHTS = {
  specificity: 0.25,
  consistency: 0.25,
  completeness: 0.20,
  actionability: 0.20,
  traceability: 0.10,
} as const;

/** 판정 임계값 */
const THRESHOLDS = {
  fail: 0.5,
  needsReview: 0.7,
} as const;

interface SemanticEvalEnv {
  LLM_ROUTER: Fetcher;
  INTERNAL_API_SECRET: string;
}

/**
 * Policy Semantic Evaluator — Sonnet LLM을 사용한 의미적 품질 평가.
 *
 * condition-criteria-outcome 트리플을 5개 차원에서 채점:
 * - Specificity (25%): 조건과 기준의 구체성
 * - Consistency (25%): condition ↔ criteria ↔ outcome 논리적 일관성
 * - Completeness (20%): 경계 조건/예외 사항 완전성
 * - Actionability (20%): outcome의 실행 가능성
 * - Traceability (10%): 원문 추적 가능성
 */
export class SemanticEvaluator {
  /**
   * Policy candidate의 시맨틱 품질을 평가한다.
   *
   * @param candidate - 평가 대상 policy
   * @param env - Service Binding 환경 (LLM Router)
   * @returns EvalResult with 5-dimension scores
   */
  async evaluate(
    candidate: PolicyCandidate,
    env: SemanticEvalEnv,
  ): Promise<EvalResult> {
    const startMs = Date.now();

    try {
      const { system, userContent } = buildSemanticEvalPrompt(candidate);

      const response = await env.LLM_ROUTER.fetch(
        "https://svc-llm-router.internal/complete",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": env.INTERNAL_API_SECRET,
          },
          body: JSON.stringify({
            tier: "sonnet",
            messages: [{ role: "user", content: userContent }],
            system,
            callerService: "svc-policy",
            maxTokens: 1024,
            temperature: 0.1,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`LLM Router error: ${response.status}`);
      }

      const json = (await response.json()) as {
        success: boolean;
        data: { content: string };
        error?: { message: string };
      };
      if (!json.success) {
        throw new Error(`LLM failure: ${json.error?.message ?? "unknown"}`);
      }

      // LLM 응답 파싱 → dimension scores
      const dimensions = this.parseDimensionScores(json.data.content);
      const issues = this.buildIssues(dimensions);
      const weightedScore = this.calculateWeightedScore(dimensions);
      const verdict = this.determineVerdict(weightedScore);
      const durationMs = Date.now() - startMs;

      return {
        stage: "semantic",
        verdict,
        score: Math.round(weightedScore * 1000) / 1000,
        issues,
        evaluator: "sonnet-semantic",
        durationMs,
        timestamp: new Date().toISOString(),
        metadata: { dimensions },
      };
    } catch (error) {
      // Fail-open: LLM 호출 실패 시 skipped 반환
      return {
        stage: "semantic",
        verdict: "skipped",
        score: 0,
        issues: [{
          code: "SEM_LLM_ERROR",
          severity: "warning",
          message: `Semantic evaluation skipped: ${String(error)}`,
        }],
        evaluator: "sonnet-semantic",
        durationMs: Date.now() - startMs,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * LLM JSON 응답에서 5개 dimension score를 추출한다.
   * 응답 형식: { specificity: 0.8, consistency: 0.7, ... }
   */
  private parseDimensionScores(content: string): PolicySemanticDimension {
    // JSON 추출: 코드블록 감싸진 경우 처리
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { specificity: 0, consistency: 0, completeness: 0, actionability: 0, traceability: 0 };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        specificity: this.clampScore(parsed["specificity"]),
        consistency: this.clampScore(parsed["consistency"]),
        completeness: this.clampScore(parsed["completeness"]),
        actionability: this.clampScore(parsed["actionability"]),
        traceability: this.clampScore(parsed["traceability"]),
      };
    } catch {
      return { specificity: 0, consistency: 0, completeness: 0, actionability: 0, traceability: 0 };
    }
  }

  private clampScore(value: unknown): number {
    if (typeof value !== "number") return 0;
    return Math.max(0, Math.min(1, value));
  }

  private calculateWeightedScore(d: PolicySemanticDimension): number {
    return (
      d.specificity * SEMANTIC_WEIGHTS.specificity +
      d.consistency * SEMANTIC_WEIGHTS.consistency +
      d.completeness * SEMANTIC_WEIGHTS.completeness +
      d.actionability * SEMANTIC_WEIGHTS.actionability +
      d.traceability * SEMANTIC_WEIGHTS.traceability
    );
  }

  private determineVerdict(score: number): "pass" | "fail" | "needs_review" {
    if (score < THRESHOLDS.fail) return "fail";
    if (score < THRESHOLDS.needsReview) return "needs_review";
    return "pass";
  }

  private buildIssues(d: PolicySemanticDimension): EvalIssue[] {
    const issues: EvalIssue[] = [];
    const check = (
      value: number,
      name: string,
      code: string,
      message: string,
    ) => {
      if (value < 0.5) {
        issues.push({
          code,
          severity: "warning",
          message,
          dimension: name,
        });
      }
    };

    check(d.specificity, "specificity", "SEM_LOW_SPECIFICITY",
      "조건/기준이 모호해요 — 구체적 수치나 조건을 포함해야 해요.");
    check(d.consistency, "consistency", "SEM_INCONSISTENT",
      "condition ↔ criteria ↔ outcome 간 논리적 일관성이 부족해요.");
    check(d.completeness, "completeness", "SEM_INCOMPLETE",
      "경계 조건이나 예외 사항이 누락되었을 수 있어요.");
    check(d.actionability, "actionability", "SEM_NOT_ACTIONABLE",
      "outcome이 실행 가능한 구체적 행동으로 기술되지 않았어요.");
    check(d.traceability, "traceability", "SEM_LOW_TRACEABILITY",
      "원문 추적 정보(sourceExcerpt, sourcePageRef)가 부족해요.");

    return issues;
  }
}
```

### 5.5 `services/svc-policy/src/prompts/semantic-eval.ts` — 시맨틱 평가 프롬프트

```typescript
import type { PolicyCandidate } from "@ai-foundry/types";

/**
 * Policy 시맨틱 평가 프롬프트를 생성한다.
 * Sonnet 티어로 호출하여 5개 dimension을 0~1 스케일로 채점.
 */
export function buildSemanticEvalPrompt(candidate: PolicyCandidate): {
  system: string;
  userContent: string;
} {
  const system = `You are a policy quality evaluator for AI Foundry.
Evaluate the given policy (condition-criteria-outcome triple) on 5 dimensions.
Return ONLY a JSON object with scores 0.0 to 1.0 for each dimension.

Dimensions:
- specificity: Are the condition and criteria specific? (penalize vague words: "적절한", "충분한", "상황에 따라")
- consistency: Are condition, criteria, and outcome logically consistent?
- completeness: Are boundary conditions and exceptions addressed?
- actionability: Is the outcome a concrete, executable action?
- traceability: Is source evidence provided (sourceExcerpt, sourcePageRef)?

Output format (JSON only, no explanation):
{
  "specificity": 0.0,
  "consistency": 0.0,
  "completeness": 0.0,
  "actionability": 0.0,
  "traceability": 0.0
}`;

  const userContent = `Policy to evaluate:
- Code: ${candidate.policyCode}
- Title: ${candidate.title}
- Condition (IF): ${candidate.condition}
- Criteria: ${candidate.criteria}
- Outcome (THEN): ${candidate.outcome}
- Source Excerpt: ${candidate.sourceExcerpt ?? "(없음)"}
- Source Page Ref: ${candidate.sourcePageRef ?? "(없음)"}
- Tags: ${candidate.tags.join(", ") || "(없음)"}`;

  return { system, userContent };
}
```

### 5.6 `services/svc-policy/src/eval/consensus.ts` — ConsensusEngine

```typescript
import type {
  EvalResult,
  EvalIssue,
  ConsensusVerdict,
  ConsensusDecision,
} from "@ai-foundry/types";
import type { PolicyCandidate } from "@ai-foundry/types";
import {
  buildAdvocatePrompt,
  buildDevilPrompt,
  buildJudgePrompt,
  buildRound2Prompt,
} from "../prompts/consensus.js";

interface ConsensusEnv {
  LLM_ROUTER: Fetcher;
  INTERNAL_API_SECRET: string;
}

/**
 * Deliberative Consensus Engine — Opus 다중 모델 합의.
 *
 * HITL needs_review 판정 건에만 적용하여 비용 최적화.
 * Round 1: Advocate → Devil → Judge (3 × Opus 호출)
 * Round 2: Judge가 split 판정 시 심화 질의 (2 × Opus 추가)
 */
export class ConsensusEngine {
  /**
   * Policy에 대한 다자 합의 토론을 실행한다.
   *
   * @param candidate - 평가 대상 policy
   * @param env - Service Binding 환경
   * @returns EvalResult with ConsensusVerdict metadata
   */
  async deliberate(
    candidate: PolicyCandidate,
    env: ConsensusEnv,
  ): Promise<EvalResult> {
    const startMs = Date.now();

    try {
      // ─── Round 1: 3자 토론 ─────────────────────────

      // 1. Advocate: 타당성 옹호
      const advocateArgs = await this.callRole(
        buildAdvocatePrompt(candidate),
        env,
      );

      // 2. Devil: 문제점 지적
      const devilArgs = await this.callRole(
        buildDevilPrompt(candidate),
        env,
      );

      // 3. Judge: 종합 판정
      const judgeResponse = await this.callRole(
        buildJudgePrompt(candidate, advocateArgs, devilArgs),
        env,
      );
      const round1Decision = this.parseJudgeDecision(judgeResponse);

      let finalDecision = round1Decision.decision;
      let rounds = 1;
      let round2Questions: string[] | undefined;
      let round2Reasoning: string | undefined;

      // ─── Round 2: split 시 심화 질의 ────────────────

      if (finalDecision === "split") {
        rounds = 2;
        round2Questions = [
          "이 policy는 root cause인가, symptom인가?",
          "이 policy 없이도 outcome이 다른 규칙으로 보장되는가?",
        ];

        const round2Response = await this.callRole(
          buildRound2Prompt(candidate, advocateArgs, devilArgs, round2Questions),
          env,
        );
        const round2Decision = this.parseJudgeDecision(round2Response);
        finalDecision = round2Decision.decision === "split"
          ? "reject"  // Round 2에서도 split → 보수적으로 reject
          : round2Decision.decision;
        round2Reasoning = round2Decision.reasoning;
      }

      const consensusVerdict: ConsensusVerdict = {
        finalDecision,
        rounds,
        advocateArgs,
        devilArgs,
        judgeReasoning: round1Decision.reasoning,
        ...(round2Questions !== undefined ? { round2Questions } : {}),
        ...(round2Reasoning !== undefined ? { round2Reasoning } : {}),
      };

      // verdict 매핑
      const verdictMap: Record<ConsensusDecision, string> = {
        approve: "consensus_approve",
        reject: "consensus_reject",
        split: "consensus_split",
      };
      const verdict = verdictMap[finalDecision] as
        | "consensus_approve"
        | "consensus_reject"
        | "consensus_split";

      const score = finalDecision === "approve" ? 0.85
        : finalDecision === "reject" ? 0.2
        : 0.5;

      const issues: EvalIssue[] = [];
      if (finalDecision === "reject") {
        issues.push({
          code: "CON_REJECTED",
          severity: "error",
          message: `Consensus rejected: ${round1Decision.reasoning.slice(0, 200)}`,
        });
      }
      if (finalDecision === "split") {
        issues.push({
          code: "CON_SPLIT",
          severity: "warning",
          message: "Consensus 토론에서 합의에 도달하지 못함 — 리뷰어 판단 필요",
        });
      }

      return {
        stage: "consensus",
        verdict,
        score,
        issues,
        evaluator: "opus-consensus",
        durationMs: Date.now() - startMs,
        timestamp: new Date().toISOString(),
        metadata: { consensusVerdict },
      };
    } catch (error) {
      // Fail-open
      return {
        stage: "consensus",
        verdict: "skipped",
        score: 0,
        issues: [{
          code: "CON_ERROR",
          severity: "warning",
          message: `Consensus evaluation skipped: ${String(error)}`,
        }],
        evaluator: "opus-consensus",
        durationMs: Date.now() - startMs,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * svc-llm-router를 통해 Opus 티어 LLM 호출.
   */
  private async callRole(
    prompt: { system: string; userContent: string },
    env: ConsensusEnv,
  ): Promise<string> {
    const response = await env.LLM_ROUTER.fetch(
      "https://svc-llm-router.internal/complete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
        },
        body: JSON.stringify({
          tier: "opus",
          messages: [{ role: "user", content: prompt.userContent }],
          system: prompt.system,
          callerService: "svc-policy",
          maxTokens: 2048,
          temperature: 0.3,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`LLM Router error: ${response.status}`);
    }

    const json = (await response.json()) as {
      success: boolean;
      data: { content: string };
      error?: { message: string };
    };
    if (!json.success) {
      throw new Error(`LLM failure: ${json.error?.message ?? "unknown"}`);
    }

    return json.data.content;
  }

  /**
   * Judge 응답에서 decision과 reasoning을 추출한다.
   * 기대 JSON 형식: { "decision": "approve|reject|split", "reasoning": "..." }
   */
  private parseJudgeDecision(
    response: string,
  ): { decision: ConsensusDecision; reasoning: string } {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { decision: "split", reasoning: response.slice(0, 500) };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const decision = parsed["decision"];
      const reasoning = parsed["reasoning"];

      if (
        decision === "approve" ||
        decision === "reject" ||
        decision === "split"
      ) {
        return {
          decision,
          reasoning: typeof reasoning === "string" ? reasoning : "",
        };
      }
    } catch {
      // parse 실패
    }

    return { decision: "split", reasoning: response.slice(0, 500) };
  }
}
```

### 5.7 `services/svc-policy/src/prompts/consensus.ts` — Advocate/Devil/Judge 프롬프트

```typescript
import type { PolicyCandidate } from "@ai-foundry/types";

function policyToText(candidate: PolicyCandidate): string {
  return `Policy Code: ${candidate.policyCode}
Title: ${candidate.title}
Condition (IF): ${candidate.condition}
Criteria: ${candidate.criteria}
Outcome (THEN): ${candidate.outcome}
Source Excerpt: ${candidate.sourceExcerpt ?? "(없음)"}
Source Page Ref: ${candidate.sourcePageRef ?? "(없음)"}
Tags: ${candidate.tags.join(", ") || "(없음)"}`;
}

export function buildAdvocatePrompt(candidate: PolicyCandidate): {
  system: string;
  userContent: string;
} {
  return {
    system: `You are the ADVOCATE in a policy quality review panel.
Your role is to argue WHY this policy is valid, well-structured, and should be approved.
Be thorough: cite specific aspects of the condition, criteria, and outcome that demonstrate quality.
Respond in Korean. Keep your argument under 500 words.`,
    userContent: `다음 정책의 타당성을 옹호해 주세요:\n\n${policyToText(candidate)}`,
  };
}

export function buildDevilPrompt(candidate: PolicyCandidate): {
  system: string;
  userContent: string;
} {
  return {
    system: `You are the DEVIL'S ADVOCATE in a policy quality review panel.
Your role is to find problems: contradictions, ambiguities, missing edge cases,
overly broad conditions, unverifiable criteria, or unachievable outcomes.
Be specific and cite exact phrases that are problematic.
Respond in Korean. Keep your critique under 500 words.`,
    userContent: `다음 정책의 문제점, 모순, 누락을 지적해 주세요:\n\n${policyToText(candidate)}`,
  };
}

export function buildJudgePrompt(
  candidate: PolicyCandidate,
  advocateArgs: string,
  devilArgs: string,
): { system: string; userContent: string } {
  return {
    system: `You are the JUDGE in a policy quality review panel.
Review the Advocate's arguments and Devil's critique, then make a fair decision.
Return ONLY a JSON object: { "decision": "approve" | "reject" | "split", "reasoning": "..." }
- "approve": if the policy is fundamentally sound despite minor issues
- "reject": if the policy has critical flaws (logical contradiction, ambiguity, unverifiable criteria)
- "split": if you cannot decide — the case needs human review with additional context`,
    userContent: `## 정책
${policyToText(candidate)}

## Advocate 의견
${advocateArgs}

## Devil's Advocate 의견
${devilArgs}

위 논거를 종합하여 판정해 주세요. JSON으로만 응답하세요.`,
  };
}

export function buildRound2Prompt(
  candidate: PolicyCandidate,
  advocateArgs: string,
  devilArgs: string,
  questions: string[],
): { system: string; userContent: string } {
  return {
    system: `You are the JUDGE conducting a Round 2 deep review.
The previous round ended in a split decision. Answer the following questions
to make a final determination.
Return ONLY a JSON object: { "decision": "approve" | "reject" | "split", "reasoning": "..." }`,
    userContent: `## 정책
${policyToText(candidate)}

## Round 1 Advocate
${advocateArgs}

## Round 1 Devil
${devilArgs}

## 심화 질문
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

위 질문에 답하고 최종 판정을 내려 주세요. JSON으로만 응답하세요.`,
  };
}
```

### 5.8 `services/svc-skill/src/eval/mechanical.ts` — SkillMechanicalVerifier

```typescript
import { SkillPackageSchema, type SkillPackage } from "@ai-foundry/types";
import type { EvalResult, EvalIssue } from "@ai-foundry/types";

/**
 * Skill Package 기계 검증.
 *
 * 검증 항목:
 * 1. SkillPackageSchema strict parse
 * 2. policies 배열 비어있지 않은지 확인
 * 3. 모든 policy trust level이 'reviewed' 이상
 * 4. ontologyRef 유효성 (termUris 비어있지 않음)
 * 5. metadata 완전성 (domain, version, author 필수 + 비어있지 않음)
 */
export class SkillMechanicalVerifier {
  verify(skillPackage: SkillPackage): EvalResult {
    const startMs = Date.now();
    const issues: EvalIssue[] = [];

    // 1. Zod strict re-parse
    const strictResult = SkillPackageSchema.strict().safeParse(skillPackage);
    if (!strictResult.success) {
      issues.push({
        code: "SKILL_MECH_SCHEMA_INVALID",
        severity: "error",
        message: `Schema validation failed: ${strictResult.error.message}`,
      });
    }

    // 2. policies 배열 비어있지 않은지
    if (skillPackage.policies.length === 0) {
      issues.push({
        code: "SKILL_MECH_EMPTY_POLICIES",
        severity: "error",
        message: "Skill package에 정책이 없어요.",
      });
    }

    // 3. 모든 policy trust level이 'reviewed' 이상
    const unreviewedPolicies = skillPackage.policies.filter(
      (p) => p.trust.level === "unreviewed",
    );
    if (unreviewedPolicies.length > 0) {
      issues.push({
        code: "SKILL_MECH_UNREVIEWED_POLICIES",
        severity: "error",
        message: `${unreviewedPolicies.length}개 정책이 미검토(unreviewed) 상태예요.`,
        detail: unreviewedPolicies.map((p) => p.code).join(", "),
      });
    }

    // 4. ontologyRef 유효성
    if (skillPackage.ontologyRef.termUris.length === 0) {
      issues.push({
        code: "SKILL_MECH_EMPTY_ONTOLOGY",
        severity: "warning",
        message: "ontologyRef.termUris가 비어있어요.",
      });
    }

    // 5. metadata 완전성
    const { domain, version, author } = skillPackage.metadata;
    if (!domain || domain.trim().length === 0) {
      issues.push({
        code: "SKILL_MECH_MISSING_DOMAIN",
        severity: "error",
        message: "metadata.domain이 비어있어요.",
      });
    }
    if (!version || version.trim().length === 0) {
      issues.push({
        code: "SKILL_MECH_MISSING_VERSION",
        severity: "error",
        message: "metadata.version이 비어있어요.",
      });
    }
    if (!author || author.trim().length === 0) {
      issues.push({
        code: "SKILL_MECH_MISSING_AUTHOR",
        severity: "error",
        message: "metadata.author가 비어있어요.",
      });
    }

    const hasErrors = issues.some((i) => i.severity === "error");

    return {
      stage: "mechanical",
      verdict: hasErrors ? "fail" : "pass",
      score: hasErrors ? 0 : 1.0,
      issues,
      evaluator: "mechanical",
      durationMs: Date.now() - startMs,
      timestamp: new Date().toISOString(),
    };
  }
}
```

### 5.9 `services/svc-skill/src/eval/semantic.ts` — SkillSemanticEvaluator

```typescript
import type {
  EvalResult,
  EvalIssue,
  SkillSemanticDimension,
} from "@ai-foundry/types";
import type { SkillPackage } from "@ai-foundry/types";

const SKILL_SEMANTIC_WEIGHTS = {
  coverage: 0.40,
  coherence: 0.35,
  granularity: 0.25,
} as const;

const THRESHOLDS = { fail: 0.5, needsReview: 0.7 } as const;

interface SkillSemanticEnv {
  LLM_ROUTER: Fetcher;
  INTERNAL_API_SECRET: string;
}

/**
 * Skill Semantic Evaluator — Sonnet으로 skill package 전체 평가.
 *
 * 3개 차원:
 * - Coverage (40%): 도메인 내 주요 비즈니스 규칙 충분성
 * - Coherence (35%): policies 간 상호 모순 여부
 * - Granularity (25%): policy 단위 적절성
 */
export class SkillSemanticEvaluator {
  async evaluate(
    skillPackage: SkillPackage,
    env: SkillSemanticEnv,
  ): Promise<EvalResult> {
    const startMs = Date.now();

    try {
      const system = `You are a Skill package quality evaluator for AI Foundry.
Evaluate the given Skill package (set of policies for a domain) on 3 dimensions.
Return ONLY a JSON object with scores 0.0 to 1.0:
{
  "coverage": 0.0,
  "coherence": 0.0,
  "granularity": 0.0
}
- coverage: Are the major business rules in this domain adequately represented?
- coherence: Are there any contradictions between policies?
- granularity: Are policies at an appropriate level of detail? (not too broad, not too narrow)`;

      // Skill 요약 생성 (전체 policy body를 보내면 토큰이 너무 많으므로 요약)
      const policySummary = skillPackage.policies
        .slice(0, 50) // 최대 50개까지만 전송
        .map((p, i) => `${i + 1}. [${p.code}] ${p.title}: IF ${p.condition.slice(0, 100)} → THEN ${p.outcome.slice(0, 100)}`)
        .join("\n");

      const userContent = `Skill Package to evaluate:
- Domain: ${skillPackage.metadata.domain}
- Total Policies: ${skillPackage.policies.length}
- Trust Level: ${skillPackage.trust.level} (score: ${skillPackage.trust.score})

Policies (up to 50):
${policySummary}`;

      const response = await env.LLM_ROUTER.fetch(
        "https://svc-llm-router.internal/complete",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": env.INTERNAL_API_SECRET,
          },
          body: JSON.stringify({
            tier: "sonnet",
            messages: [{ role: "user", content: userContent }],
            system,
            callerService: "svc-skill",
            maxTokens: 512,
            temperature: 0.1,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`LLM Router error: ${response.status}`);
      }

      const json = (await response.json()) as {
        success: boolean;
        data: { content: string };
        error?: { message: string };
      };
      if (!json.success) {
        throw new Error(`LLM failure: ${json.error?.message ?? "unknown"}`);
      }

      const dimensions = this.parseDimensions(json.data.content);
      const score = this.calculateScore(dimensions);
      const verdict = score < THRESHOLDS.fail ? "fail"
        : score < THRESHOLDS.needsReview ? "needs_review"
        : "pass";
      const issues = this.buildIssues(dimensions);

      return {
        stage: "semantic",
        verdict,
        score: Math.round(score * 1000) / 1000,
        issues,
        evaluator: "sonnet-semantic-skill",
        durationMs: Date.now() - startMs,
        timestamp: new Date().toISOString(),
        metadata: { dimensions },
      };
    } catch (error) {
      return {
        stage: "semantic",
        verdict: "skipped",
        score: 0,
        issues: [{
          code: "SKILL_SEM_LLM_ERROR",
          severity: "warning",
          message: `Skill semantic evaluation skipped: ${String(error)}`,
        }],
        evaluator: "sonnet-semantic-skill",
        durationMs: Date.now() - startMs,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private parseDimensions(content: string): SkillSemanticDimension {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { coverage: 0, coherence: 0, granularity: 0 };
    }
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const clamp = (v: unknown): number => typeof v === "number" ? Math.max(0, Math.min(1, v)) : 0;
      return {
        coverage: clamp(parsed["coverage"]),
        coherence: clamp(parsed["coherence"]),
        granularity: clamp(parsed["granularity"]),
      };
    } catch {
      return { coverage: 0, coherence: 0, granularity: 0 };
    }
  }

  private calculateScore(d: SkillSemanticDimension): number {
    return (
      d.coverage * SKILL_SEMANTIC_WEIGHTS.coverage +
      d.coherence * SKILL_SEMANTIC_WEIGHTS.coherence +
      d.granularity * SKILL_SEMANTIC_WEIGHTS.granularity
    );
  }

  private buildIssues(d: SkillSemanticDimension): EvalIssue[] {
    const issues: EvalIssue[] = [];
    if (d.coverage < 0.5) {
      issues.push({
        code: "SKILL_SEM_LOW_COVERAGE",
        severity: "warning",
        message: "도메인 내 주요 비즈니스 규칙이 충분히 포함되지 않았을 수 있어요.",
        dimension: "coverage",
      });
    }
    if (d.coherence < 0.5) {
      issues.push({
        code: "SKILL_SEM_INCOHERENT",
        severity: "warning",
        message: "정책 간 상호 모순이 감지되었어요.",
        dimension: "coherence",
      });
    }
    if (d.granularity < 0.5) {
      issues.push({
        code: "SKILL_SEM_BAD_GRANULARITY",
        severity: "warning",
        message: "정책 단위가 너무 넓거나 좁아요.",
        dimension: "granularity",
      });
    }
    return issues;
  }
}
```

---

## 6. Integration Points

### 6.1 Queue Handler 수정 — svc-policy (`queue/handler.ts`)

기존 `processQueueEvent()` 함수의 Step 7 (D1 INSERT + HITL Session) 직전에 3-Stage Eval을 삽입한다.

```typescript
// ── 기존 Step 6 완료 (candidates 파싱) ──
// ── 신규: 3-Stage Eval ──────────────────

import { MechanicalVerifier } from "../eval/mechanical.js";
import { SemanticEvaluator } from "../eval/semantic.js";
import { ConsensusEngine } from "../eval/consensus.js";
import type { EvalResult } from "@ai-foundry/types";

// 기존 org의 policy 목록 조회 (중복 검출용, 캐시 가능)
const existingPolicies = await env.DB_POLICY
  .prepare("SELECT policy_code, title, condition FROM policies WHERE organization_id = ? AND status = 'approved' LIMIT 500")
  .bind(organizationId)
  .all<{ policy_code: string; title: string; condition: string }>();

const mechanicalVerifier = new MechanicalVerifier();
const semanticEvaluator = new SemanticEvaluator();
const consensusEngine = new ConsensusEngine();

for (const candidate of candidates) {
  const evalResults: EvalResult[] = [];

  // Stage 1: Mechanical
  const mechResult = mechanicalVerifier.verify(candidate, {
    existingPolicies: existingPolicies.results ?? [],
  });
  evalResults.push(mechResult);

  if (mechResult.verdict === "fail") {
    // mechanical 실패 → D1에 rejected_mechanical로 저장, HITL 세션 미생성
    // svc-governance에 평가 결과 POST
    ctx.waitUntil(postEvalResult(env, mechResult, candidate, organizationId));
    continue;
  }

  // Stage 2: Semantic (async, Sonnet)
  const semResult = await semanticEvaluator.evaluate(candidate, env);
  evalResults.push(semResult);

  // Stage 3: Consensus (Opus, needs_review만)
  let consensusResult: EvalResult | null = null;
  if (semResult.verdict === "needs_review") {
    consensusResult = await consensusEngine.deliberate(candidate, env);
    evalResults.push(consensusResult);
  }

  // 최종 verdict 결정
  const finalVerdict = consensusResult?.verdict
    ?? semResult.verdict;

  // 기존 D1 INSERT + HITL Session 생성 (eval 결과를 metadata에 포함)
  // ... (기존 코드에 eval_verdict, eval_score, eval_metadata_json 추가)

  // svc-governance에 각 stage 결과 POST (비동기)
  for (const result of evalResults) {
    ctx.waitUntil(postEvalResult(env, result, candidate, organizationId));
  }
}
```

### 6.2 Ingestion Queue 수정 — svc-ingestion (`queue.ts`)

파싱 완료 후, chunks INSERT 전에 Ambiguity Gate와 Brownfield Explorer를 삽입한다.

```
// ── 기존: 파싱 완료 ──

// 신규: Ambiguity Gate
const ambiguityScorer = new AmbiguityScorer();
const ambiguityResult = ambiguityScorer.score(chunks.map(c => c.text));

if (ambiguityResult.rejected) {
  // document status → 'rejected_ambiguous'
  await env.DB_INGESTION.prepare(
    "UPDATE documents SET status = 'rejected_ambiguous', error_message = ? WHERE document_id = ?"
  ).bind(ambiguityResult.feedback.join("; "), documentId).run();

  // svc-governance에 ambiguity eval 결과 POST
  ctx.waitUntil(postAmbiguityResult(env, ambiguityResult, documentId, organizationId));
  return; // ingestion.completed 이벤트 미발행
}

// 신규: Brownfield Explorer
const brownfieldExplorer = new BrownfieldExplorer();
const brownfieldContext = await brownfieldExplorer.explore(organizationId, env);

// ── 기존: D1 INSERT chunks ──

// ingestion.completed 이벤트 payload에 brownfieldContext 추가
const event = {
  // ... 기존 필드
  payload: {
    // ... 기존 필드
    ...(brownfieldContext != null ? { brownfieldContext } : {}),
  },
};
```

### 6.3 HitlSession DO 확장

`POST /init` payload에 eval 결과를 optional로 추가:

```typescript
// HitlSession init에서 evalResult가 있으면 저장
if (body.evalResult) {
  await this.state.storage.put("evalResult", body.evalResult);
}

// GET /에서 evalResult 함께 반환
const evalResult = await this.state.storage.get("evalResult");
// → response에 포함
```

리뷰어는 HITL UI에서 다음 정보를 확인할 수 있다:
- Mechanical: pass/fail + issues
- Semantic: 5-dimension scores + verdict
- Consensus: Advocate 논거, Devil 반론, Judge 판정 (있는 경우)

### 6.4 Trust Score 연동 — svc-governance

Consensus 결과에 따른 trust score 자동 반영:

| Consensus Decision | trust_level | score 조정 |
|--------------------|-------------|-----------|
| `consensus_approve` | `reviewed` | +0.3 |
| `consensus_reject` | `unreviewed` | -0.2 |
| `consensus_split` / `skipped` | 기존 유지 | 변경 없음 |

### 6.5 `@ai-foundry/types` Event 확장

`IngestionCompletedEventSchema`의 payload에 `brownfieldContext` optional 필드 추가:

```typescript
// events.ts 확장
export const IngestionCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("ingestion.completed"),
  payload: z.object({
    documentId: z.string(),
    organizationId: z.string(),
    chunkCount: z.number().int(),
    classification: z.string(),
    r2Key: z.string(),
    parseDurationMs: z.number().int().optional(),
    chunksValid: z.number().int().optional(),
    brownfieldContext: BrownfieldContextSchema.optional(),  // 신규
  }),
});
```

### 6.6 svc-governance Route 확장

기존 `quality-evaluations.ts`와 병행하여 `pipeline-evaluations.ts` 신규 라우트 추가:

```typescript
// services/svc-governance/src/routes/pipeline-evaluations.ts
export async function handleCreatePipelineEvaluation(request: Request, env: Env): Promise<Response>;
export async function handleListPipelineEvaluations(request: Request, env: Env): Promise<Response>;
export async function handlePipelineEvaluationsSummary(request: Request, env: Env): Promise<Response>;
export async function handleGetTargetEvaluations(request: Request, env: Env, targetId: string): Promise<Response>;
```

---

## 7. Error Handling

### 7.1 Fail-Open 전략

모든 eval 단계는 fail-open 원칙을 따른다 — 평가 실패 시 기존 파이프라인을 차단하지 않는다.

| 실패 시나리오 | 처리 | eval verdict |
|-------------|------|:------------:|
| MechanicalVerifier 예외 | candidate를 그대로 통과시킴 | `skipped` |
| SemanticEvaluator LLM 호출 실패 | Sonnet 타임아웃/에러 → skip | `skipped` |
| ConsensusEngine Opus 호출 실패 | Round 1~2 중 에러 → skip | `skipped` |
| AmbiguityScorer 예외 | 문서를 그대로 통과시킴 | `skipped` |
| BrownfieldExplorer 서비스 호출 실패 | brownfieldContext = null → 기존 흐름 유지 | — |
| svc-governance POST 실패 | ctx.waitUntil에서 실패해도 파이프라인 영향 없음 | — |

### 7.2 타임아웃 관리

| 단계 | 예상 지연 | Workers 30s timeout 대응 |
|------|----------|------------------------|
| Mechanical | <100ms | 문제 없음 |
| Ambiguity | <50ms | 문제 없음 |
| Brownfield | <500ms (2 API 병렬) | 개별 API 5s timeout 설정 |
| Semantic (Sonnet) | 2~5s | LLM Router에 위임 |
| Consensus Round 1 (Opus ×3) | 10~20s | 순차 호출, 합계 30s 근접 가능 |
| Consensus Round 2 (Opus ×2) | 5~15s | Round 1+2 합계 30s 초과 가능 |

**Consensus 타임아웃 대응**:
- Consensus는 Queue event handler 내에서 `ctx.waitUntil()`로 비동기 실행
- 30s 초과 시 Consensus만 `skipped`로 처리하고 나머지 결과는 기록
- 장기적으로 Consensus를 별도 Queue 이벤트로 분리 가능 (Phase 4+ 최적화)

### 7.3 에러 코드 체계

| Prefix | Stage | 예시 |
|--------|-------|------|
| `MECH_` | Mechanical | `MECH_SCHEMA_INVALID`, `MECH_SHORT_CONDITION`, `MECH_DUPLICATE_DETECTED` |
| `SEM_` | Semantic | `SEM_LOW_SPECIFICITY`, `SEM_INCONSISTENT`, `SEM_LLM_ERROR` |
| `CON_` | Consensus | `CON_REJECTED`, `CON_SPLIT`, `CON_ERROR` |
| `AMB_` | Ambiguity | `AMB_LOW_GOAL`, `AMB_LOW_CONSTRAINT` |
| `SKILL_MECH_` | Skill Mechanical | `SKILL_MECH_SCHEMA_INVALID`, `SKILL_MECH_EMPTY_POLICIES` |
| `SKILL_SEM_` | Skill Semantic | `SKILL_SEM_LOW_COVERAGE`, `SKILL_SEM_INCOHERENT` |

---

## 8. Migration Plan

### 8.1 D1 마이그레이션 순서

1. **svc-governance** — `pipeline_evaluations` 테이블 (§3.2)
   - 경로: `infra/migrations/db-governance/0005_pipeline_evaluations.sql`
   - 환경: local → staging → production 순차 적용

2. **svc-policy** — `policies` 테이블에 eval 컬럼 추가
   - 경로: `infra/migrations/db-policy/00XX_add_eval_metadata.sql`
   - `eval_verdict TEXT`, `eval_score REAL`, `eval_metadata_json TEXT`

### 8.2 wrangler.toml 변경

**svc-ingestion** — BrownfieldExplorer가 svc-policy, svc-ontology에 접근하려면 Service Binding 추가:

```toml
# services/svc-ingestion/wrangler.toml
[[services]]
binding = "SVC_POLICY"
service = "svc-policy"

[[services]]
binding = "SVC_ONTOLOGY"
service = "svc-ontology"

[env.production]
[[env.production.services]]
binding = "SVC_POLICY"
service = "svc-policy-production"

[[env.production.services]]
binding = "SVC_ONTOLOGY"
service = "svc-ontology-production"
```

### 8.3 Env 타입 업데이트

```typescript
// services/svc-ingestion/src/env.ts에 추가
export interface Env {
  // ... 기존
  SVC_POLICY: Fetcher;     // 신규: BrownfieldExplorer용
  SVC_ONTOLOGY: Fetcher;   // 신규: BrownfieldExplorer용
}
```

### 8.4 배포 순서

```
Phase 1:
  1. @ai-foundry/types에 evaluation.ts 추가
  2. svc-governance 마이그레이션 (pipeline_evaluations) + 라우트 추가
  3. svc-policy/src/eval/mechanical.ts + queue/handler.ts 수정
  4. svc-skill/src/eval/mechanical.ts + queue/handler.ts 수정
  5. 배포: types → governance → policy → skill 순서

Phase 2:
  1. svc-ingestion/src/eval/ambiguity.ts + brownfield.ts
  2. svc-ingestion wrangler.toml Service Binding 추가
  3. svc-ingestion queue.ts 수정
  4. events.ts IngestionCompletedEvent 확장
  5. svc-policy queue/handler.ts — brownfieldContext 활용
  6. 배포: types → ingestion → policy 순서

Phase 3:
  1. svc-policy/src/eval/semantic.ts + prompts/semantic-eval.ts
  2. svc-skill/src/eval/semantic.ts
  3. queue handler에 semantic eval 삽입
  4. HITL Session eval 결과 전달
  5. 배포: policy → skill → governance 순서

Phase 4:
  1. svc-policy/src/eval/consensus.ts + prompts/consensus.ts
  2. queue handler에 consensus 삽입
  3. trust score 연동
  4. 파일럿 검증 (LPON 848 policies)
  5. 배포: policy → governance 순서
```

---

## 9. File Inventory

### 9.1 신규 파일

| 파일 | 서비스 | 설명 |
|------|--------|------|
| `packages/types/src/evaluation.ts` | @ai-foundry/types | 공통 Eval 타입/스키마 |
| `services/svc-policy/src/eval/mechanical.ts` | svc-policy | Policy MechanicalVerifier |
| `services/svc-policy/src/eval/mechanical.test.ts` | svc-policy | MechanicalVerifier 단위 테스트 |
| `services/svc-policy/src/eval/semantic.ts` | svc-policy | Policy SemanticEvaluator |
| `services/svc-policy/src/eval/semantic.test.ts` | svc-policy | SemanticEvaluator 단위 테스트 |
| `services/svc-policy/src/eval/consensus.ts` | svc-policy | ConsensusEngine |
| `services/svc-policy/src/eval/consensus.test.ts` | svc-policy | ConsensusEngine 단위 테스트 |
| `services/svc-policy/src/prompts/semantic-eval.ts` | svc-policy | 시맨틱 평가 프롬프트 |
| `services/svc-policy/src/prompts/consensus.ts` | svc-policy | Advocate/Devil/Judge 프롬프트 |
| `services/svc-ingestion/src/eval/ambiguity.ts` | svc-ingestion | AmbiguityScorer |
| `services/svc-ingestion/src/eval/ambiguity.test.ts` | svc-ingestion | AmbiguityScorer 단위 테스트 |
| `services/svc-ingestion/src/eval/brownfield.ts` | svc-ingestion | BrownfieldExplorer |
| `services/svc-ingestion/src/eval/brownfield.test.ts` | svc-ingestion | BrownfieldExplorer 단위 테스트 |
| `services/svc-skill/src/eval/mechanical.ts` | svc-skill | SkillMechanicalVerifier |
| `services/svc-skill/src/eval/mechanical.test.ts` | svc-skill | SkillMechanicalVerifier 단위 테스트 |
| `services/svc-skill/src/eval/semantic.ts` | svc-skill | SkillSemanticEvaluator |
| `services/svc-skill/src/eval/semantic.test.ts` | svc-skill | SkillSemanticEvaluator 단위 테스트 |
| `services/svc-governance/src/routes/pipeline-evaluations.ts` | svc-governance | Pipeline Eval CRUD 라우트 |
| `infra/migrations/db-governance/0005_pipeline_evaluations.sql` | infra | 마이그레이션 |
| `infra/migrations/db-policy/00XX_add_eval_metadata.sql` | infra | 마이그레이션 |

### 9.2 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `packages/types/src/index.ts` | `evaluation.ts` re-export 추가 |
| `packages/types/src/events.ts` | `IngestionCompletedEvent` payload에 `brownfieldContext` 추가 |
| `services/svc-policy/src/queue/handler.ts` | 3-Stage Eval 삽입 |
| `services/svc-policy/src/hitl-session.ts` | eval 결과 저장/반환 |
| `services/svc-policy/src/env.ts` | 변경 없음 (기존 바인딩 충분) |
| `services/svc-ingestion/src/queue.ts` | Ambiguity Gate + Brownfield 삽입 |
| `services/svc-ingestion/src/env.ts` | SVC_POLICY, SVC_ONTOLOGY 바인딩 추가 |
| `services/svc-ingestion/wrangler.toml` | Service Binding 추가 |
| `services/svc-skill/src/queue/handler.ts` | Mechanical + Semantic eval 삽입 |
| `services/svc-governance/src/index.ts` | pipeline-evaluations 라우트 mount |
| `services/svc-governance/src/routes/trust.ts` | Consensus → trust score 연동 |

---

## 10. Test Plan

### 10.1 단위 테스트

| 모듈 | 테스트 케이스 | 비고 |
|------|-------------|------|
| MechanicalVerifier | - 유효한 candidate → pass | |
| | - condition 10자 미만 → fail (MECH_SHORT_CONDITION) | |
| | - 잘못된 policyCode 형식 → fail (MECH_INVALID_CODE_FORMAT) | |
| | - 기존 policy와 Jaccard > 0.8 → warning (MECH_DUPLICATE_DETECTED) | |
| | - 빈 태그 문자열 → warning (MECH_EMPTY_TAG) | |
| AmbiguityScorer | - 명확한 문서 → ambiguity < 0.2, rejected=false | |
| | - 목적 없는 문서 → goalClarity 낮음 → 반려 가능 | |
| | - 조건문 없는 문서 → constraintClarity 낮음 | |
| | - 빈 chunks → ambiguity=1.0, rejected=true | |
| BrownfieldExplorer | - 정상 → BrownfieldContext 반환 | Mock Fetcher |
| | - svc-policy 호출 실패 → policies=[], terms=정상 | |
| | - 전체 실패 → null 반환 (fail-open) | |
| SemanticEvaluator | - LLM 정상 응답 → dimension 파싱 + verdict 결정 | LLM Mock |
| | - LLM 실패 → skipped verdict | |
| | - score < 0.5 → fail | |
| | - score 0.5~0.7 → needs_review | |
| ConsensusEngine | - Round 1 approve → consensus_approve | LLM Mock |
| | - Round 1 reject → consensus_reject | |
| | - Round 1 split → Round 2 실행 | |
| | - Round 2에서도 split → reject로 처리 | |
| SkillMechanicalVerifier | - 유효 skill → pass | |
| | - 빈 policies → fail (SKILL_MECH_EMPTY_POLICIES) | |
| | - unreviewed policy 포함 → fail | |
| SkillSemanticEvaluator | - LLM 정상 → 3-dimension 채점 | LLM Mock |

### 10.2 통합 테스트

| 시나리오 | 검증 항목 |
|---------|---------|
| 전체 Policy eval 흐름 | extraction.completed → mechanical → semantic → HITL + eval metadata |
| Ambiguity 반려 흐름 | document.uploaded → parsing → ambiguity > 0.2 → rejected_ambiguous |
| Brownfield 맥락 전달 | ingestion.completed payload에 brownfieldContext 포함 확인 |
| Governance 집계 | pipeline_evaluations에 기록 + summary API 정확성 |
| HITL eval 표시 | HitlSession GET / 에서 evalResult 포함 확인 |

### 10.3 파일럿 검증

- **대상**: LPON 온누리상품권 기존 848 approved policies
- **방법**: 기존 approved policy를 3-Stage Eval에 통과시켜 자동 판정과 사람 판정 비교
- **기준**: Eval pass ↔ HITL approve 일치율 70% 이상이면 Phase 3→4 진행
- **비용 예측**: 848 × ($0 mechanical + $0.05 semantic) = ~$42 (Phase 3만), needs_review 20% 가정 시 170 × $0.15 = ~$26 (Phase 4 추가)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-18 | Initial design | Sinclair Seo |
