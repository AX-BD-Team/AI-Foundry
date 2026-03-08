-- TD-05: Add organization_id to trust_evaluations for multi-org isolation
ALTER TABLE trust_evaluations ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'unknown';
CREATE INDEX IF NOT EXISTS idx_trust_org ON trust_evaluations(organization_id);
