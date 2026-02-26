-- db-security: RBAC, masking, and audit logs
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,  -- JSON
  ip_address TEXT,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS masking_tokens (
  token_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  original_hash TEXT NOT NULL,  -- hash of original value (not the value itself)
  token TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,  -- PII_NAME | PII_SSN | PII_ACCOUNT | etc.
  created_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_log(occurred_at);
CREATE INDEX IF NOT EXISTS idx_masking_doc ON masking_tokens(document_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
