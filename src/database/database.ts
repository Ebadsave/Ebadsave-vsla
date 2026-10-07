import * as SQLite from 'expo-sqlite';
function simpleHash(value: string): string {
  let hash = 0;

  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}
function generateLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export type GroupRecord = {
  id: number;
  group_number: number;
  group_name: string;
  district: string;
  country: string;
  currency: string;
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
  role: string;
  is_super_user: number;
  assigned_roles: string;
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
  non_loan_repayment_fine: number;
  non_insurance_contribution: number;
  meeting_frequency: string;
  cycle_duration_months: number;
  leadership_term_months: number;
  share_out_enabled: number;
  created_at: string;
  updated_at: string;
};
export async function getMemberSavings(
  groupId: number,
  memberId: number,
): Promise<number> {
  const db = await getDatabase();

  const result =
    await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM financial_transactions
       WHERE group_id = ?
       AND member_id = ?
       AND account_type = 'savings'
       AND transaction_type = 'savings_contribution'
       AND reversed = 0`,
      groupId,
      memberId,
    );

  return result?.total ?? 0;
}
const EXECUTIVE_POSTS = [
  'Chairperson',
  'Vice Chair',
  'Secretary',
  'Treasurer',
  'Money Counter',
  'Key Keeper',
  'Supervisor',
] as const;

function canonicalExecutivePost(role: string): string | null {
  const value = normalizeText(role).toLowerCase();

  if (!value || value === 'all' || value === 'member') {
    return null;
  }

  if (value === 'chair' || value === 'chairperson') return 'Chairperson';
  if (value === 'vice chair' || value === 'vice-chair' || value === 'vice chairperson') return 'Vice Chair';
  if (value === 'secretary') return 'Secretary';
  if (value === 'treasurer') return 'Treasurer';
  if (value === 'money counter' || value === 'money counters') return 'Money Counter';
  if (value === 'key keeper' || value === 'key keepers') return 'Key Keeper';
  if (value === 'supervisor') return 'Supervisor';

  return normalizeText(role);
}

export async function getOccupiedExecutivePosts(
  groupId: number,
  excludeMemberId?: number,
): Promise<Record<string, number>> {
  const db = await getDatabase();

  const members = await db.getAllAsync<{
    id: number;
    assigned_roles: string | null;
  }>(
    `SELECT id, assigned_roles
     FROM members
     WHERE group_id = ?
     AND status = 'active'
     AND id != COALESCE(?, -1)`,
    groupId,
    excludeMemberId ?? null,
  );

  const occupied: Record<string, number> = {};

  for (const member of members) {
    for (const rawRole of (member.assigned_roles || '').split(',')) {
      const post = canonicalExecutivePost(rawRole);
      if (post && EXECUTIVE_POSTS.includes(post as (typeof EXECUTIVE_POSTS)[number])) {
        occupied[post] = member.id;
      }
    }
  }

  return occupied;
}

export async function updateMemberRoles(
  memberId: number,
  isSuperUser: boolean,
  assignedRoles: string[],
): Promise<void> {
  const db = await getDatabase();

  const cleanRoles = Array.from(
    new Set(
      (assignedRoles ?? [])
        .map((role) => canonicalExecutivePost(role))
        .filter((role): role is string => Boolean(role)),
    ),
  );

  if (isSuperUser && !cleanRoles.includes('Chairperson')) {
    cleanRoles.unshift('Chairperson');
  }

  const member =
    await db.getFirstAsync<{
      id: number;
      group_id: number;
      status: string;
    }>(
      `SELECT id, group_id, status
       FROM members
       WHERE id = ?
       LIMIT 1`,
      memberId,
    );

  if (!member) {
    throw new Error('Member not found.');
  }

  if (member.status !== 'active') {
    throw new Error(
      'Only an active member can be assigned an executive role.',
    );
  }

  /* Every executive post belongs to one member only. */
  const occupied = await getOccupiedExecutivePosts(
    member.group_id,
    memberId,
  );

  const alreadyAssignedElsewhere = cleanRoles.find(
    (post) => occupied[post] !== undefined,
  );

  if (alreadyAssignedElsewhere) {
    throw new Error(
      `${alreadyAssignedElsewhere} is already assigned to another member.`,
    );
  }

  const role = cleanRoles.length > 0
    ? 'executive'
    : 'member';

  await db.runAsync(
    `UPDATE members
     SET role = ?,
         is_super_user = ?,
         assigned_roles = ?
     WHERE id = ?`,
    role,
    isSuperUser ? 1 : 0,
    cleanRoles.join(','),
    memberId,
  );
}

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
  nonLoanRepaymentFine?: number;
  nonInsuranceContribution?: number;
  meetingFrequency?: string;
  cycleDurationMonths?: number;
  leadershipTermMonths?: number;
  shareOutEnabled?: boolean | number;
};
export type SyncQueueRecord = {
  id: number;
  collection_name: string;
  record_id: string;
  data_json: string;
  synced: number;
  created_at: string;
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
  collection_id?: number | null;
  transaction_type: string;
  reversed_transaction_id?: number | null;
  reversed?: number;
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

export type MeetingTransactionSummary = {
  savings: number;
  fines: number;
  loanRepayment: number;
  socialFund: number;
  miscellaneousExpense: number;
  loanFund: number;
  insuranceFund: number;
  transactionCount: number;
};

export type FinancialCollectionRecord = {
  id: number;
  group_id: number;
  meeting_id: number | null;
  member_id: number | null;
  total_amount: number;
  status: string;
  confirmation_code: string;
  created_at: string;
  confirmed_at: string | null;
};

export type FinancialCollectionItem = {
  id: number;
  collection_id: number;
  account_type: FinancialAccountType;
  amount: number;
  reason: string;
  transaction_id: number | null;
};

export type MemberPassbookRecord = {
  id: number;
  group_id: number;
  member_id: number;
  meeting_id: number | null;
  transaction_id: number | null;
  entry_type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
};

export type MemberStatementRecord = {
  id: number;
  meeting_id: number;
  member_id: number;
  individual_total_savings: number;
  individual_loan_balance: number;
  individual_loan_due_date: string | null;
  created_at: string;
};

export type ReceiptRecord = {
  id: number;
  group_id: number;
  member_id: number | null;
  meeting_id: number | null;
  collection_id: number | null;
  transaction_id: number | null;
  receipt_number: string;
  amount: number;
  description: string;
  created_at: string;
};

/* ============================================================
   MEETING TYPES
   ============================================================ */

export type GroupMeetingRecord = {
  id: number;
  group_id: number;
  meeting_number: number;
  cycle_number: number;
  meeting_date: string;
  opened_at: string | null;
  closed_at: string | null;
  status: string;
  created_at: string;
  summary_approved: number;
  summary_approved_by: number | null;
  summary_approved_at: string | null;
  previous_meeting_reviewed: number;
  previous_meeting_editable: number;
  loan_fund_at_start: number;
  insurance_fund_at_start: number;
};

export type MeetingSummaryRecord = {
  meeting_id: number;
  meeting_number: number;
  cycle_number: number;
  meeting_date: string;
  opened_at: string | null;
  closed_at: string | null;
  status: string;
  total_savings: number;
  loan_fund: number;
  group_fund: number;
  insurance_fund: number;
  summary_approved: number;
  cash_at_hand?: number | null;
  cash_expected?: number | null;
  cash_balanced?: number;
  reconciliation_note?: string;
};

export type MeetingAuditRecord = {
  id: number;
  group_id: number;
  cycle_number: number;
  meeting_id: number;
  meeting_number: number;
  action: string;
  actor_member_id: number | null;
  details: string;
  created_at: string;
};

/* ============================================================
   DATABASE CONSTANTS
   ============================================================ */

const dbPromise = SQLite.openDatabaseAsync(
  'ebadsave_vsla.db',
);

const TEST_GROUP_START = 2000;
const TEST_GROUP_END = 2009;
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
  return simpleHash(`${salt}:${passcode}`);
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

  return Number.isFinite(numeric)
    ? numeric
    : 0;
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

  if (
    !columns.some(
      (item) => item.name === column,
    )
  ) {
    await db.execAsync(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`,
    );
  }
}

async function addMemberRoleColumns(): Promise<void> {
  const db = await dbPromise;

  const columns = await db.getAllAsync<{
    name: string;
  }>(
    `PRAGMA table_info(members)`,
  );

  const columnNames = columns.map(
    (column) => column.name,
  );

  if (!columnNames.includes('is_super_user')) {
    await db.execAsync(`
      ALTER TABLE members
      ADD COLUMN is_super_user INTEGER NOT NULL DEFAULT 0;
    `);
  }

  if (!columnNames.includes('assigned_roles')) {
    await db.execAsync(`
      ALTER TABLE members
      ADD COLUMN assigned_roles TEXT NOT NULL DEFAULT '';
    `);
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

  for (const accountType of FINANCIAL_ACCOUNT_TYPES) {
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
   DEFAULT VSLA RULES
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
      non_loan_repayment_fine,
      non_insurance_contribution,
      meeting_frequency,
      cycle_duration_months,
      leadership_term_months,
      share_out_enabled,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    groupId,
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
    0,
    0,
    'weekly',
    12,
    12,
    1,
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
    }>(
      `SELECT
        id,
        member_id,
        slot,
        action,
        new_name,
        new_phone,
        new_gender
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
      `SELECT id, member_id, slot
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

    if (benefit.slot === 3) {
      // Slot 3 is an open recurring benefit slot for active members.
      await db.runAsync(
        `UPDATE member_next_of_kin
         SET benefit_received = 0, locked = 0, updated_at = ?
         WHERE member_id = ? AND slot = 3`,
        now(),
        benefit.member_id,
      );
    } else {
      await db.runAsync(
        `UPDATE member_next_of_kin
         SET benefit_received = 1, locked = 1, updated_at = ?
         WHERE member_id = ? AND slot = ?`,
        now(),
        benefit.member_id,
        benefit.slot,
      );
    }
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
currency TEXT NOT NULL DEFAULT 'UGX',
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
      is_super_user INTEGER NOT NULL DEFAULT 0,
      assigned_roles TEXT NOT NULL DEFAULT 'member',
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
      non_loan_repayment_fine REAL NOT NULL DEFAULT 0,
      non_insurance_contribution REAL NOT NULL DEFAULT 0,
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
      meeting_number INTEGER NOT NULL,
      cycle_number INTEGER NOT NULL DEFAULT 1,
      meeting_date TEXT NOT NULL,
      opened_at TEXT,
      closed_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      summary_approved INTEGER NOT NULL DEFAULT 0,
      summary_approved_by INTEGER,
      summary_approved_at TEXT,
      previous_meeting_reviewed INTEGER NOT NULL DEFAULT 0,
      previous_meeting_editable INTEGER NOT NULL DEFAULT 0,
      loan_fund_at_start REAL NOT NULL DEFAULT 0,
      insurance_fund_at_start REAL NOT NULL DEFAULT 0,
      UNIQUE(group_id, meeting_number),
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

    CREATE TABLE IF NOT EXISTS meeting_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      attendance_status TEXT NOT NULL DEFAULT 'pending',
      marked_at TEXT,
      marked_by INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      UNIQUE(meeting_id, member_id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (marked_by) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_closures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      closed_at TEXT NOT NULL,
      total_savings REAL NOT NULL DEFAULT 0,
      loan_fund REAL NOT NULL DEFAULT 0,
      group_fund REAL NOT NULL DEFAULT 0,
      insurance_fund REAL NOT NULL DEFAULT 0,
      cash_at_hand REAL,
      cash_expected REAL,
      cash_balanced INTEGER NOT NULL DEFAULT 0,
      reconciliation_note TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS financial_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      meeting_id INTEGER,
      member_id INTEGER,
      total_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      confirmation_code TEXT NOT NULL,
      created_at TEXT NOT NULL,
      confirmed_at TEXT,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS financial_collection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL,
      account_type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      transaction_id INTEGER,
      FOREIGN KEY (collection_id) REFERENCES financial_collections(id),
      FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id)
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      account_type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      member_id INTEGER,
      meeting_id INTEGER,
      collection_id INTEGER,
      transaction_type TEXT NOT NULL,
      reversed_transaction_id INTEGER,
      reversed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id)
    );

    CREATE TABLE IF NOT EXISTS financial_transaction_reversals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_transaction_id INTEGER NOT NULL UNIQUE,
      reversal_transaction_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reversed_by INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (original_transaction_id)
        REFERENCES financial_transactions(id),
      FOREIGN KEY (reversal_transaction_id)
        REFERENCES financial_transactions(id),
      FOREIGN KEY (reversed_by)
        REFERENCES members(id)
    );
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      meeting_id INTEGER,
      member_id INTEGER,
      receipt_number TEXT NOT NULL,
      receipt_type TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
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
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      fallback_used INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS notification_delivery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      delivered_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      FOREIGN KEY (notification_id) REFERENCES notification_queue(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_audit_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      cycle_number INTEGER NOT NULL,
      meeting_id INTEGER NOT NULL,
      meeting_number INTEGER NOT NULL,
      action TEXT NOT NULL,
      actor_member_id INTEGER,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id),
      FOREIGN KEY (actor_member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS member_passbook_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      meeting_id INTEGER,
      transaction_id INTEGER,
      entry_type TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      balance_after REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id),
      FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id)
    );

    CREATE TABLE IF NOT EXISTS member_statement_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      individual_total_savings REAL NOT NULL DEFAULT 0,
      individual_loan_balance REAL NOT NULL DEFAULT 0,
      individual_loan_due_date TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(meeting_id, member_id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS loan_interest_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  loan_month TEXT NOT NULL,
  opening_balance REAL NOT NULL,
  interest_percentage REAL NOT NULL,
  interest_amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(member_id, loan_month),
  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (member_id) REFERENCES members(id)
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

    CREATE INDEX IF NOT EXISTS idx_financial_accounts_group
      ON financial_accounts(group_id);

    CREATE INDEX IF NOT EXISTS idx_financial_transactions_group
      ON financial_transactions(group_id);

    CREATE INDEX IF NOT EXISTS idx_financial_transactions_account
      ON financial_transactions(group_id, account_type);

    CREATE INDEX IF NOT EXISTS idx_financial_transactions_member
      ON financial_transactions(member_id);

    CREATE INDEX IF NOT EXISTS idx_passbook_member
      ON member_passbook_records(member_id);

    CREATE INDEX IF NOT EXISTS idx_meeting_audit_group
      ON meeting_audit_records(group_id, meeting_number);

    CREATE INDEX IF NOT EXISTS idx_meeting_audit_cycle
      ON meeting_audit_records(group_id, cycle_number);
  `);

  /* ==========================================================
     EXISTING DATABASE MIGRATIONS
     ========================================================== */

  // Backfill slot 3 for members created before slot 3 was introduced.
  await db.runAsync(
    `INSERT INTO member_next_of_kin (
      member_id, slot, name, phone, gender,
      benefit_received, locked, created_at, updated_at
    )
    SELECT m.id, 3, NULL, NULL, NULL, 0, 0, ?, ?
    FROM members m
    WHERE NOT EXISTS (
      SELECT 1 FROM member_next_of_kin k
      WHERE k.member_id = m.id AND k.slot = 3
    )`,
    now(),
    now(),
  );
  await addColumnIfMissing(
    db,
    'groups',
    'currency',
    "TEXT NOT NULL DEFAULT 'UGX'",
  );
  
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

  await addMemberRoleColumns();

  await addColumnIfMissing(
    db,
    'group_meetings',
    'meeting_number',
    'INTEGER NOT NULL DEFAULT 1',
  );

  await addColumnIfMissing(
    db,
    'group_meetings',
    'cycle_number',
    'INTEGER NOT NULL DEFAULT 1',
  );

  await addColumnIfMissing(
    db,
    'group_meetings',
    'summary_approved',
    'INTEGER NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'group_meetings',
    'summary_approved_by',
    'INTEGER',
  );

  await addColumnIfMissing(
    db,
    'group_meetings',
    'summary_approved_at',
    'TEXT',
  );

  await addColumnIfMissing(
    db,
    'group_meetings',
    'previous_meeting_reviewed',
    'INTEGER NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'group_meetings',
    'previous_meeting_editable',
    'INTEGER NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'group_meetings',
    'loan_fund_at_start',
    'REAL NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'group_meetings',
    'insurance_fund_at_start',
    'REAL NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'meeting_closures',
    'insurance_fund',
    'REAL NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'non_insurance_contribution',
    'REAL NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'financial_transactions',
    'collection_id',
    'INTEGER',
  );

  await addColumnIfMissing(
    db,
    'financial_transactions',
    'reversed_transaction_id',
    'INTEGER',
  );

  await addColumnIfMissing(
    db,
    'financial_transactions',
    'reversed',
    'INTEGER NOT NULL DEFAULT 0',
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

  await addColumnIfMissing(db, 'meeting_closures', 'cash_at_hand', 'REAL');
  await addColumnIfMissing(db, 'meeting_closures', 'cash_expected', 'REAL');
  await addColumnIfMissing(db, 'meeting_closures', 'cash_balanced', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'meeting_closures', 'reconciliation_note', "TEXT NOT NULL DEFAULT ''");

  /*
   * Existing meetings from an older database did not have
   * meeting numbers. Give them permanent sequential numbers.
   */
  for (const group of groups) {
    const meetings =
      await db.getAllAsync<{
        id: number;
        meeting_number: number;
      }>(
        `SELECT id, meeting_number
         FROM group_meetings
         WHERE group_id = ?
         ORDER BY id ASC`,
        group.id,
      );

    let number = 1;

    for (const meeting of meetings) {
      await db.runAsync(
        `UPDATE group_meetings
         SET meeting_number = ?
         WHERE id = ?`,
        number,
        meeting.id,
      );

      number += 1;
    }
  }

  return db;
}

/* ============================================================
   BACKUP / RESTORE
   ============================================================ */

export type EbadsaveBackup = {
  version: 1;
  created_at: string;
  tables: Record<string, unknown[]>;
};

const BACKUP_TABLES = [
  'groups', 'members', 'deleted_member_numbers', 'member_next_of_kin',
  'next_of_kin_change_history', 'next_of_kin_benefits', 'group_rules',
  'vsla_setup_rules', 'group_meetings', 'member_credentials',
  'member_auth_attempts', 'member_transaction_signatures', 'app_access_sessions',
  'app_access_authorizers', 'meeting_attendance', 'meeting_closures',
  'financial_accounts', 'financial_collections', 'financial_collection_items',
  'financial_transactions', 'financial_transaction_reversals', 'receipts',
  'notification_queue', 'notification_delivery', 'meeting_audit_records',
  'sync_queue', 'member_passbook_records', 'member_statement_records',
  'loan_interest_charges',
] as const;

export async function createDatabaseBackup(): Promise<string> {
  const db = await getDatabase();
  const tables: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await db.getAllAsync(`SELECT * FROM ${table}`);
  }
  return JSON.stringify({ version: 1, created_at: now(), tables } satisfies EbadsaveBackup);
}

export async function restoreDatabaseBackup(backup: string): Promise<void> {
  const parsed = JSON.parse(backup) as EbadsaveBackup;
  if (!parsed || parsed.version !== 1 || !parsed.tables) {
    throw new Error('Invalid Ebadsave backup file.');
  }
  const db = await getDatabase();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (const table of [...BACKUP_TABLES].reverse()) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
    for (const table of BACKUP_TABLES) {
      const rows = Array.isArray(parsed.tables[table]) ? parsed.tables[table] as Record<string, unknown>[] : [];
      for (const row of rows) {
        const keys = Object.keys(row);
        if (!keys.length) continue;
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map((key) => row[key] as any);
        await db.runAsync(
          `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${placeholders})`,
          ...values,
        );
      }
    }
    await db.execAsync('COMMIT;');
    await ensureFinancialAccountsForAllGroups(db);
    for (const group of await db.getAllAsync<{ id: number }>('SELECT id FROM groups')) {
      await recalculateFinancialAccountsForGroup(db, group.id);
    }
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
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
  rangeStart: number = GROUP_START,
  rangeEnd: number = GROUP_END,
): Promise<number> {
  await refreshGroupDormancy(db);

  const groups =
    await db.getAllAsync<{
      group_number: string | number;
      status: string;
      last_activity_at: string;
    }>(
      `SELECT group_number, status, last_activity_at
       FROM groups`,
    );

  const reservedNumbers = new Set<number>();
  const dormantCutoff = new Date();
  dormantCutoff.setDate(
    dormantCutoff.getDate() - 90,
  );

  for (const group of groups) {
    const number = parseGroupNumber(group.group_number);

    if (
      number < rangeStart ||
      number > rangeEnd
    ) {
      continue;
    }

    if (rangeStart === TEST_GROUP_START) {
      // Test numbers may be reused after a test group is deleted.
      if (group.status !== 'deleted') {
        reservedNumbers.add(number);
      }
      continue;
    }

    // Production numbers remain reserved while active.
    // Dormant numbers become available only after 90 days.
    // Deleted production groups remain reserved.
    if (group.status === 'active') {
      reservedNumbers.add(number);
      continue;
    }

    if (group.status === 'dormant') {
      const lastActivity = new Date(
        group.last_activity_at,
      );

      if (lastActivity > dormantCutoff) {
        reservedNumbers.add(number);
      }
    }
  }

  for (
    let number = rangeStart;
    number <= rangeEnd;
    number += 1
  ) {
    if (!reservedNumbers.has(number)) {
      return number;
    }
  }

  throw new Error(
    'No group number is currently available in this range.',
  );
}

export async function createGroup(
  groupName: string,
  district: string,
  country: string,
  isTestGroup: boolean = false,
): Promise<number> {
  const db = await getDatabase();

  const cleanName =
    normalizeText(groupName);

  const cleanDistrict =
    normalizeText(district);

  const cleanCountry =
    normalizeText(country);

  if (!cleanName) {
    throw new Error('Group name is required.');
  }

  if (!cleanDistrict) {
    throw new Error('District is required.');
  }

  if (!cleanCountry) {
    throw new Error('Country is required.');
  }

  const groupNumber =
    await findNextAvailableGroupNumber(
      db,
      isTestGroup
        ? TEST_GROUP_START
        : GROUP_START,
      isTestGroup
        ? TEST_GROUP_END
        : GROUP_END,
    );

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
  isTestGroup?: boolean;
}): Promise<GroupRecord> {
  const groupId =
    await createGroup(
      input.groupName,
      input.district,
      input.country,
      input.isTestGroup === true,
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

export async function deleteGroup(
  groupId: number,
): Promise<GroupRecord> {
  const db = await getDatabase();

  const group = await getGroupById(groupId);

  if (!group) {
    throw new Error('Group not found.');
  }

  if (group.status === 'deleted') {
    return group;
  }

  await db.runAsync(
    `UPDATE groups
     SET status = 'deleted'
     WHERE id = ?`,
    groupId,
  );

  const deletedGroup = await getGroupById(groupId);

  if (!deletedGroup) {
    throw new Error(
      'Group was deleted but could not be loaded.',
    );
  }

  return deletedGroup;
}

export async function undoDeleteGroup(
  groupId: number,
): Promise<GroupRecord> {
  const db = await getDatabase();

  const group = await getGroupById(groupId);

  if (!group) {
    throw new Error('Group not found.');
  }

  if (group.status !== 'deleted') {
    return group;
  }

  const timestamp = now();

  await db.runAsync(
    `UPDATE groups
     SET status = 'active',
         last_activity_at = ?
     WHERE id = ?`,
    timestamp,
    groupId,
  );

  const restoredGroup = await getGroupById(groupId);

  if (!restoredGroup) {
    throw new Error(
      'Group was restored but could not be loaded.',
    );
  }

  return restoredGroup;
}

export async function recordGroupActivity(
  groupId: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE groups
     SET
       status = 'active',
       last_activity_at = ?
     WHERE id = ?`,
    now(),
    groupId,
  );
}

export async function getGroupById(
  groupId: number,
): Promise<GroupRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<GroupRecord>(
    `${GROUP_SELECT}
     WHERE id = ?
     LIMIT 1`,
    groupId,
  );
}

export async function updateGroup(
  groupId: number,
  groupName: string,
  district: string,
  country: string,
): Promise<GroupRecord> {
  const db = await getDatabase();

  const cleanName =
    normalizeText(groupName);

  const cleanDistrict =
    normalizeText(district);

  const cleanCountry =
    normalizeText(country);

  if (!cleanName) {
    throw new Error('Group name is required.');
  }

  if (!cleanDistrict) {
    throw new Error('District is required.');
  }

  if (!cleanCountry) {
    throw new Error('Country is required.');
  }

  const existingGroup =
    await getGroupById(groupId);

  if (!existingGroup) {
    throw new Error('Group not found.');
  }

  const timestamp = now();

  await db.runAsync(
    `UPDATE groups
     SET
       group_name = ?,
       district = ?,
       country = ?,
       last_activity_at = ?
     WHERE id = ?`,
    cleanName,
    cleanDistrict,
    cleanCountry,
    timestamp,
    groupId,
  );

  await db.runAsync(
    `UPDATE group_rules
     SET
       content = ?,
       updated_at = ?
     WHERE group_id = ?
     AND article_number = 1`,
    `This group shall operate as ${cleanName}. Its purpose is to encourage members to save together, grow together, access appropriate financial services, support one another, and improve the financial wellbeing of members.`,
    timestamp,
    groupId,
  );

  const updatedGroup =
    await getGroupById(groupId);

  if (!updatedGroup) {
    throw new Error(
      'Group was updated but could not be loaded.',
    );
  }

  return updatedGroup;
}

/* ============================================================
   CONSTITUTION
   ============================================================ */

async function insertDefaultConstitution(
  db: SQLite.SQLiteDatabase,
  groupId: number,
): Promise<void> {
  const articles: Array<
    [number, string, string]
  > = [
    [
      1,
      'Name and Purpose',
      'This group shall operate as Ebadsave VSLA. Its purpose is to encourage members to save together, grow together, access appropriate financial services, support one another, and improve the financial wellbeing of members.',
    ],
    [
      2,
      'Membership',
      'Membership shall be open to eligible persons who accept this constitution, follow group rules, contribute regularly, attend meetings, and participate in group activities.',
    ],
    [
      3,
      'Contributions',
      'Members shall make regular savings contributions according to the amount and schedule approved by the group. All contributions shall be properly recorded.',
    ],
    [
      4,
      'Loans',
      'Members may apply for loans subject to group approval and the availability of funds. The default maximum loan amount shall be three times the member savings, unless the group approves another limit through an amendment.',
    ],
    [
      5,
      'Meetings and Attendance',
      'Members shall attend scheduled meetings on time and participate in group activities. Members who are absent or late without an acceptable reason may be subject to penalties approved by the group.',
    ],
    [
      6,
      'Leadership',
      'The group shall have a Chair, Vice Chair, Secretary, Treasurer, two Money Counters, three Key Keepers, and a Supervisor. Leaders shall perform their duties honestly and in the interests of the group.',
    ],
    [
      7,
      'Welfare, and Insurance Fund',
      'The group may maintain welfare and insurance funds to support members during qualifying emergencies, approved welfare needs, and other circumstances agreed upon by members.',
    ],
    [
      8,
      'Penalties and Fines',
      'Members who fail to follow approved group rules may be required to pay penalties or fines. All fines shall be recorded and allocated to the group fines fund.',
    ],
    [
      9,
      'Sharing and Dissolution',
      'Savings, profits, and other group funds shall be shared according to approved group rules. If the group is dissolved, all outstanding obligations shall first be settled before the remaining funds are distributed.',
    ],
    [
      10,
      'Amendments',
      'This constitution may be amended when members approve proposed changes according to the agreed voting procedure. Approved amendments shall be recorded as part of the group constitution.',
    ],
    [
      11,
      'Executive expire period',
      'The executive committee shall serve for the period agreed by the members. At the end of the approved period, elections or approved replacements shall take place according to group rules.',
    ],
    [
      12,
      'Interest percentage and period of loan',
      'The group shall determine the applicable loan interest percentage and repayment period. These terms shall be approved by members and recorded in the group rules before loans are issued.',
    ],
  ];

  const timestamp = now();

  for (const article of articles) {
    await db.runAsync(
      `INSERT OR IGNORE INTO group_rules (
        group_id,
        article_number,
        title,
        content,
        effective_days,
        updated_at
      )
      VALUES (?, ?, ?, ?, 30, ?)`,
      groupId,
      article[0],
      article[1],
      article[2],
      timestamp,
    );
  }
}

export async function getGroupRules(
  groupId: number,
): Promise<GroupRuleRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<GroupRuleRecord>(
    `SELECT *
     FROM group_rules
     WHERE group_id = ?
     ORDER BY article_number ASC`,
    groupId,
  );
}

/* ============================================================
   VSLA SETUP RULE FUNCTIONS
   ============================================================ */

export async function getVSLASetupRules(
  groupId: number,
): Promise<VSLASetupRuleRecord | null> {
  const db = await getDatabase();

  let rules =
    await db.getFirstAsync<VSLASetupRuleRecord>(
      `SELECT *
       FROM vsla_setup_rules
       WHERE group_id = ?
       LIMIT 1`,
      groupId,
    );

  if (!rules) {
    await createDefaultVSLASetupRules(
      db,
      groupId,
    );

    rules =
      await db.getFirstAsync<VSLASetupRuleRecord>(
        `SELECT *
         FROM vsla_setup_rules
         WHERE group_id = ?
         LIMIT 1`,
        groupId,
      );
  }

  return rules ?? null;
}

export async function applyMonthlyLoanInterest(
  groupId: number,
  memberId: number,
): Promise<number> {
  const db = await getDatabase();

  const setup = await getVSLASetupRules(groupId);

  const interestPercentage =
    Number.isFinite(setup?.loan_interest_percentage)
      ? setup!.loan_interest_percentage
      : 5;

  const issued = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(ABS(amount)), 0) AS total
     FROM financial_transactions
     WHERE group_id = ?
       AND member_id = ?
       AND transaction_type = 'loan_issued'
       AND reversed = 0`,
    groupId,
    memberId,
  );

  const repayments = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM financial_transactions
     WHERE group_id = ?
       AND member_id = ?
       AND transaction_type = 'loan_repayment'
       AND reversed = 0`,
    groupId,
    memberId,
  );

  const principal = issued?.total ?? 0;
  const paid = repayments?.total ?? 0;

  if (principal <= 0) {
    return 0;
  }

  const currentBalance = Math.max(
    0,
    principal - paid,
  );

  if (currentBalance <= 0) {
    return 0;
  }

  const nowDate = new Date();

  const monthKey =
    `${nowDate.getFullYear()}-${String(
      nowDate.getMonth() + 1,
    ).padStart(2, '0')}`;

  const alreadyCharged =
    await db.getFirstAsync<{ id: number }>(
      `SELECT id
       FROM loan_interest_charges
       WHERE group_id = ?
       AND member_id = ?
       AND loan_month = ?
       LIMIT 1`,
      groupId,
      memberId,
      monthKey,
    );

  if (alreadyCharged) {
    return 0;
  }

  const interest =
    currentBalance *
    (interestPercentage / 100);

  if (interest <= 0) {
    return 0;
  }

  const timestamp = now();

  await db.runAsync(
    `INSERT INTO loan_interest_charges (
      group_id,
      member_id,
      loan_month,
      opening_balance,
      interest_percentage,
      interest_amount,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    groupId,
    memberId,
    monthKey,
    currentBalance,
    interestPercentage,
    interest,
    timestamp,
  );

  return interest;
  }

export async function updateVSLASetupRules(
  groupId: number,
  data: VSLASetupRuleUpdates,
): Promise<VSLASetupRuleRecord> {
  const db = await getDatabase();

  const group =
    await getGroupById(groupId);

  if (!group) {
    throw new Error('Group not found.');
  }

  let current =
    await getVSLASetupRules(groupId);

  if (!current) {
    throw new Error(
      'VSLA setup rules could not be created.',
    );
  }

  const shareValue =
    data.shareValue ??
    current.share_value;

  const minimumShares =
    data.minimumSharesPerMeeting ??
    current.minimum_shares_per_meeting;

  const maximumShares =
    data.maximumSharesPerMeeting ??
    current.maximum_shares_per_meeting;

  const maximumLoanMultiple =
    data.maximumLoanMultiple ??
    current.maximum_loan_multiple;

  const loanInterestPercentage =
    data.loanInterestPercentage ??
    current.loan_interest_percentage;

  const loanInterestPeriod =
    normalizeText(
      data.loanInterestPeriod ??
        current.loan_interest_period,
    );

  const maximumLoanRepaymentPeriod =
    data.maximumLoanRepaymentPeriod ??
    current.maximum_loan_repayment_period;

  const socialFundContribution =
    data.socialFundContribution ??
    current.social_fund_contribution;

  const absenceFine =
    data.absenceFine ??
    current.absence_fine;

  const lateFine =
    data.lateFine ??
    current.late_fine;

  const nonSavingFine =
    data.nonSavingFine ??
    current.non_saving_fine;

  const nonLoanRepaymentFine =
    data.nonLoanRepaymentFine !== undefined
      ? Number(data.nonLoanRepaymentFine)
      : Number(current.non_loan_repayment_fine ?? 0);

  const nonInsuranceContribution =
    data.nonInsuranceContribution !== undefined
      ? Number(data.nonInsuranceContribution)
      : Number(current.non_insurance_contribution ?? 0);

  const meetingFrequency =
    normalizeText(
      data.meetingFrequency ??
        current.meeting_frequency,
    );

  const cycleDurationMonths =
    data.cycleDurationMonths ??
    current.cycle_duration_months;

  const leadershipTermMonths =
    data.leadershipTermMonths ??
    current.leadership_term_months;

  const shareOutEnabled =
    data.shareOutEnabled === undefined
      ? current.share_out_enabled
      : data.shareOutEnabled
        ? 1
        : 0;

  if (
    !Number.isFinite(shareValue) ||
    shareValue <= 0
  ) {
    throw new Error(
      'Share value must be greater than zero.',
    );
  }

  if (
    !Number.isInteger(minimumShares) ||
    minimumShares < 1
  ) {
    throw new Error(
      'Minimum shares per meeting must be at least 1.',
    );
  }

  if (
    !Number.isInteger(maximumShares) ||
    maximumShares < minimumShares
  ) {
    throw new Error(
      'Maximum shares per meeting cannot be less than the minimum.',
    );
  }

  if (
    !Number.isFinite(maximumLoanMultiple) ||
    maximumLoanMultiple <= 0
  ) {
    throw new Error(
      'Maximum loan multiple must be greater than zero.',
    );
  }

  if (
    !Number.isFinite(
      loanInterestPercentage,
    ) ||
    loanInterestPercentage < 0
  ) {
    throw new Error(
      'Loan interest percentage cannot be negative.',
    );
  }

  if (!loanInterestPeriod) {
    throw new Error(
      'Loan interest period is required.',
    );
  }

  if (
    !Number.isInteger(
      maximumLoanRepaymentPeriod,
    ) ||
    maximumLoanRepaymentPeriod <= 0
  ) {
    throw new Error(
      'Maximum loan repayment period must be greater than zero.',
    );
  }

  if (
    !Number.isFinite(
      socialFundContribution,
    ) ||
    socialFundContribution < 0
  ) {
    throw new Error(
      'Social fund contribution cannot be negative.',
    );
  }

  if (
    !Number.isFinite(absenceFine) ||
    absenceFine < 0
  ) {
    throw new Error(
      'Absence fine cannot be negative.',
    );
  }

  if (
    !Number.isFinite(lateFine) ||
    lateFine < 0
  ) {
    throw new Error(
      'Late fine cannot be negative.',
    );
  }

  if (
    !Number.isFinite(nonSavingFine) ||
    nonSavingFine < 0
  ) {
    throw new Error(
      'Non-saving fine cannot be negative.',
    );
  }

  if (
    !Number.isFinite(nonLoanRepaymentFine) ||
    nonLoanRepaymentFine < 0
  ) {
    throw new Error(
      'Non-loan repayment fine cannot be negative.',
    );
  }

  if (
    !Number.isFinite(nonInsuranceContribution) ||
    nonInsuranceContribution < 0
  ) {
    throw new Error(
      'Non-insurance contribution cannot be negative.',
    );
  }

  if (!meetingFrequency) {
    throw new Error(
      'Meeting frequency is required.',
    );
}
  if (
    !Number.isInteger(
      cycleDurationMonths,
    ) ||
    cycleDurationMonths <= 0
  ) {
    throw new Error(
      'Cycle duration must be greater than zero.',
    );
  }

  if (
    !Number.isInteger(
      leadershipTermMonths,
    ) ||
    leadershipTermMonths <= 0
  ) {
    throw new Error(
      'Leadership term must be greater than zero.',
    );
  }

  const timestamp = now();

  await db.runAsync(
    `UPDATE vsla_setup_rules
     SET
       share_value = ?,
       minimum_shares_per_meeting = ?,
       maximum_shares_per_meeting = ?,
       maximum_loan_multiple = ?,
       loan_interest_percentage = ?,
       loan_interest_period = ?,
       maximum_loan_repayment_period = ?,
       social_fund_contribution = ?,
       absence_fine = ?,
       late_fine = ?,
       non_insurance_contribution = ?,
       non_saving_fine = ?,
       non_loan_repayment_fine = ?,
       meeting_frequency = ?,
       cycle_duration_months = ?,
       leadership_term_months = ?,
       share_out_enabled = ?,
       updated_at = ?
     WHERE group_id = ?`,
    shareValue,
    minimumShares,
    maximumShares,
    maximumLoanMultiple,
    loanInterestPercentage,
    loanInterestPeriod,
    maximumLoanRepaymentPeriod,
    socialFundContribution,
    absenceFine,
    lateFine,
    nonInsuranceContribution,
    nonSavingFine,
    nonLoanRepaymentFine,
    meetingFrequency,
    cycleDurationMonths,
    leadershipTermMonths,
    shareOutEnabled,
    timestamp,
    groupId,
  );

  current =
    await getVSLASetupRules(groupId);

  if (!current) {
    throw new Error(
      'VSLA setup rules were updated but could not be loaded.',
    );
  }

  return current;
}

/* ============================================================
   MEMBERS
   ============================================================ */

export async function getMembersByGroupId(
  groupId: number,
): Promise<MemberRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<MemberRecord>(
    `SELECT
      id,
      group_id,
      member_number,
      full_name,
      gender,
      age,
      phone,
      cell,
      district,
      photo_uri,
      role,
      is_super_user,
      assigned_roles,
      status,
      created_at
     FROM members
     WHERE group_id = ?
     AND status = 'active'
     ORDER BY member_number ASC`,
    groupId,
  );
}

export async function updateMemberRole(
  memberId: number,
  role: string,
): Promise<void> {
  const db = await dbPromise;

  await db.runAsync(
    `UPDATE members
     SET role = ?
     WHERE id = ?`,
    role,
    memberId,
  );
}
async function getNextMemberSequence(
  db: SQLite.SQLiteDatabase,
  groupId: number,
): Promise<number> {
  const members =
    await db.getAllAsync<{
      member_number: string;
    }>(
      `SELECT member_number
       FROM members
       WHERE group_id = ?`,
      groupId,
    );

  const deleted =
    await db.getAllAsync<{
      member_number: string;
    }>(
      `SELECT member_number
       FROM deleted_member_numbers
       WHERE group_id = ?`,
      groupId,
    );

  const used = new Set<number>();

  for (const item of [
    ...members,
    ...deleted,
  ]) {
    const match =
      item.member_number.match(
        /(\d{3})$/,
      );

    if (match) {
      used.add(Number(match[1]));
    }
  }

  for (
    let number = 1;
    number <= 999;
    number += 1
  ) {
    if (!used.has(number)) {
      return number;
    }
  }

  throw new Error(
    'This group has reached the 999-member limit.',
  );
}

function createMemberNumber(
  groupNumber: number,
  sequence: number,
): string {
  return `KYA${String(groupNumber).padStart(4, '0')}${String(sequence).padStart(3, '0')}`;
}

export async function registerMember(
  groupId: number,
  fullName: string,
  gender = '',
  age = 0,
  phone = '',
  cell = '',
  district = '',
  photoUri: string | null = null,
): Promise<number> {
  const db = await getDatabase();

  const name =
    normalizeText(fullName);

  if (!name) {
    throw new Error('Full name is required.');
  }

  const duplicateName =
    await db.getFirstAsync<{ id: number }>(
      `SELECT id
       FROM members
       WHERE group_id = ?
       AND status = 'active'
       AND LOWER(TRIM(full_name)) = LOWER(TRIM(?))
       LIMIT 1`,
      groupId,
      name,
    );

  if (duplicateName) {
    throw new Error(
      'A member with this name is already registered in this group.',
    );
  }

  if (!normalizeText(gender)) {
    throw new Error('Gender is required.');
  }

  if (
    !Number.isFinite(age) ||
    age <= 0
  ) {
    throw new Error('A valid age is required.');
  }

  if (!normalizeText(cell)) {
    throw new Error('Cell is required.');
  }

  if (!normalizeText(district)) {
    throw new Error('District is required.');
  }

  const group =
    await getGroupById(groupId);

  if (!group) {
    throw new Error('Group not found.');
  }

  const sequence =
    await getNextMemberSequence(
      db,
      groupId,
    );

  const memberNumber =
    createMemberNumber(
      group.group_number,
      sequence,
    );

  const timestamp = now();

  const result =
    await db.runAsync(
      `INSERT INTO members (
        group_id,
        member_number,
        full_name,
        gender,
        age,
        phone,
        cell,
        district,
        photo_uri,
        role,
        is_super_user,
        assigned_roles,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'member', 0, 'member', 'active', ?)`,
      groupId,
      memberNumber,
      name,
      normalizeText(gender),
      age,
      normalizeText(phone) || null,
      normalizeText(cell),
      normalizeText(district),
      photoUri,
      timestamp,
    );

  const memberId =
    result.lastInsertRowId;

  await db.runAsync(
    `INSERT INTO member_next_of_kin (
      member_id,
      slot,
      name,
      phone,
      gender,
      benefit_received,
      locked,
      created_at,
      updated_at
    )
    VALUES
      (?, 1, NULL, NULL, NULL, 0, 0, ?, ?),
      (?, 2, NULL, NULL, NULL, 0, 0, ?, ?),
      (?, 3, NULL, NULL, NULL, 0, 0, ?, ?)`,
    memberId,
    timestamp,
    timestamp,
    memberId,
    timestamp,
    timestamp,
    memberId,
    timestamp,
    timestamp,
  );

  const salt =
    generateLocalId();

  await db.runAsync(
    `INSERT INTO member_credentials (
      member_id,
      salt,
      passcode_hash,
      phone_eligible,
      created_at,
      updated_at
    )
    VALUES (?, ?, NULL, ?, ?, ?)`,
    memberId,
    salt,
    normalizeText(phone) ? 1 : 0,
    timestamp,
    timestamp,
  );

  await recordGroupActivity(groupId);

  return memberId;
}

export async function updateMember(
  memberId: number,
  data: {
    fullName?: string;
    gender?: string;
    age?: number;
    phone?: string;
    cell?: string;
    district?: string;
    photoUri?: string | null;
  },
): Promise<void> {
  const db = await getDatabase();

  const current =
    await db.getFirstAsync<MemberRecord>(
      `SELECT *
       FROM members
       WHERE id = ?
       LIMIT 1`,
      memberId,
    );

  if (!current) {
    throw new Error('Member not found.');
  }

  const fullName =
    data.fullName ?? current.full_name;

  const gender =
    data.gender ?? current.gender;

  const age =
    data.age ?? current.age;

  const phone =
    data.phone ??
    current.phone ??
    '';

  const cell =
    data.cell ?? current.cell;

  const district =
    data.district ?? current.district;

  const photoUri =
    data.photoUri === undefined
      ? current.photo_uri
      : data.photoUri;

  const normalizedFullName =
    normalizeText(fullName);

  if (!normalizedFullName) {
    throw new Error('Full name is required.');
  }

  const duplicateName =
    await db.getFirstAsync<{ id: number }>(
      `SELECT id
       FROM members
       WHERE group_id = ?
       AND status = 'active'
       AND id != ?
       AND LOWER(TRIM(full_name)) = LOWER(TRIM(?))
       LIMIT 1`,
      current.group_id,
      memberId,
      normalizedFullName,
    );

  if (duplicateName) {
    throw new Error(
      'A member with this name is already registered in this group.',
    );
  }

  if (!normalizeText(gender)) {
    throw new Error('Gender is required.');
  }

  if (
    !Number.isFinite(age) ||
    age <= 0
  ) {
    throw new Error('A valid age is required.');
  }

  if (!normalizeText(cell)) {
    throw new Error('Cell is required.');
  }

  if (!normalizeText(district)) {
    throw new Error('District is required.');
  }

  await db.runAsync(
    `UPDATE members
     SET
       full_name = ?,
       gender = ?,
       age = ?,
       phone = ?,
       cell = ?,
       district = ?,
       photo_uri = ?
     WHERE id = ?`,
    normalizedFullName,
    normalizeText(gender),
    age,
    normalizeText(phone) || null,
    normalizeText(cell),
    normalizeText(district),
    photoUri,
    memberId,
  );

  await db.runAsync(
    `UPDATE member_credentials
     SET
       phone_eligible = ?,
       updated_at = ?
     WHERE member_id = ?`,
    normalizeText(phone) ? 1 : 0,
    now(),
    memberId,
  );
}

export async function deleteMember(
  memberId: number,
  reason: string,
): Promise<void> {
  const db = await getDatabase();

  const member =
    await db.getFirstAsync<MemberRecord>(
      `SELECT *
       FROM members
       WHERE id = ?
       LIMIT 1`,
      memberId,
    );

  if (!member) {
    throw new Error('Member not found.');
  }

  if (!normalizeText(reason)) {
    throw new Error(
      'A reason is required when deleting a member.',
    );
  }

  const timestamp = now();

  await db.runAsync(
    `UPDATE members
     SET status = 'deleted'
     WHERE id = ?`,
    memberId,
  );

  await db.runAsync(
    `INSERT INTO deleted_member_numbers (
      group_id,
      member_number,
      deleted_at
    )
    VALUES (?, ?, ?)`,
    member.group_id,
    member.member_number,
    timestamp,
  );

  await recordGroupActivity(
    member.group_id,
  );
}

/* ============================================================
   NEXT OF KIN
   ============================================================ */

export async function getNextOfKin(
  memberId: number,
): Promise<NextOfKinRecord[]> {
  const db = await getDatabase();

  await applyDueNextOfKinChanges(db);
  await applyDueNextOfKinBenefits(db);

  return db.getAllAsync<NextOfKinRecord>(
    `SELECT *
     FROM member_next_of_kin
     WHERE member_id = ?
     ORDER BY slot ASC`,
    memberId,
  );
}

async function getKin(
  db: SQLite.SQLiteDatabase,
  memberId: number,
  slot: number,
): Promise<NextOfKinRecord | null> {
  return db.getFirstAsync<NextOfKinRecord>(
    `SELECT *
     FROM member_next_of_kin
     WHERE member_id = ?
     AND slot = ?
     LIMIT 1`,
    memberId,
    slot,
  );
}

function validateKinSlot(
  slot: number,
): void {
  if (slot !== 1 && slot !== 2 && slot !== 3) {
    throw new Error(
      'Next-of-kin slot must be 1, 2, or 3.',
    );
  }
}

async function assertNoPendingKinChange(
  db: SQLite.SQLiteDatabase,
  memberId: number,
  slot: number,
): Promise<void> {
  const pending =
    await db.getFirstAsync<{ id: number }>(
      `SELECT id
       FROM next_of_kin_change_history
       WHERE member_id = ?
       AND slot = ?
       AND applied = 0
       LIMIT 1`,
      memberId,
      slot,
    );

  if (pending) {
    throw new Error(
      'There is already a pending next-of-kin change for this slot.',
    );
  }
}

async function assertNoPendingKinBenefit(
  db: SQLite.SQLiteDatabase,
  memberId: number,
  slot: number,
): Promise<void> {
  const pending =
    await db.getFirstAsync<{ id: number }>(
      `SELECT id
       FROM next_of_kin_benefits
       WHERE member_id = ?
       AND slot = ?
       AND status = 'pending'
       LIMIT 1`,
      memberId,
      slot,
    );

  if (pending) {
    throw new Error(
      'This next-of-kin slot has a pending benefit and cannot be changed.',
    );
  }
}

export async function requestNextOfKinChange(
  memberId: number,
  slot: number,
  name: string | null,
  phone: string | null,
  gender: string | null,
  reason: string,
  effectiveDays = 30,
): Promise<number> {
  const db = await getDatabase();

  validateKinSlot(slot);

  if (!normalizeText(reason)) {
    throw new Error(
      'A reason is required for every next-of-kin change.',
    );
  }

  await applyDueNextOfKinChanges(db);
  await applyDueNextOfKinBenefits(db);

  const kin =
    await getKin(db, memberId, slot);

  if (!kin) {
    throw new Error(
      'Next-of-kin slot not found.',
    );
  }

  if (
    kin.locked === 1 ||
    kin.benefit_received === 1
  ) {
    throw new Error(
      'This next-of-kin slot is locked because benefits have been received.',
    );
  }

  await assertNoPendingKinChange(
    db,
    memberId,
    slot,
  );

  await assertNoPendingKinBenefit(
    db,
    memberId,
    slot,
  );

  const effectiveDate =
    new Date();

  effectiveDate.setDate(
    effectiveDate.getDate() +
      Math.max(0, effectiveDays),
  );

  const result =
    await db.runAsync(
      `INSERT INTO next_of_kin_change_history (
        member_id,
        slot,
        action,
        old_name,
        old_phone,
        old_gender,
        new_name,
        new_phone,
        new_gender,
        reason,
        requested_at,
        effective_at,
        applied
      )
      VALUES (?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      memberId,
      slot,
      kin.name,
      kin.phone,
      kin.gender,
      normalizeText(name) || null,
      normalizeText(phone) || null,
      normalizeText(gender) || null,
      normalizeText(reason),
      now(),
      effectiveDate.toISOString(),
    );

  return result.lastInsertRowId;
}

export async function requestNextOfKinDeletion(
  memberId: number,
  slot: number,
  reason: string,
  effectiveDays = 30,
): Promise<number> {
  const db = await getDatabase();

  validateKinSlot(slot);

  if (!normalizeText(reason)) {
    throw new Error(
      'A reason is required when deleting a next of kin.',
    );
  }

  await applyDueNextOfKinChanges(db);
  await applyDueNextOfKinBenefits(db);

  const kin =
    await getKin(db, memberId, slot);

  if (!kin) {
    throw new Error(
      'Next-of-kin slot not found.',
    );
  }

  if (
    kin.locked === 1 ||
    kin.benefit_received === 1
  ) {
    throw new Error(
      'This next-of-kin slot is locked because benefits have been received.',
    );
  }

  await assertNoPendingKinChange(
    db,
    memberId,
    slot,
  );

  await assertNoPendingKinBenefit(
    db,
    memberId,
    slot,
  );

  const effectiveDate =
    new Date();

  effectiveDate.setDate(
    effectiveDate.getDate() +
      Math.max(0, effectiveDays),
  );

  const result =
    await db.runAsync(
      `INSERT INTO next_of_kin_change_history (
        member_id,
        slot,
        action,
        old_name,
        old_phone,
        old_gender,
        new_name,
        new_phone,
        new_gender,
        reason,
        requested_at,
        effective_at,
        applied
      )
      VALUES (?, ?, 'delete', ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, 0)`,
      memberId,
      slot,
      kin.name,
      kin.phone,
      kin.gender,
      normalizeText(reason),
      now(),
      effectiveDate.toISOString(),
    );

  return result.lastInsertRowId;
}

export async function recordNextOfKinBenefit(
  memberId: number,
  slot: number,
  amount: number,
  reason: string,
  effectiveDays = 30,
): Promise<number> {
  const db = await getDatabase();

  validateKinSlot(slot);

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    throw new Error(
      'Benefit amount is invalid.',
    );
  }

  if (!normalizeText(reason)) {
    throw new Error(
      'A reason is required for a benefit.',
    );
  }

  await applyDueNextOfKinChanges(db);
  await applyDueNextOfKinBenefits(db);

  const member = await db.getFirstAsync<{ status: string }>(
    `SELECT status FROM members WHERE id = ? LIMIT 1`,
    memberId,
  );

  if (!member || String(member.status).toLowerCase() !== 'active') {
    throw new Error(
      'Insurance benefits are available only to active members.',
    );
  }

  const kin =
    await getKin(db, memberId, slot);

  if (!kin) {
    throw new Error(
      'Next-of-kin slot not found.',
    );
  }

  // Slot 3 stays open. Slots 1 and 2 retain lock-after-benefit behavior.
  if (
    slot !== 3 &&
    (kin.locked === 1 || kin.benefit_received === 1)
  ) {
    throw new Error(
      'This next-of-kin slot has already received benefits and is locked.',
    );
  }

  await assertNoPendingKinBenefit(
    db,
    memberId,
    slot,
  );

  const effectiveDate =
    new Date();

  effectiveDate.setDate(
    effectiveDate.getDate() +
      Math.max(0, effectiveDays),
  );

  const result =
    await db.runAsync(
      `INSERT INTO next_of_kin_benefits (
        member_id,
        slot,
        benefit_amount,
        reason,
        benefit_date,
        effective_at,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      memberId,
      slot,
      amount,
      normalizeText(reason),
      now(),
      effectiveDate.toISOString(),
    );

  return result.lastInsertRowId;
}

export type HomeDashboardSummary = FinancialSummary & {
  members: number;
  currency: string;
  openMeetingId: number | null;
  lastClosedMeetingId: number | null;
};

export async function getHomeDashboardSummary(
  groupId: number,
): Promise<HomeDashboardSummary> {
  const db = await getDatabase();
  const group = await getGroupById(groupId);
  if (!group) throw new Error('Group not found.');
  const financial = await getFinancialSummary(groupId);
  const members = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM members WHERE group_id = ? AND status = 'active'`,
    groupId,
  );
  const open = await getOpenMeeting(groupId);
  const closed = await getLastConcludedMeeting(groupId);
  return {
    ...financial,
    members: Number(members?.count) || 0,
    currency: group.currency || 'UGX',
    openMeetingId: open?.id ?? null,
    lastClosedMeetingId: closed?.id ?? null,
  };
}

export async function getGroupCurrency(groupId: number): Promise<string> {
  const group = await getGroupById(groupId);
  return group?.currency || 'UGX';
}

/* ============================================================
   FINANCIAL ACCOUNTS
   ============================================================ */

export async function getFinancialAccounts(
  groupId: number,
): Promise<FinancialAccountRecord[]> {
  const db = await getDatabase();

  await ensureFinancialAccountsForGroup(
    db,
    groupId,
  );

  return db.getAllAsync<FinancialAccountRecord>(
    `SELECT
      id,
      group_id,
      account_type,
      balance,
      created_at,
      updated_at
     FROM financial_accounts
     WHERE group_id = ?
     ORDER BY
       CASE account_type
         WHEN 'savings' THEN 1
         WHEN 'loan_fund' THEN 2
         WHEN 'loan_repayment' THEN 3
         WHEN 'social_fund' THEN 4
         WHEN 'fines' THEN 5
         WHEN 'external_fund' THEN 6
         WHEN 'expenditure_fund' THEN 7
         WHEN 'insurance_fund' THEN 8
         ELSE 99
       END`,
    groupId,
  );
}

export async function getFinancialAccount(
  groupId: number,
  accountType: FinancialAccountType,
): Promise<FinancialAccountRecord | null> {
  const db = await getDatabase();

  await ensureFinancialAccountsForGroup(
    db,
    groupId,
  );

  return db.getFirstAsync<FinancialAccountRecord>(
    `SELECT *
     FROM financial_accounts
     WHERE group_id = ?
     AND account_type = ?
     LIMIT 1`,
    groupId,
    accountType,
  );
}

/* ============================================================
   PASSBOOK HELPER
   ============================================================ */

async function addPassbookEntry(
  db: SQLite.SQLiteDatabase,
  groupId: number,
  memberId: number,
  meetingId: number | null,
  transactionId: number | null,
  entryType: string,
  amount: number,
  description: string,
): Promise<void> {
  const previous =
    await db.getFirstAsync<{
      balance: number;
    }>(
      `SELECT balance_after AS balance
       FROM member_passbook_records
       WHERE member_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      memberId,
    );

  const balanceAfter =
    (previous?.balance ?? 0) +
    amount;

  await db.runAsync(
    `INSERT INTO member_passbook_records (
      group_id,
      member_id,
      meeting_id,
      transaction_id,
      entry_type,
      amount,
      balance_after,
      description,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    groupId,
    memberId,
    meetingId,
    transactionId,
    entryType,
    amount,
    balanceAfter,
    description,
    now(),
  );
}

export async function getMemberPassbook(
  memberId: number,
): Promise<MemberPassbookRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<MemberPassbookRecord>(
    `SELECT *
     FROM member_passbook_records
     WHERE member_id = ?
     ORDER BY id ASC`,
    memberId,
  );
}

/* ============================================================
   FINANCIAL TRANSACTIONS
   ============================================================ */

export async function recordFinancialIncome(
  groupId: number,
  accountType: FinancialAccountType,
  amount: number,
  reason: string,
  memberId: number | null = null,
  meetingId: number | null = null,
  transactionType = 'income',
  collectionId: number | null = null,
): Promise<number> {
  const db = await getDatabase();

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      'Financial amount must be greater than zero.',
    );
  }

  if (!normalizeText(reason)) {
    throw new Error(
      'A reason is required for every financial transaction.',
    );
  }

  await ensureFinancialAccountsForGroup(
    db,
    groupId,
  );

  const timestamp = now();

  const result =
    await db.runAsync(
      `INSERT INTO financial_transactions (
        group_id,
        account_type,
        amount,
        reason,
        member_id,
        meeting_id,
        collection_id,
        transaction_type,
        reversed_transaction_id,
        reversed,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
      groupId,
      accountType,
      amount,
      normalizeText(reason),
      memberId,
      meetingId,
      collectionId,
      normalizeText(transactionType),
      timestamp,
    );

  const transactionId =
    result.lastInsertRowId;

  await db.runAsync(
    `UPDATE financial_accounts
     SET
       balance = balance + ?,
       updated_at = ?
     WHERE group_id = ?
     AND account_type = ?`,
    amount,
    timestamp,
    groupId,
    accountType,
  );

  if (memberId !== null) {
    await addPassbookEntry(
      db,
      groupId,
      memberId,
      meetingId,
      transactionId,
      transactionType,
      amount,
      reason,
    );
  }

  await recordGroupActivity(groupId);

  return transactionId;
}

export async function recordFinancialExpense(
  groupId: number,
  accountType: FinancialAccountType,
  amount: number,
  reason: string,
  memberId: number | null = null,
  meetingId: number | null = null,
  transactionType = 'expenditure',
  collectionId: number | null = null,
): Promise<number> {
  const db = await getDatabase();

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      'Expenditure amount must be greater than zero.',
    );
  }

  if (!normalizeText(reason)) {
    throw new Error(
      'A reason is required for every expenditure.',
    );
  }

  await ensureFinancialAccountsForGroup(
    db,
    groupId,
  );

  const negativeAmount =
    -Math.abs(amount);

  const timestamp = now();

  const result =
    await db.runAsync(
      `INSERT INTO financial_transactions (
        group_id,
        account_type,
        amount,
        reason,
        member_id,
        meeting_id,
        collection_id,
        transaction_type,
        reversed_transaction_id,
        reversed,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
      groupId,
      accountType,
      negativeAmount,
      normalizeText(reason),
      memberId,
      meetingId,
      collectionId,
      normalizeText(transactionType),
      timestamp,
    );

  const transactionId =
    result.lastInsertRowId;

  await db.runAsync(
    `UPDATE financial_accounts
     SET
       balance = balance + ?,
       updated_at = ?
     WHERE group_id = ?
     AND account_type = ?`,
    negativeAmount,
    timestamp,
    groupId,
    accountType,
  );

  if (memberId !== null) {
    await addPassbookEntry(
      db,
      groupId,
      memberId,
      meetingId,
      transactionId,
      transactionType,
      negativeAmount,
      reason,
    );
  }

  await recordGroupActivity(groupId);

  return transactionId;
}

/* ============================================================
   FINANCIAL COLLECTION
   ============================================================ */

export async function createFinancialCollection(
  groupId: number,
  memberId: number | null,
  meetingId: number | null,
  payments: Array<{
    accountType: FinancialAccountType;
    amount: number;
    reason?: string;
  }>,
): Promise<FinancialCollectionRecord> {
  const db = await getDatabase();

  if (payments.length === 0) {
    throw new Error(
      'At least one payment is required.',
    );
  }

  for (const payment of payments) {
    if (
      !isFinancialAccountType(
        payment.accountType,
      )
    ) {
      throw new Error(
        'Invalid financial account type.',
      );
    }

    if (
      !Number.isFinite(payment.amount) ||
      payment.amount <= 0
    ) {
      throw new Error(
        'Every payment amount must be greater than zero.',
      );
    }
  }

  const totalAmount =
    payments.reduce(
      (total, payment) =>
        total + payment.amount,
      0,
    );

  const confirmationCode =
    generateLocalId()
      .replace(/-/g, '')
      .slice(0, 10)
      .toUpperCase();

  const timestamp = now();

  const result =
    await db.runAsync(
      `INSERT INTO financial_collections (
        group_id,
        meeting_id,
        member_id,
        total_amount,
        status,
        confirmation_code,
        created_at
      )
      VALUES (?, ?, ?, ?, 'confirmed', ?, ?)`,
      groupId,
      meetingId,
      memberId,
      totalAmount,
      confirmationCode,
      timestamp,
    );

  const collectionId =
    result.lastInsertRowId;

  for (const payment of payments) {
    const reason =
      normalizeText(payment.reason) ||
      payment.accountType;

    const transactionId =
      await recordFinancialIncome(
        groupId,
        payment.accountType,
        payment.amount,
        reason,
        memberId,
        meetingId,
        payment.accountType === 'insurance_fund'
          ? 'insurance_contribution'
          : `${payment.accountType}_collection`,
        collectionId,
      );

    await db.runAsync(
      `INSERT INTO financial_collection_items (
        collection_id,
        account_type,
        amount,
        reason,
        transaction_id
      )
      VALUES (?, ?, ?, ?, ?)`,
      collectionId,
      payment.accountType,
      payment.amount,
      reason,
      transactionId,
    );
  }

  await db.runAsync(
    `UPDATE financial_collections
     SET confirmed_at = ?
     WHERE id = ?`,
    timestamp,
    collectionId,
  );

  const collection =
    await db.getFirstAsync<FinancialCollectionRecord>(
      `SELECT *
       FROM financial_collections
       WHERE id = ?`,
      collectionId,
    );

  if (!collection) {
    throw new Error(
      'Financial collection could not be loaded.',
    );
  }

  return collection;
}

export async function getFinancialCollection(
  collectionId: number,
): Promise<FinancialCollectionRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<FinancialCollectionRecord>(
    `SELECT *
     FROM financial_collections
     WHERE id = ?
     LIMIT 1`,
    collectionId,
  );
}

export async function getFinancialCollectionItems(
  collectionId: number,
): Promise<FinancialCollectionItem[]> {
  const db = await getDatabase();

  return db.getAllAsync<FinancialCollectionItem>(
    `SELECT *
     FROM financial_collection_items
     WHERE collection_id = ?
     ORDER BY id ASC`,
    collectionId,
  );
}

/* ============================================================
   BASIC FINANCIAL OPERATIONS
   ============================================================ */

export async function recordSavings(
  groupId: number,
  memberId: number,
  amount: number,
  meetingId: number | null = null,
): Promise<number> {
  const db = await getDatabase();

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Savings amount must be greater than zero.');
  }

  const member = await db.getFirstAsync<{
    id: number;
    status: string;
  }>(
    `SELECT id, status
     FROM members
     WHERE id = ?
     AND group_id = ?
     LIMIT 1`,
    memberId,
    groupId,
  );

  if (!member) {
    throw new Error('Member was not found in this group.');
  }

  if (member.status.toLowerCase() !== 'active') {
    throw new Error('Only an active member can save.');
  }

  /* Always attach savings to the currently open meeting when the
     savings screen does not pass a meeting id. This prevents savings
     from being recorded without a meeting reference. */
  let activeMeetingId = meetingId;

  if (activeMeetingId === null) {
    const openMeeting = await getOpenMeeting(groupId);
    activeMeetingId = openMeeting?.id ?? null;
  }

  if (activeMeetingId === null) {
    throw new Error('No open meeting is available for recording savings.');
  }

  const meeting = await db.getFirstAsync<{
    id: number;
    status: string;
    group_id: number;
  }>(
    `SELECT id, status, group_id
     FROM group_meetings
     WHERE id = ?
     AND group_id = ?
     LIMIT 1`,
    activeMeetingId,
    groupId,
  );

  if (!meeting || meeting.status !== 'open') {
    throw new Error('Savings can only be recorded during an open meeting.');
  }

  /*
   * Savings are independent of attendance. A member may save even when
   * marked absent. Roll call still starts the meeting and remains available
   * for fines, records and other meeting rules.
   */

  return recordFinancialIncome(
    groupId,
    'savings',
    amount,
    'Member savings contribution',
    memberId,
    activeMeetingId,
    'savings_contribution',
  );
}

export async function recordLoanFund(
  groupId: number,
  amount: number,
  reason: string,
  meetingId: number | null = null,
): Promise<number> {
  return recordFinancialIncome(
    groupId,
    'loan_fund',
    amount,
    reason,
    null,
    meetingId,
    'loan_fund',
  );
}

async function requireMemberPresentForLoan(
  db: SQLite.SQLiteDatabase,
  groupId: number,
  memberId: number,
  meetingId: number | null,
): Promise<void> {
  if (meetingId === null) {
    throw new Error('A meeting is required before a loan can be requested or issued.');
  }

  const meeting = await db.getFirstAsync<{
    id: number;
    group_id: number;
    status: string;
  }>(
    `SELECT id, group_id, status
     FROM group_meetings
     WHERE id = ?
     AND group_id = ?
     LIMIT 1`,
    meetingId,
    groupId,
  );

  if (!meeting || meeting.status !== 'open') {
    throw new Error('Loan requests can only be made during an open meeting.');
  }

  const attendance = await db.getFirstAsync<{
    attendance_status: string;
  }>(
    `SELECT attendance_status
     FROM meeting_attendance
     WHERE meeting_id = ?
     AND member_id = ?
     LIMIT 1`,
    meetingId,
    memberId,
  );

  if (!attendance || !['present', 'late'].includes(attendance.attendance_status.toLowerCase())) {
    throw new Error('A member must be present or late in roll call before requesting a loan.');
  }
}

export async function issueLoan(
  groupId: number,
  memberId: number,
  amount: number,
  reason = 'Loan issued to member',
  meetingId: number | null = null,
  dueDate: string | null = null,
): Promise<number> {
  const db = await getDatabase();

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      'Loan amount must be greater than zero.',
    );
  }

  await requireMemberPresentForLoan(
    db,
    groupId,
    memberId,
    meetingId,
  );

  const account =
    await getFinancialAccount(
      groupId,
      'loan_fund',
    );

  if (!account) {
    throw new Error(
      'Loan Fund account was not found.',
    );
  }

  if (account.balance < amount) {
    throw new Error(
      'Insufficient Loan Fund balance.',
    );
  }

  const setup =
    await getVSLASetupRules(groupId);

  const interestPercentage =
    setup &&
    Number.isFinite(
      setup.loan_interest_percentage,
    )
      ? setup.loan_interest_percentage
      : 5;

  const timestamp = now();

  const result =
    await db.runAsync(
      `INSERT INTO financial_transactions (
        group_id,
        account_type,
        amount,
        reason,
        member_id,
        meeting_id,
        transaction_type,
        created_at
      )
      VALUES (?, 'loan_fund', ?, ?, ?, ?, 'loan_issued', ?)`,
      groupId,
      -Math.abs(amount),
      normalizeText(reason),
      memberId,
      meetingId,
      timestamp,
    );

  const transactionId =
    result.lastInsertRowId;

  await db.runAsync(
    `UPDATE financial_accounts
     SET
       balance = balance - ?,
       updated_at = ?
     WHERE group_id = ?
       AND account_type = 'loan_fund'`,
    amount,
    timestamp,
    groupId,
  );

  await addPassbookEntry(
    db,
    groupId,
    memberId,
    meetingId,
    transactionId,
    'loan_issued',
    amount,
    reason,
  );

  /*
   * Charge the first month's interest immediately.
   */
  const issueDate = new Date(timestamp);

  const monthKey =
    `${issueDate.getFullYear()}-${String(
      issueDate.getMonth() + 1,
    ).padStart(2, '0')}`;

  const interest =
    amount *
    (interestPercentage / 100);

  if (interest > 0) {
    await db.runAsync(
      `INSERT OR IGNORE INTO loan_interest_charges (
        group_id,
        member_id,
        loan_month,
        opening_balance,
        interest_percentage,
        interest_amount,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      groupId,
      memberId,
      monthKey,
      amount,
      interestPercentage,
      interest,
      timestamp,
    );
  }

  if (dueDate) {
    await db.runAsync(
      `UPDATE loan_records
       SET due_date = ?
       WHERE member_id = ?
       AND status = 'active'`,
      dueDate,
      memberId,
    ).catch(() => {});
  }

  await recordGroupActivity(groupId);

  return transactionId;
}

export async function recordLoanRepayment(
  groupId: number,
  memberId: number,
  amount: number,
  meetingId: number | null = null,
  reason = 'Loan repayment',
): Promise<number> {
  const loan = await getMemberLoanBalance(
    groupId,
    memberId,
  );

  if (loan.balance <= 0) {
    throw new Error(
      'This member has no outstanding loan. Loan repayment cannot be recorded.',
    );
  }

  if (amount > loan.balance) {
    throw new Error(
      `Loan repayment cannot exceed the member's outstanding loan balance of ${loan.balance.toLocaleString()}.`,
    );
  }

  return recordFinancialIncome(
    groupId,
    'loan_repayment',
    amount,
    reason,
    memberId,
    meetingId,
    'loan_repayment',
  );
}

export async function getMemberLoanBalance(
  groupId: number,
  memberId: number,
): Promise<{
  principal: number;
  interest: number;
  balance: number;
}> {
  const db = await getDatabase();

  const issued = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(ABS(amount)), 0) AS total
     FROM financial_transactions
     WHERE group_id = ?
       AND member_id = ?
       AND account_type = 'loan_fund'
       AND transaction_type = 'loan_issued'
       AND reversed = 0`,
    groupId,
    memberId,
  );

  const repayments = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM financial_transactions
     WHERE group_id = ?
       AND member_id = ?
       AND account_type = 'loan_repayment'
       AND transaction_type = 'loan_repayment'
       AND reversed = 0`,
    groupId,
    memberId,
  );

  const interestCharges =
    await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(interest_amount), 0) AS total
       FROM loan_interest_charges
       WHERE group_id = ?
         AND member_id = ?`,
      groupId,
      memberId,
    );

  const principal = issued?.total ?? 0;
  const paid = repayments?.total ?? 0;
  const interest = interestCharges?.total ?? 0;

  const balance = Math.max(
    0,
    principal + interest - paid,
  );

  return {
    principal,
    interest,
    balance,
  };
  }

export async function recordSocialFund(
  groupId: number,
  amount: number,
  meetingId: number | null = null,
  memberId: number | null = null,
  reason = 'Social fund contribution',
): Promise<number> {
  return recordFinancialIncome(
    groupId,
    'social_fund',
    amount,
    reason,
    memberId,
    meetingId,
    'social_fund_contribution',
  );
}

export type MemberFineRecord = {
  id: number;
  group_id: number;
  member_id: number;
  meeting_id: number | null;
  fine_type: string;
  original_amount: number;
  amount_paid: number;
  outstanding_amount: number;
  created_at: string;
};

/**
 * Records a fine as a liability only. A recorded fine is NOT money received
 * by the group until the member actually pays it.
 */
export async function recordFine(
  groupId: number,
  amount: number,
  reason: string,
  memberId: number | null = null,
  meetingId: number | null = null,
): Promise<number> {
  if (memberId === null) {
    throw new Error(
      'A fine must be recorded against an individual member.',
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Fine amount must be greater than zero.');
  }

  const db = await getDatabase();

  const member = await db.getFirstAsync<{
    id: number;
    group_id: number;
    status: string;
  }>(
    `SELECT id, group_id, status
     FROM members
     WHERE id = ?
     LIMIT 1`,
    memberId,
  );

  if (!member || member.group_id !== groupId) {
    throw new Error(
      'The selected fine member does not belong to this group.',
    );
  }

  if (String(member.status).toLowerCase() !== 'active') {
    throw new Error(
      'A fine can only be recorded against an active member.',
    );
  }

  if (!normalizeText(reason)) {
    throw new Error('A fine type is required.');
  }

  const timestamp = now();

  const result = await db.runAsync(
    `INSERT INTO financial_transactions (
      group_id,
      account_type,
      amount,
      reason,
      member_id,
      meeting_id,
      collection_id,
      transaction_type,
      reversed_transaction_id,
      reversed,
      created_at
    )
    VALUES (?, 'fines', ?, ?, ?, ?, NULL, 'fine', NULL, 0, ?)`,
    groupId,
    amount,
    normalizeText(reason),
    memberId,
    meetingId,
    timestamp,
  );

  await recordGroupActivity(groupId);

  return result.lastInsertRowId;
}

/**
 * Returns every fine recorded for a member, including fines from previous
 * and current meetings. Payments are allocated FIFO across the member's
 * outstanding fines so each fine can display amount paid and outstanding.
 */
export async function getMemberFines(
  groupId: number,
  memberId: number,
): Promise<MemberFineRecord[]> {
  const db = await getDatabase();

  const fines = await db.getAllAsync<{
    id: number;
    group_id: number;
    member_id: number;
    meeting_id: number | null;
    amount: number;
    reason: string;
    created_at: string;
  }>(
    `SELECT id, group_id, member_id, meeting_id, amount, reason, created_at
     FROM financial_transactions
     WHERE group_id = ?
       AND member_id = ?
       AND account_type = 'fines'
       AND transaction_type = 'fine'
       AND reversed = 0
     ORDER BY id ASC`,
    groupId,
    memberId,
  );

  const payments = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM financial_transactions
     WHERE group_id = ?
       AND member_id = ?
       AND account_type = 'fines'
       AND transaction_type = 'fine_payment'
       AND reversed = 0`,
    groupId,
    memberId,
  );

  let remainingPayment = Math.max(0, Number(payments?.total) || 0);

  return fines.map((fine) => {
    const originalAmount = Math.max(0, Number(fine.amount) || 0);
    const amountPaid = Math.min(originalAmount, remainingPayment);
    remainingPayment = Math.max(0, remainingPayment - amountPaid);

    return {
      id: fine.id,
      group_id: fine.group_id,
      member_id: fine.member_id,
      meeting_id: fine.meeting_id,
      fine_type: fine.reason,
      original_amount: originalAmount,
      amount_paid: amountPaid,
      outstanding_amount: Math.max(0, originalAmount - amountPaid),
      created_at: fine.created_at,
    };
  });
}

export async function getMemberOutstandingFineTotal(
  groupId: number,
  memberId: number,
): Promise<number> {
  const fines = await getMemberFines(groupId, memberId);
  return fines.reduce((total, fine) => total + fine.outstanding_amount, 0);
}

/**
 * Records actual fine money received from the member. It can never exceed
 * the member's currently outstanding recorded fines.
 */
export async function recordFinePayment(
  groupId: number,
  memberId: number,
  amount: number,
  meetingId: number | null = null,
): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Fine payment must be greater than zero.');
  }

  const outstanding = await getMemberOutstandingFineTotal(
    groupId,
    memberId,
  );

  if (outstanding <= 0) {
    throw new Error('This member has no outstanding fine to pay.');
  }

  if (amount > outstanding) {
    throw new Error(
      `Fine payment cannot exceed the member's outstanding fine balance of ${outstanding.toLocaleString()}.`,
    );
  }

  return recordFinancialIncome(
    groupId,
    'fines',
    amount,
    'Fine payment',
    memberId,
    meetingId,
    'fine_payment',
  );
}

export async function recordExternalFund(
  groupId: number,
  amount: number,
  reason: string,
  meetingId: number | null = null,
): Promise<number> {
  return recordFinancialIncome(
    groupId,
    'external_fund',
    amount,
    reason,
    null,
    meetingId,
    'external_fund',
  );
}

export async function recordExpenditure(
  groupId: number,
  amount: number,
  reason: string,
  meetingId: number | null = null,
): Promise<number> {
  return recordFinancialExpense(
    groupId,
    'expenditure_fund',
    amount,
    reason,
    null,
    meetingId,
    'expenditure',
  );
}

export async function recordInsuranceContribution(
  groupId: number,
  memberId: number,
  amount: number,
  meetingId: number | null = null,
): Promise<number> {
  return recordFinancialIncome(
    groupId,
    'insurance_fund',
    amount,
    'Insurance contribution',
    memberId,
    meetingId,
    'insurance_contribution',
  );
}

export async function recordInsuranceBenefit(
  groupId: number,
  memberId: number,
  amount: number,
  reason: string,
  meetingId: number | null = null,
): Promise<number> {
  const db = await getDatabase();

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      'Insurance benefit amount must be greater than zero.',
    );
  }

  if (!normalizeText(reason)) {
    throw new Error(
      'A reason is required for every insurance benefit.',
    );
  }

  const member = await db.getFirstAsync<{ status: string }>(
    `SELECT status FROM members WHERE id = ? LIMIT 1`,
    memberId,
  );

  if (!member || String(member.status).toLowerCase() !== 'active') {
    throw new Error(
      'Insurance benefits are available only to active members.',
    );
  }

  const contribution =
    await db.getFirstAsync<{
      total: number;
    }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM financial_transactions
       WHERE group_id = ?
       AND account_type = 'insurance_fund'
       AND member_id = ?
       AND transaction_type = 'insurance_contribution'
       AND reversed = 0`,
      groupId,
      memberId,
    );

  if (
    !contribution ||
    contribution.total <= 0
  ) {
    throw new Error(
      'This member is not insured and cannot receive an insurance benefit.',
    );
  }

  const insuranceAccount =
    await getFinancialAccount(
      groupId,
      'insurance_fund',
    );

  if (!insuranceAccount) {
    throw new Error(
      'Insurance Fund account was not found.',
    );
  }

  if (insuranceAccount.balance < amount) {
    throw new Error(
      'Insufficient Insurance Fund balance.',
    );
  }

  return recordFinancialExpense(
    groupId,
    'insurance_fund',
    amount,
    reason,
    memberId,
    meetingId,
    'insurance_benefit',
  );
}

/* ============================================================
   TRANSACTION REVERSAL
   ============================================================ */

export async function reverseFinancialTransaction(
  transactionId: number,
  reason: string,
  reversedByMemberId: number | null = null,
): Promise<number> {
  const db = await getDatabase();

  if (!normalizeText(reason)) {
    throw new Error(
      'A reason is required to reverse a transaction.',
    );
  }

  const original =
    await db.getFirstAsync<FinancialTransactionRecord>(
      `SELECT *
       FROM financial_transactions
       WHERE id = ?
       LIMIT 1`,
      transactionId,
    );

  if (!original) {
    throw new Error(
      'Financial transaction not found.',
    );
  }

  if (original.reversed === 1) {
    throw new Error(
      'This transaction has already been reversed.',
    );
  }

  const existing =
    await db.getFirstAsync<{ id: number }>(
      `SELECT id
       FROM financial_transaction_reversals
       WHERE original_transaction_id = ?
       LIMIT 1`,
      transactionId,
    );

  if (existing) {
    throw new Error(
      'This transaction already has a reversal.',
    );
  }

  const timestamp = now();

  const reversal =
    await db.runAsync(
      `INSERT INTO financial_transactions (
        group_id,
        account_type,
        amount,
        reason,
        member_id,
        meeting_id,
        collection_id,
        transaction_type,
        reversed_transaction_id,
        reversed,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'reversal', ?, 0, ?)`,
      original.group_id,
      original.account_type,
      -original.amount,
      normalizeText(reason),
      original.member_id,
      original.meeting_id,
      original.collection_id ?? null,
      transactionId,
      timestamp,
    );

  const reversalId =
    reversal.lastInsertRowId;

  await db.runAsync(
    `UPDATE financial_accounts
     SET
       balance = balance + ?,
       updated_at = ?
     WHERE group_id = ?
     AND account_type = ?`,
    -original.amount,
    timestamp,
    original.group_id,
    original.account_type,
  );

  await db.runAsync(
    `UPDATE financial_transactions
     SET reversed = 1
     WHERE id = ?`,
    transactionId,
  );

  await db.runAsync(
    `INSERT INTO financial_transaction_reversals (
      original_transaction_id,
      reversal_transaction_id,
      reason,
      reversed_by,
      created_at
    )
    VALUES (?, ?, ?, ?, ?)`,
    transactionId,
    reversalId,
    normalizeText(reason),
    reversedByMemberId,
    timestamp,
  );

  if (original.member_id !== null) {
    await addPassbookEntry(
      db,
      original.group_id,
      original.member_id,
      original.meeting_id,
      reversalId,
      'reversal',
      -original.amount,
      reason,
    );
  }

  await recordGroupActivity(
    original.group_id,
  );

  return reversalId;
}

export async function undoFinancialTransaction(
  transactionId: number,
  reversedByMemberId: number | null = null,
  reason = 'Transaction undone',
): Promise<number> {
  return reverseFinancialTransaction(transactionId, reason, reversedByMemberId);
}

export async function getUndoableMeetingTransactions(
  meetingId: number,
): Promise<FinancialTransactionRecord[]> {
  const db = await getDatabase();
  return db.getAllAsync<FinancialTransactionRecord>(
    `SELECT * FROM financial_transactions
     WHERE meeting_id = ? AND reversed = 0
     AND transaction_type <> 'reversal'
     ORDER BY id DESC`,
    meetingId,
  );
}

/* ============================================================
   FINANCIAL SUMMARY / TRANSACTIONS
   ============================================================ */

export async function getMeetingTransactionSummary(
  meetingId: number,
): Promise<MeetingTransactionSummary> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<{
    account_type: string;
    transaction_type: string;
    amount: number;
    member_id: number | null;
  }>(
    `SELECT
       account_type,
       transaction_type,
       amount,
       member_id
     FROM financial_transactions
     WHERE meeting_id = ?
       AND reversed = 0`,
    meetingId,
  );

  let savings = 0;
  let fines = 0;
  let loanRepayment = 0;
  let socialFund = 0;
  let miscellaneousExpense = 0;
  let insuranceFund = 0;

  for (const row of rows) {
    const amount = Number(row.amount) || 0;

    if (row.account_type === 'savings') {
      savings += amount;
    }

    if (
      row.account_type === 'fines' &&
      row.member_id !== null &&
      row.transaction_type === 'fine_payment'
    ) {
      fines += amount;
    }

    if (
      row.account_type === 'loan_repayment' &&
      row.transaction_type === 'loan_repayment'
    ) {
      loanRepayment += amount;
    }

    if (row.account_type === 'social_fund') {
      socialFund += amount;
    }

    if (
      row.account_type === 'expenditure_fund' &&
      row.transaction_type === 'expenditure'
    ) {
      miscellaneousExpense += Math.abs(amount);
    }

    if (row.account_type === 'insurance_fund') {
      insuranceFund += amount;
    }
  }

  return {
    savings,
    fines,
    loanRepayment,
    socialFund,
    miscellaneousExpense,
    loanFund: Math.max(
      0,
      savings +
        fines +
        loanRepayment +
        socialFund -
        miscellaneousExpense,
    ),
    insuranceFund,
    transactionCount: rows.length,
  };
}

async function recalculateFinancialAccountsForGroup(
  db: SQLite.SQLiteDatabase,
  groupId: number,
): Promise<void> {
  await ensureFinancialAccountsForGroup(db, groupId);

  const totals = await db.getAllAsync<{
    account_type: string;
    transaction_type: string;
    total: number;
  }>(
    `SELECT account_type, transaction_type, COALESCE(SUM(amount), 0) AS total
     FROM financial_transactions
     WHERE group_id = ? AND reversed = 0
     GROUP BY account_type, transaction_type`,
    groupId,
  );

  const balances: Record<FinancialAccountType, number> = {
    savings: 0,
    loan_fund: 0,
    loan_repayment: 0,
    social_fund: 0,
    fines: 0,
    external_fund: 0,
    expenditure_fund: 0,
    insurance_fund: 0,
  };

  for (const row of totals) {
    const value = Number(row.total) || 0;
    if (row.account_type === 'savings') balances.savings += value;
    if (row.account_type === 'loan_repayment') balances.loan_repayment += value;
    if (row.account_type === 'social_fund') balances.social_fund += value;
    if (row.account_type === 'fines') balances.fines += value;
    if (row.account_type === 'external_fund') balances.external_fund += value;
    if (row.account_type === 'expenditure_fund') balances.expenditure_fund += value;
    if (row.account_type === 'insurance_fund') balances.insurance_fund += value;
    if (row.account_type === 'loan_fund' && row.transaction_type !== 'loan_issued') balances.loan_fund += value;
  }

  // The Group Loan Fund is the cash pool available for lending:
  // savings + fines + social fund + external/direct loan-fund income
  // + repayments - loans issued - expenditures.
  const issued = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(ABS(amount)), 0) AS total
     FROM financial_transactions
     WHERE group_id = ? AND account_type = 'loan_fund'
       AND transaction_type = 'loan_issued' AND reversed = 0`,
    groupId,
  );
  const issuedAmount = Number(issued?.total) || 0;

  balances.loan_fund = Math.max(
    0,
    balances.savings +
      balances.fines +
      balances.social_fund +
      balances.external_fund +
      balances.loan_fund +
      balances.loan_repayment -
      issuedAmount +
      balances.expenditure_fund,
  );

  const timestamp = now();
  for (const accountType of FINANCIAL_ACCOUNT_TYPES) {
    await db.runAsync(
      `UPDATE financial_accounts
       SET balance = ?, updated_at = ?
       WHERE group_id = ? AND account_type = ?`,
      balances[accountType], timestamp, groupId, accountType,
    );
  }
}

export async function getFinancialSummary(
  groupId: number,
): Promise<FinancialSummary> {
  const db = await getDatabase();

  await recalculateFinancialAccountsForGroup(db, groupId);

  const rows =
    await db.getAllAsync<{
      account_type: string;
      balance: number;
    }>(
      `SELECT account_type, balance
       FROM financial_accounts
       WHERE group_id = ?`,
      groupId,
    );

  const balances: Record<
    FinancialAccountType,
    number
  > = {
    savings: 0,
    loan_fund: 0,
    loan_repayment: 0,
    social_fund: 0,
    fines: 0,
    external_fund: 0,
    expenditure_fund: 0,
    insurance_fund: 0,
  };

  for (const row of rows) {
    if (
      isFinancialAccountType(
        row.account_type,
      )
    ) {
      balances[row.account_type] =
        Number(row.balance) || 0;
    }
  }

  const partial = {
    savings: balances.savings,
    loanFund: balances.loan_fund,
    loanRepayment: balances.loan_repayment,
    socialFund: balances.social_fund,
    fines: balances.fines,
    externalFund: balances.external_fund,
    expenditureFund: balances.expenditure_fund,
    insuranceFund: balances.insurance_fund,
  };

  return {
    ...partial,
    fundBalance:
      calculateFundBalance(partial),
  };
}

export async function getFinancialTransactions(
  groupId: number,
): Promise<FinancialTransactionRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<FinancialTransactionRecord>(
    `SELECT *
     FROM financial_transactions
     WHERE group_id = ?
     ORDER BY created_at DESC, id DESC`,
    groupId,
  );
}

export async function getFinancialTransactionsByAccount(
  groupId: number,
  accountType: string,
): Promise<FinancialTransactionRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<FinancialTransactionRecord>(
    `SELECT *
     FROM financial_transactions
     WHERE group_id = ?
     AND account_type = ?
     ORDER BY created_at DESC, id DESC`,
    groupId,
    accountType,
  );
}

/* ============================================================
   RECEIPTS
   ============================================================ */

export async function createReceipt(
  groupId: number,
  memberId: number | null,
  meetingId: number | null,
  collectionId: number | null,
  transactionId: number | null,
  amount: number,
  description: string,
): Promise<ReceiptRecord> {
  const db = await getDatabase();

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      'Receipt amount must be greater than zero.',
    );
  }

  if (!normalizeText(description)) {
    throw new Error(
      'Receipt description is required.',
    );
  }

  const receiptNumber =
    `KYA-R-${Date.now()}-${Math.floor(
      Math.random() * 1000,
    )}`;

  const result =
    await db.runAsync(
      `INSERT INTO receipts (
        group_id,
        member_id,
        meeting_id,
        collection_id,
        transaction_id,
        receipt_number,
        amount,
        description,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      groupId,
      memberId,
      meetingId,
      collectionId,
      transactionId,
      receiptNumber,
      amount,
      normalizeText(description),
      now(),
    );

  const receipt =
    await db.getFirstAsync<ReceiptRecord>(
      `SELECT *
       FROM receipts
       WHERE id = ?`,
      result.lastInsertRowId,
    );

  if (!receipt) {
    throw new Error(
      'Receipt could not be created.',
    );
  }

  return receipt;
}

export async function getReceipt(
  receiptId: number,
): Promise<ReceiptRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<ReceiptRecord>(
    `SELECT *
     FROM receipts
     WHERE id = ?
     LIMIT 1`,
    receiptId,
  );
}

/* ============================================================
   NOTIFICATIONS / FALLBACK
   ============================================================ */

export async function queueNotification(
  groupId: number,
  memberId: number | null,
  notificationType: string,
  title: string,
  message: string,
  priority = 'normal',
): Promise<number> {
  const db = await getDatabase();

  const result =
    await db.runAsync(
      `INSERT INTO notification_queue (
        group_id,
        member_id,
        notification_type,
        priority,
        title,
        message,
        created_at,
        status,
        attempts,
        fallback_used
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0)`,
      groupId,
      memberId,
      notificationType,
      priority,
      normalizeText(title),
      normalizeText(message),
      now(),
    );

  return result.lastInsertRowId;
}

export async function markNotificationDelivered(
  notificationId: number,
  channel: string,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO notification_delivery (
      notification_id,
      channel,
      delivered_at,
      status
    )
    VALUES (?, ?, ?, 'delivered')`,
    notificationId,
    channel,
    now(),
  );

  await db.runAsync(
    `UPDATE notification_queue
     SET status = 'delivered'
     WHERE id = ?`,
    notificationId,
  );
}

export async function markNotificationFailed(
  notificationId: number,
  channel: string,
  errorMessage = '',
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO notification_delivery (
      notification_id,
      channel,
      delivered_at,
      status,
      error_message
    )
    VALUES (?, ?, NULL, 'failed', ?)`,
    notificationId,
    channel,
    errorMessage,
  );

  await db.runAsync(
    `UPDATE notification_queue
     SET
       attempts = attempts + 1,
       last_attempt_at = ?,
       status = 'fallback'
     WHERE id = ?`,
    now(),
    notificationId,
  );

  await db.runAsync(
    `UPDATE notification_queue
     SET fallback_used = 1
     WHERE id = ?`,
    notificationId,
  );
}

export async function getPendingNotifications(
  groupId: number,
): Promise<any[]> {
  const db = await getDatabase();

  return db.getAllAsync(
    `SELECT *
     FROM notification_queue
     WHERE group_id = ?
     AND status IN ('pending', 'fallback')
     ORDER BY
       CASE priority
         WHEN 'high' THEN 1
         WHEN 'normal' THEN 2
         ELSE 3
       END,
       id ASC`,
    groupId,
  );
}

/* ============================================================
   MEETING HELPERS
   ============================================================ */

async function getNextMeetingNumber(
  db: SQLite.SQLiteDatabase,
  groupId: number,
): Promise<number> {
  const row =
    await db.getFirstAsync<{
      maximum: number | null;
    }>(
      `SELECT MAX(meeting_number) AS maximum
       FROM group_meetings
       WHERE group_id = ?`,
      groupId,
    );

  return (row?.maximum ?? 0) + 1;
}

async function getCycleNumberForMeeting(
  db: SQLite.SQLiteDatabase,
  groupId: number,
  meetingNumber: number,
): Promise<number> {
  const rules =
    await getVSLASetupRules(groupId);

  const meetingsPerCycle =
    Math.max(
      1,
      rules?.meeting_frequency
        ?.toLowerCase()
        .includes('monthly')
        ? 12
        : rules?.meeting_frequency
            ?.toLowerCase()
            .includes('weekly')
          ? 52
          : 1,
    );

  return (
    Math.floor(
      (meetingNumber - 1) /
        meetingsPerCycle,
    ) + 1
  );
}

async function addMeetingAudit(
  db: SQLite.SQLiteDatabase,
  groupId: number,
  meetingId: number,
  meetingNumber: number,
  cycleNumber: number,
  action: string,
  actorMemberId: number | null,
  details = '',
): Promise<void> {
  await db.runAsync(
    `INSERT INTO meeting_audit_records (
      group_id,
      cycle_number,
      meeting_id,
      meeting_number,
      action,
      actor_member_id,
      details,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    groupId,
    cycleNumber,
    meetingId,
    meetingNumber,
    action,
    actorMemberId,
    normalizeText(details),
    now(),
  );
}

/* ============================================================
   MEETINGS
   ============================================================ */

export async function getOpenMeeting(
  groupId: number,
): Promise<GroupMeetingRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<GroupMeetingRecord>(
    `SELECT *
     FROM group_meetings
     WHERE group_id = ?
     AND status = 'open'
     ORDER BY meeting_number DESC
     LIMIT 1`,
    groupId,
  );
}

export async function getLastConcludedMeeting(
  groupId: number,
): Promise<GroupMeetingRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<GroupMeetingRecord>(
    `SELECT *
     FROM group_meetings
     WHERE group_id = ?
     AND status = 'closed'
     ORDER BY meeting_number DESC
     LIMIT 1`,
    groupId,
  );
}

export async function getMeetingByNumber(
  groupId: number,
  meetingNumber: number,
): Promise<GroupMeetingRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<GroupMeetingRecord>(
    `SELECT *
     FROM group_meetings
     WHERE group_id = ?
     AND meeting_number = ?
     LIMIT 1`,
    groupId,
    meetingNumber,
  );
}

export async function getMeetingSummary(
  meetingId: number,
): Promise<MeetingSummaryRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<MeetingSummaryRecord>(
    `SELECT
      gm.id AS meeting_id,
      gm.meeting_number,
      gm.cycle_number,
      gm.meeting_date,
      gm.opened_at,
      gm.closed_at,
      gm.status,
      COALESCE(mc.total_savings, 0)
        AS total_savings,
      COALESCE(mc.loan_fund, 0)
        AS loan_fund,
      COALESCE(mc.group_fund, 0)
        AS group_fund,
      COALESCE(mc.insurance_fund, 0)
        AS insurance_fund,
      gm.summary_approved
     FROM group_meetings gm
     LEFT JOIN meeting_closures mc
       ON mc.meeting_id = gm.id
     WHERE gm.id = ?
     ORDER BY mc.id DESC
     LIMIT 1`,
    meetingId,
  );
}

/* ============================================================
   PREVIOUS MEETING REVIEW
   ============================================================ */

export async function getPreviousMeetingReviewMode(
  groupId: number,
): Promise<{
  meeting: GroupMeetingRecord | null;
  mode: 'none' | 'read_only' | 'read_edit';
}> {
  const db = await getDatabase();

  const meeting =
    await getLastConcludedMeeting(groupId);

  if (!meeting) {
    return {
      meeting: null,
      mode: 'none',
    };
  }

  return {
    meeting,
    mode:
      meeting.previous_meeting_editable === 1
        ? 'read_edit'
        : 'read_only',
  };
}

export async function markPreviousMeetingReviewed(
  meetingId: number,
  editable = true,
): Promise<void> {
  const db = await getDatabase();

  const meeting =
    await db.getFirstAsync<GroupMeetingRecord>(
      `SELECT *
       FROM group_meetings
       WHERE id = ?
       LIMIT 1`,
      meetingId,
    );

  if (!meeting) {
    throw new Error('Meeting not found.');
  }

  if (meeting.status !== 'closed') {
    throw new Error(
      'Only a concluded meeting can be reviewed.',
    );
  }

  await db.runAsync(
    `UPDATE group_meetings
     SET
       previous_meeting_reviewed = 1,
       previous_meeting_editable = ?
     WHERE id = ?`,
    editable ? 1 : 0,
    meetingId,
  );
}

export async function lockPreviousMeetingForNewMeeting(
  meetingId: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE group_meetings
     SET
       previous_meeting_editable = 0
     WHERE id = ?
     AND status = 'closed'`,
    meetingId,
  );
}

/* ============================================================
   APPROVE MEETING SUMMARY
   ============================================================ */

export async function approveMeetingSummary(
  meetingId: number,
  executiveMemberId: number,
): Promise<void> {
  const db = await getDatabase();

  const meeting =
    await db.getFirstAsync<GroupMeetingRecord>(
      `SELECT *
       FROM group_meetings
       WHERE id = ?
       LIMIT 1`,
      meetingId,
    );

  if (!meeting) {
    throw new Error('Meeting not found.');
  }

  if (meeting.status !== 'closed') {
    throw new Error(
      'Only a concluded meeting can have its summary approved.',
    );
  }

  const executive =
    await db.getFirstAsync<{
      id: number;
      role: string;
      status: string;
    }>(
      `SELECT id, role, status
       FROM members
       WHERE id = ?
       AND group_id = ?
       LIMIT 1`,
      executiveMemberId,
      meeting.group_id,
    );

  if (!executive) {
    throw new Error(
      'Executive member was not found in this group.',
    );
  }

  if (
    executive.status !== 'active' ||
    executive.role.toLowerCase() !==
      'executive'
  ) {
    throw new Error(
      'Only an active executive can approve the meeting summary.',
    );
  }

  const timestamp = now();

  await db.runAsync(
    `UPDATE group_meetings
     SET
       summary_approved = 1,
       summary_approved_by = ?,
       summary_approved_at = ?
     WHERE id = ?`,
    executiveMemberId,
    timestamp,
    meetingId,
  );

  await addMeetingAudit(
    db,
    meeting.group_id,
    meeting.id,
    meeting.meeting_number,
    meeting.cycle_number,
    'summary_approved',
    executiveMemberId,
  );
}

/* ============================================================
   MEETING ROLL CALL / ATTENDANCE
   ============================================================ */

export type MeetingAttendanceRecord = {
  id: number;
  meeting_id: number;
  group_id: number;
  member_id: number;
  member_number: string;
  full_name: string;
  attendance_status: string;
  marked_at: string | null;
  marked_by: number | null;
  notes: string;
};

async function initializeMeetingRollCall(
  db: SQLite.SQLiteDatabase,
  groupId: number,
  meetingId: number,
): Promise<void> {
  const members = await db.getAllAsync<{ id: number }>(
    `SELECT id
     FROM members
     WHERE group_id = ?
     AND status = 'active'
     ORDER BY id ASC`,
    groupId,
  );

  for (const member of members) {
    await db.runAsync(
      `INSERT OR IGNORE INTO meeting_attendance (
        meeting_id, group_id, member_id, attendance_status, marked_at, marked_by, notes
      )
      VALUES (?, ?, ?, 'pending', NULL, NULL, '')`,
      meetingId,
      groupId,
      member.id,
    );
  }
}

export async function getMeetingRollCall(
  meetingId: number,
): Promise<MeetingAttendanceRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<MeetingAttendanceRecord>(
    `SELECT
       a.id,
       a.meeting_id,
       a.group_id,
       a.member_id,
       m.member_number,
       m.full_name,
       a.attendance_status,
       a.marked_at,
       a.marked_by,
       a.notes
     FROM meeting_attendance a
     INNER JOIN members m ON m.id = a.member_id
     WHERE a.meeting_id = ?
     ORDER BY m.full_name COLLATE NOCASE ASC`,
    meetingId,
  );
}

export async function recordMeetingAttendance(
  meetingId: number,
  memberId: number,
  attendanceStatus: 'present' | 'late' | 'absent',
  markedBy: number | null = null,
  notes = '',
): Promise<void> {
  const db = await getDatabase();
  const status = attendanceStatus.toLowerCase();

  if (!['present', 'late', 'absent'].includes(status)) {
    throw new Error('Invalid attendance status.');
  }

  const meeting = await db.getFirstAsync<{
    id: number;
    group_id: number;
    status: string;
  }>(
    `SELECT id, group_id, status
     FROM group_meetings
     WHERE id = ?
     LIMIT 1`,
    meetingId,
  );

  if (!meeting) {
    throw new Error('Meeting not found.');
  }

  if (meeting.status !== 'open') {
    throw new Error('Roll call can only be changed while the meeting is open.');
  }

  const member = await db.getFirstAsync<{ id: number }>(
    `SELECT id
     FROM members
     WHERE id = ?
     AND group_id = ?
     AND status = 'active'
     LIMIT 1`,
    memberId,
    meeting.group_id,
  );

  if (!member) {
    throw new Error('Active member was not found in this group.');
  }

  await db.runAsync(
    `INSERT INTO meeting_attendance (
      meeting_id, group_id, member_id, attendance_status, marked_at, marked_by, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(meeting_id, member_id) DO UPDATE SET
      attendance_status = excluded.attendance_status,
      marked_at = excluded.marked_at,
      marked_by = excluded.marked_by,
      notes = excluded.notes`,
    meetingId,
    meeting.group_id,
    memberId,
    status,
    now(),
    markedBy,
    normalizeText(notes),
  );
}

export async function isMeetingRollCallComplete(
  meetingId: number,
): Promise<boolean> {
  const db = await getDatabase();

  const pending = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM meeting_attendance
     WHERE meeting_id = ?
     AND attendance_status = 'pending'`,
    meetingId,
  );

  return (pending?.count ?? 0) === 0;
}

/* ============================================================
   START NEW MEETING
   ============================================================ */

export async function startNewMeeting(
  groupId: number,
  executiveMemberId: number,
): Promise<number> {
  const db = await getDatabase();

  const group =
    await getGroupById(groupId);

  if (!group) {
    throw new Error('Group not found.');
  }

  /*
   * Resolve the executive from the member record. Older databases
   * may have the executive role stored in assigned_roles or
   * is_super_user without the legacy role column being updated.
   * Accept all three representations so existing groups can start
   * meetings without losing their executive assignments.
   */
  let executive =
    await db.getFirstAsync<{
      id: number;
      role: string | null;
      status: string;
      is_super_user: number;
      assigned_roles: string;
    }>(
      `SELECT
        id,
        role,
        status,
        is_super_user,
        assigned_roles
       FROM members
       WHERE id = ?
       AND group_id = ?
       LIMIT 1`,
      executiveMemberId,
      groupId,
    );

  if (!executive) {
    /* If the screen did not pass an executive id, find one safely. */
    executive =
      await db.getFirstAsync<{
        id: number;
        role: string | null;
        status: string;
        is_super_user: number;
        assigned_roles: string;
      }>(
        `SELECT
          id,
          role,
          status,
          is_super_user,
          assigned_roles
         FROM members
         WHERE group_id = ?
         AND LOWER(TRIM(status)) = 'active'
         AND (
           LOWER(TRIM(COALESCE(role, ''))) = 'executive'
           OR COALESCE(is_super_user, 0) = 1
           OR LOWER(TRIM(COALESCE(assigned_roles, ''))) IN (
             'chairperson', 'chair', 'vice chair', 'vice chairperson',
             'secretary', 'treasurer', 'money counter', 'money counters',
             'key keeper', 'key keepers', 'supervisor'
           )
         )
         ORDER BY id ASC
         LIMIT 1`,
        groupId,
      );
  }

  if (!executive) {
    throw new Error(
      'No active executive member is assigned to this group.',
    );
  }

  const executiveRoles =
    (executive.assigned_roles || '')
      .split(',')
      .map((role) => normalizeText(role).toLowerCase())
      .filter(Boolean);

  const isExecutive =
    executive.status.trim().toLowerCase() === 'active' &&
    (
      (executive.role || '').trim().toLowerCase() === 'executive' ||
      Number(executive.is_super_user) === 1 ||
      executiveRoles.length > 0
    );

  if (!isExecutive) {
    throw new Error(
      'Only an active executive can start a meeting.',
    );
  }

  /* Keep the legacy role field synchronized for future screens. */
  if ((executive.role || '').trim().toLowerCase() !== 'executive') {
    await db.runAsync(
      `UPDATE members
       SET role = 'executive'
       WHERE id = ?`,
      executive.id,
    );
  }

  /* Use the actual resolved executive id for the audit record. */
  executiveMemberId = executive.id;

  const openMeeting =
    await getOpenMeeting(groupId);

  if (openMeeting) {
    throw new Error(
      'A meeting is already open for this group.',
    );
  }

  const previousMeeting =
    await getLastConcludedMeeting(groupId);

  if (
    previousMeeting &&
    previousMeeting.summary_approved !== 1
  ) {
    throw new Error(
      'The previous meeting summary must be approved before a new meeting can start.',
    );
  }

  /*
   * The old meeting becomes permanently read-only once
   * the new meeting starts.
   */
  if (previousMeeting) {
    await lockPreviousMeetingForNewMeeting(
      previousMeeting.id,
    );
  }

  const meetingNumber =
    await getNextMeetingNumber(
      db,
      groupId,
    );

  const cycleNumber =
    await getCycleNumberForMeeting(
      db,
      groupId,
      meetingNumber,
    );

  const loanFund =
    await getFinancialAccount(
      groupId,
      'loan_fund',
    );

  const insuranceFund =
    await getFinancialAccount(
      groupId,
      'insurance_fund',
    );

  const timestamp = now();

  const result =
    await db.runAsync(
      `INSERT INTO group_meetings (
        group_id,
        meeting_number,
        cycle_number,
        meeting_date,
        opened_at,
        closed_at,
        status,
        created_at,
        summary_approved,
        previous_meeting_reviewed,
        previous_meeting_editable,
        loan_fund_at_start,
        insurance_fund_at_start
      )
      VALUES (?, ?, ?, ?, ?, NULL, 'open', ?, 0, ?, 0, ?, ?)`,
      groupId,
      meetingNumber,
      cycleNumber,
      timestamp,
      timestamp,
      timestamp,
      previousMeeting ? 1 : 0,
      loanFund?.balance ?? 0,
      insuranceFund?.balance ?? 0,
    );

  const meetingId =
    result.lastInsertRowId;

  /* Every meeting opens with a roll call. */
  await initializeMeetingRollCall(
    db,
    groupId,
    meetingId,
  );

  await recordGroupActivity(groupId);

  await addMeetingAudit(
    db,
    groupId,
    meetingId,
    meetingNumber,
    cycleNumber,
    'meeting_started',
    executiveMemberId,
    `Loan Fund at start: ${loanFund?.balance ?? 0}; Insurance Fund at start: ${insuranceFund?.balance ?? 0}`,
  );

  /*
   * Pre-App authorization is intentionally NOT repeated here.
   * The existing app-access authorization remains a separate
   * process and is not part of starting every meeting.
   */

  return meetingId;
}

/* ============================================================
   MEETING FUND SNAPSHOT
   ============================================================ */

export async function getMeetingStartingFunds(
  meetingId: number,
): Promise<{
  loanFund: number;
  insuranceFund: number;
}> {
  const db = await getDatabase();

  const meeting =
    await db.getFirstAsync<{
      loan_fund_at_start: number;
      insurance_fund_at_start: number;
    }>(
      `SELECT
        loan_fund_at_start,
        insurance_fund_at_start
       FROM group_meetings
       WHERE id = ?
       LIMIT 1`,
      meetingId,
    );

  if (!meeting) {
    throw new Error('Meeting not found.');
  }

  return {
    loanFund:
      Number(
        meeting.loan_fund_at_start,
      ) || 0,
    insuranceFund:
      Number(
        meeting.insurance_fund_at_start,
      ) || 0,
  };
}

/* ============================================================
   MEMBER INDIVIDUAL STATEMENTS
   ============================================================ */

export async function createMemberStatement(
  meetingId: number,
  memberId: number,
  totalSavings: number,
  loanBalance: number,
  loanDueDate: string | null,
): Promise<number> {
  const db = await getDatabase();

  const meeting =
    await db.getFirstAsync<{
      id: number;
      group_id: number;
    }>(
      `SELECT id, group_id
       FROM group_meetings
       WHERE id = ?
       LIMIT 1`,
      meetingId,
    );

  if (!meeting) {
    throw new Error('Meeting not found.');
  }

  const existing =
    await db.getFirstAsync<{
      id: number;
    }>(
      `SELECT id
       FROM member_statement_records
       WHERE meeting_id = ?
       AND member_id = ?
       LIMIT 1`,
      meetingId,
      memberId,
    );

  if (existing) {
    await db.runAsync(
      `UPDATE member_statement_records
       SET
         individual_total_savings = ?,
         individual_loan_balance = ?,
         individual_loan_due_date = ?,
         created_at = ?
       WHERE id = ?`,
      totalSavings,
      loanBalance,
      loanDueDate,
      now(),
      existing.id,
    );

    return existing.id;
  }

  const result =
    await db.runAsync(
      `INSERT INTO member_statement_records (
        meeting_id,
        member_id,
        individual_total_savings,
        individual_loan_balance,
        individual_loan_due_date,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)`,
      meetingId,
      memberId,
      totalSavings,
      loanBalance,
      loanDueDate,
      now(),
    );

  return result.lastInsertRowId;
}

export async function getMemberStatement(
  meetingId: number,
  memberId: number,
): Promise<MemberStatementRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<MemberStatementRecord>(
    `SELECT *
     FROM member_statement_records
     WHERE meeting_id = ?
     AND member_id = ?
     LIMIT 1`,
    meetingId,
    memberId,
  );
}

export async function getMeetingMemberStatements(
  meetingId: number,
): Promise<MemberStatementRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<MemberStatementRecord>(
    `SELECT *
     FROM member_statement_records
     WHERE meeting_id = ?
     ORDER BY member_id ASC`,
    meetingId,
  );
}

/* ============================================================
   MEETING CLOSURE
   ============================================================ */

export async function getMeetingCashReconciliation(
  meetingId: number,
  cashAtHand: number,
): Promise<{
  expectedCash: number;
  cashAtHand: number;
  difference: number;
  balanced: boolean;
}> {
  if (!Number.isFinite(cashAtHand) || cashAtHand < 0) {
    throw new Error('Cash at hand must be zero or greater.');
  }
  const db = await getDatabase();
  const meeting = await db.getFirstAsync<{ group_id: number; loan_fund_at_start: number; insurance_fund_at_start: number }>(
    `SELECT group_id, loan_fund_at_start, insurance_fund_at_start FROM group_meetings WHERE id = ? LIMIT 1`,
    meetingId,
  );
  if (!meeting) throw new Error('Meeting not found.');

  const summary = await getMeetingTransactionSummary(meetingId);
  const expectedCash = Math.max(
    0,
    Number(meeting.loan_fund_at_start || 0) +
      summary.savings + summary.fines + summary.loanRepayment +
      summary.socialFund + summary.insuranceFund - summary.miscellaneousExpense,
  );
  const difference = Number((cashAtHand - expectedCash).toFixed(2));
  return { expectedCash, cashAtHand, difference, balanced: Math.abs(difference) < 0.01 };
}

export async function closeMeeting(
  meetingId: number,
  executiveMemberId: number,
  cashAtHand?: number | null,
): Promise<void> {
  const db = await getDatabase();

  const meeting =
    await db.getFirstAsync<GroupMeetingRecord>(
      `SELECT *
       FROM group_meetings
       WHERE id = ?
       LIMIT 1`,
      meetingId,
    );

  if (!meeting) {
    throw new Error('Meeting not found.');
  }

  if (meeting.status !== 'open') {
    throw new Error(
      'Only an open meeting can be closed.',
    );
  }

  const executive =
    await db.getFirstAsync<{
      id: number;
      role: string;
      status: string;
    }>(
      `SELECT id, role, status
       FROM members
       WHERE id = ?
       AND group_id = ?
       LIMIT 1`,
      executiveMemberId,
      meeting.group_id,
    );

  if (
    !executive ||
    executive.status !== 'active' ||
    executive.role.toLowerCase() !==
      'executive'
  ) {
    throw new Error(
      'Only an active executive can close the meeting.',
    );
  }

  /*
   * Meeting closing uses the previous concluded Loan Fund as the
   * starting balance, then adds only this meeting's transactions.
   *
   * Today's change:
   * Savings + Fines + Loan Repayment + Social Fund
   * - Miscellaneous Expense
   */
  const todaySummary =
    await getMeetingTransactionSummary(
      meetingId,
    );

  const previousMeeting =
    await db.getFirstAsync<{
      id: number;
      loan_fund: number | null;
    }>(
      `SELECT
         gm.id,
         mc.loan_fund
       FROM group_meetings gm
       LEFT JOIN meeting_closures mc
         ON mc.meeting_id = gm.id
       WHERE gm.group_id = ?
         AND gm.status = 'closed'
         AND gm.id != ?
       ORDER BY gm.meeting_number DESC
       LIMIT 1`,
      meeting.group_id,
      meetingId,
    );

  const previousLoanFund =
    Number(previousMeeting?.loan_fund) || 0;

  const closingLoanFund = Math.max(
    0,
    previousLoanFund +
      todaySummary.savings +
      todaySummary.fines +
      todaySummary.loanRepayment +
      todaySummary.socialFund -
      todaySummary.miscellaneousExpense,
  );

  /*
   * Savings and Insurance Fund remain lifetime account balances.
   * Loan Fund is specifically calculated above from the previous
   * concluded meeting plus this meeting's records.
   */
  const lifetimeSummary =
    await getFinancialSummary(
      meeting.group_id,
    );

  const timestamp = now();
  const reconciliation =
    cashAtHand === undefined || cashAtHand === null
      ? null
      : await getMeetingCashReconciliation(meetingId, Number(cashAtHand));

  await db.runAsync(
    `INSERT INTO meeting_closures (
      meeting_id,
      closed_at,
      total_savings,
      loan_fund,
      group_fund,
      insurance_fund,
      cash_at_hand,
      cash_expected,
      cash_balanced,
      reconciliation_note
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    meetingId,
    timestamp,
    lifetimeSummary.savings,
    closingLoanFund,
    lifetimeSummary.fundBalance,
    lifetimeSummary.insuranceFund,
    reconciliation?.cashAtHand ?? null,
    reconciliation?.expectedCash ?? null,
    reconciliation ? (reconciliation.balanced ? 1 : 0) : 0,
    reconciliation
      ? (reconciliation.balanced
        ? 'Cash at hand balances with the calculated closing cash.'
        : `Cash difference: ${reconciliation.difference}`)
      : 'Cash reconciliation not entered.',
  );

  await db.runAsync(
    `UPDATE group_meetings
     SET
       status = 'closed',
       closed_at = ?,
       previous_meeting_editable = 1
     WHERE id = ?`,
    timestamp,
    meetingId,
  );

  await addMeetingAudit(
    db,
    meeting.group_id,
    meeting.id,
    meeting.meeting_number,
    meeting.cycle_number,
    'meeting_closed',
    executiveMemberId,
  );

  await recordGroupActivity(
    meeting.group_id,
  );
}

/* ============================================================
   MEETING AUDIT
   ============================================================ */

export async function getMeetingAuditRecords(
  groupId: number,
): Promise<MeetingAuditRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<MeetingAuditRecord>(
    `SELECT *
     FROM meeting_audit_records
     WHERE group_id = ?
     ORDER BY meeting_number ASC, id ASC`,
    groupId,
  );
}

export async function getMeetingAuditForCycle(
  groupId: number,
  cycleNumber: number,
): Promise<MeetingAuditRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<MeetingAuditRecord>(
    `SELECT *
     FROM meeting_audit_records
     WHERE group_id = ?
     AND cycle_number = ?
     ORDER BY meeting_number ASC, id ASC`,
    groupId,
    cycleNumber,
  );
}

export async function getAllMeetings(
  groupId: number,
): Promise<GroupMeetingRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<GroupMeetingRecord>(
    `SELECT *
     FROM group_meetings
     WHERE group_id = ?
     ORDER BY meeting_number ASC`,
    groupId,
  );
}

/* ============================================================
   PRE-APP AUTHORIZATION
   ============================================================ */

export async function createAppAccessSession(
  groupId: number,
): Promise<number> {
  const db = await getDatabase();

  const existing =
    await db.getFirstAsync<{
      id: number;
    }>(
      `SELECT id
       FROM app_access_sessions
       WHERE group_id = ?
       AND status = 'open'
       ORDER BY id DESC
       LIMIT 1`,
      groupId,
    );

  if (existing) {
    return existing.id;
  }

  const result =
    await db.runAsync(
      `INSERT INTO app_access_sessions (
        group_id,
        meeting_id,
        opened_at,
        status
      )
      VALUES (?, NULL, ?, 'open')`,
      groupId,
      now(),
    );

  return result.lastInsertRowId;
}

export async function addAppAccessAuthorizer(
  sessionId: number,
  memberId: number,
  authorizerRole: string,
): Promise<void> {
  const db = await getDatabase();

  if (!normalizeText(authorizerRole)) {
    throw new Error(
      'Authorizer role is required.',
    );
  }

  await db.runAsync(
    `INSERT OR IGNORE INTO app_access_authorizers (
      session_id,
      member_id,
      authorizer_role,
      authorized_at
    )
    VALUES (?, ?, ?, ?)`,
    sessionId,
    memberId,
    normalizeText(authorizerRole),
    now(),
  );
}

export async function isPreAppAuthorized(
  sessionId: number,
): Promise<boolean> {
  const db = await getDatabase();

  const rows =
    await db.getAllAsync<{
      authorizer_role: string;
    }>(
      `SELECT authorizer_role
       FROM app_access_authorizers
       WHERE session_id = ?`,
      sessionId,
    );

  const executives =
    rows.filter(
      (row) =>
        row.authorizer_role
          .toLowerCase()
          .includes('executive'),
    ).length;

  const ordinary =
    rows.filter(
      (row) =>
        row.authorizer_role
          .toLowerCase()
          .includes('member') ||
        row.authorizer_role
          .toLowerCase()
          .includes('ordinary'),
    ).length;

  return executives >= 2 && ordinary >= 1;
}


/**
 * Insurance benefit availability for the Insurance screen.
 * Slot 3 and the member-level benefit are open for active members.
 */
export async function getInsuranceBenefitAvailability(
  memberId: number,
): Promise<{
  memberActive: boolean;
  memberBenefitOpen: boolean;
  slots: Array<{
    slot: number;
    open: boolean;
    locked: boolean;
    benefitReceived: boolean;
  }>;
}> {
  const db = await getDatabase();
  await applyDueNextOfKinChanges(db);
  await applyDueNextOfKinBenefits(db);

  const member = await db.getFirstAsync<{ status: string }>(
    `SELECT status FROM members WHERE id = ? LIMIT 1`,
    memberId,
  );

  const memberActive =
    !!member && String(member.status).toLowerCase() === 'active';

  const kin = await db.getAllAsync<NextOfKinRecord>(
    `SELECT * FROM member_next_of_kin
     WHERE member_id = ? AND slot IN (1, 2, 3)
     ORDER BY slot ASC`,
    memberId,
  );

  const slots = [1, 2, 3].map((slot) => {
    const item = kin.find((k) => Number(k.slot) === slot);
    const locked = slot === 3 ? false : Number(item?.locked ?? 0) === 1;
    const benefitReceived =
      slot === 3 ? false : Number(item?.benefit_received ?? 0) === 1;

    return {
      slot,
      open: memberActive && !locked && !benefitReceived,
      locked,
      benefitReceived,
    };
  });

  return {
    memberActive,
    memberBenefitOpen: memberActive,
    slots,
  };
}
