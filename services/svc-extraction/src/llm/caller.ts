/**
 * LLM Router 호출자 — svc-llm-router /complete 엔드포인트를 service binding으로 호출한다.
 */

import type { LlmResponse, LlmProvider } from "@ai-foundry/types";
import type { ApiResponse } from "@ai-foundry/types";

export interface LlmCallResult {
  content: string;
  provider: string;
  model: string;
}

export interface LlmCallOptions {
  provider?: LlmProvider;
}

export async function callLlm(
  prompt: string,
  tier: "sonnet" | "haiku",
  llmRouter: Fetcher,
  internalSecret: string,
  maxTokens = 8192,
  options?: LlmCallOptions,
): Promise<string> {
  const result = await callLlmWithMeta(prompt, tier, llmRouter, internalSecret, maxTokens, options);
  return result.content;
}

export async function callLlmWithMeta(
  prompt: string,
  tier: "sonnet" | "haiku",
  llmRouter: Fetcher,
  internalSecret: string,
  maxTokens = 8192,
  options?: LlmCallOptions,
): Promise<LlmCallResult> {
  const body: Record<string, unknown> = {
    tier,
    messages: [{ role: "user", content: prompt }],
    callerService: "svc-extraction",
    maxTokens,
  };
  if (options?.provider) {
    body["provider"] = options.provider;
  }

  const response = await llmRouter.fetch("https://svc-llm-router.internal/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": internalSecret,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM Router error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as ApiResponse<LlmResponse>;
  if (!json.success) {
    throw new Error(`LLM Router returned failure: ${json.error.message}`);
  }

  return {
    content: json.data.content,
    provider: json.data.provider ?? "unknown",
    model: json.data.model ?? "unknown",
  };
}
