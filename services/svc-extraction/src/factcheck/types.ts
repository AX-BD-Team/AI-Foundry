/**
 * Fact Check Engine — internal types for source-document comparison.
 *
 * These types are used only within svc-extraction's factcheck modules.
 * Shared/persisted types live in packages/types/src/factcheck.ts.
 */

// ── Source-side aggregated structures ──────────────────────────────

export interface SourceApiParam {
  name: string;
  type: string;
  required: boolean;
  annotation?: string;
}

export interface SourceApi {
  path: string;
  httpMethods: string[];
  methodName: string;
  controllerClass: string;
  parameters: SourceApiParam[];
  returnType: string;
  swaggerSummary?: string;
  documentId: string;
  sourceFile: string;
}

export interface SourceTableColumn {
  name: string;
  javaProperty?: string;
  sqlType?: string;
  javaType?: string;
  nullable: boolean;
  isPrimaryKey: boolean;
}

export interface SourceTable {
  tableName: string;
  columns: SourceTableColumn[];
  voClassName?: string;
  source: "ddl" | "mybatis" | "entity";
  documentId: string;
  sourceFile: string;
}

export interface SourceSpec {
  apis: SourceApi[];
  tables: SourceTable[];
  /** CodeTransaction entries from @Transactional service methods */
  transactions: SourceTransaction[];
  /** MyBatis queries from XML mappers */
  queries: SourceQuery[];
  stats: {
    controllerCount: number;
    endpointCount: number;
    tableCount: number;
    mapperCount: number;
  };
}

/** Simplified CodeTransaction for relevance scoring */
export interface SourceTransaction {
  className: string;
  methodName: string;
  isTransactional: boolean;
}

/** Simplified MyBatisQuery for relevance scoring */
export interface SourceQuery {
  id: string;
  queryType: "select" | "insert" | "update" | "delete";
  tables: string[];
}

// ── Document-side extracted structures ─────────────────────────────

export interface DocApiParam {
  name: string;
  type?: string;
  required?: boolean;
}

export interface DocApi {
  path: string;
  httpMethod?: string;
  interfaceId?: string;
  description?: string;
  parameters?: DocApiParam[];
  documentId: string;
  location: string;
}

export interface DocTableColumn {
  name: string;
  dataType?: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  description?: string;
}

export interface DocTable {
  tableName: string;
  columns: DocTableColumn[];
  documentId: string;
  location: string;
}

export interface DocSpec {
  apis: DocApi[];
  tables: DocTable[];
  stats: {
    apiDocCount: number;
    tableDocCount: number;
    totalApis: number;
    totalTables: number;
  };
}
