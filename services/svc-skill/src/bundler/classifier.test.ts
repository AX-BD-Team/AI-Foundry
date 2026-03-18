import { describe, it, expect, vi } from "vitest";
import { classifyPolicies } from "./classifier.js";
import type { PolicyInput } from "./classifier.js";
import type { Env } from "../env.js";

function makePolicies(count: number): PolicyInput[] {
  return Array.from({ length: count }, (_, i) => ({
    policyId: `pol-${i}`,
    policyCode: `POL-TEST-${i}`,
    title: `정책 ${i}`,
    condition: `조건 ${i}`,
    criteria: `기준 ${i}`,
  }));
}

function mockEnv(fetchFn: ReturnType<typeof vi.fn>): Env {
  return {
    LLM_ROUTER: { fetch: fetchFn } as unknown as Fetcher,
    INTERNAL_API_SECRET: "test-secret",
  } as unknown as Env;
}

function llmResponse(results: Array<{ policyId: string; category: string; confidence: number }>): Response {
  return new Response(
    JSON.stringify({ success: true, data: { content: JSON.stringify(results) } }),
    { status: 200 },
  );
}

describe("classifyPolicies", () => {
  it("classifies a small batch of policies", async () => {
    const policies = makePolicies(3);
    const fetchFn = vi.fn().mockResolvedValue(
      llmResponse([
        { policyId: "pol-0", category: "charging", confidence: 0.95 },
        { policyId: "pol-1", category: "payment", confidence: 0.88 },
        { policyId: "pol-2", category: "gift", confidence: 0.92 },
      ]),
    );

    const results = await classifyPolicies(mockEnv(fetchFn), policies);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ policyId: "pol-0", category: "charging", confidence: 0.95 });
    expect(results[1]).toEqual({ policyId: "pol-1", category: "payment", confidence: 0.88 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("splits 51 policies into 2 batches", async () => {
    const policies = makePolicies(51);
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(
        llmResponse(
          Array.from({ length: 50 }, (_, i) => ({
            policyId: `pol-${i}`,
            category: "charging",
            confidence: 0.9,
          })),
        ),
      )
      .mockResolvedValueOnce(
        llmResponse([{ policyId: "pol-50", category: "payment", confidence: 0.85 }]),
      );

    const results = await classifyPolicies(mockEnv(fetchFn), policies);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(51);
    expect(results[50]).toEqual({ policyId: "pol-50", category: "payment", confidence: 0.85 });
  });

  it("parses response with markdown fence", async () => {
    const fencedContent = "```json\n" +
      JSON.stringify([{ policyId: "pol-0", category: "member", confidence: 0.91 }]) +
      "\n```";
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { content: fencedContent } }),
        { status: 200 },
      ),
    );

    const results = await classifyPolicies(mockEnv(fetchFn), makePolicies(1));

    expect(results).toHaveLength(1);
    expect(results[0]?.category).toBe("member");
  });

  it("falls back to 'other' for unknown category", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      llmResponse([{ policyId: "pol-0", category: "unknown_cat", confidence: 0.5 }]),
    );

    const results = await classifyPolicies(mockEnv(fetchFn), makePolicies(1));

    expect(results[0]?.category).toBe("other");
  });

  it("returns empty array for empty input", async () => {
    const fetchFn = vi.fn();
    const results = await classifyPolicies(mockEnv(fetchFn), []);

    expect(results).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends correct request to LLM Router", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      llmResponse([{ policyId: "pol-0", category: "security", confidence: 0.8 }]),
    );

    await classifyPolicies(mockEnv(fetchFn), makePolicies(1));

    const [url, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://svc-llm-router.internal/complete");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body["tier"]).toBe("haiku");
    expect(body["callerService"]).toBe("svc-skill");
    expect(body["temperature"]).toBe(0.1);

    const headers = opts.headers as Record<string, string>;
    expect(headers["X-Internal-Secret"]).toBe("test-secret");
  });

  it("throws on LLM Router HTTP error", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("Error", { status: 500 }));

    await expect(
      classifyPolicies(mockEnv(fetchFn), makePolicies(1)),
    ).rejects.toThrow("LLM Router error 500");
  });

  it("throws on LLM API failure response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { message: "rate limited" } }),
        { status: 200 },
      ),
    );

    await expect(
      classifyPolicies(mockEnv(fetchFn), makePolicies(1)),
    ).rejects.toThrow("rate limited");
  });

  it("retries missing policies with smaller batch and succeeds", async () => {
    const policies = makePolicies(5);
    // First call returns only 3 of 5
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(
        llmResponse([
          { policyId: "pol-0", category: "charging", confidence: 0.9 },
          { policyId: "pol-1", category: "payment", confidence: 0.85 },
          { policyId: "pol-3", category: "gift", confidence: 0.88 },
        ]),
      )
      // Retry call returns the missing 2
      .mockResolvedValueOnce(
        llmResponse([
          { policyId: "pol-2", category: "member", confidence: 0.82 },
          { policyId: "pol-4", category: "security", confidence: 0.79 },
        ]),
      );

    const results = await classifyPolicies(mockEnv(fetchFn), policies);

    expect(results).toHaveLength(5);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(results.find((r) => r.policyId === "pol-2")?.category).toBe("member");
    expect(results.find((r) => r.policyId === "pol-4")?.category).toBe("security");
  });

  it("falls back to 'other' when retry also fails", async () => {
    const policies = makePolicies(3);
    // First call returns only 1
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(
        llmResponse([
          { policyId: "pol-0", category: "charging", confidence: 0.9 },
        ]),
      )
      // Retry call fails
      .mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const results = await classifyPolicies(mockEnv(fetchFn), policies);

    expect(results).toHaveLength(3);
    // pol-1 and pol-2 should be fallback "other"
    const pol1 = results.find((r) => r.policyId === "pol-1");
    const pol2 = results.find((r) => r.policyId === "pol-2");
    expect(pol1?.category).toBe("other");
    expect(pol1?.confidence).toBe(0);
    expect(pol2?.category).toBe("other");
  });

  it("handles partial retry success — classifies some, falls back rest", async () => {
    const policies = makePolicies(4);
    // First call returns 2 of 4
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(
        llmResponse([
          { policyId: "pol-0", category: "charging", confidence: 0.9 },
          { policyId: "pol-2", category: "gift", confidence: 0.88 },
        ]),
      )
      // Retry returns only 1 of 2 missing
      .mockResolvedValueOnce(
        llmResponse([
          { policyId: "pol-1", category: "payment", confidence: 0.85 },
        ]),
      );

    const results = await classifyPolicies(mockEnv(fetchFn), policies);

    expect(results).toHaveLength(4);
    // pol-3 was missing from both calls → fallback
    const pol3 = results.find((r) => r.policyId === "pol-3");
    expect(pol3?.category).toBe("other");
    expect(pol3?.confidence).toBe(0);
  });
});
