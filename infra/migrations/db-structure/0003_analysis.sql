-- Migration: 0003_analysis.sql
-- Description: 퇴직연금 프로세스 정밀분석 — 3-Layer 분석 출력물 테이블 추가
-- Service: svc-extraction (db-structure)
-- Date: 2026-03-03

-- ── 분석 리포트 (Layer 1+2: Extraction Summary + Core Identification) ──
CREATE TABLE IF NOT EXISTS analyses (
  analysis_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  extraction_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  -- Layer 1 수치 요약
  process_count INTEGER NOT NULL DEFAULT 0,
  entity_count INTEGER NOT NULL DEFAULT 0,
  rule_count INTEGER NOT NULL DEFAULT 0,
  relationship_count INTEGER NOT NULL DEFAULT 0,
  -- Layer 2 핵심 식별 요약
  core_process_count INTEGER NOT NULL DEFAULT 0,
  mega_process_count INTEGER NOT NULL DEFAULT 0,
  -- JSON: 전체 분석 결과
  summary_json TEXT NOT NULL,
  core_identification_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 진단 소견 (Layer 3: Diagnosis Findings) ──
CREATE TABLE IF NOT EXISTS diagnosis_findings (
  finding_id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  type TEXT NOT NULL,              -- missing | duplicate | overspec | inconsistency
  severity TEXT NOT NULL,          -- critical | warning | info
  finding TEXT NOT NULL,           -- 소견
  evidence TEXT NOT NULL,          -- 근거
  recommendation TEXT NOT NULL,    -- 제안
  related_processes TEXT,          -- JSON array
  related_entities TEXT,           -- JSON array
  source_document_ids TEXT,        -- JSON array
  confidence REAL NOT NULL DEFAULT 0.0,
  hitl_status TEXT NOT NULL DEFAULT 'pending',
  reviewer_id TEXT,
  reviewer_comment TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 조직 간 비교 ──
CREATE TABLE IF NOT EXISTS comparisons (
  comparison_id TEXT PRIMARY KEY,
  organization_ids TEXT NOT NULL,   -- JSON array
  domain TEXT NOT NULL DEFAULT '퇴직연금',
  -- 그룹별 카운트
  common_standard_count INTEGER NOT NULL DEFAULT 0,
  org_specific_count INTEGER NOT NULL DEFAULT 0,
  tacit_knowledge_count INTEGER NOT NULL DEFAULT 0,
  core_differentiator_count INTEGER NOT NULL DEFAULT 0,
  -- JSON: 전체 비교 결과
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 비교 항목 (조직 간 매칭 단위) ──
CREATE TABLE IF NOT EXISTS comparison_items (
  item_id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,               -- process | policy | entity | rule
  service_group TEXT NOT NULL,      -- common_standard | org_specific | tacit_knowledge | core_differentiator
  present_in_orgs TEXT NOT NULL,    -- JSON array of org objects {organizationId, organizationName, documentIds[], variant?}
  classification_reason TEXT NOT NULL,
  standardization_score REAL,
  standardization_note TEXT,
  tacit_knowledge_evidence TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 인덱스 ──
CREATE INDEX IF NOT EXISTS idx_findings_analysis ON diagnosis_findings(analysis_id);
CREATE INDEX IF NOT EXISTS idx_findings_org ON diagnosis_findings(organization_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON diagnosis_findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_hitl ON diagnosis_findings(hitl_status);
CREATE INDEX IF NOT EXISTS idx_comparisons_orgs ON comparisons(organization_ids);
CREATE INDEX IF NOT EXISTS idx_comparison_items_group ON comparison_items(service_group);
