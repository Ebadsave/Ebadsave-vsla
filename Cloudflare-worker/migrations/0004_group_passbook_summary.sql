CREATE TABLE IF NOT EXISTS passbook_group_summaries (
  group_id TEXT PRIMARY KEY,
  group_number TEXT NOT NULL,
  group_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'UGX',

  total_savings_ugx INTEGER NOT NULL DEFAULT 0
    CHECK(total_savings_ugx >= 0),

  available_loan_fund_ugx INTEGER NOT NULL DEFAULT 0
    CHECK(available_loan_fund_ugx >= 0),

  outstanding_loans_ugx INTEGER NOT NULL DEFAULT 0
    CHECK(outstanding_loans_ugx >= 0),

  insurance_fund_ugx INTEGER NOT NULL DEFAULT 0
    CHECK(insurance_fund_ugx >= 0),

  fines_fund_ugx INTEGER NOT NULL DEFAULT 0
    CHECK(fines_fund_ugx >= 0),

  registered_members INTEGER NOT NULL DEFAULT 0
    CHECK(registered_members >= 0),

  active_members INTEGER NOT NULL DEFAULT 0
    CHECK(active_members >= 0),

  total_expenditure_ugx INTEGER NOT NULL DEFAULT 0
    CHECK(total_expenditure_ugx >= 0),

  previous_period_expenditure_ugx INTEGER NOT NULL DEFAULT 0
    CHECK(previous_period_expenditure_ugx >= 0),

  reporting_period TEXT NOT NULL,
  previous_reporting_period TEXT NOT NULL,

  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_admin_bootstraps (
  group_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
