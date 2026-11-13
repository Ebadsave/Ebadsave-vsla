PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS group_admin_bootstrap_claims (
  group_id TEXT PRIMARY KEY,
  group_number TEXT NOT NULL UNIQUE,
  admin_user_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_group_admin_bootstrap_number
ON group_admin_bootstrap_claims (group_number);
