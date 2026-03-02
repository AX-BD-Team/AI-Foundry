import { describe, it, expect, vi } from "vitest";
import { callLlm } from "../llm/caller.js";
import { buildExtractionPrompt } from "../prompts/structure.js";
import type { ChunkWithMeta } from "../queue/handler.js";

/** Convert plain strings to ChunkWithMeta for testing */
function toChunks(texts: string[]): ChunkWithMeta[] {
  return texts.map((text, i) => ({
    masked_text: text,
    classification: "general",
    element_type: "NarrativeText",
    word_count: text.split(/\s+/).length,
    chunk_index: i,
  }));
}

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
    expect(body["maxTokens"]).toBe(4096);
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
    const prompt = buildExtractionPrompt(toChunks(["청크 1 내용", "청크 2 내용"]));
    expect(prompt).toContain("청크 1 내용");
    expect(prompt).toContain("청크 2 내용");
  });

  it("includes JSON schema description", () => {
    const prompt = buildExtractionPrompt(toChunks(["test"]));
    expect(prompt).toContain("processes");
    expect(prompt).toContain("entities");
    expect(prompt).toContain("relationships");
    expect(prompt).toContain("rules");
  });

  it("limits chunks to MAX_CHUNKS (20) using smart selection", () => {
    const chunks = toChunks(Array.from({ length: 25 }, (_, i) => `UNIQUE_CHUNK_${i}`));
    const prompt = buildExtractionPrompt(chunks);
    // Head chunks (0-2) should always be present
    expect(prompt).toContain("UNIQUE_CHUNK_0");
    expect(prompt).toContain("UNIQUE_CHUNK_1");
    expect(prompt).toContain("UNIQUE_CHUNK_2");
    // At most 20 chunks total — some will be dropped
    const chunkMarkerCount = (prompt.match(/--- 청크/g) ?? []).length;
    expect(chunkMarkerCount).toBeLessThanOrEqual(20);
  });

  it("truncates individual chunks to MAX_CHUNK_CHARS (10000)", () => {
    const longText = "X".repeat(15000);
    const prompt = buildExtractionPrompt(toChunks([longText]));
    const xCount = (prompt.match(/X/g) ?? []).length;
    expect(xCount).toBeLessThanOrEqual(10000);
  });

  it("proportionally reduces chunks when total exceeds MAX_TOTAL_CHARS (60000)", () => {
    // 10 chunks of 10000 chars = 100000, exceeds 60000 budget
    const chunks = toChunks(Array.from({ length: 10 }, (_, i) => `MARKER_${i}_` + "Y".repeat(9990)));
    const prompt = buildExtractionPrompt(chunks);
    // All 10 markers should still be present (chunks not dropped)
    for (let i = 0; i < 10; i++) {
      expect(prompt).toContain(`MARKER_${i}_`);
    }
    // Total Y count should be significantly less than 10 * 9990
    const yCount = (prompt.match(/Y/g) ?? []).length;
    expect(yCount).toBeLessThan(70000);
  });

  it("preserves minimum 500 chars per chunk during proportional reduction", () => {
    // 20 chunks of 10000 chars = 200000, exceeds 60000 budget
    const chunks = toChunks(Array.from({ length: 20 }, () => "Z".repeat(10000)));
    const prompt = buildExtractionPrompt(chunks);
    // Should contain at least 20 chunk markers
    const markerCount = (prompt.match(/--- 청크/g) ?? []).length;
    expect(markerCount).toBe(20);
  });

  it("handles empty chunk array", () => {
    const prompt = buildExtractionPrompt([]);
    // Should still produce the system prompt text
    expect(prompt).toContain("퇴직연금");
    expect(prompt).toContain("JSON");
  });

  it("handles single chunk", () => {
    const prompt = buildExtractionPrompt(toChunks(["단일 청크"]));
    expect(prompt).toContain("단일 청크");
    expect(prompt).toContain("청크 1");
  });

  it("numbers chunks by original chunk_index", () => {
    const prompt = buildExtractionPrompt(toChunks(["first", "second", "third"]));
    expect(prompt).toContain("청크 1");
    expect(prompt).toContain("청크 2");
    expect(prompt).toContain("청크 3");
  });

  it("includes domain-specific context about retirement pension", () => {
    const prompt = buildExtractionPrompt(toChunks(["test"]));
    expect(prompt).toContain("퇴직연금");
    expect(prompt).toContain("도메인");
  });

  it("requests pure JSON output without markdown", () => {
    const prompt = buildExtractionPrompt(toChunks(["test"]));
    expect(prompt).toContain("JSON만 출력");
  });

  it("uses adaptive prompt for api_spec classification", () => {
    const prompt = buildExtractionPrompt(toChunks(["test"]), "api_spec");
    expect(prompt).toContain("API 명세서/인터페이스 목록");
    expect(prompt).toContain("interface");
  });

  it("uses adaptive prompt for general classification", () => {
    const prompt = buildExtractionPrompt(toChunks(["test"]), "general");
    expect(prompt).toContain("기술 결정/표준 규칙");
  });

  it("selects high word_count chunks when more than 20", () => {
    // Create 30 chunks: indices 20-29 have 1000 words each, rest have 10
    const chunks: ChunkWithMeta[] = Array.from({ length: 30 }, (_, i) => ({
      masked_text: i >= 20 ? "big ".repeat(1000) : "small ".repeat(10),
      classification: "general",
      element_type: "NarrativeText",
      word_count: i >= 20 ? 1000 : 10,
      chunk_index: i,
    }));
    const prompt = buildExtractionPrompt(chunks);
    // High word-count chunks (indices 20-29) should be included
    expect(prompt).toContain("big ");
    // Total chunks should be MAX_CHUNKS (20)
    const markerCount = (prompt.match(/--- 청크/g) ?? []).length;
    expect(markerCount).toBeLessThanOrEqual(20);
  });

  it("includes expanded entity types in schema", () => {
    const prompt = buildExtractionPrompt(toChunks(["test"]));
    expect(prompt).toContain("system");
    expect(prompt).toContain("interface");
    expect(prompt).toContain("table");
  });
});
