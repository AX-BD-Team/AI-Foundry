-- db-llm: LLM cost and usage logging
CREATE TABLE IF NOT EXISTS llm_cost_log (
  request_id TEXT PRIMARY KEY,
  caller_service TEXT NOT NULL,
  tier TEXT NOT NULL,  -- opus | sonnet | haiku | workers
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  cached INTEGER NOT NULL DEFAULT 0,  -- 0 | 1
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_registry (
  prompt_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,  -- semver
  stage TEXT NOT NULL,    -- extraction | policy | ontology | skill
  content TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(name, version)
);

CREATE INDEX IF NOT EXISTS idx_cost_log_service ON llm_cost_log(caller_service);
CREATE INDEX IF NOT EXISTS idx_cost_log_tier ON llm_cost_log(tier);
CREATE INDEX IF NOT EXISTS idx_cost_log_created ON llm_cost_log(created_at);
CREATE INDEX IF NOT EXISTS idx_prompt_registry_name ON prompt_registry(name, is_active);
