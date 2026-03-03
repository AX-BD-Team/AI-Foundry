import { describe, it, expect, vi } from "vitest";
import { classifyDocument } from "../parsing/classifier.js";
import { maskText } from "../parsing/masking.js";
import { parseDocument } from "../parsing/unstructured.js";
import type { UnstructuredElement } from "../parsing/unstructured.js";
import type { Env } from "../env.js";

// ── classifyDocument ─────────────────────────────────────────────

describe("classifyDocument", () => {
  it("classifies ERD documents", () => {
    const elements: UnstructuredElement[] = [
      { type: "Title", text: "ERD 설계서" },
      { type: "Text", text: "엔터티 관계 다이어그램" },
    ];
    const result = classifyDocument(elements, "pdf");
    expect(result.category).toBe("erd");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("classifies screen design documents", () => {
    const elements: UnstructuredElement[] = [
      { type: "Title", text: "화면 설계서" },
      { type: "Text", text: "UI 컴포넌트 정의" },
    ];
    const result = classifyDocument(elements, "pptx");
    expect(result.category).toBe("screen_design");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("classifies API spec documents", () => {
    const elements: UnstructuredElement[] = [
      { type: "Text", text: "API endpoint specification" },
    ];
    const result = classifyDocument(elements, "docx");
    expect(result.category).toBe("api_spec");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("classifies requirements documents", () => {
    const elements: UnstructuredElement[] = [
      { type: "Text", text: "요구사항 명세서" },
    ];
    const result = classifyDocument(elements, "docx");
    expect(result.category).toBe("requirements");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("classifies process documents", () => {
    const elements: UnstructuredElement[] = [
      { type: "Text", text: "업무 프로세스 정의서" },
    ];
    const result = classifyDocument(elements, "pdf");
    expect(result.category).toBe("process");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("returns general for unrecognized content", () => {
    const elements: UnstructuredElement[] = [
      { type: "Text", text: "Lorem ipsum dolor sit amet" },
    ];
    const result = classifyDocument(elements, "pdf");
    expect(result.category).toBe("general");
    expect(result.confidence).toBe(0.3);
  });

  it("returns general for empty elements array", () => {
    const result = classifyDocument([], "pdf");
    expect(result.category).toBe("general");
    expect(result.confidence).toBe(0.3);
  });

  it("classifies based on combined text from all elements", () => {
    const elements: UnstructuredElement[] = [
      { type: "Title", text: "시스템 설계" },
      { type: "Text", text: "swagger 기반" },
    ];
    // "swagger" is an API keyword
    const result = classifyDocument(elements, "pdf");
    expect(result.category).toBe("api_spec");
  });

  it("selects category with highest score when multiple match", () => {
    // Contains both ERD and API keywords — ERD has more matches (3 vs 2)
    const elements: UnstructuredElement[] = [
      { type: "Text", text: "ERD entity API endpoint swagger" },
    ];
    const result = classifyDocument(elements, "pdf");
    // ERD: "erd"(1) + "entity"(1) = 2, API: "api"(1) + "endpoint"(1) + "swagger"(1) = 3
    expect(result.category).toBe("api_spec");
  });

  it("handles entity keyword for erd classification", () => {
    const elements: UnstructuredElement[] = [
      { type: "Text", text: "The entity relationship diagram shows..." },
    ];
    const result = classifyDocument(elements, "pdf");
    expect(result.category).toBe("erd");
  });

  it("handles UX keyword for screen_design classification", () => {
    const elements: UnstructuredElement[] = [
      { type: "Text", text: "UX 디자인 가이드라인" },
    ];
    const result = classifyDocument(elements, "pdf");
    expect(result.category).toBe("screen_design");
  });

  it("handles requirement keyword for requirements classification", () => {
    const elements: UnstructuredElement[] = [
      { type: "Text", text: "system requirement specification" },
    ];
    const result = classifyDocument(elements, "pdf");
    expect(result.category).toBe("requirements");
  });

  it("handles 절차 keyword for process classification", () => {
    const elements: UnstructuredElement[] = [
      { type: "Text", text: "업무 절차 매뉴얼" },
    ];
    const result = classifyDocument(elements, "pdf");
    expect(result.category).toBe("process");
  });

  it("boosts xlsx fileType for requirements/process", () => {
    const elements: UnstructuredElement[] = [
      { type: "Text", text: "general content without keywords" },
    ];
    const result = classifyDocument(elements, "xlsx");
    // xlsx boost: requirements += 0.5, process += 0.3
    expect(result.category).toBe("requirements");
  });
});

// ── maskText ─────────────────────────────────────────────────────

describe("maskText", () => {
  function mockSecurity(response: Response): Fetcher {
    return { fetch: vi.fn().mockResolvedValue(response) } as unknown as Fetcher;
  }

  it("returns masked text on successful masking response", async () => {
    const security = mockSecurity(
      new Response(JSON.stringify({ success: true, data: { maskedText: "[MASKED] text" } }), { status: 200 }),
    );
    const result = await maskText("doc-1", "sensitive text", security, "secret");
    expect(result).toBe("[MASKED] text");
  });

  it("returns original text when masking service returns non-ok", async () => {
    const security = mockSecurity(
      new Response("Service Unavailable", { status: 503 }),
    );
    const result = await maskText("doc-1", "original text", security, "secret");
    expect(result).toBe("original text");
  });

  it("returns original text when masking response has success=false", async () => {
    const security = mockSecurity(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    );
    const result = await maskText("doc-1", "original text", security, "secret");
    expect(result).toBe("original text");
  });

  it("returns original text when masking response has no data field", async () => {
    const security = mockSecurity(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const result = await maskText("doc-1", "original text", security, "secret");
    expect(result).toBe("original text");
  });

  it("returns original text when fetch throws", async () => {
    const security = {
      fetch: vi.fn().mockRejectedValue(new Error("Network error")),
    } as unknown as Fetcher;
    const result = await maskText("doc-1", "original text", security, "secret");
    expect(result).toBe("original text");
  });

  it("sends correct request to security service", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { maskedText: "m" } }), { status: 200 }),
    );
    const security = { fetch: fetchFn } as unknown as Fetcher;

    await maskText("doc-1", "some text", security, "my-secret");

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, opts] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://svc-security.internal/mask");
    expect(opts.method).toBe("POST");

    const headers = opts.headers as Record<string, string>;
    expect(headers["X-Internal-Secret"]).toBe("my-secret");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body["documentId"]).toBe("doc-1");
    expect(body["text"]).toBe("some text");
    expect(body["dataClassification"]).toBe("internal");
  });
});

// ── parseDocument ────────────────────────────────────────────────

describe("parseDocument", () => {
  it("returns empty array when API key is not set", async () => {
    const env = {
      UNSTRUCTURED_API_URL: "https://api.unstructured.io",
      UNSTRUCTURED_API_KEY: "",
    } as Env;

    const result = await parseDocument(new ArrayBuffer(10), "file.pdf", "application/pdf", env);
    expect(result).toHaveLength(0);
  });

  it("calls Unstructured API when key is present", async () => {
    const mockResponse = [
      { type: "Title", text: "Document Title", metadata: { page: 1 } },
      { type: "NarrativeText", text: "Some text content" },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    ));

    try {
      const env = {
        UNSTRUCTURED_API_URL: "https://api.unstructured.io",
        UNSTRUCTURED_API_KEY: "test-key",
      } as Env;

      const result = await parseDocument(
        new ArrayBuffer(10),
        "doc.pdf",
        "application/pdf",
        env,
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.type).toBe("Title");
      expect(result[0]?.text).toBe("Document Title");
      expect(result[0]?.metadata).toEqual({ page: 1 });
      expect(result[1]?.type).toBe("NarrativeText");
      expect(result[1]?.text).toBe("Some text content");
      expect(result[1]?.metadata).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when Unstructured API returns error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(
      new Response("Bad Request", { status: 400 }),
    ));

    try {
      const env = {
        UNSTRUCTURED_API_URL: "https://api.unstructured.io",
        UNSTRUCTURED_API_KEY: "test-key",
      } as Env;

      await expect(
        parseDocument(new ArrayBuffer(10), "doc.pdf", "application/pdf", env),
      ).rejects.toThrow("Unstructured.io error 400");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles elements with missing type and text", async () => {
    const mockResponse = [
      { metadata: { page: 1 } },
      { type: "Title" },
      {},
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    ));

    try {
      const env = {
        UNSTRUCTURED_API_URL: "https://api.unstructured.io",
        UNSTRUCTURED_API_KEY: "test-key",
      } as Env;

      const result = await parseDocument(
        new ArrayBuffer(10),
        "doc.pdf",
        "application/pdf",
        env,
      );

      expect(result).toHaveLength(3);
      // Missing type defaults to "Text"
      expect(result[0]?.type).toBe("Text");
      // Missing text defaults to ""
      expect(result[0]?.text).toBe("");
      expect(result[1]?.type).toBe("Title");
      expect(result[1]?.text).toBe("");
      expect(result[2]?.type).toBe("Text");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
