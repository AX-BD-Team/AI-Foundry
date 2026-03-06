/**
 * Table Spec JSON Generator — produces TableSpecEntry[] from SourceSpec,
 * MatchResult, Gaps, and RelevanceCriteria.
 *
 * Part of v0.7.4 Phase 2-C.
 */

import type {
  TableSpecEntry,
  TableColumnSpec,
  FactCheckRef,
  RelevanceCriteria,
  FactCheckGap,
} from "@ai-foundry/types";
import type { SourceSpec, SourceTable, SourceTableColumn } from "../factcheck/types.js";
import type { MatchResult } from "../factcheck/matcher.js";

// ── Input type ──────────────────────────────────────────────────

export interface TableSpecGeneratorInput {
  sourceSpec: SourceSpec;
  matchResult: MatchResult;
  gaps: FactCheckGap[];
  relevanceMap: Map<string, RelevanceCriteria>;
}

// ── Main ────────────────────────────────────────────────────────

/**
 * Generate TableSpecEntry[] from source, match results, gaps, and relevance.
 */
export function generateTableSpec(input: TableSpecGeneratorInput): TableSpecEntry[] {
  const entries: TableSpecEntry[] = [];
  let specCounter = 0;

  for (const table of input.sourceSpec.tables) {
    specCounter++;
    const specId = `spec-tbl-${String(specCounter).padStart(3, "0")}`;

    // Find matching doc ref
    const docRef = findTableDocRef(table, input.matchResult);

    // Collect gaps for this table
    const tableGaps = collectTableGaps(table, input.gaps);
    const highGaps = tableGaps.filter((g) => g.severity === "HIGH").length;
    const mediumGaps = tableGaps.filter((g) => g.severity === "MEDIUM").length;

    // Build FactCheckRef
    const factCheck: FactCheckRef = {
      totalGaps: tableGaps.length,
      highGaps,
      gapIds: tableGaps.map((g) => g.gapId),
      coveragePct: docRef ? 100 : 0,
    };

    // Get relevance
    const relevanceCriteria = input.relevanceMap.get(table.tableName);
    const relevance = relevanceCriteria?.relevance ?? "unknown";

    // Calculate confidence
    const confidence = calculateConfidence(highGaps, mediumGaps, !!docRef);

    // Build columns
    const columns: TableColumnSpec[] = table.columns.map((col) =>
      buildColumnSpec(col),
    );

    const entry: TableSpecEntry = {
      specId,
      tableName: table.tableName,
      sourceLocation: table.sourceFile,
      columns,
      ...(docRef ? { documentRef: docRef } : {}),
      factCheck,
      relevance,
      confidence,
    };

    entries.push(entry);
  }

  return entries;
}

/**
 * Build a Table Spec JSON wrapper for R2 storage.
 */
export function buildTableSpecWrapper(
  entries: TableSpecEntry[],
  organizationId: string,
  packageId: string,
): Record<string, unknown> {
  return {
    version: "1.0.0",
    info: {
      title: `${organizationId} Table Spec — AI Foundry Export`,
      "x-ai-foundry": {
        packageId,
        organizationId,
        generatedAt: new Date().toISOString(),
      },
    },
    tables: entries.map((entry) => ({
      specId: entry.specId,
      tableName: entry.tableName,
      sourceLocation: entry.sourceLocation,
      relevance: entry.relevance,
      confidence: entry.confidence,
      factCheck: {
        totalGaps: entry.factCheck.totalGaps,
        highGaps: entry.factCheck.highGaps,
        coveragePct: entry.factCheck.coveragePct,
      },
      ...(entry.documentRef ? { documentRef: entry.documentRef } : {}),
      columns: entry.columns,
    })),
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function findTableDocRef(table: SourceTable, matchResult: MatchResult): string | undefined {
  for (const matched of matchResult.matchedItems) {
    if (matched.sourceRef.type === "table" && matched.sourceRef.name === table.tableName && matched.docRef) {
      return matched.docRef.location;
    }
  }
  return undefined;
}

function collectTableGaps(table: SourceTable, gaps: FactCheckGap[]): FactCheckGap[] {
  return gaps.filter((g) => {
    const sourceItem = g.sourceItem;
    try {
      const parsed = JSON.parse(sourceItem) as Record<string, unknown>;
      return parsed["tableName"] === table.tableName || parsed["table"] === table.tableName;
    } catch {
      return sourceItem.includes(table.tableName);
    }
  });
}

function calculateConfidence(highGaps: number, mediumGaps: number, hasDocRef: boolean): number {
  let confidence = hasDocRef ? 1.0 : 0.5;
  confidence -= highGaps * 0.15;
  confidence -= mediumGaps * 0.05;
  return Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
}

function buildColumnSpec(col: SourceTableColumn): TableColumnSpec {
  return {
    name: col.name,
    dataType: col.sqlType ?? col.javaType ?? "UNKNOWN",
    nullable: col.nullable,
    isPrimaryKey: col.isPrimaryKey,
    ...(col.javaProperty ? { description: `Java property: ${col.javaProperty}` } : {}),
  };
}
