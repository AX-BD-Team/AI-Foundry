/**
 * Working Prototype (반제품) — 타입 정의
 *
 * AI Foundry 5-Stage 파이프라인 결과물을 통합하여
 * 새 프로젝트의 출발점이 되는 Working Prototype 패키지를 정의한다.
 */
import { z } from "zod";

// ── Origin (원천 추적 메타데이터) ────────────────

export const PrototypeOriginSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  domain: z.string(),
  generatedAt: z.string(),
  generatedBy: z.literal("ai-foundry-prototype-generator"),
  version: z.string().default("1.0.0"),
  pipeline: z.object({
    documentCount: z.number().int(),
    policyCount: z.number().int(),
    termCount: z.number().int(),
    skillCount: z.number().int(),
    extractionCount: z.number().int(),
  }),
  sourceServices: z.object({
    policy: z.string(),
    ontology: z.string(),
    extraction: z.string(),
    ingestion: z.string(),
    skill: z.string(),
  }).optional(),
});

// ── Manifest (패키지 매니페스트) ─────────────────

export const PrototypeFileEntrySchema = z.object({
  path: z.string(),
  type: z.enum(["spec", "schema", "rules", "ontology", "meta", "readme"]),
  generatedBy: z.enum(["mechanical", "llm-sonnet", "template"]),
  sourceCount: z.number().int(),
});

export const PrototypeManifestSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  files: z.array(PrototypeFileEntrySchema),
  generationParams: z.object({
    llmModel: z.string().default("claude-sonnet"),
    includeScreenSpec: z.boolean().default(false),
    maxPoliciesPerScenario: z.number().int().default(20),
  }),
});

// ── Generate Request ────────────────────────────

export const GeneratePrototypeOptionsSchema = z.object({
  includeScreenSpec: z.boolean().default(false),
  maxPoliciesPerScenario: z.number().int().min(1).max(50).default(20),
  skipLlm: z.boolean().default(false),
});

export const GeneratePrototypeRequestSchema = z.object({
  organizationId: z.string().min(1),
  organizationName: z.string().min(1).optional(),
  options: GeneratePrototypeOptionsSchema.optional(),
});

// ── Prototype Record (D1 행) ────────────────────

export const PrototypeStatusSchema = z.enum(["generating", "completed", "failed"]);

export const PrototypeRecordSchema = z.object({
  prototypeId: z.string(),
  organizationId: z.string(),
  version: z.string(),
  status: PrototypeStatusSchema,
  r2Key: z.string().optional(),
  docCount: z.number().int(),
  policyCount: z.number().int(),
  termCount: z.number().int(),
  skillCount: z.number().int(),
  generationParams: z.string().optional(),
  errorMessage: z.string().optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
});

// ── Type exports ────────────────────────────────

export type PrototypeOrigin = z.infer<typeof PrototypeOriginSchema>;
export type PrototypeFileEntry = z.infer<typeof PrototypeFileEntrySchema>;
export type PrototypeManifest = z.infer<typeof PrototypeManifestSchema>;
export type GeneratePrototypeOptions = z.infer<typeof GeneratePrototypeOptionsSchema>;
export type GeneratePrototypeRequest = z.infer<typeof GeneratePrototypeRequestSchema>;
export type PrototypeStatus = z.infer<typeof PrototypeStatusSchema>;
export type PrototypeRecord = z.infer<typeof PrototypeRecordSchema>;

// ── Generated File (내부용) ─────────────────────

export interface GeneratedFile {
  path: string;
  content: string;
  type: PrototypeFileEntry["type"];
  generatedBy: PrototypeFileEntry["generatedBy"];
  sourceCount: number;
}
