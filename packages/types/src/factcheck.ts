import { z } from "zod";

// === Gap Types ===
export const GapTypeSchema = z.enum([
  "SM",   // Schema Mismatch
  "MC",   // Missing Column
  "PM",   // Parameter Mismatch
  "TM",   // Type Mismatch
  "MID",  // Missing in Document
]);

export const GapSeveritySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

export const ReviewStatusSchema = z.enum([
  "pending", "confirmed", "dismissed", "modified",
]);

// === Matched Item ===
export const MatchedItemSchema = z.object({
  sourceRef: z.object({
    name: z.string(),
    type: z.string(),
    documentId: z.string(),
    location: z.string(),
  }),
  docRef: z.object({
    name: z.string(),
    type: z.string(),
    documentId: z.string(),
    location: z.string(),
  }).optional(),
  matchScore: z.number().min(0).max(1),
  matchMethod: z.enum(["exact", "fuzzy", "llm", "unmatched"]),
});

// === Fact Check Result ===
export const FactCheckResultSchema = z.object({
  resultId: z.string(),
  organizationId: z.string(),
  specType: z.enum(["api", "table", "mixed"]),
  sourceDocumentIds: z.array(z.string()),
  docDocumentIds: z.array(z.string()),
  totalSourceItems: z.number().int(),
  totalDocItems: z.number().int(),
  matchedItems: z.number().int(),
  gapCount: z.number().int(),
  coveragePct: z.number(),
  gapsByType: z.record(GapTypeSchema, z.number().int()),
  gapsBySeverity: z.record(GapSeveritySchema, z.number().int()),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  matchResultJson: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

// === Fact Check Gap ===
export const FactCheckGapSchema = z.object({
  gapId: z.string(),
  resultId: z.string(),
  organizationId: z.string(),
  gapType: GapTypeSchema,
  severity: GapSeveritySchema,
  sourceItem: z.string(),
  sourceDocumentId: z.string().optional(),
  documentItem: z.string().optional(),
  documentId: z.string().optional(),
  description: z.string(),
  evidence: z.string().optional(),
  autoResolved: z.boolean().default(false),
  reviewStatus: ReviewStatusSchema,
  reviewerId: z.string().optional(),
  reviewerComment: z.string().optional(),
  reviewedAt: z.string().optional(),
  createdAt: z.string(),
});

export type GapType = z.infer<typeof GapTypeSchema>;
export type GapSeverity = z.infer<typeof GapSeveritySchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type MatchedItem = z.infer<typeof MatchedItemSchema>;
export type FactCheckResult = z.infer<typeof FactCheckResultSchema>;
export type FactCheckGap = z.infer<typeof FactCheckGapSchema>;
