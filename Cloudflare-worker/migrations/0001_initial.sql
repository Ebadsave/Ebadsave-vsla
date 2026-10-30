PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS backups (
  backup_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  uploaded_by TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'deleted', 'quarantined'))
);

CREATE INDEX IF NOT EXISTS idx_backups_group_created
ON backups (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backups_status
ON backups (status);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  backup_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_group_created
ON audit_events (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor_created
ON audit_events (actor_id, created_at DESC);
