import { createLogger } from "@ai-foundry/utils";
import { PipelineEventSchema } from "@ai-foundry/types";
import type { Env } from "./env.js";
import { parseDocument, type UnstructuredElement } from "./parsing/unstructured.js";
import { parseXlsx, detectSiSubtype } from "./parsing/xlsx.js";
import { parseScreenDesign } from "./parsing/screen-design.js";
import { classifyDocument, classifyXlsxElements, classifySourceElements } from "./parsing/classifier.js";
import { maskText } from "./parsing/masking.js";
import { validateFileFormat, isScdsa002Encrypted, classifyParseError, type ErrorType } from "./parsing/validator.js";
import { extractSourceFiles, parseSourceProject, parseSingleJavaFile, parseSingleSqlFile } from "./parsing/zip-extractor.js";

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
  txt: "text/plain",
  // v0.7.4: Source code MIME types
  zip: "application/zip",
  java: "text/x-java-source",
  sql: "application/sql",
};

const MAX_ELEMENTS = 200;
const MAX_ELEMENTS_XLSX = 500;
const MAX_ELEMENTS_SOURCE = 1000;

/**
 * Process a single queue event delivered via HTTP from the queue router.
 * Parses the body with PipelineEventSchema, processes document.uploaded events,
 * and returns a Response.
 */
export async function processQueueEvent(body: unknown, env: Env, _ctx: ExecutionContext): Promise<Response> {
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
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "not_our_event" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const event = parsed.data;
  const { documentId, organizationId, r2Key, originalName, fileType } = event.payload;

  try {
    const parseStart = Date.now();

    // 1. Fetch file bytes from R2
    const r2Object = await env.R2_DOCUMENTS.get(r2Key);
    if (!r2Object) {
      logger.error("R2 object not found", { documentId, r2Key });
      await env.DB_INGESTION.prepare(
        "UPDATE documents SET status = 'failed', error_message = ? WHERE document_id = ?",
      )
        .bind("R2 object not found: " + r2Key, documentId)
        .run();
      return new Response(JSON.stringify({ ok: false, error: "r2_object_not_found" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fileBytes = await r2Object.arrayBuffer();
    const mimeType = MIME_MAP[fileType] ?? "application/octet-stream";

    // 2. Validate file format via magic bytes
    const validation = validateFileFormat(fileBytes, fileType);
    if (!validation.valid) {
      // Distinguish SCDSA002-encrypted files from generic format errors
      const isScdsa = isScdsa002Encrypted(fileBytes);
      const errType: ErrorType = isScdsa ? "encrypted_scdsa002" : "format_invalid";
      const docStatus = isScdsa ? "encrypted" : "failed";

      if (isScdsa) {
        logger.warn("Samsung SDS encrypted file (SCDSA002) — skipping parse", {
          documentId,
          fileType,
          originalName,
        });
      } else {
        logger.warn("File format invalid", { documentId, fileType, error: validation.error });
      }

      await env.DB_INGESTION.prepare(
        "UPDATE documents SET status = ?, error_message = ?, error_type = ? WHERE document_id = ?",
      )
        .bind(docStatus, validation.error ?? "Unknown format", errType, documentId)
        .run();
      return new Response(
        JSON.stringify({ ok: false, error: errType, detail: validation.error }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (fileBytes.byteLength > 2 * 1024 * 1024) {
      logger.info("Large file detected", { documentId, sizeMB: (fileBytes.byteLength / (1024 * 1024)).toFixed(1) });
    }

    // 3. Parse: source code / xlsx / Unstructured.io
    const isXlsx = fileType === "xlsx" || fileType === "xls";
    const isSourceCode = fileType === "java" || fileType === "sql" || fileType === "zip";
    let elements;
    if (isSourceCode) {
      elements = parseSourceCodeFiles(fileBytes, originalName, fileType);
    } else if (isXlsx) {
      const siSubtype = detectSiSubtype(originalName);
      elements = siSubtype === "화면설계"
        ? parseScreenDesign(fileBytes, originalName)
        : parseXlsx(fileBytes, originalName);
    } else {
      elements = await parseDocument(fileBytes, originalName, mimeType, env);
    }

    // 4. Classify
    const classification = isSourceCode
      ? classifySourceElements(elements)
      : isXlsx
        ? classifyXlsxElements(elements)
        : classifyDocument(elements, fileType);

    // 5. Insert chunks (source: max 1000, xlsx: max 500, others: max 200, skip blank text)
    const maxElements = isSourceCode ? MAX_ELEMENTS_SOURCE : isXlsx ? MAX_ELEMENTS_XLSX : MAX_ELEMENTS;
    let chunkIndex = 0;
    for (const element of elements.slice(0, maxElements)) {
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

    // 6. Update document status -> parsed
    await env.DB_INGESTION.prepare(
      "UPDATE documents SET status = 'parsed' WHERE document_id = ?",
    )
      .bind(documentId)
      .run();

    // 7. Publish ingestion.completed
    await env.QUEUE_PIPELINE.send({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type: "ingestion.completed",
      payload: {
        documentId,
        organizationId,
        chunkCount: chunkIndex,
        classification: classification.category,
        r2Key,
        parseDurationMs: Date.now() - parseStart,
        chunksValid: chunkIndex,
      },
    });

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
    const errorType = classifyParseError(e);
    logger.error("Queue event processing failed", { documentId, error: String(e), errorType });

    await env.DB_INGESTION.prepare(
      "UPDATE documents SET status = 'failed', error_message = ?, error_type = ? WHERE document_id = ?",
    )
      .bind(String(e).slice(0, 500), errorType, documentId)
      .run();

    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function parseSourceCodeFiles(
  fileBytes: ArrayBuffer,
  originalName: string,
  fileType: string,
): UnstructuredElement[] {
  if (fileType === "zip") {
    const files = extractSourceFiles(fileBytes);
    const projectName = originalName.replace(/\.zip$/i, "");
    return parseSourceProject(files, projectName);
  }
  if (fileType === "java") {
    const source = new TextDecoder("utf-8").decode(fileBytes);
    return parseSingleJavaFile(source, originalName);
  }
  if (fileType === "sql") {
    const source = new TextDecoder("utf-8").decode(fileBytes);
    return parseSingleSqlFile(source, originalName);
  }
  return [];
}
