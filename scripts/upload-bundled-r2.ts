#!/usr/bin/env bun
/**
 * Upload bundled skill .skill.json files to R2.
 *
 * Fixes the R2 gap: D1 has bundled skill records but R2 files are missing.
 * Reconstructs .skill.json from D1 policy data and uploads to R2 via wrangler.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=xxx bun run scripts/upload-bundled-r2.ts
 *
 * Env:
 *   CLOUDFLARE_API_TOKEN  — API token for the account that owns the R2 bucket
 *   CLOUDFLARE_ACCOUNT_ID — Account ID (required when token has access to multiple accounts)
 *   ORG_ID                — Organization filter (default: all orgs)
 */

const CF_TOKEN = process.env["CLOUDFLARE_API_TOKEN"] ?? "";
const CF_ACCOUNT = process.env["CLOUDFLARE_ACCOUNT_ID"] ?? "";
const ORG_FILTER = process.env["ORG_ID"] ?? "";
const DB_ID = "a3f582ba-21b6-4008-9c41-deed94f9d237"; // db-skill (ktds-axbd, REST API UUID)
const POLICY_API = "https://svc-policy-production.ktds-axbd.workers.dev";
const SECRET = "e2e-test-secret-2026";

if (!CF_TOKEN) { console.error("❌ CLOUDFLARE_API_TOKEN required"); process.exit(1); }
if (!CF_ACCOUNT) { console.error("❌ CLOUDFLARE_ACCOUNT_ID required"); process.exit(1); }

// ── D1 Query Helper ────────────────────────────────────────────────

async function queryD1<T>(sql: string): Promise<T[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${DB_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
    },
  );
  const json = (await res.json()) as { result: { results: T[] }[] };
  return json.result[0]?.results ?? [];
}

// ── Step 1: Get bundled skills ─────────────────────────────────────

interface BundledSkill {
  skill_id: string;
  r2_key: string;
  domain: string;
  subdomain: string;
  organization_id: string;
  trust_level: string;
  trust_score: number;
  tags: string;
  version: string;
  author: string;
  policy_count: number;
}

async function getBundledSkills(): Promise<BundledSkill[]> {
  const orgClause = ORG_FILTER ? `AND organization_id = '${ORG_FILTER}'` : "";
  return queryD1<BundledSkill>(
    `SELECT skill_id, r2_key, domain, subdomain, organization_id, trust_level, trust_score, tags, version, author, policy_count FROM skills WHERE status = 'bundled' ${orgClause} ORDER BY organization_id, domain`,
  );
}

// ── Step 2: Get policies for each bundled skill ────────────────────

interface PolicyClassification {
  policy_id: string;
  category: string;
}

interface PolicyData {
  policyId: string;
  policyCode: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  sourceDocumentId: string;
  trustLevel: string;
  trustScore: number;
  tags: string;
}

async function getClassifications(orgId: string): Promise<PolicyClassification[]> {
  return queryD1<PolicyClassification>(
    `SELECT policy_id, category FROM policy_classifications WHERE organization_id = '${orgId}'`,
  );
}

async function getPolicies(orgId: string): Promise<PolicyData[]> {
  // Use the svc-policy API to get approved policies
  const policies: PolicyData[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(
      `${POLICY_API}/policies?status=approved&limit=${limit}&offset=${offset}`,
      {
        headers: {
          "X-Internal-Secret": SECRET,
          "X-Organization-Id": orgId,
        },
      },
    );
    const json = (await res.json()) as { success: boolean; data: { policies: PolicyData[]; total: number } };
    if (!json.success || !json.data.policies.length) break;
    policies.push(...json.data.policies);
    offset += limit;
    if (policies.length >= json.data.total) break;
  }

  return policies;
}

// ── Step 3: Build .skill.json ──────────────────────────────────────

interface SkillPackage {
  $schema: string;
  skillId: string;
  metadata: Record<string, unknown>;
  policies: Record<string, unknown>[];
  trust: { level: string; score: number };
  ontologyRef: { graphId: string; termUris: string[] };
  provenance: Record<string, unknown>;
  adapters: Record<string, unknown>;
}

function buildSkillPackage(
  skill: BundledSkill,
  policies: PolicyData[],
): SkillPackage {
  return {
    $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
    skillId: skill.skill_id,
    metadata: {
      domain: skill.domain,
      subdomain: skill.subdomain || undefined,
      language: "ko",
      version: skill.version || "2.0.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: skill.author || "ai-foundry-bundler",
      tags: JSON.parse(skill.tags || "[]"),
    },
    policies: policies.map((p) => ({
      code: p.policyCode,
      title: p.title,
      condition: p.condition,
      criteria: p.criteria,
      outcome: p.outcome,
      source: { documentId: p.sourceDocumentId || "" },
      trust: { level: p.trustLevel || "reviewed", score: p.trustScore || 0.7 },
      tags: typeof p.tags === "string" ? JSON.parse(p.tags || "[]") : (p.tags || []),
    })),
    trust: { level: skill.trust_level, score: skill.trust_score },
    ontologyRef: { graphId: "", termUris: [] },
    provenance: {
      sourceDocumentIds: [],
      organizationId: skill.organization_id,
      extractedAt: new Date().toISOString(),
      pipeline: { stages: ["rebundle"], models: { rebundle: "haiku" } },
    },
    adapters: {},
  };
}

// ── Step 4: Upload to R2 ───────────────────────────────────────────

async function uploadToR2(r2Key: string, content: string): Promise<boolean> {
  const tmpPath = `/tmp/${r2Key.replace(/\//g, "_")}`;
  await Bun.write(tmpPath, content);

  const proc = Bun.spawn(
    [
      "npx", "wrangler", "r2", "object", "put",
      `ai-foundry-skill-packages/${r2Key}`,
      "--file", tmpPath,
      "--remote",
    ],
    {
      cwd: "/home/sinclair/work/axbd/res-ai-foundry/services/svc-skill",
      env: { ...process.env, CLOUDFLARE_API_TOKEN: CF_TOKEN, CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const code = await proc.exited;
  // Clean up temp file
  try { await Bun.write(tmpPath, ""); } catch { /* ignore */ }

  return code === 0;
}

// ── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🔧 Bundled Skills R2 Upload Script");
  console.log(`   Account: ${CF_ACCOUNT}`);
  console.log(`   Org filter: ${ORG_FILTER || "(all)"}`);
  console.log("");

  // 1. Get bundled skills
  const skills = await getBundledSkills();
  console.log(`📦 Bundled skills found: ${skills.length}`);
  if (skills.length === 0) { console.log("Nothing to do."); return; }

  // 2. Get classifications + policies per org
  const orgIds = [...new Set(skills.map((s) => s.organization_id))];
  console.log(`🏢 Organizations: ${orgIds.join(", ")}`);

  const classMap = new Map<string, Map<string, string>>(); // orgId → (policyId → category)
  const policyMap = new Map<string, PolicyData[]>(); // orgId → policies

  for (const orgId of orgIds) {
    console.log(`\n── ${orgId} ──`);

    const classifications = await getClassifications(orgId);
    const catMap = new Map<string, string>();
    for (const c of classifications) catMap.set(c.policy_id, c.category);
    classMap.set(orgId, catMap);
    console.log(`   📊 Classifications: ${classifications.length}`);

    const policies = await getPolicies(orgId);
    policyMap.set(orgId, policies);
    console.log(`   📋 Policies: ${policies.length}`);
  }

  // 3. For each bundled skill, match policies by category and upload
  let uploaded = 0;
  let failed = 0;

  for (const skill of skills) {
    const orgCatMap = classMap.get(skill.organization_id);
    const orgPolicies = policyMap.get(skill.organization_id);
    if (!orgCatMap || !orgPolicies) {
      console.log(`   ⚠️ Skip ${skill.skill_id}: no data for ${skill.organization_id}`);
      failed++;
      continue;
    }

    // Match policies: subdomain = category from classification
    const category = skill.subdomain;
    const matchedPolicies = orgPolicies.filter((p) => {
      const policyCategory = orgCatMap.get(p.policyId);
      return policyCategory === category;
    });

    if (matchedPolicies.length === 0) {
      console.log(`   ⚠️ Skip ${skill.skill_id} (${category}): no matching policies`);
      failed++;
      continue;
    }

    // Build and upload
    const pkg = buildSkillPackage(skill, matchedPolicies);
    const json = JSON.stringify(pkg, null, 2);
    const ok = await uploadToR2(skill.r2_key, json);

    if (ok) {
      uploaded++;
      console.log(`   ✅ ${skill.organization_id}/${category}: ${matchedPolicies.length} policies → R2`);
    } else {
      failed++;
      console.log(`   ❌ ${skill.organization_id}/${category}: R2 upload failed`);
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`   ✅ Uploaded: ${uploaded}/${skills.length}`);
  if (failed > 0) console.log(`   ❌ Failed: ${failed}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
