/**
 * Decision Matrix — 데이터 특성 분석 → 최적 시각화 유형 자동 선택.
 * Design Doc: AIF-DSGN-024 §3.8 DecisionMatrix.ts
 */

import type { WidgetType } from "./widget-bridge";

/** 데이터 특성 분석 결과 */
export interface DataCharacteristics {
  hasTimeSeries: boolean;
  hasHierarchy: boolean;
  hasGraph: boolean;
  hasNumericComparison: boolean;
  hasProcessFlow: boolean;
  requiresInput: boolean;
  rowCount: number;
  columnCount: number;
}

/** 시각화 유형 선택 결과 */
export interface VizSelection {
  vizType: WidgetType;
  templateKey: string;
}

/** 데이터 특성 → 시각화 유형 매핑 룰 (우선순위 순) */
const DECISION_RULES: Array<{
  condition: (c: DataCharacteristics) => boolean;
  vizType: WidgetType;
  templateKey: string;
}> = [
  {
    condition: (c) => c.requiresInput,
    vizType: "form",
    templateKey: "input-form",
  },
  {
    condition: (c) => c.hasGraph,
    vizType: "graph",
    templateKey: "force-graph",
  },
  {
    condition: (c) => c.hasProcessFlow,
    vizType: "diagram",
    templateKey: "mermaid-flowchart",
  },
  {
    condition: (c) => c.hasHierarchy,
    vizType: "diagram",
    templateKey: "mermaid-tree",
  },
  {
    condition: (c) => c.hasTimeSeries,
    vizType: "chart",
    templateKey: "line-chart",
  },
  {
    condition: (c) => c.hasNumericComparison && c.columnCount <= 5,
    vizType: "chart",
    templateKey: "bar-chart",
  },
  {
    condition: (c) => c.hasNumericComparison && c.columnCount > 5,
    vizType: "table",
    templateKey: "heatmap-table",
  },
  {
    condition: (c) => c.rowCount > 20,
    vizType: "table",
    templateKey: "data-table",
  },
];

/** 데이터 특성 → 시각화 유형 선택 (우선순위 기반 rule matching) */
export function selectVisualizationType(
  characteristics: DataCharacteristics,
): VizSelection {
  for (const rule of DECISION_RULES) {
    if (rule.condition(characteristics)) {
      return { vizType: rule.vizType, templateKey: rule.templateKey };
    }
  }
  return { vizType: "markdown", templateKey: "text-summary" };
}

/**
 * 원시 데이터를 분석하여 DataCharacteristics를 추출한다.
 * @param data - 분석 대상 데이터 배열
 * @param metadata - 엔티티 유형 및 관계 수 (그래프 판별용)
 */
export function analyzeDataCharacteristics(
  data: Record<string, unknown>[],
  metadata?: { entityType?: string | undefined; relationshipCount?: number | undefined },
): DataCharacteristics {
  const firstRow = data[0];
  const columns = firstRow ? Object.keys(firstRow) : [];

  const hasDateColumn = columns.some(
    (c) => c.includes("date") || c.includes("Date") || c.includes("time") || c.includes("At"),
  );
  const hasParentRef = columns.some(
    (c) => c.includes("parent") || c.includes("broader") || c.includes("parent_id"),
  );
  const hasNumeric = columns.some((c) => {
    const sample = firstRow?.[c];
    return typeof sample === "number";
  });
  const hasFlow = columns.some(
    (c) => c.includes("status") || c.includes("stage") || c.includes("step"),
  );

  return {
    hasTimeSeries: hasDateColumn,
    hasHierarchy: hasParentRef,
    hasGraph: (metadata?.relationshipCount ?? 0) > 0,
    hasNumericComparison: hasNumeric,
    hasProcessFlow: hasFlow,
    requiresInput: false,
    rowCount: data.length,
    columnCount: columns.length,
  };
}

/**
 * 시각화 유형에 맞는 LLM 프롬프트를 생성한다.
 * PoC에서는 실제 LLM 호출 없이 정적 콘텐츠로 대체하지만,
 * 향후 svc-mcp-server에서 svc-llm-router를 호출할 때 이 프롬프트를 사용한다.
 */
export function generateVisualizationPrompt(
  templateKey: string,
  data: unknown,
  themeHint: "light" | "dark" = "light",
): string {
  const basePrompt = `You are a data visualization expert.
Generate a complete HTML document with inline CSS and SVG/JavaScript for the following data.

Rules:
- Use ONLY inline styles and scripts (no external resources)
- Use CSS variables: var(--aif-primary), var(--aif-bg), var(--aif-text), var(--aif-accent), var(--aif-border)
- Current theme: ${themeHint}
- Make the visualization responsive (width: 100%)
- Use window.__bridge.action(name, payload) to send user interactions to the parent
- Keep total HTML under 50KB
- Use simple, readable code

`;

  const templatePrompts: Record<string, string> = {
    "force-graph": `${basePrompt}Create an animated force-directed graph using inline SVG and JavaScript.\nNodes should be circles with labels. Edges should be lines with optional labels.\nAdd zoom/pan via mouse. Highlight connected nodes on hover.\nData:\n${JSON.stringify(data, null, 2)}`,
    "mermaid-flowchart": `${basePrompt}Create a Mermaid flowchart diagram. Output a <div class="mermaid"> block.\nThe Mermaid library will be injected separately.\nData:\n${JSON.stringify(data, null, 2)}`,
    "mermaid-tree": `${basePrompt}Create a Mermaid graph TD (top-down tree) diagram showing hierarchy.\nThe Mermaid library will be injected separately.\nData:\n${JSON.stringify(data, null, 2)}`,
    "line-chart": `${basePrompt}Create an SVG line chart with axes, grid lines, and data points.\nAdd tooltip on hover showing exact values.\nData:\n${JSON.stringify(data, null, 2)}`,
    "bar-chart": `${basePrompt}Create an SVG bar chart with labeled axes and value labels on each bar.\nAdd hover effects.\nData:\n${JSON.stringify(data, null, 2)}`,
    "heatmap-table": `${basePrompt}Create an HTML table with color-coded cells (heatmap style).\nUse the color scale from var(--aif-bg) (low) to var(--aif-accent) (high).\nData:\n${JSON.stringify(data, null, 2)}`,
    "data-table": `${basePrompt}Create a sortable HTML table with alternating row colors.\nAdd column header click-to-sort functionality with inline JavaScript.\nData:\n${JSON.stringify(data, null, 2)}`,
    "text-summary": `${basePrompt}Create a styled HTML summary card with key metrics highlighted.\nUse semantic HTML (h2, p, ul, table).\nData:\n${JSON.stringify(data, null, 2)}`,
  };

  return templatePrompts[templateKey] ?? templatePrompts["text-summary"] ?? basePrompt;
}

export type { WidgetType };
