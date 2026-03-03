import type { ApiResponse } from "@ai-foundry/types";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const HEADERS = {
  "Content-Type": "application/json",
  "X-Internal-Secret":
    (import.meta.env["VITE_INTERNAL_SECRET"] as string | undefined) ??
    "dev-secret",
  "X-User-Id": "developer-001",
  "X-User-Role": "Developer",
  "X-Organization-Id": "org-001",
};

export interface SkillRow {
  skillId: string;
  metadata: {
    domain: string;
    subdomain?: string;
    language: string;
    version: string;
    createdAt: string;
    updatedAt: string;
    author: string;
    tags: string[];
  };
  trust: {
    level: "unreviewed" | "reviewed" | "validated";
    score: number;
  };
  policyCount: number;
  r2Key: string;
  status: "draft" | "published" | "archived";
}

export interface SkillDetail extends SkillRow {
  ontologyId: string;
}

export async function fetchSkills(params?: {
  domain?: string;
  status?: string;
  trustLevel?: string;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<{ skills: SkillRow[]; limit: number; offset: number }>> {
  const qs = new URLSearchParams();
  if (params !== undefined) {
    if (params.domain !== undefined) qs.set("domain", params.domain);
    if (params.status !== undefined) qs.set("status", params.status);
    if (params.trustLevel !== undefined) qs.set("trustLevel", params.trustLevel);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
  }
  const query = qs.toString();
  const res = await fetch(
    `${API_BASE}/skills${query ? `?${query}` : ""}`,
    { headers: HEADERS },
  );
  return res.json() as Promise<
    ApiResponse<{ skills: SkillRow[]; limit: number; offset: number }>
  >;
}

export async function fetchSkill(
  id: string,
): Promise<ApiResponse<SkillDetail>> {
  const res = await fetch(`${API_BASE}/skills/${id}`, {
    headers: HEADERS,
  });
  return res.json() as Promise<ApiResponse<SkillDetail>>;
}

export async function downloadSkill(id: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/skills/${id}/download`, {
    headers: HEADERS,
  });
  return res.blob();
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface McpAdapter {
  name: string;
  version: string;
  description: string;
  tools: McpTool[];
  metadata: {
    skillId: string;
    domain: string;
    trustLevel: string;
    trustScore: number;
    generatedAt: string;
  };
}

export async function fetchSkillMcp(
  id: string,
): Promise<McpAdapter> {
  const res = await fetch(`${API_BASE}/skills/${id}/mcp`, {
    headers: HEADERS,
  });
  return res.json() as Promise<McpAdapter>;
}

export async function fetchSkillOpenApi(
  id: string,
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/skills/${id}/openapi`, {
    headers: HEADERS,
  });
  return res.json() as Promise<unknown>;
}
