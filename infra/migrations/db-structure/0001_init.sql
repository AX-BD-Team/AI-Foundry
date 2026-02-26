-- db-structure: Structure extraction results
CREATE TABLE IF NOT EXISTS extractions (
  extraction_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
  process_node_count INTEGER DEFAULT 0,
  entity_count INTEGER DEFAULT 0,
  neo4j_graph_id TEXT,
  model_used TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS extraction_chunks (
  chunk_id TEXT PRIMARY KEY,
  extraction_id TEXT NOT NULL,
  content TEXT NOT NULL,
  chunk_type TEXT NOT NULL,  -- process | entity | relationship | screen | api
  sequence INTEGER NOT NULL,
  metadata TEXT,  -- JSON
  created_at TEXT NOT NULL,
  FOREIGN KEY (extraction_id) REFERENCES extractions(extraction_id)
);

CREATE INDEX IF NOT EXISTS idx_extractions_doc ON extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_extractions_status ON extractions(status);
CREATE INDEX IF NOT EXISTS idx_chunks_extraction ON extraction_chunks(extraction_id);
