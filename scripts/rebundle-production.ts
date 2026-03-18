#!/usr/bin/env bun
/**
 * Production Skill Rebundle Script
 *
 * Workers timeout을 우회하기 위해 로컬에서 실행하는 rebundle 스크립트.
 * 프로덕션 API를 직접 호출해서 분류 → 번들링 → 저장까지 처리.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx ORG_ID=LPON DOMAIN=giftvoucher bun run scripts/rebundle-production.ts
 *   CLOUDFLARE_API_TOKEN=xxx ORG_ID=Miraeasset DOMAIN=pension bun run scripts/rebundle-production.ts
 */

const POLICY_API = "https://svc-policy-production.sinclair-account.workers.dev";
const LLM_API = "https://svc-llm-router-production.sinclair-account.workers.dev";
const SKILL_API = "https://svc-skill-production.sinclair-account.workers.dev";
const SECRET = "e2e-test-secret-2026";
const CF_TOKEN = process.env["CLOUDFLARE_API_TOKEN"] ?? "";
const ORG_ID = process.env["ORG_ID"] ?? "LPON";
const DOMAIN = process.env["DOMAIN"] ?? "giftvoucher";

if (!CF_TOKEN) {
  console.error("❌ CLOUDFLARE_API_TOKEN 환경변수 필요");
  process.exit(1);
}

// ── Types ───────────────────────────────────────────────────────────

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

interface ClassificationResult {
  policyId: string;
  category: string;
  confidence: number;
}

interface SkillDescription {
  name: string;
  description: string;
  triggers: string[];
  examples: string[];
}

// ── Categories ──────────────────────────────────────────────────────

const CATEGORIES: Record<string, { label: string; keywords: string[] }> = {
  charging: { label: "충전 관리", keywords: ["충전", "자동충전", "납입", "금액 설정", "충전한도", "충전수단"] },
  payment: { label: "결제 처리", keywords: ["결제", "PG", "카드", "가맹점", "수납", "승인", "취소"] },
  member: { label: "회원 관리", keywords: ["회원가입", "로그인", "인증", "본인확인", "탈퇴", "회원정보"] },
  account: { label: "계좌/지갑", keywords: ["계좌", "잔액", "이체", "송금", "지갑", "개설"] },
  gift: { label: "상품권 관리", keywords: ["발행", "교환", "환불", "유효기간", "상품권", "권종"] },
  notification: { label: "알림/메시지", keywords: ["SMS", "푸시", "이메일", "알림", "메시지", "발송"] },
  security: { label: "보안/감사", keywords: ["접근제어", "암호화", "감사", "로그", "권한", "보안"] },
  operation: { label: "운영 관리", keywords: ["배치", "모니터링", "시스템", "설정", "관리자", "운영"] },
  settlement: { label: "정산/수수료", keywords: ["정산", "수수료", "매출", "대사", "입금", "출금"] },
  integration: { label: "API/연동", keywords: ["외부", "API", "연동", "오류", "응답", "인터페이스"] },
  withdrawal: { label: "인출/지급", keywords: ["중도인출", "지급", "환급", "인출", "해지", "이전", "청구", "수급"] },
  tax: { label: "세금/공제", keywords: ["세금", "세액공제", "과세", "원천징수", "퇴직소득", "연말정산", "비과세"] },
  product: { label: "상품 관리", keywords: ["상품", "원리금보장", "수익증권", "펀드", "상품코드", "운용", "수익률"] },
  other: { label: "기타", keywords: [] },
};
const CATEGORY_IDS = Object.keys(CATEGORIES);

// ── Step 1: Fetch Policies ──────────────────────────────────────────

async function fetchAllPolicies(): Promise<PolicyRow[]> {
  const PAGE_SIZE = 100;
  const all: PolicyRow[] = [];
  let offset = 0;

  console.log("📥 Step 1: 프로덕션 정책 fetch 시작...");

  for (;;) {
    const url = `${POLICY_API}/policies?status=approved&limit=${PAGE_SIZE}&offset=${offset}`;
    const resp = await fetch(url, {
      headers: { "X-Internal-Secret": SECRET, "X-Organization-Id": ORG_ID },
    });

    if (!resp.ok) throw new Error(`Policy API error: ${resp.status}`);
    const json = await resp.json() as { success: boolean; data: { policies: PolicyRow[]; total: number } };
    all.push(...json.data.policies);
    console.log(`   📄 ${all.length}/${json.data.total} policies fetched`);

    if (all.length >= json.data.total || json.data.policies.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`   ✅ 총 ${all.length}개 정책 fetch 완료`);
  return all;
}

// ── Step 2: LLM Classification ──────────────────────────────────────

const CLASSIFY_SYSTEM = `You are a policy classifier for a Korean domain knowledge platform.
Classify each policy into exactly one category based on its title, condition, and criteria.

Categories:
${CATEGORY_IDS.map((id) => `- ${id}: ${CATEGORIES[id]!.label} (${CATEGORIES[id]!.keywords.join(", ")})`).join("\n")}

Respond with a JSON array. Each element: {"policyId": "...", "category": "...", "confidence": 0.0-1.0}
Only output the JSON array, no explanation.`;

function stripMarkdownFence(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "");
}

async function callLlm(tier: string, system: string, userContent: string, maxTokens = 4096): Promise<string> {
  const resp = await fetch(`${LLM_API}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": SECRET,
    },
    body: JSON.stringify({
      tier,
      messages: [{ role: "user", content: userContent }],
      system,
      callerService: "svc-skill",
      maxTokens,
      temperature: 0.1,
    }),
  });

  if (!resp.ok) throw new Error(`LLM error ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as { success: boolean; data?: { content?: string }; error?: { message?: string } };
  if (!json.success) throw new Error(json.error?.message ?? "LLM failed");
  return json.data?.content ?? "";
}

async function classifyBatch(policies: PolicyRow[]): Promise<ClassificationResult[]> {
  const items = policies.map((p) => ({
    policyId: p.policyId,
    policyCode: p.policyCode,
    title: p.title,
    condition: p.condition.slice(0, 200),
    criteria: p.criteria.slice(0, 200),
  }));

  const raw = await callLlm("haiku", CLASSIFY_SYSTEM, JSON.stringify(items));
  const cleaned = stripMarkdownFence(raw.trim());
  const parsed = JSON.parse(cleaned) as Array<{ policyId?: string; category?: string; confidence?: number }>;
  const validCats = new Set(CATEGORY_IDS);

  return parsed
    .filter((item): item is typeof item & { policyId: string } => typeof item.policyId === "string")
    .map((item) => ({
      policyId: item.policyId,
      category: validCats.has(item.category ?? "") ? item.category! : "other",
      confidence: typeof item.confidence === "number" ? item.confidence : 0,
    }));
}

async function classifyAll(policies: PolicyRow[]): Promise<ClassificationResult[]> {
  const BATCH = 50;
  const RETRY_BATCH = 10;
  const results: ClassificationResult[] = [];

  console.log("🤖 Step 2: LLM 분류 시작...");

  for (let i = 0; i < policies.length; i += BATCH) {
    const batch = policies.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(policies.length / BATCH);
    process.stdout.write(`   🔄 배치 ${batchNum}/${totalBatches} (${batch.length}개)...`);

    const parsed = await classifyBatch(batch);

    // Detect missing
    const classifiedIds = new Set(parsed.map((r) => r.policyId));
    const missing = batch.filter((p) => !classifiedIds.has(p.policyId));

    if (missing.length > 0) {
      process.stdout.write(` 누락 ${missing.length}개 재시도...`);
      // Retry in smaller batches
      for (let j = 0; j < missing.length; j += RETRY_BATCH) {
        const retryBatch = missing.slice(j, j + RETRY_BATCH);
        try {
          const retried = await classifyBatch(retryBatch);
          const retriedIds = new Set(retried.map((r) => r.policyId));
          parsed.push(...retried);

          // Fallback for still-missing
          for (const p of retryBatch) {
            if (!retriedIds.has(p.policyId) && !classifiedIds.has(p.policyId)) {
              parsed.push({ policyId: p.policyId, category: "other", confidence: 0 });
            }
          }
        } catch {
          // All remaining → fallback
          for (const p of retryBatch) {
            if (!classifiedIds.has(p.policyId)) {
              parsed.push({ policyId: p.policyId, category: "other", confidence: 0 });
            }
          }
        }
      }
    }

    results.push(...parsed);
    console.log(` ✅ ${parsed.length}개 분류`);
  }

  console.log(`   ✅ 총 ${results.length}개 분류 완료`);
  return results;
}

// ── Step 3: Description Generation ──────────────────────────────────

const DESC_SYSTEM = `You are an AI Foundry skill description generator.
Given a domain, a category name, and representative policy summaries,
generate a structured JSON object with these fields:
- name: concise Korean skill name (3-8 characters)
- description: one-sentence Korean description of what this skill covers
- triggers: array of 3-5 Korean trigger phrases a user might say
- examples: array of 2-3 usage example sentences in Korean

Respond ONLY with a valid JSON object, no markdown or extra text.`;

async function generateDescriptions(
  categorySummaries: Map<string, string[]>,
): Promise<Map<string, SkillDescription>> {
  console.log("📝 Step 3: 카테고리별 설명 생성 시작...");
  const result = new Map<string, SkillDescription>();

  for (const [category, summaries] of categorySummaries) {
    process.stdout.write(`   🔄 ${category}...`);
    try {
      const prompt = `도메인: ${DOMAIN}\n카테고리: ${category}\n\n대표 정책 요약:\n- ${summaries.slice(0, 10).join("\n- ")}\n\n위 정보를 바탕으로 이 카테고리의 스킬 설명을 생성해주세요.`;
      const raw = await callLlm("sonnet", DESC_SYSTEM, prompt, 2048);
      const cleaned = stripMarkdownFence(raw.trim());
      const parsed = JSON.parse(cleaned) as SkillDescription;
      result.set(category, {
        name: parsed.name ?? category,
        description: parsed.description ?? "",
        triggers: Array.isArray(parsed.triggers) ? parsed.triggers : [],
        examples: Array.isArray(parsed.examples) ? parsed.examples : [],
      });
      console.log(` ✅ "${parsed.name}"`);
    } catch (e) {
      result.set(category, {
        name: category,
        description: `${DOMAIN} ${category} 관련 스킬`,
        triggers: [],
        examples: [],
      });
      console.log(` ⚠️ fallback (${e instanceof Error ? e.message : "error"})`);
    }
  }

  console.log(`   ✅ ${result.size}개 설명 생성 완료`);
  return result;
}

// ── Step 4: Build Bundles (local) ───────────────────────────────────

interface BundleData {
  category: string;
  name: string;
  description: string;
  skillId: string;
  policyCount: number;
  policies: PolicyRow[];
  tags: string[];
  ontologyIds: string[];
  sourceDocIds: string[];
  trustLevel: string;
  trustScore: number;
  skillPackageJson: string;
}

function buildBundlesLocal(
  policies: PolicyRow[],
  classifications: ClassificationResult[],
  descriptions: Map<string, SkillDescription>,
): BundleData[] {
  console.log("📦 Step 4: 번들 빌드...");

  const classMap = new Map(classifications.map((c) => [c.policyId, c]));

  // Group by category
  const groups = new Map<string, PolicyRow[]>();
  for (const p of policies) {
    const cls = classMap.get(p.policyId);
    if (!cls) continue;
    const cat = cls.category;
    const list = groups.get(cat) ?? [];
    list.push(p);
    groups.set(cat, list);
  }

  const bundles: BundleData[] = [];

  for (const [category, items] of groups) {
    if (category === "other" && items.length < 3) continue;

    const tagSet = new Set<string>();
    for (const p of items) for (const t of p.tags) tagSet.add(t);
    const tags = [...tagSet].slice(0, 20);

    const sourceDocIds = [...new Set(items.map((p) => p.sourceDocumentId))];
    const ontologyIds = [...new Set(items.map((p) => p.ontologyId).filter(Boolean) as string[])];

    // Aggregate trust
    const avgScore = items.reduce((sum, p) => sum + p.trustScore, 0) / items.length;
    const allValidated = items.every((p) => p.trustLevel === "validated");
    const anyUnreviewed = items.some((p) => p.trustLevel === "unreviewed");
    const trustLevel = allValidated ? "validated" : anyUnreviewed ? "unreviewed" : "reviewed";
    const trustScore = Math.round(avgScore * 1000) / 1000;

    const desc = descriptions.get(category);
    const catMeta = CATEGORIES[category];
    const name = desc?.name ?? catMeta?.label ?? category;
    const description = desc?.description ?? `${DOMAIN} ${catMeta?.label ?? category} 관련 스킬`;

    const now = new Date().toISOString();
    const skillId = crypto.randomUUID();

    const skillPackage = {
      $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
      skillId,
      metadata: {
        domain: DOMAIN,
        subdomain: category,
        language: "ko",
        version: "2.0.0",
        createdAt: now,
        updatedAt: now,
        author: "ai-foundry-bundler",
        tags,
      },
      policies: items.map((p) => ({
        code: p.policyCode,
        title: p.title,
        condition: p.condition,
        criteria: p.criteria,
        outcome: p.outcome,
        source: { documentId: p.sourceDocumentId },
        trust: { level: p.trustLevel, score: p.trustScore },
        tags: p.tags,
      })),
      trust: { level: trustLevel, score: trustScore },
      ontologyRef: {
        graphId: ontologyIds[0] ?? "",
        termUris: ontologyIds,
      },
      provenance: {
        sourceDocumentIds: sourceDocIds,
        organizationId: ORG_ID,
        extractedAt: now,
        pipeline: {
          stages: ["ingestion", "extraction", "policy", "ontology", "skill"],
          models: { policy: "claude-opus", skill: "claude-sonnet" },
        },
      },
      adapters: {},
    };

    const skillPackageJson = JSON.stringify(skillPackage, null, 2);

    bundles.push({
      category,
      name,
      description,
      skillId,
      policyCount: items.length,
      policies: items,
      tags,
      ontologyIds,
      sourceDocIds,
      trustLevel,
      trustScore,
      skillPackageJson,
    });
  }

  console.log(`   ✅ ${bundles.length}개 번들 빌드 완료`);
  for (const b of bundles) {
    console.log(`      ${b.category}: ${b.policyCount}개 정책 → "${b.name}"`);
  }
  return bundles;
}

// ── Step 5: Save to D1 + R2 via wrangler CLI ────────────────────────

async function runWrangler(args: string): Promise<string> {
  const proc = Bun.spawn(["npx", "wrangler", ...args.split(" ")], {
    cwd: "/home/sinclair/work/axbd/res-ai-foundry/services/svc-skill",
    env: { ...process.env, CLOUDFLARE_API_TOKEN: CF_TOKEN },
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(`wrangler failed: ${err}`);
  return out;
}

async function runD1Command(sql: string): Promise<void> {
  const escaped = sql.replace(/'/g, "'\\''");
  const proc = Bun.spawn(
    ["npx", "wrangler", "d1", "execute", "db-skill", "--remote", "--env", "production", "--command", sql],
    {
      cwd: "/home/sinclair/work/axbd/res-ai-foundry/services/svc-skill",
      env: { ...process.env, CLOUDFLARE_API_TOKEN: CF_TOKEN },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(`D1 exec failed: ${err}`);
}

async function saveResults(
  classifications: ClassificationResult[],
  bundles: BundleData[],
): Promise<void> {
  console.log("💾 Step 5: D1 분류 저장...");

  // Save classifications in batches (D1 has command length limits)
  const BATCH = 50;
  for (let i = 0; i < classifications.length; i += BATCH) {
    const batch = classifications.slice(i, i + BATCH);
    const values = batch
      .map((c) => `('${c.policyId}', '${ORG_ID}', '${c.category}', ${c.confidence})`)
      .join(", ");
    const sql = `INSERT OR REPLACE INTO policy_classifications (policy_id, organization_id, category, confidence) VALUES ${values}`;
    await runD1Command(sql);
    process.stdout.write(`   📊 분류 저장: ${Math.min(i + BATCH, classifications.length)}/${classifications.length}\r`);
  }
  console.log(`   ✅ ${classifications.length}개 분류 저장 완료`);

  console.log("💾 Step 6: R2 + D1 번들 저장...");
  for (const bundle of bundles) {
    // Write .skill.json to temp file, then upload to R2
    const tmpPath = `/tmp/bundle-${bundle.skillId}.skill.json`;
    await Bun.write(tmpPath, bundle.skillPackageJson);

    const r2Key = `skill-packages/bundle-${bundle.skillId}.skill.json`;

    // Upload to R2 via wrangler
    const proc = Bun.spawn(
      ["npx", "wrangler", "r2", "object", "put", `ai-foundry-skill-packages/${r2Key}`, "--file", tmpPath],
      {
        cwd: "/home/sinclair/work/axbd/res-ai-foundry/services/svc-skill",
        env: { ...process.env, CLOUDFLARE_API_TOKEN: CF_TOKEN },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const err = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`   ⚠️ R2 upload failed for ${bundle.category}: ${err}`);
      continue;
    }

    // Insert into D1
    const escapedTags = JSON.stringify(bundle.tags).replace(/'/g, "''");
    const sql = `INSERT OR REPLACE INTO skills (skill_id, ontology_id, organization_id, domain, subdomain, language, version, author, tags, trust_level, trust_score, r2_key, status, policy_count, content_depth, created_at, updated_at) VALUES ('${bundle.skillId}', '${bundle.ontologyIds[0] ?? ""}', '${ORG_ID}', '${DOMAIN}', '${bundle.category}', 'ko', '2.0.0', 'ai-foundry-bundler', '${escapedTags}', '${bundle.trustLevel}', ${bundle.trustScore}, '${r2Key}', 'bundled', ${bundle.policyCount}, ${bundle.skillPackageJson.length}, datetime('now'), datetime('now'))`;
    await runD1Command(sql);

    console.log(`   ✅ ${bundle.category}: ${bundle.policyCount}개 → R2 + D1 저장`);

    // Cleanup temp file
    await Bun.write(tmpPath, ""); // truncate (Bun has no unlink)
  }

  // Supersede old 1:1 skills
  console.log("🔄 Step 7: 기존 1:1 스킬 supersede...");
  const sql = `UPDATE skills SET status = 'superseded', updated_at = datetime('now') WHERE organization_id = '${ORG_ID}' AND status IN ('draft', 'published') AND policy_count = 1`;
  await runD1Command(sql);
  console.log("   ✅ supersede 완료");
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("🚀 Production Skill Rebundle — Local Script");
  console.log(`   Org: ${ORG_ID}, Domain: ${DOMAIN}`);
  console.log("═══════════════════════════════════════════════\n");

  const startTime = Date.now();

  // 1. Fetch
  const policies = await fetchAllPolicies();

  // 2. Classify
  const classifications = await classifyAll(policies);

  // 3. Build category summaries
  const catSummaries = new Map<string, string[]>();
  const classMap = new Map(classifications.map((c) => [c.policyId, c]));
  for (const p of policies) {
    const cls = classMap.get(p.policyId);
    if (!cls) continue;
    const list = catSummaries.get(cls.category) ?? [];
    list.push(p.title);
    catSummaries.set(cls.category, list);
  }

  // 4. Generate descriptions
  const descriptions = await generateDescriptions(catSummaries);

  // 5. Build bundles
  const bundles = buildBundlesLocal(policies, classifications, descriptions);

  // 6-7. Save
  await saveResults(classifications, bundles);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n═══════════════════════════════════════════════");
  console.log("🎉 Rebundle 완료!");
  console.log(`   총 정책: ${policies.length}`);
  console.log(`   분류 완료: ${classifications.length}`);
  console.log(`   번들 생성: ${bundles.length}`);
  console.log(`   소요 시간: ${elapsed}초`);
  console.log("═══════════════════════════════════════════════");

  // Summary table
  console.log("\n📊 카테고리별 분류 결과:");
  const catCounts = new Map<string, number>();
  for (const c of classifications) catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
  for (const [cat, count] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const label = CATEGORIES[cat]?.label ?? cat;
    console.log(`   ${cat.padEnd(14)} ${String(count).padStart(4)}개  (${label})`);
  }
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
