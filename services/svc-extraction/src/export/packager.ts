/**
 * Package Assembler — assembles all spec outputs into an R2 package
 * and records metadata in D1.
 *
 * Package structure in R2:
 *   spec-packages/{orgId}/{packageId}/
 *     ├── manifest.json
 *     ├── spec-api.json
 *     ├── spec-table.json
 *     ├── fact-check-report.md
 *     └── spec-summary.csv
 *
 * Part of v0.7.4 Phase 2-C.
 */

import type { ApiSpecEntry, TableSpecEntry, SpecPackageManifest } from "@ai-foundry/types";
import type { Env } from "../env.js";
import { buildOpenApiWrapper } from "./spec-api.js";
import { buildTableSpecWrapper } from "./spec-table.js";

// ── Main ────────────────────────────────────────────────────────

/**
 * Assemble all spec outputs into an R2 package and record in D1.
 */
export async function assembleAndStore(
  env: Env,
  organizationId: string,
  resultId: string | undefined,
  apiSpecs: ApiSpecEntry[],
  tableSpecs: TableSpecEntry[],
  reportMarkdown: string,
  csvSummary: string,
): Promise<SpecPackageManifest> {
  const packageId = `pkg-${crypto.randomUUID().slice(0, 8)}`;
  const prefix = `spec-packages/${organizationId}/${packageId}`;

  const files: SpecPackageManifest["files"] = [];

  // 1. Store API Spec JSON
  const apiJson = JSON.stringify(
    buildOpenApiWrapper(apiSpecs, organizationId, packageId),
    null,
    2,
  );
  await env.R2_SPEC_PACKAGES.put(`${prefix}/spec-api.json`, apiJson, {
    httpMetadata: { contentType: "application/json" },
  });
  files.push({
    name: "spec-api.json",
    r2Key: `${prefix}/spec-api.json`,
    contentType: "application/json",
    sizeBytes: new Blob([apiJson]).size,
  });

  // 2. Store Table Spec JSON
  const tableJson = JSON.stringify(
    buildTableSpecWrapper(tableSpecs, organizationId, packageId),
    null,
    2,
  );
  await env.R2_SPEC_PACKAGES.put(`${prefix}/spec-table.json`, tableJson, {
    httpMetadata: { contentType: "application/json" },
  });
  files.push({
    name: "spec-table.json",
    r2Key: `${prefix}/spec-table.json`,
    contentType: "application/json",
    sizeBytes: new Blob([tableJson]).size,
  });

  // 3. Store Fact Check Report (Markdown)
  await env.R2_SPEC_PACKAGES.put(`${prefix}/fact-check-report.md`, reportMarkdown, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
  });
  files.push({
    name: "fact-check-report.md",
    r2Key: `${prefix}/fact-check-report.md`,
    contentType: "text/markdown",
    sizeBytes: new Blob([reportMarkdown]).size,
  });

  // 4. Store CSV Summary
  await env.R2_SPEC_PACKAGES.put(`${prefix}/spec-summary.csv`, csvSummary, {
    httpMetadata: { contentType: "text/csv; charset=utf-8" },
  });
  files.push({
    name: "spec-summary.csv",
    r2Key: `${prefix}/spec-summary.csv`,
    contentType: "text/csv",
    sizeBytes: new Blob([csvSummary]).size,
  });

  // 5. Compute stats
  const coreApis = apiSpecs.filter((a) => a.relevance === "core").length;
  const coreTables = tableSpecs.filter((t) => t.relevance === "core").length;

  const allApiGaps = apiSpecs.reduce((sum, a) => sum + a.factCheck.totalGaps, 0);
  const allTableGaps = tableSpecs.reduce((sum, t) => sum + t.factCheck.totalGaps, 0);
  const totalGaps = allApiGaps + allTableGaps;

  const allApiHighGaps = apiSpecs.reduce((sum, a) => sum + a.factCheck.highGaps, 0);
  const allTableHighGaps = tableSpecs.reduce((sum, t) => sum + t.factCheck.highGaps, 0);
  const highGaps = allApiHighGaps + allTableHighGaps;

  const apisWithDoc = apiSpecs.filter((a) => a.documentRef !== undefined).length;
  const tablesWithDoc = tableSpecs.filter((t) => t.documentRef !== undefined).length;
  const apiCoveragePct = apiSpecs.length > 0
    ? Math.round((apisWithDoc / apiSpecs.length) * 1000) / 10
    : 0;
  const tableCoveragePct = tableSpecs.length > 0
    ? Math.round((tablesWithDoc / tableSpecs.length) * 1000) / 10
    : 0;

  // 6. Build manifest
  const manifest: SpecPackageManifest = {
    packageId,
    organizationId,
    ...(resultId !== undefined ? { resultId } : {}),
    createdAt: new Date().toISOString(),
    version: "1.0.0",
    stats: {
      totalApis: apiSpecs.length,
      coreApis,
      totalTables: tableSpecs.length,
      coreTables,
      totalGaps,
      highGaps,
      apiCoveragePct,
      tableCoveragePct,
    },
    files,
  };

  // 7. Store manifest
  const manifestJson = JSON.stringify(manifest, null, 2);
  await env.R2_SPEC_PACKAGES.put(`${prefix}/manifest.json`, manifestJson, {
    httpMetadata: { contentType: "application/json" },
  });

  // 8. Record in D1
  await env.DB_EXTRACTION.prepare(
    `INSERT INTO spec_packages
     (package_id, organization_id, result_id, r2_prefix, manifest_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
  )
    .bind(packageId, organizationId, resultId ?? null, prefix, manifestJson, manifest.createdAt)
    .run();

  return manifest;
}
