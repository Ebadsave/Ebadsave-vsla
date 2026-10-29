PRAGMA foreign_keys = ON;

-- Store member identity and authentication information.
CREATE TABLE IF NOT EXISTS auth_users (
  user_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  member_number TEXT NOT NULL,
  role TEXT NOT NULL
    CHECK (role IN ('admin', 'executive', 'member')),
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (failed_attempts >= 0),
  locked_until TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (group_id, member_number)
);

CREATE INDEX IF NOT EXISTS idx_auth_users_group
  ON auth_users (group_id);

CREATE INDEX IF NOT EXISTS idx_auth_users_status
  ON auth_users (status);

-- Track revoked access tokens.
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expiry
  ON revoked_tokens (expires_at);

-- Record authentication security events.
CREATE TABLE IF NOT EXISTS auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  group_id TEXT,
  event_type TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_created
  ON auth_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_events_group_created
  ON auth_events (group_id, created_at DESC);
