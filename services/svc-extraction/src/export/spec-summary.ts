/**
 * CSV Summary Generator — produces a BOM-prefixed CSV summary
 * combining API and Table spec entries for executive reporting.
 *
 * Excel-compatible: UTF-8 BOM ensures Korean characters display correctly.
 *
 * Part of v0.7.4 Phase 2-C.
 */

import type { ApiSpecEntry, TableSpecEntry } from "@ai-foundry/types";

// ── Constants ────────────────────────────────────────────────────

const BOM = "\uFEFF";
const CSV_HEADER = "Spec Type,Name,Source Location,Document Ref,Relevance,Gaps (Total),Gaps (HIGH),Coverage %,Confidence";

// ── Main ────────────────────────────────────────────────────────

/**
 * Generate a CSV summary combining API and Table spec entries.
 * The CSV includes a UTF-8 BOM prefix for Excel compatibility.
 */
export function generateCsvSummary(
  apiSpecs: ApiSpecEntry[],
  tableSpecs: TableSpecEntry[],
): string {
  const lines: string[] = [CSV_HEADER];

  for (const api of apiSpecs) {
    lines.push(formatCsvRow(
      "API",
      api.endpoint,
      api.sourceLocation,
      api.documentRef ?? "",
      api.relevance,
      api.factCheck.totalGaps,
      api.factCheck.highGaps,
      api.factCheck.coveragePct,
      api.confidence,
    ));
  }

  for (const table of tableSpecs) {
    lines.push(formatCsvRow(
      "TABLE",
      table.tableName,
      table.sourceLocation,
      table.documentRef ?? "",
      table.relevance,
      table.factCheck.totalGaps,
      table.factCheck.highGaps,
      table.factCheck.coveragePct,
      table.confidence,
    ));
  }

  return BOM + lines.join("\n") + "\n";
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Format a single CSV row, properly escaping fields that contain
 * commas, quotes, or newlines.
 */
function formatCsvRow(
  specType: string,
  name: string,
  sourceLocation: string,
  documentRef: string,
  relevance: string,
  totalGaps: number,
  highGaps: number,
  coveragePct: number,
  confidence: number,
): string {
  return [
    escapeCsv(specType),
    escapeCsv(name),
    escapeCsv(sourceLocation),
    escapeCsv(documentRef),
    escapeCsv(relevance),
    String(totalGaps),
    String(highGaps),
    coveragePct.toFixed(1),
    confidence.toFixed(2),
  ].join(",");
}

/**
 * Escape a CSV field value. Wraps in double quotes if the value
 * contains commas, quotes, or newlines.
 */
function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
