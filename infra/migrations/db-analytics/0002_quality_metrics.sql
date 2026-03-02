-- quality_metrics: daily quality aggregation (same pattern as pipeline_metrics)
CREATE TABLE IF NOT EXISTS quality_metrics (
  metric_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  date TEXT NOT NULL,
  -- Stage 1 (Ingestion)
  ingestion_count INTEGER DEFAULT 0,
  total_chunks INTEGER DEFAULT 0,
  total_valid_chunks INTEGER DEFAULT 0,
  total_parse_duration_ms INTEGER DEFAULT 0,
  -- Stage 2 (Extraction)
  extraction_count INTEGER DEFAULT 0,
  total_rule_count INTEGER DEFAULT 0,
  total_extract_duration_ms INTEGER DEFAULT 0,
  -- Stage 3 (Policy)
  policy_candidate_count INTEGER DEFAULT 0,
  policy_approved_count INTEGER DEFAULT 0,
  policy_modified_count INTEGER DEFAULT 0,
  total_trust_score REAL DEFAULT 0.0,
  -- Stage 5 (Skill)
  skill_count INTEGER DEFAULT 0,
  total_skill_trust_score REAL DEFAULT 0.0,
  total_skill_term_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(organization_id, date)
);

-- stage_latency: per-document stage timing
CREATE TABLE IF NOT EXISTS stage_latency (
  latency_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  duration_ms INTEGER,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quality_org_date ON quality_metrics(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_latency_doc ON stage_latency(document_id, stage);
CREATE INDEX IF NOT EXISTS idx_latency_date ON stage_latency(date, stage);
