import { describe, it, expect } from "vitest";
import {
  PrototypeOriginSchema,
  PrototypeManifestSchema,
  GeneratePrototypeRequestSchema,
  PrototypeRecordSchema,
  GeneratePrototypeOptionsSchema,
} from "@ai-foundry/types";

describe("PrototypeOriginSchema", () => {
  const valid = {
    organizationId: "lpon-onnuri",
    organizationName: "LPON 온누리상품권",
    domain: "온누리상품권",
    generatedAt: "2026-03-20T00:00:00Z",
    generatedBy: "ai-foundry-prototype-generator" as const,
    version: "1.0.0",
    pipeline: {
      documentCount: 85,
      policyCount: 848,
      termCount: 7332,
      skillCount: 11,
      extractionCount: 111,
    },
  };

  it("유효한 origin 파싱", () => {
    const result = PrototypeOriginSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("generatedBy가 다르면 실패", () => {
    const result = PrototypeOriginSchema.safeParse({ ...valid, generatedBy: "other" });
    expect(result.success).toBe(false);
  });

  it("pipeline 필드 누락 시 실패", () => {
    const { pipeline: _, ...noPipeline } = valid;
    const result = PrototypeOriginSchema.safeParse(noPipeline);
    expect(result.success).toBe(false);
  });

  it("sourceServices는 optional", () => {
    const withServices = {
      ...valid,
      sourceServices: {
        policy: "svc-policy",
        ontology: "svc-ontology",
        extraction: "svc-extraction",
        ingestion: "svc-ingestion",
        skill: "svc-skill",
      },
    };
    expect(PrototypeOriginSchema.safeParse(withServices).success).toBe(true);
    expect(PrototypeOriginSchema.safeParse(valid).success).toBe(true);
  });
});

describe("GeneratePrototypeRequestSchema", () => {
  it("최소 필드만으로 파싱", () => {
    const result = GeneratePrototypeRequestSchema.safeParse({
      organizationId: "lpon",
    });
    expect(result.success).toBe(true);
  });

  it("organizationId 빈 문자열 → 실패", () => {
    const result = GeneratePrototypeRequestSchema.safeParse({
      organizationId: "",
    });
    expect(result.success).toBe(false);
  });

  it("organizationName optional", () => {
    const result = GeneratePrototypeRequestSchema.safeParse({
      organizationId: "lpon",
      organizationName: "LPON 온누리상품권",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.organizationName).toBe("LPON 온누리상품권");
    }
  });

  it("options 전체 전달", () => {
    const result = GeneratePrototypeRequestSchema.safeParse({
      organizationId: "lpon",
      options: { skipLlm: true, maxPoliciesPerScenario: 30, includeScreenSpec: true },
    });
    expect(result.success).toBe(true);
  });
});

describe("GeneratePrototypeOptionsSchema", () => {
  it("기본값 적용", () => {
    const result = GeneratePrototypeOptionsSchema.parse({});
    expect(result.skipLlm).toBe(false);
    expect(result.includeScreenSpec).toBe(false);
    expect(result.maxPoliciesPerScenario).toBe(20);
  });

  it("maxPoliciesPerScenario 범위 검증 (1~50)", () => {
    expect(GeneratePrototypeOptionsSchema.safeParse({ maxPoliciesPerScenario: 0 }).success).toBe(false);
    expect(GeneratePrototypeOptionsSchema.safeParse({ maxPoliciesPerScenario: 51 }).success).toBe(false);
    expect(GeneratePrototypeOptionsSchema.safeParse({ maxPoliciesPerScenario: 1 }).success).toBe(true);
    expect(GeneratePrototypeOptionsSchema.safeParse({ maxPoliciesPerScenario: 50 }).success).toBe(true);
  });
});

describe("PrototypeManifestSchema", () => {
  it("유효한 manifest 파싱", () => {
    const result = PrototypeManifestSchema.safeParse({
      name: "wp-lpon",
      description: "test",
      version: "1.0.0",
      files: [
        { path: "rules/business-rules.json", type: "rules", generatedBy: "mechanical", sourceCount: 848 },
      ],
      generationParams: { llmModel: "claude-sonnet", includeScreenSpec: false, maxPoliciesPerScenario: 20 },
    });
    expect(result.success).toBe(true);
  });

  it("files.type enum 검증", () => {
    const result = PrototypeManifestSchema.safeParse({
      name: "wp",
      description: "t",
      version: "1.0",
      files: [{ path: "x", type: "invalid", generatedBy: "mechanical", sourceCount: 0 }],
      generationParams: { llmModel: "m", includeScreenSpec: false, maxPoliciesPerScenario: 20 },
    });
    expect(result.success).toBe(false);
  });
});

describe("PrototypeRecordSchema", () => {
  it("status enum 검증", () => {
    const base = {
      prototypeId: "wp-1",
      organizationId: "lpon",
      version: "1.0.0",
      r2Key: undefined,
      docCount: 0,
      policyCount: 0,
      termCount: 0,
      skillCount: 0,
      startedAt: "2026-03-20T00:00:00Z",
      createdAt: "2026-03-20T00:00:00Z",
    };

    expect(PrototypeRecordSchema.safeParse({ ...base, status: "generating" }).success).toBe(true);
    expect(PrototypeRecordSchema.safeParse({ ...base, status: "completed" }).success).toBe(true);
    expect(PrototypeRecordSchema.safeParse({ ...base, status: "failed" }).success).toBe(true);
    expect(PrototypeRecordSchema.safeParse({ ...base, status: "unknown" }).success).toBe(false);
  });
});
