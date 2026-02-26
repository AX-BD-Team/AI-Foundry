import type { LlmResponse, LlmUsage } from "@ai-foundry/types";
import { UpstreamError } from "@ai-foundry/utils";
import type { Env } from "./env.js";

/**
 * Send a synchronous (non-streaming) request through the AI Gateway to Anthropic.
 */
export async function gatewayComplete(
  env: Env,
  model: string,
  body: Record<string, unknown>,
  requestId: string,
): Promise<{ raw: Record<string, unknown>; durationMs: number; cached: boolean }> {
  const url = `${env.CLOUDFLARE_AI_GATEWAY_URL}/anthropic/v1/messages`;
  const startMs = Date.now();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "cf-aig-request-id": requestId,
    },
    body: JSON.stringify(body),
  });

  const durationMs = Date.now() - startMs;

  if (!response.ok) {
    const text = await response.text();
    throw new UpstreamError(
      "anthropic",
      `HTTP ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  const raw = await response.json() as Record<string, unknown>;
  const cached = response.headers.get("cf-aig-cache-status") === "HIT";

  return { raw, durationMs, cached };
}

/**
 * Stream request through the AI Gateway, returning the raw Response for SSE passthrough.
 */
export async function gatewayStream(
  env: Env,
  body: Record<string, unknown>,
  requestId: string,
): Promise<Response> {
  const url = `${env.CLOUDFLARE_AI_GATEWAY_URL}/anthropic/v1/messages`;

  const upstreamResponse = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "cf-aig-request-id": requestId,
    },
    body: JSON.stringify(body),
  });

  if (!upstreamResponse.ok) {
    const text = await upstreamResponse.text();
    throw new UpstreamError(
      "anthropic",
      `HTTP ${upstreamResponse.status}: ${text.slice(0, 200)}`,
    );
  }

  // Pass through the SSE stream directly to the caller
  return new Response(upstreamResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
      "X-Request-Id": requestId,
    },
  });
}

/**
 * Parse an Anthropic Messages API response into LlmResponse.
 */
export function parseAnthropicResponse(
  raw: Record<string, unknown>,
  requestId: string,
  tier: import("@ai-foundry/types").LlmTier,
  model: string,
  durationMs: number,
  cached: boolean,
): LlmResponse {
  const content = (raw["content"] as Array<{ type: string; text: string }>)
    ?.filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("") ?? "";

  const usageRaw = raw["usage"] as Record<string, number> | undefined;
  const usage: LlmUsage = {
    inputTokens: usageRaw?.["input_tokens"] ?? 0,
    outputTokens: usageRaw?.["output_tokens"] ?? 0,
    totalTokens: (usageRaw?.["input_tokens"] ?? 0) + (usageRaw?.["output_tokens"] ?? 0),
  };

  return {
    id: requestId,
    tier,
    model,
    content,
    usage,
    durationMs,
    cached,
  };
}
