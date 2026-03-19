/**
 * Rules JSON Generator — 기계적 변환 (LLM 불필요)
 * policies → rules/business-rules.json
 */
import type { GeneratedFile } from "@ai-foundry/types";
import type { PolicyRow } from "../collector.js";

interface BusinessRule {
  id: string;
  title: string;
  domain: string;
  type: string;
  condition: string;
  criteria: string;
  outcome: string;
  trust: { level: string; score: number };
  source: { documentId: string; pageRef: string | null };
  tags: string[];
}

function parsePolicyCode(code: string): { domain: string; type: string } {
  // POL-GIFTVOUCHER-CHARGE-001 → domain: GIFTVOUCHER, type: CHARGE
  const parts = code.split("-");
  return {
    domain: parts[1] ?? "UNKNOWN",
    type: parts.slice(2, -1).join("-") || "GENERAL",
  };
}

function parseTags(tagsStr: string): string[] {
  try {
    const parsed: unknown = JSON.parse(tagsStr);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function generateRulesJson(policies: PolicyRow[]): GeneratedFile {
  const rules: BusinessRule[] = policies.map((p) => {
    const { domain, type } = parsePolicyCode(p.policy_code);
    return {
      id: p.policy_code,
      title: p.title,
      domain,
      type,
      condition: p.condition,
      criteria: p.criteria,
      outcome: p.outcome,
      trust: { level: p.trust_level, score: p.trust_score },
      source: { documentId: p.source_document_id, pageRef: p.source_page_ref },
      tags: parseTags(p.tags),
    };
  });

  // 도메인별 그룹핑
  const byDomain: Record<string, BusinessRule[]> = {};
  for (const rule of rules) {
    const key = rule.domain;
    if (!byDomain[key]) {
      byDomain[key] = [];
    }
    byDomain[key]!.push(rule);
  }

  const output = {
    $schema: "https://ai-foundry.ktds.com/schemas/business-rules/v1",
    generatedAt: new Date().toISOString(),
    totalRules: rules.length,
    domains: Object.keys(byDomain),
    rules: byDomain,
  };

  return {
    path: "rules/business-rules.json",
    content: JSON.stringify(output, null, 2),
    type: "rules",
    generatedBy: "mechanical",
    sourceCount: policies.length,
  };
}
