import type { LlmTier, LlmRequest } from "@ai-foundry/types";
import { TIER_MODELS } from "@ai-foundry/types";
import type { Logger } from "@ai-foundry/utils";

// Only svc-policy is allowed to call opus tier
const OPUS_AUTHORIZED_SERVICES = new Set(["svc-policy"]);

/**
 * Resolve which LLM tier and model to use.
 * - Enforces opus authorization (only svc-policy may use opus)
 * - Downgrades unauthorized opus calls to sonnet
 */
export function resolveTier(
  request: Pick<LlmRequest, "tier" | "callerService" | "complexityScore">,
  logger: Logger,
): { tier: LlmTier; model: string; downgraded: boolean } {
  let { tier } = request;
  let downgraded = false;

  if (tier === "opus" && !OPUS_AUTHORIZED_SERVICES.has(request.callerService)) {
    logger.warn("Unauthorized opus call downgraded to sonnet", {
      callerService: request.callerService,
      requestedTier: tier,
    });
    tier = "sonnet";
    downgraded = true;
  }

  // Auto-select tier by complexity score if not opus
  if (tier !== "opus" && request.complexityScore !== undefined) {
    const score = request.complexityScore;
    if (score >= 0.7) {
      // Only svc-policy can use opus; others use sonnet for high complexity
      tier = OPUS_AUTHORIZED_SERVICES.has(request.callerService) ? "opus" : "sonnet";
    } else if (score >= 0.4) {
      tier = "sonnet";
    } else {
      tier = "haiku";
    }
  }

  const model = TIER_MODELS[tier];
  return { tier, model, downgraded };
}

/**
 * Build the Anthropic Messages API request body.
 */
export function buildAnthropicBody(
  request: LlmRequest,
  model: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: request.maxTokens,
    temperature: request.temperature,
    messages: request.messages.map((m) => ({
      role: m.role === "system" ? "user" : m.role,
      content: m.content,
    })),
  };

  if (request.system) {
    body["system"] = request.system;
  }

  if (request.stream) {
    body["stream"] = true;
  }

  return body;
}
