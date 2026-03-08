-- TD-02: Add organization_id to skills table for multi-org isolation
ALTER TABLE skills ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_skills_org ON skills(organization_id);
