-- Gap Analysis snapshot cache
CREATE TABLE IF NOT EXISTS gap_analysis_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  perspective_type TEXT NOT NULL,  -- 'process' | 'architecture' | 'api' | 'table'
  snapshot_json TEXT NOT NULL,     -- PerspectiveSummary JSON
  source_stats_json TEXT,         -- SourceStats JSON (overview level)
  findings_json TEXT,             -- FindingSummary JSON (overview level)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL        -- TTL for cache invalidation
);

CREATE INDEX IF NOT EXISTS idx_gap_snapshots_org
  ON gap_analysis_snapshots(organization_id, perspective_type);
