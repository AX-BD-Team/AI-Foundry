/**
 * POST /chat — AI Agent 가이드 어시스턴트
 * Builds a context-aware system prompt and calls svc-llm-router (haiku tier, non-streaming).
 * Non-streaming avoids Cloudflare AI Gateway SSE UTF-8 corruption for Korean text.
 */

import { badRequest, createLogger, extractRbacContext } from "@ai-foundry/utils";
import type { Env } from "../env.js";
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

  // Use RBAC context from headers if role not provided in body
  const rbacCtx = extractRbacContext(request);
  const effectiveRole = role ?? rbacCtx?.role;

  const systemPrompt = buildSystemPrompt({ page, role: effectiveRole });

  // Build messages array for LLM
  const messages: ChatMessage[] = [
    ...history,
    { role: "user", content: message },
  ];

  // Build LLM request for svc-llm-router /execute (non-streaming)
  // Non-streaming avoids AI Gateway SSE chunk-splitting that corrupts Korean UTF-8
  const llmBody = {
    tier: "haiku" as const,
    messages,
    system: systemPrompt,
    maxTokens: 1024,
    temperature: 0.4,
    callerService: "svc-governance",
  };

  try {
    // Call svc-llm-router via service binding (non-streaming /complete)
    const llmResponse = await env.LLM_ROUTER.fetch(
      new Request("https://llm-router.internal/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
        },
        body: JSON.stringify(llmBody),
      }),
    );

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      logger.error("LLM router error", { status: llmResponse.status, error: errorText });
      return new Response(
        JSON.stringify({ success: false, error: { code: "LLM_ERROR", message: "AI 응답 생성에 실패했습니다" } }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    // Forward the JSON response from LLM router (contains { success, data: { content, ... } })
    const llmData = await llmResponse.json() as Record<string, unknown>;
    return new Response(JSON.stringify(llmData), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    logger.error("Chat handler error", { error: String(e) });
    return new Response(
      JSON.stringify({ success: false, error: { code: "INTERNAL_ERROR", message: "내부 오류가 발생했습니다" } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
