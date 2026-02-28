-- Fix extraction schema: align column names with application code
-- BUG-3: code uses `id` but schema has `extraction_id`
-- Also: code uses `updated_at` + `result_json` which don't exist in original schema

ALTER TABLE extractions RENAME COLUMN extraction_id TO id;
ALTER TABLE extractions ADD COLUMN updated_at TEXT;
ALTER TABLE extractions ADD COLUMN result_json TEXT;
