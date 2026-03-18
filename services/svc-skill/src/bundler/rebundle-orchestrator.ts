/**
 * Rebundle orchestrator — coordinates classification, bundling, and storage
 * for converting 1:1 policy-skill mappings into functional skill bundles.
 *
 * Flow:
 *  1. Fetch approved policies from svc-policy
 *  2. Classify policies via LLM (Haiku tier, 50-batch)
 *  3. Save classifications to D1
 *  4. Generate skill descriptions via LLM (Sonnet tier)
 *  5. Build bundled SkillPackages
 *  6. Store in R2 + D1 (status = 'bundled')
 *  7. Mark old 1:1 skills as superseded
 */

import { createLogger } from "@ai-foundry/utils";
import type { Policy } from "@ai-foundry/types";
import type { Env } from "../env.js";
import { classifyPolicies, type PolicyInput } from "./classifier.js";
import { buildBundles, type PolicyWithClassification } from "./bundler.js";
import { generateDescriptions } from "./description-generator.js";
import type { SkillCategory } from "./categories.js";

const logger = createLogger("svc-skill:rebundle");

export interface RebundleResult {
  organizationId: string;
  domain: string;
  totalPolicies: number;
  classifiedPolicies: number;
  bundlesCreated: number;
  supersededSkills: number;
  categories: Record<string, number>;
}

interface PolicyRow {
  policyId: string;
  policyCode: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  sourceDocumentId: string;
  trustLevel: string;
  trustScore: number;
  tags: string[];
  ontologyId?: string;
}

/**
 * Fetch approved policies for an organization from svc-policy.
 * Uses pagination since svc-policy caps at 100 per request.
 */
async function fetchApprovedPolicies(
  env: Env,
  organizationId: string,
): Promise<PolicyRow[]> {
  const PAGE_SIZE = 100;
  const allPolicies: PolicyRow[] = [];
  let offset = 0;

  for (;;) {
    const resp = await env.SVC_POLICY.fetch(
      `http://internal/policies?status=approved&limit=${PAGE_SIZE}&offset=${offset}`,
      {
        headers: {
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
          "X-Organization-Id": organizationId,
        },
      },
    );

    if (!resp.ok) {
      throw new Error(`Failed to fetch policies: ${resp.status}`);
    }

    const json = (await resp.json()) as {
      success: boolean;
      data: {
        policies: PolicyRow[];
        total: number;
      };
    };

    allPolicies.push(...json.data.policies);

    if (allPolicies.length >= json.data.total || json.data.policies.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return allPolicies;
}

/**
 * Convert PolicyRow to @ai-foundry/types Policy format.
 */
function toPolicy(row: PolicyRow): Policy {
  return {
    code: row.policyCode,
    title: row.title,
    condition: row.condition,
    criteria: row.criteria,
    outcome: row.outcome,
    source: { documentId: row.sourceDocumentId },
    trust: {
      level: row.trustLevel as "unreviewed" | "reviewed" | "validated",
      score: row.trustScore,
    },
    tags: row.tags,
  };
}

/**
 * Save classifications to D1 policy_classifications table.
 */
async function saveClassifications(
  env: Env,
  ctx: ExecutionContext,
  organizationId: string,
  classifications: Array<{ policyId: string; category: string; confidence: number }>,
): Promise<void> {
  const stmt = env.DB_SKILL.prepare(
    `INSERT OR REPLACE INTO policy_classifications
     (policy_id, organization_id, category, confidence)
     VALUES (?, ?, ?, ?)`,
  );

  for (const c of classifications) {
    ctx.waitUntil(
      stmt.bind(c.policyId, organizationId, c.category, c.confidence).run(),
    );
  }
}

/**
 * Store a bundled skill in R2 + D1.
 */
async function storeBundledSkill(
  env: Env,
  organizationId: string,
  bundle: { category: string; name: string; description: string; skillPackage: { skillId: string; metadata: { domain: string; tags: string[] }; trust: { level: string; score: number }; ontologyRef: { graphId: string } }; policyCount: number },
): Promise<void> {
  const pkg = bundle.skillPackage;
  const r2Key = `skill-packages/bundle-${pkg.skillId}.skill.json`;

  await env.R2_SKILL_PACKAGES.put(r2Key, JSON.stringify(pkg, null, 2));

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
    pkg.metadata.domain,
    bundle.category,
    JSON.stringify(pkg.metadata.tags),
    pkg.trust.level,
    pkg.trust.score,
    r2Key,
    bundle.policyCount,
    JSON.stringify(pkg).length,
  ).run();
}

/**
 * Mark old 1:1 skills as superseded.
 */
async function supersedeSinglePolicySkills(
  env: Env,
  organizationId: string,
): Promise<number> {
  const result = await env.DB_SKILL.prepare(
    `UPDATE skills SET status = 'superseded', updated_at = datetime('now')
     WHERE organization_id = ? AND status IN ('draft', 'published') AND policy_count = 1`,
  ).bind(organizationId).run();

  return result.meta.changes ?? 0;
}

/**
 * Execute the full rebundling pipeline for an organization.
 */
export async function rebundleSkills(
  env: Env,
  ctx: ExecutionContext,
  organizationId: string,
  domain: string,
): Promise<RebundleResult> {
  // 1. Fetch approved policies
  const policyRows = await fetchApprovedPolicies(env, organizationId);
  logger.info("Fetched policies", { count: policyRows.length, organizationId });

  if (policyRows.length === 0) {
    return {
      organizationId,
      domain,
      totalPolicies: 0,
      classifiedPolicies: 0,
      bundlesCreated: 0,
      supersededSkills: 0,
      categories: {},
    };
  }

  // 2. Classify via LLM
  const inputs: PolicyInput[] = policyRows.map((p) => ({
    policyId: p.policyId,
    policyCode: p.policyCode,
    title: p.title,
    condition: p.condition,
    criteria: p.criteria,
  }));

  const classifications = await classifyPolicies(env, inputs);
  logger.info("Classified policies", { count: classifications.length });

  // 3. Save classifications
  await saveClassifications(env, ctx, organizationId, classifications);

  // 4. Map classifications to policies
  const classMap = new Map(classifications.map((c) => [c.policyId, c]));
  const items: PolicyWithClassification[] = policyRows
    .filter((p) => classMap.has(p.policyId))
    .map((p) => ({
      policy: toPolicy(p),
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

  // 7. Store bundles
  const categories: Record<string, number> = {};
  for (const bundle of bundles) {
    await storeBundledSkill(env, organizationId, bundle);
    categories[bundle.category] = bundle.policyCount;
  }

  // 8. Supersede old 1:1 skills
  const supersededCount = await supersedeSinglePolicySkills(env, organizationId);

  return {
    organizationId,
    domain,
    totalPolicies: policyRows.length,
    classifiedPolicies: classifications.length,
    bundlesCreated: bundles.length,
    supersededSkills: supersededCount,
    categories,
  };
}
