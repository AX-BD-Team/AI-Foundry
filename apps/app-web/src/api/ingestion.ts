import type { ApiResponse } from "@ai-foundry/types";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

const HEADERS: Record<string, string> = {
  "X-Internal-Secret":
    (import.meta.env["VITE_INTERNAL_SECRET"] as string | undefined) ??
    "dev-secret",
  "X-User-Id": "analyst-001",
  "X-User-Role": "Analyst",
  "X-Organization-Id": "org-001",
};

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

export async function fetchDocuments(): Promise<
  ApiResponse<{ documents: DocumentRow[] }>
> {
  const res = await fetch(`${API_BASE}/documents`, { headers: HEADERS });
  return res.json() as Promise<ApiResponse<{ documents: DocumentRow[] }>>;
}

export async function fetchDocument(
  id: string,
): Promise<ApiResponse<DocumentRow>> {
  const res = await fetch(`${API_BASE}/documents/${id}`, {
    headers: HEADERS,
  });
  return res.json() as Promise<ApiResponse<DocumentRow>>;
}

export async function fetchDocumentChunks(
  documentId: string,
): Promise<ApiResponse<{ documentId: string; chunks: DocumentChunk[] }>> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/chunks`, {
    headers: HEADERS,
  });
  return res.json() as Promise<
    ApiResponse<{ documentId: string; chunks: DocumentChunk[] }>
  >;
}

export async function uploadDocument(
  file: File,
): Promise<ApiResponse<UploadResult>> {
  const formData = new FormData();
  formData.append("file", file);
  const { "Content-Type": _, ...headersWithoutCT } = {
    "Content-Type": "",
    ...HEADERS,
  };
  const res = await fetch(`${API_BASE}/documents`, {
    method: "POST",
    headers: headersWithoutCT,
    body: formData,
  });
  return res.json() as Promise<ApiResponse<UploadResult>>;
}
