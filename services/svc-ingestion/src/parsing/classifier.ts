import type { UnstructuredElement } from "./unstructured.js";
import type { SiSubtype } from "./xlsx.js";

export type DocumentCategory =
  | "erd"
  | "screen_design"
  | "api_spec"
  | "requirements"
  | "process"
  | "general"
  // v0.7.4 source code categories
  | "source_controller"
  | "source_vo"
  | "source_service"
  | "source_ddl"
  | "source_config"
  | "source_mapper"
  | "source_project";

export type DocumentClassification = {
  category: DocumentCategory;
  confidence: number;
};

// ── SI Subtype → DocumentCategory mapping ───────────────────────

const SI_SUBTYPE_CATEGORY: Partial<Record<SiSubtype, DocumentCategory>> = {
  "화면설계": "screen_design",
  "프로그램설계": "screen_design",
  "테이블정의": "erd",
  "코드정의": "erd",
  "요구사항": "requirements",
  "업무규칙": "requirements",
  "인터페이스설계": "api_spec",
  "배치설계": "process",
  "단위테스트": "process",
  "통합테스트": "process",
  "공통": "general",
};

/**
 * Classify xlsx elements using the SI subtype tag embedded in element_type.
 * Recognises two naming conventions:
 * - "XlSheet:<siSubtype>" — from parseXlsx()
 * - "XlScreen*" — from parseScreenDesign() (XlScreenMeta, XlScreenLogic, etc.)
 * - "XlProgramMeta" — from extractProgramMeta()
 * Falls back to "general" with low confidence when no subtype is detected.
 */
export function classifyXlsxElements(
  elements: UnstructuredElement[],
): DocumentClassification {
  for (const el of elements) {
    // parseXlsx output: "XlSheet:<siSubtype>"
    if (el.type.startsWith("XlSheet:")) {
      const siSubtype = el.type.slice("XlSheet:".length) as SiSubtype;
      const category = SI_SUBTYPE_CATEGORY[siSubtype];
      if (category) {
        return { category, confidence: 0.9 };
      }
      // Known subtype but no category mapping (e.g., "unknown")
      return { category: "general", confidence: 0.5 };
    }

    // parseScreenDesign output: XlScreenMeta, XlScreenLayout, XlScreenData, XlScreenLogic, XlScreenNote
    if (el.type.startsWith("XlScreen")) {
      return { category: "screen_design", confidence: 0.9 };
    }

    // extractProgramMeta output
    if (el.type === "XlProgramMeta") {
      return { category: "screen_design", confidence: 0.9 };
    }
  }

  // No XlSheet/XlScreen elements found (unlikely — only summary)
  return { category: "general", confidence: 0.3 };
}

/**
 * Classify source code elements based on their element type.
 * Used for .java, .sql, and .zip uploads (v0.7.4).
 */
export function classifySourceElements(
  elements: UnstructuredElement[],
): DocumentClassification {
  const typeCounts: Record<string, number> = {};
  for (const el of elements) {
    typeCounts[el.type] = (typeCounts[el.type] ?? 0) + 1;
  }

  // If multiple element types present, it's a project archive
  const sourceTypes = ["CodeController", "CodeDataModel", "CodeTransaction", "CodeDdl", "CodeMapper"];
  const presentTypes = sourceTypes.filter((t) => (typeCounts[t] ?? 0) > 0);

  if (presentTypes.length > 1 || typeCounts["SourceProjectSummary"]) {
    return { category: "source_project", confidence: 0.95 };
  }

  if (typeCounts["CodeController"]) return { category: "source_controller", confidence: 0.9 };
  if (typeCounts["CodeDataModel"]) return { category: "source_vo", confidence: 0.9 };
  if (typeCounts["CodeTransaction"]) return { category: "source_service", confidence: 0.9 };
  if (typeCounts["CodeDdl"]) return { category: "source_ddl", confidence: 0.9 };
  if (typeCounts["CodeMapper"]) return { category: "source_mapper", confidence: 0.9 };

  return { category: "source_config", confidence: 0.5 };
}

const KEYWORD_RULES: Array<{ keywords: string[]; category: DocumentCategory }> = [
  { keywords: ["ERD", "엔터티", "entity", "관계"], category: "erd" },
  { keywords: ["화면", "UI", "UX", "스크린"], category: "screen_design" },
  { keywords: ["API", "endpoint", "swagger"], category: "api_spec" },
  { keywords: ["요구사항", "requirement", "기능"], category: "requirements" },
  { keywords: ["프로세스", "절차", "업무"], category: "process" },
];

export function classifyDocument(
  elements: UnstructuredElement[],
  fileType: string,
): DocumentClassification {
  const combinedText = elements.map((el) => el.text).join(" ").toLowerCase();

  // Score each category by counting keyword matches
  const scores: Record<string, number> = {
    erd: 0,
    screen_design: 0,
    api_spec: 0,
    requirements: 0,
    process: 0,
    general: 0,
  };

  for (const { keywords, category } of KEYWORD_RULES) {
    for (const kw of keywords) {
      const lower = kw.toLowerCase();
      // Short ASCII keywords (UI, UX, API, ERD) need word-boundary matching
      // to avoid false positives like "requirement" matching "ui"
      const isShortAscii = /^[a-z]{2,3}$/i.test(kw);
      const matched = isShortAscii
        ? new RegExp(`\\b${lower}\\b`).test(combinedText)
        : combinedText.includes(lower);
      if (matched) {
        scores[category] = (scores[category] ?? 0) + 1;
      }
    }
  }

  // Boost score based on fileType hint
  if (fileType === "xlsx" || fileType === "xls") {
    scores["requirements"] = (scores["requirements"] ?? 0) + 0.5;
    scores["process"] = (scores["process"] ?? 0) + 0.3;
  } else if (fileType === "pptx" || fileType === "ppt") {
    scores["screen_design"] = (scores["screen_design"] ?? 0) + 0.5;
  }

  // Find best category
  let bestCategory: DocumentCategory = "general";
  let bestScore = 0;
  for (const [cat, score] of Object.entries(scores)) {
    if ((score ?? 0) > bestScore) {
      bestScore = score ?? 0;
      bestCategory = cat as DocumentCategory;
    }
  }

  const confidence = bestScore > 0 ? Math.min(0.95, 0.5 + bestScore * 0.15) : 0.3;
  return { category: bestCategory, confidence };
}
