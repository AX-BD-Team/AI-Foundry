import { z } from "zod";

export const LlmTierSchema = z.enum([
  "opus",     // Tier 1: complexity > 0.7 — Stage 3 policy inference (svc-policy only)
  "sonnet",   // Tier 2: complexity 0.4–0.7 — Stages 2, 4, 5
  "haiku",    // Tier 2: complexity < 0.4 — lightweight tasks
  "workers",  // Tier 3: embeddings, classification, similarity
]);

export type LlmTier = z.infer<typeof LlmTierSchema>;

// Model IDs per tier
export const TIER_MODELS: Record<LlmTier, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
  workers: "@cf/baai/bge-base-en-v1.5",
};

export const LlmMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export type LlmMessage = z.infer<typeof LlmMessageSchema>;

export const LlmRequestSchema = z.object({
  tier: LlmTierSchema,
  messages: z.array(LlmMessageSchema).min(1),
  system: z.string().optional(),
  maxTokens: z.number().int().min(1).max(8192).default(2048),
  temperature: z.number().min(0).max(1).default(0.3),
  stream: z.boolean().default(false),
  callerService: z.string(),    // which SVC is calling (e.g. "svc-policy")
  complexityScore: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string()).optional(),
});

export type LlmRequest = z.infer<typeof LlmRequestSchema>;

export const LlmUsageSchema = z.object({
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  totalTokens: z.number().int(),
});

export type LlmUsage = z.infer<typeof LlmUsageSchema>;

export const LlmResponseSchema = z.object({
  id: z.string(),
  tier: LlmTierSchema,
  model: z.string(),
  content: z.string(),
  usage: LlmUsageSchema,
  durationMs: z.number(),
  cached: z.boolean().default(false),
});

export type LlmResponse = z.infer<typeof LlmResponseSchema>;

// Cost log entry written to D1 llm_cost_log
export type LlmCostLogEntry = {
  requestId: string;
  callerService: string;
  tier: LlmTier;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  cached: boolean;
  createdAt: string; // ISO-8601
};
