/**
 * Relevance Scorer — 핵심/비핵심 분류 (PRD SS4.2 Option C).
 *
 * 3 criteria:
 *   1. External API — @RestController public endpoint (not internal/health/debug/test/actuator)
 *   2. Core Entity  — FK 참조 3개 이상 (MyBatis JOIN 기반 추정)
 *   3. Transaction Core — @Transactional + DB write 2개+
 *
 * Score >= 2 → "core", Score == 0 → "non-core", Score == 1 → "unknown"
 *
 * Part of v0.7.4 Phase 2-C.
 */

import type { RelevanceCriteria } from "@ai-foundry/types";
import type { SourceApi, SourceTable, SourceSpec, SourceTransaction, SourceQuery } from "../factcheck/types.js";

// ── Public API ──────────────────────────────────────────────────

/**
 * Classify relevance based on 3 criteria.
 */
export function classifyRelevance(criteria: {
  isExternalApi: boolean;
  isCoreEntity: boolean;
  isTransactionCore: boolean;
}): "core" | "non-core" | "unknown" {
  const score =
    (criteria.isExternalApi ? 1 : 0) +
    (criteria.isCoreEntity ? 1 : 0) +
    (criteria.isTransactionCore ? 1 : 0);

  if (score >= 2) return "core";
  if (score === 0) return "non-core";
  return "unknown";
}

/**
 * Build a RelevanceCriteria object for an API endpoint.
 * API uses Criterion 1 (External API) + Criterion 3 (Transaction Core).
 * Criterion 2 (Core Entity) is always false for APIs.
 */
export function scoreApi(
  api: SourceApi,
  transactions: SourceTransaction[],
): RelevanceCriteria {
  const ext = isExternalApi(api);
  const txn = isTransactionCore(api.methodName, transactions);
  const score = (ext ? 1 : 0) + (txn ? 1 : 0);
  const relevance = classifyRelevance({
    isExternalApi: ext,
    isCoreEntity: false,
    isTransactionCore: txn,
  });

  return {
    isExternalApi: ext,
    isCoreEntity: false,
    isTransactionCore: txn,
    score,
    relevance,
  };
}

/**
 * Build a RelevanceCriteria object for a table.
 * Table uses Criterion 2 (Core Entity). Criterion 3 is also checked
 * if the table has JOIN relationships with other tables.
 */
export function scoreTable(
  table: SourceTable,
  allQueries: SourceQuery[],
): RelevanceCriteria {
  const core = isCoreEntity(table.tableName, allQueries);
  // For tables, isTransactionCore checks if this table appears in write queries
  const txn = isTableTransactionCore(table.tableName, allQueries);
  const score = (core ? 1 : 0) + (txn ? 1 : 0);
  const relevance = classifyRelevance({
    isExternalApi: false,
    isCoreEntity: core,
    isTransactionCore: txn,
  });

  return {
    isExternalApi: false,
    isCoreEntity: core,
    isTransactionCore: txn,
    score,
    relevance,
  };
}

/**
 * Classify all APIs and tables in a SourceSpec.
 * Returns a map of (API path or table name) → RelevanceCriteria.
 */
export function classifyAll(
  sourceSpec: SourceSpec,
  transactions: SourceTransaction[],
  queries: SourceQuery[],
): Map<string, RelevanceCriteria> {
  const result = new Map<string, RelevanceCriteria>();

  for (const api of sourceSpec.apis) {
    result.set(api.path, scoreApi(api, transactions));
  }

  for (const table of sourceSpec.tables) {
    result.set(table.tableName, scoreTable(table, queries));
  }

  return result;
}

// ── Criterion 1: External API ──────────────────────────────────

/**
 * Check if an API is an external (public-facing) endpoint.
 * Internal paths (/internal/, /health, /debug, /test, /actuator) are excluded.
 */
export function isExternalApi(api: SourceApi): boolean {
  const path = api.path.toLowerCase();
  return !(
    path.includes("/internal/") ||
    path.includes("/health") ||
    path.includes("/debug") ||
    path.includes("/test") ||
    path.includes("/actuator")
  );
}

// ── Criterion 2: Core Entity ───────────────────────────────────

/**
 * Check if a table is a core entity.
 * A table is core if it appears in 3 or more queries that reference multiple tables (JOINs).
 */
export function isCoreEntity(
  tableName: string,
  allQueries: SourceQuery[],
): boolean {
  let refCount = 0;
  for (const query of allQueries) {
    if (query.tables.includes(tableName) && query.tables.length > 1) {
      refCount++;
    }
  }
  return refCount >= 3;
}

// ── Criterion 3: Transaction Core ──────────────────────────────

/**
 * Check if an API method is transactional with DB writes.
 * Uses method name fuzzy matching against CodeTransaction entries.
 */
export function isTransactionCore(
  apiMethodName: string,
  transactions: SourceTransaction[],
): boolean {
  const normalized = apiMethodName.toLowerCase();

  for (const txn of transactions) {
    if (!txn.isTransactional) continue;

    const txnMethod = txn.methodName.toLowerCase();
    // Exact match or suffix match (e.g., "issueVoucher" matches "issueVoucher" in ServiceImpl)
    if (txnMethod === normalized || txnMethod.includes(normalized) || normalized.includes(txnMethod)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a table is involved in write operations (INSERT/UPDATE/DELETE).
 * Used for table-level Transaction Core scoring.
 */
export function isTableTransactionCore(
  tableName: string,
  allQueries: SourceQuery[],
): boolean {
  let writeCount = 0;
  for (const query of allQueries) {
    if (query.tables.includes(tableName)) {
      if (query.queryType === "insert" || query.queryType === "update" || query.queryType === "delete") {
        writeCount++;
      }
    }
  }
  return writeCount >= 2;
}
