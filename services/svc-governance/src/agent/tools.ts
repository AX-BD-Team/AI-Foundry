/**
 * Tool definitions and executor for AI Chat Agent.
 * Each tool maps to an internal service endpoint via service bindings.
 */

import { createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const logger = createLogger("svc-governance:agent:tools");

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_document_stats",
    description: "문서 업로드 현황을 조회합니다. 총 건수(total)와 최근 문서 상태를 반환합니다.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_pipeline_kpi",
    description: "파이프라인 KPI를 조회합니다. 처리율, 성공률, 단계별 통계를 반환합니다.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_policy_stats",
    description: "정책(Policy) HITL 리뷰 통계를 조회합니다. 완료율, 편집율, 거부율, 리뷰어별 통계를 반환합니다.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_skill_stats",
    description: "Skill 통계를 조회합니다. 총 건수, 품질등급별(Rich/Medium/Thin) 분포를 반환합니다.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_skills",
    description: "Skill을 검색합니다. 키워드, 태그, 서브도메인으로 필터링할 수 있습니다.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "검색 키워드" },
        tag: { type: "string", description: "태그 필터 (예: retirement-pension)" },
        subdomain: { type: "string", description: "서브도메인 필터" },
        limit: { type: "number", description: "결과 수 제한 (기본 5, 최대 20)" },
      },
    },
  },
  {
    name: "search_terms",
    description: "온톨로지 용어를 검색합니다. 도메인 용어의 정의와 관련 정보를 반환합니다.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "검색 키워드" },
        limit: { type: "number", description: "결과 수 제한 (기본 5, 최대 20)" },
      },
      required: ["q"],
    },
  },
  {
    name: "get_analysis_summary",
    description: "특정 문서의 분석 요약을 조회합니다. 문서 ID가 필요합니다.",
    input_schema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "문서 ID" },
      },
      required: ["documentId"],
    },
  },
];

interface ToolCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

async function fetchService(
  service: Fetcher,
  path: string,
  secret: string,
  organizationId: string,
): Promise<ToolCallResult> {
  try {
    const res = await service.fetch(new Request(`https://internal${path}`, {
      headers: {
        "X-Internal-Secret": secret,
        "X-Organization-Id": organizationId,
      },
    }));
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${JSON.stringify(body)}` };
    }
    return { success: true, data: body };
  } catch (e) {
    logger.error("Service call failed", { path, error: String(e) });
    return { success: false, error: String(e) };
  }
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  env: Env,
  organizationId: string,
): Promise<string> {
  let result: ToolCallResult;

  switch (toolName) {
    case "get_document_stats":
      result = await fetchService(env.SVC_INGESTION, "/documents?limit=1", env.INTERNAL_API_SECRET, organizationId);
      break;

    case "get_pipeline_kpi":
      result = await fetchService(env.SVC_ANALYTICS, "/kpi", env.INTERNAL_API_SECRET, organizationId);
      break;

    case "get_policy_stats":
      result = await fetchService(env.SVC_POLICY, "/policies/hitl/stats", env.INTERNAL_API_SECRET, organizationId);
      break;

    case "get_skill_stats":
      result = await fetchService(env.SVC_SKILL, "/skills/stats", env.INTERNAL_API_SECRET, organizationId);
      break;

    case "search_skills": {
      const params = new URLSearchParams();
      if (input["q"]) params.set("q", String(input["q"]));
      if (input["tag"]) params.set("tag", String(input["tag"]));
      if (input["subdomain"]) params.set("subdomain", String(input["subdomain"]));
      params.set("limit", String(input["limit"] ?? 5));
      result = await fetchService(env.SVC_SKILL, `/skills?${params.toString()}`, env.INTERNAL_API_SECRET, organizationId);
      break;
    }

    case "search_terms": {
      const params = new URLSearchParams();
      params.set("q", String(input["q"]));
      params.set("limit", String(input["limit"] ?? 5));
      result = await fetchService(env.SVC_ONTOLOGY, `/terms?${params.toString()}`, env.INTERNAL_API_SECRET, organizationId);
      break;
    }

    case "get_analysis_summary":
      result = await fetchService(
        env.SVC_EXTRACTION,
        `/analysis/${String(input["documentId"])}/summary`,
        env.INTERNAL_API_SECRET,
        organizationId,
      );
      break;

    default:
      result = { success: false, error: `Unknown tool: ${toolName}` };
  }

  return JSON.stringify(result);
}
