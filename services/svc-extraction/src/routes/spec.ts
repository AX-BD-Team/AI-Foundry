/**
 * Classification Routes — relevance classification (core/non-core/unknown).
 *
 * POST /specs/classify     → Run classification for an organization
 * GET  /specs/classified   → Query classified items
 *
 * Part of v0.7.4 Phase 2-C.
 */

import { ok, badRequest } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { aggregateSourceSpec } from "../factcheck/source-aggregator.js";
import { classifyAll } from "../export/relevance-scorer.js";


// ── Main route handler ──────────────────────────────────────────

export async function handleSpecRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  path: string,
  method: string,
  url: URL,
): Promise<Response | null> {

  // POST /specs/classify
  if (method === "POST" && path === "/specs/classify") {
    return handleClassify(request, env);
  }

  // GET /specs/classified
  if (method === "GET" && path === "/specs/classified") {
    return handleGetClassified(request, env, url);
  }

  return null;
}

// ── POST /specs/classify ────────────────────────────────────────

interface ClassifyBody {
  organizationId: string;
}

async function handleClassify(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: ClassifyBody;
  try {
    body = (await request.json()) as ClassifyBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { organizationId } = body;
  if (!organizationId || typeof organizationId !== "string") {
    return badRequest("organizationId is required");
  }

  // Aggregate source spec
  const sourceSpec = await aggregateSourceSpec(env, organizationId);

  // Classify all items using actual transaction/query data from source
  const relevanceMap = classifyAll(
    sourceSpec,
    sourceSpec.transactions,
    sourceSpec.queries,
  );

  // Store classifications in D1
  const classifications: Array<{
    specType: "api" | "table";
    itemName: string;
    relevance: "core" | "non-core" | "unknown";
    criteria: {
      isExternalApi: boolean;
      isCoreEntity: boolean;
      isTransactionCore: boolean;
      score: number;
    };
  }> = [];

  let coreApis = 0;
  let nonCoreApis = 0;
  let unknownApis = 0;
  let coreTables = 0;
  let nonCoreTables = 0;
  let unknownTables = 0;

  for (const api of sourceSpec.apis) {
    const criteria = relevanceMap.get(api.path);
    if (!criteria) continue;

    classifications.push({
      specType: "api",
      itemName: api.path,
      relevance: criteria.relevance,
      criteria: {
        isExternalApi: criteria.isExternalApi,
        isCoreEntity: criteria.isCoreEntity,
        isTransactionCore: criteria.isTransactionCore,
        score: criteria.score,
      },
    });

    if (criteria.relevance === "core") coreApis++;
    else if (criteria.relevance === "non-core") nonCoreApis++;
    else unknownApis++;

    // Upsert to D1
    await env.DB_EXTRACTION.prepare(
      `INSERT OR REPLACE INTO spec_classifications
       (classification_id, organization_id, spec_type, item_name,
        is_external_api, is_core_entity, is_transaction_core,
        relevance_score, relevance, created_at)
       VALUES (?, ?, 'api', ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        organizationId,
        api.path,
        criteria.isExternalApi ? 1 : 0,
        criteria.isCoreEntity ? 1 : 0,
        criteria.isTransactionCore ? 1 : 0,
        criteria.score,
        criteria.relevance,
        new Date().toISOString(),
      )
      .run();
  }

  for (const table of sourceSpec.tables) {
    const criteria = relevanceMap.get(table.tableName);
    if (!criteria) continue;

    classifications.push({
      specType: "table",
      itemName: table.tableName,
      relevance: criteria.relevance,
      criteria: {
        isExternalApi: criteria.isExternalApi,
        isCoreEntity: criteria.isCoreEntity,
        isTransactionCore: criteria.isTransactionCore,
        score: criteria.score,
      },
    });

    if (criteria.relevance === "core") coreTables++;
    else if (criteria.relevance === "non-core") nonCoreTables++;
    else unknownTables++;

    // Upsert to D1
    await env.DB_EXTRACTION.prepare(
      `INSERT OR REPLACE INTO spec_classifications
       (classification_id, organization_id, spec_type, item_name,
        is_external_api, is_core_entity, is_transaction_core,
        relevance_score, relevance, created_at)
       VALUES (?, ?, 'table', ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        organizationId,
        table.tableName,
        criteria.isExternalApi ? 1 : 0,
        criteria.isCoreEntity ? 1 : 0,
        criteria.isTransactionCore ? 1 : 0,
        criteria.score,
        criteria.relevance,
        new Date().toISOString(),
      )
      .run();
  }

  return ok({
    totalApis: sourceSpec.apis.length,
    coreApis,
    nonCoreApis,
    unknownApis,
    totalTables: sourceSpec.tables.length,
    coreTables,
    nonCoreTables,
    unknownTables,
    classifications,
  });
}

// ── GET /specs/classified ───────────────────────────────────────

interface ClassificationRow {
  classification_id: string;
  organization_id: string;
  spec_type: string;
  item_name: string;
  is_external_api: number;
  is_core_entity: number;
  is_transaction_core: number;
  relevance_score: number;
  relevance: string;
  created_at: string;
}

async function handleGetClassified(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const organizationId = request.headers.get("X-Organization-Id");
  if (!organizationId) {
    return badRequest("X-Organization-Id header is required");
  }

  // Build filtered query
  const conditions: string[] = ["organization_id = ?"];
  const bindings: (string | number)[] = [organizationId];

  const relevanceFilter = url.searchParams.get("relevance");
  if (relevanceFilter) {
    conditions.push("relevance = ?");
    bindings.push(relevanceFilter);
  }

  const specTypeFilter = url.searchParams.get("specType");
  if (specTypeFilter) {
    conditions.push("spec_type = ?");
    bindings.push(specTypeFilter);
  }

  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
  const offset = Number(url.searchParams.get("offset")) || 0;

  const whereClause = conditions.join(" AND ");

  // Count query
  const countRow = await env.DB_EXTRACTION.prepare(
    `SELECT COUNT(*) AS total FROM spec_classifications WHERE ${whereClause}`,
  )
    .bind(...bindings)
    .first<{ total: number }>();

  const total = countRow?.total ?? 0;

  // Data query
  const { results } = await env.DB_EXTRACTION.prepare(
    `SELECT * FROM spec_classifications
     WHERE ${whereClause}
     ORDER BY relevance_score DESC, created_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...bindings, limit, offset)
    .all<ClassificationRow>();

  return ok({
    classifications: results.map((r) => ({
      classificationId: r.classification_id,
      organizationId: r.organization_id,
      specType: r.spec_type,
      itemName: r.item_name,
      criteria: {
        isExternalApi: r.is_external_api === 1,
        isCoreEntity: r.is_core_entity === 1,
        isTransactionCore: r.is_transaction_core === 1,
        score: r.relevance_score,
      },
      relevance: r.relevance,
      createdAt: r.created_at,
    })),
    total,
    limit,
    offset,
  });
}
