/**
 * Source Aggregator — fetches source code chunks from svc-ingestion
 * and converts them into a unified SourceSpec for fact-checking.
 *
 * Part of v0.7.4 Pivot Phase 2-B (Fact Check Engine).
 */

import {
  CodeControllerSchema,
  CodeDataModelSchema,
  CodeMapperSchema,
  CodeDdlSchema,
  CodeTransactionSchema,
} from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";
import type {
  SourceSpec,
  SourceApi,
  SourceApiParam,
  SourceTable,
  SourceTableColumn,
  SourceTransaction,
  SourceQuery,
} from "./types.js";
import type { Env } from "../env.js";
import { parseSpringController, parseServiceClass } from "./ast-parser.js";

const logger = createLogger("svc-extraction:source-aggregator");

// ── Constants ────────────────────────────────────────────────────

const FETCH_LIMIT = 500;

const SOURCE_CLASSIFICATIONS = new Set([
  "source_controller",
  "source_data_model",
  "source_vo",
  "source_mapper",
  "source_transaction",
  "source_ddl",
  "source_project",
]);

// ── Internal types for API responses ─────────────────────────────

interface IngestionDocument {
  document_id: string;
  status: string;
  original_name: string;
  file_type: string;
}

interface IngestionChunk {
  chunk_id: string;
  chunk_index: number;
  element_type: string;
  masked_text: string;
  classification: string;
  word_count: number;
}

// ── Main entry point ─────────────────────────────────────────────

export async function aggregateSourceSpec(
  env: Env,
  organizationId: string,
): Promise<SourceSpec> {
  const emptySpec: SourceSpec = {
    apis: [],
    tables: [],
    transactions: [],
    queries: [],
    stats: { controllerCount: 0, endpointCount: 0, tableCount: 0, mapperCount: 0 },
  };

  // 1. Fetch all parsed documents for the organization
  const documents = await fetchParsedDocuments(env, organizationId);
  if (documents.length === 0) {
    logger.info("No parsed documents found", { organizationId });
    return emptySpec;
  }

  // 2. For each document, fetch chunks and filter for source code
  const allApis: SourceApi[] = [];
  const allTables: SourceTable[] = [];
  const allTransactions: SourceTransaction[] = [];
  const allQueries: SourceQuery[] = [];
  // VO class name → CodeDataModel fields (for cross-referencing)
  const voMap = new Map<string, Array<{ name: string; type: string; nullable: boolean }>>();
  let controllerCount = 0;
  let mapperCount = 0;

  for (const doc of documents) {
    const chunks = await fetchChunks(env, doc.document_id);
    if (chunks.length === 0) continue;

    // Check first chunk's classification to decide if this is a source doc
    const firstChunk = chunks[0];
    if (!firstChunk || !SOURCE_CLASSIFICATIONS.has(firstChunk.classification)) {
      continue;
    }

    // ── AST-Priority: try regex-based parsing on raw Java source ──
    const isJavaSource = doc.file_type === "java"
      || doc.original_name.endsWith(".java")
      || firstChunk.classification === "source_controller";

    if (isJavaSource) {
      const astApis = await tryAstParse(env, doc, allApis);
      if (astApis.length > 0) {
        allApis.push(...astApis);
        controllerCount++;
        // AST found endpoints — skip LLM CodeController for this doc to avoid duplication
        // but still process CodeDataModel, CodeMapper, CodeDdl, CodeTransaction from LLM
        for (const chunk of chunks) {
          const parsed = safeParseJson(chunk.masked_text);
          if (!parsed) continue;
          processNonControllerChunk(chunk, parsed, doc, allTables, allTransactions, allQueries, voMap, mapperCount);
        }
        continue;
      }
    }

    // ── Fallback: LLM-extracted structured chunks ──
    for (const chunk of chunks) {
      const parsed = safeParseJson(chunk.masked_text);
      if (!parsed) continue;

      switch (chunk.element_type) {
        case "CodeController": {
          const result = CodeControllerSchema.safeParse(parsed);
          if (!result.success) break;
          const ctrl = result.data;
          controllerCount++;
          for (const ep of ctrl.endpoints) {
            const fullPath = combinePath(ctrl.basePath, ep.path);
            const altPaths = buildAlternativePaths(
              fullPath,
              ep.methodName,
              ctrl.basePath,
            );
            const api: SourceApi = {
              path: fullPath,
              httpMethods: ep.httpMethod,
              methodName: ep.methodName,
              controllerClass: ctrl.className,
              parameters: ep.parameters.map((p) => {
                const param: SourceApiParam = {
                  name: p.name,
                  type: p.type,
                  required: p.required,
                };
                if (p.annotation !== undefined) param.annotation = p.annotation;
                return param;
              }),
              returnType: ep.returnType,
              documentId: doc.document_id,
              sourceFile: ctrl.sourceFile,
            };
            if (ep.swaggerSummary !== undefined) api.swaggerSummary = ep.swaggerSummary;
            if (altPaths.length > 0) api.alternativePaths = altPaths;
            allApis.push(api);
          }
          break;
        }

        case "CodeDataModel": {
          const result = CodeDataModelSchema.safeParse(parsed);
          if (!result.success) break;
          const dm = result.data;
          // Store VO fields for cross-referencing with mapper resultMaps
          const shortName = extractShortClassName(dm.className);
          voMap.set(shortName, dm.fields.map((f) => ({
            name: f.name,
            type: f.type,
            nullable: f.nullable,
          })));
          break;
        }

        case "CodeMapper": {
          const result = CodeMapperSchema.safeParse(parsed);
          if (!result.success) break;
          const mapper = result.data;
          mapperCount++;

          // Each resultMap → a SourceTable
          for (const rm of mapper.resultMaps) {
            const columns: SourceTableColumn[] = rm.columns.map((col) => {
              const c: SourceTableColumn = {
                name: col.column,
                javaProperty: col.property,
                nullable: true,
                isPrimaryKey: col.isPrimaryKey,
              };
              if (col.jdbcType !== undefined) c.sqlType = col.jdbcType;
              if (col.javaType !== undefined) c.javaType = col.javaType;
              return c;
            });

            // Determine table name from queries that reference tables
            // Try to find a query that uses one of the mapper tables
            const tableName = findTableForResultMap(mapper.tables, rm.id, mapper.queries);
            const voShortName = extractShortClassName(rm.type);

            allTables.push({
              tableName: tableName ?? rm.id,
              columns,
              voClassName: voShortName,
              source: "mybatis",
              documentId: doc.document_id,
              sourceFile: mapper.sourceFile,
            });
          }

          // Collect queries for relevance scoring
          for (const q of mapper.queries) {
            allQueries.push({
              id: q.id,
              queryType: q.queryType,
              tables: q.tables,
            });
          }

          // Also add tables from queries that don't have resultMaps
          for (const table of mapper.tables) {
            const alreadyAdded = allTables.some(
              (t) => t.tableName === table && t.documentId === doc.document_id,
            );
            if (!alreadyAdded) {
              // Find column names from queries that reference this table
              const queryColumns = collectQueryColumns(mapper.queries, table);
              allTables.push({
                tableName: table,
                columns: queryColumns.map((c) => ({
                  name: c,
                  nullable: true,
                  isPrimaryKey: false,
                })),
                source: "mybatis",
                documentId: doc.document_id,
                sourceFile: mapper.sourceFile,
              });
            }
          }
          break;
        }

        case "CodeDdl": {
          const result = CodeDdlSchema.safeParse(parsed);
          if (!result.success) break;
          const ddl = result.data;

          allTables.push({
            tableName: ddl.tableName,
            columns: ddl.columns.map((c) => ({
              name: c.name,
              sqlType: c.type,
              nullable: c.nullable,
              isPrimaryKey: c.isPrimaryKey,
            })),
            source: "ddl",
            documentId: doc.document_id,
            sourceFile: ddl.sourceFile,
          });
          break;
        }

        case "CodeTransaction": {
          const result = CodeTransactionSchema.safeParse(parsed);
          if (!result.success) break;
          allTransactions.push({
            className: result.data.className,
            methodName: result.data.methodName,
            isTransactional: result.data.isTransactional,
          });
          break;
        }

        default:
          // Skip non-source element types (SourceProjectSummary, etc.)
          break;
      }
    }
  }

  // 3. Cross-reference VO↔Table: enrich table columns with VO field info
  for (const table of allTables) {
    if (!table.voClassName) continue;
    const voFields = voMap.get(table.voClassName);
    if (!voFields) continue;

    for (const col of table.columns) {
      if (!col.javaProperty) continue;
      const voField = voFields.find((f) => f.name === col.javaProperty);
      if (voField) {
        if (!col.javaType) {
          col.javaType = voField.type;
        }
        col.nullable = voField.nullable;
      }
    }
  }

  // 4. Filter out view controllers with root-only path ("/" → not a REST API)
  const filteredApis = allApis.filter((api) => {
    const trimmed = api.path.replace(/^\/+|\/+$/g, "");
    return trimmed.length > 0;
  });

  // 5. Deduplicate tables by tableName (merge columns from multiple sources)
  const deduplicatedTables = deduplicateTables(allTables);

  const spec: SourceSpec = {
    apis: filteredApis,
    tables: deduplicatedTables,
    transactions: allTransactions,
    queries: allQueries,
    stats: {
      controllerCount,
      endpointCount: filteredApis.length,
      tableCount: deduplicatedTables.length,
      mapperCount,
    },
  };

  logger.info("Source spec aggregated", {
    organizationId,
    documentsScanned: documents.length,
    ...spec.stats,
  });

  return spec;
}

// ── Service binding helpers ──────────────────────────────────────

async function fetchParsedDocuments(
  env: Env,
  organizationId: string,
): Promise<IngestionDocument[]> {
  try {
    const resp = await env.SVC_INGESTION.fetch(
      `http://internal/documents?limit=${FETCH_LIMIT}`,
      {
        headers: {
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
          "X-Organization-Id": organizationId,
        },
      },
    );

    if (!resp.ok) {
      logger.warn("Failed to fetch documents", { status: resp.status });
      return [];
    }

    const body = await resp.json() as {
      success: boolean;
      data: { documents: IngestionDocument[] };
    };

    if (!body.success) return [];

    // Filter for parsed status only
    return body.data.documents.filter((d) => d.status === "parsed");
  } catch (err) {
    logger.error("Error fetching documents", { error: String(err) });
    return [];
  }
}

async function fetchChunks(
  env: Env,
  documentId: string,
): Promise<IngestionChunk[]> {
  try {
    const resp = await env.SVC_INGESTION.fetch(
      `http://internal/documents/${documentId}/chunks`,
      {
        headers: {
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
        },
      },
    );

    if (!resp.ok) {
      logger.warn("Failed to fetch chunks", { documentId, status: resp.status });
      return [];
    }

    const body = await resp.json() as {
      success: boolean;
      data: { chunks: IngestionChunk[] };
    };

    if (!body.success) return [];
    return body.data.chunks;
  } catch (err) {
    logger.error("Error fetching chunks", { documentId, error: String(err) });
    return [];
  }
}

// ── AST-Priority helpers ────────────────────────────────────────

/**
 * Try to parse a Java source file from R2 using the regex-based AST parser.
 * Returns SourceApi[] on success, empty array if the file isn't a Java controller
 * or if R2 download fails (graceful fallback).
 */
async function tryAstParse(
  env: Env,
  doc: IngestionDocument,
  existingApis: SourceApi[],
): Promise<SourceApi[]> {
  try {
    const rawSource = await fetchDocumentContent(env, doc.document_id);
    if (!rawSource) return [];

    const ctrl = parseSpringController(rawSource, doc.original_name);
    if (!ctrl || ctrl.endpoints.length === 0) {
      // Also try service class parsing for call chain info (logged only)
      const services = parseServiceClass(rawSource, doc.original_name);
      if (services.length > 0) {
        logger.info("AST: Service class detected", {
          className: services[0]?.className,
          methods: services.length,
          transactional: services.filter((m) => m.isTransactional).length,
        });
      }
      return [];
    }

    logger.info("AST: Controller parsed directly", {
      className: ctrl.className,
      basePath: ctrl.basePath,
      endpoints: ctrl.endpoints.length,
      source: "ast-parser",
    });

    // Convert to SourceApi[], dedup against existing APIs
    const existingPaths = new Set(existingApis.map((a) => normForDedup(a.path)));
    const newApis: SourceApi[] = [];

    for (const ep of ctrl.endpoints) {
      const fullPath = combinePath(ctrl.basePath, ep.path);
      if (existingPaths.has(normForDedup(fullPath))) continue;

      const altPaths = buildAlternativePaths(fullPath, ep.methodName, ctrl.basePath);
      const api: SourceApi = {
        path: fullPath,
        httpMethods: ep.httpMethod,
        methodName: ep.methodName,
        controllerClass: ctrl.className,
        parameters: ep.parameters.map((p) => {
          const param: SourceApiParam = {
            name: p.name,
            type: p.type,
            required: p.required,
          };
          if (p.annotation !== undefined) param.annotation = p.annotation;
          return param;
        }),
        returnType: ep.returnType,
        documentId: doc.document_id,
        sourceFile: ctrl.sourceFile,
      };
      if (ep.swaggerSummary !== undefined) api.swaggerSummary = ep.swaggerSummary;
      if (altPaths.length > 0) api.alternativePaths = altPaths;
      newApis.push(api);
    }

    return newApis;
  } catch (err) {
    logger.warn("AST parse failed, falling back to LLM", {
      documentId: doc.document_id,
      error: String(err),
    });
    return [];
  }
}

/** Fetch raw file content from R2 via svc-ingestion download endpoint */
async function fetchDocumentContent(env: Env, documentId: string): Promise<string | null> {
  try {
    const resp = await env.SVC_INGESTION.fetch(
      `http://internal/documents/${documentId}/download`,
      {
        headers: {
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
        },
      },
    );

    if (!resp.ok) return null;

    const contentType = resp.headers.get("Content-Type") ?? "";
    // Only process text-based files (Java source code)
    if (!contentType.includes("text") && !contentType.includes("java")
        && !contentType.includes("octet-stream")) {
      return null;
    }

    return await resp.text();
  } catch {
    return null;
  }
}

/**
 * Process non-controller chunks (CodeDataModel, CodeMapper, CodeDdl, CodeTransaction).
 * Used when AST parser handles the controller, but we still need other data from LLM.
 */
function processNonControllerChunk(
  chunk: IngestionChunk,
  parsed: unknown,
  doc: IngestionDocument,
  allTables: SourceTable[],
  allTransactions: SourceTransaction[],
  allQueries: SourceQuery[],
  voMap: Map<string, Array<{ name: string; type: string; nullable: boolean }>>,
  _mapperCount: number,
): void {
  switch (chunk.element_type) {
    case "CodeDataModel": {
      const result = CodeDataModelSchema.safeParse(parsed);
      if (!result.success) break;
      const dm = result.data;
      const shortName = extractShortClassName(dm.className);
      voMap.set(shortName, dm.fields.map((f) => ({
        name: f.name,
        type: f.type,
        nullable: f.nullable,
      })));
      break;
    }
    case "CodeMapper": {
      const result = CodeMapperSchema.safeParse(parsed);
      if (!result.success) break;
      processMapper(result.data, doc, allTables, allQueries);
      break;
    }
    case "CodeDdl": {
      const result = CodeDdlSchema.safeParse(parsed);
      if (!result.success) break;
      allTables.push({
        tableName: result.data.tableName,
        columns: result.data.columns.map((c) => ({
          name: c.name,
          sqlType: c.type,
          nullable: c.nullable,
          isPrimaryKey: c.isPrimaryKey,
        })),
        source: "ddl",
        documentId: doc.document_id,
        sourceFile: result.data.sourceFile,
      });
      break;
    }
    case "CodeTransaction": {
      const result = CodeTransactionSchema.safeParse(parsed);
      if (!result.success) break;
      allTransactions.push({
        className: result.data.className,
        methodName: result.data.methodName,
        isTransactional: result.data.isTransactional,
      });
      break;
    }
    default:
      break;
  }
}

/** Process a CodeMapper into tables and queries */
function processMapper(
  mapper: import("@ai-foundry/types").CodeMapper,
  doc: IngestionDocument,
  allTables: SourceTable[],
  allQueries: SourceQuery[],
): void {
  for (const rm of mapper.resultMaps) {
    const columns: SourceTableColumn[] = rm.columns.map((col) => {
      const c: SourceTableColumn = {
        name: col.column,
        javaProperty: col.property,
        nullable: true,
        isPrimaryKey: col.isPrimaryKey,
      };
      if (col.jdbcType !== undefined) c.sqlType = col.jdbcType;
      if (col.javaType !== undefined) c.javaType = col.javaType;
      return c;
    });

    const tableName = findTableForResultMap(mapper.tables, rm.id, mapper.queries);

    allTables.push({
      tableName: tableName ?? rm.id,
      columns,
      voClassName: extractShortClassName(rm.type),
      source: "mybatis",
      documentId: doc.document_id,
      sourceFile: mapper.sourceFile,
    });
  }

  for (const q of mapper.queries) {
    allQueries.push({
      id: q.id,
      queryType: q.queryType,
      tables: q.tables,
    });
  }

  for (const table of mapper.tables) {
    const alreadyAdded = allTables.some(
      (t) => t.tableName === table && t.documentId === doc.document_id,
    );
    if (!alreadyAdded) {
      const queryColumns = collectQueryColumns(mapper.queries, table);
      allTables.push({
        tableName: table,
        columns: queryColumns.map((c) => ({
          name: c,
          nullable: true,
          isPrimaryKey: false,
        })),
        source: "mybatis",
        documentId: doc.document_id,
        sourceFile: mapper.sourceFile,
      });
    }
  }
}

// ── Pure helpers ─────────────────────────────────────────────────

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Combine controller basePath with endpoint path.
 * Handles leading/trailing slashes and empty paths.
 */
export function combinePath(basePath: string, endpointPath: string): string {
  const base = basePath.replace(/\/+$/, "");
  const ep = endpointPath.replace(/^\/+/, "");
  if (!base) return `/${ep}`;
  if (!ep) return base.startsWith("/") ? base : `/${base}`;
  return `${base.startsWith("/") ? base : `/${base}`}/${ep}`;
}

/**
 * Extract short class name from fully-qualified Java class name.
 * "com.kt.onnuri.model.BalanceVO" → "BalanceVO"
 */
export function extractShortClassName(fqcn: string): string {
  const idx = fqcn.lastIndexOf(".");
  return idx >= 0 ? fqcn.slice(idx + 1) : fqcn;
}

/**
 * Find the most likely table name for a resultMap by checking queries.
 */
function findTableForResultMap(
  tables: string[],
  _resultMapId: string,
  queries: Array<{ tables: string[] }>,
): string | undefined {
  // If there's only one table in the mapper, use it
  if (tables.length === 1) return tables[0];

  // Check which table appears most in queries
  const tableCounts = new Map<string, number>();
  for (const q of queries) {
    for (const t of q.tables) {
      tableCounts.set(t, (tableCounts.get(t) ?? 0) + 1);
    }
  }

  // Return the most-referenced table
  let bestTable: string | undefined;
  let bestCount = 0;
  for (const [table, count] of tableCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestTable = table;
    }
  }
  return bestTable;
}

/**
 * Collect column names from queries that reference a specific table.
 */
function collectQueryColumns(
  queries: Array<{ tables: string[]; columnNames: string[] }>,
  tableName: string,
): string[] {
  const columns = new Set<string>();
  for (const q of queries) {
    if (q.tables.includes(tableName)) {
      for (const col of q.columnNames) {
        columns.add(col);
      }
    }
  }
  return [...columns];
}

/**
 * Build alternative path representations for improved matching.
 *
 * Generates:
 * 1. path + "/" + methodName (when methodName adds a new segment)
 * 2. App-prefix-stripped path (e.g., /onnuripay/v1.0/charge/... → /charge/...)
 * 3. Stripped path + methodName combination
 */
export function buildAlternativePaths(
  fullPath: string,
  methodName: string,
  basePath: string,
): string[] {
  const alts: string[] = [];
  const seen = new Set<string>();
  seen.add(normForDedup(fullPath));

  // Alt 1: path + methodName
  const augmented = combinePath(fullPath, methodName);
  if (!seen.has(normForDedup(augmented))) {
    alts.push(augmented);
    seen.add(normForDedup(augmented));
  }

  // Alt 2: strip app prefix (e.g., /onnuripay/v1.0/charge → /charge)
  const stripped = stripAppPrefix(fullPath);
  if (!seen.has(normForDedup(stripped))) {
    alts.push(stripped);
    seen.add(normForDedup(stripped));
  }

  // Alt 3: stripped + methodName
  if (stripped !== fullPath) {
    const strippedAug = combinePath(stripped, methodName);
    if (!seen.has(normForDedup(strippedAug))) {
      alts.push(strippedAug);
      seen.add(normForDedup(strippedAug));
    }
  }

  // Alt 4: basePath-relative (just endpoint portion from basePath onward)
  const baseNorm = basePath.replace(/^\/+|\/+$/g, "");
  const segments = baseNorm.split("/").filter(Boolean);
  // Use last segment of basePath as domain root (e.g., "charge" from "/onnuripay/v1.0/charge")
  const lastBaseSegment = segments[segments.length - 1];
  if (lastBaseSegment && segments.length > 1) {
    const domainPath = fullPath.slice(
      fullPath.toLowerCase().indexOf(lastBaseSegment.toLowerCase()),
    );
    if (domainPath && domainPath !== fullPath) {
      const domainPathNorm = domainPath.startsWith("/") ? domainPath : `/${domainPath}`;
      if (!seen.has(normForDedup(domainPathNorm))) {
        alts.push(domainPathNorm);
        seen.add(normForDedup(domainPathNorm));
      }
    }
  }

  return alts;
}

/**
 * Strip common app-name + version prefix from a path.
 * Pattern: /appName/vX.Y/rest... → /rest...
 * Also handles: /appName/X.Y/rest...
 */
export function stripAppPrefix(path: string): string {
  // Match /word/vX.Y/ or /word/X.Y/ at the start
  const match = path.match(/^\/[a-z][a-z0-9]*\/(?:v?\d+\.\d+)\/(.*)/i);
  if (match?.[1]) {
    return `/${match[1]}`;
  }
  return path;
}

/** Lowercase + trim for dedup comparison */
function normForDedup(p: string): string {
  return p.toLowerCase().replace(/^\/+|\/+$/g, "");
}

/**
 * Deduplicate tables by tableName, merging columns from multiple sources.
 * Prefers DDL source over MyBatis for column type information.
 */
function deduplicateTables(tables: SourceTable[]): SourceTable[] {
  const tableMap = new Map<string, SourceTable>();

  for (const t of tables) {
    const existing = tableMap.get(t.tableName);
    if (!existing) {
      tableMap.set(t.tableName, { ...t, columns: [...t.columns] });
      continue;
    }

    // Merge columns: add new columns, enrich existing ones
    for (const col of t.columns) {
      const existingCol = existing.columns.find((c) => c.name === col.name);
      if (!existingCol) {
        existing.columns.push({ ...col });
      } else {
        // Enrich with additional info
        if (col.sqlType && !existingCol.sqlType) existingCol.sqlType = col.sqlType;
        if (col.javaType && !existingCol.javaType) existingCol.javaType = col.javaType;
        if (col.javaProperty && !existingCol.javaProperty) existingCol.javaProperty = col.javaProperty;
        if (col.isPrimaryKey) existingCol.isPrimaryKey = true;
      }
    }

    // Prefer DDL source
    if (t.source === "ddl" && existing.source !== "ddl") {
      existing.source = t.source;
      existing.documentId = t.documentId;
      existing.sourceFile = t.sourceFile;
    }

    // Inherit voClassName
    if (t.voClassName && !existing.voClassName) {
      existing.voClassName = t.voClassName;
    }
  }

  return [...tableMap.values()];
}
