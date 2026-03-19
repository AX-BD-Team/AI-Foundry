import { describe, it, expect, vi } from "vitest";
import {
  handleGeneratePrototype,
  handleListPrototypes,
  handleGetPrototype,
  handleDownloadPrototype,
} from "./prototype.js";
import type { Env } from "../env.js";

// ── Mock Env ────────────────────────────────────

function makeEnv(overrides?: {
  dbFirst?: unknown;
  dbAll?: { results: unknown[] };
  dbCountFirst?: { cnt: number };
  r2Object?: { body: ReadableStream } | null;
}): Env {
  const runFn = vi.fn().mockResolvedValue({ success: true });
  const firstFn = vi.fn().mockResolvedValue(overrides?.dbFirst ?? null);
  const allFn = vi.fn().mockResolvedValue(overrides?.dbAll ?? { results: [] });

  return {
    DB_SKILL: {
      prepare: vi.fn().mockImplementation((sql: string) => ({
        bind: vi.fn().mockReturnValue({
          run: runFn,
          first: sql.includes("COUNT") ? vi.fn().mockResolvedValue(overrides?.dbCountFirst ?? { cnt: 0 }) : firstFn,
          all: allFn,
        }),
      })),
    } as unknown as D1Database,
    R2_SKILL_PACKAGES: {
      get: vi.fn().mockResolvedValue(overrides?.r2Object ?? null),
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as R2Bucket,
    KV_SKILL_CACHE: { get: vi.fn(), put: vi.fn() } as unknown as KVNamespace,
    QUEUE_PIPELINE: {} as unknown as Queue,
    SECURITY: {} as unknown as Fetcher,
    LLM_ROUTER: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_POLICY: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_ONTOLOGY: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_EXTRACTION: { fetch: vi.fn() } as unknown as Fetcher,
    SVC_INGESTION: { fetch: vi.fn() } as unknown as Fetcher,
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-skill",
    INTERNAL_API_SECRET: "test-secret",
  } as unknown as Env;
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function jsonRequest(path: string, body?: unknown): Request {
  if (body !== undefined) {
    return new Request(`https://test.internal${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return new Request(`https://test.internal${path}`);
}

// ── POST /prototype/generate ────────────────────

describe("handleGeneratePrototype", () => {
  it("유효한 요청 → 202 + prototypeId", async () => {
    const env = makeEnv();
    const ctx = makeCtx();
    const req = jsonRequest("/prototype/generate", {
      organizationId: "lpon-onnuri",
    });

    const res = await handleGeneratePrototype(req, env, ctx);
    expect(res.status).toBe(202);

    const json = await res.json() as { success: boolean; data: { prototypeId: string; status: string } };
    expect(json.success).toBe(true);
    expect(json.data.prototypeId).toMatch(/^wp-/);
    expect(json.data.status).toBe("generating");

    // waitUntil이 호출됨 (비동기 생성)
    expect(ctx.waitUntil).toHaveBeenCalledOnce();
  });

  it("organizationId 누락 → 400", async () => {
    const env = makeEnv();
    const ctx = makeCtx();
    const req = jsonRequest("/prototype/generate", {});

    const res = await handleGeneratePrototype(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("options 전달 가능", async () => {
    const env = makeEnv();
    const ctx = makeCtx();
    const req = jsonRequest("/prototype/generate", {
      organizationId: "lpon-onnuri",
      options: { skipLlm: true, maxPoliciesPerScenario: 10 },
    });

    const res = await handleGeneratePrototype(req, env, ctx);
    expect(res.status).toBe(202);
  });
});

// ── GET /prototype ──────────────────────────────

describe("handleListPrototypes", () => {
  it("빈 목록 → 200 + empty array", async () => {
    const env = makeEnv({ dbAll: { results: [] }, dbCountFirst: { cnt: 0 } });
    const req = jsonRequest("/prototype");

    const res = await handleListPrototypes(req, env);
    expect(res.status).toBe(200);

    const json = await res.json() as { success: boolean; data: { prototypes: unknown[]; total: number } };
    expect(json.data.prototypes).toEqual([]);
    expect(json.data.total).toBe(0);
  });

  it("레코드 있을 때 → 변환된 형태 반환", async () => {
    const row = {
      prototype_id: "wp-001",
      organization_id: "lpon",
      version: "1.0.0",
      status: "completed",
      r2_key: "working-prototypes/wp-001.zip",
      doc_count: 85,
      policy_count: 848,
      term_count: 7332,
      skill_count: 11,
      generation_params: null,
      error_message: null,
      started_at: "2026-03-20T00:00:00Z",
      completed_at: "2026-03-20T00:01:00Z",
      created_at: "2026-03-20T00:00:00Z",
    };

    const env = makeEnv({ dbAll: { results: [row] }, dbCountFirst: { cnt: 1 } });
    const req = jsonRequest("/prototype?org=lpon");

    const res = await handleListPrototypes(req, env);
    const json = await res.json() as { data: { prototypes: Array<{ prototypeId: string }> } };
    expect(json.data.prototypes[0]!.prototypeId).toBe("wp-001");
  });
});

// ── GET /prototype/:id ──────────────────────────

describe("handleGetPrototype", () => {
  it("존재하는 prototype → 200", async () => {
    const env = makeEnv({
      dbFirst: {
        prototype_id: "wp-001",
        organization_id: "lpon",
        version: "1.0.0",
        status: "completed",
        r2_key: "working-prototypes/wp-001.zip",
        doc_count: 85,
        policy_count: 848,
        term_count: 7332,
        skill_count: 11,
        generation_params: null,
        error_message: null,
        started_at: "2026-03-20T00:00:00Z",
        completed_at: "2026-03-20T00:01:00Z",
        created_at: "2026-03-20T00:00:00Z",
      },
    });

    const res = await handleGetPrototype(env, "wp-001");
    expect(res.status).toBe(200);

    const json = await res.json() as { data: { prototypeId: string; policyCount: number } };
    expect(json.data.prototypeId).toBe("wp-001");
    expect(json.data.policyCount).toBe(848);
  });

  it("존재하지 않는 prototype → 404", async () => {
    const env = makeEnv({ dbFirst: null });
    const res = await handleGetPrototype(env, "wp-nonexistent");
    expect(res.status).toBe(404);
  });
});

// ── GET /prototype/:id/download ─────────────────

describe("handleDownloadPrototype", () => {
  it("completed 상태 + R2 파일 존재 → ZIP 다운로드", async () => {
    const zipBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0x50, 0x4b])); // PK (ZIP magic)
        controller.close();
      },
    });

    const env = makeEnv({
      dbFirst: { r2_key: "working-prototypes/wp-001.zip", status: "completed" },
      r2Object: { body: zipBody },
    });

    const res = await handleDownloadPrototype(env, "wp-001");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain("wp-001.zip");
  });

  it("generating 상태 → 400", async () => {
    const env = makeEnv({
      dbFirst: { r2_key: null, status: "generating" },
    });

    const res = await handleDownloadPrototype(env, "wp-001");
    expect(res.status).toBe(400);
  });

  it("존재하지 않는 prototype → 404", async () => {
    const env = makeEnv({ dbFirst: null });
    const res = await handleDownloadPrototype(env, "wp-nonexistent");
    expect(res.status).toBe(404);
  });
});
