/**
 * Queue event handler — processes ingestion.completed events dispatched by svc-queue-router.
 *
 * `processQueueEvent` is the HTTP-callable entrypoint (POST /internal/queue-event).
 * `handleQueueBatch` is retained for backwards compatibility but delegates to the same logic.
 */

import { createLogger } from "@ai-foundry/utils";
import { PipelineEventSchema } from "@ai-foundry/types";
import type { IngestionCompletedEvent } from "@ai-foundry/types";
import { buildExtractionPrompt } from "../prompts/structure.js";
import { callLlm } from "../llm/caller.js";
import type { Env } from "../env.js";

const logger = createLogger("svc-extraction:queue");

interface ExtractionResult {
  processes: Array<{ name: string; description: string; steps: string[] }>;
  entities: Array<{ name: string; type: string; attributes: string[] }>;
  relationships: Array<{ from: string; to: string; type: string }>;
  rules: Array<{ condition: string; outcome: string; domain: string }>;
}

/** Chunk with metadata from svc-ingestion. */
export interface ChunkWithMeta {
  masked_text: string;
  classification: string;
  element_type: string;
  word_count: number;
  chunk_index: number;
}

/**
 * Fetch parsed chunks (with metadata) from svc-ingestion via service binding.
 */
async function fetchChunks(
  documentId: string,
  env: Env,
): Promise<ChunkWithMeta[]> {
  const resp = await env.SVC_INGESTION.fetch(
    `http://internal/documents/${documentId}/chunks`,
    {
      headers: {
        "X-Internal-Secret": env.INTERNAL_API_SECRET,
      },
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch chunks: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    success: boolean;
    data: { documentId: string; chunks: ChunkWithMeta[] };
  };

  return data.data.chunks;
}

function selectTier(chunks: ChunkWithMeta[]): "sonnet" | "haiku" {
  const totalLen = chunks.reduce((sum, c) => sum + c.masked_text.length, 0);
  return totalLen > 10_000 ? "sonnet" : "haiku";
}

/**
 * Core extraction logic for a single ingestion.completed event.
 * Returns { extractionId, processNodeCount, entityCount } on success.
 */
async function runExtraction(
  event: IngestionCompletedEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<{ extractionId: string; processNodeCount: number; entityCount: number }> {
  const { documentId, organizationId } = event.payload;
  const extractionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const extractStart = Date.now();

  // Insert pending extraction record
  await env.DB_EXTRACTION.prepare(
    `INSERT INTO extractions (id, document_id, organization_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
  )
    .bind(extractionId, documentId, organizationId, now, now)
    .run();

  try {
    // Fetch real parsed chunks from svc-ingestion
    const chunks = await fetchChunks(documentId, env);

    if (chunks.length === 0) {
      throw new Error(`No chunks found for document ${documentId}`);
    }

    // Detect dominant classification from chunks
    const classificationCounts = new Map<string, number>();
    for (const c of chunks) {
      const cls = c.classification || "general";
      classificationCounts.set(cls, (classificationCounts.get(cls) ?? 0) + 1);
    }
    let dominantClassification = "general";
    let maxCount = 0;
    for (const [cls, count] of classificationCounts) {
      if (count > maxCount) {
        dominantClassification = cls;
        maxCount = count;
      }
    }

    const prompt = buildExtractionPrompt(chunks, dominantClassification);
    const tier = selectTier(chunks);
    const totalChunkLen = chunks.reduce((sum, c) => sum + c.masked_text.length, 0);
    logger.info("Selected LLM tier", { tier, totalChunkLen, chunkCount: chunks.length, classification: dominantClassification });
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
      logger.warn("LLM response JSON parse failed, falling back to empty result", {
        documentId,
        rawContentLength: jsonContent.length,
        rawContentPreview: jsonContent.slice(0, 300),
      });
      parsed = { processes: [], entities: [], relationships: [], rules: [] };
    }

    const processNodeCount =
      (parsed.processes?.length ?? 0) + (parsed.relationships?.length ?? 0);
    const entityCount = parsed.entities?.length ?? 0;
    const ruleCount = parsed.rules?.length ?? 0;
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
    // Must be awaited — ctx.waitUntil() can silently drop if Worker terminates early
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
        processDurationMs: Date.now() - extractStart,
        ruleCount,
      },
    });

    logger.info("Emitted extraction.completed event", { extractionId, documentId, organizationId });

    return { extractionId, processNodeCount, entityCount };
  } catch (e) {
    // Mark extraction as failed so it doesn't stay permanently pending
    const failedAt = new Date().toISOString();
    ctx.waitUntil(
      env.DB_EXTRACTION.prepare(
        `UPDATE extractions SET status = 'failed', updated_at = ? WHERE id = ?`,
      )
        .bind(failedAt, extractionId)
        .run(),
    );
    throw e;
  }
}

/**
 * HTTP-callable handler for a single queue event (POST /internal/queue-event).
 * Called by svc-queue-router via service binding.
 */
export async function processQueueEvent(
  body: unknown,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const parseResult = PipelineEventSchema.safeParse(body);
  if (!parseResult.success) {
    logger.warn("Invalid pipeline event", { error: parseResult.error.message });
    return Response.json({ skipped: true }, { status: 200 });
  }

  if (parseResult.data.type !== "ingestion.completed") {
    // Not our event type — acknowledge silently
    return Response.json({ skipped: true, reason: "not_our_event" }, { status: 200 });
  }

  const event = parseResult.data;
  const { documentId } = event.payload;

  try {
    const result = await runExtraction(event, env, ctx);
    logger.info("Extraction completed", result);
    return Response.json({ success: true, ...result }, { status: 200 });
  } catch (e) {
    logger.error("Extraction failed", { documentId, error: String(e) });
    return Response.json(
      { success: false, error: String(e) },
      { status: 500 },
    );
  }
}

/**
 * Legacy batch queue consumer — retained for backwards compatibility.
 * New deployments use svc-queue-router → POST /internal/queue-event instead.
 */
export async function handleQueueBatch(
  batch: MessageBatch<unknown>,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  for (const message of batch.messages) {
    const parseResult = PipelineEventSchema.safeParse(message.body);
    if (!parseResult.success) {
      logger.warn("Skipping invalid pipeline event message", {
        id: message.id,
        error: parseResult.error.message,
      });
      message.ack();
      continue;
    }

    if (parseResult.data.type !== "ingestion.completed") {
      message.ack();
      continue;
    }

    const event = parseResult.data;
    const { documentId } = event.payload;

    try {
      const result = await runExtraction(event, env, ctx);
      logger.info("Extraction completed", result);
      message.ack();
    } catch (e) {
      logger.error("Extraction failed", { documentId, error: String(e) });
      message.retry();
    }
  }
}
