/**
 * POST /extract — 문서 구조 추출 직접 API 핸들러
 * 청크 배열을 받아 LLM 추출 후 D1에 저장한다.
 */

import { ok, badRequest, errFromUnknown } from "@ai-foundry/utils";
import { buildExtractionPrompt } from "../prompts/structure.js";
import { callLlm } from "../llm/caller.js";
import type { ChunkWithMeta } from "../queue/handler.js";
import type { Env } from "../env.js";

interface ExtractRequestBody {
  documentId: string;
  organizationId: string;
  chunks: string[];
  classification?: string;
  tier?: "sonnet" | "haiku";
}

interface ExtractionResult {
  processes: Array<{ name: string; description: string; steps: string[] }>;
  entities: Array<{ name: string; type: string; attributes: string[] }>;
  relationships: Array<{ from: string; to: string; type: string }>;
  rules: Array<{ condition: string; outcome: string; domain: string }>;
}

export async function handleExtract(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  let body: ExtractRequestBody;
  try {
    body = (await request.json()) as ExtractRequestBody;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const { documentId, organizationId, chunks, classification, tier = "sonnet" } = body;

  if (!documentId || typeof documentId !== "string") {
    return badRequest("documentId is required");
  }
  if (!organizationId || typeof organizationId !== "string") {
    return badRequest("organizationId is required");
  }
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return badRequest("chunks must be a non-empty array");
  }

  const extractionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Insert pending record
  await env.DB_EXTRACTION.prepare(
    `INSERT INTO extractions (id, document_id, organization_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(extractionId, documentId, organizationId, now, now)
    .run();

  try {
    // Convert raw string chunks to ChunkWithMeta for the prompt builder
    const chunksWithMeta: ChunkWithMeta[] = chunks.map((text, i) => ({
      masked_text: text,
      classification: classification ?? "general",
      element_type: "NarrativeText",
      word_count: text.split(/\s+/).length,
      chunk_index: i,
    }));
    const prompt = buildExtractionPrompt(chunksWithMeta, classification);
    const rawContent = await callLlm(prompt, tier, env.LLM_ROUTER, env.INTERNAL_API_SECRET);

    // Strip markdown code fences (```json ... ```) that LLMs often add
    const jsonContent = rawContent
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    let parsed: ExtractionResult;
    try {
      parsed = JSON.parse(jsonContent) as ExtractionResult;
    } catch {
      // LLM returned non-JSON — store raw and treat as partial result
      parsed = { processes: [], entities: [], relationships: [], rules: [] };
    }

    const processNodeCount = (parsed.processes?.length ?? 0) + (parsed.relationships?.length ?? 0);
    const entityCount = parsed.entities?.length ?? 0;
    const updatedAt = new Date().toISOString();

    await env.DB_EXTRACTION.prepare(
      `UPDATE extractions
       SET status = 'completed', result_json = ?, process_node_count = ?,
           entity_count = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(JSON.stringify(parsed), processNodeCount, entityCount, updatedAt, extractionId)
      .run();

    // Emit extraction.completed → triggers svc-policy via queue router
    await env.QUEUE_PIPELINE.send({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: "extraction.completed",
      payload: {
        documentId,
        extractionId,
        organizationId,
        processNodeCount,
        entityCount,
      },
    });

    return ok({ extractionId, status: "completed", processNodeCount, entityCount });
  } catch (e) {
    const updatedAt = new Date().toISOString();
    ctx.waitUntil(
      env.DB_EXTRACTION.prepare(
        `UPDATE extractions SET status = 'failed', updated_at = ? WHERE id = ?`,
      )
        .bind(updatedAt, extractionId)
        .run(),
    );
    return errFromUnknown(e);
  }
}
