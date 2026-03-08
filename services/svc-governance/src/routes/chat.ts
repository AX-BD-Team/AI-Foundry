/**
 * POST /chat — AI Agent with Tool Use
 * Direct Anthropic API call with service binding tools.
 * Bypasses svc-llm-router / AI Gateway to avoid SSE UTF-8 Korean corruption.
 */

import { badRequest, createLogger, extractRbacContext } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { runAgentLoop } from "../agent/loop.js";
import { buildSystemPrompt } from "../system-prompt.js";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  message: string;
  history?: ChatMessage[] | undefined;
  page?: string | undefined;
  role?: string | undefined;
}

function validateChatRequest(body: unknown): { ok: true; data: ChatRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be an object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b["message"] !== "string" || b["message"].length === 0 || b["message"].length > 2000) {
    return { ok: false, error: "message must be a non-empty string (max 2000 chars)" };
  }

  const history: ChatMessage[] = [];
  if (b["history"] !== undefined) {
    if (!Array.isArray(b["history"]) || b["history"].length > 20) {
      return { ok: false, error: "history must be an array (max 20 items)" };
    }
    for (const item of b["history"]) {
      if (typeof item !== "object" || item === null) {
        return { ok: false, error: "history items must be objects" };
      }
      const m = item as Record<string, unknown>;
      if (m["role"] !== "user" && m["role"] !== "assistant") {
        return { ok: false, error: "history item role must be 'user' or 'assistant'" };
      }
      if (typeof m["content"] !== "string") {
        return { ok: false, error: "history item content must be a string" };
      }
      history.push({ role: m["role"], content: m["content"] });
    }
  }

  return {
    ok: true,
    data: {
      message: b["message"] as string,
      history,
      page: typeof b["page"] === "string" ? b["page"] : undefined,
      role: typeof b["role"] === "string" ? b["role"] : undefined,
    },
  };
}

const logger = createLogger("svc-governance:chat");

export async function handleChat(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const validation = validateChatRequest(body);
  if (!validation.ok) {
    return badRequest(validation.error);
  }

  const { message, history = [], page, role } = validation.data;

  const rbacCtx = extractRbacContext(request);
  const effectiveRole = role ?? rbacCtx?.role;
  const organizationId = rbacCtx?.organizationId ?? request.headers.get("X-Organization-Id") ?? "default";

  const systemPrompt = buildSystemPrompt({ page, role: effectiveRole });

  try {
    const result = await runAgentLoop(message, history, systemPrompt, env, organizationId);

    logger.info("Agent response", {
      turns: result.turns,
      toolsUsed: result.toolsUsed,
      provider: result.provider,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          content: result.content,
          toolsUsed: result.toolsUsed,
          provider: result.provider,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  } catch (e) {
    logger.error("Chat agent error", { error: String(e) });
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "AGENT_ERROR", message: "AI 응답 생성에 실패했습니다" },
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}
