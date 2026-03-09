/**
 * Structural Matcher — 소스↔문서 구조적 비교 (exact + fuzzy).
 *
 * Step 1: Exact match (normalized path/table name)
 * Step 2: Fuzzy match (Jaccard >= 0.6 for unmatched items)
 *
 * LLM semantic matching (Step 3) is handled separately in llm-matcher.ts.
 */

import type { MatchedItem } from "@ai-foundry/types";
import type { SourceSpec, SourceApi, SourceTable, DocSpec, DocApi, DocTable } from "./types.js";

// ── Constants ────────────────────────────────────────────────────

const FUZZY_THRESHOLD = 0.6;

// ── Main ─────────────────────────────────────────────────────────

export interface MatchResult {
  matchedItems: MatchedItem[];
  unmatchedSourceApis: SourceApi[];
  unmatchedDocApis: DocApi[];
  unmatchedSourceTables: SourceTable[];
  unmatchedDocTables: DocTable[];
}

/**
 * Run structural matching between source spec and doc spec.
 * Returns matched items + unmatched items on both sides.
 */
export function structuralMatch(
  sourceSpec: SourceSpec,
  docSpec: DocSpec,
): MatchResult {
  const matchedItems: MatchedItem[] = [];

  // Track which items have been matched
  const matchedSourceApiIdx = new Set<number>();
  const matchedDocApiIdx = new Set<number>();
  const matchedSourceTableIdx = new Set<number>();
  const matchedDocTableIdx = new Set<number>();

  // ── API Matching ────────────────────────────────────────────────

  // Step 1: Exact match on normalized paths (primary + alternatives)
  for (let si = 0; si < sourceSpec.apis.length; si++) {
    const srcApi = sourceSpec.apis[si];
    if (!srcApi || matchedSourceApiIdx.has(si)) continue;

    // Build all normalized path candidates: primary + alternativePaths
    const candidates: Array<{ norm: string; score: number }> = [
      { norm: normalizePath(srcApi.path), score: 1.0 },
    ];
    if (srcApi.alternativePaths) {
      for (const alt of srcApi.alternativePaths) {
        const n = normalizePath(alt);
        if (!candidates.some((c) => c.norm === n)) {
          candidates.push({ norm: n, score: 0.9 });
        }
      }
    }
    // Legacy Step 1.5 fallback: path + methodName (in case alternativePaths not set)
    if (!srcApi.alternativePaths) {
      const augmented = normalizePath(srcApi.path + "/" + srcApi.methodName);
      if (!candidates.some((c) => c.norm === augmented)) {
        candidates.push({ norm: augmented, score: 0.9 });
      }
    }

    let matched = false;
    for (const cand of candidates) {
      if (matched) break;
      for (let di = 0; di < docSpec.apis.length; di++) {
        const docApi = docSpec.apis[di];
        if (!docApi || matchedDocApiIdx.has(di)) continue;

        const docNorm = normalizePath(docApi.path);
        if (cand.norm === docNorm) {
          matchedItems.push(buildApiMatch(srcApi, docApi, cand.score, "exact"));
          matchedSourceApiIdx.add(si);
          matchedDocApiIdx.add(di);
          matched = true;
          break;
        }
      }
    }
  }

  // Step 1.5: Resource path match — extract last 2 meaningful segments and compare
  for (let si = 0; si < sourceSpec.apis.length; si++) {
    const srcApi = sourceSpec.apis[si];
    if (!srcApi || matchedSourceApiIdx.has(si)) continue;

    const allPaths = [srcApi.path, ...(srcApi.alternativePaths ?? [])];
    const srcResources = allPaths.map(extractResourcePath).filter(Boolean);

    for (let di = 0; di < docSpec.apis.length; di++) {
      const docApi = docSpec.apis[di];
      if (!docApi || matchedDocApiIdx.has(di)) continue;

      const docResource = extractResourcePath(docApi.path);
      if (docResource && srcResources.includes(docResource)) {
        matchedItems.push(buildApiMatch(srcApi, docApi, 0.85, "exact"));
        matchedSourceApiIdx.add(si);
        matchedDocApiIdx.add(di);
        break;
      }
    }
  }

  // Step 2: Fuzzy match on unmatched APIs (primary + alternative paths)
  for (let si = 0; si < sourceSpec.apis.length; si++) {
    const srcApi = sourceSpec.apis[si];
    if (!srcApi || matchedSourceApiIdx.has(si)) continue;

    // Build token sets for all path variants
    const srcTokenSets = [tokenizePath(srcApi.path)];
    if (srcApi.alternativePaths) {
      for (const alt of srcApi.alternativePaths) {
        srcTokenSets.push(tokenizePath(alt));
      }
    }

    let bestScore = 0;
    let bestDocIdx = -1;

    for (let di = 0; di < docSpec.apis.length; di++) {
      const docApi = docSpec.apis[di];
      if (!docApi || matchedDocApiIdx.has(di)) continue;

      const docTokens = tokenizePath(docApi.path);
      // Try all source path variants, pick the best Jaccard score
      for (const srcTokens of srcTokenSets) {
        const score = jaccardSimilarity(srcTokens, docTokens);
        if (score > bestScore) {
          bestScore = score;
          bestDocIdx = di;
        }
      }
    }

    if (bestScore >= FUZZY_THRESHOLD && bestDocIdx >= 0) {
      const docApi = docSpec.apis[bestDocIdx];
      if (docApi) {
        matchedItems.push(buildApiMatch(srcApi, docApi, bestScore, "fuzzy"));
        matchedSourceApiIdx.add(si);
        matchedDocApiIdx.add(bestDocIdx);
      }
    }
  }

  // ── Table Matching ──────────────────────────────────────────────

  // Step 1: Exact match on normalized table names
  for (let si = 0; si < sourceSpec.tables.length; si++) {
    const srcTbl = sourceSpec.tables[si];
    if (!srcTbl || matchedSourceTableIdx.has(si)) continue;

    const srcNorm = normalizeTableName(srcTbl.tableName);

    for (let di = 0; di < docSpec.tables.length; di++) {
      const docTbl = docSpec.tables[di];
      if (!docTbl || matchedDocTableIdx.has(di)) continue;

      const docNorm = normalizeTableName(docTbl.tableName);

      if (srcNorm === docNorm) {
        matchedItems.push(buildTableMatch(srcTbl, docTbl, 1.0, "exact"));
        matchedSourceTableIdx.add(si);
        matchedDocTableIdx.add(di);
        break;
      }
    }
  }

  // Step 2: Fuzzy match on unmatched tables
  for (let si = 0; si < sourceSpec.tables.length; si++) {
    const srcTbl = sourceSpec.tables[si];
    if (!srcTbl || matchedSourceTableIdx.has(si)) continue;

    let bestScore = 0;
    let bestDocIdx = -1;

    for (let di = 0; di < docSpec.tables.length; di++) {
      const docTbl = docSpec.tables[di];
      if (!docTbl || matchedDocTableIdx.has(di)) continue;

      const score = tableNameSimilarity(srcTbl.tableName, docTbl.tableName);
      if (score > bestScore) {
        bestScore = score;
        bestDocIdx = di;
      }
    }

    if (bestScore >= FUZZY_THRESHOLD && bestDocIdx >= 0) {
      const docTbl = docSpec.tables[bestDocIdx];
      if (docTbl) {
        matchedItems.push(buildTableMatch(srcTbl, docTbl, bestScore, "fuzzy"));
        matchedSourceTableIdx.add(si);
        matchedDocTableIdx.add(bestDocIdx);
      }
    }
  }

  // ── Collect unmatched items ─────────────────────────────────────

  const unmatchedSourceApis = sourceSpec.apis.filter((_, i) => !matchedSourceApiIdx.has(i));
  const unmatchedDocApis = docSpec.apis.filter((_, i) => !matchedDocApiIdx.has(i));
  const unmatchedSourceTables = sourceSpec.tables.filter((_, i) => !matchedSourceTableIdx.has(i));
  const unmatchedDocTables = docSpec.tables.filter((_, i) => !matchedDocTableIdx.has(i));

  return {
    matchedItems,
    unmatchedSourceApis,
    unmatchedDocApis,
    unmatchedSourceTables,
    unmatchedDocTables,
  };
}

// ── Path Normalization ───────────────────────────────────────────

/**
 * Normalize an API path for comparison.
 * - lowercase
 * - strip hostname
 * - trim slashes
 * - convert path variables ({id}, :id) to `:param`
 * - normalize version prefixes (v1.0 → 1.0)
 * - deduplicate slashes
 */
export function normalizePath(path: string): string {
  return path
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/i, "") // strip http(s)://hostname
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/v(\d+\.\d+)(?=\/|$)/g, "/$1") // v1.0 → 1.0
    .replace(/\{[^}]+\}/g, ":param")
    .replace(/:[\w]+/g, ":param")
    .replace(/\/+/g, "/");
}

/**
 * Extract the "resource identity" from a path — the last two meaningful segments
 * stripped of params and noise. Used as an additional fuzzy matching signal.
 *
 * "/onnuripay/v1.0/charge/chargeDealing" → "charge/chargedealing"
 * "/api/v2/users/{id}/orders"            → "users/orders"
 */
export function extractResourcePath(path: string): string {
  const segments = path
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("/")
    .filter(Boolean)
    .filter((s) => !RESOURCE_NOISE.test(s) && !/^\{.*\}$/.test(s) && !s.startsWith(":"));

  // Take last 2 meaningful segments
  return segments.slice(-2).join("/");
}

const RESOURCE_NOISE = /^(api|rest|v\d+|v?\d+\.\d+|internal|external|onnuripay|miraeasset)$/;

/**
 * Tokenize a path into meaningful segments for fuzzy comparison.
 * Splits on delimiters AND camelCase boundaries for better Jaccard.
 * Filters noise tokens: API prefixes, version numbers, app names.
 */
export function tokenizePath(path: string): string[] {
  return path
    .split(/[/\-_.]/)
    .filter(Boolean)
    .flatMap(splitCamelCase)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 1 && !NOISE_TOKENS.has(t) && !isVersionToken(t));
}

/**
 * Split a camelCase token into individual words.
 * e.g., "chargeDealing" → ["charge", "Dealing"]
 *        "sendGift"     → ["send", "Gift"]
 *        "HTTPStatus"   → ["HTTP", "Status"]
 */
export function splitCamelCase(token: string): string[] {
  // Insert boundary between lowercase→uppercase and between uppercase run→uppercase+lowercase
  const parts = token.replace(/([a-z])([A-Z])/g, "$1\0$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1\0$2")
    .split("\0")
    .filter(Boolean);
  return parts.length > 0 ? parts : [token];
}

/** Common noise tokens that dilute Jaccard similarity */
const NOISE_TOKENS = new Set([
  "api", "v1", "v2", "v3", "v4",
  "rest", "internal", "external",
  "param", // from :param normalization
  "controller", "service", "impl",
  "onnuripay", "miraeasset", // known app names
]);

/** Detect version-like tokens: "1.0", "2.0", "10" */
function isVersionToken(t: string): boolean {
  return /^\d+(\.\d+)?$/.test(t);
}

// ── Table Name Normalization ─────────────────────────────────────

/**
 * Normalize a table name by removing common prefixes.
 */
export function normalizeTableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(tb_|t_|tbl_)/, "");
}

/**
 * Calculate similarity between two table names.
 * Uses normalized exact match (score=1.0), then Jaccard on tokens.
 */
function tableNameSimilarity(a: string, b: string): number {
  const normA = normalizeTableName(a);
  const normB = normalizeTableName(b);

  if (normA === normB) return 1.0;

  // Levenshtein distance < 3 → high similarity
  if (levenshteinDistance(normA, normB) < 3) return 0.8;

  // Token-based Jaccard
  const tokensA = normA.split("_").filter(Boolean);
  const tokensB = normB.split("_").filter(Boolean);
  return jaccardSimilarity(tokensA, tokensB);
}

// ── Column Matching ──────────────────────────────────────────────

/**
 * Convert camelCase to snake_case.
 */
export function camelToSnake(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Check if two column names match (case-insensitive + camelCase↔snake_case).
 */
export function matchColumnName(sourceName: string, docName: string): boolean {
  const sNorm = sourceName.toLowerCase();
  const dNorm = docName.toLowerCase();
  return sNorm === dNorm
    || camelToSnake(sourceName) === dNorm
    || sNorm === camelToSnake(docName);
}

// ── Similarity Metrics ───────────────────────────────────────────

/**
 * Jaccard similarity coefficient between two token arrays.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Levenshtein edit distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    const row = matrix[0];
    if (row) row[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const row = matrix[i];
      const prevRow = matrix[i - 1];
      if (!row || !prevRow) continue;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        (prevRow[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prevRow[j - 1] ?? 0) + cost,
      );
    }
  }

  const lastRow = matrix[a.length];
  return lastRow?.[b.length] ?? Math.max(a.length, b.length);
}

// ── Match builders ───────────────────────────────────────────────

function buildApiMatch(
  src: SourceApi,
  doc: DocApi,
  score: number,
  method: "exact" | "fuzzy",
): MatchedItem {
  return {
    sourceRef: {
      name: src.path,
      type: "api",
      documentId: src.documentId,
      location: `${src.controllerClass}.${src.methodName}`,
    },
    docRef: {
      name: doc.path,
      type: "api",
      documentId: doc.documentId,
      location: doc.location,
    },
    matchScore: score,
    matchMethod: method,
  };
}

function buildTableMatch(
  src: SourceTable,
  doc: DocTable,
  score: number,
  method: "exact" | "fuzzy",
): MatchedItem {
  return {
    sourceRef: {
      name: src.tableName,
      type: "table",
      documentId: src.documentId,
      location: src.sourceFile,
    },
    docRef: {
      name: doc.tableName,
      type: "table",
      documentId: doc.documentId,
      location: doc.location,
    },
    matchScore: score,
    matchMethod: method,
  };
}
