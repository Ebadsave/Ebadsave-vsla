PRAGMA foreign_keys = ON;

-- Keep applicants separate from active authentication accounts.
CREATE TABLE IF NOT EXISTS member_registration_applications (
  application_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  group_number TEXT NOT NULL,
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 18 AND age <= 120),
  phone TEXT,
  next_of_kin TEXT,
  cell TEXT NOT NULL,
  district TEXT NOT NULL,
  pin_hash TEXT,
  pin_salt TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  member_number TEXT,
  rejection_reason TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_member_registration_group_status
  ON member_registration_applications (group_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_member_registration_group_member
  ON member_registration_applications (group_id, member_number);
