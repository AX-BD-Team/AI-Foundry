/**
 * Agent loop for AI Chat — orchestrates LLM API calls and tool execution.
 * Max 3 turns of tool_use → tool_result before returning final answer.
 * 4-provider fallback: Anthropic → OpenAI → Google → Workers AI (no tools, free).
 */

import { createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import {
  callAnthropic,
  extractTextContent,
  extractToolUseBlocks,
  type AnthropicResponse,
  type ContentBlock,
  type MessageParam,
} from "./anthropic.js";
import { callOpenAI } from "./openai.js";
import { callGoogle } from "./google.js";
import { callWorkersAI } from "./workers-ai.js";
import { executeTool, TOOL_DEFINITIONS } from "./tools.js";

const logger = createLogger("svc-governance:agent:loop");

const MAX_TURNS = 3;

export type ProviderName = "anthropic" | "openai" | "google" | "workers-ai";

export interface AgentResult {
  content: string;
  toolsUsed: string[];
  turns: number;
  provider: ProviderName;
}

type LlmCaller = (
  system: string,
  messages: MessageParam[],
  tools: typeof TOOL_DEFINITIONS,
) => Promise<AnthropicResponse>;

function isRetryableError(e: unknown): boolean {
  const msg = String(e);
  // 401 = invalid key, 402 = credit exhausted, 429 = rate limit, 529 = overloaded, 500/503 = server error
  return msg.includes("401") || msg.includes("402") || msg.includes("429")
    || msg.includes("529") || msg.includes("500") || msg.includes("503");
}

async function executeLoop(
  call: LlmCaller,
  messages: MessageParam[],
  systemPrompt: string,
  env: Env,
  organizationId: string,
): Promise<Omit<AgentResult, "provider">> {
  const toolsUsed: string[] = [];
  let turns = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    turns++;

    const response = await call(systemPrompt, messages, TOOL_DEFINITIONS);
    const toolUseBlocks = extractToolUseBlocks(response);

    if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
      const text = extractTextContent(response);
      return { content: text, toolsUsed, turns };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResultBlocks: ContentBlock[] = [];
    for (const block of toolUseBlocks) {
      const toolName = block.name ?? "unknown";
      const toolInput = (block.input ?? {}) as Record<string, unknown>;
      toolsUsed.push(toolName);

      logger.info("Executing tool", { tool: toolName, turn: turn + 1 });

      let result: string;
      try {
        result = await executeTool(toolName, toolInput, env, organizationId);
      } catch (e) {
        result = JSON.stringify({ success: false, error: String(e) });
      }

      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: block.id ?? "",
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResultBlocks });
  }

  // Max turns reached — final call without tools
  const finalResponse = await call(systemPrompt, messages, []);
  return {
    content: extractTextContent(finalResponse),
    toolsUsed,
    turns: turns + 1,
  };
}

export async function runAgentLoop(
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt: string,
  env: Env,
  organizationId: string,
): Promise<AgentResult> {
  const buildMessages = (): MessageParam[] => [
    ...history.map((m) => ({ role: m.role, content: m.content }) as MessageParam),
    { role: "user" as const, content: userMessage },
  ];

  // Build provider chain: Anthropic → OpenAI → Google → Workers AI (only if key exists)
  const providers: Array<{ name: ProviderName; caller: LlmCaller }> = [];

  if (env.ANTHROPIC_API_KEY) {
    providers.push({
      name: "anthropic",
      caller: (sys, msgs, tools) => callAnthropic(env.ANTHROPIC_API_KEY, sys, msgs, tools),
    });
  }

  if (env.OPENAI_API_KEY) {
    providers.push({
      name: "openai",
      caller: (sys, msgs, tools) => callOpenAI(env.OPENAI_API_KEY, sys, msgs, tools),
    });
  }

  if (env.GOOGLE_API_KEY) {
    providers.push({
      name: "google",
      caller: (sys, msgs, tools) => callGoogle(env.GOOGLE_API_KEY, sys, msgs, tools),
    });
  }

  if (env.AI) {
    providers.push({
      name: "workers-ai",
      caller: (sys, msgs, tools) => callWorkersAI(env.AI, sys, msgs, tools),
    });
  }

  // Try each provider in order, fallback on retryable errors
  let lastError: unknown;

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i]!;
    try {
      const result = await executeLoop(provider.caller, buildMessages(), systemPrompt, env, organizationId);
      return { ...result, provider: provider.name };
    } catch (e) {
      lastError = e;
      const isLast = i === providers.length - 1;
      if (isLast || !isRetryableError(e)) {
        throw e;
      }
      const next = providers[i + 1];
      logger.warn(`${provider.name} failed, falling back to ${next?.name}`, { error: String(e) });
    }
  }

  // Should not reach here, but just in case
  throw lastError ?? new Error("No providers available");
}
