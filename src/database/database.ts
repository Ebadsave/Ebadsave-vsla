import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export type GroupRecord = {
  id: number;
  group_number: number;
  group_name: string;
  district: string;
  country: string;
  status: string;
  created_at: string;
  last_activity_at: string;
};

export type MemberRecord = {
  id: number;
  group_id: number;
  member_number: string;
  full_name: string;
  gender: string;
  age: number;
  phone: string | null;
  cell: string;
  district: string;
  photo_uri: string | null;
  status: string;
  created_at: string;
};

export type NextOfKinRecord = {
  id: number;
  member_id: number;
  slot: number;
  name: string | null;
  phone: string | null;
  gender: string | null;
  benefit_received: number;
  locked: number;
  created_at: string;
  updated_at: string;
};

export type GroupRuleRecord = {
  id: number;
  group_id: number;
  article_number: number;
  title: string;
  content: string;
  effective_days: number;
  updated_at: string;
};

/* ============================================================
   VSLA SETUP RULES
   ============================================================ */

export type VSLASetupRuleRecord = {
  id: number;
  group_id: number;
  share_value: number;
  minimum_shares_per_meeting: number;
  maximum_shares_per_meeting: number;
  maximum_loan_multiple: number;
  loan_interest_percentage: number;
  loan_interest_period: string;
  maximum_loan_repayment_period: number;
  social_fund_contribution: number;
  absence_fine: number;
  late_fine: number;
  non_saving_fine: number;
  meeting_frequency: string;
  cycle_duration_months: number;
  leadership_term_months: number;
  share_out_enabled: number;
  created_at: string;
  updated_at: string;
};

export type VSLASetupRuleUpdates = {
  shareValue?: number;
  minimumSharesPerMeeting?: number;
  maximumSharesPerMeeting?: number;
  maximumLoanMultiple?: number;
  loanInterestPercentage?: number;
  loanInterestPeriod?: string;
  maximumLoanRepaymentPeriod?: number;
  socialFundContribution?: number;
  absenceFine?: number;
  lateFine?: number;
  nonSavingFine?: number;
  meetingFrequency?: string;
  cycleDurationMonths?: number;
  leadershipTermMonths?: number;
  shareOutEnabled?: boolean | number;
};

/* ============================================================
   FINANCIAL TYPES
   ============================================================ */

export type FinancialAccountType =
  | 'savings'
  | 'loan_fund'
  | 'loan_repayment'
  | 'social_fund'
  | 'fines'
  | 'external_fund'
  | 'expenditure_fund'
  | 'insurance_fund';

export type FinancialAccountRecord = {
  id: number;
  group_id: number;
  account_type: FinancialAccountType;
  balance: number;
  created_at: string;
  updated_at: string;
};

export type FinancialTransactionRecord = {
  id: number;
  group_id: number;
  account_type: FinancialAccountType;
  amount: number;
  reason: string;
  member_id: number | null;
  meeting_id: number | null;
  transaction_type: string;
  created_at: string;
};

export type FinancialSummary = {
  savings: number;
  loanFund: number;
  loanRepayment: number;
  socialFund: number;
  fines: number;
  externalFund: number;
  expenditureFund: number;
  insuranceFund: number;
  fundBalance: number;
};

/* ============================================================
   DATABASE CONSTANTS
   ============================================================ */

const dbPromise = SQLite.openDatabaseAsync(
  'ebadsave_vsla.db',
);

const GROUP_START = 2010;
const GROUP_END = 9090;

const now = (): string =>
  new Date().toISOString();

const normalizeText = (
  value: string | null | undefined,
): string => {
  return (value ?? '').trim();
};

/* ============================================================
   PASSCODE
   ============================================================ */

const isValidPasscode = (
  code: string,
): boolean => {
  return /^[A-Za-z1-9./$-]{4}$/.test(code);
};

async function hashPasscode(
  passcode: string,
  salt: string,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${passcode}`,
  );
}

/* ============================================================
   GROUP NUMBER HELPERS
   ============================================================ */

function parseGroupNumber(
  value: number | string | null | undefined,
): number {
  if (typeof value === 'number') {
    return value;
  }

  const text = normalizeText(value);

  const match = text.match(
    /KYA\s*(\d{4})/i,
  );

  if (match) {
    return Number(match[1]);
  }

  const numeric = Number(text);

  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return 0;
}

const GROUP_SELECT = `
  SELECT
    id,
    CAST(
      CASE
        WHEN UPPER(CAST(group_number AS TEXT)) LIKE 'KYA%'
        THEN REPLACE(
          UPPER(CAST(group_number AS TEXT)),
          'KYA',
          ''
        )
        ELSE CAST(group_number AS TEXT)
      END
      AS INTEGER
    ) AS group_number,
    group_name,
    district,
    country,
    status,
    created_at,
    last_activity_at
  FROM groups
`;

/* ============================================================
   FINANCIAL HELPERS
   ============================================================ */

const FINANCIAL_ACCOUNT_TYPES: FinancialAccountType[] = [
  'savings',
  'loan_fund',
  'loan_repayment',
  'social_fund',
  'fines',
  'external_fund',
  'expenditure_fund',
  'insurance_fund',
];

function isFinancialAccountType(
  value: string,
): value is FinancialAccountType {
  return FINANCIAL_ACCOUNT_TYPES.includes(
    value as FinancialAccountType,
  );
}

const FUND_BALANCE_ACCOUNTS: FinancialAccountType[] = [
  'savings',
  'loan_fund',
  'loan_repayment',
  'social_fund',
  'fines',
  'external_fund',
  'expenditure_fund',
];

function calculateFundBalance(
  summary: Omit<FinancialSummary, 'fundBalance'>,
): number {
  return (
    summary.savings +
    summary.loanFund +
    summary.loanRepayment +
    summary.socialFund +
    summary.fines +
    summary.externalFund +
    summary.expenditureFund
  );
}

/* ============================================================
   DATABASE MIGRATION HELPER
   ============================================================ */

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const columns =
    await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${table});`,
    );

  const exists = columns.some(
    (item) => item.name === column,
  );

  if (!exists) {
    await db.execAsync(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`,
    );
  }
}

/* ============================================================
   FINANCIAL ACCOUNT CREATION
   ============================================================ */

async function ensureFinancialAccountsForGroup(
  db: SQLite.SQLiteDatabase,
  groupId: number,
): Promise<void> {
  const timestamp = now();

  for (
    const accountType of FINANCIAL_ACCOUNT_TYPES
  ) {
    await db.runAsync(
      `INSERT OR IGNORE INTO financial_accounts (
        group_id,
        account_type,
        balance,
        created_at,
        updated_at
      )
      VALUES (?, ?, 0, ?, ?)`,
      groupId,
      accountType,
      timestamp,
      timestamp,
    );
  }
}

async function ensureFinancialAccountsForAllGroups(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const groups =
    await db.getAllAsync<{ id: number }>(
      `SELECT id FROM groups`,
    );

  for (const group of groups) {
    await ensureFinancialAccountsForGroup(
      db,
      group.id,
    );
  }
}

/* ============================================================
   VSLA DEFAULT RULES
   ============================================================ */

async function createDefaultVSLASetupRules(
  db: SQLite.SQLiteDatabase,
  groupId: number,
): Promise<void> {
  const timestamp = now();

  await db.runAsync(
    `INSERT OR IGNORE INTO vsla_setup_rules (
      group_id,
      share_value,
      minimum_shares_per_meeting,
      maximum_shares_per_meeting,
      maximum_loan_multiple,
      loan_interest_percentage,
      loan_interest_period,
      maximum_loan_repayment_period,
      social_fund_contribution,
      absence_fine,
      late_fine,
      non_saving_fine,
      meeting_frequency,
      cycle_duration_months,
      leadership_term_months,
      share_out_enabled,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      1000,
      1,
      5,
      3,
      5,
      'per month',
      12,
      0,
      0,
      0,
      0,
      'weekly',
      12,
      12,
      1,
      ?,
      ?
    )`,
    groupId,
    timestamp,
    timestamp,
  );
}

/* ============================================================
   GROUP DORMANCY
   ============================================================ */

async function refreshGroupDormancy(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const cutoff = new Date();

  cutoff.setDate(
    cutoff.getDate() - 90,
  );

  await db.runAsync(
    `UPDATE groups
     SET status = 'dormant'
     WHERE status = 'active'
     AND last_activity_at < ?`,
    cutoff.toISOString(),
  );
}

/* ============================================================
   NEXT OF KIN AUTOMATIC APPLICATIONS
   ============================================================ */

async function applyDueNextOfKinChanges(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const pending =
    await db.getAllAsync<{
      id: number;
      member_id: number;
      slot: number;
      action: string;
      new_name: string | null;
      new_phone: string | null;
      new_gender: string | null;
      effective_at: string;
    }>(
      `SELECT
        id,
        member_id,
        slot,
        action,
        new_name,
        new_phone,
        new_gender,
        effective_at
       FROM next_of_kin_change_history
       WHERE applied = 0
       AND effective_at <= ?
       ORDER BY id ASC`,
      now(),
    );

  for (const change of pending) {
    if (change.action === 'delete') {
      await db.runAsync(
        `UPDATE member_next_of_kin
         SET
           name = NULL,
           phone = NULL,
           gender = NULL,
           updated_at = ?
         WHERE member_id = ?
         AND slot = ?`,
        now(),
        change.member_id,
        change.slot,
      );
    } else {
      await db.runAsync(
        `UPDATE member_next_of_kin
         SET
           name = ?,
           phone = ?,
           gender = ?,
           updated_at = ?
         WHERE member_id = ?
         AND slot = ?`,
        change.new_name,
        change.new_phone,
        change.new_gender,
        now(),
        change.member_id,
        change.slot,
      );
    }

    await db.runAsync(
      `UPDATE next_of_kin_change_history
       SET applied = 1
       WHERE id = ?`,
      change.id,
    );
  }
}

async function applyDueNextOfKinBenefits(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const pending =
    await db.getAllAsync<{
      id: number;
      member_id: number;
      slot: number;
    }>(
      `SELECT
        id,
        member_id,
        slot
       FROM next_of_kin_benefits
       WHERE status = 'pending'
       AND effective_at <= ?
       ORDER BY id ASC`,
      now(),
    );

  for (const benefit of pending) {
    await db.runAsync(
      `UPDATE next_of_kin_benefits
       SET status = 'received'
       WHERE id = ?`,
      benefit.id,
    );

    await db.runAsync(
      `UPDATE member_next_of_kin
       SET
         benefit_received = 1,
         locked = 1,
         updated_at = ?
       WHERE member_id = ?
       AND slot = ?`,
      now(),
      benefit.member_id,
      benefit.slot,
    );
  }
}

/* ============================================================
   DATABASE INITIALIZATION
   ============================================================ */

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await dbPromise;

  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_number TEXT NOT NULL,
      group_name TEXT NOT NULL,
      district TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_number TEXT NOT NULL,
      full_name TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT '',
      age INTEGER NOT NULL DEFAULT 0,
      phone TEXT,
      cell TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      photo_uri TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS deleted_member_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_number TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS member_next_of_kin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      name TEXT,
      phone TEXT,
      gender TEXT,
      benefit_received INTEGER NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(member_id, slot),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS next_of_kin_change_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      action TEXT NOT NULL,
      old_name TEXT,
      old_phone TEXT,
      old_gender TEXT,
      new_name TEXT,
      new_phone TEXT,
      new_gender TEXT,
      reason TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      effective_at TEXT NOT NULL,
      applied INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS next_of_kin_benefits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      benefit_amount REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      benefit_date TEXT NOT NULL,
      effective_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS group_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      article_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      effective_days INTEGER NOT NULL DEFAULT 30,
      updated_at TEXT NOT NULL,
      UNIQUE(group_id, article_number),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS vsla_setup_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL UNIQUE,
      share_value REAL NOT NULL DEFAULT 1000,
      minimum_shares_per_meeting INTEGER NOT NULL DEFAULT 1,
      maximum_shares_per_meeting INTEGER NOT NULL DEFAULT 5,
      maximum_loan_multiple REAL NOT NULL DEFAULT 3,
      loan_interest_percentage REAL NOT NULL DEFAULT 5,
      loan_interest_period TEXT NOT NULL DEFAULT 'per month',
      maximum_loan_repayment_period INTEGER NOT NULL DEFAULT 12,
      social_fund_contribution REAL NOT NULL DEFAULT 0,
      absence_fine REAL NOT NULL DEFAULT 0,
      late_fine REAL NOT NULL DEFAULT 0,
      non_saving_fine REAL NOT NULL DEFAULT 0,
      meeting_frequency TEXT NOT NULL DEFAULT 'weekly',
      cycle_duration_months INTEGER NOT NULL DEFAULT 12,
      leadership_term_months INTEGER NOT NULL DEFAULT 12,
      share_out_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS group_meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      meeting_date TEXT NOT NULL,
      opened_at TEXT,
      closed_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS member_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      passcode_hash TEXT,
      phone_eligible INTEGER NOT NULL DEFAULT 0,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS member_auth_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      attempted_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS member_transaction_signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      transaction_id INTEGER,
      signed_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS app_access_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      meeting_id INTEGER,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id)
    );

    CREATE TABLE IF NOT EXISTS app_access_authorizers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      authorizer_role TEXT NOT NULL,
      authorized_at TEXT NOT NULL,
      UNIQUE(session_id, member_id),
      FOREIGN KEY (session_id) REFERENCES app_access_sessions(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_closures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      closed_at TEXT NOT NULL,
      total_savings REAL NOT NULL DEFAULT 0,
      loan_fund REAL NOT NULL DEFAULT 0,
      group_fund REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id)
    );

    CREATE TABLE IF NOT EXISTS financial_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      account_type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(group_id, account_type),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      account_type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      member_id INTEGER,
      meeting_id INTEGER,
      transaction_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id)
    );

    CREATE INDEX IF NOT EXISTS idx_financial_accounts_group
      ON financial_accounts(group_id);

    CREATE INDEX IF NOT EXISTS idx_financial_transactions_group
      ON financial_transactions(group_id);

    CREATE INDEX IF NOT EXISTS idx_financial_transactions_account
      ON financial_transactions(group_id, account_type);

    CREATE TABLE IF NOT EXISTS member_statement_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      individual_total_savings REAL NOT NULL DEFAULT 0,
      individual_loan_balance REAL NOT NULL DEFAULT 0,
      individual_loan_due_date TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS notification_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_id INTEGER,
      notification_type TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS notification_delivery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      delivered_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (notification_id) REFERENCES notification_queue(id)
    );

    CREATE INDEX IF NOT EXISTS idx_members_group
      ON members(group_id);

    CREATE INDEX IF NOT EXISTS idx_members_status
      ON members(status);

    CREATE INDEX IF NOT EXISTS idx_groups_status
      ON groups(status);

    CREATE INDEX IF NOT EXISTS idx_kin_member
      ON member_next_of_kin(member_id);

    CREATE INDEX IF NOT EXISTS idx_kin_history_member
      ON next_of_kin_change_history(member_id);

    CREATE INDEX IF NOT EXISTS idx_auth_attempt_member
      ON member_auth_attempts(member_id);

    CREATE INDEX IF NOT EXISTS idx_notifications_status
      ON notification_queue(status);
  `);

  await addColumnIfMissing(
    db,
    'members',
    'gender',
    "TEXT NOT NULL DEFAULT ''",
  );

  await addColumnIfMissing(
    db,
    'members',
    'age',
    'INTEGER NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'members',
    'cell',
    "TEXT NOT NULL DEFAULT ''",
  );

  await addColumnIfMissing(
    db,
    'members',
    'district',
    "TEXT NOT NULL DEFAULT ''",
  );

  await addColumnIfMissing(
    db,
    'members',
    'photo_uri',
    'TEXT',
  );

  await addColumnIfMissing(
    db,
    'members',
    'role',
    "TEXT NOT NULL DEFAULT 'member'",
  );

  await ensureFinancialAccountsForAllGroups(db);

  const groups =
    await db.getAllAsync<{ id: number }>(
      `SELECT id FROM groups`,
    );

  for (const group of groups) {
    await createDefaultVSLASetupRules(
      db,
      group.id,
    );
  }

  await refreshGroupDormancy(db);
  await applyDueNextOfKinChanges(db);
  await applyDueNextOfKinBenefits(db);

  return db;
}

/* ============================================================
   DATABASE COMPATIBILITY
   ============================================================ */

export async function initializeDatabase(): Promise<void> {
  await getDatabase();
}

export async function initDatabase(): Promise<void> {
  await initializeDatabase();
}

/* ============================================================
   GROUP FUNCTIONS
   ============================================================ */

export async function getAllGroups(): Promise<GroupRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<GroupRecord>(
    `${GROUP_SELECT}
     ORDER BY
       CASE WHEN status = 'active' THEN 0 ELSE 1 END,
       group_number ASC,
       id ASC`,
  );
}

export async function getActiveGroup(): Promise<GroupRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<GroupRecord>(
    `${GROUP_SELECT}
     WHERE status = 'active'
     ORDER BY id ASC
     LIMIT 1`,
  );
}

async function findNextAvailableGroupNumber(
  db: SQLite.SQLiteDatabase,
): Promise<number> {
  await refreshGroupDormancy(db);

  const groups =
    await db.getAllAsync<{
      group_number: string | number;
      status: string;
    }>(
      `SELECT group_number, status
       FROM groups
       WHERE status = 'active'`,
    );

  const activeNumbers =
    new Set<number>();

  for (const group of groups) {
    const number =
      parseGroupNumber(
        group.group_number,
      );

    if (
      number >= GROUP_START &&
      number <= GROUP_END
    ) {
      activeNumbers.add(number);
    }
  }

  for (
    let number = GROUP_START;
    number <= GROUP_END;
    number += 1
  ) {
    if (!activeNumbers.has(number)) {
      return number;
    }
  }

  throw new Error(
    'No group number is currently available.',
  );
}

export async function createGroup(
  groupName: string,
  district: string,
  country: string,
): Promise<number> {
  const db = await getDatabase();

  const cleanName =
    normalizeText(groupName);

  const cleanDistrict =
    normalizeText(district);

  const cleanCountry =
    normalizeText(country);

  if (!cleanName) {
    throw new Error(
      'Group name is required.',
    );
  }

  if (!cleanDistrict) {
    throw new Error(
      'District is required.',
    );
  }

  if (!cleanCountry) {
    throw new Error(
      'Country is required.',
    );
  }

  const groupNumber =
    await findNextAvailableGroupNumber(db);

  const timestamp = now();

  const result =
    await db.runAsync(
      `INSERT INTO groups (
        group_number,
        group_name,
        district,
        country,
        status,
        created_at,
        last_activity_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      groupNumber,
      cleanName,
      cleanDistrict,
      cleanCountry,
      timestamp,
      timestamp,
    );

  const groupId =
    result.lastInsertRowId;

  await ensureFinancialAccountsForGroup(
    db,
    groupId,
  );

  await insertDefaultConstitution(
    db,
    groupId,
  );

  await createDefaultVSLASetupRules(
    db,
    groupId,
  );

  return groupId;
}

export async function registerGroup(input: {
  groupName: string;
  district: string;
  country: string;
}): Promise<GroupRecord> {
  const groupId =
    await createGroup(
      input.groupName,
      input.district,
      input.country,
    );

  const group =
    await getGroupById(groupId);

  if (!group) {
    throw new Error(
      'Group was created but could not be loaded.',
    );
  }

  return group;
}

export async function recordGroup
