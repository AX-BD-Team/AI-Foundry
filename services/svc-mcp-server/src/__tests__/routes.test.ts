import { describe, it, expect, vi, beforeEach } from "vitest";
import handler from "../index.js";
import type { Env } from "../env.js";

// ── Test data ───────────────────────────────────────────────────────

const mcpAdapterResponse = {
  protocolVersion: "2024-11-05",
  capabilities: { tools: { listChanged: false } },
  serverInfo: { name: "ai-foundry-skill-test", version: "1.0.0" },
  instructions: "AI Foundry Skill for test. 1 policy tool(s) available.",
  name: "ai-foundry-skill-test",
  version: "1.0.0",
  description: "AI Foundry Skill: test",
  tools: [
    {
      name: "pol-test-001",
      description: "Test policy tool",
      inputSchema: {
        type: "object",
        properties: {
          context: { type: "string", description: "context" },
          parameters: { type: "object", description: "params" },
        },
        required: ["context"],
      },
      annotations: {
        title: "Test Policy",
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
  ],
  metadata: {
    skillId: "sk-route-test",
    domain: "test",
    trustLevel: "reviewed",
    trustScore: 0.9,
    generatedAt: "2026-03-04T00:00:00.000Z",
  },
};

const evaluateResponse = {
  success: true,
  data: {
    evaluationId: "eval-route-001",
    skillId: "sk-route-test",
    policyCode: "POL-TEST-001",
    provider: "anthropic",
    model: "claude-sonnet-4-6-20250514",
    result: "APPLICABLE",
    confidence: 0.88,
    reasoning: "Test reasoning output",
    latencyMs: 500,
  },
};

// ── Mock helpers ────────────────────────────────────────────────────

function createMockEnv(overrides?: Partial<Env>): Env {
  const mockFetch = vi.fn(async (input: RequestInfo) => {
    const url = typeof input === "string" ? input : (input as Request).url;

    if (url.includes("/mcp")) {
      return Response.json(mcpAdapterResponse, { status: 200 });
    }
    if (url.includes("/evaluate")) {
      return Response.json(evaluateResponse, { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  });

  return {
    SVC_SKILL: { fetch: mockFetch } as unknown as Fetcher,
    INTERNAL_API_SECRET: "test-secret-routes",
    ENVIRONMENT: "test",
    SERVICE_NAME: "svc-mcp-server",
    ...overrides,
  };
}

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function jsonRpcRequest(
  skillId: string,
  method: string,
  params?: unknown,
  id?: number,
  authHeader?: string,
): Request {
  const body: Record<string, unknown> = {
    jsonrpc: "2.0",
    method,
  };
  if (id !== undefined) {
    body["id"] = id;
  }
  if (params !== undefined) {
    body["params"] = params;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (authHeader !== undefined) {
    headers["Authorization"] = authHeader;
  } else {
    headers["Authorization"] = "Bearer test-secret-routes";
  }

  return new Request(`https://test.workers.dev/mcp/${skillId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ── Route-level Tests ──────────────────────────────────────────────

describe("svc-mcp-server routes", () => {
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    env = createMockEnv();
    ctx = mockCtx();
  });

  // ── Health endpoint ────────────────────────────────────────────

  describe("GET /health", () => {
    it("returns 200 with status ok and service name", async () => {
      const req = new Request("https://test.workers.dev/health");
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; service: string };
      expect(body.status).toBe("ok");
      expect(body.service).toBe("svc-mcp-server");
    });

    it("includes Content-Type application/json header", async () => {
      const req = new Request("https://test.workers.dev/health");
      const res = await handler.fetch(req, env, ctx);
      expect(res.headers.get("Content-Type")).toBe("application/json");
    });

    it("includes CORS headers", async () => {
      const req = new Request("https://test.workers.dev/health");
      const res = await handler.fetch(req, env, ctx);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  // ── MCP initialize ────────────────────────────────────────────

  describe("POST /mcp/:skillId — initialize", () => {
    it("returns capabilities with tools support", async () => {
      const req = jsonRpcRequest(
        "sk-route-test",
        "initialize",
        {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0" },
        },
        1,
      );
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        jsonrpc: string;
        id: number;
        result: {
          protocolVersion: string;
          capabilities: { tools: Record<string, unknown> };
          serverInfo: { name: string; version: string };
        };
      };
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(1);
      expect(body.result.capabilities.tools).toBeDefined();
      expect(body.result.serverInfo.name).toBe("ai-foundry-skill-test");
      expect(body.result.serverInfo.version).toBe("1.0.0");
    });
  });

  // ── MCP tools/list ────────────────────────────────────────────

  describe("POST /mcp/:skillId — tools/list", () => {
    it("returns tools array from skill adapter", async () => {
      const req = jsonRpcRequest("sk-route-test", "tools/list", {}, 2);
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        jsonrpc: string;
        id: number;
        result: {
          tools: Array<{
            name: string;
            description: string;
            inputSchema: Record<string, unknown>;
          }>;
        };
      };
      expect(body.result.tools).toHaveLength(1);
      expect(body.result.tools[0]?.name).toBe("pol-test-001");
    });
  });

  // ── Auth: Bearer token missing ────────────────────────────────

  describe("POST /mcp/:skillId — auth failure", () => {
    it("returns 401 when no auth headers provided", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-route-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(401);
      const body = (await res.json()) as {
        jsonrpc: string;
        error: { code: number; message: string };
      };
      expect(body.jsonrpc).toBe("2.0");
      expect(body.error.code).toBe(-32000);
      expect(body.error.message).toBe("Unauthorized");
    });

    it("returns 401 when Bearer token is wrong", async () => {
      const req = jsonRpcRequest(
        "sk-route-test",
        "initialize",
        {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
        1,
        "Bearer wrong-token",
      );
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(401);
    });
  });

  // ── Auth: X-Internal-Secret ───────────────────────────────────

  describe("POST /mcp/:skillId — X-Internal-Secret auth", () => {
    it("accepts X-Internal-Secret header for inter-service calls", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-route-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "X-Internal-Secret": "test-secret-routes",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "internal-svc", version: "1.0" },
          },
        }),
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(200);
    });
  });

  // ── CORS preflight ────────────────────────────────────────────

  describe("OPTIONS /mcp/:skillId — CORS preflight", () => {
    it("returns 204 with CORS headers", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-route-test", {
        method: "OPTIONS",
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain(
        "DELETE",
      );
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
        "Authorization",
      );
      expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
        "Mcp-Session-Id",
      );
    });

    it("does not require authentication", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-route-test", {
        method: "OPTIONS",
      });
      // No auth headers at all
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(204);
    });
  });

  // ── Invalid JSON-RPC method ───────────────────────────────────

  describe("POST /mcp/:skillId — invalid JSON-RPC method", () => {
    it("returns error for unknown JSON-RPC method", async () => {
      const req = jsonRpcRequest("sk-route-test", "nonexistent/method", {}, 99);
      const res = await handler.fetch(req, env, ctx);
      // MCP SDK should return 200 with a JSON-RPC error in the body
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        jsonrpc: string;
        id: number;
        error?: { code: number; message: string };
      };
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(99);
      expect(body.error).toBeDefined();
      expect(body.error?.code).toBeLessThan(0);
    });

    it("returns error for empty method string", async () => {
      const req = jsonRpcRequest("sk-route-test", "", {}, 100);
      const res = await handler.fetch(req, env, ctx);
      const body = (await res.json()) as {
        jsonrpc: string;
        error?: { code: number; message: string };
      };
      expect(body.error).toBeDefined();
    });
  });

  // ── Additional edge cases ─────────────────────────────────────

  describe("Edge cases", () => {
    it("returns 404 for unknown path", async () => {
      const req = new Request("https://test.workers.dev/unknown/path");
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(404);
    });

    it("returns 405 for GET on MCP endpoint with auth", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-route-test", {
        method: "GET",
        headers: { Authorization: "Bearer test-secret-routes" },
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(405);
    });

    it("returns 202 for DELETE (session termination)", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-route-test", {
        method: "DELETE",
        headers: { Authorization: "Bearer test-secret-routes" },
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(202);
    });

    it("returns 404 when skill not found (adapter returns null)", async () => {
      const env404 = createMockEnv({
        SVC_SKILL: {
          fetch: vi.fn(
            async () => new Response("Not Found", { status: 404 }),
          ),
        } as unknown as Fetcher,
      });
      const req = jsonRpcRequest(
        "sk-nonexistent",
        "initialize",
        {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
        1,
      );
      const res = await handler.fetch(req, env404, ctx);
      expect(res.status).toBe(404);
      const body = (await res.json()) as {
        jsonrpc: string;
        error: { code: number; message: string };
      };
      expect(body.error.code).toBe(-32602);
      expect(body.error.message).toContain("sk-nonexistent");
    });

    it("CORS headers are present on error responses", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-route-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      });
      const res = await handler.fetch(req, env, ctx);
      // This is a 401 (no auth), but should still have CORS headers
      expect(res.status).toBe(401);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("returns 405 for PUT method on MCP endpoint", async () => {
      const req = new Request("https://test.workers.dev/mcp/sk-route-test", {
        method: "PUT",
        headers: { Authorization: "Bearer test-secret-routes" },
      });
      const res = await handler.fetch(req, env, ctx);
      expect(res.status).toBe(405);
    });
  });
});
