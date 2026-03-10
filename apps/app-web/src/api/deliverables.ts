/**
 * SI Deliverable Export API client (AIF-REQ-017 UI extension)
 *
 * Backend: svc-analytics /deliverables/export/* endpoints
 */
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

export type DeliverableType =
  | "interface-spec"
  | "business-rules"
  | "glossary"
  | "gap-report"
  | "comparison"
  | "all";

export interface DeliverableItem {
  type: DeliverableType;
  code: string;
  title: string;
  description: string;
  filename: string;
}

export const DELIVERABLE_ITEMS: DeliverableItem[] = [
  {
    type: "interface-spec",
    code: "D1",
    title: "인터페이스 설계서",
    description: "API/테이블 매칭 현황, 검증 완료·미문서화 목록",
    filename: "D1-interface-spec",
  },
  {
    type: "business-rules",
    code: "D2",
    title: "업무규칙 정의서",
    description: "도메인별 정책 (조건-기준-결과 3-tuple), 신뢰도",
    filename: "D2-business-rules",
  },
  {
    type: "glossary",
    code: "D3",
    title: "용어사전",
    description: "SKOS/JSON-LD 용어, 유형 분포, 계층 트리",
    filename: "D3-glossary",
  },
  {
    type: "gap-report",
    code: "D4",
    title: "Gap 분석 보고서",
    description: "4-perspective 커버리지, 도메인별 Gap 분포",
    filename: "D4-gap-report",
  },
  {
    type: "comparison",
    code: "D5",
    title: "As-Is/To-Be 비교표",
    description: "소스 vs 문서 매트릭스, AI 추출 품질 비교",
    filename: "D5-comparison",
  },
];

/**
 * Fetch deliverable markdown text.
 * Returns raw markdown string (backend returns text/markdown).
 */
export async function fetchDeliverableMarkdown(
  organizationId: string,
  type: DeliverableType,
): Promise<string> {
  const params = new URLSearchParams({ organizationId });
  const res = await fetch(
    `${API_BASE}/deliverables/export/${type}?${params.toString()}`,
    { headers: buildHeaders({ organizationId }) },
  );
  if (!res.ok) {
    throw new Error(`Deliverable fetch failed: ${res.status}`);
  }
  return res.text();
}
