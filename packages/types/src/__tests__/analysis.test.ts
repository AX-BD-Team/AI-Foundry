import { describe, it, expect } from "vitest";
import {
  ScoredProcessSchema,
  ScoredEntitySchema,
  ExtractionSummarySchema,
  CoreJudgmentSchema,
  ProcessTreeNodeSchema,
  CoreIdentificationSchema,
  ServiceGroupSchema,
  ComparisonItemSchema,
  CrossOrgComparisonSchema,
} from "../analysis.js";

// ── ScoredProcessSchema ───────────────────────────────────────────────

describe("ScoredProcessSchema", () => {
  it("정상 입력 파싱", () => {
    const result = ScoredProcessSchema.safeParse({
      name: "중도인출 프로세스",
      description: "중도인출 절차",
      steps: ["신청", "자격확인", "지급"],
      importanceScore: 0.85,
      importanceReason: "6개 문서에서 참조",
      referenceCount: 6,
      dependencyCount: 3,
      isCore: true,
      category: "core",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("중도인출 프로세스");
      expect(result.data.isCore).toBe(true);
      expect(result.data.category).toBe("core");
    }
  });

  it("importanceScore 범위 초과 거부 (> 1)", () => {
    const result = ScoredProcessSchema.safeParse({
      name: "test",
      description: "test",
      steps: [],
      importanceScore: 1.5,
      importanceReason: "",
      referenceCount: 0,
      dependencyCount: 0,
      isCore: false,
      category: "peripheral",
    });
    expect(result.success).toBe(false);
  });

  it("importanceScore 범위 미만 거부 (< 0)", () => {
    const result = ScoredProcessSchema.safeParse({
      name: "test",
      description: "test",
      steps: [],
      importanceScore: -0.1,
      importanceReason: "",
      referenceCount: 0,
      dependencyCount: 0,
      isCore: false,
      category: "supporting",
    });
    expect(result.success).toBe(false);
  });

  it("잘못된 category enum 거부", () => {
    const result = ScoredProcessSchema.safeParse({
      name: "test",
      description: "test",
      steps: [],
      importanceScore: 0.5,
      importanceReason: "",
      referenceCount: 0,
      dependencyCount: 0,
      isCore: false,
      category: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("모든 category enum 허용", () => {
    const categories = ["mega", "core", "supporting", "peripheral"] as const;
    for (const category of categories) {
      const result = ScoredProcessSchema.safeParse({
        name: "test",
        description: "",
        steps: [],
        importanceScore: 0.5,
        importanceReason: "",
        referenceCount: 0,
        dependencyCount: 0,
        isCore: false,
        category,
      });
      expect(result.success, `category '${category}' should be valid`).toBe(true);
    }
  });
});

// ── ScoredEntitySchema ────────────────────────────────────────────────

describe("ScoredEntitySchema", () => {
  it("정상 입력 파싱", () => {
    const result = ScoredEntitySchema.safeParse({
      name: "퇴직연금계좌",
      type: "account",
      attributes: ["계좌번호", "잔액"],
      usageCount: 5,
      isOrphan: false,
    });
    expect(result.success).toBe(true);
  });

  it("잘못된 type enum 거부", () => {
    const result = ScoredEntitySchema.safeParse({
      name: "test",
      type: "unknown_type",
      attributes: [],
      usageCount: 0,
      isOrphan: true,
    });
    expect(result.success).toBe(false);
  });
});

// ── ExtractionSummarySchema ───────────────────────────────────────────

describe("ExtractionSummarySchema", () => {
  it("정상 입력 파싱 (빈 배열 허용)", () => {
    const result = ExtractionSummarySchema.safeParse({
      documentId: "doc-1",
      organizationId: "org-1",
      extractionId: "ext-1",
      counts: { processes: 0, entities: 0, rules: 0, relationships: 0 },
      processes: [],
      entities: [],
      documentClassification: "process",
      analysisTimestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("필수 필드 누락 거부", () => {
    const result = ExtractionSummarySchema.safeParse({
      documentId: "doc-1",
      // organizationId 누락
      extractionId: "ext-1",
    });
    expect(result.success).toBe(false);
  });
});

// ── CoreJudgmentSchema ────────────────────────────────────────────────

describe("CoreJudgmentSchema", () => {
  it("정상 입력 파싱", () => {
    const result = CoreJudgmentSchema.safeParse({
      processName: "중도인출",
      isCore: true,
      score: 0.9,
      factors: {
        frequencyScore: 0.9,
        dependencyScore: 0.8,
        domainRelevanceScore: 0.95,
        dataFlowCentrality: 0.7,
      },
      reasoning: "핵심 업무 프로세스입니다.",
    });
    expect(result.success).toBe(true);
  });

  it("score > 1 거부", () => {
    const result = CoreJudgmentSchema.safeParse({
      processName: "test",
      isCore: false,
      score: 1.1,
      factors: { frequencyScore: 0, dependencyScore: 0, domainRelevanceScore: 0, dataFlowCentrality: 0 },
      reasoning: "",
    });
    expect(result.success).toBe(false);
  });
});

// ── ProcessTreeNodeSchema (재귀 타입) ─────────────────────────────────

describe("ProcessTreeNodeSchema", () => {
  it("단일 노드 파싱", () => {
    const result = ProcessTreeNodeSchema.safeParse({
      name: "퇴직연금 메가 프로세스",
      type: "mega",
      children: [],
      methods: [],
      actors: [],
      dataInputs: [],
      dataOutputs: [],
    });
    expect(result.success).toBe(true);
  });

  it("중첩 자식 노드 파싱 (재귀)", () => {
    const result = ProcessTreeNodeSchema.safeParse({
      name: "메가 프로세스",
      type: "mega",
      children: [
        {
          name: "핵심 프로세스",
          type: "core",
          children: [],
          methods: [{ name: "메서드1", triggerCondition: "조건1" }],
          actors: ["가입자"],
          dataInputs: ["신청서"],
          dataOutputs: ["승인서"],
        },
      ],
      methods: [],
      actors: [],
      dataInputs: [],
      dataOutputs: [],
    });
    expect(result.success).toBe(true);
  });
});

// ── ServiceGroupSchema ────────────────────────────────────────────────

describe("ServiceGroupSchema", () => {
  it("4개 enum 값 모두 허용", () => {
    const values = ["common_standard", "org_specific", "tacit_knowledge", "core_differentiator"] as const;
    for (const v of values) {
      expect(ServiceGroupSchema.safeParse(v).success).toBe(true);
    }
  });

  it("잘못된 값 거부", () => {
    expect(ServiceGroupSchema.safeParse("invalid_group").success).toBe(false);
  });
});

// ── ComparisonItemSchema ──────────────────────────────────────────────

describe("ComparisonItemSchema", () => {
  it("optional 필드 없이 정상 파싱", () => {
    const result = ComparisonItemSchema.safeParse({
      name: "중도인출",
      type: "process",
      serviceGroup: "common_standard",
      presentIn: [
        {
          organizationId: "org-a",
          organizationName: "미래에셋",
          documentIds: [],
        },
      ],
      classificationReason: "두 조직 모두 존재",
    });
    expect(result.success).toBe(true);
  });

  it("optional standardizationScore 포함 파싱", () => {
    const result = ComparisonItemSchema.safeParse({
      name: "가입자격 확인",
      type: "process",
      serviceGroup: "common_standard",
      presentIn: [],
      classificationReason: "공통 표준화 후보",
      standardizationScore: 0.85,
      standardizationNote: "단계 구성 거의 동일",
    });
    expect(result.success).toBe(true);
  });
});

// ── CrossOrgComparisonSchema ──────────────────────────────────────────

describe("CrossOrgComparisonSchema", () => {
  it("정상 입력 파싱", () => {
    const result = CrossOrgComparisonSchema.safeParse({
      comparisonId: "550e8400-e29b-41d4-a716-446655440000",
      organizations: [
        { organizationId: "org-a", organizationName: "미래에셋", documentCount: 5, processCount: 10, policyCount: 20 },
        { organizationId: "org-b", organizationName: "현대증권", documentCount: 3, processCount: 8, policyCount: 15 },
      ],
      items: [],
      groupSummary: { commonStandard: 0, orgSpecific: 0, tacitKnowledge: 0, coreDifferentiator: 0 },
      standardizationCandidates: [],
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("comparisonId가 UUID 형식 아닐 때 거부", () => {
    const result = CrossOrgComparisonSchema.safeParse({
      comparisonId: "not-a-uuid",
      organizations: [],
      items: [],
      groupSummary: { commonStandard: 0, orgSpecific: 0, tacitKnowledge: 0, coreDifferentiator: 0 },
      standardizationCandidates: [],
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});

// ── CoreIdentificationSchema ──────────────────────────────────────────

describe("CoreIdentificationSchema", () => {
  it("정상 입력 파싱 (빈 배열)", () => {
    const result = CoreIdentificationSchema.safeParse({
      documentId: "doc-1",
      organizationId: "org-1",
      coreProcesses: [],
      processTree: [],
      summary: {
        megaProcessCount: 0,
        coreProcessCount: 0,
        supportingProcessCount: 0,
        peripheralProcessCount: 0,
      },
    });
    expect(result.success).toBe(true);
  });
});
