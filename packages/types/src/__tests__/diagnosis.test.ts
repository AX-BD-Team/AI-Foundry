import { describe, it, expect } from "vitest";
import {
  DiagnosisTypeSchema,
  SeveritySchema,
  DiagnosisFindingSchema,
  DiagnosisResultSchema,
} from "../diagnosis.js";

// ── DiagnosisTypeSchema ───────────────────────────────────────────────

describe("DiagnosisTypeSchema", () => {
  it("4개 enum 값 모두 허용", () => {
    const types = ["missing", "duplicate", "overspec", "inconsistency"] as const;
    for (const t of types) {
      expect(DiagnosisTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it("잘못된 값 거부", () => {
    expect(DiagnosisTypeSchema.safeParse("unknown").success).toBe(false);
  });
});

// ── SeveritySchema ────────────────────────────────────────────────────

describe("SeveritySchema", () => {
  it("3개 enum 값 모두 허용", () => {
    const severities = ["critical", "warning", "info"] as const;
    for (const s of severities) {
      expect(SeveritySchema.safeParse(s).success).toBe(true);
    }
  });
});

// ── DiagnosisFindingSchema ────────────────────────────────────────────

describe("DiagnosisFindingSchema", () => {
  const validFinding = {
    findingId: "550e8400-e29b-41d4-a716-446655440001",
    type: "missing" as const,
    severity: "critical" as const,
    finding: "중도인출 프로세스에 퇴직급여 산정 단계가 누락",
    evidence: "프로세스정의서 §3.2에 있으나 화면설계서에 없음",
    recommendation: "화면에 퇴직급여 산정 단계를 추가하세요",
    sourceDocumentIds: [],
    relatedProcesses: ["중도인출 프로세스"],
    confidence: 0.9,
  };

  it("정상 입력 파싱 (HITL 기본값 pending)", () => {
    const result = DiagnosisFindingSchema.safeParse(validFinding);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hitlStatus).toBe("pending");
    }
  });

  it("optional relatedEntities 포함 파싱", () => {
    const result = DiagnosisFindingSchema.safeParse({
      ...validFinding,
      relatedEntities: ["퇴직급여"],
    });
    expect(result.success).toBe(true);
  });

  it("HITL 상태 명시적 설정", () => {
    const result = DiagnosisFindingSchema.safeParse({
      ...validFinding,
      hitlStatus: "accepted",
      reviewerComment: "소견 타당함",
      reviewedBy: "reviewer-1",
      reviewedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hitlStatus).toBe("accepted");
    }
  });

  it("confidence 범위 초과 거부 (> 1)", () => {
    const result = DiagnosisFindingSchema.safeParse({
      ...validFinding,
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("confidence 범위 미만 거부 (< 0)", () => {
    const result = DiagnosisFindingSchema.safeParse({
      ...validFinding,
      confidence: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it("findingId가 UUID 형식 아닐 때 거부", () => {
    const result = DiagnosisFindingSchema.safeParse({
      ...validFinding,
      findingId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("필수 필드 누락 거부 (finding 없음)", () => {
    const { finding: _finding, ...without } = validFinding;
    const result = DiagnosisFindingSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("잘못된 hitlStatus 거부", () => {
    const result = DiagnosisFindingSchema.safeParse({
      ...validFinding,
      hitlStatus: "unknown_status",
    });
    expect(result.success).toBe(false);
  });
});

// ── DiagnosisResultSchema ─────────────────────────────────────────────

describe("DiagnosisResultSchema", () => {
  it("정상 입력 파싱 (빈 findings)", () => {
    const result = DiagnosisResultSchema.safeParse({
      diagnosisId: "550e8400-e29b-41d4-a716-446655440001",
      documentId: "doc-1",
      extractionId: "ext-1",
      organizationId: "org-1",
      findings: [],
      summary: {
        totalFindings: 0,
        byType: { missing: 0, duplicate: 0, overspec: 0, inconsistency: 0 },
        bySeverity: { critical: 0, warning: 0, info: 0 },
      },
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("findings 배열에 유효한 소견 포함", () => {
    const result = DiagnosisResultSchema.safeParse({
      diagnosisId: "550e8400-e29b-41d4-a716-446655440001",
      documentId: "doc-1",
      extractionId: "ext-1",
      organizationId: "org-1",
      findings: [
        {
          findingId: "550e8400-e29b-41d4-a716-446655440001",
          type: "inconsistency",
          severity: "warning",
          finding: "두 문서 간 정합성 불일치",
          evidence: "문서 A와 B에서 다른 값",
          recommendation: "통일 필요",
          sourceDocumentIds: ["doc-a", "doc-b"],
          relatedProcesses: ["가입 프로세스"],
          confidence: 0.7,
        },
      ],
      summary: {
        totalFindings: 1,
        byType: { missing: 0, duplicate: 0, overspec: 0, inconsistency: 1 },
        bySeverity: { critical: 0, warning: 1, info: 0 },
      },
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("diagnosisId가 UUID 형식 아닐 때 거부", () => {
    const result = DiagnosisResultSchema.safeParse({
      diagnosisId: "not-a-uuid",
      documentId: "doc-1",
      extractionId: "ext-1",
      organizationId: "org-1",
      findings: [],
      summary: {
        totalFindings: 0,
        byType: { missing: 0, duplicate: 0, overspec: 0, inconsistency: 0 },
        bySeverity: { critical: 0, warning: 0, info: 0 },
      },
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
