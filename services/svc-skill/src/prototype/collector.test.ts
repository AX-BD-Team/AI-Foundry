import { describe, it, expect, vi } from "vitest";
import { collectOrgData } from "./collector.js";
import type { Env } from "../env.js";

function mockFetcher(responses: Record<string, unknown>): Fetcher {
  return {
    fetch: vi.fn().mockImplementation(async (url: string) => {
      const path = new URL(url).pathname;
      for (const [pattern, data] of Object.entries(responses)) {
        if (path.startsWith(pattern)) {
          return new Response(JSON.stringify(data), { status: 200 });
        }
      }
      return new Response("Not found", { status: 404 });
    }),
  } as unknown as Fetcher;
}

function makeEnv(): Env {
  return {
    DB_SKILL: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              { skill_id: "sk-1", domain: "온누리상품권", subdomain: null, version: "2.0.0", r2_key: "r2/sk-1", policy_count: 50, trust_level: "reviewed", trust_score: 0.8, tags: "[]", status: "bundled" },
            ],
          }),
        }),
      }),
    } as unknown as D1Database,
    SVC_POLICY: mockFetcher({
      "/policies": {
        success: true,
        data: {
          policies: [
            { policy_id: "pol-1", policy_code: "POL-GV-CHARGE-001", title: "충전", condition: "c", criteria: "cr", outcome: "o", source_document_id: "d1", source_page_ref: null, source_excerpt: null, status: "approved", trust_level: "reviewed", trust_score: 0.8, tags: "[]" },
          ],
          total: 1,
        },
      },
    }),
    SVC_ONTOLOGY: mockFetcher({
      "/terms": {
        success: true,
        data: {
          terms: [
            { term_id: "t-1", ontology_id: "o-1", label: "충전", definition: "def", skos_uri: null, broader_term_id: null, term_type: "entity" },
          ],
          total: 1,
        },
      },
    }),
    SVC_INGESTION: mockFetcher({
      "/documents": {
        success: true,
        data: {
          documents: [
            { document_id: "doc-1", filename: "test.pdf", content_type: "application/pdf", status: "parsed", organization_id: "lpon" },
          ],
          total: 1,
        },
      },
    }),
    SVC_EXTRACTION: mockFetcher({
      "/extractions": {
        extractions: [
          { extractionId: "ex-1", documentId: "doc-1", status: "completed", result: {} },
        ],
      },
    }),
    INTERNAL_API_SECRET: "test-secret",
  } as unknown as Env;
}

describe("collectOrgData", () => {
  it("5개 서비스에서 데이터 수집", async () => {
    const env = makeEnv();
    const data = await collectOrgData(env, "lpon");

    expect(data.policies).toHaveLength(1);
    expect(data.policies[0]!.policy_code).toBe("POL-GV-CHARGE-001");

    expect(data.terms).toHaveLength(1);
    expect(data.terms[0]!.label).toBe("충전");

    expect(data.documents).toHaveLength(1);
    expect(data.documents[0]!.document_id).toBe("doc-1");

    expect(data.skills).toHaveLength(1);
    expect(data.skills[0]!.skill_id).toBe("sk-1");

    expect(data.extractions).toHaveLength(1);
    expect(data.extractions[0]!.extractionId).toBe("ex-1");
  });

  it("policies pagination — 전체 수집", async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({
      policy_id: `pol-${i}`, policy_code: `POL-GV-C-${String(i).padStart(3, "0")}`,
      title: "t", condition: "c", criteria: "cr", outcome: "o",
      source_document_id: "d1", source_page_ref: null, source_excerpt: null,
      status: "approved", trust_level: "reviewed", trust_score: 0.8, tags: "[]",
    }));
    const page2 = [{ ...page1[0]!, policy_id: "pol-200", policy_code: "POL-GV-C-200" }];

    let callCount = 0;
    const policyFetcher = {
      fetch: vi.fn().mockImplementation(async () => {
        callCount++;
        const policies = callCount === 1 ? page1 : page2;
        return new Response(JSON.stringify({
          success: true,
          data: { policies, total: 201 },
        }), { status: 200 });
      }),
    } as unknown as Fetcher;

    const env = {
      ...makeEnv(),
      SVC_POLICY: policyFetcher,
    } as unknown as Env;

    const data = await collectOrgData(env, "lpon");
    expect(data.policies).toHaveLength(201);
    expect(callCount).toBe(2);
  });

  it("extraction fetch 실패 시 해당 건 skip (graceful)", async () => {
    const env = makeEnv();
    // extraction이 실패하는 fetcher
    (env as unknown as Record<string, { fetch: ReturnType<typeof vi.fn> }>)["SVC_EXTRACTION"]!.fetch = vi.fn().mockResolvedValue(
      new Response("Internal Error", { status: 500 }),
    );

    const data = await collectOrgData(env, "lpon");
    // extraction은 빈 배열이지만 다른 데이터는 정상
    expect(data.extractions).toHaveLength(0);
    expect(data.policies).toHaveLength(1);
  });
});
