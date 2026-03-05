import { z } from "zod";

// Cloudflare Queue event types for the pipeline event bus

export const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(), // ISO-8601
  traceId: z.string().optional(),
});

// Stage 1 → Stage 2
export const DocumentUploadedEventSchema = BaseEventSchema.extend({
  type: z.literal("document.uploaded"),
  payload: z.object({
    documentId: z.string(),
    organizationId: z.string(),
    uploadedBy: z.string(),
    r2Key: z.string(),
    fileType: z.enum(["pdf", "ppt", "pptx", "docx", "xlsx", "xls", "png", "jpg", "jpeg", "txt", "java", "sql", "zip"]),
    fileSizeByte: z.number().int(),
    originalName: z.string(),
  }),
});

// Stage 1 → Stage 2 (after ingestion completes parsing)
export const IngestionCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("ingestion.completed"),
  payload: z.object({
    documentId: z.string(),
    organizationId: z.string(),
    chunkCount: z.number().int(),
    classification: z.string(),
    r2Key: z.string(),
    parseDurationMs: z.number().int().optional(),
    chunksValid: z.number().int().optional(),
  }),
});

// Stage 2 → Stage 3
export const ExtractionCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("extraction.completed"),
  payload: z.object({
    documentId: z.string(),
    extractionId: z.string(),
    organizationId: z.string(),
    processNodeCount: z.number().int(),
    entityCount: z.number().int(),
    neo4jGraphId: z.string().optional(),
    processDurationMs: z.number().int().optional(),
    ruleCount: z.number().int().optional(),
  }),
});

// Stage 3: policy candidate → HITL
export const PolicyCandidateReadyEventSchema = BaseEventSchema.extend({
  type: z.literal("policy.candidate_ready"),
  payload: z.object({
    extractionId: z.string(),
    policyId: z.string(),
    hitlSessionId: z.string(),
    organizationId: z.string(),
    reviewerId: z.string().optional(),
    candidateCount: z.number().int(),
  }),
});

// Stage 3: HITL → Stage 4
export const PolicyApprovedEventSchema = BaseEventSchema.extend({
  type: z.literal("policy.approved"),
  payload: z.object({
    policyId: z.string(),
    hitlSessionId: z.string(),
    organizationId: z.string(),
    approvedBy: z.string(),
    approvedAt: z.string().datetime(),
    policyCount: z.number().int(),
    trustScore: z.number().min(0).max(1).optional(),
    wasModified: z.boolean().optional(),
  }),
});

// Stage 4 → Stage 5
export const OntologyNormalizedEventSchema = BaseEventSchema.extend({
  type: z.literal("ontology.normalized"),
  payload: z.object({
    policyId: z.string(),
    ontologyId: z.string(),
    organizationId: z.string(),
    termCount: z.number().int(),
    skosGraphId: z.string().optional(),
  }),
});

// Stage 5: skill package created
export const SkillPackagedEventSchema = BaseEventSchema.extend({
  type: z.literal("skill.packaged"),
  payload: z.object({
    skillId: z.string(),
    ontologyId: z.string(),
    organizationId: z.string(),
    r2Key: z.string(),
    policyCount: z.number().int(),
    trustScore: z.number().min(0).max(1),
    termCount: z.number().int().optional(),
  }),
});

// Stage 2 → Stage 2A: request analysis after extraction completes
export const AnalysisRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal("analysis.requested"),
  payload: z.object({
    documentId: z.string(),
    extractionId: z.string(),
    organizationId: z.string(),
  }),
});

// Stage 2A+2B: analysis (scoring + diagnosis) completed
export const AnalysisCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("analysis.completed"),
  payload: z.object({
    documentId: z.string(),
    extractionId: z.string(),
    organizationId: z.string(),
    analysisId: z.string(),
    findingCount: z.number().int(),
    coreProcessCount: z.number().int(),
  }),
});

// Stage 2B: diagnosis analysis completed (findings generated, ready for HITL)
export const DiagnosisCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("diagnosis.completed"),
  payload: z.object({
    analysisId: z.string(),
    documentId: z.string(),
    organizationId: z.string(),
    findingCount: z.number().int(),
  }),
});

// Stage 2B HITL: diagnosis finding review completed
export const DiagnosisReviewCompletedEventSchema = BaseEventSchema.extend({
  type: z.literal("diagnosis.review_completed"),
  payload: z.object({
    findingId: z.string(),
    analysisId: z.string(),
    organizationId: z.string(),
    reviewerId: z.string(),
    action: z.enum(["accepted", "rejected", "modified"]),
  }),
});

export const PipelineEventSchema = z.discriminatedUnion("type", [
  DocumentUploadedEventSchema,
  IngestionCompletedEventSchema,
  ExtractionCompletedEventSchema,
  PolicyCandidateReadyEventSchema,
  PolicyApprovedEventSchema,
  OntologyNormalizedEventSchema,
  SkillPackagedEventSchema,
  AnalysisRequestedEventSchema,
  AnalysisCompletedEventSchema,
  DiagnosisCompletedEventSchema,
  DiagnosisReviewCompletedEventSchema,
]);

export type DocumentUploadedEvent = z.infer<typeof DocumentUploadedEventSchema>;
export type IngestionCompletedEvent = z.infer<typeof IngestionCompletedEventSchema>;
export type ExtractionCompletedEvent = z.infer<typeof ExtractionCompletedEventSchema>;
export type PolicyCandidateReadyEvent = z.infer<typeof PolicyCandidateReadyEventSchema>;
export type PolicyApprovedEvent = z.infer<typeof PolicyApprovedEventSchema>;
export type OntologyNormalizedEvent = z.infer<typeof OntologyNormalizedEventSchema>;
export type SkillPackagedEvent = z.infer<typeof SkillPackagedEventSchema>;
export type AnalysisRequestedEvent = z.infer<typeof AnalysisRequestedEventSchema>;
export type AnalysisCompletedEvent = z.infer<typeof AnalysisCompletedEventSchema>;
export type DiagnosisCompletedEvent = z.infer<typeof DiagnosisCompletedEventSchema>;
export type DiagnosisReviewCompletedEvent = z.infer<typeof DiagnosisReviewCompletedEventSchema>;
export type PipelineEvent = z.infer<typeof PipelineEventSchema>;
