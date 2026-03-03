import { describe, it, expect } from "vitest";
import { buildScoringPrompt, parseScoringResult } from "../prompts/scoring.js";
import { buildDiagnosisPrompt, parseDiagnosisResult } from "../prompts/diagnosis.js";
import { buildComparisonPrompt, parseComparisonResult } from "../prompts/comparison.js";

// ── 공통 픽스처 ────────────────────────────────────────────────────────

const sampleExtraction = {
  processes: [
    { name: "중도인출 프로세스", description: "중도인출 절차", steps: ["신청", "자격확인", "지급"] },
    { name: "가입자격 확인 프로세스", description: "가입 자격 검증", steps: ["서류제출", "심사"] },
    { name: "퇴직급여 산정", description: "퇴직급여 금액 산정", steps: ["산정기준 확인", "금액 계산"] },
  ],
  entities: [
    { name: "퇴직연금계좌", type: "account", attributes: ["계좌번호", "잔액"] },
  ],
  rules: [
    { condition: "가입기간 >= 5년", outcome: "중도인출 허용" },
  ],
  relationships: [
    { from: "가입자", to: "퇴직연금계좌", type: "소유" },
  ],
};

const sampleScoringResult = {
  scoredProcesses: [
    { name: "중도인출 프로세스", category: "core" as const, isCore: true, importanceScore: 0.9, importanceReason: "핵심 업무" },
    { name: "가입자격 확인 프로세스", category: "core" as const, isCore: true, importanceScore: 0.8, importanceReason: "필수 프로세스" },
    { name: "퇴직급여 산정", category: "core" as const, isCore: true, importanceScore: 0.85, importanceReason: "핵심 계산" },
  ],
  coreJudgments: [
    { processName: "중도인출 프로세스", isCore: true, score: 0.9, reasoning: "도메인 필수" },
  ],
};

// ── buildScoringPrompt ────────────────────────────────────────────────

describe("buildScoringPrompt", () => {
  it("프롬프트 문자열 생성 — processes/entities 포함", () => {
    const prompt = buildScoringPrompt(sampleExtraction);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("중도인출 프로세스");
    expect(prompt).toContain("importanceScore");
    expect(prompt).toContain("category");
  });

  it("빈 extraction 입력도 처리", () => {
    const prompt = buildScoringPrompt({
      processes: [],
      entities: [],
      rules: [],
      relationships: [],
    });
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });
});

// ── parseScoringResult ────────────────────────────────────────────────

describe("parseScoringResult", () => {
  const validScoringJson = JSON.stringify({
    scoredProcesses: [
      {
        name: "중도인출 프로세스",
        description: "중도인출 절차",
        steps: ["신청", "지급"],
        importanceScore: 0.9,
        importanceReason: "핵심 업무",
        referenceCount: 5,
        dependencyCount: 2,
        isCore: true,
        category: "core",
      },
    ],
    coreJudgments: [
      {
        processName: "중도인출 프로세스",
        isCore: true,
        score: 0.9,
        factors: { frequencyScore: 0.9, dependencyScore: 0.8, domainRelevanceScore: 0.95, dataFlowCentrality: 0.7 },
        reasoning: "도메인 필수 업무",
      },
    ],
    processTree: [
      {
        name: "중도인출 프로세스",
        type: "core",
        children: [],
        methods: [],
        actors: [],
        dataInputs: [],
        dataOutputs: [],
      },
    ],
  });

  it("정상 JSON 파싱", () => {
    const result = parseScoringResult(validScoringJson);
    expect(result.scoredProcesses).toHaveLength(1);
    expect(result.coreJudgments).toHaveLength(1);
    expect(result.scoredProcesses[0]?.name).toBe("중도인출 프로세스");
  });

  it("마크다운 펜스 제거 후 파싱", () => {
    const withFence = "```json\n" + validScoringJson + "\n```";
    const result = parseScoringResult(withFence);
    expect(result.scoredProcesses).toHaveLength(1);
  });

  it("잘못된 JSON에서 에러 발생", () => {
    expect(() => parseScoringResult("not valid json")).toThrow();
  });

  it("빈 배열 JSON 파싱", () => {
    const emptyJson = JSON.stringify({ scoredProcesses: [], coreJudgments: [], processTree: [] });
    const result = parseScoringResult(emptyJson);
    expect(result.scoredProcesses).toHaveLength(0);
  });
});

// ── buildDiagnosisPrompt ──────────────────────────────────────────────

describe("buildDiagnosisPrompt", () => {
  it("프롬프트 문자열 생성 — 4가지 진단 유형 포함", () => {
    const prompt = buildDiagnosisPrompt(sampleScoringResult, sampleExtraction);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("missing");
    expect(prompt).toContain("duplicate");
    expect(prompt).toContain("overspec");
    expect(prompt).toContain("inconsistency");
  });
});

// ── parseDiagnosisResult ──────────────────────────────────────────────

describe("parseDiagnosisResult", () => {
  const validDiagnosisJson = JSON.stringify({
    findings: [
      {
        findingId: "temp-1",
        type: "missing",
        severity: "critical",
        finding: "퇴직급여 산정 단계 누락",
        evidence: "프로세스에 없음",
        recommendation: "단계 추가 필요",
        sourceDocumentIds: [],
        relatedProcesses: ["중도인출 프로세스"],
        confidence: 0.9,
      },
    ],
  });

  it("정상 JSON 파싱 — hitlStatus pending 기본값", () => {
    const findings = parseDiagnosisResult(validDiagnosisJson);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.hitlStatus).toBe("pending");
    expect(findings[0]?.type).toBe("missing");
  });

  it("마크다운 펜스 제거 후 파싱", () => {
    const withFence = "```json\n" + validDiagnosisJson + "\n```";
    const findings = parseDiagnosisResult(withFence);
    expect(findings).toHaveLength(1);
  });

  it("빈 findings 배열 파싱", () => {
    const findings = parseDiagnosisResult(JSON.stringify({ findings: [] }));
    expect(findings).toHaveLength(0);
  });

  it("잘못된 JSON에서 에러 발생", () => {
    expect(() => parseDiagnosisResult("{ invalid }")).toThrow();
  });
});

// ── buildComparisonPrompt ─────────────────────────────────────────────

describe("buildComparisonPrompt", () => {
  const orgA = {
    organizationId: "org-a",
    organizationName: "미래에셋",
    documentIds: [],
    scoredProcesses: sampleScoringResult.scoredProcesses,
    coreJudgments: sampleScoringResult.coreJudgments,
    findings: [],
  };
  const orgB = {
    organizationId: "org-b",
    organizationName: "현대증권",
    documentIds: [],
    scoredProcesses: [
      { name: "중도인출 프로세스", category: "core" as const, isCore: true, importanceScore: 0.85, importanceReason: "필수" },
    ],
    coreJudgments: [],
    findings: [],
  };

  it("프롬프트 문자열 생성 — 두 조직명 포함", () => {
    const prompt = buildComparisonPrompt(orgA, orgB);
    expect(typeof prompt).toBe("string");
    expect(prompt).toContain("미래에셋");
    expect(prompt).toContain("현대증권");
    expect(prompt).toContain("common_standard");
    expect(prompt).toContain("tacit_knowledge");
  });
});

// ── parseComparisonResult ─────────────────────────────────────────────

describe("parseComparisonResult", () => {
  const validComparisonJson = JSON.stringify({
    items: [
      {
        name: "중도인출 프로세스",
        type: "process",
        serviceGroup: "common_standard",
        presentIn: [
          { organizationId: "org-a", organizationName: "미래에셋", documentIds: [] },
          { organizationId: "org-b", organizationName: "현대증권", documentIds: [] },
        ],
        classificationReason: "두 조직 모두 존재",
        standardizationScore: 0.8,
      },
    ],
    standardizationCandidates: [
      {
        name: "중도인출 프로세스",
        score: 0.8,
        orgsInvolved: ["org-a", "org-b"],
        note: "단계 구성 유사",
      },
    ],
  });

  it("정상 JSON 파싱", () => {
    const result = parseComparisonResult(validComparisonJson);
    expect(result.items).toHaveLength(1);
    expect(result.standardizationCandidates).toHaveLength(1);
    expect(result.items[0]?.serviceGroup).toBe("common_standard");
  });

  it("마크다운 펜스 제거 후 파싱", () => {
    const withFence = "```json\n" + validComparisonJson + "\n```";
    const result = parseComparisonResult(withFence);
    expect(result.items).toHaveLength(1);
  });

  it("잘못된 serviceGroup 값으로 에러 발생", () => {
    const badJson = JSON.stringify({
      items: [
        {
          name: "test",
          type: "process",
          serviceGroup: "invalid_group",
          presentIn: [],
          classificationReason: "",
        },
      ],
      standardizationCandidates: [],
    });
    expect(() => parseComparisonResult(badJson)).toThrow();
  });
});
