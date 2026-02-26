-- db-policy: Policy inference and HITL workflow
CREATE TABLE IF NOT EXISTS policies (
  policy_id TEXT PRIMARY KEY,
  extraction_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  policy_code TEXT UNIQUE NOT NULL,  -- POL-{DOMAIN}-{TYPE}-{SEQ}
  title TEXT NOT NULL,
  condition TEXT NOT NULL,
  criteria TEXT NOT NULL,
  outcome TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  source_page_ref TEXT,
  source_excerpt TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',  -- candidate | in_review | approved | rejected
  trust_level TEXT NOT NULL DEFAULT 'unreviewed',
  trust_score REAL DEFAULT 0.0,
  tags TEXT DEFAULT '[]',  -- JSON array
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hitl_sessions (
  session_id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  reviewer_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',  -- open | in_progress | completed
  do_id TEXT,  -- Durable Object ID
  opened_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (policy_id) REFERENCES policies(policy_id)
);

CREATE TABLE IF NOT EXISTS hitl_actions (
  action_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  action TEXT NOT NULL,  -- approve | reject | modify
  comment TEXT,
  modified_fields TEXT,  -- JSON
  acted_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES hitl_sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_policies_extraction ON policies(extraction_id);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_hitl_policy ON hitl_sessions(policy_id);
CREATE INDEX IF NOT EXISTS idx_hitl_status ON hitl_sessions(status);
