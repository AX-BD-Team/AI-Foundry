-- db-ingestion: Document ingestion tracking
CREATE TABLE IF NOT EXISTS documents (
  document_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_byte INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
  error_message TEXT,
  uploaded_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at);
