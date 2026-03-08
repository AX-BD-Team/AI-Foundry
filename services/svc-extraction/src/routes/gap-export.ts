/**
 * Gap Export Route — svc-extraction (SVC-02)
 *
 * GET /gap-analysis/export → CSV export of all gap items
 *
 * Exports fact_check_gaps as BOM-prefixed CSV for Korean Excel compatibility.
 * Part of AIF-REQ-010.
 */

import { badRequest } from "@ai-foundry/utils";
import type { Env } from "../env.js";

// ── Row type ──────────────────────────────────────────────────────

interface GapRow {
  gap_id: string;
  gap_type: string;
  severity: string;
  source_item: string;
  description: string;
  review_status: string;
}

// ── Handler ───────────────────────────────────────────────────────

export async function handleGapExport(
  request: Request,
  env: Env,
): Promise<Response> {
  const orgId = request.headers.get("X-Organization-Id");
  if (!orgId) return badRequest("X-Organization-Id header required");

  const { results: gaps } = await env.DB_EXTRACTION.prepare(
    `SELECT gap_id, gap_type, severity, source_item, description, review_status
     FROM fact_check_gaps
     WHERE organization_id = ?
     ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, gap_id`,
  )
    .bind(orgId)
    .all<GapRow>();

  const header = "gap_id,gap_type,severity,source_item_name,description,review_status";
  const rows = gaps.map((g) => {
    const name = extractSourceItemName(g.source_item);
    return [
      csvEscape(g.gap_id),
      csvEscape(g.gap_type),
      csvEscape(g.severity),
      csvEscape(name),
      csvEscape(g.description),
      csvEscape(g.review_status),
    ].join(",");
  });

  const date = new Date().toISOString().slice(0, 10);
  const csv = "\uFEFF" + header + "\n" + rows.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gap-analysis-${orgId}-${date}.csv"`,
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────

function extractSourceItemName(sourceItemJson: string): string {
  try {
    const obj: unknown = JSON.parse(sourceItemJson);
    if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
      const rec = obj as Record<string, unknown>;
      const candidate =
        (rec["path"] as string | undefined)
        ?? (rec["tableName"] as string | undefined)
        ?? (rec["methodName"] as string | undefined)
        ?? (rec["name"] as string | undefined);
      if (candidate) return candidate;
    }
  } catch {
    // not valid JSON — return raw string
  }
  return sourceItemJson;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
