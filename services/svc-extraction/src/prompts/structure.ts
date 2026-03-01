/**
 * 구조 추출 프롬프트 빌더 — Stage 2
 * 퇴직연금 도메인 문서에서 프로세스, 엔티티, 관계, 규칙을 추출한다.
 */

const MAX_CHUNK_CHARS = 4000;
const MAX_CHUNKS = 20;

/**
 * 문서 청크 배열로부터 Claude용 구조 추출 프롬프트를 생성한다.
 * 총 프롬프트가 4000 토큰 이내에 들어오도록 청크를 잘라낸다.
 */
export function buildExtractionPrompt(chunks: string[]): string {
  const limited = chunks
    .slice(0, MAX_CHUNKS)
    .map((c) => c.slice(0, MAX_CHUNK_CHARS));

  const chunksText = limited
    .map((c, i) => `--- 청크 ${i + 1} ---\n${c}`)
    .join("\n\n");

  return `당신은 퇴직연금 도메인의 SI 프로젝트 산출물을 분석하는 전문가입니다.
아래 문서 청크는 퇴직연금 시스템 관련 산출물(요구사항 명세서, ERD, 화면 설계서, API 명세서 등)의 일부입니다.

다음 항목을 추출하여 JSON 형식으로만 응답하세요. 마크다운 코드 블록이나 추가 설명 없이 순수 JSON만 출력하세요.

추출 항목:
1. **프로세스(processes)**: 업무 흐름, 처리 단계, 절차
2. **엔티티(entities)**: 주요 데이터 객체, 계좌, 인물, 상품, 규정 등
3. **관계(relationships)**: 엔티티 간 연관 관계
4. **규칙(rules)**: 업무 조건, 판단 기준, 제약 조건 (퇴직연금 관련 규정 포함)

출력 JSON 스키마:
{
  "processes": [
    {
      "name": "프로세스명",
      "description": "간략한 설명",
      "steps": ["단계1", "단계2"]
    }
  ],
  "entities": [
    {
      "name": "엔티티명",
      "type": "account | person | product | rule",
      "attributes": ["속성1", "속성2"]
    }
  ],
  "relationships": [
    {
      "from": "출발 엔티티명",
      "to": "도착 엔티티명",
      "type": "관계 유형"
    }
  ],
  "rules": [
    {
      "condition": "조건",
      "outcome": "결과/처리",
      "domain": "pension"
    }
  ]
}

--- 분석 대상 문서 청크 ---

${chunksText}

위 내용을 분석하여 JSON만 출력하세요.`;
}
