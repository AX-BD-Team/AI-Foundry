-- db-governance: Prompt registry and governance
CREATE TABLE IF NOT EXISTS prompt_versions (
  prompt_version_id TEXT PRIMARY KEY,
  prompt_name TEXT NOT NULL,
  version TEXT NOT NULL,  -- semver
  stage TEXT NOT NULL,
  content TEXT NOT NULL,
  rollout_pct INTEGER NOT NULL DEFAULT 0,  -- 0-100 (Blue-Green rollout)
  is_active INTEGER NOT NULL DEFAULT 0,
  golden_test_passed INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  UNIQUE(prompt_name, version)
);

CREATE TABLE IF NOT EXISTS trust_evaluations (
  eval_id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,  -- output | skill | system
  target_id TEXT NOT NULL,
  level TEXT NOT NULL,        -- L1 | L2 | L3
  score REAL NOT NULL,
  evaluator TEXT NOT NULL,
  notes TEXT,
  evaluated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompts_name ON prompt_versions(prompt_name, is_active);
CREATE INDEX IF NOT EXISTS idx_trust_target ON trust_evaluations(target_type, target_id);
