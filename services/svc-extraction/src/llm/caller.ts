/**
 * LLM Router 호출자 — svc-llm-router /complete 엔드포인트를 service binding으로 호출한다.
 */

import type { LlmResponse } from "@ai-foundry/types";
import type { ApiResponse } from "@ai-foundry/types";

export async function callLlm(
  prompt: string,
  tier: "sonnet" | "haiku",
  llmRouter: Fetcher,
  internalSecret: string,
): Promise<string> {
  const body = {
    tier,
    messages: [{ role: "user", content: prompt }],
    callerService: "svc-extraction",
    maxTokens: 4096,
  };

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

  return json.data.content;
}
