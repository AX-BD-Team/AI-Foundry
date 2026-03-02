import type { UnstructuredElement } from "./unstructured.js";

export type DocumentCategory =
  | "erd"
  | "screen_design"
  | "api_spec"
  | "requirements"
  | "process"
  | "general";

export type DocumentClassification = {
  category: DocumentCategory;
  confidence: number;
};

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
  const scores: Record<DocumentCategory, number> = {
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
        scores[category] += 1;
      }
    }
  }

  // Boost score based on fileType hint
  if (fileType === "xlsx" || fileType === "xls") {
    scores.requirements += 0.5;
    scores.process += 0.3;
  } else if (fileType === "pptx" || fileType === "ppt") {
    scores.screen_design += 0.5;
  }

  // Find best category
  let bestCategory: DocumentCategory = "general";
  let bestScore = 0;
  const entries = Object.entries(scores) as Array<[DocumentCategory, number]>;
  for (const [cat, score] of entries) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  const confidence = bestScore > 0 ? Math.min(0.95, 0.5 + bestScore * 0.15) : 0.3;
  return { category: bestCategory, confidence };
}
