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
export type SourceAnalysisResult = z.infer<typeof SourceAnalysisResultSchema>;
