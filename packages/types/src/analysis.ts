import { z } from "zod";

// ── Layer 1: Extraction Summary ───────────────────────────────────────

// 추출 항목에 중요도 스코어 부여
export const ScoredProcessSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(z.string()),
  // 분석 메타데이터
  importanceScore: z.number().min(0).max(1), // 0=trivial, 1=critical
  importanceReason: z.string(),              // "6개 문서에서 참조, 12개 규칙 연관"
  referenceCount: z.number().int(),          // 다른 문서/규칙에서 참조된 횟수
  dependencyCount: z.number().int(),         // 이 프로세스에 의존하는 항목 수
  isCore: z.boolean(),                       // 핵심 프로세스 판정
  category: z.enum([
    "mega",       // 메가 프로세스 (최상위 업무 흐름)
    "core",       // 핵심 프로세스 (도메인 필수)
    "supporting", // 지원 프로세스 (CRUD, 조회 등)
    "peripheral", // 주변 프로세스 (로깅, 알림 등)
  ]),
});

export const ScoredEntitySchema = z.object({
  name: z.string(),
  type: z.enum(["account", "person", "product", "rule", "system", "interface", "table"]),
  attributes: z.array(z.string()),
  usageCount: z.number().int(),  // 프로세스/규칙에서 사용된 횟수
  isOrphan: z.boolean(),         // 아무 관계도 없는 고립 엔티티
});

// Layer 1 전체
export const ExtractionSummarySchema = z.object({
  documentId: z.string(),
  organizationId: z.string(),
  extractionId: z.string(),
  // 수치 요약
  counts: z.object({
    processes: z.number().int(),
    entities: z.number().int(),
    rules: z.number().int(),
    relationships: z.number().int(),
  }),
  // 스코어링된 항목
  processes: z.array(ScoredProcessSchema),
  entities: z.array(ScoredEntitySchema),
  // 문서 분류 정보
  documentClassification: z.string(),
  analysisTimestamp: z.string().datetime(),
});

// ── Layer 2: Core Identification ─────────────────────────────────────

// 핵심 프로세스 판정 근거
export const CoreJudgmentSchema = z.object({
  processName: z.string(),
  isCore: z.boolean(),
  score: z.number().min(0).max(1),
  // 판정 근거 — UI에서 "왜 핵심인가" 표시
  factors: z.object({
    frequencyScore: z.number(),       // 문서 내 출현 빈도
    dependencyScore: z.number(),      // 다른 프로세스/규칙의 의존도
    domainRelevanceScore: z.number(), // 퇴직연금 도메인 핵심 업무 해당 여부
    dataFlowCentrality: z.number(),   // 데이터 흐름 그래프 중심성
  }),
  reasoning: z.string(), // LLM이 생성한 판정 이유 (한국어 서술)
});

// 프로세스 계층 트리 (재귀 타입)
interface ProcessTreeNode {
  name: string;
  type: "mega" | "core" | "supporting" | "peripheral";
  children: ProcessTreeNode[];
  methods: Array<{ name: string; triggerCondition: string }>;
  actors: string[];
  dataInputs: string[];
  dataOutputs: string[];
}

export const ProcessTreeNodeSchema: z.ZodType<ProcessTreeNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: z.enum(["mega", "core", "supporting", "peripheral"]),
    children: z.array(ProcessTreeNodeSchema),
    methods: z.array(
      z.object({
        name: z.string(),
        triggerCondition: z.string(),
      })
    ),
    actors: z.array(z.string()),
    dataInputs: z.array(z.string()),  // 소비하는 데이터
    dataOutputs: z.array(z.string()), // 생산하는 데이터
  })
);

// Layer 2 전체
export const CoreIdentificationSchema = z.object({
  documentId: z.string(),
  organizationId: z.string(),
  // 핵심 판정 결과
  coreProcesses: z.array(CoreJudgmentSchema),
  // 프로세스 계층 트리 (UI에서 트리 시각화)
  processTree: z.array(ProcessTreeNodeSchema),
  // 요약 통계
  summary: z.object({
    megaProcessCount: z.number().int(),
    coreProcessCount: z.number().int(),
    supportingProcessCount: z.number().int(),
    peripheralProcessCount: z.number().int(),
  }),
});

// ── Cross-Organization Comparison ────────────────────────────────────

// 서비스 분석 그룹 분류
export const ServiceGroupSchema = z.enum([
  "common_standard",     // 공통/표준화 대상 — 복수 조직에 존재, 표준화 후보
  "org_specific",        // 조직 고유 — 한 조직에만 존재하는 프로세스/정책
  "tacit_knowledge",     // 암묵지 — 문서에 명시되지 않았지만 흐름에서 추론됨
  "core_differentiator", // 핵심 차별 요소 — 해당 조직의 경쟁 우위
]);

// 프로세스/정책 비교 단위
export const ComparisonItemSchema = z.object({
  name: z.string(),
  type: z.enum(["process", "policy", "entity", "rule"]),
  serviceGroup: ServiceGroupSchema,

  // 어떤 조직에 존재하는가
  presentIn: z.array(
    z.object({
      organizationId: z.string(),
      organizationName: z.string(),
      documentIds: z.array(z.string()),
      variant: z.string().optional(), // 조직별 변형 설명
    })
  ),

  // 그룹 분류 근거
  classificationReason: z.string(),

  // 표준화 가능성
  standardizationScore: z.number().min(0).max(1).optional(),
  standardizationNote: z.string().optional(),

  // 암묵지 탐지 시
  tacitKnowledgeEvidence: z.string().optional(),
});

// 조직 간 비교 결과 전체
export const CrossOrgComparisonSchema = z.object({
  comparisonId: z.string().uuid(),
  organizations: z.array(
    z.object({
      organizationId: z.string(),
      organizationName: z.string(),
      documentCount: z.number().int(),
      processCount: z.number().int(),
      policyCount: z.number().int(),
    })
  ),
  items: z.array(ComparisonItemSchema),

  // 그룹별 요약 통계 (UI 대시보드용)
  groupSummary: z.object({
    commonStandard: z.number().int(),
    orgSpecific: z.number().int(),
    tacitKnowledge: z.number().int(),
    coreDifferentiator: z.number().int(),
  }),

  // 표준화 권고
  standardizationCandidates: z.array(
    z.object({
      name: z.string(),
      score: z.number(),
      orgsInvolved: z.array(z.string()),
      note: z.string(),
    })
  ),

  createdAt: z.string().datetime(),
});

// ── Type Exports ──────────────────────────────────────────────────────

export type ScoredProcess = z.infer<typeof ScoredProcessSchema>;
export type ScoredEntity = z.infer<typeof ScoredEntitySchema>;
export type ExtractionSummary = z.infer<typeof ExtractionSummarySchema>;
export type CoreJudgment = z.infer<typeof CoreJudgmentSchema>;
export type { ProcessTreeNode };
export type CoreIdentification = z.infer<typeof CoreIdentificationSchema>;
export type ServiceGroup = z.infer<typeof ServiceGroupSchema>;
export type ComparisonItem = z.infer<typeof ComparisonItemSchema>;
export type CrossOrgComparison = z.infer<typeof CrossOrgComparisonSchema>;
