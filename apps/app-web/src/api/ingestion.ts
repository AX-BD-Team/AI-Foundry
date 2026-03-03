import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const USER_ID = "analyst-001";
const USER_ROLE = "Analyst";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId, userId: USER_ID, userRole: USER_ROLE });
}

export interface DocumentRow {
  document_id: string;
  organization_id: string;
  uploaded_by: string;
  r2_key: string;
  file_type: string;
  file_size_byte: number;
  original_name: string;
  status: "pending" | "processing" | "parsed" | "completed" | "failed";
  uploaded_at: string;
}

export interface DocumentChunk {
  chunk_id: string;
  chunk_index: number;
  element_type: string;
  masked_text: string;
  classification: string;
  word_count: number;
}

export interface UploadResult {
  documentId: string;
  r2Key: string;
  status: string;
  uploadedAt: string;
}

export async function fetchDocuments(
  organizationId: string,
): Promise<ApiResponse<{ documents: DocumentRow[] }>> {
  const res = await fetch(`${API_BASE}/documents`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<{ documents: DocumentRow[] }>>;
}

export async function fetchDocument(
  organizationId: string,
  id: string,
): Promise<ApiResponse<DocumentRow>> {
  const res = await fetch(`${API_BASE}/documents/${id}`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<DocumentRow>>;
}

export async function fetchDocumentChunks(
  organizationId: string,
  documentId: string,
): Promise<ApiResponse<{ documentId: string; chunks: DocumentChunk[] }>> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/chunks`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<
    ApiResponse<{ documentId: string; chunks: DocumentChunk[] }>
  >;
}

export async function uploadDocument(
  organizationId: string,
  file: File,
): Promise<ApiResponse<UploadResult>> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/documents`, {
    method: "POST",
    headers: headers(organizationId),
    body: formData,
  });
  return res.json() as Promise<ApiResponse<UploadResult>>;
}
