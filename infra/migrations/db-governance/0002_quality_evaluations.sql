-- Domain expert quality evaluations
CREATE TABLE IF NOT EXISTS quality_evaluations (
  evaluation_id TEXT PRIMARY KEY,
  batch_id TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  score REAL NOT NULL,
  evaluator TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qe_target ON quality_evaluations(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_qe_batch ON quality_evaluations(batch_id);
