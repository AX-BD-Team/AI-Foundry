import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../env.js";

// ── Mock LLM caller ──────────────────────────────────────────────

const mockLlmResponse = JSON.stringify({
  items: [
    {
      name: "중도인출 프로세스",
      type: "process",
      serviceGroup: "common_standard",
      presentIn: [
        {
          organizationId: "org-A",
          organizationName: "org-A",
          documentIds: [],
          variant: "3단계 처리",
        },
        {
          organizationId: "org-B",
          organizationName: "org-B",
          documentIds: [],
          variant: "5단계 처리",
        },
      ],
      classificationReason: "두 조직 모두에 존재",
      standardizationScore: 0.85,
      standardizationNote: "단계가 유사",
    },
    {
      name: "긴급인출 규칙",
      type: "rule",
      serviceGroup: "tacit_knowledge",
      presentIn: [
        {
          organizationId: "org-A",
          organizationName: "org-A",
          documentIds: [],
        },
      ],
      classificationReason: "프로세스 정의에 없으나 규칙에서 참조",
      tacitKnowledgeEvidence: "화면 흐름에서 긴급인출 승인 단계 생략",
    },
    {
      name: "퇴직급여 산정",
      type: "process",
      serviceGroup: "org_specific",
      presentIn: [
        {
          organizationId: "org-B",
          organizationName: "org-B",
          documentIds: [],
        },
      ],
      classificationReason: "org-B에만 존재",
    },
    {
      name: "DC형 자동이체",
      type: "process",
      serviceGroup: "core_differentiator",
      presentIn: [
        {
          organizationId: "org-A",
          organizationName: "org-A",
          documentIds: [],
        },
      ],
      classificationReason: "org-A 핵심 차별 기능",
    },
  ],
  standardizationCandidates: [
    {
      name: "중도인출 프로세스",
      score: 0.85,
      orgsInvolved: ["org-A", "org-B"],
      note: "승인 구조 통일 필요",
    },
  ],
});

vi.mock("../llm/caller.js", () => ({
  callLlm: vi.fn().mockResolvedValue(mockLlmResponse),
}));

// ── Helpers ──────────────────────────────────────────────────────

/**
 * D1 mock -- SQL 패턴 기반 queryMap으로 결과를 분기한다.
 */
function createDb(queryMap: Record<string, { first?: unknown; all?: unknown[]; runMeta?: Record<string, unknown> }> = {}) {
  const prepare = vi.fn().mockImplementation((sql: string) => {
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
  processes: [
    {
      name: "퇴직연금 신청",
      category: "core",
      isCore: true,
      importanceScore: 0.85,
      importanceReason: "핵심 업무 프로세스",
    },
    {
      name: "중도인출",
      category: "core",
      isCore: true,
      importanceScore: 0.75,
      importanceReason: "중요 업무",
    },
  ],
});

const sampleCoreJson = JSON.stringify({
  coreProcesses: [
    {
      processName: "퇴직연금 신청",
      isCore: true,
      score: 0.85,
      reasoning: "핵심 업무 프로세스",
    },
  ],
});

// ── Tests via index.ts router ─────────────────────────────────────

describe("compare routes (via index.ts router)", () => {
  let worker: ExportedHandler<Env>;

  beforeEach(async () => {
    const module = await import("../index.js");
    worker = module.default;
    vi.clearAllMocks();
  });

  // ── Auth ──────────────────────────────────────────────────────

  describe("authentication", () => {
    it("returns 401 for POST /analysis/compare without X-Internal-Secret", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationIds: ["org-A", "org-B"], domain: "퇴직연금" }),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(401);
    });

    it("returns 401 for GET /analysis/:orgId/service-groups without X-Internal-Secret", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/org-A/service-groups");

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(401);
    });

    it("returns 401 for GET /analysis/compare/:id/standardization without X-Internal-Secret", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/compare/cmp-1/standardization");

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(401);
    });
  });

  // ── POST /analysis/compare ────────────────────────────────────

  describe("POST /analysis/compare", () => {
    it("returns 200 with CrossOrgComparison on success", async () => {
      const db = createDb({
        "FROM analyses WHERE organization_id": {
          first: {
            organization_id: "org-A",
            summary_json: sampleSummaryJson,
            core_identification_json: sampleCoreJson,
            process_count: 2,
          },
        },
        "INSERT INTO comparisons": {},
        "INSERT INTO comparison_items": {},
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = jsonReq("https://test.internal/analysis/compare", {
        organizationIds: ["org-A", "org-B"],
        domain: "퇴직연금",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: {
          comparisonId: string;
          organizations: Array<{ organizationId: string }>;
          items: Array<{ name: string; serviceGroup: string }>;
          groupSummary: {
            commonStandard: number;
            orgSpecific: number;
            tacitKnowledge: number;
            coreDifferentiator: number;
          };
          standardizationCandidates: Array<{ name: string; score: number }>;
        };
      };
      expect(body.success).toBe(true);
      expect(body.data.comparisonId).toBeDefined();
      expect(body.data.organizations).toHaveLength(2);
      expect(body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(body.data.groupSummary.commonStandard).toBeGreaterThanOrEqual(0);
      expect(body.data.standardizationCandidates.length).toBeGreaterThanOrEqual(0);
    });

    it("returns 400 when organizationIds is missing", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = jsonReq("https://test.internal/analysis/compare", {
        domain: "퇴직연금",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.success).toBe(false);
      expect(body.error.message).toContain("organizationIds");
    });

    it("returns 400 when organizationIds has less than 2 items", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = jsonReq("https://test.internal/analysis/compare", {
        organizationIds: ["org-A"],
        domain: "퇴직연금",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.success).toBe(false);
      expect(body.error.message).toContain("at least 2");
    });

    it("returns 400 when organization has no completed analysis", async () => {
      // Both orgs return null — first org has no analysis
      const db = createDb({
        "FROM analyses WHERE organization_id": { first: null },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = jsonReq("https://test.internal/analysis/compare", {
        organizationIds: ["org-A", "org-B"],
        domain: "퇴직연금",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.success).toBe(false);
      expect(body.error.message).toContain("no completed analysis");
    });

    it("returns 400 for non-JSON request body", async () => {
      const env = mockEnv();
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: "not valid json{",
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { message: string } };
      expect(body.success).toBe(false);
      expect(body.error.message).toContain("valid JSON");
    });
  });

  // ── GET /analysis/:organizationId/service-groups ──────────────

  describe("GET /analysis/:organizationId/service-groups", () => {
    it("returns 200 with grouped results", async () => {
      const db = createDb({
        "FROM comparison_items ci": {
          all: [
            {
              item_id: "item-1",
              comparison_id: "cmp-1",
              name: "중도인출 프로세스",
              type: "process",
              service_group: "common_standard",
              present_in_orgs: JSON.stringify([
                { organizationId: "org-A", organizationName: "org-A", documentIds: [] },
                { organizationId: "org-B", organizationName: "org-B", documentIds: [] },
              ]),
              classification_reason: "두 조직 모두에 존재",
              standardization_score: 0.85,
              standardization_note: "단계가 유사",
              tacit_knowledge_evidence: null,
              created_at: "2026-03-01T00:00:00.000Z",
            },
            {
              item_id: "item-2",
              comparison_id: "cmp-1",
              name: "긴급인출 규칙",
              type: "rule",
              service_group: "tacit_knowledge",
              present_in_orgs: JSON.stringify([
                { organizationId: "org-A", organizationName: "org-A", documentIds: [] },
              ]),
              classification_reason: "프로세스 정의에 없으나 규칙에서 참조",
              standardization_score: null,
              standardization_note: null,
              tacit_knowledge_evidence: "화면 흐름에서 긴급인출 승인 단계 생략",
              created_at: "2026-03-01T00:00:00.000Z",
            },
          ],
        },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/org-A/service-groups", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: {
          groups: Array<{
            name: string;
            serviceGroup: string;
            standardizationScore?: number;
            tacitKnowledgeEvidence?: string;
          }>;
          groupSummary: {
            commonStandard: number;
            orgSpecific: number;
            tacitKnowledge: number;
            coreDifferentiator: number;
          };
        };
      };
      expect(body.success).toBe(true);
      expect(body.data.groups).toHaveLength(2);
      expect(body.data.groupSummary.commonStandard).toBe(1);
      expect(body.data.groupSummary.tacitKnowledge).toBe(1);
      expect(body.data.groupSummary.orgSpecific).toBe(0);
      expect(body.data.groupSummary.coreDifferentiator).toBe(0);
      // verify optional fields are mapped correctly
      const standardItem = body.data.groups.find((g) => g.name === "중도인출 프로세스");
      expect(standardItem?.standardizationScore).toBe(0.85);
      const tacitItem = body.data.groups.find((g) => g.name === "긴급인출 규칙");
      expect(tacitItem?.tacitKnowledgeEvidence).toContain("긴급인출");
    });

    it("returns 200 with empty results when no comparison items exist", async () => {
      const db = createDb({
        "FROM comparison_items ci": { all: [] },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/org-999/service-groups", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: {
          groups: unknown[];
          groupSummary: {
            commonStandard: number;
            orgSpecific: number;
            tacitKnowledge: number;
            coreDifferentiator: number;
          };
        };
      };
      expect(body.success).toBe(true);
      expect(body.data.groups).toHaveLength(0);
      expect(body.data.groupSummary.commonStandard).toBe(0);
      expect(body.data.groupSummary.orgSpecific).toBe(0);
      expect(body.data.groupSummary.tacitKnowledge).toBe(0);
      expect(body.data.groupSummary.coreDifferentiator).toBe(0);
    });
  });

  // ── GET /analysis/compare/:comparisonId/standardization ───────

  describe("GET /analysis/compare/:comparisonId/standardization", () => {
    it("returns 200 with candidates sorted by score descending", async () => {
      const storedComparison = {
        comparisonId: "cmp-1",
        standardizationCandidates: [
          { name: "프로세스 A", score: 0.6, orgsInvolved: ["org-A", "org-B"], note: "낮은 점수" },
          { name: "프로세스 B", score: 0.95, orgsInvolved: ["org-A", "org-B"], note: "높은 점수" },
          { name: "프로세스 C", score: 0.8, orgsInvolved: ["org-A", "org-B"], note: "중간 점수" },
        ],
      };
      const db = createDb({
        "FROM comparisons WHERE comparison_id": {
          first: { result_json: JSON.stringify(storedComparison) },
        },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/compare/cmp-1/standardization", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as {
        success: boolean;
        data: {
          candidates: Array<{ name: string; score: number; note: string }>;
        };
      };
      expect(body.success).toBe(true);
      expect(body.data.candidates).toHaveLength(3);
      // sorted by score descending
      expect(body.data.candidates[0]?.score).toBe(0.95);
      expect(body.data.candidates[0]?.name).toBe("프로세스 B");
      expect(body.data.candidates[1]?.score).toBe(0.8);
      expect(body.data.candidates[2]?.score).toBe(0.6);
    });

    it("returns 404 for non-existent comparison", async () => {
      const db = createDb({
        "FROM comparisons WHERE comparison_id": { first: null },
      });
      const env = mockEnv(db);
      const ctx = mockCtx();
      const req = new Request("https://test.internal/analysis/compare/non-existent/standardization", {
        headers: authHeaders(),
      });

      const res = await worker.fetch!(req as never, env, ctx);
      expect(res.status).toBe(404);
      const body = await res.json() as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });
});
