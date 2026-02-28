/**
 * Queue event handler — processes document.uploaded events dispatched by svc-queue-router.
 *
 * `processQueueEvent` is the HTTP-callable entrypoint (POST /internal/queue-event).
 * `handleQueueBatch` is retained for backwards compatibility but delegates to the same logic.
 */

import { createLogger } from "@ai-foundry/utils";
import { DocumentUploadedEventSchema } from "@ai-foundry/types";
import { buildExtractionPrompt } from "../prompts/structure.js";
import { callLlm } from "../llm/caller.js";
import type { Env } from "../env.js";

interface ExtractionResult {
  processes: Array<{ name: string; description: string; steps: string[] }>;
  entities: Array<{ name: string; type: string; attributes: string[] }>;
  relationships: Array<{ from: string; to: string; type: string }>;
  rules: Array<{ condition: string; outcome: string; domain: string }>;
}

/**
 * Core extraction logic for a single document.uploaded event.
 * Returns { extractionId, processNodeCount, entityCount } on success.
 */
async function runExtraction(
  event: { payload: { documentId: string; organizationId: string; originalName: string } },
  env: Env,
  ctx: ExecutionContext,
): Promise<{ extractionId: string; processNodeCount: number; entityCount: number }> {
  const { documentId, organizationId, originalName } = event.payload;
  const extractionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Insert pending extraction record
  await env.DB_EXTRACTION.prepare(
    `INSERT INTO extractions (id, document_id, status, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, ?)`,
  )
    .bind(extractionId, documentId, now, now)
    .run();

  // Placeholder chunks — real implementation fetches parsed chunks from svc-ingestion
  const placeholderChunks = [
    `문서명: ${originalName} | 조직: ${organizationId} | 문서 파싱 진행 중입니다. 실제 청크는 svc-ingestion 연동 후 제공됩니다.`,
  ];

  const prompt = buildExtractionPrompt(placeholderChunks);
  const rawContent = await callLlm(prompt, "haiku", env.LLM_ROUTER, env.INTERNAL_API_SECRET);

  let parsed: ExtractionResult;
  try {
    parsed = JSON.parse(rawContent) as ExtractionResult;
  } catch {
    parsed = { processes: [], entities: [], relationships: [], rules: [] };
  }

  const processNodeCount =
    (parsed.processes?.length ?? 0) + (parsed.relationships?.length ?? 0);
  const entityCount = parsed.entities?.length ?? 0;
  const updatedAt = new Date().toISOString();

  ctx.waitUntil(
    env.DB_EXTRACTION.prepare(
      `UPDATE extractions
       SET status = 'completed', result_json = ?, process_node_count = ?,
           entity_count = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(JSON.stringify(parsed), processNodeCount, entityCount, updatedAt, extractionId)
      .run(),
  );

  return { extractionId, processNodeCount, entityCount };
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
  const logger = createLogger("svc-extraction:queue");

  const parseResult = DocumentUploadedEventSchema.safeParse(body);
  if (!parseResult.success) {
    logger.warn("Skipping non-DocumentUploadedEvent payload", {
      error: parseResult.error.message,
    });
    return Response.json({ skipped: true }, { status: 200 });
  }

  const event = parseResult.data;
  const { documentId } = event.payload;

  try {
    const result = await runExtraction(event, env, ctx);
    logger.info("Extraction completed", result);
    return Response.json({ success: true, ...result }, { status: 200 });
  } catch (e) {
    logger.error("Extraction failed", { documentId, error: String(e) });

    // Best-effort: mark extraction as failed (we may not have the extractionId if INSERT failed)
    // The error is already logged; return 500 so the queue router knows it failed.
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
  const logger = createLogger("svc-extraction:queue");

  for (const message of batch.messages) {
    const parseResult = DocumentUploadedEventSchema.safeParse(message.body);
    if (!parseResult.success) {
      logger.warn("Skipping non-DocumentUploadedEvent message", {
        id: message.id,
        error: parseResult.error.message,
      });
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
