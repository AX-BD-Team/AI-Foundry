-- db-skill: Skill package registry
CREATE TABLE IF NOT EXISTS skills (
  skill_id TEXT PRIMARY KEY,
  ontology_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  subdomain TEXT,
  language TEXT NOT NULL DEFAULT 'ko',
  version TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  policy_count INTEGER NOT NULL DEFAULT 0,
  trust_level TEXT NOT NULL DEFAULT 'unreviewed',
  trust_score REAL DEFAULT 0.0,
  tags TEXT DEFAULT '[]',  -- JSON array
  author TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | published | archived
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_downloads (
  download_id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  downloaded_by TEXT NOT NULL,
  adapter_type TEXT NOT NULL,  -- core | mcp | openapi
  downloaded_at TEXT NOT NULL,
  FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
);

CREATE INDEX IF NOT EXISTS idx_skills_domain ON skills(domain);
CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
CREATE INDEX IF NOT EXISTS idx_downloads_skill ON skill_downloads(skill_id);
