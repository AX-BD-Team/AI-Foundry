-- Add error_type column for structured error classification
-- Values: format_invalid | parse_error | timeout | network_error
ALTER TABLE documents ADD COLUMN error_type TEXT;
