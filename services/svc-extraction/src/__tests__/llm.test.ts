import { describe, it, expect, vi } from "vitest";
import { callLlm } from "../llm/caller.js";
import { buildExtractionPrompt } from "../prompts/structure.js";

// ── callLlm ──────────────────────────────────────────────────────

describe("callLlm", () => {
  function mockFetcher(response: Response): Fetcher {
    return { fetch: vi.fn().mockResolvedValue(response) } as unknown as Fetcher;
  }

  it("returns content on successful response", async () => {
    const fetcher = mockFetcher(
      new Response(
        JSON.stringify({ success: true, data: { content: "extraction-result" } }),
        { status: 200 },
      ),
    );
    const result = await callLlm("prompt", "sonnet", fetcher, "secret");
    expect(result).toBe("extraction-result");
  });

  it("sends correct request body with sonnet tier", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { content: "ok" } }),
        { status: 200 },
      ),
    );
    const fetcher = { fetch: fetchFn } as unknown as Fetcher;

    await callLlm("test-prompt", "sonnet", fetcher, "my-secret");

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://svc-llm-router.internal/complete");
    expect(opts.method).toBe("POST");

    const headers = opts.headers as Record<string, string>;
    expect(headers["X-Internal-Secret"]).toBe("my-secret");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body["tier"]).toBe("sonnet");
    expect(body["callerService"]).toBe("svc-extraction");
    expect(body["maxTokens"]).toBe(2048);
    expect(body["messages"]).toEqual([
      { role: "user", content: "test-prompt" },
    ]);
  });

  it("sends haiku tier when specified", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { content: "ok" } }),
        { status: 200 },
      ),
    );
    const fetcher = { fetch: fetchFn } as unknown as Fetcher;

    await callLlm("prompt", "haiku", fetcher, "secret");

    const body = JSON.parse(
      (fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(body["tier"]).toBe("haiku");
  });

  it("throws on non-OK HTTP status", async () => {
    const fetcher = mockFetcher(
      new Response("Bad Request", { status: 400 }),
    );

    await expect(
      callLlm("prompt", "sonnet", fetcher, "secret"),
    ).rejects.toThrow("LLM Router error 400: Bad Request");
  });

  it("throws on 500 server error", async () => {
    const fetcher = mockFetcher(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(
      callLlm("prompt", "sonnet", fetcher, "secret"),
    ).rejects.toThrow("LLM Router error 500");
  });

  it("throws when API returns success: false", async () => {
    const fetcher = mockFetcher(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "RATE_LIMIT", message: "rate limited" },
        }),
        { status: 200 },
      ),
    );

    await expect(
      callLlm("prompt", "sonnet", fetcher, "secret"),
    ).rejects.toThrow("rate limited");
  });

  it("throws descriptive error on quota exceeded", async () => {
    const fetcher = mockFetcher(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "QUOTA_EXCEEDED", message: "quota exceeded" },
        }),
        { status: 200 },
      ),
    );

    await expect(
      callLlm("prompt", "sonnet", fetcher, "secret"),
    ).rejects.toThrow("quota exceeded");
  });
});

// ── buildExtractionPrompt ────────────────────────────────────────

describe("buildExtractionPrompt", () => {
  it("includes all chunk texts in prompt", () => {
    const chunks = ["청크 1 내용", "청크 2 내용"];
    const prompt = buildExtractionPrompt(chunks);
    expect(prompt).toContain("청크 1 내용");
    expect(prompt).toContain("청크 2 내용");
  });

  it("includes JSON schema description", () => {
    const prompt = buildExtractionPrompt(["test"]);
    expect(prompt).toContain("processes");
    expect(prompt).toContain("entities");
    expect(prompt).toContain("relationships");
    expect(prompt).toContain("rules");
  });

  it("limits chunks to MAX_CHUNKS (20)", () => {
    const chunks = Array.from({ length: 25 }, (_, i) => `UNIQUE_CHUNK_${i}`);
    const prompt = buildExtractionPrompt(chunks);
    // First 20 should be present
    expect(prompt).toContain("UNIQUE_CHUNK_0");
    expect(prompt).toContain("UNIQUE_CHUNK_19");
    // 21st and beyond should not be present
    expect(prompt).not.toContain("UNIQUE_CHUNK_20");
    expect(prompt).not.toContain("UNIQUE_CHUNK_24");
  });

  it("truncates individual chunks to MAX_CHUNK_CHARS (4000)", () => {
    const longText = "X".repeat(6000);
    const prompt = buildExtractionPrompt([longText]);
    // The prompt should not contain the full 6000 chars of X
    // The chunk is truncated to 4000 chars max
    const xCount = (prompt.match(/X/g) ?? []).length;
    expect(xCount).toBeLessThanOrEqual(4000);
  });

  it("handles empty chunk array", () => {
    const prompt = buildExtractionPrompt([]);
    // Should still produce the system prompt text
    expect(prompt).toContain("퇴직연금");
    expect(prompt).toContain("JSON");
  });

  it("handles single chunk", () => {
    const prompt = buildExtractionPrompt(["단일 청크"]);
    expect(prompt).toContain("단일 청크");
    expect(prompt).toContain("청크 1");
  });

  it("numbers chunks sequentially", () => {
    const chunks = ["first", "second", "third"];
    const prompt = buildExtractionPrompt(chunks);
    expect(prompt).toContain("청크 1");
    expect(prompt).toContain("청크 2");
    expect(prompt).toContain("청크 3");
  });

  it("includes domain-specific context about retirement pension", () => {
    const prompt = buildExtractionPrompt(["test"]);
    expect(prompt).toContain("퇴직연금");
    expect(prompt).toContain("도메인");
  });

  it("requests pure JSON output without markdown", () => {
    const prompt = buildExtractionPrompt(["test"]);
    expect(prompt).toContain("JSON만 출력");
  });
});
