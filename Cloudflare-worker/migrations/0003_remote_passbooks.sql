PRAGMA foreign_keys = ON;

-- Readable, structured passbook summaries.
-- Only the authenticated Worker should access these records.
CREATE TABLE IF NOT EXISTS passbook_accounts (
  group_id TEXT NOT NULL,
  member_number TEXT NOT NULL,
  member_name TEXT NOT NULL,
  total_savings_ugx INTEGER NOT NULL DEFAULT 0
    CHECK (total_savings_ugx >= 0),
  loan_balance_ugx INTEGER NOT NULL DEFAULT 0
    CHECK (loan_balance_ugx >= 0),
  loan_due_date TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, member_number)
);

CREATE INDEX IF NOT EXISTS idx_passbook_accounts_member
  ON passbook_accounts (member_number);

CREATE TABLE IF NOT EXISTS passbook_transactions (
  transaction_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  member_number TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  amount_ugx INTEGER NOT NULL
    CHECK (amount_ugx >= 0),
  description TEXT NOT NULL DEFAULT '',
  transaction_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, member_number, transaction_id),
  FOREIGN KEY (group_id, member_number)
    REFERENCES passbook_accounts (group_id, member_number)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passbook_transactions_member_date
  ON passbook_transactions (
    group_id,
    member_number,
    transaction_date DESC
  );
