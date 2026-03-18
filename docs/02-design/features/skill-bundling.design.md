---
code: AIF-DSGN-025
title: "Skill 번들링 — LLM 의미 분류 기반 재패키징"
version: "1.0"
status: Draft
category: DSGN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
feature: skill-bundling
---

# Skill 번들링 Design Document

> **Summary**: LLM 의미 분류로 859개 정책을 ~25개 기능 단위 스킬 번들로 재패키징 — 상세 설계
>
> **Project**: AI Foundry
> **Version**: v0.6.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-18
> **Status**: Draft
> **Planning Doc**: [skill-bundling.plan.md](../../01-plan/features/skill-bundling.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. **기존 파이프라인 비파괴**: Stage 5의 1:1 패키징은 유지, 번들링은 후처리 레이어
2. **LLM 분류 비용 최적화**: Haiku tier로 분류, Sonnet은 설명 생성에만 사용
3. **Claude Code 스킬 호환**: 번들 스킬이 `.skill.md` 형태로 export 가능
4. **점진적 적용**: LPON 먼저, Miraeasset은 검증 후 적용

### 1.2 Design Principles

- **Additive, not destructive**: 기존 1:1 스킬을 삭제하지 않고 `superseded` 상태로 전환
- **Idempotent rebundling**: 같은 입력으로 재실행 시 동일한 결과 (upsert 패턴)
- **Organization-scoped**: 번들링은 조직 단위로 독립 실행

---

## 2. Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ POST /skills/admin/rebundle                                 │
│ (Admin API — RBAC: skill:create)                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ rebundle-orchestrator.ts                                    │
│                                                             │
│  1. D1: SELECT approved policies WHERE org_id = ?           │
│  2. Batch classify (50개씩) → classifier.ts                 │
│  3. Group by category → bundler.ts                          │
│  4. Generate descriptions → description-generator.ts        │
│  5. Build packages → skill-builder.ts (기존 재사용)          │
│  6. Store → R2 + D1 (status = 'bundled')                    │
│  7. Mark old 1:1 skills → status = 'superseded'             │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
   ┌──────────┐ ┌────────┐ ┌────────┐
   │classifier│ │bundler │ │desc-gen│
   │ (Haiku)  │ │(pure)  │ │(Sonnet)│
   └──────────┘ └────────┘ └────────┘
```

### 2.2 Data Flow

```
D1 policies (approved, org-scoped)
  → [classifier] LLM 분류 (50개 배치, Haiku)
  → policy_classifications 테이블 저장
  → [bundler] 카테고리별 그룹핑
  → [description-generator] 스킬 설명 생성 (Sonnet)
  → [skill-builder] SkillPackage 빌드 (기존 함수 재사용)
  → R2 저장 (.skill.json)
  → D1 skills 테이블 INSERT (status='bundled')
  → 기존 1:1 skills UPDATE (status='superseded')
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| classifier.ts | svc-llm-router (Haiku) | 정책 분류 |
| description-generator.ts | svc-llm-router (Sonnet) | 스킬 설명 생성 |
| bundler.ts | classifier 결과 | 카테고리별 그룹핑 |
| rebundle-orchestrator.ts | classifier, bundler, desc-gen, skill-builder | 전체 오케스트레이션 |
| POST /skills/admin/rebundle | rebundle-orchestrator | HTTP 엔드포인트 |

---

## 3. Detailed Design

### 3.1 카테고리 정의 (10 + 1)

```typescript
// services/svc-skill/src/bundler/categories.ts

export const SKILL_CATEGORIES = {
  charging:      { ko: "충전 관리",     desc: "상품권 충전, 자동충전, 납입, 금액 설정" },
  payment:       { ko: "결제 처리",     desc: "결제, PG 연동, 카드, 가맹점, 수납" },
  member:        { ko: "회원 관리",     desc: "회원가입, 로그인, 인증, 본인확인, 탈퇴" },
  account:       { ko: "계좌/지갑",     desc: "계좌 개설, 잔액 관리, 이체, 송금" },
  gift:          { ko: "상품권 관리",   desc: "상품권 발행, 교환, 환불, 유효기간" },
  notification:  { ko: "알림/메시지",   desc: "SMS, 푸시, 이메일, 알림 설정" },
  security:      { ko: "보안/감사",     desc: "접근제어, 암호화, 감사 로그, 인증 보안" },
  operation:     { ko: "운영 관리",     desc: "배치, 모니터링, 시스템 설정, 코드 관리" },
  settlement:    { ko: "정산/수수료",   desc: "정산, 수수료 계산, 매출, 세금" },
  integration:   { ko: "API/연동",     desc: "외부 API 연동, 오류 처리, 응답 검증" },
  other:         { ko: "기타",         desc: "위 카테고리에 해당하지 않는 정책" },
} as const;

export type SkillCategory = keyof typeof SKILL_CATEGORIES;
```

### 3.2 classifier.ts — LLM 분류 모듈

```typescript
// services/svc-skill/src/bundler/classifier.ts

import type { Env } from "../env.js";
import type { SkillCategory } from "./categories.js";
import { SKILL_CATEGORIES } from "./categories.js";

export interface PolicyInput {
  policyId: string;
  policyCode: string;
  title: string;
  condition: string;
  criteria: string;
}

export interface ClassificationResult {
  policyId: string;
  category: SkillCategory;
  confidence: number;
}

const BATCH_SIZE = 50;

const SYSTEM_PROMPT = `당신은 도메인 정책 분류 전문가입니다.
각 정책의 제목, 조건(condition), 기준(criteria)을 분석하여
가장 적합한 기능 카테고리 1개를 부여하세요.

카테고리 목록:
${Object.entries(SKILL_CATEGORIES).map(([k, v]) => `- ${k}: ${v.desc}`).join("\n")}

응답 형식 (JSON 배열만, 설명 없이):
[{"policyId": "...", "category": "charging", "confidence": 0.9}]`;

export async function classifyPolicies(
  env: Env,
  policies: PolicyInput[],
): Promise<ClassificationResult[]> {
  const results: ClassificationResult[] = [];

  for (let i = 0; i < policies.length; i += BATCH_SIZE) {
    const batch = policies.slice(i, i + BATCH_SIZE);
    const userContent = JSON.stringify(
      batch.map((p) => ({
        policyId: p.policyId,
        title: p.title,
        condition: p.condition,
        criteria: p.criteria,
      })),
    );

    const resp = await env.LLM_ROUTER.fetch(
      "https://svc-llm-router.internal/complete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
        },
        body: JSON.stringify({
          tier: "haiku",
          messages: [{ role: "user", content: userContent }],
          system: SYSTEM_PROMPT,
          callerService: "svc-skill",
          maxTokens: 4096,
          temperature: 0.1,
        }),
      },
    );

    if (!resp.ok) throw new Error(`Classify batch failed: ${resp.status}`);

    const json = (await resp.json()) as {
      success: boolean;
      data: { content: string };
    };

    const parsed = JSON.parse(
      json.data.content.replace(/```json\n?|```/g, "").trim(),
    ) as ClassificationResult[];

    results.push(...parsed);
  }

  return results;
}
```

### 3.3 bundler.ts — 그룹핑 + 번들 빌드

```typescript
// services/svc-skill/src/bundler/bundler.ts

import type { Policy, SkillPackage } from "@ai-foundry/types";
import type { ClassificationResult } from "./classifier.js";
import type { SkillCategory } from "./categories.js";
import { SKILL_CATEGORIES } from "./categories.js";
import { buildSkillPackage } from "../assembler/skill-builder.js";

export interface PolicyWithClassification {
  policy: Policy;
  classification: ClassificationResult;
  ontologyId: string;
  organizationId: string;
  sourceDocumentId: string;
}

export interface BundleResult {
  category: SkillCategory;
  name: string;
  description: string;
  skillPackage: SkillPackage;
  policyCount: number;
}

/**
 * Group policies by category and build bundled SkillPackages.
 */
export function buildBundles(
  items: PolicyWithClassification[],
  descriptions: Map<SkillCategory, { name: string; description: string; triggers: string[]; examples: string[] }>,
  domain: string,
  organizationId: string,
): BundleResult[] {
  // Group by category
  const groups = new Map<SkillCategory, PolicyWithClassification[]>();
  for (const item of items) {
    const cat = item.classification.category;
    const list = groups.get(cat) ?? [];
    list.push(item);
    groups.set(cat, list);
  }

  const results: BundleResult[] = [];

  for (const [category, policyItems] of groups) {
    if (category === "other" && policyItems.length < 3) continue; // skip tiny other

    const catInfo = SKILL_CATEGORIES[category];
    const desc = descriptions.get(category);
    const policies = policyItems.map((p) => p.policy);
    const allTags = [...new Set(policies.flatMap((p) => p.tags))];
    const allDocIds = [...new Set(policyItems.map((p) => p.sourceDocumentId))];
    const allOntologyIds = [...new Set(policyItems.map((p) => p.ontologyId))];

    const pkg = buildSkillPackage({
      policies,
      ontologyRef: {
        graphId: allOntologyIds[0] ?? "",
        termUris: [], // populated separately
      },
      provenance: {
        sourceDocumentIds: allDocIds,
        organizationId,
        extractedAt: new Date().toISOString(),
        pipeline: { stages: ["ingestion", "extraction", "policy", "ontology", "skill-bundle"] },
      },
      domain,
      subdomain: category,
      version: "2.0.0",
      author: "ai-foundry-bundler",
      tags: allTags.slice(0, 20), // cap tags
    });

    results.push({
      category,
      name: desc?.name ?? catInfo.ko,
      description: desc?.description ?? catInfo.desc,
      skillPackage: pkg,
      policyCount: policies.length,
    });
  }

  return results;
}
```

### 3.4 description-generator.ts — LLM 스킬 설명 생성

```typescript
// services/svc-skill/src/bundler/description-generator.ts

import type { Env } from "../env.js";
import type { SkillCategory } from "./categories.js";

export interface SkillDescription {
  name: string;
  description: string;
  triggers: string[];
  examples: string[];
}

/**
 * Generate human-readable skill descriptions for each category bundle.
 * Uses Sonnet tier for high-quality Korean descriptions.
 */
export async function generateDescriptions(
  env: Env,
  categoryPolicySummaries: Map<SkillCategory, string[]>,
  domain: string,
): Promise<Map<SkillCategory, SkillDescription>> {
  const entries = [...categoryPolicySummaries.entries()];
  const input = entries.map(([cat, titles]) => ({
    category: cat,
    policyTitles: titles.slice(0, 30), // cap for token limit
    policyCount: titles.length,
  }));

  const resp = await env.LLM_ROUTER.fetch(
    "https://svc-llm-router.internal/complete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({
        tier: "sonnet",
        messages: [{
          role: "user",
          content: `도메인: ${domain}

각 카테고리에 대해 다음을 생성해주세요:
- name: 한국어 스킬 이름 (예: "온누리상품권 충전 관리")
- description: 이 스킬의 용도를 2-3문장으로 설명 (Claude가 언제 이 스킬을 사용해야 하는지)
- triggers: 이 스킬이 활성화되는 키워드 5-10개
- examples: 사용 시나리오 예시 2-3개

카테고리별 정책 목록:
${JSON.stringify(input, null, 2)}

응답 (JSON 배열):
[{"category": "...", "name": "...", "description": "...", "triggers": [...], "examples": [...]}]`,
        }],
        system: "당신은 AI Skill 설계 전문가입니다. Claude Code에서 활용 가능한 스킬 메타데이터를 생성합니다. JSON만 응답하세요.",
        callerService: "svc-skill",
        maxTokens: 4096,
        temperature: 0.3,
      }),
    },
  );

  if (!resp.ok) throw new Error(`Description generation failed: ${resp.status}`);

  const json = (await resp.json()) as { success: boolean; data: { content: string } };
  const parsed = JSON.parse(
    json.data.content.replace(/```json\n?|```/g, "").trim(),
  ) as Array<{ category: SkillCategory } & SkillDescription>;

  const result = new Map<SkillCategory, SkillDescription>();
  for (const item of parsed) {
    result.set(item.category, item);
  }
  return result;
}
```

### 3.5 rebundle-orchestrator.ts — 전체 오케스트레이션

```typescript
// services/svc-skill/src/bundler/rebundle-orchestrator.ts

import type { Env } from "../env.js";
import { createLogger } from "@ai-foundry/utils";
import { classifyPolicies, type PolicyInput } from "./classifier.js";
import { buildBundles, type PolicyWithClassification } from "./bundler.js";
import { generateDescriptions } from "./description-generator.js";
import type { SkillCategory } from "./categories.js";
import type { Policy } from "@ai-foundry/types";

const logger = createLogger("svc-skill:rebundle");

export interface RebundleResult {
  organizationId: string;
  totalPolicies: number;
  classifiedPolicies: number;
  bundlesCreated: number;
  supersededSkills: number;
  categories: Record<string, number>;
}

export async function rebundleSkills(
  env: Env,
  ctx: ExecutionContext,
  organizationId: string,
  domain: string,
): Promise<RebundleResult> {
  // 1. Fetch all approved policies for this org
  const policyRows = await env.DB_SKILL.prepare(
    `SELECT p.skill_id, p.policy_code, p.title, p.condition, p.criteria,
            s.ontology_id, s.organization_id, s.r2_key
     FROM skills s
     JOIN json_each(s.policies_json) AS pe
     -- Alternative: query svc-policy directly for approved policies
     WHERE s.organization_id = ? AND s.status != 'superseded'`,
  ).bind(organizationId).all();

  // Actually, we need to get policies from svc-policy service
  // because skills table only stores assembled packages
  const policiesResp = await env.SVC_POLICY.fetch(
    `http://internal/policies?status=approved&limit=1000&organizationId=${organizationId}`,
    {
      headers: { "X-Internal-Secret": env.INTERNAL_API_SECRET },
    },
  );

  if (!policiesResp.ok) {
    throw new Error(`Failed to fetch policies: ${policiesResp.status}`);
  }

  const policiesData = (await policiesResp.json()) as {
    data: { policies: Array<{
      policyId: string; policyCode: string; title: string;
      condition: string; criteria: string; outcome: string;
      sourceDocumentId: string; trustLevel: string; trustScore: number;
      tags: string[]; ontologyId?: string;
    }> };
  };

  const policies = policiesData.data.policies;
  logger.info("Fetched policies", { count: policies.length, organizationId });

  // 2. Classify with LLM
  const inputs: PolicyInput[] = policies.map((p) => ({
    policyId: p.policyId,
    policyCode: p.policyCode,
    title: p.title,
    condition: p.condition,
    criteria: p.criteria,
  }));

  const classifications = await classifyPolicies(env, inputs);
  logger.info("Classified policies", { count: classifications.length });

  // 3. Save classifications to D1
  for (const c of classifications) {
    ctx.waitUntil(
      env.DB_SKILL.prepare(
        `INSERT OR REPLACE INTO policy_classifications
         (policy_id, organization_id, category, confidence)
         VALUES (?, ?, ?, ?)`,
      ).bind(c.policyId, organizationId, c.category, c.confidence).run(),
    );
  }

  // 4. Map classifications to policies
  const classMap = new Map(classifications.map((c) => [c.policyId, c]));
  const items: PolicyWithClassification[] = policies
    .filter((p) => classMap.has(p.policyId))
    .map((p) => ({
      policy: {
        code: p.policyCode,
        title: p.title,
        condition: p.condition,
        criteria: p.criteria,
        outcome: p.outcome,
        source: { documentId: p.sourceDocumentId },
        trust: {
          level: p.trustLevel as "unreviewed" | "reviewed" | "validated",
          score: p.trustScore,
        },
        tags: p.tags,
      },
      classification: classMap.get(p.policyId)!,
      ontologyId: p.ontologyId ?? "",
      organizationId,
      sourceDocumentId: p.sourceDocumentId,
    }));

  // 5. Generate descriptions
  const catSummaries = new Map<SkillCategory, string[]>();
  for (const item of items) {
    const cat = item.classification.category;
    const list = catSummaries.get(cat) ?? [];
    list.push(item.policy.title);
    catSummaries.set(cat, list);
  }

  const descriptions = await generateDescriptions(env, catSummaries, domain);
  logger.info("Generated descriptions", { categories: descriptions.size });

  // 6. Build bundles
  const bundles = buildBundles(items, descriptions, domain, organizationId);
  logger.info("Built bundles", { count: bundles.length });

  // 7. Store bundled skills
  const categories: Record<string, number> = {};
  for (const bundle of bundles) {
    const pkg = bundle.skillPackage;
    const r2Key = `skill-packages/bundle-${pkg.skillId}.skill.json`;

    // R2 저장
    await env.R2_SKILL_PACKAGES.put(r2Key, JSON.stringify(pkg, null, 2));

    // D1 저장
    await env.DB_SKILL.prepare(
      `INSERT OR REPLACE INTO skills
       (skill_id, ontology_id, organization_id, domain, subdomain, language,
        version, author, tags, trust_level, trust_score, r2_key, status,
        policy_count, content_depth, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ko', '2.0.0', 'ai-foundry-bundler', ?, ?, ?, ?, 'bundled', ?, ?, datetime('now'), datetime('now'))`,
    ).bind(
      pkg.skillId,
      pkg.ontologyRef.graphId,
      organizationId,
      domain,
      bundle.category,
      JSON.stringify(pkg.metadata.tags),
      pkg.trust.level,
      pkg.trust.score,
      r2Key,
      bundle.policyCount,
      JSON.stringify(pkg).length,
    ).run();

    categories[bundle.category] = bundle.policyCount;
  }

  // 8. Mark old 1:1 skills as superseded
  const superseded = await env.DB_SKILL.prepare(
    `UPDATE skills SET status = 'superseded', updated_at = datetime('now')
     WHERE organization_id = ? AND status IN ('draft', 'published') AND policy_count = 1`,
  ).bind(organizationId).run();

  return {
    organizationId,
    totalPolicies: policies.length,
    classifiedPolicies: classifications.length,
    bundlesCreated: bundles.length,
    supersededSkills: superseded.meta.changes ?? 0,
    categories,
  };
}
```

### 3.6 Admin API 엔드포인트

```typescript
// services/svc-skill/src/routes/admin.ts에 추가

export async function handleRebundle(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const domain = url.searchParams.get("domain");

  if (!organizationId || !domain) {
    return badRequest("organizationId and domain are required");
  }

  const result = await rebundleSkills(env, ctx, organizationId, domain);
  return ok(result);
}
```

### 3.7 DB 마이그레이션

```sql
-- infra/migrations/db-skill/0003_policy_classifications.sql

CREATE TABLE IF NOT EXISTS policy_classifications (
  policy_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence REAL DEFAULT 0,
  classified_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (policy_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_classifications_org_cat
  ON policy_classifications(organization_id, category);
```

### 3.8 Mock-up UX 변경

**SkillInvokerDemo 수정:**
- `fetchSkills()` 호출 시 `status=bundled` 필터 추가
- 스킬 카드에 `policyCount`와 `subdomain`(카테고리명) 표시
- 스킬 선택 시 포함된 정책 목록 펼침

**EvaluationPanel 수정:**
- 번들 스킬에서 정책 선택 드롭다운 추가 (또는 자동 매칭)
- `POST /skills/:id/evaluate-auto` 신규 API 활용 (context만 보내면 적절한 정책 자동 선택)

### 3.9 evaluate-auto API (신규)

```typescript
// POST /skills/:id/evaluate-auto
// context만 보내면 스킬 내 정책들 중 가장 적합한 것을 LLM이 선택

export async function handleEvaluateAuto(
  request: Request, env: Env, skillId: string, ctx: ExecutionContext,
): Promise<Response> {
  const body = await request.json() as { context: string };

  // 1. Fetch skill package
  const fetchResult = await fetchSkillPackage(env, skillId);
  if (fetchResult instanceof Response) return fetchResult;
  const { pkg, domain } = fetchResult;

  // 2. LLM으로 context에 가장 적합한 정책 선택
  const policySummaries = pkg.policies.map((p) => `${p.code}: ${p.title} — IF ${p.condition}`);
  const selectionResp = await callLlmWithProvider(env,
    "주어진 시나리오에 가장 적합한 정책 코드를 선택하세요. 코드만 응답하세요.",
    `시나리오: ${body.context}\n\n정책 목록:\n${policySummaries.join("\n")}`,
  );

  const selectedCode = selectionResp.content.trim();
  const policy = pkg.policies.find((p) => p.code === selectedCode) ?? pkg.policies[0];

  // 3. 선택된 정책으로 evaluate
  // ... (기존 evaluate 로직 재사용)
}
```

---

## 4. Claude Code 스킬 Export

### 4.1 Export 포맷

각 번들 스킬을 Claude Code SKILL.md 형태로 export:

```markdown
---
name: lpon-charging
description: 온누리상품권 충전 관리 — 충전 한도, 자동충전, 조건별 금액 설정 등 25개 정책 적용
---

# 온누리상품권 충전 관리

이 스킬은 LPON 전자식 온누리상품권의 충전과 관련된 정책을 적용합니다.

## 사용 시점
- 상품권 충전 요청의 유효성을 검증할 때
- 자동충전 조건을 확인할 때
- 충전 한도 초과 여부를 판단할 때

## 포함 정책 (25개)
| 코드 | 제목 | 조건 |
|------|------|------|
| POL-GV-CH-001 | 충전 한도 정책 | 충전 금액이 설정될 때 |
| ... | ... | ... |

## 평가 방법
AI Foundry API를 통해 시나리오 기반 정책 평가:
```bash
curl -X POST /api/skills/{skillId}/evaluate-auto \
  -d '{"context": "고객이 월 50만원 한도 초과 충전을 시도합니다"}'
```
```

### 4.2 Export 스크립트

```typescript
// scripts/export-cc-skills.ts
// 번들 스킬을 .skill.md 파일로 export
// 실행: bun run scripts/export-cc-skills.ts --org LPON --output ./exported-skills/
```

---

## 5. Implementation Order

```
Phase 1 (세션 1): 분류
  ├ 1.1 categories.ts — 카테고리 정의 (순수 타입)
  ├ 1.2 policy_classifications 마이그레이션
  ├ 1.3 classifier.ts — LLM 분류 모듈 + 단위 테스트
  └ 1.4 분류 실행 + 결과 검증

Phase 2 (세션 2): 번들 패키징
  ├ 2.1 description-generator.ts — 스킬 설명 생성
  ├ 2.2 bundler.ts — 그룹핑 + 패키지 빌드
  ├ 2.3 rebundle-orchestrator.ts — 오케스트레이션
  ├ 2.4 admin.ts — POST /skills/admin/rebundle
  └ 2.5 LPON rebundle 실행 + 결과 확인

Phase 3 (세션 3): UX + 어댑터
  ├ 3.1 Mock-up SkillInvokerDemo — 번들 스킬 UX
  ├ 3.2 evaluate-auto API — 자동 정책 선택
  ├ 3.3 MCP 어댑터 — 번들 스킬 tool 생성
  └ 3.4 export-cc-skills.ts — Claude Code 포맷 export
```

---

## 6. Testing Strategy

| 테스트 | 대상 | 방법 |
|--------|------|------|
| classifier 단위 | LLM 응답 파싱, 배치 처리 | Vitest mock |
| bundler 단위 | 그룹핑, 패키지 빌드 | Vitest (순수 함수) |
| description-generator 단위 | LLM 응답 파싱 | Vitest mock |
| rebundle 통합 | 전체 흐름 | D1 mock + LLM mock |
| evaluate-auto 통합 | 정책 자동 선택 | API 테스트 |
| Mock-up E2E | 번들 스킬 표시/평가 | Playwright |

---

## 7. API Changes Summary

| Method | Path | 변경 |
|--------|------|------|
| GET | /skills | `status` 파라미터에 `bundled`/`superseded` 추가 |
| POST | /skills/admin/rebundle | **신규** — 번들링 실행 |
| POST | /skills/:id/evaluate-auto | **신규** — 자동 정책 선택 evaluate |
| GET | /skills/:id | 번들 스킬도 기존과 동일하게 반환 |
| GET | /skills/:id/download | 번들 .skill.json 다운로드 |
