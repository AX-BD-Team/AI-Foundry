-- Migration: 0004_llm_tracking.sql
-- Description: analyses 테이블에 LLM 프로바이더/모델 추적 컬럼 추가
-- Service: svc-extraction (db-structure)
-- Date: 2026-03-03

ALTER TABLE analyses ADD COLUMN llm_provider TEXT DEFAULT NULL;
ALTER TABLE analyses ADD COLUMN llm_model TEXT DEFAULT NULL;
