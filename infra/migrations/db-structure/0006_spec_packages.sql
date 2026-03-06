-- Migration: 0006_spec_packages.sql
-- Description: Spec Package Export — 패키지 메타데이터 + 핵심/비핵심 분류
-- Service: svc-extraction (db-structure)
-- Date: 2026-03-07

CREATE TABLE IF NOT EXISTS spec_packages (
  package_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  result_id TEXT,                     -- fact_check_results.result_id (nullable)
  r2_prefix TEXT NOT NULL,            -- "spec-packages/{orgId}/{packageId}"
  manifest_json TEXT NOT NULL,        -- Full SpecPackageManifest JSON
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | failed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS spec_classifications (
  classification_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  spec_type TEXT NOT NULL,            -- 'api' | 'table'
  item_name TEXT NOT NULL,            -- API path or table name
  is_external_api INTEGER DEFAULT 0,
  is_core_entity INTEGER DEFAULT 0,
  is_transaction_core INTEGER DEFAULT 0,
  relevance_score INTEGER DEFAULT 0,  -- 0-3
  relevance TEXT NOT NULL DEFAULT 'unknown',  -- core | non-core | unknown
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spec_pkg_org ON spec_packages(organization_id);
CREATE INDEX IF NOT EXISTS idx_spec_pkg_result ON spec_packages(result_id);
CREATE INDEX IF NOT EXISTS idx_spec_cls_org ON spec_classifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_spec_cls_relevance ON spec_classifications(relevance);
