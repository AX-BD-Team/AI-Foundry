/**
 * Pass 1: 중요도 스코어링 + 핵심 프로세스 판정 프롬프트 빌더
 *
 * 기존 extraction result를 받아 각 프로세스에 importanceScore, category,
 * isCore를 부여하고 CoreJudgment + ProcessTree를 생성한다.
 */

import type {
  CoreJudgment,
  ExtractionSummary,
  ScoredProcess,
  CoreIdentificationSchema,
} from "@ai-foundry/types";
import { z } from "zod";

// LLM 응답 내부 스키마 (3-Pass 분석 Pass 1 출력)
const ScoringOutputSchema = z.object({
  scoredProcesses: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      steps: z.array(z.string()),
      importanceScore: z.number().min(0).max(1),
      importanceReason: z.string(),
      referenceCount: z.number().int(),
      dependencyCount: z.number().int(),
      isCore: z.boolean(),
      category: z.enum(["mega", "core", "supporting", "peripheral"]),
    })
  ),
  coreJudgments: z.array(
    z.object({
      processName: z.string(),
      isCore: z.boolean(),
      score: z.number().min(0).max(1),
      factors: z.object({
        frequencyScore: z.number(),
        dependencyScore: z.number(),
        domainRelevanceScore: z.number(),
        dataFlowCentrality: z.number(),
      }),
      reasoning: z.string(),
    })
  ),
  processTree: z.array(z.unknown()), // lazy 재귀 — 파싱 후 CoreIdentificationSchema로 검증
});

export type ScoringOutput = {
  scoredProcesses: ScoredProcess[];
  coreJudgments: CoreJudgment[];
  processTree: ExtractionSummary["processes"]; // CoreIdentification.processTree와 동일 구조
};

/** 마크다운 코드 펜스 제거 */
function stripMarkdownFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/**
 * 기존 extraction 결과로부터 Pass 1 스코어링 프롬프트를 생성한다.
 *
 * @param extractionResult - Stage 2에서 추출된 processes/entities/rules/relationships
 */
export function buildScoringPrompt(extractionResult: {
  processes: Array<{ name: string; description: string; steps: string[] }>;
  entities: Array<{ name: string; type: string; attributes: string[] }>;
  rules: Array<{ condition: string; outcome: string }>;
  relationships: Array<{ from: string; to: string; type: string }>;
}): string {
  const dataJson = JSON.stringify(extractionResult, null, 2);

  return `당신은 퇴직연금 도메인 전문가입니다. 아래 추출 데이터를 분석하여 각 프로세스의 중요도를 평가하고 핵심 프로세스를 판정하세요.

## 분석 대상 추출 데이터

\`\`\`json
${dataJson}
\`\`\`

## 분석 지시사항

각 프로세스에 대해 다음 4가지 요인을 기준으로 중요도를 판정하세요:

1. **frequencyScore** (0-1): 문서 내 출현 빈도 — 다른 프로세스/규칙/엔티티에서 얼마나 자주 참조되는가
2. **dependencyScore** (0-1): 다른 프로세스/규칙의 의존도 — 이 프로세스 없이 다른 것이 동작하는가
3. **domainRelevanceScore** (0-1): 퇴직연금 도메인 핵심 업무 해당 여부 — 중도인출/가입/수급/운용/평가 등 핵심 업무와의 연관성
4. **dataFlowCentrality** (0-1): 데이터 흐름 그래프 중심성 — 얼마나 많은 데이터를 생산하거나 소비하는가

**카테고리 분류 기준**:
- \`mega\`: 최상위 업무 흐름 (퇴직연금 전체 프로세스를 포괄하는 대분류)
- \`core\`: 도메인 필수 프로세스 (importanceScore ≥ 0.7)
- \`supporting\`: 지원 프로세스 CRUD, 조회, 등록 등 (0.3 ≤ score < 0.7)
- \`peripheral\`: 주변 프로세스 — 로깅, 알림, 통계 등 (score < 0.3)

**핵심 프로세스(isCore) 판정 기준**: importanceScore ≥ 0.7 이거나 domainRelevanceScore ≥ 0.8

**processTree 구성**: 프로세스를 계층 구조로 구성하세요 (mega → core → supporting 순서).
children 배열에 하위 프로세스를 중첩하세요.

## 출력 형식

순수 JSON만 출력하세요 (마크다운 없음):

{
  "scoredProcesses": [
    {
      "name": "프로세스명 (원본과 동일)",
      "description": "설명",
      "steps": ["단계1", "단계2"],
      "importanceScore": 0.85,
      "importanceReason": "6개 문서에서 참조, 중도인출 규칙 12건과 연관",
      "referenceCount": 6,
      "dependencyCount": 3,
      "isCore": true,
      "category": "core"
    }
  ],
  "coreJudgments": [
    {
      "processName": "프로세스명",
      "isCore": true,
      "score": 0.85,
      "factors": {
        "frequencyScore": 0.9,
        "dependencyScore": 0.8,
        "domainRelevanceScore": 0.95,
        "dataFlowCentrality": 0.7
      },
      "reasoning": "중도인출 프로세스는 퇴직연금 도메인의 핵심 업무이며, 6개 문서에서 참조되고 12개 규칙과 연관됩니다."
    }
  ],
  "processTree": [
    {
      "name": "메가 프로세스명",
      "type": "mega",
      "children": [
        {
          "name": "핵심 프로세스명",
          "type": "core",
          "children": [],
          "methods": [{"name": "메서드명", "triggerCondition": "조건"}],
          "actors": ["행위자1"],
          "dataInputs": ["입력 데이터"],
          "dataOutputs": ["출력 데이터"]
        }
      ],
      "methods": [],
      "actors": ["행위자"],
      "dataInputs": ["입력 데이터"],
      "dataOutputs": ["출력 데이터"]
    }
  ]
}`;
}

/**
 * LLM 응답 JSON을 파싱하여 ScoringOutput으로 반환한다.
 * 마크다운 펜스 제거 + Zod 검증 포함.
 *
 * @param rawJson - LLM raw 응답 문자열
 * @throws ZodError 파싱/검증 실패 시
 */
export function parseScoringResult(rawJson: string): z.infer<typeof ScoringOutputSchema> {
  const cleaned = stripMarkdownFence(rawJson);
  const parsed: unknown = JSON.parse(cleaned);
  return ScoringOutputSchema.parse(parsed);
}

/**
 * Pass 1 결과에서 CoreIdentification 요약 통계를 계산한다.
 */
export function buildCoreSummary(scoredProcesses: ScoredProcess[]): z.infer<
  typeof CoreIdentificationSchema
>["summary"] {
  const counts = {
    megaProcessCount: 0,
    coreProcessCount: 0,
    supportingProcessCount: 0,
    peripheralProcessCount: 0,
  };
  for (const p of scoredProcesses) {
    if (p.category === "mega") counts.megaProcessCount++;
    else if (p.category === "core") counts.coreProcessCount++;
    else if (p.category === "supporting") counts.supportingProcessCount++;
    else if (p.category === "peripheral") counts.peripheralProcessCount++;
  }
  return counts;
}
