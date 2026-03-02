import { describe, it, expect } from "vitest";
import { toMcpAdapter } from "./mcp.js";
import type { SkillPackage } from "@ai-foundry/types";

function makeSkillPackage(overrides?: Partial<SkillPackage>): SkillPackage {
  return {
    $schema: "https://ai-foundry.ktds.com/schemas/skill/v1",
    skillId: "sk-test-001",
    metadata: {
      domain: "퇴직연금",
      language: "ko",
      version: "1.0.0",
      createdAt: "2026-02-28T00:00:00.000Z",
      updatedAt: "2026-02-28T00:00:00.000Z",
      author: "test",
      tags: [],
    },
    policies: [
      {
        code: "POL-PENSION-WD-001",
        title: "중도인출 조건",
        condition: "가입 후 5년 경과",
        criteria: "잔액 50% 이내",
        outcome: "중도인출 허용",
        source: { documentId: "doc-1" },
        trust: { level: "reviewed", score: 0.8 },
        tags: ["중도인출"],
      },
    ],
    trust: { level: "reviewed", score: 0.8 },
    ontologyRef: { graphId: "g-1", termUris: ["urn:1"] },
    provenance: {
      sourceDocumentIds: ["doc-1"],
      organizationId: "org-1",
      extractedAt: "2026-02-28T00:00:00.000Z",
      pipeline: { stages: ["s1"], models: { s1: "claude" } },
    },
    adapters: {},
    ...overrides,
  };
}

describe("toMcpAdapter", () => {
  it("produces correct adapter name without subdomain", () => {
    const pkg = makeSkillPackage();
    const adapter = toMcpAdapter(pkg);
    expect(adapter.name).toBe("ai-foundry-skill-퇴직연금");
  });

  it("produces correct adapter name with subdomain", () => {
    const pkg = makeSkillPackage({
      metadata: {
        ...makeSkillPackage().metadata,
        subdomain: "중도인출",
      },
    });
    const adapter = toMcpAdapter(pkg);
    expect(adapter.name).toBe("ai-foundry-skill-퇴직연금-중도인출");
  });

  it("maps version from metadata", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    expect(adapter.version).toBe("1.0.0");
  });

  it("generates description with domain", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    expect(adapter.description).toContain("퇴직연금");
  });

  it("generates description with subdomain", () => {
    const pkg = makeSkillPackage({
      metadata: {
        ...makeSkillPackage().metadata,
        subdomain: "중도인출",
      },
    });
    const adapter = toMcpAdapter(pkg);
    expect(adapter.description).toContain("중도인출");
  });

  it("maps each policy to one MCP tool", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    expect(adapter.tools).toHaveLength(1);
    expect(adapter.tools[0]?.name).toBe("pol-pension-wd-001");
  });

  it("lowercases policy code for tool name", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    const tool = adapter.tools[0];
    expect(tool?.name).toBe("pol-pension-wd-001");
    expect(tool?.name).not.toMatch(/[A-Z]/);
  });

  it("includes condition in tool description", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    const tool = adapter.tools[0];
    expect(tool?.description).toContain("중도인출 조건");
    expect(tool?.description).toContain("가입 후 5년 경과");
  });

  it("tool has correct input schema", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    const schema = adapter.tools[0]?.inputSchema;
    expect(schema?.type).toBe("object");
    expect(schema?.required).toEqual(["context"]);
    expect(schema?.properties["context"]).toBeDefined();
    expect(schema?.properties["parameters"]).toBeDefined();
  });

  it("tool has annotations with title and hints", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    const tool = adapter.tools[0];
    expect(tool?.annotations.title).toBe("중도인출 조건");
    expect(tool?.annotations.readOnlyHint).toBe(true);
    expect(tool?.annotations.openWorldHint).toBe(true);
  });

  it("includes protocolVersion", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    expect(adapter.protocolVersion).toBe("2024-11-05");
  });

  it("includes capabilities with tools", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    expect(adapter.capabilities).toEqual({ tools: { listChanged: false } });
  });

  it("includes serverInfo matching name and version", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    expect(adapter.serverInfo.name).toBe(adapter.name);
    expect(adapter.serverInfo.version).toBe("1.0.0");
  });

  it("includes instructions with domain info", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    expect(adapter.instructions).toContain("퇴직연금");
    expect(adapter.instructions).toContain("1 policy tool(s)");
  });

  it("includes skillId in metadata", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    expect(adapter.metadata.skillId).toBe("sk-test-001");
  });

  it("includes trust info in metadata", () => {
    const adapter = toMcpAdapter(makeSkillPackage());
    expect(adapter.metadata.trustLevel).toBe("reviewed");
    expect(adapter.metadata.trustScore).toBe(0.8);
  });

  it("handles multiple policies", () => {
    const pkg = makeSkillPackage({
      policies: [
        {
          code: "POL-PENSION-WD-001",
          title: "정책 1",
          condition: "조건 1",
          criteria: "기준 1",
          outcome: "결과 1",
          source: { documentId: "doc-1" },
          trust: { level: "reviewed", score: 0.8 },
          tags: [],
        },
        {
          code: "POL-PENSION-EN-001",
          title: "정책 2",
          condition: "조건 2",
          criteria: "기준 2",
          outcome: "결과 2",
          source: { documentId: "doc-1" },
          trust: { level: "reviewed", score: 0.9 },
          tags: [],
        },
      ],
    });
    const adapter = toMcpAdapter(pkg);
    expect(adapter.tools).toHaveLength(2);
    expect(adapter.tools[0]?.name).toBe("pol-pension-wd-001");
    expect(adapter.tools[1]?.name).toBe("pol-pension-en-001");
  });

  it("sets generatedAt timestamp", () => {
    const before = new Date().toISOString();
    const adapter = toMcpAdapter(makeSkillPackage());
    const after = new Date().toISOString();
    expect(adapter.metadata.generatedAt >= before).toBe(true);
    expect(adapter.metadata.generatedAt <= after).toBe(true);
  });
});
