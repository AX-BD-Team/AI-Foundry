import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId, contentType: "application/json" });
}

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
  contentDepth: number;
}

export interface SkillDetail extends SkillRow {
  ontologyId: string;
}

export async function fetchSkills(
  organizationId: string,
  params?: {
    domain?: string;
    status?: string;
    trustLevel?: string;
    minDepth?: number;
    sort?: string;
    limit?: number;
    offset?: number;
  },
): Promise<ApiResponse<{ skills: SkillRow[]; total: number; limit: number; offset: number }>> {
  const qs = new URLSearchParams();
  if (params !== undefined) {
    if (params.domain !== undefined) qs.set("domain", params.domain);
    if (params.status !== undefined) qs.set("status", params.status);
    if (params.trustLevel !== undefined) qs.set("trustLevel", params.trustLevel);
    if (params.minDepth !== undefined) qs.set("minDepth", String(params.minDepth));
    if (params.sort !== undefined) qs.set("sort", params.sort);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
  }
  const query = qs.toString();
  const res = await fetch(
    `${API_BASE}/skills${query ? `?${query}` : ""}`,
    { headers: headers(organizationId) },
  );
  return res.json() as Promise<
    ApiResponse<{ skills: SkillRow[]; total: number; limit: number; offset: number }>
  >;
}

export interface SkillStats {
  totalSkills: number;
  totalPolicies: number;
  byTrustLevel: Record<string, number>;
  byDomain: Record<string, number>;
  byContentDepth: { rich: number; medium: number; thin: number };
  topTags: Array<{ tag: string; count: number }>;
}

export async function fetchSkillStats(
  organizationId: string,
): Promise<ApiResponse<SkillStats>> {
  const res = await fetch(`${API_BASE}/skills/stats`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<SkillStats>>;
}

export async function fetchSkill(
  organizationId: string,
  id: string,
): Promise<ApiResponse<SkillDetail>> {
  const res = await fetch(`${API_BASE}/skills/${id}`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<SkillDetail>>;
}

export async function downloadSkill(
  organizationId: string,
  id: string,
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/skills/${id}/download`, {
    headers: headers(organizationId),
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
  organizationId: string,
  id: string,
): Promise<McpAdapter> {
  const res = await fetch(`${API_BASE}/skills/${id}/mcp`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<McpAdapter>;
}

export async function fetchSkillOpenApi(
  organizationId: string,
  id: string,
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/skills/${id}/openapi`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<unknown>;
}
