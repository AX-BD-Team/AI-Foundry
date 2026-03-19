import { describe, it, expect, vi } from "vitest";
import { parseTags, rowToSummary, rowToDetail, handleUpdateSkillStatus, handleBulkPublish, type SkillRow } from "./skills.js";
import type { Env } from "../env.js";

// ── Test fixture ───────────────────────────────────────────────────

const baseRow: SkillRow = {
  skill_id: "sk-001",
  ontology_id: "ont-001",
  organization_id: "org-test",
  domain: "퇴직연금",
  subdomain: "중도인출",
  language: "ko",
  version: "1.0.0",
  r2_key: "skill-packages/sk-001.skill.json",
  policy_count: 3,
  trust_level: "reviewed",
  trust_score: 0.85,
  tags: '["퇴직연금","인출"]',
  author: "analyst-001",
  status: "draft",
  content_depth: 245,
  created_at: "2026-02-28T00:00:00.000Z",
  updated_at: "2026-02-28T00:00:00.000Z",
};

// ── parseTags ──────────────────────────────────────────────────────

describe("parseTags", () => {
  it("parses valid JSON string array", () => {
    expect(parseTags('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseTags("not-json")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseTags("")).toEqual([]);
  });

  it("returns empty array for JSON object", () => {
    expect(parseTags('{"key":"val"}')).toEqual([]);
  });

  it("returns empty array for JSON null", () => {
    expect(parseTags("null")).toEqual([]);
  });

  it("filters non-string elements", () => {
    expect(parseTags('[1, "valid", null, true, "also"]')).toEqual(["valid", "also"]);
  });

  it("handles empty JSON array", () => {
    expect(parseTags("[]")).toEqual([]);
  });

  it("handles Korean tags", () => {
    expect(parseTags('["퇴직연금","중도인출"]')).toEqual(["퇴직연금", "중도인출"]);
  });
});

// ── rowToSummary ───────────────────────────────────────────────────

describe("rowToSummary", () => {
  it("maps all fields correctly", () => {
    const result = rowToSummary(baseRow);
    expect(result.skillId).toBe("sk-001");
    expect(result.metadata.domain).toBe("퇴직연금");
    expect(result.metadata.subdomain).toBe("중도인출");
    expect(result.metadata.language).toBe("ko");
    expect(result.metadata.version).toBe("1.0.0");
    expect(result.metadata.author).toBe("analyst-001");
    expect(result.metadata.createdAt).toBe("2026-02-28T00:00:00.000Z");
    expect(result.metadata.updatedAt).toBe("2026-02-28T00:00:00.000Z");
    expect(result.trust.level).toBe("reviewed");
    expect(result.trust.score).toBe(0.85);
    expect(result.policyCount).toBe(3);
    expect(result.r2Key).toBe("skill-packages/sk-001.skill.json");
    expect(result.status).toBe("draft");
  });

  it("parses tags from JSON", () => {
    const result = rowToSummary(baseRow);
    expect(result.metadata.tags).toEqual(["퇴직연금", "인출"]);
  });

  it("omits subdomain when null", () => {
    const row = { ...baseRow, subdomain: null };
    const result = rowToSummary(row);
    expect(result.metadata).not.toHaveProperty("subdomain");
  });

  it("handles empty tags JSON", () => {
    const row = { ...baseRow, tags: "[]" };
    const result = rowToSummary(row);
    expect(result.metadata.tags).toEqual([]);
  });

  it("handles invalid tags JSON gracefully", () => {
    const row = { ...baseRow, tags: "broken" };
    const result = rowToSummary(row);
    expect(result.metadata.tags).toEqual([]);
  });

  it("maps trust levels correctly", () => {
    for (const level of ["unreviewed", "reviewed", "validated"] as const) {
      const row = { ...baseRow, trust_level: level };
      const result = rowToSummary(row);
      expect(result.trust.level).toBe(level);
    }
  });
});

// ── rowToDetail ────────────────────────────────────────────────────

describe("rowToDetail", () => {
  it("extends summary with ontologyId", () => {
    const result = rowToDetail(baseRow);
    expect(result.ontologyId).toBe("ont-001");
    expect(result.skillId).toBe("sk-001");
  });

  it("inherits all summary fields", () => {
    const result = rowToDetail(baseRow);
    expect(result.metadata.domain).toBe("퇴직연금");
    expect(result.trust.level).toBe("reviewed");
    expect(result.policyCount).toBe(3);
    expect(result.status).toBe("draft");
  });
});

// ── Mock helpers ──────────────────────────────────────────────────────

function mockDb(options?: { changes?: number }) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          success: true,
          meta: { changes: options?.changes ?? 1 },
        }),
      }),
    }),
  } as unknown as D1Database;
}

function mockEnv(dbOverrides?: { changes?: number }): Env {
  return {
    DB_SKILL: mockDb(dbOverrides),
    R2_SKILL_PACKAGES: {} as unknown as R2Bucket,
    KV_SKILL_CACHE: { get: vi.fn(), put: vi.fn() } as unknown as KVNamespace,
    QUEUE_PIPELINE: {} as unknown as Queue,
    SECURITY: {} as unknown as Fetcher,
    LLM_ROUTER: {} as unknown as Fetcher,
    SVC_POLICY: {} as unknown as Fetcher,
    SVC_ONTOLOGY: {} as unknown as Fetcher,
    SVC_EXTRACTION: {} as unknown as Fetcher,
    SVC_INGESTION: {} as unknown as Fetcher,
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-skill",
    INTERNAL_API_SECRET: "test-secret",
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("https://test.internal/skills/sk-001/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── handleUpdateSkillStatus ──────────────────────────────────────────

describe("handleUpdateSkillStatus", () => {
  it("updates status to published and returns 200", async () => {
    const env = mockEnv();
    const req = jsonRequest({ status: "published" });
    const res = await handleUpdateSkillStatus(req, env, "sk-001");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { skillId: string; status: string } };
    expect(body.data.skillId).toBe("sk-001");
    expect(body.data.status).toBe("published");
  });

  it("updates status to archived", async () => {
    const env = mockEnv();
    const req = jsonRequest({ status: "archived" });
    const res = await handleUpdateSkillStatus(req, env, "sk-001");
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid status value", async () => {
    const env = mockEnv();
    const req = jsonRequest({ status: "invalid" });
    const res = await handleUpdateSkillStatus(req, env, "sk-001");
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing status field", async () => {
    const env = mockEnv();
    const req = jsonRequest({});
    const res = await handleUpdateSkillStatus(req, env, "sk-001");
    expect(res.status).toBe(400);
  });

  it("returns 404 when skill not found (0 rows changed)", async () => {
    const env = mockEnv({ changes: 0 });
    const req = jsonRequest({ status: "published" });
    const res = await handleUpdateSkillStatus(req, env, "sk-nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 400 for non-JSON body", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/skills/sk-001/status", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await handleUpdateSkillStatus(req, env, "sk-001");
    expect(res.status).toBe(400);
  });
});

// ── handleBulkPublish ────────────────────────────────────────────────

describe("handleBulkPublish", () => {
  it("publishes multiple skills and returns count", async () => {
    const env = mockEnv({ changes: 3 });
    const req = new Request("https://test.internal/admin/bulk-publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillIds: ["sk-001", "sk-002", "sk-003"] }),
    });
    const res = await handleBulkPublish(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { requested: number; updated: number; status: string } };
    expect(body.data.requested).toBe(3);
    expect(body.data.status).toBe("published");
  });

  it("defaults to published status when not specified", async () => {
    const env = mockEnv({ changes: 1 });
    const req = new Request("https://test.internal/admin/bulk-publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillIds: ["sk-001"] }),
    });
    const res = await handleBulkPublish(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { status: string } };
    expect(body.data.status).toBe("published");
  });

  it("accepts explicit archived status", async () => {
    const env = mockEnv({ changes: 2 });
    const req = new Request("https://test.internal/admin/bulk-publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillIds: ["sk-001", "sk-002"], status: "archived" }),
    });
    const res = await handleBulkPublish(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { status: string } };
    expect(body.data.status).toBe("archived");
  });

  it("returns 400 for empty skillIds array", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/admin/bulk-publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillIds: [] }),
    });
    const res = await handleBulkPublish(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing skillIds", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/admin/bulk-publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handleBulkPublish(req, env);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-JSON body", async () => {
    const env = mockEnv();
    const req = new Request("https://test.internal/admin/bulk-publish", {
      method: "POST",
      body: "not-json",
    });
    const res = await handleBulkPublish(req, env);
    expect(res.status).toBe(400);
  });
});
