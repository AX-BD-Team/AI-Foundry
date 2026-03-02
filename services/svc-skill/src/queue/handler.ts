/**
 * Queue event handler — processes ontology.normalized events
 * dispatched by svc-queue-router via POST /internal/queue-event.
 *
 * Flow:
 *  1. Receive ontology.normalized event
 *  2. Fetch approved policy from svc-policy via service binding
 *  3. Fetch ontology terms from svc-ontology via service binding
 *  4. Build .skill.json package via buildSkillPackage()
 *  5. Store in R2 + D1 catalog
 *  6. Emit skill.packaged event
 */

import { PipelineEventSchema } from "@ai-foundry/types";
import type { Policy, SkillPackagedEvent } from "@ai-foundry/types";
import { createLogger } from "@ai-foundry/utils";
import { buildSkillPackage } from "../assembler/skill-builder.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-skill:queue");

interface PolicyApiResponse {
  success: boolean;
  data: {
    policyId: string;
    extractionId: string;
    organizationId: string;
    policyCode: string;
    title: string;
    condition: string;
    criteria: string;
    outcome: string;
    sourceDocumentId: string;
    sourcePageRef: string | null;
    sourceExcerpt: string | null;
    status: string;
    trustLevel: string;
    trustScore: number;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  };
}

interface TermApiResponse {
  success: boolean;
  data: {
    terms: Array<{
      termId: string;
      ontologyId: string;
      label: string;
      definition: string | null;
      skosUri: string;
      broaderTermId: string | null;
      embeddingModel: string | null;
      createdAt: string;
    }>;
  };
}

/**
 * Convert svc-policy API response to @ai-foundry/types Policy format.
 */
function toPolicy(p: PolicyApiResponse["data"]): Policy {
  return {
    code: p.policyCode,
    title: p.title,
    condition: p.condition,
    criteria: p.criteria,
    outcome: p.outcome,
    source: {
      documentId: p.sourceDocumentId,
      ...(p.sourcePageRef !== null ? { pageRef: p.sourcePageRef } : {}),
      ...(p.sourceExcerpt !== null ? { excerpt: p.sourceExcerpt } : {}),
    },
    trust: {
      level: p.trustLevel as "unreviewed" | "reviewed" | "validated",
      score: p.trustScore,
    },
    tags: p.tags,
  };
}

/**
 * Process a single pipeline event delivered by svc-queue-router.
 * Expects the body to be a valid PipelineEvent (ontology.normalized).
 */
export async function processQueueEvent(
  body: unknown,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const parsed = PipelineEventSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("Invalid pipeline event", {
      error: parsed.error.message,
    });
    return new Response(
      JSON.stringify({ error: "Invalid pipeline event", details: parsed.error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const event = parsed.data;
  if (event.type !== "ontology.normalized") {
    logger.info("Ignoring non-ontology.normalized event", { type: event.type });
    return new Response(
      JSON.stringify({ status: "ignored", reason: `Event type '${event.type}' not handled by svc-skill` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const { policyId, ontologyId, termCount } = event.payload;
  logger.info("Processing ontology.normalized event", { policyId, ontologyId, termCount });

  // 1. Fetch approved policy from svc-policy
  let policyData: PolicyApiResponse["data"];
  try {
    const resp = await env.SVC_POLICY.fetch(
      `http://internal/policies/${policyId}`,
      {
        method: "GET",
        headers: {
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
        },
      },
    );

    if (!resp.ok) {
      logger.error("Failed to fetch policy", { policyId, status: resp.status });
      return new Response(
        JSON.stringify({ status: "error", reason: `Policy fetch failed: ${resp.status}` }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const data = (await resp.json()) as PolicyApiResponse;
    policyData = data.data;
  } catch (e) {
    logger.error("Policy fetch error", { policyId, error: String(e) });
    return new Response(
      JSON.stringify({ status: "error", reason: `Policy fetch error: ${String(e)}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 2. Fetch ontology terms from svc-ontology
  let termUris: string[] = [];
  let skosConceptScheme: string | undefined;
  try {
    const resp = await env.SVC_ONTOLOGY.fetch(
      `http://internal/terms?ontologyId=${ontologyId}`,
      {
        method: "GET",
        headers: {
          "X-Internal-Secret": env.INTERNAL_API_SECRET,
        },
      },
    );

    if (resp.ok) {
      const data = (await resp.json()) as TermApiResponse;
      termUris = data.data.terms.map((t) => t.skosUri);
    } else {
      logger.warn("Failed to fetch terms (non-fatal)", { ontologyId, status: resp.status });
    }
  } catch (e) {
    logger.warn("Term fetch error (non-fatal)", { ontologyId, error: String(e) });
  }

  // Determine SKOS concept scheme from ontology event
  const skosGraphId = event.payload.skosGraphId;
  if (skosGraphId) {
    skosConceptScheme = `urn:aif:scheme:${skosGraphId}`;
  }

  // 3. Convert policy to Policy type
  const policy = toPolicy(policyData);

  // Determine domain from policy code (e.g. "POL-PENSION-WD-HOUSING-001" -> "PENSION")
  const domainMatch = /^POL-([A-Z]+)-/.exec(policyData.policyCode);
  const domain = domainMatch?.[1]?.toLowerCase() ?? "general";

  // 4. Build .skill.json
  let skillPackage;
  try {
    skillPackage = buildSkillPackage({
      policies: [policy],
      ontologyRef: {
        graphId: ontologyId,
        termUris,
        ...(skosConceptScheme !== undefined ? { skosConceptScheme } : {}),
      },
      provenance: {
        sourceDocumentIds: [policyData.sourceDocumentId],
        organizationId: policyData.organizationId,
        extractedAt: policyData.createdAt,
        pipeline: {
          stages: ["ingestion", "extraction", "policy", "ontology", "skill"],
          models: {
            extraction: "claude-sonnet",
            policy: "claude-opus",
            ontology: "workers-ai",
          },
        },
      },
      domain,
      version: "1.0.0",
      author: "ai-foundry-pipeline",
      tags: policyData.tags,
    });
  } catch (e) {
    logger.error("Failed to build skill package", { policyId, error: String(e) });
    return new Response(
      JSON.stringify({ status: "error", reason: `Skill assembly failed: ${String(e)}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const { skillId, trust, metadata } = skillPackage;
  const r2Key = `skill-packages/${skillId}.skill.json`;
  const now = new Date().toISOString();

  // 5. Store .skill.json in R2
  try {
    await env.R2_SKILL_PACKAGES.put(r2Key, JSON.stringify(skillPackage, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (e) {
    logger.error("Failed to store skill package in R2", { skillId, error: String(e) });
    return new Response(
      JSON.stringify({ status: "error", reason: `R2 put failed: ${String(e)}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 6. Insert catalog record into D1
  try {
    await env.DB_SKILL.prepare(
      `INSERT INTO skills (
        skill_id, ontology_id, domain, subdomain, language, version,
        r2_key, policy_count, trust_level, trust_score, tags, author,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    )
      .bind(
        skillId,
        ontologyId,
        metadata.domain,
        null,
        metadata.language,
        metadata.version,
        r2Key,
        1,
        trust.level,
        trust.score,
        JSON.stringify(metadata.tags),
        metadata.author,
        now,
        now,
      )
      .run();
  } catch (e) {
    logger.error("Failed to insert skill catalog record", { skillId, error: String(e) });
    return new Response(
      JSON.stringify({ status: "error", reason: `D1 insert failed: ${String(e)}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 7. Emit skill.packaged event
  const outEvent: SkillPackagedEvent = {
    eventId: crypto.randomUUID(),
    occurredAt: now,
    type: "skill.packaged",
    payload: {
      skillId,
      ontologyId,
      r2Key,
      policyCount: 1,
      trustScore: trust.score,
      termCount: termUris.length,
    },
  };
  await env.QUEUE_PIPELINE.send(outEvent);

  logger.info("Queue-triggered skill packaging completed", {
    policyId,
    ontologyId,
    skillId,
    r2Key,
  });

  return new Response(
    JSON.stringify({
      status: "processed",
      eventId: event.eventId,
      type: event.type,
      skillId,
      policyId,
      ontologyId,
      r2Key,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
