import { z } from "zod";

// === Source Code Element Types (v0.7.4 Pivot — Phase 2-A) ===

export const HttpMethodSchema = z.enum([
  "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS",
]);

export const CodeParamSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().default(true),
  annotation: z.string().optional(),
  defaultValue: z.string().optional(),
});

export const CodeEndpointSchema = z.object({
  httpMethod: z.array(HttpMethodSchema),
  path: z.string(),
  methodName: z.string(),
  parameters: z.array(CodeParamSchema),
  returnType: z.string(),
  swaggerSummary: z.string().optional(),
  lineNumber: z.number().int().optional(),
});

export const CodeControllerSchema = z.object({
  className: z.string(),
  packageName: z.string(),
  basePath: z.string(),
  swaggerTag: z.string().optional(),
  endpoints: z.array(CodeEndpointSchema),
  sourceFile: z.string(),
});

export const CodeFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().default(true),
  annotation: z.string().optional(),
  comment: z.string().optional(),
});

export const CodeDataModelSchema = z.object({
  className: z.string(),
  packageName: z.string(),
  modelType: z.enum(["vo", "dto", "entity", "request", "response"]),
  fields: z.array(CodeFieldSchema),
  tableName: z.string().optional(),
  sourceFile: z.string(),
});

export const CodeTransactionSchema = z.object({
  className: z.string(),
  methodName: z.string(),
  parameters: z.array(CodeParamSchema),
  returnType: z.string(),
  isTransactional: z.boolean(),
  readOnly: z.boolean().default(false),
  sourceFile: z.string(),
  lineNumber: z.number().int().optional(),
});

export const DdlColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().default(true),
  isPrimaryKey: z.boolean().default(false),
  defaultValue: z.string().optional(),
  comment: z.string().optional(),
});

export const CodeDdlSchema = z.object({
  tableName: z.string(),
  columns: z.array(DdlColumnSchema),
  primaryKey: z.array(z.string()),
  foreignKeys: z.array(z.object({
    column: z.string(),
    refTable: z.string(),
    refColumn: z.string(),
  })),
  sourceFile: z.string(),
});

// === MyBatis XML Mapper Types (v0.7.4 Phase 2-B) ===

export const MyBatisResultColumnSchema = z.object({
  column: z.string(),
  property: z.string(),
  javaType: z.string().optional(),
  jdbcType: z.string().optional(),
  isPrimaryKey: z.boolean().default(false),
});

export const MyBatisResultMapSchema = z.object({
  id: z.string(),
  type: z.string(),
  typeName: z.string(),
  columns: z.array(MyBatisResultColumnSchema),
});

export const MyBatisQuerySchema = z.object({
  id: z.string(),
  queryType: z.enum(["select", "insert", "update", "delete"]),
  tables: z.array(z.string()),
  parameterType: z.string().optional(),
  resultMapRef: z.string().optional(),
  columnNames: z.array(z.string()),
});

export const CodeMapperSchema = z.object({
  namespace: z.string(),
  mapperName: z.string(),
  resultMaps: z.array(MyBatisResultMapSchema),
  queries: z.array(MyBatisQuerySchema),
  tables: z.array(z.string()),
  sourceFile: z.string(),
});

export const SourceAnalysisResultSchema = z.object({
  projectName: z.string(),
  controllers: z.array(CodeControllerSchema),
  dataModels: z.array(CodeDataModelSchema),
  transactions: z.array(CodeTransactionSchema),
  ddlTables: z.array(CodeDdlSchema),
  stats: z.object({
    totalFiles: z.number().int(),
    javaFiles: z.number().int(),
    sqlFiles: z.number().int(),
    controllerCount: z.number().int(),
    endpointCount: z.number().int(),
    dataModelCount: z.number().int(),
    transactionCount: z.number().int(),
    ddlTableCount: z.number().int(),
    mapperCount: z.number().int(),
  }),
});

export type HttpMethod = z.infer<typeof HttpMethodSchema>;
export type CodeParam = z.infer<typeof CodeParamSchema>;
export type CodeEndpoint = z.infer<typeof CodeEndpointSchema>;
export type CodeController = z.infer<typeof CodeControllerSchema>;
export type CodeField = z.infer<typeof CodeFieldSchema>;
export type CodeDataModel = z.infer<typeof CodeDataModelSchema>;
export type CodeTransaction = z.infer<typeof CodeTransactionSchema>;
export type DdlColumn = z.infer<typeof DdlColumnSchema>;
export type CodeDdl = z.infer<typeof CodeDdlSchema>;
export type MyBatisResultColumn = z.infer<typeof MyBatisResultColumnSchema>;
export type MyBatisResultMap = z.infer<typeof MyBatisResultMapSchema>;
export type MyBatisQuery = z.infer<typeof MyBatisQuerySchema>;
export type CodeMapper = z.infer<typeof CodeMapperSchema>;
export type SourceAnalysisResult = z.infer<typeof SourceAnalysisResultSchema>;

// === Spec Export Types (v0.7.4 Phase 2-C) ===

export const ApiParamSpecSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  source: z.enum(["path", "query", "body", "header"]).optional(),
  description: z.string().optional(),
});

export const FactCheckRefSchema = z.object({
  totalGaps: z.number().int(),
  highGaps: z.number().int(),
  gapIds: z.array(z.string()),
  coveragePct: z.number(),
});

export const ApiSpecEntrySchema = z.object({
  specId: z.string(),
  endpoint: z.string(),
  httpMethod: z.string(),
  controllerClass: z.string(),
  methodName: z.string(),
  sourceLocation: z.string(),
  parameters: z.array(ApiParamSpecSchema),
  returnType: z.string(),
  documentRef: z.string().optional(),
  factCheck: FactCheckRefSchema,
  relevance: z.enum(["core", "non-core", "unknown"]),
  confidence: z.number().min(0).max(1),
});

export const TableColumnSpecSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  isPrimaryKey: z.boolean(),
  isForeignKey: z.boolean().optional(),
  foreignKeyRef: z.string().optional(),
  description: z.string().optional(),
});

export const TableSpecEntrySchema = z.object({
  specId: z.string(),
  tableName: z.string(),
  sourceLocation: z.string(),
  columns: z.array(TableColumnSpecSchema),
  documentRef: z.string().optional(),
  factCheck: FactCheckRefSchema,
  relevance: z.enum(["core", "non-core", "unknown"]),
  confidence: z.number().min(0).max(1),
});

export const SpecPackageManifestSchema = z.object({
  packageId: z.string(),
  organizationId: z.string(),
  resultId: z.string().optional(),
  createdAt: z.string(),
  version: z.string().default("1.0.0"),
  stats: z.object({
    totalApis: z.number().int(),
    coreApis: z.number().int(),
    totalTables: z.number().int(),
    coreTables: z.number().int(),
    totalGaps: z.number().int(),
    highGaps: z.number().int(),
    apiCoveragePct: z.number(),
    tableCoveragePct: z.number(),
  }),
  files: z.array(z.object({
    name: z.string(),
    r2Key: z.string(),
    contentType: z.string(),
    sizeBytes: z.number().int(),
  })),
});

export const RelevanceCriteriaSchema = z.object({
  isExternalApi: z.boolean(),
  isCoreEntity: z.boolean(),
  isTransactionCore: z.boolean(),
  score: z.number().int().min(0).max(3),
  relevance: z.enum(["core", "non-core", "unknown"]),
});

export type ApiParamSpec = z.infer<typeof ApiParamSpecSchema>;
export type FactCheckRef = z.infer<typeof FactCheckRefSchema>;
export type ApiSpecEntry = z.infer<typeof ApiSpecEntrySchema>;
export type TableColumnSpec = z.infer<typeof TableColumnSpecSchema>;
export type TableSpecEntry = z.infer<typeof TableSpecEntrySchema>;
export type SpecPackageManifest = z.infer<typeof SpecPackageManifestSchema>;
export type RelevanceCriteria = z.infer<typeof RelevanceCriteriaSchema>;
