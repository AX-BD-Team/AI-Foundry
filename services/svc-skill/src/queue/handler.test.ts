import { describe, it, expect, vi } from "vitest";
import { processQueueEvent } from "./handler.js";
import type { Env } from "../env.js";

// ── Mock skill-builder ──────────────────────────────────────────
vi.mock("../assembler/skill-builder.js", () => ({
  buildSkillPackage: vi.fn().mockReturnValue({
    $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
    skillId: "skill-test-001",
    metadata: {
      domain: "pension",
      language: "ko",
      version: "1.0.0",
      createdAt: "2026-02-28T00:00:00.000Z",
      updatedAt: "2026-02-28T00:00:00.000Z",
      author: "ai-foundry-pipeline",
      tags: ["퇴직연금"],
    },
    policies: [],
    trust: { level: "reviewed", score: 0.75 },
    ontologyRef: { graphId: "ont-1", termUris: [] },
    provenance: {
      sourceDocumentIds: ["doc-1"],
      organizationId: "org-test",
      extractedAt: "2026-02-28T00:00:00.000Z",
      pipeline: { stages: [], models: {} },
    },
    adapters: {},
  }),
}));

const MOCK_POLICY_RESPONSE = {
  success: true,
  data: {
    policyId: "p-1",
    extractionId: "ext-1",
    organizationId: "org-test",
    policyCode: "POL-PENSION-WD-001",
    title: "테스트 정책",
    condition: "무주택 세대주",
    criteria: "확인 필요",
    outcome: "인출 허용",
    sourceDocumentId: "doc-1",
    sourcePageRef: null,
    sourceExcerpt: null,
    status: "approved",
    trustLevel: "reviewed",
    trustScore: 0.75,
    tags: ["퇴직연금"],
    createdAt: "2026-02-28T00:00:00.000Z",
    updatedAt: "2026-02-28T00:00:00.000Z",
  },
};

const MOCK_TERMS_RESPONSE = {
  success: true,
  data: {
    terms: [
      { termId: "t-1", ontologyId: "ont-1", label: "중도인출", definition: "test", skosUri: "urn:aif:term:t-1", broaderTermId: null, embeddingModel: null, createdAt: "2026-02-28T00:00:00.000Z" },
    ],
  },
};

function mockEnv(): Env {
  return {
    DB_SKILL: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      }),
    } as unknown as D1Database,
    R2_SKILL_PACKAGES: {
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as R2Bucket,
    QUEUE_PIPELINE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    SECURITY: { fetch: vi.fn() } as unknown as Fetcher,
    LLM_ROUTER: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_POLICY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(MOCK_POLICY_RESPONSE), { status: 200 }),
      ),
    } as unknown as Fetcher,
    SVC_ONTOLOGY: {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(MOCK_TERMS_RESPONSE), { status: 200 }),
      ),
    } as unknown as Fetcher,
    ENVIRONMENT: "development",
    SERVICE_NAME: "svc-skill",
    INTERNAL_API_SECRET: "test-secret",
  };
}

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

describe("processQueueEvent (svc-skill)", () => {
  it("rejects invalid pipeline event", async () => {
    const res = await processQueueEvent({ bad: true }, mockEnv(), mockCtx());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Invalid pipeline event");
  });

  it("ignores non-ontology.normalized events", async () => {
    const event = {
      eventId: "00000000-0000-0000-0000-000000000001",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "policy.approved",
      payload: {
        policyId: "p-1",
        hitlSessionId: "s-1",
        organizationId: "org-test",
        approvedBy: "rev-1",
        approvedAt: "2026-02-28T00:00:00.000Z",
        policyCount: 1,
      },
    };
    const res = await processQueueEvent(event, mockEnv(), mockCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ignored");
  });

  it("processes ontology.normalized event with full pipeline", async () => {
    const env = mockEnv();
    const ctx = mockCtx();
    const event = {
      eventId: "00000000-0000-0000-0000-000000000002",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "ontology.normalized",
      payload: {
        policyId: "p-1",
        ontologyId: "ont-1",
        organizationId: "org-test",
        termCount: 5,
      },
    };
    const res = await processQueueEvent(event, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; policyId: string; skillId: string; r2Key: string };
    expect(body.status).toBe("processed");
    expect(body.policyId).toBe("p-1");
    expect(body.skillId).toBeDefined();
    expect(body.r2Key).toContain("skill-packages/");

    // Verify R2 was called
    expect(env.R2_SKILL_PACKAGES.put).toHaveBeenCalledOnce();
    // Verify D1 was called
    expect(env.DB_SKILL.prepare).toHaveBeenCalledOnce();
    // Verify queue event was emitted
    expect(env.QUEUE_PIPELINE.send).toHaveBeenCalled();
  });

  it("fetches policy and terms via service bindings", async () => {
    const env = mockEnv();
    const event = {
      eventId: "00000000-0000-0000-0000-000000000002",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "ontology.normalized",
      payload: {
        policyId: "p-1",
        ontologyId: "ont-1",
        organizationId: "org-test",
        termCount: 5,
      },
    };
    await processQueueEvent(event, env, mockCtx());

    const policyFetch = env.SVC_POLICY.fetch as ReturnType<typeof vi.fn>;
    expect(policyFetch).toHaveBeenCalledOnce();
    const [policyUrl] = policyFetch.mock.calls[0] as [string];
    expect(policyUrl).toBe("http://internal/policies/p-1");

    const ontologyFetch = env.SVC_ONTOLOGY.fetch as ReturnType<typeof vi.fn>;
    expect(ontologyFetch).toHaveBeenCalledOnce();
    const [termsUrl] = ontologyFetch.mock.calls[0] as [string];
    expect(termsUrl).toBe("http://internal/terms?ontologyId=ont-1");
  });

  it("returns error when policy fetch fails", async () => {
    const env = mockEnv();
    (env.SVC_POLICY.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("Not found", { status: 404 }),
    );
    const event = {
      eventId: "00000000-0000-0000-0000-000000000002",
      occurredAt: "2026-02-28T00:00:00.000Z",
      type: "ontology.normalized",
      payload: {
        policyId: "p-1",
        ontologyId: "ont-1",
        organizationId: "org-test",
        termCount: 5,
      },
    };
    const res = await processQueueEvent(event, env, mockCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; reason: string };
    expect(body.status).toBe("error");
    expect(body.reason).toContain("Policy fetch failed");
  });

  it("rejects malformed event schema", async () => {
    const event = {
      eventId: "bad",
      occurredAt: "not-a-date",
      type: "ontology.normalized",
      payload: {},
    };
    const res = await processQueueEvent(event, mockEnv(), mockCtx());
    expect(res.status).toBe(400);
  });
});
