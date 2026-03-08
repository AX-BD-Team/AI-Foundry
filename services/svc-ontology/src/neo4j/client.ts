/**
 * Neo4j Query API v2 client.
 * Workers cannot use Bolt protocol — all queries go through the HTTPS Query API.
 *
 * Aura 5.x no longer exposes the HTTP Transaction API (/tx/commit → 403).
 * Instead we use: POST /db/{database}/query/v2
 *
 * NEO4J_URI example: "https://c22f7f0f.databases.neo4j.io"
 * NEO4J_USERNAME: Aura instance username (e.g. "c22f7f0f")
 * NEO4J_DATABASE: Aura database name (e.g. "c22f7f0f")
 */

import type { Env } from "../env.js";

export interface Neo4jStatement {
  statement: string;
  parameters?: Record<string, unknown>;
}

export interface Neo4jError {
  code: string;
  message: string;
}

// ── Query API v2 response ───────────────────────────────────────────

interface QueryApiData {
  fields: string[];
  values: unknown[][];
}

interface QueryApiResponse {
  data: QueryApiData;
  bookmarks?: string[];
  counters?: Record<string, number>;
}

interface QueryApiErrorResponse {
  errors: Neo4jError[];
}

// ── Public types (kept compatible with callers) ─────────────────────

export interface Neo4jResultRow {
  row: unknown[];
  meta: unknown[];
}

export interface Neo4jResult {
  columns: string[];
  data: Neo4jResultRow[];
}

export interface Neo4jResponse {
  results: Neo4jResult[];
  errors: Neo4jError[];
}

// ── Internal: execute a single Cypher statement ─────────────────────

async function executeOne(
  env: Env,
  stmt: Neo4jStatement,
): Promise<{ result: Neo4jResult; errors: Neo4jError[] }> {
  const auth = btoa(`${env.NEO4J_USERNAME}:${env.NEO4J_PASSWORD}`);
  const url = `${env.NEO4J_URI}/db/${env.NEO4J_DATABASE}/query/v2`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      statement: stmt.statement,
      parameters: stmt.parameters ?? {},
    }),
  });

  // 4xx/5xx with JSON error body
  if (!response.ok) {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as QueryApiErrorResponse;
      if (parsed.errors) {
        return {
          result: { columns: [], data: [] },
          errors: parsed.errors,
        };
      }
    } catch {
      // not JSON
    }
    throw new Error(`Neo4j HTTP error: ${response.status} ${text.slice(0, 200)}`);
  }

  const body = (await response.json()) as QueryApiResponse;

  // Convert Query API v2 response → Neo4jResult shape
  const result: Neo4jResult = {
    columns: body.data.fields,
    data: body.data.values.map((row) => ({ row, meta: [] })),
  };

  return { result, errors: [] };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Execute one or more Cypher statements against Neo4j via Query API v2.
 * Statements are executed sequentially (Query API is single-statement).
 * Returns a combined response compatible with callers that expect Neo4jResponse.
 */
export async function neo4jQuery(
  env: Env,
  statements: Neo4jStatement[],
): Promise<Neo4jResponse> {
  const results: Neo4jResult[] = [];
  const errors: Neo4jError[] = [];

  for (const stmt of statements) {
    const { result, errors: stmtErrors } = await executeOne(env, stmt);
    results.push(result);
    errors.push(...stmtErrors);
  }

  return { results, errors };
}

// ── 프로세스 정밀분석 그래프 입력 타입 ─────────────────────────────────

export interface AnalysisGraphInput {
  analysisId: string;
  documentId: string;
  organizationId: string;
  processNodes: Array<{
    name: string;
    category: "mega" | "core" | "supporting" | "peripheral";
    importanceScore: number;
    isCore: boolean;
  }>;
  subProcessEdges: Array<{
    parentProcessName: string;
    subProcessName: string;
  }>;
  methodNodes: Array<{
    processName: string;
    methodName: string;
    triggerCondition: string;
  }>;
  actorNodes: Array<{
    actorName: string;
    processName: string;
  }>;
  findingNodes: Array<{
    findingId: string;
    type: string;
    severity: string;
    finding: string;
    relatedProcesses: string[];
  }>;
  requirements?: Array<{
    requirementId: string;
    name: string;
    description?: string;
    source?: string; // document ID or reference
    satisfiedBy: string[]; // process names
  }>;
}

/**
 * 프로세스 정밀분석 결과를 Neo4j에 upsert한다.
 *
 * 신규 노드 6종:
 * - SubProcess → (Process)-[:HAS_SUBPROCESS]->(SubProcess)
 * - Method     → (Process)-[:HAS_METHOD]->(Method)
 * - Condition  → (Method)-[:TRIGGERED_BY]->(Condition)
 * - Actor      → (Actor)-[:PARTICIPATES_IN]->(Process)
 * - Requirement → (Requirement)-[:SATISFIED_BY]->(Process)
 * - DiagnosisFinding → (DiagnosisFinding)-[:RELATES_TO]->(Process|Entity)
 *
 * 실패 시 graceful degradation (호출부에서 catch 필수).
 */
export async function upsertAnalysisGraph(
  env: Env,
  input: AnalysisGraphInput,
): Promise<Neo4jResponse> {
  const statements: Neo4jStatement[] = [];

  // 1. Process 노드 upsert (ScoredProcess 메타 추가)
  for (const p of input.processNodes) {
    statements.push({
      statement:
        "MERGE (p:Process {name: $name, documentId: $documentId}) " +
        "SET p.category = $category, p.importanceScore = $importanceScore, " +
        "    p.isCore = $isCore, p.analysisId = $analysisId, " +
        "    p.organizationId = $organizationId",
      parameters: {
        name: p.name,
        documentId: input.documentId,
        category: p.category,
        importanceScore: p.importanceScore,
        isCore: p.isCore,
        analysisId: input.analysisId,
        organizationId: input.organizationId,
      } as Record<string, unknown>,
    });
  }

  // 2. SubProcess 노드 + (Process)-[:HAS_SUBPROCESS]->(SubProcess) 관계
  for (const edge of input.subProcessEdges) {
    statements.push({
      statement:
        "MERGE (parent:Process {name: $parentName, documentId: $documentId}) " +
        "SET parent.organizationId = $organizationId " +
        "MERGE (sub:SubProcess {name: $subName, documentId: $documentId}) " +
        "SET sub.organizationId = $organizationId " +
        "MERGE (parent)-[:HAS_SUBPROCESS]->(sub)",
      parameters: {
        parentName: edge.parentProcessName,
        subName: edge.subProcessName,
        documentId: input.documentId,
        organizationId: input.organizationId,
      } as Record<string, unknown>,
    });
  }

  // 3. Method 노드 + (Process)-[:HAS_METHOD]->(Method) 관계
  //    Condition 노드 + (Method)-[:TRIGGERED_BY]->(Condition) 관계
  for (const m of input.methodNodes) {
    statements.push({
      statement:
        "MERGE (p:Process {name: $processName, documentId: $documentId}) " +
        "MERGE (m:Method {name: $methodName, processName: $processName, documentId: $documentId}) " +
        "SET m.triggerCondition = $triggerCondition, m.organizationId = $organizationId " +
        "MERGE (p)-[:HAS_METHOD]->(m) " +
        "WITH m " +
        "MERGE (c:Condition {description: $triggerCondition, documentId: $documentId}) " +
        "SET c.organizationId = $organizationId " +
        "MERGE (m)-[:TRIGGERED_BY]->(c)",
      parameters: {
        processName: m.processName,
        methodName: m.methodName,
        triggerCondition: m.triggerCondition,
        documentId: input.documentId,
        organizationId: input.organizationId,
      } as Record<string, unknown>,
    });
  }

  // 4. Actor 노드 + (Actor)-[:PARTICIPATES_IN]->(Process) 관계
  for (const a of input.actorNodes) {
    statements.push({
      statement:
        "MERGE (actor:Actor {name: $actorName, documentId: $documentId}) " +
        "SET actor.organizationId = $organizationId " +
        "MERGE (p:Process {name: $processName, documentId: $documentId}) " +
        "MERGE (actor)-[:PARTICIPATES_IN]->(p)",
      parameters: {
        actorName: a.actorName,
        processName: a.processName,
        documentId: input.documentId,
        organizationId: input.organizationId,
      } as Record<string, unknown>,
    });
  }

  // 5. DiagnosisFinding 노드 + (DiagnosisFinding)-[:RELATES_TO]->(Process) 관계
  for (const f of input.findingNodes) {
    statements.push({
      statement:
        "MERGE (df:DiagnosisFinding {findingId: $findingId}) " +
        "SET df.type = $type, df.severity = $severity, df.finding = $finding, " +
        "    df.analysisId = $analysisId, df.organizationId = $organizationId",
      parameters: {
        findingId: f.findingId,
        type: f.type,
        severity: f.severity,
        finding: f.finding,
        analysisId: input.analysisId,
        organizationId: input.organizationId,
      } as Record<string, unknown>,
    });

    // RELATES_TO 관계 — 관련 프로세스별
    for (const processName of f.relatedProcesses) {
      statements.push({
        statement:
          "MATCH (df:DiagnosisFinding {findingId: $findingId}) " +
          "MERGE (p:Process {name: $processName, documentId: $documentId}) " +
          "MERGE (df)-[:RELATES_TO]->(p)",
        parameters: {
          findingId: f.findingId,
          processName,
          documentId: input.documentId,
        } as Record<string, unknown>,
      });
    }
  }

  // 6. Requirement 노드 + (Requirement)-[:SATISFIED_BY]->(Process) 관계
  if (input.requirements?.length) {
    for (const req of input.requirements) {
      statements.push({
        statement:
          "MERGE (r:Requirement {requirementId: $reqId}) " +
          "SET r.name = $name, r.description = $desc, r.source = $source, " +
          "    r.analysisId = $analysisId, r.organizationId = $organizationId",
        parameters: {
          reqId: req.requirementId,
          name: req.name,
          desc: req.description ?? "",
          source: req.source ?? "",
          analysisId: input.analysisId,
          organizationId: input.organizationId,
        } as Record<string, unknown>,
      });

      // SATISFIED_BY 관계 — 관련 프로세스별
      for (const processName of req.satisfiedBy) {
        statements.push({
          statement:
            "MATCH (r:Requirement {requirementId: $reqId}) " +
            "MERGE (p:Process {name: $processName, documentId: $documentId}) " +
            "MERGE (r)-[:SATISFIED_BY]->(p)",
          parameters: {
            reqId: req.requirementId,
            processName,
            documentId: input.documentId,
          } as Record<string, unknown>,
        });
      }
    }
  }

  if (statements.length === 0) {
    return { results: [], errors: [] };
  }

  return neo4jQuery(env, statements);
}
