import { z } from "zod";

// AI Foundry Skill Spec — JSON Schema Draft 2020-12 compatible
// Policy code format: POL-{DOMAIN}-{TYPE}-{SEQ}
// e.g. POL-PENSION-WD-HOUSING-001

export const PolicyCodeSchema = z.string().regex(
  /^POL-[A-Z]+-[A-Z-]+-\d{3}$/,
  "Policy code must match POL-{DOMAIN}-{TYPE}-{SEQ} format",
);

export const TrustLevelSchema = z.enum(["unreviewed", "reviewed", "validated"]);
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

export const TrustScoreSchema = z.object({
  level: TrustLevelSchema,
  score: z.number().min(0).max(1),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
  validatedAt: z.string().datetime().optional(),
});

export type TrustScore = z.infer<typeof TrustScoreSchema>;

// Condition-criteria-outcome triple — the core policy unit
export const PolicySchema = z.object({
  code: PolicyCodeSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  condition: z.string().min(1),   // "IF" clause
  criteria: z.string().min(1),    // evaluation criteria
  outcome: z.string().min(1),     // "THEN" clause
  source: z.object({
    documentId: z.string(),
    pageRef: z.string().optional(),
    excerpt: z.string().optional(),
  }),
  trust: TrustScoreSchema,
  tags: z.array(z.string()).default([]),
});

export type Policy = z.infer<typeof PolicySchema>;

export const OntologyRefSchema = z.object({
  graphId: z.string(),
  termUris: z.array(z.string()),
  skosConceptScheme: z.string().optional(),
});

export type OntologyRef = z.infer<typeof OntologyRefSchema>;

export const ProvenanceSchema = z.object({
  sourceDocumentIds: z.array(z.string()),
  organizationId: z.string(),
  extractedAt: z.string().datetime(),
  pipeline: z.object({
    stages: z.array(z.string()),
    models: z.record(z.string()),
  }),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;

export const SkillMetadataSchema = z.object({
  domain: z.string(),           // e.g. "퇴직연금"
  subdomain: z.string().optional(),
  language: z.string().default("ko"),
  version: z.string(),          // semver
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  author: z.string(),
  tags: z.array(z.string()).default([]),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

export const SkillPackageSchema = z.object({
  $schema: z.string().default("https://ai-foundry.ktds.com/schemas/skill/v1"),
  skillId: z.string().uuid(),
  metadata: SkillMetadataSchema,
  policies: z.array(PolicySchema).min(1),
  trust: TrustScoreSchema,
  ontologyRef: OntologyRefSchema,
  provenance: ProvenanceSchema,
  adapters: z.object({
    mcp: z.string().optional(),      // R2 key for MCP adapter
    openapi: z.string().optional(),  // R2 key for OpenAPI adapter
  }).default({}),
});

export type SkillPackage = z.infer<typeof SkillPackageSchema>;

// Lightweight listing type (without full policy bodies)
export type SkillSummary = Pick<SkillPackage, "skillId" | "metadata" | "trust"> & {
  policyCount: number;
  r2Key: string;
};
