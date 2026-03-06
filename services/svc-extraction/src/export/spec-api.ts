/**
 * API Spec JSON Generator — produces ApiSpecEntry[] from SourceSpec,
 * MatchResult, Gaps, and RelevanceCriteria.
 *
 * Output wraps entries in an OpenAPI 3.0 compatible structure.
 *
 * Part of v0.7.4 Phase 2-C.
 */

import type {
  ApiSpecEntry,
  FactCheckRef,
  RelevanceCriteria,
  FactCheckGap,
} from "@ai-foundry/types";
import type { SourceSpec, SourceApi } from "../factcheck/types.js";
import type { MatchResult } from "../factcheck/matcher.js";

// ── Input type ──────────────────────────────────────────────────

export interface ApiSpecGeneratorInput {
  sourceSpec: SourceSpec;
  matchResult: MatchResult;
  gaps: FactCheckGap[];
  relevanceMap: Map<string, RelevanceCriteria>;
}

// ── Main ────────────────────────────────────────────────────────

/**
 * Generate ApiSpecEntry[] from source, match results, gaps, and relevance.
 */
export function generateApiSpec(input: ApiSpecGeneratorInput): ApiSpecEntry[] {
  const entries: ApiSpecEntry[] = [];
  let specCounter = 0;

  for (const api of input.sourceSpec.apis) {
    specCounter++;
    const specId = `spec-api-${String(specCounter).padStart(3, "0")}`;

    // Find matching doc ref
    const docRef = findApiDocRef(api, input.matchResult);

    // Collect gaps for this API
    const apiGaps = collectApiGaps(api, input.gaps);
    const highGaps = apiGaps.filter((g) => g.severity === "HIGH").length;
    const mediumGaps = apiGaps.filter((g) => g.severity === "MEDIUM").length;

    // Build FactCheckRef
    const factCheck: FactCheckRef = {
      totalGaps: apiGaps.length,
      highGaps,
      gapIds: apiGaps.map((g) => g.gapId),
      coveragePct: docRef ? 100 : 0,
    };

    // Get relevance
    const relevanceCriteria = input.relevanceMap.get(api.path);
    const relevance = relevanceCriteria?.relevance ?? "unknown";

    // Calculate confidence
    const confidence = calculateConfidence(highGaps, mediumGaps, !!docRef);

    const httpMethod = api.httpMethods[0] ?? "GET";
    const sourceLocation = `${api.sourceFile}`;

    const entry: ApiSpecEntry = {
      specId,
      endpoint: api.path,
      httpMethod,
      controllerClass: api.controllerClass,
      methodName: api.methodName,
      sourceLocation,
      parameters: api.parameters.map((p) => ({
        name: p.name,
        type: p.type,
        required: p.required,
        ...(p.annotation ? { source: inferParamSource(p.annotation) } : {}),
      })),
      returnType: api.returnType,
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
 * Build an OpenAPI 3.0 compatible wrapper around ApiSpecEntry[].
 */
export function buildOpenApiWrapper(
  entries: ApiSpecEntry[],
  organizationId: string,
  packageId: string,
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const entry of entries) {
    const method = entry.httpMethod.toLowerCase();
    const existing = paths[entry.endpoint];
    const pathObj = existing ?? {};
    if (!existing) {
      paths[entry.endpoint] = pathObj;
    }

    pathObj[method] = {
      "x-specId": entry.specId,
      "x-sourceLocation": entry.sourceLocation,
      "x-relevance": entry.relevance,
      "x-factCheck": {
        totalGaps: entry.factCheck.totalGaps,
        highGaps: entry.factCheck.highGaps,
        coveragePct: entry.factCheck.coveragePct,
      },
      "x-confidence": entry.confidence,
      operationId: entry.methodName,
      summary: `${entry.controllerClass}.${entry.methodName}`,
      parameters: entry.parameters.map((p) => ({
        name: p.name,
        in: p.source ?? "query",
        required: p.required,
        schema: { type: mapJavaTypeToJsonType(p.type) },
      })),
      responses: {
        "200": {
          description: `${entry.returnType} response`,
        },
      },
    };
  }

  return {
    openapi: "3.0.0",
    info: {
      title: `${organizationId} API Spec — AI Foundry Export`,
      version: "1.0.0",
      "x-ai-foundry": {
        packageId,
        organizationId,
        generatedAt: new Date().toISOString(),
      },
    },
    paths,
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function findApiDocRef(api: SourceApi, matchResult: MatchResult): string | undefined {
  for (const matched of matchResult.matchedItems) {
    if (matched.sourceRef.type === "api" && matched.sourceRef.name === api.path && matched.docRef) {
      return matched.docRef.location;
    }
  }
  return undefined;
}

function collectApiGaps(api: SourceApi, gaps: FactCheckGap[]): FactCheckGap[] {
  return gaps.filter((g) => {
    const sourceItem = g.sourceItem;
    try {
      const parsed = JSON.parse(sourceItem) as Record<string, unknown>;
      return parsed["path"] === api.path || parsed["api"] === api.path;
    } catch {
      return sourceItem.includes(api.path);
    }
  });
}

function calculateConfidence(highGaps: number, mediumGaps: number, hasDocRef: boolean): number {
  let confidence = hasDocRef ? 1.0 : 0.5;
  confidence -= highGaps * 0.15;
  confidence -= mediumGaps * 0.05;
  return Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
}

function inferParamSource(annotation: string): "path" | "query" | "body" | "header" {
  const lower = annotation.toLowerCase();
  if (lower.includes("pathvariable") || lower.includes("path")) return "path";
  if (lower.includes("requestbody") || lower.includes("body")) return "body";
  if (lower.includes("requestheader") || lower.includes("header")) return "header";
  return "query";
}

function mapJavaTypeToJsonType(javaType: string): string {
  const lower = javaType.toLowerCase();
  if (lower.includes("string") || lower === "char") return "string";
  if (lower.includes("int") || lower.includes("long") || lower.includes("short")) return "integer";
  if (lower.includes("double") || lower.includes("float") || lower.includes("decimal") || lower.includes("number")) return "number";
  if (lower.includes("bool")) return "boolean";
  if (lower.includes("list") || lower.includes("array") || lower.includes("set")) return "array";
  return "object";
}
