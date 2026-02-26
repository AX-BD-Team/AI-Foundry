-- db-analytics: KPI aggregation and business metrics
CREATE TABLE IF NOT EXISTS pipeline_metrics (
  metric_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  documents_uploaded INTEGER DEFAULT 0,
  extractions_completed INTEGER DEFAULT 0,
  policies_generated INTEGER DEFAULT 0,
  policies_approved INTEGER DEFAULT 0,
  skills_packaged INTEGER DEFAULT 0,
  avg_pipeline_duration_ms INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(organization_id, date)
);

CREATE TABLE IF NOT EXISTS cost_metrics (
  metric_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  tier TEXT NOT NULL,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  cached_requests INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(date, tier)
);

CREATE TABLE IF NOT EXISTS skill_usage_metrics (
  metric_id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  date TEXT NOT NULL,
  download_count INTEGER DEFAULT 0,
  adapter_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(skill_id, date, adapter_type)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_org ON pipeline_metrics(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_cost_date ON cost_metrics(date, tier);
CREATE INDEX IF NOT EXISTS idx_skill_usage ON skill_usage_metrics(skill_id, date);
