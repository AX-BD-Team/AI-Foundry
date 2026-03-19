-- Working Prototype Generator 테이블
-- AIF-REQ-026 Phase 2: 반제품 생성 엔진

CREATE TABLE IF NOT EXISTS prototypes (
  prototype_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK(status IN ('generating', 'completed', 'failed')),
  r2_key TEXT,
  doc_count INTEGER NOT NULL DEFAULT 0,
  policy_count INTEGER NOT NULL DEFAULT 0,
  term_count INTEGER NOT NULL DEFAULT 0,
  skill_count INTEGER NOT NULL DEFAULT 0,
  generation_params TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prototypes_org
  ON prototypes(organization_id);
CREATE INDEX IF NOT EXISTS idx_prototypes_status
  ON prototypes(status);
