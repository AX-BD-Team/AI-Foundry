import { z } from "zod";

// ── Prompt Registry ──────────────────────────────────────────────

/** Input for POST /prompts — register a new prompt version */
export const CreatePromptVersionSchema = z.object({
  promptName: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/), // semver
  stage: z.string().min(1), // e.g. "extraction", "policy-inference"
  content: z.string().min(1), // the prompt text
  rolloutPct: z.number().int().min(0).max(100).default(0),
  createdBy: z.string().min(1),
});

export type CreatePromptVersion = z.infer<typeof CreatePromptVersionSchema>;

/** DB row representation for prompt_versions table */
export interface PromptVersionRecord {
  promptVersionId: string;
  promptName: string;
  version: string;
  stage: string;
  content: string;
  rolloutPct: number;
  isActive: boolean;
  goldenTestPassed: boolean;
  createdBy: string;
  createdAt: string;
  activatedAt: string | null;
}

// ── Trust Evaluation ─────────────────────────────────────────────

/** Input for POST /trust — record a trust evaluation */
export const CreateTrustEvaluationSchema = z.object({
  targetType: z.enum(["output", "skill", "system"]),
  targetId: z.string().min(1),
  level: z.enum(["L1", "L2", "L3"]),
  score: z.number().min(0).max(1),
  evaluator: z.string().min(1),
  notes: z.string().optional(),
});

export type CreateTrustEvaluation = z.infer<typeof CreateTrustEvaluationSchema>;

// ── Quality Evaluation ──────────────────────────────────────────

export const QualityDimensionSchema = z.enum([
  "parsing_accuracy",
  "extraction_completeness",
  "policy_correctness",
  "term_coverage",
  "skill_usability",
]);

export type QualityDimension = z.infer<typeof QualityDimensionSchema>;

export const CreateQualityEvaluationSchema = z.object({
  batchId: z.string().optional(),
  targetType: z.enum(["document", "extraction", "policy", "skill"]),
  targetId: z.string().min(1),
  dimension: QualityDimensionSchema,
  score: z.number().min(0).max(1),
  evaluator: z.string().min(1),
  notes: z.string().optional(),
});

export type CreateQualityEvaluation = z.infer<typeof CreateQualityEvaluationSchema>;
