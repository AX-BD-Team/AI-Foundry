import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../env.js";

// ── Mock LLM caller ──────────────────────────────────────────────

vi.mock("../llm/caller.js", () => ({
  callLlm: vi.fn().mockResolvedValue(
    JSON.stringify({
      scoredProcesses: [
        {
          name: "퇴직연금 신청",
          description: "신청 절차",
          steps: ["접수", "심사", "승인"],
          importanceScore: 0.85,
          importanceReason: "핵심 업무 프로세스",
          referenceCount: 5,
          dependencyCount: 3,
          isCore: true,
          category: "core",
        },
      ],
      coreJudgments: [
        {
          processName: "퇴직연금 신청",
          isCore: true,
          score: 0.85,
          factors: {
            frequencyScore: 0.8,
            dependencyScore: 0.9,
            domainRelevanceScore: 0.85,
            dataFlowCentrality: 0.7,
          },
          reasoning: "퇴직연금 핵심 업무",
        },
      ],
      processTree: [],
      findings: [
        {
          findingId: "temp-1",
          type: "missing",
          severity: "critical",
          finding: "중도인출 프로세스에 퇴직급여 산정 단계가 누락",
          evidence: "프로세스정의서 3.2에 명시",
          recommendation: "화면 SC-045에 산정 단계 추가",
          sourceDocumentIds: ["doc-1"],
          relatedProcesses: ["퇴직연금 신청"],
          relatedEntities: [],
          confidence: 0.9,
        },
      ],
    }),
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────

/**
 * D1 mock 생성 — 개별 쿼리 결과를 SQL 패턴으로 분기할 수 있는 확장형 mock.
 *
 * `queryMap`에 SQL 키워드 → 반환값을 매핑하면,
 * prepare().bind().first()/all() 호출 시 매칭되는 결과를 반환한다.
 */
function createDb(queryMap: Record<string, { first?: unknown; all?: unknown[]; runMeta?: Record<string, unknown> }> = {}) {
  const prepare = vi.fn().mockImplementation((sql: string) => {
    // queryMap에서 매칭되는 키 찾기
    let matched: { first?: unknown; all?: unknown[]; runMeta?: Record<string, unknown> } | undefined;
    for (const [key, value] of Object.entries(queryMap)) {
      if (sql.includes(key)) {
        matched = value;
        break;
      }
    }

    const firstResult = matched?.first ?? null;
    const allResults = matched?.all ?? [];
    const runMeta = matched?.runMeta ?? { rows_written: 1 };

    return {
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(firstResult),
        all: vi.fn().mockResolvedValue({ results: allResults }),
        run: vi.fn().mockResolvedValue({ success: true, meta: runMeta }),
      }),
    };
  });

  return { prepare } as unknown as D1Database;
}

function mockEnv(db?: D1Database): Env {
  return {
    DB_EXTRACTION: db ?? createDb(),
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    SECURITY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { allowed: true } }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    LLM_ROUTER: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { content: "{}" } }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    SVC_INGESTION: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ chunks: [] }), { status: 200 }),
      ),
    } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-extraction",
    INTERNAL_API_SECRET: "test-secret",
    R2_SPEC_PACKAGES: {} as unknown as R2Bucket,
  };
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

function authHeaders(): Record<string, string> {
  return { "X-Internal-Secret": "test-secret" };
}

function jsonReq(
  url: string,
  body: unknown,
  method = "POST",
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...headers },
    body: JSON.stringify(body),
  });
}

// ── Sample data ──────────────────────────────────────────────────

const sampleSummaryJson = JSON.stringify({
  documentId: "doc-1",
  organizationId: "org-1",
  extractionId: "ext-1",
  counts: { processes: 3, entities: 2, rules: 1, relationships: 2 },
  processes: [
    {
      name: "퇴직연금 신청",
      description: "신청 절차",
      steps: ["접수", "심사"],
      importanceScore: 0.85,
      importanceReason: "핵심 업무",
      referenceCount: 5,
      dependencyCount: 3,
      isCore: true,
      category: "core",
    },
  ],
  entities: [
    {
      name: "퇴직연금계좌",
      type: "account",
      attributes: ["계좌번호"],
      usageCount: 3,
      isOrphan: false,
    },
  ],
  documentClassification: "general",
  analysisTimestamp: "2026-03-01T00:00:00.000Z",
});

const sampleCoreJson = JSON.stringify({
  documentId: "doc-1",
  organizationId: "org-1",
  coreProcesses: [
    {
      processName: "퇴직연금 신청",
      isCore: true,
      score: 0.85,
      factors: {
        frequencyScore: 0.8,
        dependencyScore: 0.9,
        domainRelevanceScore: 0.85,
        dataFlowCentrality: 0.7,
      },
      reasoning: "핵심 업무 프로세스",
    },
  ],
  processTree: [],
  summary: {
    megaProcessCount: 0,
    coreProcessCount: 1,
    supportingProcessCount: 0,
    peripheralProcessCount: 0,
  },
});

const sampleFindingRow = {
  finding_id: "f8e1d7c6-b5a4-4e3d-9c2b-1a0f8e7d6c5b",
  analysis_id: "ana-1",
  document_id: "doc-1",
  organization_id: "org-1",
  type: "missing",
  severity: "critical",
  finding: "중도인출 프로세스에 퇴직급여 산정 단계가 누락",
  evidence: "프로세스정의서 3.2에 명시",
  recommendation: "화면 SC-045에 산정 단계 추가",
  related_processes: JSON.stringify(["퇴직연금 신청"]),
  related_entities: null,
  source_document_ids: JSON.stringify(["doc-1"]),
  confidence: 0.9,
  hitl_status: "pending",
  reviewer_id: null,
  reviewer_comment: null,
  reviewed_at: null,
  created_at: "2026-03-01T00:00:00.000Z",
};

// ── Tests via index.ts router ─────────────────────────────────────

describe("analysis routes (via index.ts router)", () => {
  let worker: ExportedHandler<Env>;

  beforeEach(async () => {
    const module = await import("../index.js");
    worker = module.default;
    vi.clearAllMocks();
  });

  // ── Auth ──────────────────────────────────────────────────────

  describe("authentication", () => {
    it("returns 401 for GET /analysis/:docId/summary without X-Internal-Secret", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/doc-1/summary");

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(401);
    });

    it("returns 401 for POST /analyze without X-Internal-Secret", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analyze", { method: "POST" });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(401);
    });

    it("returns 401 with wrong X-Internal-Secret for analysis routes", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/doc-1/findings", {
        headers: { "X-Internal-Secret": "wrong-secret" },
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(401);
    });
  });

  // ── GET /analysis/:documentId/summary ───────────────────────────

  describe("GET /analysis/:documentId/summary", () => {
    it("returns 200 with valid summary data", async () => {
      const db = createDb({
        "summary_json": {
          first: { summary_json: sampleSummaryJson, llm_provider: "anthropic", llm_model: "claude-sonnet-4-6" },
        },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/doc-1/summary", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: { documentId: string; organizationId: string; counts: { processes: number }; llmProvider: string; llmModel: string };
      };
      expect(body.success).toBe(true);
      expect(body.data.documentId).toBe("doc-1");
      expect(body.data.organizationId).toBe("org-1");
      expect(body.data.counts.processes).toBe(3);
      expect(body.data.llmProvider).toBe("anthropic");
      expect(body.data.llmModel).toBe("claude-sonnet-4-6");
    });

    it("returns 404 for non-existent document", async () => {
      const db = createDb({
        "summary_json": { first: null },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/doc-999/summary", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(404);
      const body = await res.json() as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns 500 when summary_json fails schema validation", async () => {
      const db = createDb({
        "summary_json": {
          first: { summary_json: JSON.stringify({ invalidField: true }), llm_provider: null, llm_model: null },
        },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/doc-1/summary", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(500);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.success).toBe(false);
      expect(body.error.message).toContain("Invalid analysis data");
    });
  });

  // ── GET /analysis/:documentId/core-processes ────────────────────

  describe("GET /analysis/:documentId/core-processes", () => {
    it("returns 200 with valid core identification data", async () => {
      const db = createDb({
        "SELECT core_identification_json FROM analyses": {
          first: { core_identification_json: sampleCoreJson },
        },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/doc-1/core-processes", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: {
          documentId: string;
          coreProcesses: Array<{ processName: string; isCore: boolean }>;
          summary: { coreProcessCount: number };
        };
      };
      expect(body.success).toBe(true);
      expect(body.data.documentId).toBe("doc-1");
      expect(body.data.coreProcesses).toHaveLength(1);
      expect(body.data.coreProcesses[0]?.isCore).toBe(true);
      expect(body.data.summary.coreProcessCount).toBe(1);
    });

    it("returns 404 for non-existent document", async () => {
      const db = createDb({
        "SELECT core_identification_json FROM analyses": { first: null },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/doc-999/core-processes", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(404);
    });
  });

  // ── GET /analysis/:documentId/findings ──────────────────────────

  describe("GET /analysis/:documentId/findings", () => {
    it("returns 200 with findings and aggregation", async () => {
      const db = createDb({
        "SELECT analysis_id": {
          first: {
            analysis_id: "ana-1",
            extraction_id: "ext-1",
            organization_id: "org-1",
            created_at: "2026-03-01T00:00:00.000Z",
          },
        },
        "SELECT * FROM diagnosis_findings": {
          all: [
            sampleFindingRow,
            {
              ...sampleFindingRow,
              finding_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
              type: "duplicate",
              severity: "warning",
              finding: "중복 프로세스 발견",
              confidence: 0.7,
            },
          ],
        },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/doc-1/findings", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: {
          diagnosisId: string;
          documentId: string;
          findings: Array<{ findingId: string; type: string }>;
          summary: {
            totalFindings: number;
            byType: { missing: number; duplicate: number };
            bySeverity: { critical: number; warning: number };
          };
        };
      };
      expect(body.success).toBe(true);
      expect(body.data.diagnosisId).toBe("ana-1");
      expect(body.data.documentId).toBe("doc-1");
      expect(body.data.findings).toHaveLength(2);
      expect(body.data.summary.totalFindings).toBe(2);
      expect(body.data.summary.byType.missing).toBe(1);
      expect(body.data.summary.byType.duplicate).toBe(1);
      expect(body.data.summary.bySeverity.critical).toBe(1);
      expect(body.data.summary.bySeverity.warning).toBe(1);
    });

    it("returns 404 when no analysis exists for the document", async () => {
      const db = createDb({
        "SELECT analysis_id": { first: null },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/doc-999/findings", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(404);
    });

    it("returns 200 with empty findings when no diagnosis_findings exist", async () => {
      const db = createDb({
        "SELECT analysis_id": {
          first: {
            analysis_id: "ana-1",
            extraction_id: "ext-1",
            organization_id: "org-1",
            created_at: "2026-03-01T00:00:00.000Z",
          },
        },
        "SELECT * FROM diagnosis_findings": { all: [] },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/doc-1/findings", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: {
          findings: unknown[];
          summary: {
            totalFindings: number;
            byType: { missing: number; duplicate: number; overspec: number; inconsistency: number };
          };
        };
      };
      expect(body.data.findings).toHaveLength(0);
      expect(body.data.summary.totalFindings).toBe(0);
      expect(body.data.summary.byType.missing).toBe(0);
      expect(body.data.summary.byType.duplicate).toBe(0);
      expect(body.data.summary.byType.overspec).toBe(0);
      expect(body.data.summary.byType.inconsistency).toBe(0);
    });
  });

  // ── GET /analysis/:documentId/findings/:findingId ───────────────

  describe("GET /analysis/:documentId/findings/:findingId", () => {
    it("returns 200 with single finding detail", async () => {
      const db = createDb({
        "SELECT * FROM diagnosis_findings WHERE finding_id": {
          first: sampleFindingRow,
        },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request(
        "https://test.internal/analysis/doc-1/findings/f8e1d7c6-b5a4-4e3d-9c2b-1a0f8e7d6c5b",
        { headers: authHeaders() },
      );

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: {
          findingId: string;
          type: string;
          severity: string;
          finding: string;
          confidence: number;
          hitlStatus: string;
        };
      };
      expect(body.success).toBe(true);
      expect(body.data.findingId).toBe("f8e1d7c6-b5a4-4e3d-9c2b-1a0f8e7d6c5b");
      expect(body.data.type).toBe("missing");
      expect(body.data.severity).toBe("critical");
      expect(body.data.confidence).toBe(0.9);
      expect(body.data.hitlStatus).toBe("pending");
    });

    it("returns 404 for non-existent finding", async () => {
      const db = createDb({
        "SELECT * FROM diagnosis_findings WHERE finding_id": { first: null },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request(
        "https://test.internal/analysis/doc-1/findings/non-existent-id",
        { headers: authHeaders() },
      );

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(404);
    });

    it("handles finding with null optional fields (related_entities, reviewer)", async () => {
      const db = createDb({
        "SELECT * FROM diagnosis_findings WHERE finding_id": {
          first: {
            ...sampleFindingRow,
            related_entities: null,
            reviewer_id: null,
            reviewer_comment: null,
            reviewed_at: null,
          },
        },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request(
        "https://test.internal/analysis/doc-1/findings/f8e1d7c6-b5a4-4e3d-9c2b-1a0f8e7d6c5b",
        { headers: authHeaders() },
      );

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: {
          relatedProcesses: string[];
          relatedEntities?: string[];
          reviewerComment?: string;
          reviewedBy?: string;
        };
      };
      expect(body.data.relatedProcesses).toEqual(["퇴직연금 신청"]);
      // relatedEntities should not be present when null
      expect(body.data.relatedEntities).toBeUndefined();
      expect(body.data.reviewerComment).toBeUndefined();
      expect(body.data.reviewedBy).toBeUndefined();
    });
  });

  // ── POST /analysis/:documentId/findings/:findingId/review ───────

  describe("POST /analysis/:documentId/findings/:findingId/review", () => {
    it("accepts a finding and updates hitl_status to accepted", async () => {
      const db = createDb({
        "UPDATE diagnosis_findings": { runMeta: { rows_written: 1 } },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = jsonReq(
        "https://test.internal/analysis/doc-1/findings/finding-1/review",
        { action: "accept", comment: "검토 완료", reviewerId: "reviewer-1" },
      );

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: { findingId: string; hitlStatus: string; reviewedAt: string };
      };
      expect(body.success).toBe(true);
      expect(body.data.findingId).toBe("finding-1");
      expect(body.data.hitlStatus).toBe("accepted");
      expect(body.data.reviewedAt).toBeDefined();
    });

    it("rejects a finding and updates hitl_status to rejected", async () => {
      const db = createDb({
        "UPDATE diagnosis_findings": { runMeta: { rows_written: 1 } },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = jsonReq(
        "https://test.internal/analysis/doc-1/findings/finding-1/review",
        { action: "reject", comment: "부적절한 소견", reviewerId: "reviewer-1" },
      );

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: { hitlStatus: string };
      };
      expect(body.data.hitlStatus).toBe("rejected");
    });

    it("modifies a finding and updates hitl_status to modified", async () => {
      const db = createDb({
        "UPDATE diagnosis_findings": { runMeta: { rows_written: 1 } },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = jsonReq(
        "https://test.internal/analysis/doc-1/findings/finding-1/review",
        { action: "modify", comment: "내용 수정 필요", reviewerId: "reviewer-1" },
      );

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: { hitlStatus: string };
      };
      expect(body.data.hitlStatus).toBe("modified");
    });

    it("returns 404 when updating a non-existent finding (rows_written=0)", async () => {
      const db = createDb({
        "UPDATE diagnosis_findings": { runMeta: { rows_written: 0 } },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = jsonReq(
        "https://test.internal/analysis/doc-1/findings/non-existent/review",
        { action: "accept", reviewerId: "reviewer-1" },
      );

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid action value", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = jsonReq(
        "https://test.internal/analysis/doc-1/findings/finding-1/review",
        { action: "invalid", reviewerId: "reviewer-1" },
      );

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.error.message).toContain("action must be");
    });

    it("returns 400 when reviewerId is missing", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = jsonReq(
        "https://test.internal/analysis/doc-1/findings/finding-1/review",
        { action: "accept" },
      );

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.error.message).toContain("reviewerId");
    });

    it("returns 400 for non-JSON request body", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = new Request(
        "https://test.internal/analysis/doc-1/findings/finding-1/review",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: "not valid json{",
        },
      );

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.error.message).toContain("valid JSON");
    });
  });

  // ── POST /analyze ──────────────────────────────────────────────

  describe("POST /analyze", () => {
    it("triggers 3-Pass analysis pipeline in diagnosis mode", async () => {
      const db = createDb({
        "SELECT result_json FROM extractions": {
          first: {
            result_json: JSON.stringify({
              processes: [{ name: "퇴직연금 신청", description: "절차", steps: ["접수"] }],
              entities: [{ name: "계좌", type: "account", attributes: ["계좌번호"] }],
              rules: [{ condition: "가입기간 >= 10년", outcome: "수령 가능" }],
              relationships: [{ from: "가입자", to: "계좌", type: "소유" }],
            }),
          },
        },
        "INSERT INTO analyses": {},
        "INSERT INTO diagnosis_findings": {},
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = jsonReq("https://test.internal/analyze", {
        documentId: "doc-1",
        extractionId: "ext-1",
        organizationId: "org-1",
        mode: "diagnosis",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: {
          analysisId: string;
          status: string;
          documentId: string;
          extractionId: string;
        };
      };
      expect(body.success).toBe(true);
      expect(body.data.analysisId).toBeDefined();
      expect(body.data.status).toBe("processing");
      expect(body.data.documentId).toBe("doc-1");
      expect(body.data.extractionId).toBe("ext-1");
      // runAnalysisPasses is non-blocking via ctx.waitUntil
      expect(ctx.waitUntil).toHaveBeenCalled();
    });

    it("returns ok without analysis for standard mode", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = jsonReq("https://test.internal/analyze", {
        documentId: "doc-1",
        extractionId: "ext-1",
        organizationId: "org-1",
        mode: "standard",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: { message: string };
      };
      expect(body.data.message).toContain("Standard mode");
    });

    it("returns 400 when documentId is missing", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = jsonReq("https://test.internal/analyze", {
        extractionId: "ext-1",
        organizationId: "org-1",
        mode: "diagnosis",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.error.message).toContain("documentId");
    });

    it("returns 400 when extractionId is missing", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = jsonReq("https://test.internal/analyze", {
        documentId: "doc-1",
        organizationId: "org-1",
        mode: "diagnosis",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.error.message).toContain("extractionId");
    });

    it("returns 400 when organizationId is missing", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = jsonReq("https://test.internal/analyze", {
        documentId: "doc-1",
        extractionId: "ext-1",
        mode: "diagnosis",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.error.message).toContain("organizationId");
    });

    it("returns 404 when extraction result_json is null", async () => {
      const db = createDb({
        "SELECT result_json FROM extractions": {
          first: { result_json: null },
        },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = jsonReq("https://test.internal/analyze", {
        documentId: "doc-1",
        extractionId: "ext-1",
        organizationId: "org-1",
        mode: "diagnosis",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(404);
    });

    it("returns 404 when extraction row does not exist", async () => {
      const db = createDb({
        "SELECT result_json FROM extractions": { first: null },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = jsonReq("https://test.internal/analyze", {
        documentId: "doc-1",
        extractionId: "ext-999",
        organizationId: "org-1",
        mode: "diagnosis",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(404);
    });

    it("returns 400 for non-JSON request body", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: "not valid json{",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.error.message).toContain("valid JSON");
    });
  });
});
