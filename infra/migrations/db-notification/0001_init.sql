-- db-notification: Notification and alert tracking
CREATE TABLE IF NOT EXISTS notifications (
  notification_id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- hitl_review_needed | policy_approved | skill_ready | etc.
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata TEXT,       -- JSON
  channel TEXT NOT NULL DEFAULT 'internal',  -- internal | slack | email
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | sent | failed | read
  created_at TEXT NOT NULL,
  sent_at TEXT,
  read_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  pref_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  channels TEXT NOT NULL DEFAULT '["internal"]',  -- JSON array
  enabled_types TEXT,  -- JSON array, null = all
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type, status);
