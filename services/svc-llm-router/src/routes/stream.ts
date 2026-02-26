import { LlmRequestSchema } from "@ai-foundry/types";
import { errFromUnknown, badRequest, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";
import { resolveTier, buildAnthropicBody } from "../router.js";
import { gatewayStream } from "../gateway.js";

export async function handleStream(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const logger = createLogger("svc-llm-router");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = LlmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid request", parsed.error.flatten());
  }

  const llmRequest = { ...parsed.data, stream: true };
  const requestId = crypto.randomUUID();
  const reqLogger = logger.child({ requestId, callerService: llmRequest.callerService });

  try {
    const { tier, model } = resolveTier(llmRequest, reqLogger);
    const anthropicBody = buildAnthropicBody({ ...llmRequest, tier }, model);

    reqLogger.info("Streaming LLM call initiated", { tier, model });

    return await gatewayStream(env, anthropicBody, requestId);
  } catch (e) {
    reqLogger.error("Streaming LLM call failed", { error: String(e) });
    return errFromUnknown(e);
  }
}
