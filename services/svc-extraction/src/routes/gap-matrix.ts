/**
 * Gap Trace Matrix Route — svc-extraction (SVC-02)
 *
 * GET /gap-analysis/trace-matrix → Document ↔ Source code traceability matrix
 *
 * Reads the latest completed fact_check_results match_result_json and
 * transforms it into a structured matrix with coverage stats.
 * Part of AIF-REQ-010.
 */

import { ok, badRequest } from "@ai-foundry/utils";
import type { Env } from "../env.js";

// ── Types ─────────────────────────────────────────────────────────

interface MatchResultEntry {
  sourceRef: {
    name: string;
    type: string;
    documentId: string;
    location: string;
  };
  docRef?: {
    name: string;
    type: string;
    documentId: string;
    location: string;
  };
  matchScore: number;
  matchMethod: string;
}

interface MatrixEntry {
  sourceName: string;
  sourceType: string;
  sourceDocId: string;
  docName: string | undefined;
  docType: string | undefined;
  docDocId: string | undefined;
  matchScore: number;
  matchMethod: string;
  status: "matched" | "unmatched";
}

interface TraceMatrixResponse {
  matrix: MatrixEntry[];
  stats: {
    totalSource: number;
    totalDoc: number;
    matched: number;
    unmatched: number;
  };
}

interface FactCheckResultRow {
  match_result_json: string;
}

// ── Handler ───────────────────────────────────────────────────────

export async function handleTraceMatrix(
  request: Request,
  env: Env,
): Promise<Response> {
  const orgId = request.headers.get("X-Organization-Id");
  if (!orgId) return badRequest("X-Organization-Id header required");

  const row = await env.DB_EXTRACTION.prepare(
    `SELECT match_result_json
     FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(orgId)
    .first<FactCheckResultRow>();

  if (!row) {
    return ok<TraceMatrixResponse>({
      matrix: [],
      stats: { totalSource: 0, totalDoc: 0, matched: 0, unmatched: 0 },
    });
  }

  let entries: MatchResultEntry[];
  try {
    const parsed: unknown = JSON.parse(row.match_result_json);
    if (!Array.isArray(parsed)) {
      return ok<TraceMatrixResponse>({
        matrix: [],
        stats: { totalSource: 0, totalDoc: 0, matched: 0, unmatched: 0 },
      });
    }
    entries = parsed as MatchResultEntry[];
  } catch {
    return ok<TraceMatrixResponse>({
      matrix: [],
      stats: { totalSource: 0, totalDoc: 0, matched: 0, unmatched: 0 },
    });
  }

  const docIds = new Set<string>();
  let matched = 0;
  let unmatched = 0;

  const matrix: MatrixEntry[] = entries.map((e) => {
    const hasDoc = e.docRef != null && e.matchScore > 0;
    if (hasDoc) {
      matched++;
      if (e.docRef) {
        docIds.add(e.docRef.documentId);
      }
    } else {
      unmatched++;
    }

    const entry: MatrixEntry = {
      sourceName: e.sourceRef.name,
      sourceType: e.sourceRef.type,
      sourceDocId: e.sourceRef.documentId,
      docName: e.docRef?.name,
      docType: e.docRef?.type,
      docDocId: e.docRef?.documentId,
      matchScore: e.matchScore,
      matchMethod: e.matchMethod,
      status: hasDoc ? "matched" : "unmatched",
    };
    return entry;
  });

  const response: TraceMatrixResponse = {
    matrix,
    stats: {
      totalSource: entries.length,
      totalDoc: docIds.size,
      matched,
      unmatched,
    },
  };

  return ok(response);
}
