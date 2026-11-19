CREATE TABLE IF NOT EXISTS production_group_registry (
  group_number INTEGER PRIMARY KEY CHECK (group_number BETWEEN 2010 AND 9090),
  group_id TEXT NOT NULL UNIQUE,
  group_name TEXT NOT NULL,
  district TEXT NOT NULL,
  country TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dormant')),
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_production_group_registry_status
ON production_group_registry(status, last_activity_at);
