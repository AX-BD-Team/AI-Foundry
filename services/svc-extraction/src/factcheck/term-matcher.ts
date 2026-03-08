import type { Env } from "../env.js";

export interface TermMapping {
  sourceName: string;
  documentName: string;
  matchScore: number;
  matchMethod: string;
}

interface MatchResultRow {
  match_result_json: string | null;
}

interface StoredMatchedItem {
  sourceRef: { name: string; type: string };
  docRef?: { name: string; type: string };
  matchScore: number;
  matchMethod: string;
}

/**
 * fact_check_results의 match_result_json에서 소스↔문서 매핑을 추출.
 * 이를 gap-analysis의 프로세스/아키텍처 매칭에 활용할 수 있음.
 */
export async function buildTermMappings(
  env: Env,
  organizationId: string,
): Promise<TermMapping[]> {
  const rows = await env.DB_EXTRACTION.prepare(
    `SELECT match_result_json
     FROM fact_check_results
     WHERE organization_id = ? AND status = 'completed'
       AND match_result_json IS NOT NULL`,
  )
    .bind(organizationId)
    .all<MatchResultRow>();

  const mappings: TermMapping[] = [];

  for (const row of rows.results) {
    if (!row.match_result_json) continue;

    let parsed: { matchedItems?: StoredMatchedItem[] };
    try {
      parsed = JSON.parse(row.match_result_json) as {
        matchedItems?: StoredMatchedItem[];
      };
    } catch {
      continue;
    }

    const items = parsed.matchedItems;
    if (!items) continue;

    for (const item of items) {
      const docRef = item.docRef;
      if (!docRef) continue;

      mappings.push({
        sourceName: item.sourceRef.name,
        documentName: docRef.name,
        matchScore: item.matchScore,
        matchMethod: item.matchMethod,
      });
    }
  }

  return mappings;
}

/**
 * 한국어 명사 + 영어 클래스명 간 간접 매칭.
 * termMappings에서 가장 유사한 매핑을 찾아 반환.
 * 매칭 없으면 null.
 */
export function findBestTermMatch(
  docProcessName: string,
  sourceUnits: string[],
  termMappings: TermMapping[],
): { sourceName: string; confidence: number } | null {
  const normalizedDoc = docProcessName.toLowerCase().trim();

  let bestMatch: { sourceName: string; confidence: number } | null = null;

  for (const mapping of termMappings) {
    const normalizedMappingDoc = mapping.documentName.toLowerCase().trim();

    // Check if docProcessName is a substring of mapping.documentName or vice versa
    const isPartialMatch =
      normalizedMappingDoc.includes(normalizedDoc) ||
      normalizedDoc.includes(normalizedMappingDoc);

    if (!isPartialMatch) continue;

    // Found a mapping whose documentName relates to docProcessName.
    // Now check if the corresponding sourceName exists in sourceUnits.
    const normalizedSource = mapping.sourceName.toLowerCase();

    for (const unit of sourceUnits) {
      const normalizedUnit = unit.toLowerCase();

      // Direct match: sourceName found in sourceUnits
      const isSourceMatch =
        normalizedUnit.includes(normalizedSource) ||
        normalizedSource.includes(normalizedUnit);

      if (!isSourceMatch) continue;

      const confidence = mapping.matchScore;
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { sourceName: unit, confidence };
      }
    }
  }

  return bestMatch;
}
