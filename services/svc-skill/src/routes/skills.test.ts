import { describe, it, expect } from "vitest";
import { parseTags, rowToSummary, rowToDetail, type SkillRow } from "./skills.js";

// ── Test fixture ───────────────────────────────────────────────────

const baseRow: SkillRow = {
  skill_id: "sk-001",
  ontology_id: "ont-001",
  organization_id: "org-test",
  domain: "퇴직연금",
  subdomain: "중도인출",
  language: "ko",
  version: "1.0.0",
  r2_key: "skill-packages/sk-001.skill.json",
  policy_count: 3,
  trust_level: "reviewed",
  trust_score: 0.85,
  tags: '["퇴직연금","인출"]',
  author: "analyst-001",
  status: "draft",
  content_depth: 245,
  created_at: "2026-02-28T00:00:00.000Z",
  updated_at: "2026-02-28T00:00:00.000Z",
};

// ── parseTags ──────────────────────────────────────────────────────

describe("parseTags", () => {
  it("parses valid JSON string array", () => {
    expect(parseTags('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseTags("not-json")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseTags("")).toEqual([]);
  });

  it("returns empty array for JSON object", () => {
    expect(parseTags('{"key":"val"}')).toEqual([]);
  });

  it("returns empty array for JSON null", () => {
    expect(parseTags("null")).toEqual([]);
  });

  it("filters non-string elements", () => {
    expect(parseTags('[1, "valid", null, true, "also"]')).toEqual(["valid", "also"]);
  });

  it("handles empty JSON array", () => {
    expect(parseTags("[]")).toEqual([]);
  });

  it("handles Korean tags", () => {
    expect(parseTags('["퇴직연금","중도인출"]')).toEqual(["퇴직연금", "중도인출"]);
  });
});

// ── rowToSummary ───────────────────────────────────────────────────

describe("rowToSummary", () => {
  it("maps all fields correctly", () => {
    const result = rowToSummary(baseRow);
    expect(result.skillId).toBe("sk-001");
    expect(result.metadata.domain).toBe("퇴직연금");
    expect(result.metadata.subdomain).toBe("중도인출");
    expect(result.metadata.language).toBe("ko");
    expect(result.metadata.version).toBe("1.0.0");
    expect(result.metadata.author).toBe("analyst-001");
    expect(result.metadata.createdAt).toBe("2026-02-28T00:00:00.000Z");
    expect(result.metadata.updatedAt).toBe("2026-02-28T00:00:00.000Z");
    expect(result.trust.level).toBe("reviewed");
    expect(result.trust.score).toBe(0.85);
    expect(result.policyCount).toBe(3);
    expect(result.r2Key).toBe("skill-packages/sk-001.skill.json");
    expect(result.status).toBe("draft");
  });

  it("parses tags from JSON", () => {
    const result = rowToSummary(baseRow);
    expect(result.metadata.tags).toEqual(["퇴직연금", "인출"]);
  });

  it("omits subdomain when null", () => {
    const row = { ...baseRow, subdomain: null };
    const result = rowToSummary(row);
    expect(result.metadata).not.toHaveProperty("subdomain");
  });

  it("handles empty tags JSON", () => {
    const row = { ...baseRow, tags: "[]" };
    const result = rowToSummary(row);
    expect(result.metadata.tags).toEqual([]);
  });

  it("handles invalid tags JSON gracefully", () => {
    const row = { ...baseRow, tags: "broken" };
    const result = rowToSummary(row);
    expect(result.metadata.tags).toEqual([]);
  });

  it("maps trust levels correctly", () => {
    for (const level of ["unreviewed", "reviewed", "validated"] as const) {
      const row = { ...baseRow, trust_level: level };
      const result = rowToSummary(row);
      expect(result.trust.level).toBe(level);
    }
  });
});

// ── rowToDetail ────────────────────────────────────────────────────

describe("rowToDetail", () => {
  it("extends summary with ontologyId", () => {
    const result = rowToDetail(baseRow);
    expect(result.ontologyId).toBe("ont-001");
    expect(result.skillId).toBe("sk-001");
  });

  it("inherits all summary fields", () => {
    const result = rowToDetail(baseRow);
    expect(result.metadata.domain).toBe("퇴직연금");
    expect(result.trust.level).toBe("reviewed");
    expect(result.policyCount).toBe(3);
    expect(result.status).toBe("draft");
  });
});
