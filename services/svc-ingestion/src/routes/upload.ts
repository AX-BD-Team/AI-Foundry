import type { DocumentUploadedEvent } from "@ai-foundry/types";
import { created, badRequest, errFromUnknown, createLogger } from "@ai-foundry/utils";
import type { Env } from "../env.js";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "text/plain",
]);

const MIME_TO_EXT: Record<string, DocumentUploadedEvent["payload"]["fileType"]> = {
  "application/pdf": "pdf",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/msword": "docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/png": "png",
  "image/jpeg": "jpg",
  "text/plain": "txt",
};

export async function handleUpload(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const logger = createLogger("svc-ingestion");

  const organizationId = request.headers.get("X-Organization-Id");
  const userId = request.headers.get("X-User-Id");

  if (!organizationId || !userId) {
    return badRequest("X-Organization-Id and X-User-Id headers are required");
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return badRequest("Content-Type must be multipart/form-data");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest("Failed to parse multipart form data");
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return badRequest("'file' field is required and must be a file");
  }
  const file = fileEntry as File;

  const maxBytes = parseInt(env.MAX_FILE_SIZE_MB, 10) * 1024 * 1024;
  if (file.size > maxBytes) {
    return badRequest(`File size exceeds maximum of ${env.MAX_FILE_SIZE_MB}MB`);
  }

  const mimeType = file.type;
  if (!ALLOWED_TYPES.has(mimeType)) {
    return badRequest(`Unsupported file type: ${mimeType}`);
  }

  const fileType = MIME_TO_EXT[mimeType];
  if (!fileType) {
    return badRequest(`Cannot determine file extension for: ${mimeType}`);
  }

  const documentId = crypto.randomUUID();
  const r2Key = `documents/${organizationId}/${documentId}/${file.name}`;

  try {
    const arrayBuffer = await file.arrayBuffer();

    // Upload to R2
    await env.R2_DOCUMENTS.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: mimeType },
      customMetadata: {
        documentId,
        organizationId,
        uploadedBy: userId,
        originalName: file.name,
      },
    });

    // Persist document record to D1
    const uploadedAt = new Date().toISOString();
    await env.DB_INGESTION.prepare(
      `INSERT INTO documents
        (document_id, organization_id, uploaded_by, r2_key, file_type, file_size_byte, original_name, status, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
      .bind(documentId, organizationId, userId, r2Key, fileType, file.size, file.name, uploadedAt)
      .run();

    // Publish pipeline event
    const event: DocumentUploadedEvent = {
      eventId: crypto.randomUUID(),
      occurredAt: uploadedAt,
      type: "document.uploaded",
      payload: {
        documentId,
        organizationId,
        uploadedBy: userId,
        r2Key,
        fileType,
        fileSizeByte: file.size,
        originalName: file.name,
      },
    };

    await env.QUEUE_PIPELINE.send(event);

    logger.info("Document uploaded", {
      documentId,
      organizationId,
      fileType,
      fileSizeByte: file.size,
    });

    return created({ documentId, r2Key, status: "pending", uploadedAt });
  } catch (e) {
    logger.error("Upload failed", { error: String(e), documentId });
    return errFromUnknown(e);
  }
}

export async function handleGetDocument(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const result = await env.DB_INGESTION
    .prepare("SELECT * FROM documents WHERE document_id = ?")
    .bind(documentId)
    .first();

  if (!result) {
    return new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND", message: `Document '${documentId}' not found` } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, data: result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
