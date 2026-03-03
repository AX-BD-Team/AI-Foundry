import { z } from "zod";

// ============================================================================
// Layer 3 — Diagnosis Findings (진단 소견)
// ============================================================================

export const DiagnosisTypeSchema = z.enum([
  "missing", // 누락 — 있어야 하는데 없음
  "duplicate", // 중복 — 같은 기능이 2곳 이상
  "overspec", // 오버스펙 — 불필요하게 존재
  "inconsistency", // 정합성 위반 — 문서 간 불일치
]);

export const SeveritySchema = z.enum(["critical", "warning", "info"]);

// ── 단일 진단 소견 — finding-evidence-recommendation 트리플 ──

export const DiagnosisFindingSchema = z.object({
  findingId: z.string().uuid(),
  type: DiagnosisTypeSchema,
  severity: SeveritySchema,

  // 핵심 트리플 (UI 리스트에서 바로 표시)
  finding: z.string(), // "중도인출 프로세스에 퇴직급여 산정 단계가 누락"
  evidence: z.string(), // "프로세스정의서 3.2에 명시되어 있으나 화면설계서 SC-045에 없음"
  recommendation: z.string(), // "화면 SC-045에 퇴직급여 산정 단계를 추가하세요"

  // 연관 맥락 (UI 상세 패널에서 표시)
  sourceDocumentIds: z.array(z.string()),
  relatedProcesses: z.array(z.string()),
  relatedEntities: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),

  // HITL 리뷰 상태 (Reviewer가 갱신)
  hitlStatus: z
    .enum(["pending", "accepted", "rejected", "modified"])
    .default("pending"),
  reviewerComment: z.string().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
});

// ── 진단 결과 전체 ──

export const DiagnosisResultSchema = z.object({
  diagnosisId: z.string().uuid(),
  documentId: z.string(),
  extractionId: z.string(),
  organizationId: z.string(),
  findings: z.array(DiagnosisFindingSchema),
  summary: z.object({
    totalFindings: z.number().int(),
    byType: z.object({
      missing: z.number().int(),
      duplicate: z.number().int(),
      overspec: z.number().int(),
      inconsistency: z.number().int(),
    }),
    bySeverity: z.object({
      critical: z.number().int(),
      warning: z.number().int(),
      info: z.number().int(),
    }),
  }),
  createdAt: z.string().datetime(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type DiagnosisType = z.infer<typeof DiagnosisTypeSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type DiagnosisFinding = z.infer<typeof DiagnosisFindingSchema>;
export type DiagnosisResult = z.infer<typeof DiagnosisResultSchema>;
