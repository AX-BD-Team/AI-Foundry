import { describe, it, expect, vi } from "vitest";
import { handleGetOpenApiAdapter } from "./openapi.js";
import type { Env } from "../env.js";

function mockDb(firstResult?: Record<string, unknown> | null) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(firstResult ?? null),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

const sampleSkillPackage = {
  $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
  skillId: "sk-001",
  metadata: {
    domain: "퇴직연금",
    language: "ko",
    version: "1.0.0",
    createdAt: "2026-02-28T00:00:00.000Z",
    updatedAt: "2026-02-28T00:00:00.000Z",
    author: "test",
    tags: [],
  },
  policies: [
    {
      code: "POL-PENSION-WD-001",
      title: "중도인출 조건",
      condition: "조건",
      criteria: "기준",
      outcome: "결과",
      source: { documentId: "doc-1" },
      trust: { level: "reviewed", score: 0.8 },
      tags: [],
    },
  ],
  trust: { level: "reviewed", score: 0.8 },
  ontologyRef: { graphId: "g-1", termUris: [] },
  provenance: {
    sourceDocumentIds: ["doc-1"],
    organizationId: "org-1",
    extractedAt: "2026-02-28T00:00:00.000Z",
    pipeline: { stages: ["s1"], models: {} },
  },
  adapters: {},
};

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn() } as unknown as ExecutionContext;
}

describe("handleGetOpenApiAdapter", () => {
  it("returns 404 when skill not in DB", async () => {
    const env = {
      DB_SKILL: mockDb(null),
      R2_SKILL_PACKAGES: { get: vi.fn() },
    } as unknown as Env;
    const req = new Request("https://test.internal/skills/sk-999/openapi");
    const res = await handleGetOpenApiAdapter(req, env, "sk-999", mockCtx());
    expect(res.status).toBe(404);
  });

  it("returns 404 when R2 object missing", async () => {
    const env = {
      DB_SKILL: mockDb({ r2_key: "skill-packages/sk-001.skill.json" }),
      R2_SKILL_PACKAGES: { get: vi.fn().mockResolvedValue(null) },
    } as unknown as Env;
    const req = new Request("https://test.internal/skills/sk-001/openapi");
    const res = await handleGetOpenApiAdapter(req, env, "sk-001", mockCtx());
    expect(res.status).toBe(404);
  });

  it("returns OpenAPI spec JSON when found", async () => {
    const env = {
      DB_SKILL: mockDb({ r2_key: "skill-packages/sk-001.skill.json" }),
      R2_SKILL_PACKAGES: {
        get: vi.fn().mockResolvedValue({
          text: vi.fn().mockResolvedValue(JSON.stringify(sampleSkillPackage)),
        }),
      },
    } as unknown as Env;

    const req = new Request("https://test.internal/skills/sk-001/openapi");
    const ctx = mockCtx();
    const res = await handleGetOpenApiAdapter(req, env, "sk-001", ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };
    expect(body.openapi).toBe("3.0.3");
    expect(body.info.title).toContain("퇴직연금");
    expect(body.info.version).toBe("1.0.0");
    expect(body.paths["/evaluate/pol-pension-wd-001"]).toBeDefined();
  });

  it("records download with adapter_type openapi", async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true });
    const bindMock = vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue({ r2_key: "skill-packages/sk-001.skill.json" }),
      run: runMock,
    });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
    const env = {
      DB_SKILL: { prepare: prepareMock } as unknown as D1Database,
      R2_SKILL_PACKAGES: {
        get: vi.fn().mockResolvedValue({
          text: vi.fn().mockResolvedValue(JSON.stringify(sampleSkillPackage)),
        }),
      },
    } as unknown as Env;

    const req = new Request("https://test.internal/skills/sk-001/openapi");
    const ctx = mockCtx();
    await handleGetOpenApiAdapter(req, env, "sk-001", ctx);

    // The second prepare call should be the INSERT for downloads
    expect(prepareMock).toHaveBeenCalledTimes(2);
    const insertCall = prepareMock.mock.calls[1]?.[0] as string;
    expect(insertCall).toContain("skill_downloads");
    expect(insertCall).toContain("openapi");
  });

  it("returns 500 for unparseable R2 content", async () => {
    const env = {
      DB_SKILL: mockDb({ r2_key: "skill-packages/sk-001.skill.json" }),
      R2_SKILL_PACKAGES: {
        get: vi.fn().mockResolvedValue({
          text: vi.fn().mockResolvedValue("not-json"),
        }),
      },
    } as unknown as Env;

    const req = new Request("https://test.internal/skills/sk-001/openapi");
    const res = await handleGetOpenApiAdapter(req, env, "sk-001", mockCtx());
    expect(res.status).toBe(500);
  });
});
