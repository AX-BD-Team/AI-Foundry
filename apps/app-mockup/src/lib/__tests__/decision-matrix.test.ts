import { describe, it, expect } from "vitest";
import {
  analyzeDataCharacteristics,
  selectVisualizationType,
  generateVisualizationPrompt,
  type DataCharacteristics,
} from "../decision-matrix";

describe("Decision Matrix", () => {
  describe("selectVisualizationType", () => {
    it("time series data → chart", () => {
      const chars: DataCharacteristics = {
        hasTimeSeries: true,
        hasHierarchy: false,
        hasGraph: false,
        hasNumericComparison: false,
        hasProcessFlow: false,
        requiresInput: false,
        rowCount: 10,
        columnCount: 3,
      };
      const result = selectVisualizationType(chars);
      expect(result.vizType).toBe("chart");
      expect(result.templateKey).toBe("line-chart");
    });

    it("node-edge data → graph", () => {
      const chars: DataCharacteristics = {
        hasTimeSeries: false,
        hasHierarchy: false,
        hasGraph: true,
        hasNumericComparison: false,
        hasProcessFlow: false,
        requiresInput: false,
        rowCount: 5,
        columnCount: 3,
      };
      const result = selectVisualizationType(chars);
      expect(result.vizType).toBe("graph");
      expect(result.templateKey).toBe("force-graph");
    });

    it("process flow data → diagram", () => {
      const chars: DataCharacteristics = {
        hasTimeSeries: false,
        hasHierarchy: false,
        hasGraph: false,
        hasNumericComparison: false,
        hasProcessFlow: true,
        requiresInput: false,
        rowCount: 5,
        columnCount: 4,
      };
      const result = selectVisualizationType(chars);
      expect(result.vizType).toBe("diagram");
      expect(result.templateKey).toBe("mermaid-flowchart");
    });

    it("hierarchy data → diagram (tree)", () => {
      const chars: DataCharacteristics = {
        hasTimeSeries: false,
        hasHierarchy: true,
        hasGraph: false,
        hasNumericComparison: false,
        hasProcessFlow: false,
        requiresInput: false,
        rowCount: 8,
        columnCount: 3,
      };
      const result = selectVisualizationType(chars);
      expect(result.vizType).toBe("diagram");
      expect(result.templateKey).toBe("mermaid-tree");
    });

    it("many rows → table", () => {
      const chars: DataCharacteristics = {
        hasTimeSeries: false,
        hasHierarchy: false,
        hasGraph: false,
        hasNumericComparison: false,
        hasProcessFlow: false,
        requiresInput: false,
        rowCount: 25,
        columnCount: 4,
      };
      const result = selectVisualizationType(chars);
      expect(result.vizType).toBe("table");
      expect(result.templateKey).toBe("data-table");
    });

    it("numeric comparison with few columns → chart (bar)", () => {
      const chars: DataCharacteristics = {
        hasTimeSeries: false,
        hasHierarchy: false,
        hasGraph: false,
        hasNumericComparison: true,
        hasProcessFlow: false,
        requiresInput: false,
        rowCount: 5,
        columnCount: 3,
      };
      const result = selectVisualizationType(chars);
      expect(result.vizType).toBe("chart");
      expect(result.templateKey).toBe("bar-chart");
    });

    it("numeric comparison with many columns → table (heatmap)", () => {
      const chars: DataCharacteristics = {
        hasTimeSeries: false,
        hasHierarchy: false,
        hasGraph: false,
        hasNumericComparison: true,
        hasProcessFlow: false,
        requiresInput: false,
        rowCount: 5,
        columnCount: 8,
      };
      const result = selectVisualizationType(chars);
      expect(result.vizType).toBe("table");
      expect(result.templateKey).toBe("heatmap-table");
    });

    it("text-only data → markdown (default fallback)", () => {
      const chars: DataCharacteristics = {
        hasTimeSeries: false,
        hasHierarchy: false,
        hasGraph: false,
        hasNumericComparison: false,
        hasProcessFlow: false,
        requiresInput: false,
        rowCount: 3,
        columnCount: 2,
      };
      const result = selectVisualizationType(chars);
      expect(result.vizType).toBe("markdown");
      expect(result.templateKey).toBe("text-summary");
    });

    it("requiresInput takes highest priority → form", () => {
      const chars: DataCharacteristics = {
        hasTimeSeries: true,
        hasHierarchy: true,
        hasGraph: true,
        hasNumericComparison: true,
        hasProcessFlow: true,
        requiresInput: true,
        rowCount: 100,
        columnCount: 10,
      };
      const result = selectVisualizationType(chars);
      expect(result.vizType).toBe("form");
    });
  });

  describe("analyzeDataCharacteristics", () => {
    it("detects time series from date columns", () => {
      const data = [
        { name: "A", createdAt: "2026-01-01", value: 10 },
        { name: "B", createdAt: "2026-02-01", value: 20 },
      ];
      const result = analyzeDataCharacteristics(data);
      expect(result.hasTimeSeries).toBe(true);
      expect(result.rowCount).toBe(2);
      expect(result.columnCount).toBe(3);
    });

    it("detects hierarchy from parent columns", () => {
      const data = [
        { id: "1", label: "Root", parent_id: null },
        { id: "2", label: "Child", parent_id: "1" },
      ];
      const result = analyzeDataCharacteristics(data);
      expect(result.hasHierarchy).toBe(true);
    });

    it("detects graph from metadata relationshipCount", () => {
      const data = [{ id: "1", name: "Node" }];
      const result = analyzeDataCharacteristics(data, { relationshipCount: 5 });
      expect(result.hasGraph).toBe(true);
    });

    it("detects numeric comparison", () => {
      const data = [
        { domain: "A", count: 100 },
        { domain: "B", count: 200 },
      ];
      const result = analyzeDataCharacteristics(data);
      expect(result.hasNumericComparison).toBe(true);
    });

    it("detects process flow from status/step columns", () => {
      const data = [
        { step: 1, name: "Start", status: "done" },
        { step: 2, name: "Process", status: "running" },
      ];
      const result = analyzeDataCharacteristics(data);
      expect(result.hasProcessFlow).toBe(true);
    });

    it("handles empty data", () => {
      const result = analyzeDataCharacteristics([]);
      expect(result.rowCount).toBe(0);
      expect(result.columnCount).toBe(0);
      expect(result.hasTimeSeries).toBe(false);
    });
  });

  describe("generateVisualizationPrompt", () => {
    it("returns non-empty string for known template", () => {
      const prompt = generateVisualizationPrompt("force-graph", { nodes: [] }, "light");
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain("force-directed graph");
    });

    it("returns non-empty string for unknown template (falls back to text-summary)", () => {
      const prompt = generateVisualizationPrompt("unknown-template", {}, "dark");
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain("visualization expert");
    });

    it("includes theme hint in prompt", () => {
      const prompt = generateVisualizationPrompt("bar-chart", [], "dark");
      expect(prompt).toContain("dark");
    });

    it("includes data in prompt", () => {
      const data = [{ x: 1, y: 2 }];
      const prompt = generateVisualizationPrompt("line-chart", data, "light");
      expect(prompt).toContain('"x": 1');
    });
  });
});
