/**
 * Pass 2: 4대 진단 프롬프트 빌더
 *
 * Pass 1 스코어링 결과 + 원본 추출 데이터를 받아 누락/중복/오버스펙/정합성
 * 4가지 유형의 진단 소견(DiagnosisFinding[])을 생성한다.
 */

import { type DiagnosisFinding, DiagnosisFindingSchema } from "@ai-foundry/types";
import { z } from "zod";

/** 마크다운 코드 펜스 제거 */
function stripMarkdownFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

// LLM 응답 스키마 — findingId는 LLM이 임시값 생성, 저장 시 UUID로 교체
const DiagnosisLlmOutputSchema = z.object({
  findings: z.array(
    z.object({
      findingId: z.string(),
      type: z.enum(["missing", "duplicate", "overspec", "inconsistency"]),
      severity: z.enum(["critical", "warning", "info"]),
      finding: z.string(),
      evidence: z.string(),
      recommendation: z.string(),
      sourceDocumentIds: z.array(z.string()),
      relatedProcesses: z.array(z.string()),
      relatedEntities: z.array(z.string()).optional(),
      confidence: z.number().min(0).max(1),
    })
  ),
});

export type DiagnosisLlmOutput = z.infer<typeof DiagnosisLlmOutputSchema>;

/**
 * Pass 2 진단 프롬프트를 생성한다.
 *
 * @param scoringResult - Pass 1에서 생성된 스코어링 결과
 * @param extractionResult - Stage 2 원본 추출 데이터
 */
export function buildDiagnosisPrompt(
  scoringResult: {
    scoredProcesses: Array<{
      name: string;
      importanceScore: number;
      category: string;
      isCore: boolean;
      importanceReason: string;
    }>;
    coreJudgments: Array<{
      processName: string;
      isCore: boolean;
      score: number;
      reasoning: string;
    }>;
  },
  extractionResult: {
    processes: Array<{ name: string; description: string; steps: string[] }>;
    entities: Array<{ name: string; type: string; attributes: string[] }>;
    rules: Array<{ condition: string; outcome: string }>;
    relationships: Array<{ from: string; to: string; type: string }>;
  }
): string {
  const scoringJson = JSON.stringify(scoringResult, null, 2);
  const extractionJson = JSON.stringify(extractionResult, null, 2);

  return `당신은 퇴직연금 도메인의 SI 프로젝트 산출물을 진단하는 전문가입니다.
아래 Pass 1 스코어링 결과와 원본 추출 데이터를 분석하여 품질 진단 소견을 생성하세요.

## Pass 1 스코어링 결과

\`\`\`json
${scoringJson}
\`\`\`

## 원본 추출 데이터

\`\`\`json
${extractionJson}
\`\`\`

## 진단 유형 정의

다음 4가지 유형의 소견을 찾아 보고하세요:

### 1. missing (누락)
있어야 하는데 없는 항목:
- 퇴직연금 표준 업무(중도인출, 가입자격, 수급 등)인데 추출 데이터에 없음
- 프로세스 단계 중 특정 단계가 생략됨
- 규칙이 참조하는 프로세스가 정의에 없음
- 화면/API 흐름에서 빠진 중간 단계

### 2. duplicate (중복)
같은 기능이 2곳 이상에 정의된 항목:
- 동일/유사 업무 프로세스가 다른 이름으로 중복 존재
- 같은 규칙/조건이 여러 곳에 정의됨

### 3. overspec (오버스펙)
불필요하게 과도한 항목:
- 퇴직연금 도메인과 무관한 프로세스/규칙이 포함됨
- 극히 낮은 중요도(importanceScore < 0.2)인데 복잡한 정의가 존재

### 4. inconsistency (정합성 위반)
문서/데이터 간 불일치:
- 두 곳에 같은 항목이 있는데 내용이 다름
- 규칙의 조건과 프로세스 단계가 모순됨
- 관계(relationship)가 참조하는 엔티티가 엔티티 목록에 없음

## 소견 작성 지침

각 소견에 대해:
- **finding**: 1-2 문장으로 무엇이 문제인지 구체적으로 기술 (한국어)
- **evidence**: 추출 데이터의 어느 부분에서 근거를 찾았는지 구체적으로 기술
- **recommendation**: 어떻게 수정/보완해야 하는지 구체적 제안 (한국어)
- **severity**: critical(사업/운영 위험) / warning(품질 문제) / info(개선 권고)
- **confidence**: 판정의 확신도 (0.0~1.0)
- **relatedProcesses**: 관련된 프로세스 이름 목록
- **sourceDocumentIds**: 근거가 되는 문서 ID (없으면 빈 배열)

## 출력 형식

순수 JSON만 출력하세요 (마크다운 없음):

{
  "findings": [
    {
      "findingId": "temp-1",
      "type": "missing",
      "severity": "critical",
      "finding": "중도인출 프로세스에 퇴직급여 산정 단계가 누락되어 있습니다.",
      "evidence": "중도인출 프로세스 steps에 [신청접수, 자격확인, 지급]만 있으며, 퇴직급여 산정 단계가 없습니다. 규칙 목록에는 '중도인출 시 퇴직급여 산정 필수'가 명시되어 있으나 프로세스에 반영되지 않았습니다.",
      "recommendation": "중도인출 프로세스 steps에 '퇴직급여 산정' 단계를 '자격확인' 다음에 추가하세요.",
      "sourceDocumentIds": [],
      "relatedProcesses": ["중도인출 프로세스"],
      "relatedEntities": ["퇴직급여"],
      "confidence": 0.9
    }
  ]
}`;
}

/**
 * LLM Pass 2 응답을 파싱하여 DiagnosisFinding[] 배열로 반환한다.
 * findingId는 임시값이므로 저장 전 UUID로 교체해야 한다.
 *
 * @param rawJson - LLM raw 응답
 * @throws ZodError 파싱/검증 실패 시
 */
export function parseDiagnosisResult(rawJson: string): DiagnosisFinding[] {
  const cleaned = stripMarkdownFence(rawJson);
  const parsed: unknown = JSON.parse(cleaned);
  const output = DiagnosisLlmOutputSchema.parse(parsed);

  // hitlStatus 기본값 + UUID 임시 findingId 적용 후 DiagnosisFindingSchema로 최종 검증
  // (실제 UUID는 D1 저장 시 라우트 핸들러가 할당)
  return output.findings.map((f) =>
    DiagnosisFindingSchema.parse({
      ...f,
      findingId: crypto.randomUUID(),
      hitlStatus: "pending" as const,
    })
  );
}
