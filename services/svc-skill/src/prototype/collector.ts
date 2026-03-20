/**
 * Data Collector — 5개 서비스에서 org별 파이프라인 데이터 수집
 */
import type { Env } from "../env.js";

// ── 수집 결과 타입 ──────────────────────────────

export interface PolicyRow {
  policy_id: string;
  policy_code: string;
  title: string;
  condition: string;
  criteria: string;
  outcome: string;
  source_document_id: string;
  source_page_ref: string | null;
  source_excerpt: string | null;
  status: string;
  trust_level: string;
  trust_score: number;
  tags: string;
}

export interface TermRow {
  term_id: string;
  ontology_id: string;
  label: string;
  definition: string | null;
  skos_uri: string | null;
  broader_term_id: string | null;
  term_type: string;
}

export interface SkillRow {
  skill_id: string;
  domain: string;
  subdomain: string | null;
  version: string;
  r2_key: string;
  policy_count: number;
  trust_level: string;
  trust_score: number;
  tags: string;
  status: string;
}

export interface DocumentRow {
  document_id: string;
  filename: string;
  content_type: string;
  status: string;
  organization_id: string;
}

export interface ExtractionResult {
  extractionId: string;
  documentId: string;
  status: string;
  result: unknown;
}

export interface CollectedData {
  policies: PolicyRow[];
  terms: TermRow[];
  skills: SkillRow[];
  documents: DocumentRow[];
  extractions: ExtractionResult[];
}

// ── 헬퍼: Service Binding fetch ─────────────────

async function fetchService<T>(
  fetcher: Fetcher,
  path: string,
  secret: string,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetcher.fetch(`https://internal${path}`, {
    headers: {
      "X-Internal-Secret": secret,
      "Content-Type": "application/json",
      ...headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Service fetch failed: ${path} → ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── 페이지네이션 수집 ───────────────────────────

async function fetchAllPolicies(
  env: Env,
  orgId: string,
): Promise<PolicyRow[]> {
  const all: PolicyRow[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const res = await fetchService<{ success: boolean; data: { policies: PolicyRow[]; total: number } }>(
      env.SVC_POLICY,
      `/policies?status=approved&limit=${limit}&offset=${offset}`,
      env.INTERNAL_API_SECRET,
      { "X-Organization-Id": orgId },
    );
    const policies = res.data.policies;
    all.push(...policies);
    if (policies.length < limit || all.length >= res.data.total) break;
    offset += limit;
  }
  return all;
}

async function fetchAllTerms(
  env: Env,
  orgId: string,
): Promise<TermRow[]> {
  const all: TermRow[] = [];
  let offset = 0;
  const limit = 500;

  while (true) {
    const res = await fetchService<{ success: boolean; data: { terms: TermRow[]; total: number } }>(
      env.SVC_ONTOLOGY,
      `/terms?limit=${limit}&offset=${offset}`,
      env.INTERNAL_API_SECRET,
      { "X-Organization-Id": orgId },
    );
    const terms = res.data.terms;
    all.push(...terms);
    if (terms.length < limit || all.length >= res.data.total) break;
    offset += limit;
  }
  return all;
}

async function fetchAllDocuments(
  env: Env,
  orgId: string,
): Promise<DocumentRow[]> {
  const all: DocumentRow[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const res = await fetchService<{ success: boolean; data: { documents: DocumentRow[]; total: number } }>(
      env.SVC_INGESTION,
      `/documents?limit=${limit}&offset=${offset}`,
      env.INTERNAL_API_SECRET,
      { "X-Organization-Id": orgId },
    );
    const docs = res.data.documents;
    all.push(...docs);
    if (docs.length < limit || all.length >= res.data.total) break;
    offset += limit;
  }
  return all;
}

async function fetchBundledSkills(
  env: Env,
  orgId: string,
): Promise<SkillRow[]> {
  const result = await env.DB_SKILL.prepare(
    `SELECT skill_id, domain, subdomain, version, r2_key, policy_count,
            trust_level, trust_score, tags, status
     FROM skills
     WHERE organization_id = ? AND status = 'bundled'
     ORDER BY domain, subdomain`,
  ).bind(orgId).all<SkillRow>();
  return result.results;
}

async function fetchExtractions(
  env: Env,
  documentIds: string[],
): Promise<ExtractionResult[]> {
  const all: ExtractionResult[] = [];
  // batch 10개씩 병렬 조회
  const batchSize = 10;
  for (let i = 0; i < documentIds.length; i += batchSize) {
    const batch = documentIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (docId) => {
        const res = await fetchService<{ success: boolean; data: { extractions: ExtractionResult[] } } | { extractions: ExtractionResult[] }>(
          env.SVC_EXTRACTION,
          `/extractions?documentId=${docId}`,
          env.INTERNAL_API_SECRET,
        );
        // API 응답 래퍼 패턴: { success, data: { extractions } } 또는 직접 { extractions }
        const extractions = "data" in res && res.data
          ? (res.data as { extractions: ExtractionResult[] }).extractions
          : (res as { extractions: ExtractionResult[] }).extractions;
        return extractions ?? [];
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && Array.isArray(r.value)) {
        all.push(...r.value);
      }
    }
  }
  return all;
}

// ── 메인 수집 함수 ──────────────────────────────

export async function collectOrgData(
  env: Env,
  orgId: string,
): Promise<CollectedData> {
  // 1~4 병렬 수집 — 각 서비스 실패 시 빈 배열로 fallback
  const results = await Promise.allSettled([
    fetchAllPolicies(env, orgId),
    fetchAllTerms(env, orgId),
    fetchAllDocuments(env, orgId),
    fetchBundledSkills(env, orgId),
  ]);

  const policies = results[0]?.status === "fulfilled" ? results[0].value : [];
  const terms = results[1]?.status === "fulfilled" ? results[1].value : [];
  const documents = results[2]?.status === "fulfilled" ? results[2].value : [];
  const skills = results[3]?.status === "fulfilled" ? results[3].value : [];

  // 실패 서비스 로깅
  const serviceNames = ["SVC_POLICY", "SVC_ONTOLOGY", "SVC_INGESTION", "DB_SKILL(local)"];
  for (let i = 0; i < results.length; i++) {
    if (results[i]?.status === "rejected") {
      const reason = (results[i] as PromiseRejectedResult).reason;
      console.error(`[collector] ${serviceNames[i]} failed: ${String(reason)}`);
    }
  }

  // 5. extractions — documents 기반 (의존)
  const documentIds = documents.map((d) => d.document_id);
  const extractions = documentIds.length > 0
    ? await fetchExtractions(env, documentIds).catch(() => [] as ExtractionResult[])
    : [];

  return { policies, terms, documents, skills, extractions };
}
