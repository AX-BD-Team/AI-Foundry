import { createLogger } from "@ai-foundry/utils";
import { PipelineEventSchema } from "@ai-foundry/types";
import type { Env } from "./env.js";
import { parseDocument } from "./parsing/unstructured.js";
import { classifyDocument } from "./parsing/classifier.js";
import { maskText } from "./parsing/masking.js";

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const MAX_ELEMENTS = 200;

/**
 * Process a single queue event delivered via HTTP from the queue router.
 * Parses the body with PipelineEventSchema, processes document.uploaded events,
 * and returns a Response.
 */
export async function processQueueEvent(body: unknown, env: Env, ctx: ExecutionContext): Promise<Response> {
  const logger = createLogger("svc-ingestion");

  const parsed = PipelineEventSchema.safeParse(body);

  if (!parsed.success) {
    logger.warn("Invalid pipeline event", { error: parsed.error.message });
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "invalid_event" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (parsed.data.type !== "document.uploaded") {
    // Not our event type — acknowledge silently
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "not_our_event" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = parsed.data;
  const { documentId, organizationId, r2Key, originalName, fileType } = event.payload;

  try {
    // 1. Fetch file bytes from R2
    const r2Object = await env.R2_DOCUMENTS.get(r2Key);
    if (!r2Object) {
      logger.error("R2 object not found", { documentId, r2Key });
      await env.DB_INGESTION.prepare(
        "UPDATE documents SET status = 'failed' WHERE document_id = ?",
      )
        .bind(documentId)
        .run();
      return new Response(JSON.stringify({ ok: false, error: "r2_object_not_found" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fileBytes = await r2Object.arrayBuffer();
    const mimeType = MIME_MAP[fileType] ?? "application/octet-stream";

    // 2. Parse with Unstructured.io
    const elements = await parseDocument(fileBytes, originalName, mimeType, env);

    // 3. Classify
    const classification = classifyDocument(elements, fileType);

    // 4. Insert chunks (max 200, skip blank text)
    let chunkIndex = 0;
    for (const element of elements.slice(0, MAX_ELEMENTS)) {
      const text = element.text.trim();
      if (!text) continue;

      const maskedText = await maskText(
        documentId,
        text,
        env.SECURITY,
        env.INTERNAL_API_SECRET,
      );

      const chunkId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const wordCount = text.split(/\s+/).filter(Boolean).length;

      await env.DB_INGESTION.prepare(
        `INSERT INTO document_chunks
          (chunk_id, document_id, organization_id, chunk_index, element_type, masked_text, classification, word_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          chunkId,
          documentId,
          organizationId,
          chunkIndex,
          element.type,
          maskedText,
          classification.category,
          wordCount,
          createdAt,
        )
        .run();

      chunkIndex++;
    }

    // 5. Update document status → parsed
    await env.DB_INGESTION.prepare(
      "UPDATE documents SET status = 'parsed' WHERE document_id = ?",
    )
      .bind(documentId)
      .run();

    // 6. Publish ingestion.completed → triggers svc-extraction via queue router
    ctx.waitUntil(
      env.QUEUE_PIPELINE.send({
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        type: "ingestion.completed",
        payload: {
          documentId,
          organizationId,
          chunkCount: chunkIndex,
          classification: classification.category,
          r2Key,
        },
      }),
    );

    logger.info("Document parsed", {
      documentId,
      chunkCount: chunkIndex,
      classification: classification.category,
      confidence: classification.confidence,
    });

    return new Response(JSON.stringify({ ok: true, documentId, chunkCount: chunkIndex }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    logger.error("Queue event processing failed", { documentId, error: String(e) });

    await env.DB_INGESTION.prepare(
      "UPDATE documents SET status = 'failed' WHERE document_id = ?",
    )
      .bind(documentId)
      .run();

    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
