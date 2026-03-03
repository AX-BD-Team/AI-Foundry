/**
 * Pass 3: 조직 간 비교 프롬프트 빌더
 *
 * 2개 조직의 Pass 1+2 결과를 받아 이름/의미 기반 매칭으로
 * 서비스 분석 그룹(common_standard/org_specific/tacit_knowledge/core_differentiator)을
 * 분류하고 표준화 후보를 도출한다.
 */

import {
  type ComparisonItem,
  type CrossOrgComparison,
  ComparisonItemSchema,
  CrossOrgComparisonSchema,
} from "@ai-foundry/types";
import { z } from "zod";

/** 마크다운 코드 펜스 제거 */
function stripMarkdownFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

// LLM 응답 스키마
const ComparisonLlmOutputSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      type: z.enum(["process", "policy", "entity", "rule"]),
      serviceGroup: z.enum([
        "common_standard",
        "org_specific",
        "tacit_knowledge",
        "core_differentiator",
      ]),
      presentIn: z.array(
        z.object({
          organizationId: z.string(),
          organizationName: z.string(),
          documentIds: z.array(z.string()),
          variant: z.string().optional(),
        })
      ),
      classificationReason: z.string(),
      standardizationScore: z.number().min(0).max(1).optional(),
      standardizationNote: z.string().optional(),
      tacitKnowledgeEvidence: z.string().optional(),
    })
  ),
  standardizationCandidates: z.array(
    z.object({
      name: z.string(),
      score: z.number(),
      orgsInvolved: z.array(z.string()),
      note: z.string(),
    })
  ),
});

export type ComparisonLlmOutput = z.infer<typeof ComparisonLlmOutputSchema>;

/** 조직 분석 결과 타입 (Pass 1+2 결과) */
export type OrgAnalysisResult = {
  organizationId: string;
  organizationName: string;
  documentIds: string[];
  scoredProcesses: Array<{
    name: string;
    category: string;
    isCore: boolean;
    importanceScore: number;
    importanceReason: string;
  }>;
  coreJudgments: Array<{
    processName: string;
    isCore: boolean;
    score: number;
    reasoning: string;
  }>;
  findings: Array<{
    type: string;
    severity: string;
    finding: string;
  }>;
};

/**
 * Pass 3 조직 간 비교 프롬프트를 생성한다.
 *
 * @param orgAResult - 조직 A의 Pass 1+2 분석 결과
 * @param orgBResult - 조직 B의 Pass 1+2 분석 결과
 */
export function buildComparisonPrompt(
  orgAResult: OrgAnalysisResult,
  orgBResult: OrgAnalysisResult
): string {
  const orgAJson = JSON.stringify(orgAResult, null, 2);
  const orgBJson = JSON.stringify(orgBResult, null, 2);

  return `당신은 퇴직연금 도메인의 조직 간 비교 분석 전문가입니다.
두 조직의 퇴직연금 시스템 분석 결과를 비교하여 공통점과 차이점을 분류하세요.

## 조직 A 분석 결과: ${orgAResult.organizationName}

\`\`\`json
${orgAJson}
\`\`\`

## 조직 B 분석 결과: ${orgBResult.organizationName}

\`\`\`json
${orgBJson}
\`\`\`

## 서비스 분석 그룹 분류 기준

각 프로세스/정책/엔티티/규칙을 다음 4가지 그룹으로 분류하세요:

### common_standard (공통/표준화 대상)
- 두 조직 모두에 존재하는 항목
- 이름이 같거나 LLM 판단으로 동일한 기능을 하는 경우
- 표준화 후보로 권고
- standardizationScore: 0.0~1.0 (프로세스 단계가 80%+ 동일하면 ≥ 0.8)
- variant 필드에 조직별 차이점 기술

### org_specific (조직 고유)
- 한 조직에만 존재하는 항목
- 도메인 필수 업무가 아닌 경우
- presentIn 배열에 해당 조직 1개만 포함

### tacit_knowledge (암묵지)
- 문서에 명시적으로 정의되지 않았으나 존재해야 하는 항목
- 다음 패턴에서 탐지:
  1. 화면/API 흐름에서 중간 단계가 생략된 경우
  2. 규칙이 참조하지만 프로세스 정의가 없는 경우
  3. 데이터 소비는 있으나 생산 프로세스가 없는 경우
  4. 업계 표준에서 기대되지만 문서에 없는 경우
- tacitKnowledgeEvidence에 어떤 흐름에서 추론되었는지 기술

### core_differentiator (핵심 차별 요소)
- 한 조직에만 존재하지만 도메인 핵심 업무에 해당하는 항목
- 해당 조직의 경쟁 우위 또는 특화 기능
- isCore = true이고 org_specific인 경우

## 표준화 후보 선정

standardizationScore ≥ 0.6인 common_standard 항목을 standardizationCandidates에 포함하세요.
score 내림차순으로 정렬하세요.

## 출력 형식

순수 JSON만 출력하세요 (마크다운 없음):

{
  "items": [
    {
      "name": "중도인출 프로세스",
      "type": "process",
      "serviceGroup": "common_standard",
      "presentIn": [
        {
          "organizationId": "${orgAResult.organizationId}",
          "organizationName": "${orgAResult.organizationName}",
          "documentIds": [],
          "variant": "${orgAResult.organizationName}은 3단계로 처리"
        },
        {
          "organizationId": "${orgBResult.organizationId}",
          "organizationName": "${orgBResult.organizationName}",
          "documentIds": [],
          "variant": "${orgBResult.organizationName}은 5단계로 처리 (추가 승인 단계 존재)"
        }
      ],
      "classificationReason": "두 조직 모두에 중도인출 프로세스가 존재하며 핵심 단계가 유사합니다.",
      "standardizationScore": 0.8,
      "standardizationNote": "프로세스 단계는 유사하나 승인 권한 구조가 다릅니다."
    },
    {
      "name": "긴급인출 승인 규칙",
      "type": "rule",
      "serviceGroup": "tacit_knowledge",
      "presentIn": [
        {
          "organizationId": "${orgAResult.organizationId}",
          "organizationName": "${orgAResult.organizationName}",
          "documentIds": []
        }
      ],
      "classificationReason": "규칙 목록에서 긴급인출이 참조되지만 프로세스 정의에 없습니다.",
      "tacitKnowledgeEvidence": "화면 흐름에서 긴급인출 신청 → 즉시 지급 사이의 승인 단계가 생략되어 있으며, 규칙 'R-045'에서 긴급인출 승인을 언급하지만 해당 프로세스가 정의되지 않았습니다."
    }
  ],
  "standardizationCandidates": [
    {
      "name": "중도인출 프로세스",
      "score": 0.8,
      "orgsInvolved": ["${orgAResult.organizationId}", "${orgBResult.organizationId}"],
      "note": "프로세스 단계는 유사하나 승인 권한 구조를 통일해야 합니다."
    }
  ]
}`;
}

/**
 * LLM Pass 3 응답을 파싱하여 ComparisonItem[] + standardizationCandidates를 반환한다.
 *
 * @param rawJson - LLM raw 응답
 * @throws ZodError 파싱/검증 실패 시
 */
export function parseComparisonResult(rawJson: string): ComparisonLlmOutput {
  const cleaned = stripMarkdownFence(rawJson);
  const parsed: unknown = JSON.parse(cleaned);
  return ComparisonLlmOutputSchema.parse(parsed);
}

/**
 * Pass 3 결과를 CrossOrgComparison 타입으로 조합한다.
 *
 * @param comparisonId - UUID
 * @param orgAResult - 조직 A 분석 결과
 * @param orgBResult - 조직 B 분석 결과
 * @param llmOutput - parseComparisonResult 결과
 */
export function buildCrossOrgComparison(
  comparisonId: string,
  orgAResult: OrgAnalysisResult,
  orgBResult: OrgAnalysisResult,
  llmOutput: ComparisonLlmOutput
): CrossOrgComparison {
  const items: ComparisonItem[] = llmOutput.items.map((item) =>
    ComparisonItemSchema.parse(item)
  );

  const groupSummary = {
    commonStandard: items.filter((i) => i.serviceGroup === "common_standard").length,
    orgSpecific: items.filter((i) => i.serviceGroup === "org_specific").length,
    tacitKnowledge: items.filter((i) => i.serviceGroup === "tacit_knowledge").length,
    coreDifferentiator: items.filter((i) => i.serviceGroup === "core_differentiator").length,
  };

  return CrossOrgComparisonSchema.parse({
    comparisonId,
    organizations: [
      {
        organizationId: orgAResult.organizationId,
        organizationName: orgAResult.organizationName,
        documentCount: orgAResult.documentIds.length,
        processCount: orgAResult.scoredProcesses.length,
        policyCount: 0,
      },
      {
        organizationId: orgBResult.organizationId,
        organizationName: orgBResult.organizationName,
        documentCount: orgBResult.documentIds.length,
        processCount: orgBResult.scoredProcesses.length,
        policyCount: 0,
      },
    ],
    items,
    groupSummary,
    standardizationCandidates: llmOutput.standardizationCandidates,
    createdAt: new Date().toISOString(),
  });
}
