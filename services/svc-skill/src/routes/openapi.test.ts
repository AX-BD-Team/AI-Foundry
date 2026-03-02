import { describe, it, expect } from "vitest";
import { toOpenApiSpec } from "./openapi.js";
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

describe("toOpenApiSpec", () => {
  it("returns openapi 3.0.3 version", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    expect(spec.openapi).toBe("3.0.3");
  });

  it("sets info title with domain", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    expect(spec.info.title).toContain("퇴직연금");
  });

  it("sets info title with subdomain", () => {
    const pkg = makeSkillPackage({
      metadata: {
        ...makeSkillPackage().metadata,
        subdomain: "중도인출",
      },
    });
    const spec = toOpenApiSpec(pkg);
    expect(spec.info.title).toContain("중도인출");
  });

  it("maps version from metadata", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    expect(spec.info.version).toBe("1.0.0");
  });

  it("includes skillId in description", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    expect(spec.info.description).toContain("sk-test-001");
  });

  it("sets contact name from author", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    expect(spec.info.contact.name).toBe("test");
  });

  it("maps each policy to a /evaluate/{code} path", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    const paths = Object.keys(spec.paths);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe("/evaluate/pol-pension-wd-001");
  });

  it("uses POST method for evaluation endpoints", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    const pathItem = spec.paths["/evaluate/pol-pension-wd-001"];
    expect(pathItem?.post).toBeDefined();
    expect(pathItem?.post.operationId).toBe("evaluate_pol_pension_wd_001");
  });

  it("sets policy title as operation summary", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    const op = spec.paths["/evaluate/pol-pension-wd-001"]?.post;
    expect(op?.summary).toBe("중도인출 조건");
  });

  it("includes condition, criteria, outcome in description", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    const op = spec.paths["/evaluate/pol-pension-wd-001"]?.post;
    expect(op?.description).toContain("가입 후 5년 경과");
    expect(op?.description).toContain("잔액 50% 이내");
    expect(op?.description).toContain("중도인출 허용");
  });

  it("has bearerAuth security scheme", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    expect(spec.components.securitySchemes["bearerAuth"]).toBeDefined();
    expect(spec.components.securitySchemes["bearerAuth"]?.type).toBe("http");
    expect(spec.components.securitySchemes["bearerAuth"]?.scheme).toBe("bearer");
  });

  it("has EvaluateRequest and EvaluateResponse schemas", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    expect(spec.components.schemas["EvaluateRequest"]).toBeDefined();
    expect(spec.components.schemas["EvaluateResponse"]).toBeDefined();
  });

  it("EvaluateRequest has context as required", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    const schema = spec.components.schemas["EvaluateRequest"];
    expect(schema?.required).toEqual(["context"]);
  });

  it("includes evaluate tag", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    expect(spec.tags).toHaveLength(1);
    expect(spec.tags[0]?.name).toBe("evaluate");
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
    const spec = toOpenApiSpec(pkg);
    const paths = Object.keys(spec.paths);
    expect(paths).toHaveLength(2);
    expect(paths).toContain("/evaluate/pol-pension-wd-001");
    expect(paths).toContain("/evaluate/pol-pension-en-001");
  });

  it("operations reference EvaluateRequest schema via $ref", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    const op = spec.paths["/evaluate/pol-pension-wd-001"]?.post;
    const schema = op?.requestBody.content["application/json"].schema;
    expect(schema).toEqual({ $ref: "#/components/schemas/EvaluateRequest" });
  });

  it("operations have security requirement", () => {
    const spec = toOpenApiSpec(makeSkillPackage());
    const op = spec.paths["/evaluate/pol-pension-wd-001"]?.post;
    expect(op?.security).toEqual([{ bearerAuth: [] }]);
  });
});
