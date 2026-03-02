/**
 * 구조 추출 프롬프트 빌더 — Stage 2
 * 퇴직연금 도메인 문서에서 프로세스, 엔티티, 관계, 규칙을 추출한다.
 *
 * v2: 스마트 청크 선택 (균등 샘플링) + 문서 유형별 적응형 프롬프트
 */

import type { ChunkWithMeta } from "../queue/handler.js";

const MAX_CHUNK_CHARS = 10_000;
const MAX_CHUNKS = 20;
const MAX_TOTAL_CHARS = 60_000;

/**
 * 청크 배열에서 최대 MAX_CHUNKS개를 균등 샘플링으로 선택한다.
 * 앞쪽 5개(문서 컨텍스트) + word_count 상위 15개를 선택하여
 * 표지/목차만 전송되는 문제를 해결한다.
 */
function selectChunks(chunks: ChunkWithMeta[]): ChunkWithMeta[] {
  if (chunks.length <= MAX_CHUNKS) return chunks;

  // 앞쪽 3개 (문서 제목/컨텍스트용)
  const headCount = 3;
  const head = chunks.slice(0, headCount);
  const rest = chunks.slice(headCount);

  // 나머지에서 word_count 상위를 우선 선택 — 내용이 풍부한 청크
  const remaining = MAX_CHUNKS - headCount;
  const sorted = [...rest].sort((a, b) => b.word_count - a.word_count);
  const byContent = sorted.slice(0, remaining);

  // chunk_index 순으로 재정렬 (문서 순서 유지)
  const selected = [...head, ...byContent].sort((a, b) => a.chunk_index - b.chunk_index);
  return selected;
}

/**
 * 문서 분류에 따른 추출 지시사항을 반환한다.
 * general/unknown 문서에 대한 확장된 추출 스키마 포함.
 */
function getDocTypeGuidance(classification: string): string {
  switch (classification) {
    case "screen_design":
      return `이 문서는 **화면 설계서**입니다. 화면 흐름, 사용자 인터랙션, UI 컴포넌트에 주목하세요.`;
    case "api_spec":
      return `이 문서는 **API 명세서/인터페이스 목록**입니다.
각 인터페이스/API를 엔티티(type: "interface")로 추출하세요.
프로세스는 연계 흐름(송신→수신)을 기준으로, 규칙은 호출 조건/주기를 기준으로 추출하세요.`;
    case "erd":
      return `이 문서는 **ERD/데이터 모델**입니다. 테이블/엔티티를 엔티티(type: "table")로, 관계를 relationships로 추출하세요.`;
    case "requirements":
      return `이 문서는 **요구사항 명세서**입니다. 기능 요구사항을 프로세스로, 비기능 요구사항을 규칙으로 추출하세요.`;
    case "process":
      return `이 문서는 **업무 프로세스 문서**입니다. 업무 흐름과 분기 조건에 주목하세요.`;
    default:
      return `이 문서의 유형이 명확하지 않습니다.
기술 표준, 아키텍처 결정, 코딩 규칙, 인프라 구성 등이 포함될 수 있습니다.
- 기술 결정/표준 규칙 → **rules**로 추출
- 시스템/컴포넌트 → **entities** (type: "system")로 추출
- 업무나 기술 절차가 있으면 → **processes**로 추출
내용이 추출 대상에 해당하지 않으면 빈 배열을 반환하세요.`;
  }
}

/**
 * 문서 청크 배열로부터 Claude용 구조 추출 프롬프트를 생성한다.
 *
 * @param chunks - 메타데이터 포함 청크 배열
 * @param classification - 문서 분류 (classifier 결과)
 */
export function buildExtractionPrompt(chunks: ChunkWithMeta[], classification?: string): string {
  const selected = selectChunks(chunks);

  // First pass: truncate each to MAX_CHUNK_CHARS
  let trimmedTexts = selected.map((c) => c.masked_text.slice(0, MAX_CHUNK_CHARS));

  // Second pass: if total exceeds budget, proportionally reduce
  const totalLen = trimmedTexts.reduce((sum, c) => sum + c.length, 0);
  if (totalLen > MAX_TOTAL_CHARS && trimmedTexts.length > 0) {
    const ratio = MAX_TOTAL_CHARS / totalLen;
    trimmedTexts = trimmedTexts.map((c) => c.slice(0, Math.max(500, Math.floor(c.length * ratio))));
  }

  const chunksText = trimmedTexts
    .map((text, i) => {
      const meta = selected[i];
      return meta
        ? `--- 청크 ${meta.chunk_index + 1} (${meta.element_type}, ${meta.word_count}w) ---\n${text}`
        : `--- 청크 ${i + 1} ---\n${text}`;
    })
    .join("\n\n");

  const docGuidance = getDocTypeGuidance(classification ?? "general");

  return `당신은 퇴직연금 도메인의 SI 프로젝트 산출물을 분석하는 전문가입니다.
아래 문서 청크는 퇴직연금 시스템 관련 산출물의 일부입니다. (총 ${chunks.length}개 청크 중 ${selected.length}개 선택)

${docGuidance}

다음 항목을 추출하여 JSON 형식으로만 응답하세요. 마크다운 코드 블록이나 추가 설명 없이 순수 JSON만 출력하세요.

추출 항목:
1. **프로세스(processes)**: 업무 흐름, 처리 단계, 절차, 연계 흐름
2. **엔티티(entities)**: 주요 데이터 객체, 계좌, 인물, 상품, 규정, 시스템, 인터페이스, 테이블 등
3. **관계(relationships)**: 엔티티 간 연관 관계
4. **규칙(rules)**: 업무 조건, 판단 기준, 제약 조건, 기술 표준, 아키텍처 결정

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
      "type": "account | person | product | rule | system | interface | table",
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
