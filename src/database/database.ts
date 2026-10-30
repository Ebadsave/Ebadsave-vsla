import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import {
  BACK4APP_APPLICATION_ID,
  BACK4APP_JAVASCRIPT_KEY,
  BACK4APP_SERVER_URL,
} from '../config/back4app';
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
  back4app_registration_id?: string | null;
  /** Legacy local column retained for existing database compatibility. */
  firebase_registration_id?: string | null;
  onboarding_mode?: 'new' | 'existing';
  onboarding_locked?: number;
  onboarding_locked_at?: string | null;
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
  loan_interest_method: LoanInterestMethod;
  loan_repayment_amount_mode: LoanRepaymentAmountMode;
  loan_repayment_period_mode: LoanRepaymentPeriodMode;
  loan_interest_calculator: LoanInterestCalculator;
  loan_interest_period: string;
  maximum_loan_repayment_period: number;
  social_fund_contribution: number;
  insurance_contribution_amount: number;
  absence_fine: number;
  late_fine: number;
  non_saving_fine: number;
  non_loan_repayment_fine: number;
  non_insurance_contribution: number;
  allow_social_fund_for_loans: number;
  allow_external_fund_for_loans: number;
  allow_fines_for_loans: number;
  meeting_frequency: string;
  meeting_start_date: string | null;
  cycle_duration_months: number;
  leadership_term_months: number;
  share_out_enabled: number;
  share_out_methodology: 'savings_based' | 'share_based';
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

  // Existing groups can use a verified opening balance when their old books
  // cannot be completely reconstructed. When actual historical savings lines
  // have been imported, those lines are the source of truth and the opening
  // total is not added again.
  const opening = await db.getFirstAsync<{ amount: number }>(
    `SELECT CASE WHEN EXISTS (
       SELECT 1 FROM historical_transaction_imports
       WHERE group_id = ? AND member_id = ? AND historical_type = 'savings' AND COALESCE(is_deleted, 0) = 0
     ) THEN 0 ELSE COALESCE((
       SELECT opening_savings FROM member_opening_balances
       WHERE group_id = ? AND member_id = ? LIMIT 1
     ), 0) END AS amount`,
    groupId, memberId, groupId, memberId,
  );

  return Number(result?.total ?? 0) + Number(opening?.amount ?? 0);
}
const EXECUTIVE_POSTS = [
  'Chairperson',
  'Vice Chair',
  'Secretary',
  'Treasurer',
  'Money Counter',
  'Key Keeper',
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
  loanInterestMethod?: LoanInterestMethod;
  loanRepaymentAmountMode?: LoanRepaymentAmountMode;
  loanRepaymentPeriodMode?: LoanRepaymentPeriodMode;
  loanInterestCalculator?: LoanInterestCalculator;
  loanInterestPeriod?: string;
  maximumLoanRepaymentPeriod?: number;
  socialFundContribution?: number;
  insuranceContributionAmount?: number;
  absenceFine?: number;
  lateFine?: number;
  nonSavingFine?: number;
  nonLoanRepaymentFine?: number;
  nonInsuranceContribution?: number;
  allowSocialFundForLoans?: boolean | number;
  allowExternalFundForLoans?: boolean | number;
  allowFinesForLoans?: boolean | number;
  meetingFrequency?: string;
  meetingStartDate?: string | null;
  cycleDurationMonths?: number;
  leadershipTermMonths?: number;
  shareOutEnabled?: boolean | number;
  shareOutMethodology?: 'savings_based' | 'share_based';
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
  externalFund: number;
  directLoanFundIncome: number;
  loanDisbursement: number;
  loanFundCollections: number;
  totalCollected: number;
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

export type FinancialCollectionCorrectionRecord = {
  id: number;
  group_id: number;
  meeting_id: number;
  collection_id: number;
  collection_item_id: number;
  original_transaction_id: number;
  replacement_transaction_id: number | null;
  original_amount: number;
  corrected_amount: number;
  editor_member_id: number;
  reason: string;
  corrected_at: string;
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
    last_activity_at,
    back4app_registration_id
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
      loan_interest_method,
      loan_repayment_amount_mode,
      loan_repayment_period_mode,
      loan_interest_calculator,
      loan_interest_period,
      maximum_loan_repayment_period,
      social_fund_contribution,
      insurance_contribution_amount,
      absence_fine,
      late_fine,
      non_saving_fine,
      non_loan_repayment_fine,
      non_insurance_contribution,
      meeting_frequency,
      cycle_duration_months,
      leadership_term_months,
      share_out_enabled,
      share_out_methodology,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    groupId,
    1000,
    1,
    5,
    3,
    5,
    'fixed',
    'flexible',
    'flexible',
    'common_vsla',
    'per month',
    12,
    0,
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
    'savings_based',
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
    // Once Slot 1 or Slot 2 has paid out a benefit, its contact is permanent.
    // Discard any older scheduled edit that would otherwise change a locked slot.
    if (change.slot === 1 || change.slot === 2) {
      const currentKin = await db.getFirstAsync<{ locked: number; benefit_received: number }>(
        `SELECT locked, benefit_received
         FROM member_next_of_kin
         WHERE member_id = ? AND slot = ?
         LIMIT 1`,
        change.member_id,
        change.slot,
      );
      if (Number(currentKin?.locked ?? 0) === 1 || Number(currentKin?.benefit_received ?? 0) === 1) {
        await db.runAsync(
          `UPDATE next_of_kin_change_history SET applied = 1 WHERE id = ?`,
          change.id,
        );
        continue;
      }
    }

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
      last_activity_at TEXT NOT NULL,
      firebase_registration_id TEXT,
      back4app_registration_id TEXT,
      onboarding_mode TEXT NOT NULL DEFAULT 'new' CHECK (onboarding_mode IN ('new', 'existing')),
      onboarding_locked INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_locked IN (0, 1)),
      onboarding_locked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS member_opening_balances (
      member_id INTEGER PRIMARY KEY,
      group_id INTEGER NOT NULL,
      opening_shares INTEGER,
      share_value REAL,
      opening_savings REAL,
      opening_loan_balance REAL NOT NULL DEFAULT 0,
      loan_due_date TEXT,
      saved_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS onboarding_balance_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_id INTEGER,
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS group_registration_attempts (
      id TEXT PRIMARY KEY,
      group_name TEXT NOT NULL,
      district TEXT NOT NULL,
      country TEXT NOT NULL,
      group_number INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
      loan_interest_method TEXT NOT NULL DEFAULT 'fixed' CHECK (loan_interest_method IN ('fixed', 'flat', 'declining')),
      loan_interest_period TEXT NOT NULL DEFAULT 'per month',
      maximum_loan_repayment_period INTEGER NOT NULL DEFAULT 12,
      social_fund_contribution REAL NOT NULL DEFAULT 0,
      insurance_contribution_amount REAL NOT NULL DEFAULT 0,
      absence_fine REAL NOT NULL DEFAULT 0,
      late_fine REAL NOT NULL DEFAULT 0,
      non_saving_fine REAL NOT NULL DEFAULT 0,
      non_loan_repayment_fine REAL NOT NULL DEFAULT 0,
      non_insurance_contribution REAL NOT NULL DEFAULT 0,
      allow_social_fund_for_loans INTEGER NOT NULL DEFAULT 0,
      allow_external_fund_for_loans INTEGER NOT NULL DEFAULT 0,
      allow_fines_for_loans INTEGER NOT NULL DEFAULT 1,
      meeting_frequency TEXT NOT NULL DEFAULT 'weekly',
      meeting_start_date TEXT,
      cycle_duration_months INTEGER NOT NULL DEFAULT 12,
      leadership_term_months INTEGER NOT NULL DEFAULT 12,
      share_out_enabled INTEGER NOT NULL DEFAULT 1,
      share_out_methodology TEXT NOT NULL DEFAULT 'savings_based',
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

    CREATE TABLE IF NOT EXISTS financial_collection_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      meeting_id INTEGER NOT NULL,
      collection_id INTEGER NOT NULL,
      collection_item_id INTEGER NOT NULL,
      original_transaction_id INTEGER NOT NULL,
      replacement_transaction_id INTEGER,
      original_amount REAL NOT NULL,
      corrected_amount REAL NOT NULL,
      editor_member_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      corrected_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id),
      FOREIGN KEY (collection_id) REFERENCES financial_collections(id),
      FOREIGN KEY (collection_item_id) REFERENCES financial_collection_items(id),
      FOREIGN KEY (original_transaction_id) REFERENCES financial_transactions(id),
      FOREIGN KEY (replacement_transaction_id) REFERENCES financial_transactions(id),
      FOREIGN KEY (editor_member_id) REFERENCES members(id)
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

    CREATE TABLE IF NOT EXISTS historical_transaction_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      transaction_id INTEGER NOT NULL UNIQUE,
      historical_type TEXT NOT NULL CHECK (historical_type IN ('savings', 'loan_disbursement', 'loan_repayment')),
      amount REAL NOT NULL CHECK (amount > 0),
      transaction_date TEXT NOT NULL,
      share_count INTEGER,
      share_value REAL,
      loan_due_date TEXT,
      historical_interest REAL NOT NULL DEFAULT 0,
      source_reference TEXT NOT NULL COLLATE NOCASE,
      source_notes TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id),
      UNIQUE (group_id, source_reference)
    );
    CREATE INDEX IF NOT EXISTS idx_historical_imports_member_date
      ON historical_transaction_imports(group_id, member_id, transaction_date, id);

    CREATE TABLE IF NOT EXISTS historical_extra_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, member_id INTEGER, transaction_id INTEGER,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('fine', 'insurance', 'external_loan')),
      amount REAL NOT NULL CHECK (amount > 0), transaction_date TEXT NOT NULL, fine_reason TEXT NOT NULL DEFAULT '',
      lender_name TEXT NOT NULL DEFAULT '', interest_amount REAL NOT NULL DEFAULT 0, due_date TEXT,
      source_reference TEXT NOT NULL DEFAULT '', source_notes TEXT NOT NULL DEFAULT '', is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, edited_at TEXT, edited_by_member_id INTEGER, back4app_object_id TEXT,
      FOREIGN KEY (group_id) REFERENCES groups(id), FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (transaction_id) REFERENCES financial_transactions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_historical_extra_group_date ON historical_extra_entries(group_id, transaction_date, id);

    -- Imported loan balances are snapshots of what a member still owes.
    -- They are not loan-issuance or repayment cash transactions.
    CREATE TABLE IF NOT EXISTS historical_member_loan_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      balance REAL NOT NULL CHECK (balance >= 0),
      transaction_date TEXT NOT NULL,
      source_reference TEXT NOT NULL COLLATE NOCASE,
      source_notes TEXT NOT NULL DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      edited_at TEXT,
      edited_by_member_id INTEGER,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (edited_by_member_id) REFERENCES members(id),
      UNIQUE (group_id, source_reference)
    );
    CREATE INDEX IF NOT EXISTS idx_historical_loan_balances_member_date
      ON historical_member_loan_balances(group_id, member_id, transaction_date DESC, id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_loan_balances_member_day_active
      ON historical_member_loan_balances(group_id, member_id, transaction_date) WHERE is_deleted = 0;

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


    CREATE TABLE IF NOT EXISTS meeting_loan_interest_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      meeting_id INTEGER NOT NULL,
      charge_date TEXT NOT NULL,
      scheduled_interest_date TEXT,
      opening_balance REAL NOT NULL,
      interest_percentage REAL NOT NULL,
      interest_method TEXT NOT NULL CHECK (interest_method IN ('fixed', 'flat', 'declining')),
      interest_amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(group_id, member_id, meeting_id),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id)
    );

    CREATE INDEX IF NOT EXISTS idx_meeting_interest_member_date
      ON meeting_loan_interest_charges(group_id, member_id, charge_date);


    /* Persistent loan contracts and advanced-loan workflow. These tables are
       additive so existing member and transaction records remain untouched. */
    CREATE TABLE IF NOT EXISTS loan_policy_settings (
      group_id INTEGER PRIMARY KEY,
      default_interest_method TEXT NOT NULL DEFAULT 'fixed'
        CHECK (default_interest_method IN ('fixed', 'flat', 'declining')),
      require_committee_approval INTEGER NOT NULL DEFAULT 0 CHECK (require_committee_approval IN (0, 1)),
      minimum_committee_approvals INTEGER NOT NULL DEFAULT 2 CHECK (minimum_committee_approvals >= 1),
      require_guarantor INTEGER NOT NULL DEFAULT 0 CHECK (require_guarantor IN (0, 1)),
      allow_member_savings_deduction INTEGER NOT NULL DEFAULT 0 CHECK (allow_member_savings_deduction IN (0, 1)),
      allow_guarantor_deduction INTEGER NOT NULL DEFAULT 0 CHECK (allow_guarantor_deduction IN (0, 1)),
      updated_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS loan_committee_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      assigned_by_member_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      assigned_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(group_id, member_id),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (assigned_by_member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS loan_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      meeting_id INTEGER,
      requested_amount REAL NOT NULL CHECK (requested_amount > 0),
      interest_method TEXT NOT NULL DEFAULT 'fixed'
        CHECK (interest_method IN ('fixed', 'flat', 'declining')),
      interest_rate REAL NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
      repayment_period_count INTEGER NOT NULL DEFAULT 1 CHECK (repayment_period_count > 0),
      repayment_period_unit TEXT NOT NULL DEFAULT 'months'
        CHECK (repayment_period_unit IN ('weeks', 'months')),
      requested_due_date TEXT,
      requested_interest_day_offset INTEGER,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'disbursed', 'cancelled')),
      requested_by_member_id INTEGER,
      reviewed_at TEXT,
      disbursed_transaction_id INTEGER UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id),
      FOREIGN KEY (requested_by_member_id) REFERENCES members(id),
      FOREIGN KEY (disbursed_transaction_id) REFERENCES financial_transactions(id)
    );

    CREATE TABLE IF NOT EXISTS loan_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      application_id INTEGER UNIQUE,
      disbursement_transaction_id INTEGER NOT NULL UNIQUE,
      meeting_id INTEGER,
      principal_amount REAL NOT NULL CHECK (principal_amount > 0),
      interest_method TEXT NOT NULL DEFAULT 'fixed'
        CHECK (interest_method IN ('fixed', 'flat', 'declining')),
      interest_rate REAL NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
      interest_period TEXT NOT NULL DEFAULT 'per month',
      monthly_recalculation_enabled INTEGER NOT NULL DEFAULT 0 CHECK (monthly_recalculation_enabled IN (0, 1)),
      repayment_period_count INTEGER NOT NULL DEFAULT 1 CHECK (repayment_period_count > 0),
      repayment_period_unit TEXT NOT NULL DEFAULT 'months'
        CHECK (repayment_period_unit IN ('weeks', 'months')),
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      interest_anchor_date TEXT,
      interest_day_offset INTEGER,
      total_interest REAL NOT NULL DEFAULT 0,
      total_due REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paid', 'frozen', 'cancelled')),
      reason TEXT NOT NULL DEFAULT '',
      created_by_member_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (application_id) REFERENCES loan_applications(id),
      FOREIGN KEY (disbursement_transaction_id) REFERENCES financial_transactions(id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id),
      FOREIGN KEY (created_by_member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS loan_interest_schedule_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER,
      loan_id INTEGER,
      period_number INTEGER NOT NULL CHECK (period_number >= 1),
      scheduled_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(application_id, period_number),
      UNIQUE(loan_id, period_number),
      FOREIGN KEY (application_id) REFERENCES loan_applications(id) ON DELETE CASCADE,
      FOREIGN KEY (loan_id) REFERENCES loan_records(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_loan_interest_schedule_date
      ON loan_interest_schedule_dates(loan_id, scheduled_date);

    CREATE TABLE IF NOT EXISTS loan_repayment_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      installment_number INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      principal_due REAL NOT NULL DEFAULT 0,
      interest_due REAL NOT NULL DEFAULT 0,
      principal_paid REAL NOT NULL DEFAULT 0,
      interest_paid REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(loan_id, installment_number),
      FOREIGN KEY (loan_id) REFERENCES loan_records(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS loan_contract_interest_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      loan_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      meeting_id INTEGER NOT NULL,
      charge_date TEXT NOT NULL,
      opening_balance REAL NOT NULL,
      interest_percentage REAL NOT NULL,
      interest_method TEXT NOT NULL CHECK (interest_method IN ('fixed', 'flat', 'declining')),
      interest_amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(loan_id, meeting_id),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (loan_id) REFERENCES loan_records(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id)
    );
    CREATE INDEX IF NOT EXISTS idx_contract_interest_loan_date
      ON loan_contract_interest_charges(loan_id, charge_date);

    CREATE TABLE IF NOT EXISTS loan_guarantors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      guarantor_member_id INTEGER NOT NULL,
      guarantee_amount REAL NOT NULL CHECK (guarantee_amount > 0),
      signature_method TEXT NOT NULL DEFAULT 'member_passcode',
      passcode_verified INTEGER NOT NULL DEFAULT 0 CHECK (passcode_verified IN (0, 1)),
      signed_at TEXT,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'released', 'called')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(application_id, guarantor_member_id),
      FOREIGN KEY (application_id) REFERENCES loan_applications(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (guarantor_member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS loan_committee_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      approver_member_id INTEGER NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
      note TEXT NOT NULL DEFAULT '',
      passcode_verified INTEGER NOT NULL DEFAULT 0 CHECK (passcode_verified IN (0, 1)),
      decided_at TEXT NOT NULL,
      UNIQUE(application_id, approver_member_id),
      FOREIGN KEY (application_id) REFERENCES loan_applications(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (approver_member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS loan_deductions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('member_savings', 'guarantor')),
      source_member_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'applied', 'cancelled', 'reversed')),
      reason TEXT NOT NULL DEFAULT '',
      requested_by_member_id INTEGER,
      applied_transaction_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (loan_id) REFERENCES loan_records(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (source_member_id) REFERENCES members(id),
      FOREIGN KEY (requested_by_member_id) REFERENCES members(id),
      FOREIGN KEY (applied_transaction_id) REFERENCES financial_transactions(id)
    );

    CREATE TABLE IF NOT EXISTS loan_emergency_freezes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_id INTEGER,
      reason TEXT NOT NULL,
      authorized_by_member_id INTEGER NOT NULL,
      authorized_at TEXT NOT NULL,
      ended_by_member_id INTEGER,
      ended_at TEXT,
      end_reason TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (authorized_by_member_id) REFERENCES members(id),
      FOREIGN KEY (ended_by_member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS loan_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      loan_id INTEGER,
      actor_member_id INTEGER,
      event_type TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (loan_id) REFERENCES loan_records(id),
      FOREIGN KEY (actor_member_id) REFERENCES members(id)
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
    'meeting_closures',
    'backup_completed',
    'INTEGER NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'meeting_closures',
    'backup_created_at',
    'TEXT',
  );

  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'non_insurance_contribution',
    'REAL NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'insurance_contribution_amount',
    'REAL NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'allow_social_fund_for_loans',
    'INTEGER NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'allow_external_fund_for_loans',
    'INTEGER NOT NULL DEFAULT 0',
  );

  // Default to the existing accounting treatment for previously installed groups.
  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'allow_fines_for_loans',
    'INTEGER NOT NULL DEFAULT 1',
  );

  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'share_out_methodology',
    "TEXT NOT NULL DEFAULT 'savings_based'",
  );

  // Persist the group's selected interest method without changing existing loan contracts.
  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'loan_interest_method',
    "TEXT NOT NULL DEFAULT 'fixed'",
  );

  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'loan_repayment_amount_mode',
    "TEXT NOT NULL DEFAULT 'flexible'",
  );

  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'loan_repayment_period_mode',
    "TEXT NOT NULL DEFAULT 'flexible'",
  );

  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'loan_interest_calculator',
    "TEXT NOT NULL DEFAULT 'common_vsla'",
  );

  // Snapshot the group's loan rules on each application/contract so changing
  // Setup Rules later does not silently change loans already requested.
  await addColumnIfMissing(db, 'loan_applications', 'interest_calculator', "TEXT NOT NULL DEFAULT 'standard'");
  await addColumnIfMissing(db, 'loan_applications', 'interest_period', "TEXT NOT NULL DEFAULT 'per month'");
  await addColumnIfMissing(db, 'loan_applications', 'repayment_amount_mode', "TEXT NOT NULL DEFAULT 'flexible'");
  await addColumnIfMissing(db, 'loan_applications', 'repayment_period_mode', "TEXT NOT NULL DEFAULT 'flexible'");
  await addColumnIfMissing(db, 'loan_records', 'interest_calculator', "TEXT NOT NULL DEFAULT 'standard'");
  await addColumnIfMissing(db, 'loan_records', 'repayment_amount_mode', "TEXT NOT NULL DEFAULT 'flexible'");
  await addColumnIfMissing(db, 'loan_records', 'repayment_period_mode', "TEXT NOT NULL DEFAULT 'flexible'");
  await addColumnIfMissing(db, 'loan_records', 'monthly_recalculation_enabled', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'loan_applications', 'requested_interest_day_offset', 'INTEGER');
  await addColumnIfMissing(db, 'loan_records', 'interest_anchor_date', 'TEXT');
  await addColumnIfMissing(db, 'loan_records', 'interest_day_offset', 'INTEGER');
  await addColumnIfMissing(db, 'loan_contract_interest_charges', 'scheduled_interest_date', 'TEXT');
  // Enforce one calculation per scheduled monthly period, even if the app opens
  // more than one meeting after the same interest date.
  await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_interest_schedule_once
    ON loan_contract_interest_charges(loan_id, scheduled_interest_date)
    WHERE scheduled_interest_date IS NOT NULL;`);

  await addColumnIfMissing(
    db,
    'vsla_setup_rules',
    'meeting_start_date',
    'TEXT',
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
  await addColumnIfMissing(db, 'historical_transaction_imports', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'historical_transaction_imports', 'edited_at', 'TEXT');
  await addColumnIfMissing(db, 'historical_transaction_imports', 'edited_by_member_id', 'INTEGER');

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

  await addColumnIfMissing(db, 'groups', 'firebase_registration_id', 'TEXT'); // legacy column; no longer used for registration
  await addColumnIfMissing(db, 'groups', 'back4app_registration_id', 'TEXT');
  await addColumnIfMissing(db, 'groups', 'onboarding_mode', "TEXT NOT NULL DEFAULT 'new'");
  await addColumnIfMissing(db, 'groups', 'onboarding_locked', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'groups', 'onboarding_locked_at', 'TEXT');

  // Preserve the lock for groups whose first digital meeting was already closed.
  await db.runAsync(
    `UPDATE groups
     SET onboarding_locked = 1,
         onboarding_locked_at = COALESCE(onboarding_locked_at, (
           SELECT gm.closed_at
           FROM group_meetings gm
           WHERE gm.group_id = groups.id
             AND gm.meeting_number = 1
             AND gm.status = 'closed'
           LIMIT 1
         ))
     WHERE EXISTS (
       SELECT 1
       FROM group_meetings gm
       WHERE gm.group_id = groups.id
         AND gm.meeting_number = 1
         AND gm.status = 'closed'
     )`,
  );

  await addColumnIfMissing(db, 'meeting_closures', 'cash_at_hand', 'REAL');
  await addColumnIfMissing(db, 'meeting_closures', 'cash_expected', 'REAL');
  await addColumnIfMissing(db, 'meeting_closures', 'cash_balanced', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'meeting_closures', 'reconciliation_note', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'financial_collection_items', 'is_corrected', 'INTEGER NOT NULL DEFAULT 0');

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
   HISTORICAL PASSBOOK / LOAN-BOOK IMPORT
   ============================================================ */

export type HistoricalFinancialType = 'savings' | 'loan_disbursement' | 'loan_repayment';

export type HistoricalFinancialTransactionInput = {
  member_id: number;
  historical_type: HistoricalFinancialType;
  amount: number;
  transaction_date: string; // YYYY-MM-DD, as written in the physical book
  source_reference: string; // unique group-wide reference, e.g. PBOOK-04-LINE-02
  source_notes?: string;
  share_count?: number | null;
  share_value?: number | null;
  loan_due_date?: string | null;
  historical_interest?: number | null;
};

export type HistoricalFinancialTransactionRecord = {
  id: number;
  group_id: number;
  member_id: number;
  member_name: string;
  member_number: string;
  transaction_id: number;
  historical_type: HistoricalFinancialType;
  amount: number;
  transaction_date: string;
  share_count: number | null;
  share_value: number | null;
  loan_due_date: string | null;
  historical_interest: number;
  source_reference: string;
  source_notes: string;
  imported_at: string;
};

function validIsoDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Import one historical entry from a physical passbook or loan book.
 * It becomes a real ledger transaction, so savings and loan-balance summaries
 * use it. The source reference is unique per group to prevent duplicate imports.
 * It intentionally does not enforce today's share limits or today's loan rules
 * on transactions that occurred before the group began using Ebadsave.
 */
export async function recordHistoricalFinancialTransaction(
  groupId: number,
  input: HistoricalFinancialTransactionInput,
): Promise<number> {
  const db = await getDatabase();
  const type = input.historical_type;
  const amount = Number(input.amount);
  const sourceReference = normalizeText(input.source_reference);
  const notes = normalizeText(input.source_notes);
  const transactionDate = normalizeText(input.transaction_date);
  const shareCount = input.share_count == null ? null : Number(input.share_count);
  const shareValue = input.share_value == null ? null : Number(input.share_value);
  const dueDate = normalizeText(input.loan_due_date || '') || null;
  const historicalInterest = Number(input.historical_interest ?? 0);

  if (!Number.isInteger(groupId) || groupId <= 0) throw new Error('Select a valid group.');
  if (!Number.isInteger(input.member_id) || input.member_id <= 0) throw new Error('Select a valid member.');
  if (!['savings', 'loan_disbursement', 'loan_repayment'].includes(type)) throw new Error('Select a valid historical transaction type.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero.');
  if (!validIsoDateOnly(transactionDate)) throw new Error('Transaction date must be a real date in YYYY-MM-DD format.');
  const localNow = new Date();
  const localToday = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
  if (transactionDate > localToday) throw new Error('A historical transaction date cannot be in the future.');
  // The physical-book reference is optional in the illiterate-friendly UI; retain an internal unique ID for audit and duplicate-safe storage.
  const storedSourceReference = sourceReference || `AUTO-${groupId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (storedSourceReference.length > 120) throw new Error('The internal reference must be 120 characters or fewer.');
  if (!Number.isFinite(historicalInterest) || historicalInterest < 0) throw new Error('Historical interest must be zero or greater.');
  if (dueDate && !validIsoDateOnly(dueDate)) throw new Error('Loan due date must be a real date in YYYY-MM-DD format.');

  if (type === 'savings') {
    if (!Number.isInteger(shareCount) || Number(shareCount) < 1) throw new Error('For a historical savings entry, enter the whole number of shares recorded in the book.');
    if (!Number.isFinite(shareValue) || Number(shareValue) <= 0) throw new Error('Enter the share value that applied on that historical date.');
    const expectedAmount = Number(shareCount) * Number(shareValue);
    if (Math.abs(expectedAmount - amount) > 0.01) {
      throw new Error(`The amount in the book should match shares × historical share value (${expectedAmount.toLocaleString()}). Check the entry before importing.`);
    }
  } else if (shareCount != null || shareValue != null) {
    throw new Error('Share count and share value should only be entered for savings entries.');
  }

  const member = await db.getFirstAsync<{ id: number; group_id: number; full_name: string }>(
    `SELECT id, group_id, full_name FROM members WHERE id = ? AND group_id = ? LIMIT 1`,
    input.member_id, groupId,
  );
  if (!member) throw new Error('The selected member does not belong to this group.');
  const duplicate = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM historical_transaction_imports WHERE group_id = ? AND source_reference = ? COLLATE NOCASE LIMIT 1`,
    groupId, storedSourceReference,
  );
  if (duplicate) throw new Error('That internal entry reference already exists. Refresh the records and try again.');

  const accountType: FinancialAccountType = type === 'savings'
    ? 'savings'
    : type === 'loan_disbursement' ? 'loan_fund' : 'loan_repayment';
  const transactionType = type === 'savings'
    ? 'savings_contribution'
    : type === 'loan_disbursement' ? 'loan_issued' : 'loan_repayment';
  const signedAmount = type === 'loan_disbursement' ? -Math.abs(amount) : amount;
  // Noon UTC prevents the date-only book date shifting to the previous/next day
  // when viewed on devices in different time zones.
  const ledgerDate = `${transactionDate}T12:00:00.000Z`;
  const timestamp = now();
  let transactionId = 0;

  await db.withTransactionAsync(async () => {
    const duplicateInside = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM historical_transaction_imports WHERE group_id = ? AND source_reference = ? COLLATE NOCASE LIMIT 1`,
      groupId, storedSourceReference,
    );
    if (duplicateInside) throw new Error('That internal entry reference already exists. Refresh the records and try again.');

    await ensureFinancialAccountsForGroup(db, groupId);
    const inserted = await db.runAsync(
      `INSERT INTO financial_transactions (
        group_id, account_type, amount, reason, member_id, meeting_id,
        collection_id, transaction_type, reversed_transaction_id, reversed, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, NULL, 0, ?)`,
      groupId, accountType, signedAmount,
      `Historical ${type.replace('_', ' ')} — ${storedSourceReference}${notes ? ` — ${notes}` : ''}`,
      input.member_id, transactionType, ledgerDate,
    );
    transactionId = inserted.lastInsertRowId;

    await db.runAsync(
      `UPDATE financial_accounts SET balance = balance + ?, updated_at = ? WHERE group_id = ? AND account_type = ?`,
      signedAmount, timestamp, groupId, accountType,
    );

    await db.runAsync(
      `INSERT INTO historical_transaction_imports (
        group_id, member_id, transaction_id, historical_type, amount, transaction_date,
        share_count, share_value, loan_due_date, historical_interest,
        source_reference, source_notes, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      groupId, input.member_id, transactionId, type, amount, transactionDate,
      type === 'savings' ? shareCount : null,
      type === 'savings' ? shareValue : null,
      type === 'loan_disbursement' ? dueDate : null,
      type === 'loan_disbursement' ? historicalInterest : 0,
      storedSourceReference, notes, timestamp,
    );

    await addPassbookEntry(
      db, groupId, input.member_id, null, transactionId,
      type === 'savings' ? 'savings_contribution' : type === 'loan_disbursement' ? 'loan_issued' : 'loan_repayment',
      amount,
      `Historical ${type.replace('_', ' ')} — ${storedSourceReference}${notes ? ` — ${notes}` : ''}`,
      ledgerDate,
    );

    // Backdated passbook rows change the chronological running balance.
    // Rebuild the member's displayed running balances in date order rather than
    // leaving later entries with balances calculated before this import.
    const passbookRows = await db.getAllAsync<{ id: number; amount: number }>(
      `SELECT id, amount FROM member_passbook_records
       WHERE group_id = ? AND member_id = ? ORDER BY created_at ASC, id ASC`,
      groupId, input.member_id,
    );
    let runningPassbookBalance = 0;
    for (const row of passbookRows) {
      runningPassbookBalance += Number(row.amount) || 0;
      await db.runAsync(`UPDATE member_passbook_records SET balance_after = ? WHERE id = ?`, runningPassbookBalance, row.id);
    }

    await db.runAsync(`UPDATE groups SET last_activity_at = ? WHERE id = ?`, timestamp, groupId);
  });

  return transactionId;
}

export async function getHistoricalFinancialTransactions(
  groupId: number,
  limit = 100,
): Promise<HistoricalFinancialTransactionRecord[]> {
  const db = await getDatabase();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
  return db.getAllAsync<HistoricalFinancialTransactionRecord>(
    `SELECT h.*, m.full_name AS member_name, m.member_number
     FROM historical_transaction_imports h
     JOIN members m ON m.id = h.member_id AND m.group_id = h.group_id
     WHERE h.group_id = ? AND COALESCE(h.is_deleted, 0) = 0
     ORDER BY h.transaction_date DESC, h.id DESC
     LIMIT ?`,
    groupId, safeLimit,
  );
}

export type HistoricalFinancialSummary = {
  records: number;
  savings: number;
  loanDisbursements: number;
  loanRepayments: number;
  recordedHistoricalInterest: number;
  fines: number;
  insurance: number;
  externalLoans: number;
};

export async function getHistoricalFinancialSummary(
  groupId: number,
): Promise<HistoricalFinancialSummary> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    records: number;
    savings: number;
    loanDisbursements: number;
    loanRepayments: number;
    recordedHistoricalInterest: number;
  }>(
    `SELECT COUNT(*) AS records,
       COALESCE(SUM(CASE WHEN historical_type = 'savings' THEN amount ELSE 0 END), 0) AS savings,
       COALESCE(SUM(CASE WHEN historical_type = 'loan_disbursement' THEN amount ELSE 0 END), 0) AS loanDisbursements,
       COALESCE(SUM(CASE WHEN historical_type = 'loan_repayment' THEN amount ELSE 0 END), 0) AS loanRepayments,
       COALESCE(SUM(CASE WHEN historical_type = 'loan_disbursement' THEN historical_interest ELSE 0 END), 0) AS recordedHistoricalInterest
     FROM historical_transaction_imports WHERE group_id = ? AND COALESCE(is_deleted, 0) = 0`,
    groupId,
  );
  const extras = await db.getFirstAsync<{ records: number; fines: number; insurance: number; externalLoans: number }>(
    `SELECT COUNT(*) AS records,
      COALESCE(SUM(CASE WHEN entry_type = 'fine' THEN amount ELSE 0 END), 0) AS fines,
      COALESCE(SUM(CASE WHEN entry_type = 'insurance' THEN amount ELSE 0 END), 0) AS insurance,
      COALESCE(SUM(CASE WHEN entry_type = 'external_loan' THEN amount ELSE 0 END), 0) AS externalLoans
     FROM historical_extra_entries WHERE group_id = ? AND is_deleted = 0`, groupId,
  );
  return {
    records: Number(row?.records ?? 0) + Number(extras?.records ?? 0),
    savings: Number(row?.savings ?? 0),
    loanDisbursements: Number(row?.loanDisbursements ?? 0),
    loanRepayments: Number(row?.loanRepayments ?? 0),
    recordedHistoricalInterest: Number(row?.recordedHistoricalInterest ?? 0),
    fines: Number(extras?.fines ?? 0),
    insurance: Number(extras?.insurance ?? 0),
    externalLoans: Number(extras?.externalLoans ?? 0),
  };
}

export async function canManageHistoricalEntries(groupId: number, memberId: number): Promise<boolean> {
  try { await requireHistoricalGroupAdmin(groupId, memberId); return true; } catch { return false; }
}

export type HistoricalExtraType = 'fine' | 'insurance' | 'external_loan';
export type HistoricalExtraInput = {
  member_id?: number | null;
  entry_type: HistoricalExtraType;
  amount: number;
  transaction_date: string;
  fine_reason?: 'late' | 'absent' | 'other' | '';
  lender_name?: string;
  interest_amount?: number;
  due_date?: string | null;
  source_reference?: string;
  source_notes?: string;
};
export type HistoricalExtraRecord = {
  id: number; group_id: number; member_id: number | null; member_name: string; member_number: string;
  transaction_id: number | null; entry_type: HistoricalExtraType; amount: number; transaction_date: string;
  fine_reason: string; lender_name: string; interest_amount: number; due_date: string | null;
  source_reference: string; source_notes: string; is_deleted: number; created_at: string;
  edited_at: string | null; back4app_object_id: string | null;
};
export type HistoricalEditInput = {
  amount: number; transaction_date: string; fine_reason?: string; lender_name?: string;
  interest_amount?: number; due_date?: string | null; source_notes?: string;
};

function validateHistoricalDate(value: string, field = 'Transaction date'): void {
  if (!validIsoDateOnly(value)) throw new Error(`${field} must be a real date in YYYY-MM-DD format.`);
}

async function requireHistoricalGroupAdmin(groupId: number, memberId: number): Promise<void> {
  const db = await getDatabase();
  const member = await db.getFirstAsync<{ group_id: number; status: string; is_super_user: number; assigned_roles: string | null }>(
    'SELECT group_id, status, is_super_user, assigned_roles FROM members WHERE id = ? AND group_id = ? LIMIT 1', memberId, groupId,
  );
  const roles = (member?.assigned_roles || '').split(',').map((role) => role.trim().toLowerCase());
  if (!member || member.status !== 'active' || (!Number(member.is_super_user) && !roles.includes('admin') && !roles.includes('group admin') && !roles.includes('chairperson') && !roles.includes('chair'))) {
    throw new Error('Only this group’s administrator or Chairperson can edit or delete imported entries.');
  }
}

export type HistoricalLoanBalanceRecord = {
  id: number; group_id: number; member_id: number; member_name: string; member_number: string;
  balance: number; transaction_date: string; source_reference: string; source_notes: string;
  is_deleted: number; created_at: string; edited_at: string | null; edited_by_member_id: number | null;
};

export type HistoricalLoanBalanceInput = {
  member_id: number; balance: number; transaction_date: string; source_reference?: string; source_notes?: string;
};

export async function getHistoricalLoanBalanceEntries(
  groupId: number, limit = 10000,
): Promise<HistoricalLoanBalanceRecord[]> {
  const db = await getDatabase();
  const safeLimit = Math.max(1, Math.min(10000, Math.floor(Number(limit) || 10000)));
  return db.getAllAsync<HistoricalLoanBalanceRecord>(
    `SELECT h.*, m.full_name AS member_name, m.member_number
     FROM historical_member_loan_balances h
     JOIN members m ON m.id = h.member_id
     WHERE h.group_id = ? AND h.is_deleted = 0
     ORDER BY h.transaction_date DESC, h.id DESC
     LIMIT ?`,
    groupId, safeLimit,
  );
}

/** Save the exact outstanding loan balance as a snapshot; this is not a repayment. */
export async function recordHistoricalLoanBalance(
  groupId: number, input: HistoricalLoanBalanceInput,
): Promise<number> {
  const db = await getDatabase();
  const memberId = Number(input.member_id);
  const balance = Number(input.balance);
  const date = normalizeText(input.transaction_date);
  if (!Number.isInteger(groupId) || groupId <= 0) throw new Error('Select a valid group.');
  if (!Number.isInteger(memberId) || memberId <= 0) throw new Error('Choose a member first.');
  if (!Number.isFinite(balance) || balance < 0) throw new Error('Loan balance must be zero or greater.');
  validateHistoricalDate(date);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (date > todayIso) throw new Error('A historical balance date cannot be in the future.');
  const member = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM members WHERE id = ? AND group_id = ? LIMIT 1', memberId, groupId,
  );
  if (!member) throw new Error('The selected member does not belong to this group.');
  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM historical_member_loan_balances WHERE group_id = ? AND member_id = ? AND transaction_date = ? AND is_deleted = 0 LIMIT 1',
    groupId, memberId, date,
  );
  if (duplicate) throw new Error('This member already has a historical loan balance recorded for this date. Search and edit the existing record instead.');
  const reference = normalizeText(input.source_reference) || `AUTO-BALANCE-${groupId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (reference.length > 120) throw new Error('The internal reference must be 120 characters or fewer.');
  const timestamp = now();
  const result = await db.runAsync(
    `INSERT INTO historical_member_loan_balances
      (group_id, member_id, balance, transaction_date, source_reference, source_notes, is_deleted, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    groupId, memberId, balance, date, reference, normalizeText(input.source_notes || ''), timestamp,
  );
  await db.runAsync('UPDATE groups SET last_activity_at = ? WHERE id = ?', timestamp, groupId);
  return Number(result.lastInsertRowId);
}

export async function editHistoricalLoanBalanceEntry(
  groupId: number, entryId: number, input: HistoricalLoanBalanceInput, editorMemberId: number,
): Promise<void> {
  await requireHistoricalGroupAdmin(groupId, editorMemberId);
  const db = await getDatabase();
  const memberId = Number(input.member_id);
  const balance = Number(input.balance);
  const date = normalizeText(input.transaction_date);
  if (!Number.isFinite(balance) || balance < 0) throw new Error('Loan balance must be zero or greater.');
  validateHistoricalDate(date);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (date > todayIso) throw new Error('A historical balance date cannot be in the future.');
  const member = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM members WHERE id = ? AND group_id = ? LIMIT 1', memberId, groupId,
  );
  if (!member) throw new Error('The selected member does not belong to this group.');
  const current = await db.getFirstAsync<any>(
    'SELECT * FROM historical_member_loan_balances WHERE id = ? AND group_id = ? AND is_deleted = 0 LIMIT 1', entryId, groupId,
  );
  if (!current) throw new Error('This loan balance entry is no longer available. Refresh the list.');
  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM historical_member_loan_balances WHERE group_id = ? AND member_id = ? AND transaction_date = ? AND is_deleted = 0 AND id <> ? LIMIT 1',
    groupId, memberId, date, entryId,
  );
  if (duplicate) throw new Error('This member already has a historical loan balance recorded for this date.');
  const timestamp = now();
  const audit = `Edited on ${timestamp.slice(0, 10)} by ${editorMemberId}; previous balance ${current.balance}; previous date ${current.transaction_date}.`;
  const notes = [normalizeText(input.source_notes || current.source_notes || ''), audit].filter(Boolean).join(' | ');
  await db.runAsync(
    `UPDATE historical_member_loan_balances
     SET member_id = ?, balance = ?, transaction_date = ?, source_notes = ?, edited_at = ?, edited_by_member_id = ?
     WHERE id = ? AND group_id = ?`,
    memberId, balance, date, notes, timestamp, editorMemberId, entryId, groupId,
  );
}

export async function softDeleteHistoricalLoanBalanceEntry(
  groupId: number, entryId: number, adminMemberId: number,
): Promise<void> {
  await requireHistoricalGroupAdmin(groupId, adminMemberId);
  const db = await getDatabase();
  const timestamp = now();
  const result = await db.runAsync(
    `UPDATE historical_member_loan_balances SET is_deleted = 1, edited_at = ?, edited_by_member_id = ?
     WHERE id = ? AND group_id = ? AND is_deleted = 0`,
    timestamp, adminMemberId, entryId, groupId,
  );
  if (Number(result.changes) === 0) throw new Error('This loan balance entry is already deleted or does not exist.');
}

export async function getHistoricalExtraEntries(groupId: number, limit = 100): Promise<HistoricalExtraRecord[]> {
  const db = await getDatabase();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
  return db.getAllAsync<HistoricalExtraRecord>(
    `SELECT e.*, COALESCE(m.full_name, '') AS member_name, COALESCE(m.member_number, '') AS member_number
     FROM historical_extra_entries e LEFT JOIN members m ON m.id = e.member_id AND m.group_id = e.group_id
     WHERE e.group_id = ? AND e.is_deleted = 0 ORDER BY e.transaction_date DESC, e.id DESC LIMIT ?`, groupId, safeLimit,
  );
}

async function writeBack4AppFine(groupId: number, entryId: number, memberId: number | null, amount: number, date: string, reason: string, sourceReference: string): Promise<void> {
  const db = await getDatabase();
  const group = await db.getFirstAsync<{ group_number: string; group_name: string }>('SELECT group_number, group_name FROM groups WHERE id = ? LIMIT 1', groupId);
  const member = memberId ? await db.getFirstAsync<{ full_name: string; member_number: string }>('SELECT full_name, member_number FROM members WHERE id = ? AND group_id = ? LIMIT 1', memberId, groupId) : null;
  const response = await fetch(`${BACK4APP_SERVER_URL}/classes/Fines`, {
    method: 'POST',
    headers: { 'X-Parse-Application-Id': BACK4APP_APPLICATION_ID, 'X-Parse-JavaScript-Key': BACK4APP_JAVASCRIPT_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupNumber: String(group?.group_number ?? groupId), groupName: group?.group_name ?? '', localGroupId: groupId, localEntryId: entryId, memberId, memberName: member?.full_name ?? '', memberNumber: member?.member_number ?? '', amount, reason, transactionDate: date, sourceReference, isDeleted: false, app: 'Ebadsave-vsla' }),
  });
  const body = await response.json().catch(() => ({} as any));
  if (!response.ok) throw new Error(body?.error || `Back4App Fines sync failed (${response.status}).`);
  if (body?.objectId) await db.runAsync('UPDATE historical_extra_entries SET back4app_object_id = ? WHERE id = ? AND group_id = ?', String(body.objectId), entryId, groupId);
}

async function syncBack4AppFineState(groupId: number, entryId: number, isDeleted: boolean): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>('SELECT * FROM historical_extra_entries WHERE id = ? AND group_id = ? LIMIT 1', entryId, groupId);
  if (!row || row.entry_type !== 'fine' || !row.back4app_object_id) return;
  const group = await db.getFirstAsync<{ group_number: string; group_name: string }>('SELECT group_number, group_name FROM groups WHERE id = ? LIMIT 1', groupId);
  const member = row.member_id ? await db.getFirstAsync<{ full_name: string; member_number: string }>('SELECT full_name, member_number FROM members WHERE id = ? AND group_id = ? LIMIT 1', row.member_id, groupId) : null;
  await fetch(`${BACK4APP_SERVER_URL}/classes/Fines/${row.back4app_object_id}`, {
    method: 'PUT', headers: { 'X-Parse-Application-Id': BACK4APP_APPLICATION_ID, 'X-Parse-JavaScript-Key': BACK4APP_JAVASCRIPT_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupNumber: String(group?.group_number ?? groupId), groupName: group?.group_name ?? '', localGroupId: groupId, localEntryId: entryId, memberId: row.member_id, memberName: member?.full_name ?? '', memberNumber: member?.member_number ?? '', amount: Number(row.amount), reason: row.fine_reason || 'other', transactionDate: row.transaction_date, sourceReference: row.source_reference, isDeleted, editedAt: now(), app: 'Ebadsave-vsla' }),
  });
}

export async function recordHistoricalExtraEntry(groupId: number, input: HistoricalExtraInput): Promise<{ id: number; cloudSynced: boolean }> {
  const db = await getDatabase();
  const amount = Number(input.amount); const date = normalizeText(input.transaction_date);
  if (!Number.isInteger(groupId) || groupId <= 0) throw new Error('Select a valid group.');
  if (!['fine', 'insurance', 'external_loan'].includes(input.entry_type)) throw new Error('Select a valid entry type.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero.');
  validateHistoricalDate(date);
  const dueDate = normalizeText(input.due_date || '') || null;
  if (dueDate) validateHistoricalDate(dueDate, 'Due date');
  const interest = Number(input.interest_amount ?? 0);
  if (!Number.isFinite(interest) || interest < 0) throw new Error('Interest must be zero or greater.');
  if (input.entry_type === 'external_loan' && !normalizeText(input.lender_name)) throw new Error('Enter the external lender name.');
  if (input.entry_type !== 'external_loan' && input.member_id == null) throw new Error('Select a member.');
  if (input.member_id != null) {
    const member = await db.getFirstAsync<{ id: number }>('SELECT id FROM members WHERE id = ? AND group_id = ? LIMIT 1', input.member_id, groupId);
    if (!member) throw new Error('The selected member does not belong to this group.');
  }
  const timestamp = now();
  const sourceReference = normalizeText(input.source_reference || '') || `AUTO-${groupId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let id = 0;
  await db.withTransactionAsync(async () => {
    await ensureFinancialAccountsForGroup(db, groupId);
    const accountType: FinancialAccountType = input.entry_type === 'fine' ? 'fines' : input.entry_type === 'insurance' ? 'insurance_fund' : 'external_fund';
    const transactionType = input.entry_type === 'fine' ? 'fine' : input.entry_type === 'insurance' ? 'insurance_contribution' : 'external_loan_received';
    const transaction = await db.runAsync(
      `INSERT INTO financial_transactions (group_id, account_type, amount, reason, member_id, meeting_id, collection_id, transaction_type, reversed_transaction_id, reversed, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, NULL, 0, ?)`,
      groupId, accountType, amount, input.entry_type === 'fine' ? `Historical fine: ${input.fine_reason || 'other'}` : input.entry_type === 'insurance' ? 'Historical insurance contribution' : `External group loan from ${normalizeText(input.lender_name)}`,
      input.member_id ?? null, transactionType, `${date}T12:00:00.000Z`,
    );
    await db.runAsync('UPDATE financial_accounts SET balance = balance + ?, updated_at = ? WHERE group_id = ? AND account_type = ?', amount, timestamp, groupId, accountType);
    const result = await db.runAsync(
      `INSERT INTO historical_extra_entries (group_id, member_id, transaction_id, entry_type, amount, transaction_date, fine_reason, lender_name, interest_amount, due_date, source_reference, source_notes, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      groupId, input.member_id ?? null, transaction.lastInsertRowId, input.entry_type, amount, date, normalizeText(input.fine_reason || ''), normalizeText(input.lender_name || ''), interest, dueDate, sourceReference, normalizeText(input.source_notes || ''), timestamp,
    );
    id = result.lastInsertRowId;
    if (input.member_id != null) await addPassbookEntry(db, groupId, input.member_id, null, transaction.lastInsertRowId, input.entry_type === 'fine' ? 'fine' : 'insurance_contribution', amount, input.entry_type === 'fine' ? `Fine: ${input.fine_reason || 'other'}` : 'Insurance contribution', `${date}T12:00:00.000Z`);
    await db.runAsync('UPDATE groups SET last_activity_at = ? WHERE id = ?', timestamp, groupId);
  });
  let cloudSynced = true;
  if (input.entry_type === 'fine') {
    try { await writeBack4AppFine(groupId, id, input.member_id ?? null, amount, date, normalizeText(input.fine_reason || 'other'), sourceReference); }
    catch { cloudSynced = false; }
  }
  return { id, cloudSynced };
}

export async function editHistoricalEntry(groupId: number, entryKind: 'standard' | 'extra', entryId: number, input: HistoricalEditInput, editorMemberId: number): Promise<void> {
  await requireHistoricalGroupAdmin(groupId, editorMemberId);
  const db = await getDatabase(); const amount = Number(input.amount); const date = normalizeText(input.transaction_date); const timestamp = now();
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero.');
  validateHistoricalDate(date);
  await db.withTransactionAsync(async () => {
    if (entryKind === 'standard') {
      const row = await db.getFirstAsync<any>('SELECT * FROM historical_transaction_imports WHERE id = ? AND group_id = ? AND is_deleted = 0 LIMIT 1', entryId, groupId);
      if (!row) throw new Error('This entry is no longer available. Refresh the list.');
      const signedOld = row.historical_type === 'loan_disbursement' ? -Number(row.amount) : Number(row.amount);
      const signedNew = row.historical_type === 'loan_disbursement' ? -amount : amount;
      const accountType: FinancialAccountType = row.historical_type === 'savings' ? 'savings' : row.historical_type === 'loan_disbursement' ? 'loan_fund' : 'loan_repayment';
      let editedShareCount = row.share_count;
      if (row.historical_type === 'savings') {
        const unit = Number(row.share_value || 0);
        if (unit <= 0 || Math.abs(amount / unit - Math.round(amount / unit)) > 0.0001) throw new Error('Savings amount must be a whole number of the original share value.');
        editedShareCount = Math.round(amount / unit);
      }
      const audit = `Edited on ${timestamp.slice(0, 10)} by ${editorMemberId}; previous amount ${row.amount}; previous date ${row.transaction_date}.`;
      await db.runAsync('UPDATE historical_transaction_imports SET amount = ?, transaction_date = ?, share_count = ?, source_notes = ?, edited_at = ?, edited_by_member_id = ? WHERE id = ? AND group_id = ?', amount, date, editedShareCount, [normalizeText(input.source_notes || row.source_notes || ''), audit].filter(Boolean).join(' | '), timestamp, editorMemberId, entryId, groupId);
      await db.runAsync('UPDATE financial_transactions SET amount = ?, created_at = ? WHERE id = ? AND group_id = ?', signedNew, `${date}T12:00:00.000Z`, row.transaction_id, groupId);
      await db.runAsync('UPDATE financial_accounts SET balance = balance + ?, updated_at = ? WHERE group_id = ? AND account_type = ?', signedNew - signedOld, timestamp, groupId, accountType);
      await db.runAsync('UPDATE member_passbook_records SET amount = ?, created_at = ?, description = ? WHERE transaction_id = ? AND group_id = ?', amount, `${date}T12:00:00.000Z`, `Historical ${row.historical_type.replace('_', ' ')} (edited on ${timestamp.slice(0, 10)})`, row.transaction_id, groupId);
      await rebuildHistoricalPassbookBalance(db, groupId, Number(row.member_id));
    } else {
      const row = await db.getFirstAsync<any>('SELECT * FROM historical_extra_entries WHERE id = ? AND group_id = ? AND is_deleted = 0 LIMIT 1', entryId, groupId);
      if (!row) throw new Error('This entry is no longer available. Refresh the list.');
      const dueDate = normalizeText(input.due_date || '') || null; if (dueDate) validateHistoricalDate(dueDate, 'Due date');
      const interest = Number(input.interest_amount ?? row.interest_amount ?? 0); if (!Number.isFinite(interest) || interest < 0) throw new Error('Interest must be zero or greater.');
      const audit = `Edited on ${timestamp.slice(0, 10)} by ${editorMemberId}; previous amount ${row.amount}; previous date ${row.transaction_date}.`;
      const accountType: FinancialAccountType = row.entry_type === 'fine' ? 'fines' : row.entry_type === 'insurance' ? 'insurance_fund' : 'external_fund';
      await db.runAsync('UPDATE historical_extra_entries SET amount = ?, transaction_date = ?, fine_reason = ?, lender_name = ?, interest_amount = ?, due_date = ?, source_notes = ?, edited_at = ?, edited_by_member_id = ? WHERE id = ? AND group_id = ?', amount, date, normalizeText(input.fine_reason || row.fine_reason || ''), normalizeText(input.lender_name || row.lender_name || ''), interest, dueDate, [normalizeText(input.source_notes || row.source_notes || ''), audit].filter(Boolean).join(' | '), timestamp, editorMemberId, entryId, groupId);
      await db.runAsync('UPDATE financial_transactions SET amount = ?, created_at = ?, reason = ? WHERE id = ? AND group_id = ?', amount, `${date}T12:00:00.000Z`, `${row.entry_type} (edited on ${timestamp.slice(0, 10)})`, row.transaction_id, groupId);
      await db.runAsync('UPDATE financial_accounts SET balance = balance + ?, updated_at = ? WHERE group_id = ? AND account_type = ?', amount - Number(row.amount), timestamp, groupId, accountType);
      if (row.member_id != null) await db.runAsync('UPDATE member_passbook_records SET amount = ?, created_at = ?, description = ? WHERE transaction_id = ? AND group_id = ?', amount, `${date}T12:00:00.000Z`, `${row.entry_type} (edited on ${timestamp.slice(0, 10)})`, row.transaction_id, groupId);
    }
  });
  if (entryKind === 'extra') { try { await syncBack4AppFineState(groupId, entryId, false); } catch { /* Local audit remains authoritative until the next cloud sync. */ } }
}

export async function softDeleteHistoricalEntry(groupId: number, entryKind: 'standard' | 'extra', entryId: number, adminMemberId: number): Promise<void> {
  await requireHistoricalGroupAdmin(groupId, adminMemberId);
  const db = await getDatabase(); const timestamp = now();
  await db.withTransactionAsync(async () => {
    if (entryKind === 'standard') {
      const row = await db.getFirstAsync<any>('SELECT * FROM historical_transaction_imports WHERE id = ? AND group_id = ? AND is_deleted = 0 LIMIT 1', entryId, groupId);
      if (!row) throw new Error('This entry is already deleted or does not exist.');
      const signed = row.historical_type === 'loan_disbursement' ? -Number(row.amount) : Number(row.amount);
      const accountType: FinancialAccountType = row.historical_type === 'savings' ? 'savings' : row.historical_type === 'loan_disbursement' ? 'loan_fund' : 'loan_repayment';
      await db.runAsync('UPDATE historical_transaction_imports SET is_deleted = 1, edited_at = ?, edited_by_member_id = ? WHERE id = ? AND group_id = ?', timestamp, adminMemberId, entryId, groupId);
      await db.runAsync('UPDATE financial_transactions SET reversed = 1 WHERE id = ? AND group_id = ?', row.transaction_id, groupId);
      await db.runAsync('UPDATE financial_accounts SET balance = balance - ?, updated_at = ? WHERE group_id = ? AND account_type = ?', signed, timestamp, groupId, accountType);
      await db.runAsync('UPDATE member_passbook_records SET amount = 0, description = ? WHERE transaction_id = ? AND group_id = ?', `DELETED on ${timestamp.slice(0, 10)} by admin ${adminMemberId}`, row.transaction_id, groupId);
      await rebuildHistoricalPassbookBalance(db, groupId, Number(row.member_id));
    } else {
      const row = await db.getFirstAsync<any>('SELECT * FROM historical_extra_entries WHERE id = ? AND group_id = ? AND is_deleted = 0 LIMIT 1', entryId, groupId);
      if (!row) throw new Error('This entry is already deleted or does not exist.');
      const accountType: FinancialAccountType = row.entry_type === 'fine' ? 'fines' : row.entry_type === 'insurance' ? 'insurance_fund' : 'external_fund';
      await db.runAsync('UPDATE historical_extra_entries SET is_deleted = 1, edited_at = ?, edited_by_member_id = ? WHERE id = ? AND group_id = ?', timestamp, adminMemberId, entryId, groupId);
      await db.runAsync('UPDATE financial_transactions SET reversed = 1 WHERE id = ? AND group_id = ?', row.transaction_id, groupId);
      await db.runAsync('UPDATE financial_accounts SET balance = balance - ?, updated_at = ? WHERE group_id = ? AND account_type = ?', Number(row.amount), timestamp, groupId, accountType);
      if (row.member_id != null) {
        await db.runAsync('UPDATE member_passbook_records SET amount = 0, description = ? WHERE transaction_id = ? AND group_id = ?', `DELETED on ${timestamp.slice(0, 10)} by admin ${adminMemberId}`, row.transaction_id, groupId);
        await rebuildHistoricalPassbookBalance(db, groupId, Number(row.member_id));
      }
    }
  });
  if (entryKind === 'extra') { try { await syncBack4AppFineState(groupId, entryId, true); } catch { /* Preserve the local soft-delete if the device is offline. */ } }
}

async function rebuildHistoricalPassbookBalance(db: SQLite.SQLiteDatabase, groupId: number, memberId: number): Promise<void> {
  const rows = await db.getAllAsync<{ id: number; amount: number }>('SELECT id, amount FROM member_passbook_records WHERE group_id = ? AND member_id = ? ORDER BY created_at ASC, id ASC', groupId, memberId);
  let balance = 0;
  for (const row of rows) { balance += Number(row.amount) || 0; await db.runAsync('UPDATE member_passbook_records SET balance_after = ? WHERE id = ?', balance, row.id); }
}

/** The number of known/estimated shares for share-based cycle distribution. */
export async function getMemberShareOutBasis(
  groupId: number,
  memberId: number,
): Promise<{ savings: number; shares: number; sharesEstimated: boolean }> {
  const db = await getDatabase();
  const savings = await getMemberSavings(groupId, memberId);
  const opening = await db.getFirstAsync<{ opening_shares: number | null }>(
    `SELECT opening_shares FROM member_opening_balances WHERE group_id = ? AND member_id = ? LIMIT 1`,
    groupId, memberId,
  );
  const imported = await db.getFirstAsync<{ shares: number; count: number }>(
    `SELECT COALESCE(SUM(share_count), 0) AS shares, COUNT(*) AS count
     FROM historical_transaction_imports WHERE group_id = ? AND member_id = ? AND historical_type = 'savings' AND COALESCE(is_deleted, 0) = 0`,
    groupId, memberId,
  );
  const settings = await getVSLASetupRules(groupId);
  const currentShareValue = Number(settings?.share_value ?? 0);
  const unimportedSavings = await db.getFirstAsync<{ amount: number }>(
    `SELECT COALESCE(SUM(ft.amount), 0) AS amount
     FROM financial_transactions ft
     LEFT JOIN historical_transaction_imports h ON h.transaction_id = ft.id
     WHERE ft.group_id = ? AND ft.member_id = ? AND ft.account_type = 'savings'
       AND ft.transaction_type = 'savings_contribution' AND ft.reversed = 0
       AND h.id IS NULL`,
    groupId, memberId,
  );
  const hasHistoricalShares = Number(imported?.count ?? 0) > 0;
  const openingShares = hasHistoricalShares ? 0 : Number(opening?.opening_shares ?? 0);
  const rawEstimatedShares = currentShareValue > 0
    ? Number(unimportedSavings?.amount ?? 0) / currentShareValue
    : 0;
  const roundedEstimatedShares = Math.round(rawEstimatedShares);
  const sharesEstimated = Math.abs(rawEstimatedShares - roundedEstimatedShares) > 0.001 || Number(unimportedSavings?.amount ?? 0) > 0;
  return {
    savings,
    shares: Number(imported?.shares ?? 0) + openingShares + roundedEstimatedShares,
    sharesEstimated,
  };
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
  'groups', 'group_registration_attempts', 'members', 'member_opening_balances', 'onboarding_balance_audit',
  'deleted_member_numbers', 'member_next_of_kin', 'next_of_kin_change_history', 'next_of_kin_benefits', 'group_rules',
  'vsla_setup_rules', 'group_meetings', 'member_credentials',
  'member_auth_attempts', 'member_transaction_signatures', 'app_access_sessions',
  'app_access_authorizers', 'meeting_attendance', 'meeting_closures',
  'financial_accounts', 'financial_collections', 'financial_collection_items',
  'financial_transactions', 'historical_transaction_imports', 'historical_extra_entries', 'historical_member_loan_balances', 'financial_transaction_reversals', 'receipts',
  'notification_queue', 'notification_delivery', 'meeting_audit_records',
  'sync_queue', 'member_passbook_records', 'member_statement_records',
  'loan_interest_charges', 'meeting_loan_interest_charges', 'loan_policy_settings', 'loan_committee_members', 'loan_applications',
  'loan_records', 'loan_repayment_schedule', 'loan_contract_interest_charges', 'loan_guarantors',
  'loan_committee_approvals', 'loan_deductions',
  'loan_emergency_freezes', 'loan_audit_log',
] as const;

export async function createDatabaseBackup(): Promise<string> {
  const db = await getDatabase();
  const tables: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await db.getAllAsync(`SELECT * FROM ${table}`);
  }
  return JSON.stringify({ version: 1, created_at: now(), tables } satisfies EbadsaveBackup);
}

/**
 * Create a group-specific backup without changing local data.
 * Rows are selected through the group's id and its member IDs. The output
 * retains the source table schemas/columns but includes only this group's rows.
 */
export async function createGroupDatabaseBackup(groupId: number): Promise<string> {
  if (!Number.isInteger(groupId) || groupId <= 0) {
    throw new Error('A valid local group ID is required for group backup.');
  }

  const db = await getDatabase();
  const group = await db.getFirstAsync<{ id: number; group_number: string | number }>(
    'SELECT id, group_number FROM groups WHERE id = ? LIMIT 1',
    groupId,
  );
  if (!group) throw new Error('The selected group does not exist on this device.');

  const members = await db.getAllAsync<{ id: number }>(
    'SELECT id FROM members WHERE group_id = ?',
    groupId,
  );
  const memberIds = members.map((member) => Number(member.id));
  const memberSet = new Set(memberIds);
  const tables: Record<string, unknown[]> = {};

  // Table-to-owner mappings are explicit. Unknown tables are included only if
  // empty, so adding a table cannot accidentally leak other groups' data.
  const groupTables = new Set([
    'group_registration_attempts', 'group_rules', 'vsla_setup_rules',
    'group_meetings', 'financial_accounts', 'financial_collections',
    'financial_collection_items', 'financial_transactions',
    'financial_transaction_reversals', 'receipts', 'notification_queue',
    'notification_delivery', 'meeting_audit_records', 'sync_queue',
    'member_passbook_records', 'member_statement_records',
    'loan_interest_charges', 'meeting_loan_interest_charges',
    'loan_policy_settings', 'loan_committee_members', 'loan_applications',
    'loan_records', 'loan_repayment_schedule', 'loan_contract_interest_charges',
    'loan_guarantors', 'loan_committee_approvals', 'loan_deductions',
    'loan_emergency_freezes', 'loan_audit_log', 'member_opening_balances',
    'onboarding_balance_audit', 'historical_transaction_imports',
    'historical_extra_entries', 'historical_member_loan_balances',
  ]);
  const memberTables = new Set([
    'deleted_member_numbers', 'member_next_of_kin', 'next_of_kin_change_history',
    'next_of_kin_benefits', 'member_credentials', 'member_auth_attempts',
    'member_transaction_signatures', 'app_access_sessions',
    'app_access_authorizers', 'meeting_attendance', 'meeting_closures',
  ]);

  const schemaCache = new Map<string, Set<string>>();
  for (const table of BACKUP_TABLES) {
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info("${table}")`);
    const columnNames = new Set(columns.map((column) => column.name));
    schemaCache.set(table, columnNames);

    if (table === 'groups') {
      tables[table] = await db.getAllAsync('SELECT * FROM groups WHERE id = ?', groupId);
      continue;
    }
    if (table === 'members') {
      tables[table] = await db.getAllAsync('SELECT * FROM members WHERE group_id = ?', groupId);
      continue;
    }

    // Registration attempts do not store group_id. Include only attempts whose
    // assigned group_number matches this group's KYA number; never include
    // unrelated pending registrations in a group-only backup.
    if (table === 'group_registration_attempts') {
      tables[table] = await db.getAllAsync(
        'SELECT * FROM group_registration_attempts WHERE CAST(group_number AS TEXT) = ?',
        String(group.group_number),
      );
      continue;
    }

    if (groupTables.has(table) && columnNames.has('group_id')) {
      tables[table] = await db.getAllAsync(`SELECT * FROM "${table}" WHERE group_id = ?`, groupId);
      continue;
    }
    if (memberTables.has(table) && columnNames.has('member_id')) {
      const allRows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM "${table}"`);
      tables[table] = allRows.filter((row) => memberSet.has(Number(row.member_id)));
      continue;
    }
    if (memberTables.has(table) && columnNames.has('group_id')) {
      tables[table] = await db.getAllAsync(`SELECT * FROM "${table}" WHERE group_id = ?`, groupId);
      continue;
    }

    // Fail closed: never silently omit rows from a table whose ownership cannot
    // be established. This prevents producing an incomplete group backup.
    const unclassifiedCount = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM "${table}"`);
    if (Number(unclassifiedCount?.count ?? 0) > 0) {
      throw new Error(`Cannot safely create a group backup: ownership for table ${table} is not mapped.`);
    }
    tables[table] = [];
  }

  const payload = {
    version: 1 as const,
    created_at: now(),
    group_number: String(group.group_number).replace(/^KYA\s*/i, ''),
    group_id: groupId,
    tables,
  };
  return JSON.stringify(payload);
}

/**
 * Restore one validated group snapshot transactionally. It deletes/replaces
 * only rows belonging to the target group/member IDs, never the whole DB.
 */
/**
 * Restore a group snapshot only onto a genuinely empty local database.
 *
 * The snapshot preserves source primary/foreign keys. Restoring into a database
 * that already has records would require remapping every foreign-key reference;
 * until that mapping is implemented and tested, this function refuses to merge
 * or replace groups. No existing group or member data is deleted.
 */
export async function restoreGroupDatabaseBackup(
  backup: string,
  expectedGroupNumber: string | number,
): Promise<void> {
  let parsed: (EbadsaveBackup & { group_number?: string | number; group_id?: number });
  try {
    parsed = JSON.parse(backup) as EbadsaveBackup & {
      group_number?: string | number;
      group_id?: number;
    };
  } catch {
    throw new Error('The group backup is not valid JSON. No local data was changed.');
  }

  const normalizeGroupNumber = (value: string | number) =>
    String(value).replace(/^KYA\s*/i, '').trim();
  const expected = normalizeGroupNumber(expectedGroupNumber);
  const actual = normalizeGroupNumber(parsed?.group_number ?? '');
  if (!parsed || parsed.version !== 1 || !parsed.tables || !expected || actual !== expected) {
    throw new Error('Backup group identity does not match the requested KYA group. No local data was changed.');
  }

  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(parsed.tables[table])) {
      throw new Error(`Group backup is missing table ${table}. No local data was changed.`);
    }
  }

  const incomingGroups = parsed.tables.groups as Record<string, unknown>[];
  if (incomingGroups.length !== 1) {
    throw new Error('The backup must contain exactly one group record. No local data was changed.');
  }
  const backupGroup = incomingGroups[0];
  if (normalizeGroupNumber(String(backupGroup.group_number ?? '')) !== expected) {
    throw new Error('The group record inside the backup does not match its group identity. No local data was changed.');
  }

  const db = await getDatabase();
  // Refuse restore if any backed-up table already contains data. This is stricter
  // than checking groups alone and prevents primary-key/FK collisions or merges.
  for (const table of BACKUP_TABLES) {
    const count = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM "${table}"`);
    if (Number(count?.count ?? 0) > 0) {
      throw new Error(
        'This phone already has local records. To protect existing groups, this restore was stopped without changing data. Use a clean app database for this recovery.',
      );
    }
  }

  // Validate the snapshot's internal ownership before inserting anything.
  const groupId = Number(backupGroup.id);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    throw new Error('The backup group ID is invalid. No local data was changed.');
  }
  const memberRows = parsed.tables.members as Record<string, unknown>[];
  const memberIds = new Set<number>();
  for (const member of memberRows) {
    const id = Number(member.id);
    if (!Number.isInteger(id) || id <= 0 || Number(member.group_id) !== groupId) {
      throw new Error('The backup contains an invalid member/group relationship. No local data was changed.');
    }
    if (memberIds.has(id)) throw new Error('The backup contains duplicate member IDs. No local data was changed.');
    memberIds.add(id);
  }

  const groupOwnedTables = new Set([
    'group_registration_attempts', 'group_rules', 'vsla_setup_rules', 'group_meetings',
    'financial_accounts', 'financial_collections', 'financial_collection_items',
    'financial_transactions', 'financial_transaction_reversals', 'receipts',
    'notification_queue', 'notification_delivery', 'meeting_audit_records', 'sync_queue',
    'member_passbook_records', 'member_statement_records', 'loan_interest_charges',
    'meeting_loan_interest_charges', 'loan_policy_settings', 'loan_committee_members',
    'loan_applications', 'loan_records', 'loan_repayment_schedule',
    'loan_contract_interest_charges', 'loan_guarantors', 'loan_committee_approvals',
    'loan_deductions', 'loan_emergency_freezes', 'loan_audit_log',
    'member_opening_balances', 'onboarding_balance_audit', 'historical_transaction_imports',
    'historical_extra_entries', 'historical_member_loan_balances',
  ]);
  const memberOwnedTables = new Set([
    'deleted_member_numbers', 'member_next_of_kin', 'next_of_kin_change_history',
    'next_of_kin_benefits', 'member_credentials', 'member_auth_attempts',
    'member_transaction_signatures', 'app_access_sessions', 'app_access_authorizers',
    'meeting_attendance', 'meeting_closures',
  ]);
  for (const table of BACKUP_TABLES) {
    if (table === 'groups') continue;
    const rows = parsed.tables[table] as Record<string, unknown>[];
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info("${table}")`);
    const names = new Set(columns.map((column) => column.name));
    for (const row of rows) {
      if (groupOwnedTables.has(table) && names.has('group_id') && Number(row.group_id) !== groupId) {
        throw new Error(`Backup table ${table} contains a row for another group. No local data was changed.`);
      }
      if (memberOwnedTables.has(table) && names.has('group_id') && Number(row.group_id) !== groupId) {
        throw new Error(`Backup table ${table} contains a row for another group. No local data was changed.`);
      }
      if (memberOwnedTables.has(table) && names.has('member_id') && !memberIds.has(Number(row.member_id))) {
        throw new Error(`Backup table ${table} contains a row for an unknown member. No local data was changed.`);
      }
    }
  }

  await db.execAsync('BEGIN TRANSACTION;');
  try {
    for (const table of BACKUP_TABLES) {
      const rows = parsed.tables[table] as Record<string, unknown>[];
      for (const row of rows) {
        const keys = Object.keys(row);
        if (!keys.length) continue;
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map((key) => row[key] as any);
        await db.runAsync(
          `INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(', ')}) VALUES (${placeholders})`,
          ...values,
        );
      }
    }
    await db.execAsync('COMMIT;');
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }

  const restoredGroup = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM groups WHERE CAST(group_number AS TEXT) = ? OR CAST(group_number AS TEXT) = ? LIMIT 1',
    expected,
    `KYA ${expected}`,
  );
  if (restoredGroup) {
    await ensureFinancialAccountsForAllGroups(db);
    await recalculateFinancialAccountsForGroup(db, restoredGroup.id);
  }
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
  if (!isTestGroup) {
    const registered = await registerGroupWithBack4App({
      groupName,
      district,
      country,
    });
    return registered.id;
  }

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
  // Test groups stay local. Production KYA numbers are reserved by Back4App Cloud Code.
  if (input.isTestGroup === true) {
    const groupId = await createGroup(
      input.groupName,
      input.district,
      input.country,
      true,
    );
    const testGroup = await getGroupById(groupId);
    if (!testGroup) throw new Error('Test group was created but could not be loaded.');
    return testGroup;
  }

  return registerGroupWithBack4App(input);
}

type Back4AppCloudResult<T> = { result?: T };

async function callBack4AppFunction<T>(
  functionName: string,
  params: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BACK4APP_SERVER_URL}/functions/${functionName}`, {
      method: 'POST',
      headers: {
        'X-Parse-Application-Id': BACK4APP_APPLICATION_ID,
        'X-Parse-Javascript-Key': BACK4APP_JAVASCRIPT_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
  } catch (error) {
    throw new Error('Could not reach Back4App. Check your internet connection and try again.');
  }

  const responseText = await response.text();
  let payload: unknown = {};
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = { error: responseText };
    }
  }

  if (!response.ok) {
    const details = payload as { error?: string; code?: number };
    throw new Error(
      details.error
        ? `Back4App registration error${details.code ? ` (${details.code})` : ''}: ${details.error}`
        : `Back4App request failed (${response.status}).`,
    );
  }

  const cloudPayload = payload as Back4AppCloudResult<T>;
  if (!cloudPayload || !Object.prototype.hasOwnProperty.call(cloudPayload, 'result')) {
    throw new Error(`Back4App Cloud Code function "${functionName}" returned an invalid response.`);
  }
  return cloudPayload.result as T;
}

function legacyRegistrationId(group: GroupRecord): string {
  const identity = [
    parseGroupNumber(group.group_number),
    group.group_name,
    group.district,
    group.country,
  ].join('_').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 180);
  return `legacy_${identity}`;
}

async function syncExistingGroupsToBack4App(groups: GroupRecord[]): Promise<void> {
  const productionGroups = groups
    .map((group) => ({
      groupNumber: parseGroupNumber(group.group_number),
      groupName: group.group_name,
      district: group.district,
      country: group.country,
      status: group.status,
      lastActivityAt: group.last_activity_at,
      registrationId: group.back4app_registration_id || legacyRegistrationId(group),
    }))
    .filter((group) => group.groupNumber >= GROUP_START && group.groupNumber <= GROUP_END);

  // Small batches avoid oversized Cloud Code requests on devices with many local groups.
  for (let index = 0; index < productionGroups.length; index += 100) {
    await callBack4AppFunction<{ synced: number }>(
      'syncKyaGroupReservations',
      { groups: productionGroups.slice(index, index + 100) },
    );
  }
}

/**
 * Production registration is coordinated through Back4App, never Firebase.
 * The local SQLite record is only marked active after Back4App finalizes the reservation.
 */
async function getOrCreatePendingGroupRegistration(
  localDb: SQLite.SQLiteDatabase,
  groupName: string,
  district: string,
  country: string,
  timestamp: string,
): Promise<{ id: string; created_at: string }> {
  const pending = await localDb.getFirstAsync<{ id: string; created_at: string }>(
    `SELECT id, created_at FROM group_registration_attempts
     WHERE status = 'pending' AND group_name = ? AND district = ? AND country = ?
     ORDER BY created_at DESC LIMIT 1`,
    groupName,
    district,
    country,
  );
  if (pending) return pending;

  const id = generateLocalId();
  await localDb.runAsync(
    `INSERT INTO group_registration_attempts (
      id, group_name, district, country, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    id,
    groupName,
    district,
    country,
    timestamp,
    timestamp,
  );
  return { id, created_at: timestamp };
}

export async function registerGroupWithBack4App(input: {
  groupName: string;
  district: string;
  country: string;
}): Promise<GroupRecord> {
  const cleanName = normalizeText(input.groupName);
  const cleanDistrict = normalizeText(input.district);
  const cleanCountry = normalizeText(input.country);

  if (!cleanName) throw new Error('Group name is required.');
  if (!cleanDistrict) throw new Error('District is required.');
  if (!cleanCountry) throw new Error('Country is required.');

  const localDb = await getDatabase();
  const timestamp = now();
  const pending = await getOrCreatePendingGroupRegistration(
    localDb,
    cleanName,
    cleanDistrict,
    cleanCountry,
    timestamp,
  );
  const registrationId = pending.id;

  // Sync numbers already stored on this device first, preventing a migrated local
  // production group from being assigned to a different group in the cloud registry.
  const existingGroups = await getAllGroups();
  await syncExistingGroupsToBack4App(existingGroups);

  const reservation = await callBack4AppFunction<{ groupNumber: number; registrationId: string }>(
    'reserveKyaGroupNumber',
    {
      registrationId,
      groupName: cleanName,
      district: cleanDistrict,
      country: cleanCountry,
      createdAt: pending.created_at,
    },
  );
  const groupNumber = Number(reservation?.groupNumber);
  if (!Number.isInteger(groupNumber) || groupNumber < GROUP_START || groupNumber > GROUP_END) {
    throw new Error('Back4App did not return a valid KYA group number.');
  }

  await localDb.runAsync(
    `UPDATE group_registration_attempts
     SET group_number = ?, updated_at = ?
     WHERE id = ?`,
    groupNumber,
    now(),
    registrationId,
  );

  let localGroup = await localDb.getFirstAsync<{ id: number; status: string }>(
    `SELECT id, status FROM groups WHERE back4app_registration_id = ? LIMIT 1`,
    registrationId,
  );

  if (!localGroup) {
    const createdAt = pending.created_at || now();
    const result = await localDb.runAsync(
      `INSERT INTO groups (
        group_number, group_name, district, country, status,
        created_at, last_activity_at, back4app_registration_id
      ) VALUES (?, ?, ?, ?, 'pending_registration', ?, ?, ?)`,
      groupNumber,
      cleanName,
      cleanDistrict,
      cleanCountry,
      createdAt,
      now(),
      registrationId,
    );
    localGroup = { id: Number(result.lastInsertRowId), status: 'pending_registration' };
  }

  const groupId = localGroup.id;
  await ensureFinancialAccountsForGroup(localDb, groupId);
  await insertDefaultConstitution(localDb, groupId);
  await createDefaultVSLASetupRules(localDb, groupId);

  await callBack4AppFunction<{ groupNumber: number; status: string }>(
    'finalizeKyaGroupRegistration',
    {
      registrationId,
      groupNumber,
      groupName: cleanName,
      district: cleanDistrict,
      country: cleanCountry,
    },
  );

  await localDb.runAsync(
    `UPDATE groups SET status = 'active', last_activity_at = ? WHERE id = ?`,
    now(),
    groupId,
  );
  await localDb.runAsync(
    `UPDATE group_registration_attempts SET status = 'completed', updated_at = ? WHERE id = ?`,
    now(),
    registrationId,
  );

  const result = await getGroupById(groupId);
  if (!result) throw new Error('Group was registered but could not be loaded.');
  return result;
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

export async function getGroupOnboardingLock(groupId: number): Promise<{
  onboarding_mode: 'new' | 'existing';
  onboarding_locked: boolean;
  onboarding_locked_at: string | null;
}> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    onboarding_mode: 'new' | 'existing';
    onboarding_locked: number;
    onboarding_locked_at: string | null;
  }>(
    `SELECT onboarding_mode, onboarding_locked, onboarding_locked_at
     FROM groups WHERE id = ? LIMIT 1`,
    groupId,
  );

  if (!row) throw new Error('Group not found.');
  return {
    onboarding_mode: row.onboarding_mode,
    onboarding_locked: Number(row.onboarding_locked) === 1,
    onboarding_locked_at: row.onboarding_locked_at,
  };
}

export async function setGroupOnboardingMode(
  groupId: number,
  mode: 'new' | 'existing',
): Promise<void> {
  const db = await getDatabase();
  const group = await db.getFirstAsync<{
    onboarding_locked: number;
  }>(
    `SELECT onboarding_locked FROM groups WHERE id = ? LIMIT 1`,
    groupId,
  );
  if (!group) throw new Error('Group not found.');
  if (Number(group.onboarding_locked) === 1) {
    throw new Error('Onboarding is permanently locked because the first digital meeting has been closed.');
  }
  await db.runAsync(
    `UPDATE groups SET onboarding_mode = ? WHERE id = ? AND onboarding_locked = 0`,
    mode,
    groupId,
  );
}

export type MemberOpeningBalanceRecord = {
  member_id: number;
  group_id: number;
  opening_shares: number | null;
  share_value: number | null;
  opening_savings: number | null;
  opening_loan_balance: number;
  loan_due_date: string | null;
  saved_at: string;
};

export async function getMemberOpeningBalances(
  groupId: number,
): Promise<MemberOpeningBalanceRecord[]> {
  const db = await getDatabase();
  return db.getAllAsync<MemberOpeningBalanceRecord>(
    `SELECT member_id, group_id, opening_shares, share_value,
            opening_savings, opening_loan_balance, loan_due_date, saved_at
     FROM member_opening_balances
     WHERE group_id = ?
     ORDER BY member_id ASC`,
    groupId,
  );
}

export type MemberOpeningBalanceInput = {
  member_id: number;
  opening_shares: number | null;
  share_value: number | null;
  opening_savings: number | null;
  opening_loan_balance: number;
  loan_due_date: string | null;
};

export async function saveMemberOpeningBalances(
  groupId: number,
  entries: MemberOpeningBalanceInput[],
): Promise<void> {
  const db = await getDatabase();
  const timestamp = now();

  const group = await db.getFirstAsync<{ onboarding_locked: number }>(
    `SELECT onboarding_locked FROM groups WHERE id = ? LIMIT 1`,
    groupId,
  );
  if (!group) throw new Error('Group not found.');
  if (Number(group.onboarding_locked) === 1) {
    throw new Error('Onboarding is permanently locked because the first digital meeting has been closed.');
  }

  for (const entry of entries) {
    const values = [entry.opening_shares, entry.share_value, entry.opening_savings, entry.opening_loan_balance];
    if (values.some((value) => value !== null && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
      throw new Error('Opening balances must be non-negative valid numbers.');
    }
    if (entry.opening_shares !== null && !Number.isInteger(entry.opening_shares)) {
      throw new Error('Opening shares must be a whole number.');
    }
  }

  await db.withTransactionAsync(async () => {
    const currentGroup = await db.getFirstAsync<{ onboarding_locked: number }>(
      `SELECT onboarding_locked FROM groups WHERE id = ? LIMIT 1`,
      groupId,
    );
    if (!currentGroup) throw new Error('Group not found.');
    if (Number(currentGroup.onboarding_locked) === 1) {
      throw new Error('Onboarding is permanently locked because the first digital meeting has been closed.');
    }

    for (const entry of entries) {
      const member = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM members WHERE id = ? AND group_id = ? AND status = 'active' LIMIT 1`,
        entry.member_id,
        groupId,
      );
      if (!member) throw new Error(`Member ${entry.member_id} does not belong to this group or is inactive.`);

      await db.runAsync(
        `INSERT INTO member_opening_balances
          (member_id, group_id, opening_shares, share_value, opening_savings,
           opening_loan_balance, loan_due_date, saved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(member_id) DO UPDATE SET
           group_id = excluded.group_id,
           opening_shares = excluded.opening_shares,
           share_value = excluded.share_value,
           opening_savings = excluded.opening_savings,
           opening_loan_balance = excluded.opening_loan_balance,
           loan_due_date = excluded.loan_due_date,
           saved_at = excluded.saved_at`,
        entry.member_id,
        groupId,
        entry.opening_shares,
        entry.share_value,
        entry.opening_savings,
        entry.opening_loan_balance,
        entry.loan_due_date,
        timestamp,
      );

      await db.runAsync(
        `INSERT INTO onboarding_balance_audit
          (group_id, member_id, action, details, created_at)
         VALUES (?, ?, 'opening_balance_saved', ?, ?)`,
        groupId,
        entry.member_id,
        JSON.stringify({
          opening_shares: entry.opening_shares,
          share_value: entry.share_value,
          opening_savings: entry.opening_savings,
          opening_loan_balance: entry.opening_loan_balance,
          loan_due_date: entry.loan_due_date,
        }),
        timestamp,
      );
    }
  });
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
    `This group shall operate as ${cleanName}, located in ${cleanDistrict}, ${cleanCountry}, under the unique group number KYA ${existingGroup.group_number}. Its purpose is to encourage members to save together, grow together, access appropriate financial services, support one another, and improve the financial wellbeing of members.`,
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
  const groupIdentity = await db.getFirstAsync<{
    group_number: string | number;
    group_name: string;
    district: string;
    country: string;
  }>(
    `SELECT group_number, group_name, district, country FROM groups WHERE id = ? LIMIT 1`,
    groupId,
  );
  const articleOne = groupIdentity
    ? `This group shall operate as ${groupIdentity.group_name}, located in ${groupIdentity.district}, ${groupIdentity.country}, under the unique group number KYA ${parseGroupNumber(groupIdentity.group_number)}. Its purpose is to encourage members to save together, grow together, access appropriate financial services, support one another, and improve the financial wellbeing of members.`
    : 'This group shall operate under its registered group name and unique KYA number. Its purpose is to encourage members to save together, grow together, access appropriate financial services, support one another, and improve the financial wellbeing of members.';

  const articles: Array<
    [number, string, string]
  > = [
    [
      1,
      'Name and Purpose',
      articleOne,
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

export type MeetingDayInterestResult = {
  meetingId: number;
  meetingDate: string;
  checkedMembers: number;
  chargedMembers: number;
  totalInterest: number;
  skippedByPeriod: boolean;
  message: string;
};

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  return match[1];
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** Add months from the original anchor, clamping only when a month is shorter. */
function addMonthsToDateOnly(anchorDate: string, months: number): string {
  const [year, month, day] = anchorDate.split('-').map(Number);
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = firstOfTarget.getUTCFullYear();
  const targetMonth = firstOfTarget.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

function monthOffsetBetweenDates(anchorDate: string, laterDate: string): number {
  const [ay, am] = anchorDate.split('-').map(Number);
  const [ly, lm] = laterDate.split('-').map(Number);
  return (ly - ay) * 12 + (lm - am);
}

function daysBetweenDates(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.floor((to - from) / 86400000);
}

/**
 * Applies monthly interest at most once for each contract's scheduled interest
 * date. New contracts use the date selected on Loan Disbursement; old contracts
 * without that saved anchor retain their historical meeting-day cadence.
 */
export async function applyMeetingDayLoanInterest(
  groupId: number,
  meetingId: number,
): Promise<MeetingDayInterestResult> {
  const db = await getDatabase();
  const meeting = await db.getFirstAsync<{ id: number; group_id: number; meeting_date: string; status: string }>(
    `SELECT id, group_id, meeting_date, status FROM group_meetings WHERE id = ? AND group_id = ? LIMIT 1`,
    meetingId, groupId,
  );
  if (!meeting) throw new Error('Cannot apply meeting interest: meeting not found for this group.');
  if (String(meeting.status).toLowerCase() !== 'open') {
    throw new Error('Meeting interest can only be applied to an open meeting.');
  }

  const meetingDate = dateOnly(meeting.meeting_date);
  if (!meetingDate) throw new Error('The meeting date is not valid.');
  const setup = await getVSLASetupRules(groupId);
  const legacyPeriod = String(setup?.loan_interest_period ?? 'per month').trim().toLowerCase();
  const legacyPercentage = Number(setup?.loan_interest_percentage ?? 0);
  const legacyMethod: LoanInterestMethod = setup?.loan_interest_method ?? 'fixed';

  const members = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM members WHERE group_id = ? AND LOWER(TRIM(status)) = 'active' ORDER BY id`,
    groupId,
  );
  let checkedMembers = 0;
  let chargedMembers = 0;
  let totalInterest = 0;
  let skippedLegacyByPeriod = legacyPeriod !== 'per month';

  for (const member of members) {
    // Newly-created monthly contracts are charged from the loan's saved terms,
    // not today's Setup Rules, so later rule edits do not change existing loans.
    const contractLoans = await db.getAllAsync<{
      id: number;
      principal_amount: number;
      interest_method: LoanInterestMethod;
      interest_rate: number;
      interest_period: string;
      issue_date: string;
      due_date: string;
      interest_anchor_date: string | null;
      interest_day_offset: number | null;
      status: string;
      monthly_recalculation_enabled: number;
    }>(
      `SELECT id, principal_amount, interest_method, interest_rate, interest_period,
              issue_date, due_date, interest_anchor_date, interest_day_offset, status, monthly_recalculation_enabled
       FROM loan_records
       WHERE group_id = ? AND member_id = ? AND status IN ('active', 'frozen')
       ORDER BY issue_date ASC, id ASC`,
      groupId, member.id,
    );

    if (contractLoans.length > 0) {
      checkedMembers += 1;
      let memberCharged = false;

      for (const loan of contractLoans) {
        if (Number(loan.monthly_recalculation_enabled ?? 0) !== 1 ||
            loan.status !== 'active' ||
            String(loan.interest_period).trim().toLowerCase() !== 'per month' ||
            !['flat', 'declining'].includes(loan.interest_method)) {
          continue;
        }
        const rate = Number(loan.interest_rate);
        if (!Number.isFinite(rate) || rate <= 0) continue;

        const alreadyCharged = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM loan_contract_interest_charges WHERE loan_id = ? AND meeting_id = ? LIMIT 1`,
          loan.id, meetingId,
        );
        if (alreadyCharged) continue;

        let scheduledInterestDate: string | null = null;
        const explicitDateCount = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM loan_interest_schedule_dates WHERE loan_id = ?`, loan.id,
        );
        if (Number(explicitDateCount?.count ?? 0) > 0) {
          // Period 1 interest is included in the Day-1 disbursement amount.
          // Later saved dates are charged once, at the first open meeting on/after each date.
          const nextSavedDate = await db.getFirstAsync<{ scheduled_date: string }>(
            `SELECT d.scheduled_date
             FROM loan_interest_schedule_dates d
             WHERE d.loan_id = ? AND d.period_number > 1
               AND d.scheduled_date <= ?
               AND NOT EXISTS (
                 SELECT 1 FROM loan_contract_interest_charges c
                 WHERE c.loan_id = d.loan_id AND c.scheduled_interest_date = d.scheduled_date
               )
             ORDER BY d.period_number ASC LIMIT 1`,
            loan.id, dateOnly(loan.due_date) ?? loan.due_date,
          );
          if (!nextSavedDate) continue;
          scheduledInterestDate = dateOnly(nextSavedDate.scheduled_date);
          if (!scheduledInterestDate || meetingDate < scheduledInterestDate) continue;
        } else {
          const interestAnchorDate = dateOnly(loan.interest_anchor_date);
          if (interestAnchorDate) {
            // Legacy loans without saved per-period dates retain their original anchor-based cadence.
            const latestScheduled = await db.getFirstAsync<{ scheduled_interest_date: string | null }>(
              `SELECT MAX(scheduled_interest_date) AS scheduled_interest_date
               FROM loan_contract_interest_charges
               WHERE loan_id = ? AND scheduled_interest_date IS NOT NULL`,
              loan.id,
            );
            const lastScheduledDate = dateOnly(latestScheduled?.scheduled_interest_date);
            const monthsAfterAnchor = lastScheduledDate
              ? Math.max(0, monthOffsetBetweenDates(interestAnchorDate, lastScheduledDate) + 1)
              : 0;
            scheduledInterestDate = addMonthsToDateOnly(interestAnchorDate, monthsAfterAnchor);
            if (meetingDate < scheduledInterestDate) continue;
            const alreadyForScheduledDate = await db.getFirstAsync<{ id: number }>(
              `SELECT id FROM loan_contract_interest_charges
               WHERE loan_id = ? AND scheduled_interest_date = ? LIMIT 1`,
              loan.id, scheduledInterestDate,
            );
            if (alreadyForScheduledDate) continue;
          } else {
          // Legacy contracts created before the saved date selector keep their
          // prior 27–35 day cadence; the selected-date rule applies to new loans.
          const priorCharge = await db.getFirstAsync<{ charge_date: string | null }>(
            `SELECT MAX(charge_date) AS charge_date
             FROM loan_contract_interest_charges WHERE loan_id = ?`,
            loan.id,
          );
          const referenceDate = dateOnly(priorCharge?.charge_date) ?? dateOnly(loan.issue_date);
          if (!referenceDate) continue;
          const elapsedDays = daysBetweenDates(referenceDate, meetingDate);
          if (elapsedDays < 27 || elapsedDays > 35) continue;
          }
        }

        const outstanding = await db.getFirstAsync<{ balance: number }>(
          `SELECT COALESCE(SUM(
              MAX(0, principal_due - principal_paid) + MAX(0, interest_due - interest_paid)
            ), 0) AS balance
           FROM loan_repayment_schedule WHERE loan_id = ?`,
          loan.id,
        );
        const outstandingBalance = Math.max(0, Number(outstanding?.balance ?? 0));
        if (outstandingBalance <= 0) continue;

        // Fixed monthly interest uses the original principal every month.
        // Declining monthly interest uses the actual remaining amount owed,
        // including previously accrued interest that has not yet been repaid.
        const interestBasis = loan.interest_method === 'flat'
          ? Number(loan.principal_amount)
          : outstandingBalance;
        const interestAmount = Number((interestBasis * rate / 100).toFixed(2));
        if (!Number.isFinite(interestAmount) || interestAmount <= 0) continue;

        const nextInstallment = await db.getFirstAsync<{ id: number; interest_due: number }>(
          `SELECT id, interest_due FROM loan_repayment_schedule
           WHERE loan_id = ?
             AND (principal_paid + 0.000001 < principal_due OR interest_paid + 0.000001 < interest_due)
           ORDER BY due_date ASC, installment_number ASC LIMIT 1`,
          loan.id,
        );
        if (!nextInstallment) continue;

        await db.execAsync('BEGIN TRANSACTION;');
        try {
          const inserted = await db.runAsync(
            `INSERT OR IGNORE INTO loan_contract_interest_charges (
              group_id, loan_id, member_id, meeting_id, charge_date, scheduled_interest_date,
              opening_balance, interest_percentage, interest_method, interest_amount, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            groupId, loan.id, member.id, meetingId, meetingDate, scheduledInterestDate,
            interestBasis, rate, loan.interest_method, interestAmount, now(),
          );

          if (Number(inserted.changes ?? 0) === 1) {
            await db.runAsync(
              `UPDATE loan_repayment_schedule
               SET interest_due = interest_due + ?, updated_at = ? WHERE id = ?`,
              interestAmount, now(), nextInstallment.id,
            );
            await db.runAsync(
              `UPDATE loan_records
               SET total_interest = total_interest + ?, total_due = total_due + ?, updated_at = ?
               WHERE id = ? AND status = 'active'`,
              interestAmount, interestAmount, now(), loan.id,
            );
            await db.execAsync('COMMIT;');
            totalInterest += interestAmount;
            if (!memberCharged) {
              chargedMembers += 1;
              memberCharged = true;
            }
          } else {
            await db.execAsync('ROLLBACK;');
          }
        } catch (error) {
          await db.execAsync('ROLLBACK;');
          throw error;
        }
      }
      // Do not fall through to the legacy member-level calculation for contract borrowers.
      continue;
    }

    // Keep compatibility for old loans without a saved loan contract.
    if (legacyPeriod !== 'per month' || !Number.isFinite(legacyPercentage) || legacyPercentage <= 0) continue;
    const alreadyForMeeting = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM meeting_loan_interest_charges WHERE group_id = ? AND member_id = ? AND meeting_id = ? LIMIT 1`,
      groupId, member.id, meetingId,
    );
    if (alreadyForMeeting) continue;

    const issued = await db.getFirstAsync<{ total: number; latest_date: string | null }>(
      `SELECT COALESCE(SUM(ABS(amount)), 0) AS total, MAX(substr(created_at, 1, 10)) AS latest_date
       FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND account_type = 'loan_fund'
         AND transaction_type = 'loan_issued' AND reversed = 0`,
      groupId, member.id,
    );
    const repayments = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND account_type = 'loan_repayment'
         AND transaction_type = 'loan_repayment' AND reversed = 0`,
      groupId, member.id,
    );
    const originalPrincipal = Math.max(0, Number(issued?.total ?? 0));
    const outstandingPrincipal = Math.max(0, originalPrincipal - Number(repayments?.total ?? 0));
    if (originalPrincipal <= 0 || outstandingPrincipal <= 0) continue;
    checkedMembers += 1;

    const priorLegacyCharge = await db.getFirstAsync<{ charge_date: string | null }>(
      `SELECT MAX(substr(created_at, 1, 10)) AS charge_date FROM loan_interest_charges WHERE group_id = ? AND member_id = ?`,
      groupId, member.id,
    );
    const priorMeetingCharge = await db.getFirstAsync<{ charge_date: string | null }>(
      `SELECT MAX(charge_date) AS charge_date FROM meeting_loan_interest_charges WHERE group_id = ? AND member_id = ?`,
      groupId, member.id,
    );
    const referenceDates = [
      dateOnly(issued?.latest_date),
      dateOnly(priorLegacyCharge?.charge_date),
      dateOnly(priorMeetingCharge?.charge_date),
    ].filter((value): value is string => Boolean(value)).sort();
    const referenceDate = referenceDates.length ? referenceDates[referenceDates.length - 1] : null;
    if (!referenceDate) continue;

    const days = daysBetweenDates(referenceDate, meetingDate);
    if (days < 27 || days > 35) continue;

    // The old 'fixed' method remains a one-time charge for legacy loans.
    if (legacyMethod === 'fixed') {
      const anyPriorInterest = await db.getFirstAsync<{ count: number }>(
        `SELECT
           (SELECT COUNT(*) FROM loan_interest_charges
             WHERE group_id = ? AND member_id = ? AND substr(created_at, 1, 10) >= ?)
           + (SELECT COUNT(*) FROM meeting_loan_interest_charges
             WHERE group_id = ? AND member_id = ? AND charge_date >= ?)
           AS count`,
        groupId, member.id, dateOnly(issued?.latest_date) ?? meetingDate,
        groupId, member.id, dateOnly(issued?.latest_date) ?? meetingDate,
      );
      if (Number(anyPriorInterest?.count ?? 0) > 0) continue;
    }

    const accumulatedMeetingInterest = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(interest_amount), 0) AS total
       FROM meeting_loan_interest_charges WHERE group_id = ? AND member_id = ?`,
      groupId, member.id,
    );
    const compoundBalance = outstandingPrincipal + Number(accumulatedMeetingInterest?.total ?? 0);
    const interestBasis = legacyMethod === 'declining'
      ? compoundBalance
      : legacyMethod === 'flat'
        ? originalPrincipal + Number(accumulatedMeetingInterest?.total ?? 0)
        : originalPrincipal;
    const interestAmount = Number((interestBasis * legacyPercentage / 100).toFixed(2));
    if (!Number.isFinite(interestAmount) || interestAmount <= 0) continue;

    const insertion = await db.runAsync(
      `INSERT OR IGNORE INTO meeting_loan_interest_charges (
        group_id, member_id, meeting_id, charge_date, opening_balance,
        interest_percentage, interest_method, interest_amount, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      groupId, member.id, meetingId, meetingDate, interestBasis, legacyPercentage, legacyMethod, interestAmount, now(),
    );
    if (Number(insertion.changes ?? 0) > 0) {
      chargedMembers += 1;
      totalInterest += interestAmount;
    }
  }

  return {
    meetingId,
    meetingDate,
    checkedMembers,
    chargedMembers,
    totalInterest: Number(totalInterest.toFixed(2)),
    skippedByPeriod: skippedLegacyByPeriod && chargedMembers === 0,
    message: chargedMembers > 0
      ? `Monthly interest recorded for ${chargedMembers} member(s): ${totalInterest.toLocaleString()} in group currency.`
      : skippedLegacyByPeriod
        ? `No legacy monthly interest was applied because this group selected “${legacyPeriod}”. Existing monthly contracts continue using their saved terms.`
        : 'No monthly interest was due. A contract charge is considered 27–35 days after the loan issue or previous monthly charge.',
  };
}
export async function applyMonthlyLoanInterest(
  groupId: number,
  memberId: number,
): Promise<number> {
  const db = await getDatabase();

  const setup = await getVSLASetupRules(groupId);

  const contractLoan = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM loan_records WHERE group_id = ? AND member_id = ? AND status = 'active' LIMIT 1`,
    groupId, memberId,
  );
  if (contractLoan) return 0;

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

  const loanInterestMethod =
    data.loanInterestMethod ??
    current.loan_interest_method ??
    'fixed';

  if (!['fixed', 'flat', 'declining'].includes(loanInterestMethod)) {
    throw new Error('Choose Fixed, Flat, or Declining interest.');
  }

  const loanRepaymentAmountMode =
    data.loanRepaymentAmountMode ??
    current.loan_repayment_amount_mode ??
    'flexible';

  const loanRepaymentPeriodMode =
    data.loanRepaymentPeriodMode ??
    current.loan_repayment_period_mode ??
    'flexible';

  const loanInterestCalculator =
    data.loanInterestCalculator ??
    current.loan_interest_calculator ??
    'common_vsla';

  if (!['flexible', 'fixed'].includes(loanRepaymentAmountMode)) {
    throw new Error('Choose flexible or fixed repayment amount.');
  }
  if (!['flexible', 'fixed'].includes(loanRepaymentPeriodMode)) {
    throw new Error('Choose flexible or fixed repayment period.');
  }
  if (!['standard', 'common_vsla'].includes(loanInterestCalculator)) {
    throw new Error('Choose Standard or Common VSLA interest calculator.');
  }

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

  const insuranceContributionAmount =
    data.insuranceContributionAmount !== undefined
      ? Number(data.insuranceContributionAmount)
      : Number(current.insurance_contribution_amount ?? 0);

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

  const allowSocialFundForLoans =
    data.allowSocialFundForLoans === undefined
      ? Number(current.allow_social_fund_for_loans ?? 0)
      : data.allowSocialFundForLoans ? 1 : 0;

  const allowExternalFundForLoans =
    data.allowExternalFundForLoans === undefined
      ? Number(current.allow_external_fund_for_loans ?? 0)
      : data.allowExternalFundForLoans ? 1 : 0;

  const allowFinesForLoans =
    data.allowFinesForLoans === undefined
      ? Number(current.allow_fines_for_loans ?? 1)
      : data.allowFinesForLoans ? 1 : 0;

  const meetingFrequency =
    normalizeText(
      data.meetingFrequency ??
        current.meeting_frequency,
    );

  const meetingStartDate =
    data.meetingStartDate !== undefined
      ? data.meetingStartDate
      : current.meeting_start_date;

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

  const shareOutMethodology =
    data.shareOutMethodology ??
    current.share_out_methodology ??
    'savings_based';

  if (
    shareOutMethodology !== 'savings_based' &&
    shareOutMethodology !== 'share_based'
  ) {
    throw new Error('Select a valid share-out methodology.');
  }

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
    !Number.isFinite(insuranceContributionAmount) ||
    insuranceContributionAmount < 0
  ) {
    throw new Error(
      'Insurance contribution per meeting cannot be negative.',
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

  const isLegacyMonthlyWeekdayRule = /^(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(meetingFrequency);
  const isWeeklyRule = /^weekly_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(meetingFrequency);
  const isTwiceDatesRule = /^twice_dates_(\d{1,2})_(\d{1,2})$/.test(meetingFrequency);
  const isTwiceWeekdayRule = /^twice_rules_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(meetingFrequency);
  const isMonthlyDateRule = /^monthly_date_(\d{1,2})$/.test(meetingFrequency);
  const isMonthlyWeekdayRule = /^monthly_rule_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(meetingFrequency);
  if (!['weekly', 'biweekly', 'monthly'].includes(meetingFrequency) && !isLegacyMonthlyWeekdayRule && !isWeeklyRule && !isTwiceDatesRule && !isTwiceWeekdayRule && !isMonthlyDateRule && !isMonthlyWeekdayRule) {
    throw new Error('Choose a valid weekly, twice-a-month, or monthly meeting schedule.');
  }
  if (isTwiceDatesRule || isMonthlyDateRule) {
    const numbers = meetingFrequency.match(/\d+/g)?.map(Number) ?? [];
    const days = isTwiceDatesRule ? numbers.slice(-2) : numbers.slice(-1);
    if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 31) || (isTwiceDatesRule && days[0] === days[1])) {
      throw new Error('Meeting dates must be between 1 and 31, and twice-monthly dates must differ.');
    }
  }

  if (isLegacyMonthlyWeekdayRule) {
    if (!meetingStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(meetingStartDate)) {
      throw new Error('Choose a date for the selected monthly weekday rule.');
    }
    const selectedDate = new Date(`${meetingStartDate}T00:00:00`);
    const match = meetingFrequency.match(/^(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/)!;
    const weekdayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const lastDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
    const occurrence = Math.floor((selectedDate.getDate() - 1) / 7) + 1;
    const isLast = selectedDate.getDate() + 7 > lastDay;
    const ordinalMatches = match[1] === 'last' ? isLast : occurrence === ({ first: 1, second: 2, third: 3, fourth: 4 } as Record<string, number>)[match[1]];
    if (Number.isNaN(selectedDate.getTime()) || selectedDate.getDay() !== weekdayMap[match[2]] || !ordinalMatches) {
      throw new Error('The selected schedule date does not match the monthly weekday rule.');
    }
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
       loan_interest_method = ?,
       loan_repayment_amount_mode = ?,
       loan_repayment_period_mode = ?,
       loan_interest_calculator = ?,
       loan_interest_period = ?,
       maximum_loan_repayment_period = ?,
       social_fund_contribution = ?,
       insurance_contribution_amount = ?,
       absence_fine = ?,
       late_fine = ?,
       non_insurance_contribution = ?,
       non_saving_fine = ?,
       non_loan_repayment_fine = ?,
       allow_social_fund_for_loans = ?,
       allow_external_fund_for_loans = ?,
       allow_fines_for_loans = ?,
       meeting_frequency = ?,
       meeting_start_date = ?,
       cycle_duration_months = ?,
       leadership_term_months = ?,
       share_out_enabled = ?,
       share_out_methodology = ?,
       updated_at = ?
     WHERE group_id = ?`,
    shareValue,
    minimumShares,
    maximumShares,
    maximumLoanMultiple,
    loanInterestPercentage,
    loanInterestMethod,
    loanRepaymentAmountMode,
    loanRepaymentPeriodMode,
    loanInterestCalculator,
    loanInterestPeriod,
    maximumLoanRepaymentPeriod,
    socialFundContribution,
    insuranceContributionAmount,
    absenceFine,
    lateFine,
    nonInsuranceContribution,
    nonSavingFine,
    nonLoanRepaymentFine,
    allowSocialFundForLoans,
    allowExternalFundForLoans,
    allowFinesForLoans,
    meetingFrequency,
    meetingStartDate,
    cycleDurationMonths,
    leadershipTermMonths,
    shareOutEnabled,
    shareOutMethodology,
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

export type RequiredMemberNextOfKin = {
  slot: 1 | 2;
  name: string;
  phone: string;
  gender?: string | null;
};

export async function registerMember(
  groupId: number,
  fullName: string,
  gender = '',
  age = 0,
  phone = '',
  cell = '',
  district = '',
  nextOfKin: RequiredMemberNextOfKin[] = [],
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

  const kin1 = Array.isArray(nextOfKin) ? nextOfKin.find((item) => item.slot === 1) : undefined;
  const kin2 = Array.isArray(nextOfKin) ? nextOfKin.find((item) => item.slot === 2) : undefined;
  // Next-of-kin contacts are managed separately from member registration.
  // If contacts are supplied by an older caller, validate both; otherwise
  // register the member with empty Slots 1 and 2 for later completion.
  if (Array.isArray(nextOfKin) && nextOfKin.length > 0 && (
    !kin1 || !normalizeText(kin1.name) || !normalizeText(kin1.phone) ||
    !kin2 || !normalizeText(kin2.name) || !normalizeText(kin2.phone)
  )) {
    throw new Error('Provide both next-of-kin contacts with names and phone numbers, or leave both empty.');
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
      (?, 1, ?, ?, ?, 0, 0, ?, ?),
      (?, 2, ?, ?, ?, 0, 0, ?, ?),
      (?, 3, NULL, NULL, NULL, 0, 0, ?, ?)`,
    memberId,
    normalizeText(kin1?.name ?? '') || null,
    normalizeText(kin1?.phone ?? '') || null,
    normalizeText(kin1?.gender ?? '') || null,
    timestamp,
    timestamp,
    memberId,
    normalizeText(kin2?.name ?? '') || null,
    normalizeText(kin2?.phone ?? '') || null,
    normalizeText(kin2?.gender ?? '') || null,
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

  if (!normalizeText(name) || !normalizeText(phone)) {
    throw new Error('Enter the replacement next-of-kin name and phone number.');
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
    (slot === 1 || slot === 2) &&
    (Number(kin.locked) === 1 || Number(kin.benefit_received) === 1)
  ) {
    throw new Error(`Slot ${slot} is permanently locked because a benefit has already been paid through it. It cannot be edited, replaced, or reused.`);
  }

  // Slots 1 and 2 may be edited only before their first payout. Once paid,
  // neither the UI nor any direct database call can reopen or replace them.
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

  if (slot === 1 || slot === 2) {
    throw new Error('Next-of-kin Slots 1 and 2 are required. Replace a contact instead of deleting it.');
  }

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
  // Compatibility wrapper for older callers. Insurance payouts are immediate,
  // fund-backed transactions and always require a contribution in the open meeting.
  void effectiveDays;
  validateKinSlot(slot);

  const db = await getDatabase();
  const member = await db.getFirstAsync<{ group_id: number; status: string }>(
    `SELECT group_id, status FROM members WHERE id = ? LIMIT 1`,
    memberId,
  );
  if (!member || String(member.status).toLowerCase() !== 'active') {
    throw new Error('Insurance benefits are available only to active members.');
  }

  const meeting = await getOpenMeeting(Number(member.group_id));
  if (!meeting) {
    throw new Error('Open a group meeting before recording an insurance benefit.');
  }

  return recordInsuranceKinBenefit(
    Number(member.group_id),
    memberId,
    slot as 1 | 2 | 3,
    amount,
    reason,
    meeting.id,
  );
}

export type HomeDashboardSummary = FinancialSummary & {
  loansOut: number;
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

  // Loans Out is the actual outstanding amount owed by members.
  // It is NOT the Loan Fund balance.
  const outstandingLoans = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(balance), 0) AS total
     FROM (
       SELECT m.id, MAX(0,
         COALESCE((SELECT SUM(ABS(ft.amount))
           FROM financial_transactions ft
           WHERE ft.group_id = ?
             AND ft.member_id = m.id
             AND ft.account_type = 'loan_fund'
             AND ft.transaction_type = 'loan_issued'
             AND ft.reversed = 0), 0)
         + COALESCE((SELECT SUM(lic.interest_amount)
           FROM loan_interest_charges lic
           WHERE lic.group_id = ?
             AND lic.member_id = m.id), 0)
         + COALESCE((SELECT SUM(lr.total_interest)
           FROM loan_records lr
           JOIN financial_transactions lft ON lft.id = lr.disbursement_transaction_id
           WHERE lr.group_id = ? AND lr.member_id = m.id
             AND lr.status != 'cancelled' AND lft.reversed = 0), 0)
         + COALESCE((SELECT SUM(mlic.interest_amount)
           FROM meeting_loan_interest_charges mlic
           WHERE mlic.group_id = ? AND mlic.member_id = m.id), 0)
         - COALESCE((SELECT SUM(ft2.amount)
           FROM financial_transactions ft2
           WHERE ft2.group_id = ?
             AND ft2.member_id = m.id
             AND ft2.account_type = 'loan_repayment'
             AND ft2.transaction_type = 'loan_repayment'
             AND ft2.reversed = 0), 0)
       ) AS balance
       FROM members m
       WHERE m.group_id = ?
         AND m.status = 'active'
     )`,
    groupId,
    groupId,
    groupId,
    groupId,
    groupId,
    groupId,
  );

  const loansOut = Number(outstandingLoans?.total) || 0;
  const open = await getOpenMeeting(groupId);
  const closed = await getLastConcludedMeeting(groupId);
  return {
    ...financial,
    // Fund Balance is the cash currently available in the box plus the
    // outstanding amount members still owe. Expenditure is reported separately.
    fundBalance: financial.loanFund + loansOut,
    loansOut,
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
  createdAt: string = now(),
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
    createdAt,
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
     ORDER BY created_at ASC, id ASC`,
    memberId,
  );
}

export type MemberPassbookLoginResult = {
  memberId: number;
  groupId: number;
  memberNumber: string;
  memberName: string;
  groupNumber: number;
  groupName: string;
  currency: string;
};

export type MemberPassbookActivity = {
  id: number;
  account_type: string;
  amount: number;
  reason: string;
  transaction_type: string;
  created_at: string;
};

/**
 * Local-device passbook login foundation. This verifies the member number and
 * the existing salted passcode hash against this device's SQLite database.
 * It is NOT remote authentication; a secure server-backed flow is required
 * before a member can sign in from a different phone.
 */
export async function authenticateMemberPassbook(
  memberNumber: string,
  passcode: string,
): Promise<MemberPassbookLoginResult | null> {
  const cleanNumber = normalizeText(memberNumber).toUpperCase();
  if (!cleanNumber || !isValidPasscode(passcode)) return null;

  const db = await getDatabase();
  const member = await db.getFirstAsync<{
    id: number;
    group_id: number;
    member_number: string;
    full_name: string;
    status: string;
    group_number: number;
    group_name: string;
    currency: string;
  }>(
    `SELECT m.id, m.group_id, m.member_number, m.full_name, m.status,
            g.group_number, g.group_name, g.currency
     FROM members m
     JOIN groups g ON g.id = m.group_id
     WHERE UPPER(TRIM(m.member_number)) = ?
     LIMIT 1`,
    cleanNumber,
  );

  if (!member || member.status !== 'active') return null;
  const verified = await verifyMemberPasscode(
    Number(member.id), Number(member.group_id), passcode,
    { requirePhone: false },
  );
  if (!verified.success) return null;

  return {
    memberId: Number(member.id),
    groupId: Number(member.group_id),
    memberNumber: member.member_number,
    memberName: member.full_name,
    groupNumber: Number(member.group_number),
    groupName: member.group_name,
    currency: member.currency || 'UGX',
  };
}

export async function getMemberPassbookDashboardData(
  memberId: number,
  groupId: number,
): Promise<{
  memberNumber: string;
  memberName: string;
  groupNumber: number;
  groupName: string;
  currency: string;
  personalSavings: number;
  loanAmount: number;
  loanBalance: number;
  loanIssueDate: string | null;
  loanDueDate: string | null;
  personalFines: number;
  insuranceContributions: number;
  groupSavings: number;
  groupLoanFund: number;
  groupInsuranceBalance: number;
  activity: MemberPassbookActivity[];
}> {
  const db = await getDatabase();
  const member = await db.getFirstAsync<{
    member_number: string; full_name: string; group_number: number;
    group_name: string; currency: string;
  }>(
    `SELECT m.member_number, m.full_name, g.group_number, g.group_name, g.currency
     FROM members m JOIN groups g ON g.id = m.group_id
     WHERE m.id = ? AND m.group_id = ? AND m.status = 'active' LIMIT 1`,
    memberId, groupId,
  );
  if (!member) throw new Error('Member passbook was not found. Please sign in again.');

  const [personalSavings, loan, loanIssueDate, loanDueDate, fines, insurance, groupSummary, activity, loanIssued] = await Promise.all([
    getMemberSavings(groupId, memberId),
    getMemberLoanBalance(groupId, memberId),
    getMemberLoanIssueDate(groupId, memberId),
    getMemberLoanDueDate(groupId, memberId),
    getMemberFines(groupId, memberId),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND account_type = 'insurance_fund'
         AND transaction_type = 'insurance_contribution' AND reversed = 0`, groupId, memberId,
    ),
    getFinancialSummary(groupId),
    db.getAllAsync<MemberPassbookActivity>(
      `SELECT id, account_type, amount, reason, transaction_type, created_at
       FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND reversed = 0
       ORDER BY created_at DESC, id DESC LIMIT 100`, groupId, memberId,
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(ABS(amount)), 0) AS total FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND account_type = 'loan_fund'
         AND transaction_type = 'loan_issued' AND reversed = 0`, groupId, memberId,
    ),
  ]);
  const personalFines = fines.reduce((sum, fine) => sum + Number(fine.outstanding_amount || 0), 0);

  return {
    memberNumber: member.member_number,
    memberName: member.full_name,
    groupNumber: Number(member.group_number),
    groupName: member.group_name,
    currency: member.currency || 'UGX',
    personalSavings,
    loanAmount: Number(loanIssued?.total || 0),
    loanBalance: Number(loan.balance || 0),
    loanIssueDate,
    loanDueDate,
    personalFines,
    insuranceContributions: Number(insurance?.total || 0),
    groupSavings: Number(groupSummary.savings || 0),
    // Approved definition: cash currently available to issue as new loans.
    groupLoanFund: Number(groupSummary.loanFund || 0),
    groupInsuranceBalance: Number(groupSummary.insuranceFund || 0),
    activity,
  };
}

/** Build a Cloudflare passbook snapshot from the existing SQLite ledger.
 * The administrator's authenticated sync action uploads this snapshot; amounts
 * are derived here from the app's canonical financial helpers and ledger rows.
 */
export async function buildRemotePassbookSyncPayload(groupId: number): Promise<{
  groupSummary: Record<string, string | number>;
  members: Array<Record<string, unknown>>;
}> {
  const db = await getDatabase();
  const group = await db.getFirstAsync<{ group_number: number; group_name: string; currency: string }>(
    `SELECT group_number, group_name, currency FROM groups WHERE id = ? LIMIT 1`, groupId,
  );
  if (!group) throw new Error('Group was not found.');
  const members = await db.getAllAsync<{ id: number; member_number: string; full_name: string; status: string }>(
    `SELECT id, member_number, full_name, status FROM members WHERE group_id = ? ORDER BY id`, groupId,
  );
  const financial = await getFinancialSummary(groupId);
  const activeMembers = members.filter((m) => m.status === 'active');
  let outstandingLoansUgx = 0;
  const memberSnapshots: Array<Record<string, unknown>> = [];
  for (const member of activeMembers) {
    const [savings, loan, dueDate, txs] = await Promise.all([
      getMemberSavings(groupId, Number(member.id)),
      getMemberLoanBalance(groupId, Number(member.id)),
      getMemberLoanDueDate(groupId, Number(member.id)),
      db.getAllAsync<{ id: number; transaction_type: string; amount: number; reason: string; created_at: string }>(
        `SELECT id, transaction_type, amount, reason, created_at FROM financial_transactions
         WHERE group_id = ? AND member_id = ? AND reversed = 0 ORDER BY created_at DESC, id DESC LIMIT 500`,
        groupId, Number(member.id),
      ),
    ]);
    outstandingLoansUgx += Math.max(0, Number(loan.balance || 0));
    memberSnapshots.push({
      memberNumber: member.member_number,
      memberName: member.full_name,
      totalSavingsUgx: Math.max(0, Math.round(savings)),
      loanBalanceUgx: Math.max(0, Math.round(loan.balance || 0)),
      loanDueDate: dueDate,
      transactions: txs.map((tx) => ({
        transactionId: String(tx.id), transactionType: tx.transaction_type,
        amountUgx: Math.max(0, Math.round(Math.abs(Number(tx.amount) || 0))),
        description: tx.reason || '', transactionDate: tx.created_at,
      })),
    });
  }
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`;
  const expenditureRows = await db.getAllAsync<{ period: string; total: number }>(
    `SELECT substr(created_at, 1, 7) AS period, COALESCE(SUM(ABS(amount)), 0) AS total
     FROM financial_transactions
     WHERE group_id = ? AND reversed = 0 AND account_type = 'expenditure_fund'
     GROUP BY substr(created_at, 1, 7)`, groupId,
  );
  const expenditureByMonth = new Map(expenditureRows.map((r) => [r.period, Math.round(Number(r.total) || 0)]));
  const registeredCount = members.length;
  return {
    groupSummary: {
      groupNumber: String(group.group_number), groupName: group.group_name,
      currency: group.currency || 'UGX',
      totalSavingsUgx: Math.max(0, Math.round(financial.savings)),
      // financial.loanFund is the reconciled cash balance available in the loan account.
      availableLoanFundUgx: Math.max(0, Math.round(financial.loanFund)),
      outstandingLoansUgx: Math.max(0, Math.round(outstandingLoansUgx)),
      insuranceFundUgx: Math.max(0, Math.round(financial.insuranceFund)),
      finesFundUgx: Math.max(0, Math.round(financial.fines)),
      registeredMembers: registeredCount, activeMembers: activeMembers.length,
      totalExpenditureUgx: expenditureByMonth.get(currentMonth) || 0,
      previousPeriodExpenditureUgx: expenditureByMonth.get(previousMonth) || 0,
      reportingPeriod: currentMonth, previousReportingPeriod: previousMonth,
    },
    members: memberSnapshots,
  };
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

  // Fine entries in a member collection are payments against fines that
  // were already assessed automatically. They must never create a new fine.
  const finePaymentTotal = payments
    .filter((payment) => payment.accountType === 'fines')
    .reduce((total, payment) => total + payment.amount, 0);

  if (finePaymentTotal > 0) {
    if (memberId === null) {
      throw new Error('A fine payment must belong to a member.');
    }

    const outstandingFineTotal = await getMemberOutstandingFineTotal(
      groupId,
      memberId,
    );

    if (outstandingFineTotal <= 0) {
      throw new Error('This member has no outstanding fine to pay.');
    }

    if (finePaymentTotal > outstandingFineTotal) {
      throw new Error(
        `Fine payment cannot exceed the member's outstanding fine balance of ${outstandingFineTotal.toLocaleString()}.`,
      );
    }
  }

  const insurancePayments = payments.filter((payment) => payment.accountType === 'insurance_fund');
  if (insurancePayments.length > 0) {
    if (insurancePayments.length > 1) {
      throw new Error('Record only one insurance contribution per member per meeting.');
    }
    if (memberId === null) {
      throw new Error('An insurance contribution must belong to a member.');
    }
    await assertInsuranceContributionAllowed(
      db, groupId, memberId, insurancePayments[0].amount, meetingId, true,
    );
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
          : payment.accountType === 'fines'
            ? 'fine_payment'
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

/**
 * Correct one collection item from a previously closed meeting.
 * The original transaction is reversed rather than deleted, a replacement
 * transaction is recorded when the corrected amount is greater than zero,
 * and every correction is retained in an append-only audit table.
 * Current/open meetings are deliberately not editable through this function.
 */
export async function correctHistoricalFinancialCollectionItem(
  collectionItemId: number,
  correctedAmount: number,
  editorMemberId: number,
  reason: string,
): Promise<FinancialCollectionCorrectionRecord> {
  const db = await getDatabase();
  const correctionReason = normalizeText(reason);

  if (!Number.isInteger(collectionItemId) || collectionItemId <= 0) {
    throw new Error('A valid collection item is required.');
  }
  if (!Number.isFinite(correctedAmount) || correctedAmount < 0) {
    throw new Error('The corrected amount must be zero or greater.');
  }
  if (!Number.isInteger(editorMemberId) || editorMemberId <= 0) {
    throw new Error('The editor must be identified for the audit history.');
  }
  if (!correctionReason) {
    throw new Error('A reason is required for every historical correction.');
  }

  const item = await db.getFirstAsync<FinancialCollectionItem & {
    group_id: number;
    meeting_id: number | null;
    member_id: number | null;
    collection_status: string;
    meeting_status: string | null;
    transaction_reversed: number | null;
  }>(
    `SELECT fci.*, fc.group_id, fc.meeting_id, fc.member_id,
            fc.status AS collection_status, gm.status AS meeting_status,
            ft.reversed AS transaction_reversed
     FROM financial_collection_items fci
     JOIN financial_collections fc ON fc.id = fci.collection_id
     LEFT JOIN group_meetings gm ON gm.id = fc.meeting_id
     LEFT JOIN financial_transactions ft ON ft.id = fci.transaction_id
     WHERE fci.id = ? LIMIT 1`,
    collectionItemId,
  );
  if (!item) throw new Error('The collection item could not be found.');
  if (item.meeting_id === null || item.meeting_status !== 'closed') {
    throw new Error('Only collections from previously recorded, closed meetings can be corrected.');
  }
  if (!item.transaction_id || item.transaction_reversed === 1) {
    throw new Error('The collection has no active original transaction to correct.');
  }
  const editor = await db.getFirstAsync<{ id: number; group_id: number }>(
    `SELECT id, group_id FROM members WHERE id = ? LIMIT 1`,
    editorMemberId,
  );
  if (!editor || editor.group_id !== item.group_id) {
    throw new Error('The editor must be a member of the same group.');
  }

  const originalTransactionId = item.transaction_id;
  const originalAmount = Number(item.amount);
  const timestamp = now();
  let replacementTransactionId: number | null = null;

  await db.withTransactionAsync(async () => {
    // Reverse the prior entry and retain it in the ledger; never delete it.
    await reverseFinancialTransaction(
      originalTransactionId,
      `Historical collection correction: ${correctionReason}`,
      editorMemberId,
    );

    if (correctedAmount > 0) {
      replacementTransactionId = await recordFinancialIncome(
        item.group_id,
        item.account_type,
        correctedAmount,
        `Corrected historical collection: ${correctionReason}`,
        item.member_id,
        item.meeting_id,
        `${item.account_type}_collection_correction`,
        item.collection_id,
      );
    }

    await db.runAsync(
      `UPDATE financial_collection_items
       SET amount = ?, reason = ?, transaction_id = ?, is_corrected = 1
       WHERE id = ?`,
      correctedAmount,
      `Corrected: ${correctionReason}`,
      replacementTransactionId,
      collectionItemId,
    );
    await db.runAsync(
      `UPDATE financial_collections
       SET total_amount = MAX(0, total_amount - ? + ?)
       WHERE id = ?`,
      originalAmount,
      correctedAmount,
      item.collection_id,
    );
    await db.runAsync(
      `INSERT INTO financial_collection_corrections (
        group_id, meeting_id, collection_id, collection_item_id,
        original_transaction_id, replacement_transaction_id,
        original_amount, corrected_amount, editor_member_id, reason, corrected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.group_id,
      item.meeting_id,
      item.collection_id,
      collectionItemId,
      originalTransactionId,
      replacementTransactionId,
      originalAmount,
      correctedAmount,
      editorMemberId,
      correctionReason,
      timestamp,
    );
  });

  const saved = await db.getFirstAsync<FinancialCollectionCorrectionRecord>(
    `SELECT * FROM financial_collection_corrections
     WHERE collection_item_id = ? AND corrected_at = ?
     ORDER BY id DESC LIMIT 1`,
    collectionItemId,
    timestamp,
  );
  if (!saved) throw new Error('Correction was not saved to the audit history.');
  return saved;
}

export async function getFinancialCollectionCorrectionHistory(
  collectionItemId: number,
): Promise<FinancialCollectionCorrectionRecord[]> {
  const db = await getDatabase();
  return db.getAllAsync<FinancialCollectionCorrectionRecord>(
    `SELECT * FROM financial_collection_corrections
     WHERE collection_item_id = ?
     ORDER BY corrected_at ASC, id ASC`,
    collectionItemId,
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

  if (await isLoanDisbursementFrozen(groupId, memberId)) {
    throw new Error('Loan disbursement is frozen by the Chairperson.');
  }
  const policy = await getLoanPolicySettings(groupId);
  if (Number(policy.require_committee_approval) || Number(policy.require_guarantor)) {
    throw new Error('This group requires the advanced loan application workflow. Use the approved application disbursement process.');
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

  // Legacy loans accrue meeting-day interest only after the 27–35 day eligibility window.

  await recordGroupActivity(groupId);

  return transactionId;
}

/* ============================================================
   ADVANCED LOAN DATABASE SUPPORT
   ============================================================ */

export type LoanInterestMethod = 'fixed' | 'flat' | 'declining';
export type LoanRepaymentAmountMode = 'flexible' | 'fixed';
export type LoanRepaymentPeriodMode = 'flexible' | 'fixed';
export type LoanInterestCalculator = 'standard' | 'common_vsla';
export type LoanRepaymentPeriodUnit = 'weeks' | 'months';
export type LoanContractInput = {
  interestMethod: LoanInterestMethod;
  interestRate: number;
  repaymentPeriodCount: number;
  repaymentPeriodUnit: LoanRepaymentPeriodUnit;
  dueDate?: string | null;
  /** Days after issue for the first monthly interest calculation (27–37). */
  interestDayOffset?: number | null;
  createdByMemberId?: number | null;
  applicationId?: number | null;
};

export type LoanContractRecord = {
  id: number;
  group_id: number;
  member_id: number;
  disbursement_transaction_id: number;
  meeting_id: number | null;
  principal_amount: number;
  interest_method: LoanInterestMethod;
  interest_rate: number;
  interest_period: string;
  monthly_recalculation_enabled: number;
  repayment_period_count: number;
  repayment_period_unit: LoanRepaymentPeriodUnit;
  issue_date: string;
  due_date: string;
  interest_anchor_date?: string | null;
  interest_day_offset?: number | null;
  total_interest: number;
  total_due: number;
  status: string;
  reason: string;
  created_by_member_id: number | null;
  created_at: string;
  updated_at: string;
};

function loanDateForPeriod(issueDate: Date, period: number, unit: LoanRepaymentPeriodUnit): string {
  const date = new Date(issueDate.getTime());
  if (unit === 'weeks') {
    date.setDate(date.getDate() + period * 7);
  } else {
    const targetDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + period);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(targetDay, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

function calculateLoanInterestSchedule(
  principal: number,
  rate: number,
  periods: number,
  method: LoanInterestMethod,
  interestPeriod: string = 'per month',
  cycleDurationMonths: number = 12,
): Array<{ principalDue: number; interestDue: number }> {
  if (!Number.isFinite(principal) || principal <= 0 ||
      !Number.isFinite(rate) || rate < 0 ||
      !Number.isInteger(periods) || periods < 1) {
    throw new Error('Loan terms are invalid for interest calculation.');
  }

  const principalPerPeriod = principal / periods;
  const fixedTotal = principal * rate / 100;
  const rows: Array<{ principalDue: number; interestDue: number }> = [];
  const cycleLength = Math.max(1, Math.floor(cycleDurationMonths || 12));
  let remaining = principal;

  for (let index = 0; index < periods; index += 1) {
    const principalDue = index === periods - 1
      ? remaining
      : Math.min(remaining, principalPerPeriod);
    let interestDue = 0;

    if (method === 'fixed') {
      // One loan-level charge spread evenly over the repayment schedule.
      interestDue = fixedTotal / periods;
    } else {
      const chargeThisPeriod =
        interestPeriod === 'per loan'
          ? index === 0
          : interestPeriod === 'per cycle'
            ? index % cycleLength === 0
            : index === 0; // Monthly contracts accrue later months from the real unpaid balance at meetings.

      if (chargeThisPeriod) {
        interestDue = method === 'flat'
          ? principal * rate / 100
          : remaining * rate / 100;
      }
    }

    rows.push({ principalDue, interestDue });
    remaining = Math.max(0, remaining - principalDue);
  }

  return rows;
}

async function addLoanAudit(
  db: SQLite.SQLiteDatabase,
  groupId: number,
  loanId: number | null,
  actorMemberId: number | null,
  eventType: string,
  details: Record<string, unknown>,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO loan_audit_log (group_id, loan_id, actor_member_id, event_type, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    groupId, loanId, actorMemberId, eventType, JSON.stringify(details), now(),
  );
}

/**
 * Atomically disburses an approved application, records the loan contract and
 * installment schedule, updates the Loan Fund and member passbook, and marks
 * the application disbursed. This is the safe write path for the advanced flow.
 */
export async function disburseApprovedLoanApplication(
  applicationId: number,
  executiveMemberId: number,
): Promise<{ loanId: number; transactionId: number; issueDate: string; dueDate: string; totalInterest: number; totalDue: number }> {
  const db = await getDatabase();
  let application = await db.getFirstAsync<{
    id: number; group_id: number; member_id: number; meeting_id: number | null;
    requested_amount: number; interest_method: LoanInterestMethod; interest_rate: number;
    repayment_period_count: number; repayment_period_unit: LoanRepaymentPeriodUnit;
    requested_due_date: string | null; requested_interest_day_offset?: number | null;
    reason: string; status: string;
    disbursed_transaction_id: number | null;
    interest_calculator?: LoanInterestCalculator; interest_period?: string;
    repayment_amount_mode?: LoanRepaymentAmountMode; repayment_period_mode?: LoanRepaymentPeriodMode;
  }>('SELECT * FROM loan_applications WHERE id = ? LIMIT 1', applicationId);
  if (!application) throw new Error('Loan application not found.');
  if (application.status === 'disbursed' || application.disbursed_transaction_id) throw new Error('This loan application has already been disbursed.');
  if (application.status === 'rejected' || application.status === 'cancelled') throw new Error(`This application is ${application.status} and cannot be disbursed.`);

  let decision = application.status as 'pending' | 'approved' | 'rejected';
  if (decision === 'pending') decision = await refreshLoanApplicationDecision(applicationId);
  application = await db.getFirstAsync<{
    id: number; group_id: number; member_id: number; meeting_id: number | null;
    requested_amount: number; interest_method: LoanInterestMethod; interest_rate: number;
    repayment_period_count: number; repayment_period_unit: LoanRepaymentPeriodUnit;
    requested_due_date: string | null; requested_interest_day_offset?: number | null;
    reason: string; status: string;
    disbursed_transaction_id: number | null;
    interest_calculator?: LoanInterestCalculator; interest_period?: string;
    repayment_amount_mode?: LoanRepaymentAmountMode; repayment_period_mode?: LoanRepaymentPeriodMode;
  }>('SELECT * FROM loan_applications WHERE id = ? LIMIT 1', applicationId);
  if (!application) throw new Error('Loan application not found.');
  if (decision !== 'approved' || application.status !== 'approved') throw new Error('The loan application has not satisfied its approval requirements.');

  const policy = await getLoanPolicySettings(application.group_id);
  if (Number(policy.require_committee_approval)) {
    const approvals = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM loan_committee_approvals WHERE application_id = ? AND decision = 'approved' AND passcode_verified = 1`, applicationId,
    );
    if (Number(approvals?.count ?? 0) < Number(policy.minimum_committee_approvals)) throw new Error('The required number of loan committee approvals has not been reached.');
  }
  const guarantorStatus = await db.getFirstAsync<{ total: number; verified: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN passcode_verified = 1 THEN 1 ELSE 0 END) AS verified
     FROM loan_guarantors WHERE application_id = ? AND status = 'active'`, applicationId,
  );
  const totalSelectedGuarantors = Number(guarantorStatus?.total ?? 0);
  const verifiedSelectedGuarantors = Number(guarantorStatus?.verified ?? 0);
  if (totalSelectedGuarantors > 0 && verifiedSelectedGuarantors !== totalSelectedGuarantors) {
    throw new Error('Every selected guarantor must confirm with their own passcode before disbursement.');
  }
  if (Number(policy.require_guarantor) && (totalSelectedGuarantors < 1 || verifiedSelectedGuarantors < 1)) {
    throw new Error('A verified guarantor signature is required before disbursement.');
  }
  if (await isLoanDisbursementFrozen(application.group_id, application.member_id)) throw new Error('Loan disbursement is frozen by the Chairperson.');

  const executive = await db.getFirstAsync<{ group_id: number; status: string; assigned_roles: string | null; is_super_user: number | null }>(
    'SELECT group_id, status, assigned_roles, is_super_user FROM members WHERE id = ? LIMIT 1', executiveMemberId,
  );
  const executiveRoles = (executive?.assigned_roles || '').split(',').map((role: string) => canonicalExecutivePost(role));
  if (!executive || Number(executive.group_id) !== application.group_id || executive.status !== 'active' || (!Number(executive.is_super_user) && !executiveRoles.some((role) => role && EXECUTIVE_POSTS.includes(role as (typeof EXECUTIVE_POSTS)[number])))) {
    throw new Error('An active group executive must authorize loan disbursement.');
  }
  if (application.meeting_id == null) throw new Error('The application must be linked to a meeting.');
  await requireMemberPresentForLoan(db, application.group_id, application.member_id, application.meeting_id);

  const setup = await getVSLASetupRules(application.group_id);
  const savings = await getMemberSavings(application.group_id, application.member_id);
  const currentLoan = await getMemberLoanBalance(application.group_id, application.member_id);
  const maximumAdditionalLoan = Math.max(0, savings * Number(setup?.maximum_loan_multiple ?? 3) - currentLoan.balance);
  if (application.requested_amount > maximumAdditionalLoan) throw new Error(`The member's current additional loan limit is ${maximumAdditionalLoan.toLocaleString()}. Reassess this application before disbursing.`);

  const account = await db.getFirstAsync<{ balance: number }>(
    `SELECT balance FROM financial_accounts WHERE group_id = ? AND account_type = 'loan_fund' LIMIT 1`, application.group_id,
  );
  if (!account || Number(account.balance) < Number(application.requested_amount)) throw new Error('The Loan Fund no longer has enough available money.');

  const timestamp = now();
  const issueDate = new Date(timestamp);
  const storedInterestCalculator: LoanInterestCalculator =
    application.interest_calculator === 'common_vsla' ? 'common_vsla' : 'standard';
  const storedInterestMethod = application.interest_method;
  const storedInterestPeriod = normalizeText(application.interest_period) || normalizeText(setup?.loan_interest_period) || 'per month';
  const oneTimeInterest = storedInterestPeriod === 'per loan' ||
    (storedInterestCalculator === 'standard' && storedInterestMethod === 'fixed');
  const interestCalculator: LoanInterestCalculator = 'standard';
  const contractInterestMethod: LoanInterestMethod = oneTimeInterest
    ? 'flat'
    : storedInterestCalculator === 'common_vsla'
      ? 'declining'
      : storedInterestMethod === 'declining' ? 'declining' : 'flat';
  const contractInterestPeriod = oneTimeInterest ? 'per loan' : 'per month';
  const contractAmountMode: LoanRepaymentAmountMode =
    application.repayment_amount_mode === 'fixed' ? 'fixed' : (setup?.loan_repayment_amount_mode === 'fixed' ? 'fixed' : 'flexible');
  const contractPeriodMode: LoanRepaymentPeriodMode =
    application.repayment_period_mode === 'fixed' ? 'fixed' : (setup?.loan_repayment_period_mode === 'fixed' ? 'fixed' : 'flexible');
  const schedule = calculateLoanInterestSchedule(
    Number(application.requested_amount), Number(application.interest_rate),
    Number(application.repayment_period_count), contractInterestMethod,
    contractInterestPeriod, Number(setup?.cycle_duration_months ?? 12),
  );
  const totalInterest = schedule.reduce((sum, item) => sum + item.interestDue, 0);
  const dueDate = application.requested_due_date || loanDateForPeriod(issueDate, Number(application.repayment_period_count), application.repayment_period_unit);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(new Date(`${dueDate}T00:00:00`).getTime())) throw new Error('The loan due date is invalid.');
  const interestDayOffset = contractInterestPeriod === 'per month'
    ? Number(application.requested_interest_day_offset ?? 30)
    : null;
  if (interestDayOffset !== null && (!Number.isInteger(interestDayOffset) || interestDayOffset < 27 || interestDayOffset > 37)) {
    throw new Error('The selected monthly interest date must be 27–37 days after the loan issue date. Reopen the loan application and choose a valid day.');
  }
  const interestAnchorDate = interestDayOffset === null
    ? null
    : addDaysToDateOnly(formatLocalDate(issueDate), interestDayOffset);

  await db.execAsync('BEGIN TRANSACTION;');
  try {
    const tx = await db.runAsync(
      `INSERT INTO financial_transactions (group_id, account_type, amount, reason, member_id, meeting_id, transaction_type, created_at)
       VALUES (?, 'loan_fund', ?, ?, ?, ?, 'loan_issued', ?)`,
      application.group_id, -Math.abs(Number(application.requested_amount)), normalizeText(application.reason),
      application.member_id, application.meeting_id, timestamp,
    );
    const transactionId = tx.lastInsertRowId;
    const accountUpdate = await db.runAsync(
      `UPDATE financial_accounts SET balance = balance - ?, updated_at = ? WHERE group_id = ? AND account_type = 'loan_fund' AND balance >= ?`,
      Number(application.requested_amount), timestamp, application.group_id, Number(application.requested_amount),
    );
    if (accountUpdate.changes !== 1) throw new Error('The Loan Fund balance changed. Refresh and try again.');

    const contract = await db.runAsync(
      `INSERT INTO loan_records (
        group_id, member_id, application_id, disbursement_transaction_id, meeting_id, principal_amount,
        interest_method, interest_rate, interest_period, repayment_period_count, repayment_period_unit,
        issue_date, due_date, interest_anchor_date, interest_day_offset,
        total_interest, total_due, status, reason, created_by_member_id,
        interest_calculator, repayment_amount_mode, repayment_period_mode,
        monthly_recalculation_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
      application.group_id, application.member_id, applicationId, transactionId, application.meeting_id,
      Number(application.requested_amount), contractInterestMethod, Number(application.interest_rate),
      contractInterestPeriod,
      Number(application.repayment_period_count), application.repayment_period_unit,
      timestamp, dueDate, interestAnchorDate, interestDayOffset,
      totalInterest, Number(application.requested_amount) + totalInterest,
      normalizeText(application.reason), executiveMemberId,
      interestCalculator, contractAmountMode, contractPeriodMode,
      contractInterestPeriod === 'per month' ? 1 : 0, timestamp, timestamp,
    );
    const loanId = contract.lastInsertRowId;
    await db.runAsync(
      `UPDATE loan_interest_schedule_dates SET loan_id = ? WHERE application_id = ? AND loan_id IS NULL`,
      loanId, applicationId,
    );
    for (let index = 0; index < schedule.length; index += 1) {
      const item = schedule[index];
      await db.runAsync(
        `INSERT INTO loan_repayment_schedule (loan_id, installment_number, due_date, principal_due, interest_due, principal_paid, interest_paid, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, 'pending', ?, ?)`,
        loanId, index + 1,
        index === schedule.length - 1 ? dueDate : loanDateForPeriod(issueDate, index + 1, application.repayment_period_unit),
        item.principalDue, item.interestDue, timestamp, timestamp,
      );
    }
    await addPassbookEntry(db, application.group_id, application.member_id, application.meeting_id, transactionId, 'loan_issued', Number(application.requested_amount), application.reason || 'Loan issued', timestamp);
    const applicationUpdate = await db.runAsync(
      `UPDATE loan_applications SET status = 'disbursed', disbursed_transaction_id = ?, reviewed_at = COALESCE(reviewed_at, ?), updated_at = ? WHERE id = ? AND status = 'approved'`,
      transactionId, timestamp, timestamp, applicationId,
    );
    if (applicationUpdate.changes !== 1) throw new Error('The application status changed. The disbursement was cancelled.');
    await addLoanAudit(db, application.group_id, loanId, executiveMemberId, 'loan_disbursed', {
      applicationId, transactionId, principal: Number(application.requested_amount),
      interestCalculator, interestMethod: contractInterestMethod, interestRate: Number(application.interest_rate),
      interestPeriod: contractInterestPeriod, repaymentAmountMode: contractAmountMode, repaymentPeriodMode: contractPeriodMode,
      repaymentPeriodCount: Number(application.repayment_period_count), repaymentPeriodUnit: application.repayment_period_unit,
      interestDayOffset, interestAnchorDate, dueDate, totalInterest,
      totalDue: Number(application.requested_amount) + totalInterest,
    });
    await db.runAsync('UPDATE groups SET status = \'active\', last_activity_at = ? WHERE id = ?', timestamp, application.group_id);
    await db.execAsync('COMMIT;');
    return {
      loanId,
      transactionId,
      issueDate: formatLocalDate(issueDate),
      dueDate,
      totalInterest,
      totalDue: Number(application.requested_amount) + totalInterest,
    };
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

/**
 * Saves the repayment terms and a dated installment schedule for an existing
 * loan_issued transaction. Interest rates are per repayment period:
 * fixed = one-time interest on original principal; flat = rate on original
 * principal every period; declining = rate on each period's opening balance.
 * This function records contract metadata only; callers must not treat a
 * pending loan application as disbursed cash.
 */
export async function createLoanContract(
  groupId: number,
  memberId: number,
  disbursementTransactionId: number,
  meetingId: number | null,
  principalAmount: number,
  reason: string,
  terms: LoanContractInput,
): Promise<number> {
  const db = await getDatabase();
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) throw new Error('Loan principal must be greater than zero.');
  if (await isLoanDisbursementFrozen(groupId, memberId)) throw new Error('Loan disbursement is frozen by the Chairperson.');
  if (terms.applicationId == null) throw new Error('Every advanced loan contract must be linked to its approved loan application.');
  if (!['fixed', 'flat', 'declining'].includes(terms.interestMethod)) throw new Error('Choose a supported loan interest method.');
  if (!Number.isFinite(terms.interestRate) || terms.interestRate < 0) throw new Error('Interest rate cannot be negative.');
  if (!Number.isInteger(terms.repaymentPeriodCount) || terms.repaymentPeriodCount < 1 || terms.repaymentPeriodCount > 120) throw new Error('Repayment period must be between 1 and 120 periods.');
  if (!['weeks', 'months'].includes(terms.repaymentPeriodUnit)) throw new Error('Choose weeks or months for the repayment period.');

  const transaction = await db.getFirstAsync<{ id: number; group_id: number; member_id: number; transaction_type: string; reversed: number; amount: number; reason: string; meeting_id: number | null }>(
    `SELECT id, group_id, member_id, transaction_type, reversed, amount, reason, meeting_id
     FROM financial_transactions WHERE id = ? LIMIT 1`, disbursementTransactionId,
  );
  if (!transaction || Number(transaction.group_id) !== groupId || Number(transaction.member_id) !== memberId || transaction.transaction_type !== 'loan_issued' || Number(transaction.reversed) === 1) {
    throw new Error('A valid, unreversed loan disbursement transaction is required before saving loan terms.');
  }
  if (Math.abs(Number(transaction.amount)) !== Math.abs(principalAmount)) throw new Error('Loan contract principal must match the recorded disbursement amount.');
  const existing = await db.getFirstAsync<{ id: number }>(`SELECT id FROM loan_records WHERE disbursement_transaction_id = ? LIMIT 1`, disbursementTransactionId);
  if (existing) throw new Error('Repayment terms have already been saved for this loan.');
  let applicationDueDate: string | null = null;
  let applicationRules: {
    interest_calculator?: LoanInterestCalculator;
    interest_period?: string;
    repayment_amount_mode?: LoanRepaymentAmountMode;
    repayment_period_mode?: LoanRepaymentPeriodMode;
    interest_method?: LoanInterestMethod;
    interest_rate?: number;
    repayment_period_count?: number;
    repayment_period_unit?: LoanRepaymentPeriodUnit;
    requested_interest_day_offset?: number | null;
  } | null = null;
  if (terms.applicationId != null) {
    const application = await db.getFirstAsync<{
      group_id: number; member_id: number; status: string; requested_amount: number; requested_due_date: string | null;
      interest_calculator?: LoanInterestCalculator; interest_period?: string;
      repayment_amount_mode?: LoanRepaymentAmountMode; repayment_period_mode?: LoanRepaymentPeriodMode;
      interest_method?: LoanInterestMethod; interest_rate?: number;
      repayment_period_count?: number; repayment_period_unit?: LoanRepaymentPeriodUnit;
      requested_interest_day_offset?: number | null;
    }>(
      'SELECT group_id, member_id, status, requested_amount, requested_due_date, requested_interest_day_offset, interest_calculator, interest_period, repayment_amount_mode, repayment_period_mode, interest_method, interest_rate, repayment_period_count, repayment_period_unit FROM loan_applications WHERE id = ? LIMIT 1',
      terms.applicationId,
    );
    if (!application || Number(application.group_id) !== groupId || Number(application.member_id) !== memberId) throw new Error('Loan application does not match this borrower and group.');
    if (application.status !== 'approved') throw new Error('The loan application must be approved before disbursement.');
    if (Math.abs(Number(application.requested_amount) - principalAmount) > 0.0001) throw new Error('Disbursed principal must match the approved application amount.');
    applicationDueDate = application.requested_due_date;
    applicationRules = application;
  }

  const timestamp = now();
  const issueDate = new Date(timestamp);
  const storedInterestCalculator: LoanInterestCalculator =
    applicationRules?.interest_calculator === 'common_vsla' ? 'common_vsla' : 'standard';
  const storedInterestMethod: LoanInterestMethod = applicationRules?.interest_method ?? terms.interestMethod;
  const storedInterestPeriod = normalizeText(applicationRules?.interest_period) || 'per month';
  const oneTimeInterest = storedInterestPeriod === 'per loan' ||
    (storedInterestCalculator === 'standard' && storedInterestMethod === 'fixed');
  const interestCalculator: LoanInterestCalculator = 'standard';
  const contractInterestMethod: LoanInterestMethod = oneTimeInterest
    ? 'flat'
    : storedInterestCalculator === 'common_vsla'
      ? 'declining'
      : storedInterestMethod === 'declining' ? 'declining' : 'flat';
  const contractInterestRate = Number(applicationRules?.interest_rate ?? terms.interestRate);
  const contractInterestPeriod = oneTimeInterest ? 'per loan' : 'per month';
  const contractAmountMode: LoanRepaymentAmountMode =
    applicationRules?.repayment_amount_mode === 'fixed' ? 'fixed' : 'flexible';
  const contractPeriodMode: LoanRepaymentPeriodMode =
    applicationRules?.repayment_period_mode === 'fixed' ? 'fixed' : 'flexible';
  const contractPeriods = Number(applicationRules?.repayment_period_count ?? terms.repaymentPeriodCount);
  const contractUnit: LoanRepaymentPeriodUnit = applicationRules?.repayment_period_unit ?? terms.repaymentPeriodUnit;
  const schedule = calculateLoanInterestSchedule(
    principalAmount, contractInterestRate, contractPeriods, contractInterestMethod,
    contractInterestPeriod, 12,
  );
  const totalInterest = schedule.reduce((sum, item) => sum + item.interestDue, 0);
  const dueDate = terms.dueDate || applicationDueDate || loanDateForPeriod(issueDate, contractPeriods, contractUnit);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(new Date(`${dueDate}T00:00:00`).getTime())) throw new Error('Enter a valid due date in YYYY-MM-DD format.');
  const rawInterestOffset = terms.interestDayOffset ?? applicationRules?.requested_interest_day_offset ?? 30;
  const interestDayOffset = contractInterestPeriod === 'per month' ? Number(rawInterestOffset) : null;
  if (interestDayOffset !== null && (!Number.isInteger(interestDayOffset) || interestDayOffset < 27 || interestDayOffset > 37)) {
    throw new Error('The selected monthly interest date must be 27–37 days after the loan issue date.');
  }
  const interestAnchorDate = interestDayOffset === null ? null : addDaysToDateOnly(formatLocalDate(issueDate), interestDayOffset);

  await db.execAsync('BEGIN TRANSACTION;');
  try {
    const inserted = await db.runAsync(
      `INSERT INTO loan_records (
        group_id, member_id, application_id, disbursement_transaction_id, meeting_id, principal_amount,
        interest_method, interest_rate, interest_period, repayment_period_count,
        repayment_period_unit, issue_date, due_date, interest_anchor_date, interest_day_offset,
        total_interest, total_due, status, reason, created_by_member_id,
        interest_calculator, repayment_amount_mode, repayment_period_mode,
        monthly_recalculation_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
      groupId, memberId, terms.applicationId ?? null, disbursementTransactionId, meetingId, principalAmount,
      contractInterestMethod, contractInterestRate, contractInterestPeriod,
      contractPeriods, contractUnit, timestamp, dueDate, interestAnchorDate, interestDayOffset,
      totalInterest, principalAmount + totalInterest, normalizeText(reason),
      terms.createdByMemberId ?? null, interestCalculator, contractAmountMode, contractPeriodMode,
      contractInterestPeriod === 'per month' ? 1 : 0, timestamp, timestamp,
    );
    const loanId = inserted.lastInsertRowId;
    for (let index = 0; index < schedule.length; index += 1) {
      const item = schedule[index];
      await db.runAsync(
        `INSERT INTO loan_repayment_schedule (
          loan_id, installment_number, due_date, principal_due, interest_due,
          principal_paid, interest_paid, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, 0, 'pending', ?, ?)`,
        loanId, index + 1, index === schedule.length - 1 ? dueDate : loanDateForPeriod(issueDate, index + 1, contractUnit),
        item.principalDue, item.interestDue, timestamp, timestamp,
      );
    }
    await addLoanAudit(db, groupId, loanId, terms.createdByMemberId ?? null, 'loan_terms_created', {
      disbursementTransactionId, principalAmount, interestCalculator,
      interestMethod: contractInterestMethod, interestRate: contractInterestRate,
      interestPeriod: contractInterestPeriod, repaymentAmountMode: contractAmountMode,
      repaymentPeriodMode: contractPeriodMode, repaymentPeriodCount: contractPeriods,
      repaymentPeriodUnit: contractUnit, dueDate, totalInterest,
      interestDayOffset, interestAnchorDate,
    });
    if (terms.applicationId != null) {
      await db.runAsync(
        `UPDATE loan_applications SET status = 'disbursed', disbursed_transaction_id = ?, updated_at = ? WHERE id = ? AND status = 'approved'`,
        disbursementTransactionId, timestamp, terms.applicationId,
      );
    }
    await db.execAsync('COMMIT;');
    return loanId;
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

export type LoanPolicySettings = {
  group_id: number;
  default_interest_method: LoanInterestMethod;
  require_committee_approval: number;
  minimum_committee_approvals: number;
  require_guarantor: number;
  allow_member_savings_deduction: number;
  allow_guarantor_deduction: number;
  updated_at: string;
};

export async function getLoanPolicySettings(groupId: number): Promise<LoanPolicySettings> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<LoanPolicySettings>('SELECT * FROM loan_policy_settings WHERE group_id = ? LIMIT 1', groupId);
  if (existing) return existing;
  const timestamp = now();
  await db.runAsync('INSERT OR IGNORE INTO loan_policy_settings (group_id, updated_at) VALUES (?, ?)', groupId, timestamp);
  return (await db.getFirstAsync<LoanPolicySettings>('SELECT * FROM loan_policy_settings WHERE group_id = ? LIMIT 1', groupId))!;
}

export async function updateLoanPolicySettings(
  groupId: number,
  chairpersonMemberId: number,
  passcode: string,
  settings: Partial<Omit<LoanPolicySettings, 'group_id' | 'updated_at'>>,
): Promise<LoanPolicySettings> {
  const db = await getDatabase();
  const verification = await verifyMemberPasscode(chairpersonMemberId, groupId, passcode);
  if (!verification.success) throw new Error('Chairperson passcode could not be verified.');
  const chair = await db.getFirstAsync<{ assigned_roles: string | null; is_super_user: number | null; status: string }>(
    'SELECT assigned_roles, is_super_user, status FROM members WHERE id = ? AND group_id = ? LIMIT 1', chairpersonMemberId, groupId,
  );
  const chairRoles = (chair?.assigned_roles || '').split(',').map((value: string) => value.trim().toLowerCase());
  if (!chair || chair.status !== 'active' || (!Number(chair.is_super_user) && !chairRoles.includes('chairperson'))) throw new Error('Only the assigned Chairperson can change loan policy settings.');
  const current = await getLoanPolicySettings(groupId);
  const method = settings.default_interest_method ?? current.default_interest_method;
  const requiredApprovals = settings.minimum_committee_approvals ?? current.minimum_committee_approvals;
  if (!['fixed', 'flat', 'declining'].includes(method)) throw new Error('Invalid default interest method.');
  if (!Number.isInteger(requiredApprovals) || requiredApprovals < 1 || requiredApprovals > 20) throw new Error('Minimum committee approvals must be between 1 and 20.');
  const timestamp = now();
  await db.runAsync(
    `UPDATE loan_policy_settings SET default_interest_method = ?, require_committee_approval = ?,
      minimum_committee_approvals = ?, require_guarantor = ?, allow_member_savings_deduction = ?,
      allow_guarantor_deduction = ?, updated_at = ? WHERE group_id = ?`,
    method,
    settings.require_committee_approval ?? current.require_committee_approval,
    requiredApprovals,
    settings.require_guarantor ?? current.require_guarantor,
    settings.allow_member_savings_deduction ?? current.allow_member_savings_deduction,
    settings.allow_guarantor_deduction ?? current.allow_guarantor_deduction,
    timestamp, groupId,
  );
  await addLoanAudit(db, groupId, null, chairpersonMemberId, 'loan_policy_updated', {
    defaultInterestMethod: method,
    requireCommitteeApproval: settings.require_committee_approval ?? current.require_committee_approval,
    minimumCommitteeApprovals: requiredApprovals,
    requireGuarantor: settings.require_guarantor ?? current.require_guarantor,
    allowMemberSavingsDeduction: settings.allow_member_savings_deduction ?? current.allow_member_savings_deduction,
    allowGuarantorDeduction: settings.allow_guarantor_deduction ?? current.allow_guarantor_deduction,
  });
  return (await getLoanPolicySettings(groupId));
}

export type LoanApplicationInput = {
  requestedAmount: number;
  interestMethod: LoanInterestMethod;
  interestRate: number;
  repaymentPeriodCount: number;
  repaymentPeriodUnit: LoanRepaymentPeriodUnit;
  requestedDueDate?: string | null;
  /** Number of days after the actual issue date for the first monthly interest calculation (27–37). */
  interestDayOffset?: number | null;
  /** Explicit meeting-aligned interest dates shown on the New Loan screen. */
  interestDates?: Array<{ label?: string; date: string }>;
  /** Guarantors selected before their individual passcode signatures are collected. */
  guarantorMemberIds?: number[];
  reason: string;
  requestedByMemberId?: number | null;
};

export async function createLoanApplication(
  groupId: number,
  memberId: number,
  meetingId: number,
  input: LoanApplicationInput,
): Promise<number> {
  const db = await getDatabase();
  const setup = await getVSLASetupRules(groupId);
  if (!setup) throw new Error('Save the group loan Setup Rules before creating a loan application.');

  // Saved group rules are authoritative for all new applications. Normalize legacy
  // saved values to the new One-time / Monthly interest choices. The new UI always
  // persists the standard calculator, while these fallbacks preserve older groups.
  const storedInterestCalculator: LoanInterestCalculator =
    setup.loan_interest_calculator === 'standard' ? 'standard' : 'common_vsla';
  const storedInterestMethod: LoanInterestMethod = setup.loan_interest_method ?? input.interestMethod;
  const storedInterestPeriod = normalizeText(setup.loan_interest_period) || 'per month';
  const oneTimeInterest = storedInterestPeriod === 'per loan' ||
    (storedInterestCalculator === 'standard' && storedInterestMethod === 'fixed');
  const interestCalculator: LoanInterestCalculator = 'standard';
  const interestMethod: LoanInterestMethod = oneTimeInterest
    ? 'flat'
    : storedInterestCalculator === 'common_vsla'
      ? 'declining'
      : storedInterestMethod === 'declining' ? 'declining' : 'flat';
  const interestRate = Number(setup.loan_interest_percentage ?? input.interestRate);
  const interestPeriod = oneTimeInterest ? 'per loan' : 'per month';
  const requestedInterestDayOffset = interestPeriod === 'per month'
    ? Number(input.interestDayOffset ?? 30)
    : null;
  const repaymentAmountMode: LoanRepaymentAmountMode = 'flexible';
  const repaymentPeriodMode: LoanRepaymentPeriodMode = 'flexible';
  const maximumPeriod = Math.max(1, Number(setup.maximum_loan_repayment_period ?? 12));
  const repaymentPeriodCount = input.repaymentPeriodCount;
  const repaymentPeriodUnit: LoanRepaymentPeriodUnit = input.repaymentPeriodUnit;

  if (!Number.isFinite(input.requestedAmount) || input.requestedAmount <= 0) throw new Error('Requested loan amount must be greater than zero.');
  if (!['fixed', 'flat', 'declining'].includes(interestMethod)) throw new Error('Choose a supported interest method in Setup Rules.');
  if (!Number.isFinite(interestRate) || interestRate < 0) throw new Error('Interest rate cannot be negative.');
  if (!Number.isInteger(repaymentPeriodCount) || repaymentPeriodCount < 1 || repaymentPeriodCount > maximumPeriod) throw new Error(`Repayment period must be between 1 and ${maximumPeriod} months, as allowed by Setup Rules.`);
  if (!['weeks', 'months'].includes(repaymentPeriodUnit)) throw new Error('Choose weeks or months.');
  if (!['per month', 'per cycle', 'per loan'].includes(interestPeriod)) throw new Error('Choose a supported interest period in Setup Rules.');
  if (requestedInterestDayOffset !== null && (!Number.isInteger(requestedInterestDayOffset) || requestedInterestDayOffset < 27 || requestedInterestDayOffset > 37)) {
    throw new Error('Choose a monthly interest date between 27 and 37 days after the loan issue date.');
  }
  if (input.requestedDueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.requestedDueDate) || Number.isNaN(new Date(`${input.requestedDueDate}T00:00:00`).getTime()))) throw new Error('Enter a valid due date in YYYY-MM-DD format.');
  await requireMemberPresentForLoan(db, groupId, memberId, meetingId);
  const freeze = await isLoanDisbursementFrozen(groupId, memberId);
  if (freeze) throw new Error('Loan applications are currently frozen by the Chairperson.');
  const savings = await getMemberSavings(groupId, memberId);
  const currentLoan = await getMemberLoanBalance(groupId, memberId);
  const maximumAdditionalLoan = Math.max(0, savings * Number(setup?.maximum_loan_multiple ?? 3) - currentLoan.balance);
  if (input.requestedAmount > maximumAdditionalLoan) throw new Error(`Requested amount exceeds the member's additional loan limit of ${maximumAdditionalLoan.toLocaleString()}.`);
  const fund = await getFinancialAccount(groupId, 'loan_fund');
  if (!fund || Number(fund.balance) < input.requestedAmount) throw new Error('The Loan Fund does not have enough available money for this application.');
  const policy = await getLoanPolicySettings(groupId);
  const selectedGuarantorIds = input.guarantorMemberIds;
  if (selectedGuarantorIds !== undefined) {
    if (!Array.isArray(selectedGuarantorIds) || selectedGuarantorIds.length < 1 || selectedGuarantorIds.length > 3) {
      throw new Error('Select between 1 and 3 guarantors.');
    }
    if (selectedGuarantorIds.some((id) => !Number.isInteger(id)) || new Set(selectedGuarantorIds).size !== selectedGuarantorIds.length) {
      throw new Error('Guarantors must be valid, unique members.');
    }
    if (selectedGuarantorIds.includes(memberId)) throw new Error('The borrower cannot guarantee their own loan.');
    for (const guarantorId of selectedGuarantorIds) {
      const guarantor = await db.getFirstAsync<{ id: number; group_id: number; status: string }>(
        'SELECT id, group_id, status FROM members WHERE id = ? LIMIT 1', guarantorId,
      );
      if (!guarantor || Number(guarantor.group_id) !== groupId || guarantor.status !== 'active') {
        throw new Error('Every guarantor must be an active member of the borrower’s VSLA group.');
      }
    }
  }
  if (input.requestedByMemberId != null) {
    const requester = await db.getFirstAsync<{ group_id: number; status: string; assigned_roles: string | null; is_super_user: number | null }>(
      'SELECT group_id, status, assigned_roles, is_super_user FROM members WHERE id = ? LIMIT 1', input.requestedByMemberId,
    );
    if (!requester || Number(requester.group_id) !== groupId || requester.status !== 'active') throw new Error('The person submitting the application must be an active member of this group.');
    if (input.requestedByMemberId !== memberId) {
      const roles = (requester.assigned_roles || '').split(',').map((role: string) => canonicalExecutivePost(role));
      if (!Number(requester.is_super_user) && !roles.some((role) => role && EXECUTIVE_POSTS.includes(role as (typeof EXECUTIVE_POSTS)[number]))) throw new Error('Only the borrower or an active group executive can submit this loan application.');
    }
  }
  const submittedInterestDates = Array.isArray(input.interestDates) ? input.interestDates : [];
  if (submittedInterestDates.length > 0) {
    if (submittedInterestDates.length !== repaymentPeriodCount) {
      throw new Error('The saved interest-date count must match the selected loan term.');
    }
    let previousDate = '';
    for (const item of submittedInterestDates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || Number.isNaN(new Date(`${item.date}T12:00:00`).getTime())) {
        throw new Error('One of the scheduled interest dates is invalid.');
      }
      if (previousDate && item.date <= previousDate) throw new Error('Interest dates must be in ascending order.');
      previousDate = item.date;
    }
  }

  const timestamp = now();
  const result = await db.runAsync(
    `INSERT INTO loan_applications (
      group_id, member_id, meeting_id, requested_amount, interest_method, interest_rate,
      repayment_period_count, repayment_period_unit, requested_due_date, requested_interest_day_offset,
      reason, status, requested_by_member_id, interest_calculator, interest_period,
      repayment_amount_mode, repayment_period_mode, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
    groupId, memberId, meetingId, input.requestedAmount, interestMethod, interestRate,
    repaymentPeriodCount, repaymentPeriodUnit, input.requestedDueDate ?? null,
    requestedInterestDayOffset,
    normalizeText(input.reason), input.requestedByMemberId ?? null,
    interestCalculator, interestPeriod, repaymentAmountMode, repaymentPeriodMode, timestamp, timestamp,
  );
  if (selectedGuarantorIds) {
    for (const guarantorId of selectedGuarantorIds) {
      await db.runAsync(
        `INSERT INTO loan_guarantors (application_id, group_id, guarantor_member_id, guarantee_amount, signature_method, passcode_verified, signed_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'member_passcode', 0, NULL, 'active', ?, ?)`,
        result.lastInsertRowId, groupId, guarantorId, input.requestedAmount, timestamp, timestamp,
      );
    }
  }
  await addLoanAudit(db, groupId, null, input.requestedByMemberId ?? null, 'loan_application_created', {
    applicationId: result.lastInsertRowId, memberId, requestedAmount: input.requestedAmount,
    interestMethod, interestRate: input.interestRate,
    interestDayOffset: requestedInterestDayOffset,
    repaymentPeriodCount: input.repaymentPeriodCount, repaymentPeriodUnit: input.repaymentPeriodUnit,
    interestDates: submittedInterestDates.map((item) => item.date),
    guarantorMemberIds: selectedGuarantorIds ?? [],
    committeeApprovalRequired: Boolean(policy.require_committee_approval),
    guarantorRequired: Boolean(policy.require_guarantor),
  });
  for (let index = 0; index < submittedInterestDates.length; index += 1) {
    await db.runAsync(
      `INSERT INTO loan_interest_schedule_dates (application_id, loan_id, period_number, scheduled_date, created_at)
       VALUES (?, NULL, ?, ?, ?)`,
      result.lastInsertRowId, index + 1, submittedInterestDates[index].date, timestamp,
    );
  }
  return result.lastInsertRowId;
}

export async function getLoanApplication(applicationId: number): Promise<Record<string, unknown> | null> {
  const db = await getDatabase();
  return (await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM loan_applications WHERE id = ? LIMIT 1', applicationId)) ?? null;
}

export async function getLoanApplicationGuarantors(applicationId: number): Promise<Array<Record<string, unknown>>> {
  const db = await getDatabase();
  return db.getAllAsync(`SELECT g.*, m.full_name, m.member_number FROM loan_guarantors g JOIN members m ON m.id = g.guarantor_member_id WHERE g.application_id = ? ORDER BY g.created_at`, applicationId);
}

export async function getLoanApplicationApprovals(applicationId: number): Promise<Array<Record<string, unknown>>> {
  const db = await getDatabase();
  return db.getAllAsync(`SELECT a.*, m.full_name, m.member_number FROM loan_committee_approvals a JOIN members m ON m.id = a.approver_member_id WHERE a.application_id = ? ORDER BY a.decided_at`, applicationId);
}

export async function refreshLoanApplicationDecision(applicationId: number): Promise<'pending' | 'approved' | 'rejected'> {
  const db = await getDatabase();
  const application = await db.getFirstAsync<{ id: number; group_id: number; member_id: number; status: string }>('SELECT id, group_id, member_id, status FROM loan_applications WHERE id = ? LIMIT 1', applicationId);
  if (!application) throw new Error('Loan application not found.');
  if (application.status !== 'pending') return application.status as 'approved' | 'rejected';
  const policy = await getLoanPolicySettings(application.group_id);
  const approvals = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM loan_committee_approvals WHERE application_id = ? AND decision = 'approved' AND passcode_verified = 1`, applicationId);
  const rejected = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM loan_committee_approvals WHERE application_id = ? AND decision = 'rejected' AND passcode_verified = 1`, applicationId);
  const guarantors = await db.getFirstAsync<{ total: number; verified: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN passcode_verified = 1 THEN 1 ELSE 0 END) AS verified
     FROM loan_guarantors WHERE application_id = ? AND status = 'active'`, applicationId,
  );
  const totalGuarantors = Number(guarantors?.total ?? 0);
  const verifiedGuarantors = Number(guarantors?.verified ?? 0);
  const guarantorRequirementsMet = totalGuarantors > 0
    ? verifiedGuarantors === totalGuarantors
    : !Number(policy.require_guarantor);
  let status: 'pending' | 'approved' | 'rejected' = 'pending';
  if (Number(rejected?.count ?? 0) > 0) status = 'rejected';
  else if ((!Number(policy.require_committee_approval) || Number(approvals?.count ?? 0) >= Number(policy.minimum_committee_approvals)) && guarantorRequirementsMet) status = 'approved';
  if (status !== 'pending') {
    const timestamp = now();
    await db.runAsync('UPDATE loan_applications SET status = ?, reviewed_at = ?, updated_at = ? WHERE id = ? AND status = \'pending\'', status, timestamp, timestamp, applicationId);
    await addLoanAudit(db, application.group_id, null, null, 'loan_application_decided', { applicationId, status, approvals: Number(approvals?.count ?? 0), guarantors: totalGuarantors, verifiedGuarantors });
  }
  return status;
}

export async function getLoanContract(loanId: number): Promise<LoanContractRecord | null> {
  const db = await getDatabase();
  return (await db.getFirstAsync<LoanContractRecord>('SELECT * FROM loan_records WHERE id = ? LIMIT 1', loanId)) ?? null;
}

export async function getLoanRepaymentSchedule(loanId: number): Promise<Array<Record<string, unknown>>> {
  const db = await getDatabase();
  return db.getAllAsync(`SELECT * FROM loan_repayment_schedule WHERE loan_id = ? ORDER BY installment_number`, loanId);
}

export async function saveLoanGuarantorSignature(
  applicationId: number,
  guarantorMemberId: number,
  guaranteeAmount: number,
  passcode: string,
): Promise<number> {
  const db = await getDatabase();
  const application = await db.getFirstAsync<{ id: number; group_id: number; member_id: number; status: string }>(
    'SELECT id, group_id, member_id, status FROM loan_applications WHERE id = ? LIMIT 1', applicationId,
  );
  if (!application) throw new Error('Loan application not found.');
  if (application.status !== 'pending') throw new Error('Guarantors can only sign while the loan application is pending.');
  if (guarantorMemberId === application.member_id) throw new Error('The borrower cannot guarantee their own loan.');
  if (!Number.isFinite(guaranteeAmount) || guaranteeAmount <= 0) throw new Error('Guarantee amount must be greater than zero.');
  const guarantor = await db.getFirstAsync<{ id: number; group_id: number; status: string }>(
    'SELECT id, group_id, status FROM members WHERE id = ? LIMIT 1', guarantorMemberId,
  );
  if (!guarantor || Number(guarantor.group_id) !== application.group_id || guarantor.status !== 'active') throw new Error('Choose an active guarantor from the same group.');
  const existing = await db.getFirstAsync<{ id: number; status: string }>(
    'SELECT id, status FROM loan_guarantors WHERE application_id = ? AND guarantor_member_id = ? LIMIT 1', applicationId, guarantorMemberId,
  );
  const selectedCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM loan_guarantors WHERE application_id = ? AND status = 'active'`, applicationId,
  );
  if (Number(selectedCount?.count ?? 0) > 0 && !existing) {
    throw new Error('Only the guarantors selected for this loan may sign it.');
  }
  if (existing && existing.status !== 'active') throw new Error('This guarantor is no longer selected for this loan.');
  const verification = await verifyMemberPasscode(guarantorMemberId, application.group_id, passcode);
  if (!verification.success) throw new Error('Guarantor passcode could not be verified. Ask the guarantor to check their passcode.');

  const timestamp = now();
  if (existing) {
    await db.runAsync(
      `UPDATE loan_guarantors SET guarantee_amount = ?, passcode_verified = 1, signed_at = ?, status = 'active', updated_at = ? WHERE id = ?`,
      guaranteeAmount, timestamp, timestamp, existing.id,
    );
    await addLoanAudit(db, application.group_id, null, guarantorMemberId, 'guarantor_signature_updated', { applicationId, guarantorMemberId, guaranteeAmount });
    await refreshLoanApplicationDecision(applicationId);
    return existing.id;
  }
  const result = await db.runAsync(
    `INSERT INTO loan_guarantors (application_id, group_id, guarantor_member_id, guarantee_amount, signature_method, passcode_verified, signed_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'member_passcode', 1, ?, 'active', ?, ?)`,
    applicationId, application.group_id, guarantorMemberId, guaranteeAmount, timestamp, timestamp, timestamp,
  );
  await addLoanAudit(db, application.group_id, null, guarantorMemberId, 'guarantor_signed', { applicationId, guarantorMemberId, guaranteeAmount, signatureMethod: 'member_passcode' });
  await refreshLoanApplicationDecision(applicationId);
  return result.lastInsertRowId;
}

export async function assignLoanCommitteeMember(
  groupId: number,
  chairpersonMemberId: number,
  passcode: string,
  targetMemberId: number,
  assigned: boolean,
): Promise<void> {
  const db = await getDatabase();
  const verification = await verifyMemberPasscode(chairpersonMemberId, groupId, passcode);
  if (!verification.success) throw new Error('Chairperson passcode could not be verified.');
  const chair = await db.getFirstAsync<{ assigned_roles: string | null; is_super_user: number | null; status: string }>(
    'SELECT assigned_roles, is_super_user, status FROM members WHERE id = ? AND group_id = ? LIMIT 1', chairpersonMemberId, groupId,
  );
  const roles = (chair?.assigned_roles || '').split(',').map((value: string) => value.trim().toLowerCase());
  if (!chair || chair.status !== 'active' || (!Number(chair.is_super_user) && !roles.includes('chairperson'))) throw new Error('Only the assigned Chairperson can manage the loan committee.');
  const target = await db.getFirstAsync<{ group_id: number; status: string }>('SELECT group_id, status FROM members WHERE id = ? LIMIT 1', targetMemberId);
  if (!target || Number(target.group_id) !== groupId || target.status !== 'active') throw new Error('Loan committee members must be active members of this group.');
  const timestamp = now();
  if (assigned) {
    await db.runAsync(
      `INSERT INTO loan_committee_members (group_id, member_id, assigned_by_member_id, status, assigned_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)
       ON CONFLICT(group_id, member_id) DO UPDATE SET status = 'active', assigned_by_member_id = excluded.assigned_by_member_id, assigned_at = excluded.assigned_at, updated_at = excluded.updated_at`,
      groupId, targetMemberId, chairpersonMemberId, timestamp, timestamp,
    );
  } else {
    await db.runAsync("UPDATE loan_committee_members SET status = 'inactive', updated_at = ? WHERE group_id = ? AND member_id = ?", timestamp, groupId, targetMemberId);
  }
  await addLoanAudit(db, groupId, null, chairpersonMemberId, assigned ? 'loan_committee_member_assigned' : 'loan_committee_member_removed', { targetMemberId });
}

export async function getLoanCommitteeMembers(groupId: number): Promise<Array<Record<string, unknown>>> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT cm.*, m.full_name, m.member_number FROM loan_committee_members cm
     JOIN members m ON m.id = cm.member_id
     WHERE cm.group_id = ? AND cm.status = 'active' AND m.status = 'active'
     ORDER BY m.full_name COLLATE NOCASE`, groupId,
  );
}

export async function recordLoanCommitteeDecision(
  applicationId: number,
  approverMemberId: number,
  decision: 'approved' | 'rejected',
  passcode: string,
  note = '',
): Promise<number> {
  const db = await getDatabase();
  const application = await db.getFirstAsync<{ id: number; group_id: number; member_id: number; status: string }>(
    'SELECT id, group_id, member_id, status FROM loan_applications WHERE id = ? LIMIT 1', applicationId,
  );
  if (!application) throw new Error('Loan application not found.');
  if (application.status !== 'pending') throw new Error('Only pending loan applications can receive committee decisions.');
  if (approverMemberId === application.member_id) throw new Error('The borrower cannot approve their own loan.');
  if (!['approved', 'rejected'].includes(decision)) throw new Error('Choose approve or reject.');
  const committeeMember = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM loan_committee_members WHERE group_id = ? AND member_id = ? AND status = 'active' LIMIT 1`,
    application.group_id, approverMemberId,
  );
  if (!committeeMember) throw new Error('Only a currently assigned loan committee member can approve or reject this application.');
  const verification = await verifyMemberPasscode(approverMemberId, application.group_id, passcode);
  if (!verification.success) throw new Error('Approver passcode could not be verified.');
  const member = await db.getFirstAsync<{ status: string; group_id: number }>('SELECT status, group_id FROM members WHERE id = ? LIMIT 1', approverMemberId);
  if (!member || Number(member.group_id) !== application.group_id || member.status !== 'active') throw new Error('Approver must be an active member of the same group.');
  const timestamp = now();
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM loan_committee_approvals WHERE application_id = ? AND approver_member_id = ? LIMIT 1', applicationId, approverMemberId);
  if (existing) {
    await db.runAsync('UPDATE loan_committee_approvals SET decision = ?, note = ?, passcode_verified = 1, decided_at = ? WHERE id = ?', decision, normalizeText(note), timestamp, existing.id);
    await addLoanAudit(db, application.group_id, null, approverMemberId, 'committee_decision_updated', { applicationId, decision, note: normalizeText(note) });
    await refreshLoanApplicationDecision(applicationId);
    return existing.id;
  }
  const result = await db.runAsync(
    `INSERT INTO loan_committee_approvals (application_id, group_id, approver_member_id, decision, note, passcode_verified, decided_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    applicationId, application.group_id, approverMemberId, decision, normalizeText(note), timestamp,
  );
  await addLoanAudit(db, application.group_id, null, approverMemberId, 'committee_decision_recorded', { applicationId, decision, note: normalizeText(note) });
  await refreshLoanApplicationDecision(applicationId);
  return result.lastInsertRowId;
}

export async function createLoanDeductionRequest(
  loanId: number,
  sourceType: 'member_savings' | 'guarantor',
  sourceMemberId: number,
  amount: number,
  requestedByMemberId: number,
  reason: string,
): Promise<number> {
  const db = await getDatabase();
  const loan = await getLoanContract(loanId);
  if (!loan) throw new Error('Loan contract not found.');
  if (!['member_savings', 'guarantor'].includes(sourceType)) throw new Error('Invalid loan deduction source.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Deduction amount must be greater than zero.');
  const policy = await getLoanPolicySettings(loan.group_id);
  if (sourceType === 'member_savings' && !Number(policy.allow_member_savings_deduction)) throw new Error('This group has not enabled deductions from member savings.');
  if (sourceType === 'guarantor' && !Number(policy.allow_guarantor_deduction)) throw new Error('This group has not enabled guarantor deductions.');
  const requester = await db.getFirstAsync<{ group_id: number; status: string }>('SELECT group_id, status FROM members WHERE id = ? LIMIT 1', requestedByMemberId);
  if (!requester || Number(requester.group_id) !== loan.group_id || requester.status !== 'active') throw new Error('The person requesting the deduction must be an active member of this group.');
  const source = await db.getFirstAsync<{ group_id: number; status: string }>('SELECT group_id, status FROM members WHERE id = ? LIMIT 1', sourceMemberId);
  if (!source || Number(source.group_id) !== loan.group_id || source.status !== 'active') throw new Error('Deduction source must be an active member of the same group.');
  if (sourceType === 'member_savings' && sourceMemberId !== loan.member_id) throw new Error('Savings deductions can only be requested from the borrower unless a separate guarantor recovery is authorized.');
  if (sourceType === 'guarantor') {
    const guarantor = await db.getFirstAsync<{ id: number; guarantee_amount: number }>(
      `SELECT g.id, g.guarantee_amount FROM loan_guarantors g
       JOIN loan_records lr ON lr.application_id = g.application_id
       WHERE lr.id = ? AND g.guarantor_member_id = ? AND g.status = 'active' AND g.passcode_verified = 1 LIMIT 1`,
      loanId, sourceMemberId,
    );
    if (!guarantor) throw new Error('A verified active guarantor signature is required before requesting a guarantor deduction.');
    if (amount > Number(guarantor.guarantee_amount)) throw new Error('The requested deduction exceeds this guarantor’s signed guarantee amount.');
  }
  const timestamp = now();
  const result = await db.runAsync(
    `INSERT INTO loan_deductions (loan_id, group_id, source_type, source_member_id, amount, status, reason, requested_by_member_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    loanId, loan.group_id, sourceType, sourceMemberId, amount, normalizeText(reason), requestedByMemberId, timestamp, timestamp,
  );
  await addLoanAudit(db, loan.group_id, loanId, requestedByMemberId, 'loan_deduction_requested', { sourceType, sourceMemberId, amount, reason: normalizeText(reason) });
  return result.lastInsertRowId;
}

export async function setChairpersonEmergencyLoanFreeze(
  groupId: number,
  chairpersonMemberId: number,
  passcode: string,
  reason: string,
  memberId: number | null = null,
): Promise<number> {
  const db = await getDatabase();
  if (!reason.trim()) throw new Error('A reason is required for an emergency loan freeze.');
  const verification = await verifyMemberPasscode(chairpersonMemberId, groupId, passcode);
  if (!verification.success) throw new Error('Chairperson passcode could not be verified.');
  const chair = await db.getFirstAsync<{ assigned_roles: string | null; is_super_user: number | null; status: string }>(
    'SELECT assigned_roles, is_super_user, status FROM members WHERE id = ? AND group_id = ? LIMIT 1', chairpersonMemberId, groupId,
  );
  const roles = (chair?.assigned_roles || '').split(',').map((value) => value.trim().toLowerCase());
  if (!chair || chair.status !== 'active' || (!Number(chair.is_super_user) && !roles.includes('chairperson'))) throw new Error('Only the assigned Chairperson can authorize an emergency loan freeze.');
  if (memberId !== null) {
    const target = await db.getFirstAsync<{ group_id: number; status: string }>('SELECT group_id, status FROM members WHERE id = ? LIMIT 1', memberId);
    if (!target || Number(target.group_id) !== groupId || target.status !== 'active') throw new Error('Choose an active member from this group for an individual freeze.');
  }
  const timestamp = now();
  const result = await db.runAsync(
    `INSERT INTO loan_emergency_freezes (group_id, member_id, reason, authorized_by_member_id, authorized_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    groupId, memberId, normalizeText(reason), chairpersonMemberId, timestamp, timestamp,
  );
  await addLoanAudit(db, groupId, null, chairpersonMemberId, 'emergency_loan_freeze_started', { memberId, reason: normalizeText(reason) });
  return result.lastInsertRowId;
}

export async function endChairpersonEmergencyLoanFreeze(
  freezeId: number,
  chairpersonMemberId: number,
  passcode: string,
  reason: string,
): Promise<void> {
  const db = await getDatabase();
  const freeze = await db.getFirstAsync<{ id: number; group_id: number; status: string }>('SELECT id, group_id, status FROM loan_emergency_freezes WHERE id = ? LIMIT 1', freezeId);
  if (!freeze || freeze.status !== 'active') throw new Error('No active emergency loan freeze was found.');
  if (!reason.trim()) throw new Error('A reason is required to end the freeze.');
  const verification = await verifyMemberPasscode(chairpersonMemberId, freeze.group_id, passcode);
  if (!verification.success) throw new Error('Chairperson passcode could not be verified.');
  const chair = await db.getFirstAsync<{ assigned_roles: string | null; is_super_user: number | null; status: string }>('SELECT assigned_roles, is_super_user, status FROM members WHERE id = ? AND group_id = ? LIMIT 1', chairpersonMemberId, freeze.group_id);
  const roles = (chair?.assigned_roles || '').split(',').map((value) => value.trim().toLowerCase());
  if (!chair || chair.status !== 'active' || (!Number(chair.is_super_user) && !roles.includes('chairperson'))) throw new Error('Only the assigned Chairperson can end an emergency loan freeze.');
  const timestamp = now();
  await db.runAsync('UPDATE loan_emergency_freezes SET status = \'ended\', ended_by_member_id = ?, ended_at = ?, end_reason = ? WHERE id = ? AND status = \'active\'', chairpersonMemberId, timestamp, normalizeText(reason), freezeId);
  await addLoanAudit(db, freeze.group_id, null, chairpersonMemberId, 'emergency_loan_freeze_ended', { freezeId, reason: normalizeText(reason) });
}

export async function getActiveLoanFreezes(groupId: number): Promise<Array<Record<string, unknown>>> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT f.*, target.full_name AS target_member_name, chair.full_name AS chairperson_name
     FROM loan_emergency_freezes f
     LEFT JOIN members target ON target.id = f.member_id
     JOIN members chair ON chair.id = f.authorized_by_member_id
     WHERE f.group_id = ? AND f.status = 'active' ORDER BY f.authorized_at DESC`, groupId,
  );
}

export async function isLoanDisbursementFrozen(groupId: number, memberId?: number): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM loan_emergency_freezes
     WHERE group_id = ? AND status = 'active'
       AND (member_id IS NULL OR member_id = ?)
     LIMIT 1`, groupId, memberId ?? -1,
  );
  return Boolean(row);
}

export async function recordLoanRepayment(
  groupId: number,
  memberId: number,
  amount: number,
  meetingId: number | null = null,
  reason = 'Loan repayment',
): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Loan repayment amount must be a number greater than zero.');
  }

  const db = await getDatabase();
  if (!normalizeText(reason)) throw new Error('A reason is required for every financial transaction.');
  await ensureFinancialAccountsForGroup(db, groupId);
  const timestamp = now();
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    // Re-check the current balance inside the transaction to reduce the risk
    // of recording a payment against a stale screen balance.
    const loan = await getMemberLoanBalance(groupId, memberId);
    if (loan.balance <= 0) {
      throw new Error('This member has no outstanding loan. Loan repayment cannot be recorded.');
    }
    if (amount > loan.balance + 0.000001) {
      throw new Error(
        `Loan repayment cannot exceed the member's outstanding loan balance of ${loan.balance.toLocaleString()}.`,
      );
    }

    const nextInstallment = await db.getFirstAsync<{
      principal_due: number; principal_paid: number; interest_due: number; interest_paid: number;
      repayment_amount_mode: LoanRepaymentAmountMode | null;
    }>(
      `SELECT s.principal_due, s.principal_paid, s.interest_due, s.interest_paid,
              lr.repayment_amount_mode
       FROM loan_repayment_schedule s
       JOIN loan_records lr ON lr.id = s.loan_id
       WHERE lr.group_id = ? AND lr.member_id = ? AND lr.status = 'active'
         AND (s.principal_paid + 0.000001 < s.principal_due OR s.interest_paid + 0.000001 < s.interest_due)
       ORDER BY s.due_date ASC, lr.issue_date ASC, s.installment_number ASC
       LIMIT 1`,
      groupId, memberId,
    );
    // A loan keeps the repayment rule saved when it was disbursed, even if
    // the administrator later changes Setup Rules for future loans.
    if (nextInstallment?.repayment_amount_mode === 'fixed') {
      const installmentOutstanding = Math.max(0,
        Number(nextInstallment.principal_due) - Number(nextInstallment.principal_paid) +
        Number(nextInstallment.interest_due) - Number(nextInstallment.interest_paid));
      const requiredPayment = Math.min(installmentOutstanding, loan.balance);
      if (Math.abs(amount - requiredPayment) > 0.01) {
        throw new Error(`This loan requires a fixed instalment of ${requiredPayment.toLocaleString()}. Enter that amount to record the repayment.`);
      }
    }

    const result = await db.runAsync(
      `INSERT INTO financial_transactions (
        group_id, account_type, amount, reason, member_id, meeting_id,
        transaction_type, reversed_transaction_id, reversed, created_at
      ) VALUES (?, 'loan_repayment', ?, ?, ?, ?, 'loan_repayment', NULL, 0, ?)`,
      groupId, amount, normalizeText(reason), memberId, meetingId, timestamp,
    );
    const transactionId = result.lastInsertRowId;
    await db.runAsync(
      `UPDATE financial_accounts SET balance = balance + ?, updated_at = ?
       WHERE group_id = ? AND account_type = 'loan_repayment'`,
      amount, timestamp, groupId,
    );
    await addPassbookEntry(db, groupId, memberId, meetingId, transactionId, 'loan_repayment', amount, reason, timestamp);

    // Apply the payment to the oldest scheduled installments first, interest then principal.
    let remainingPayment = amount;
    const installments = await db.getAllAsync<{
      id: number; loan_id: number; interest_due: number; interest_paid: number;
      principal_due: number; principal_paid: number; due_date: string; installment_number: number;
    }>(
      `SELECT s.id, s.loan_id, s.interest_due, s.interest_paid, s.principal_due, s.principal_paid, s.due_date, s.installment_number
       FROM loan_repayment_schedule s
       JOIN loan_records lr ON lr.id = s.loan_id
       WHERE lr.group_id = ? AND lr.member_id = ? AND lr.status = 'active'
         AND (s.interest_paid < s.interest_due OR s.principal_paid < s.principal_due)
       ORDER BY s.due_date ASC, lr.issue_date ASC, s.installment_number ASC`,
      groupId, memberId,
    );
    const affectedLoanIds = new Set<number>();
    for (const installment of installments) {
      if (remainingPayment <= 0) break;
      let interestPaid = Number(installment.interest_paid) || 0;
      let principalPaid = Number(installment.principal_paid) || 0;
      const interestOutstanding = Math.max(0, Number(installment.interest_due) - interestPaid);
      const interestPayment = Math.min(remainingPayment, interestOutstanding);
      interestPaid += interestPayment;
      remainingPayment -= interestPayment;
      const principalOutstanding = Math.max(0, Number(installment.principal_due) - principalPaid);
      const principalPayment = Math.min(remainingPayment, principalOutstanding);
      principalPaid += principalPayment;
      remainingPayment -= principalPayment;
      const fullyPaid = interestPaid + 0.000001 >= Number(installment.interest_due)
        && principalPaid + 0.000001 >= Number(installment.principal_due);
      const partiallyPaid = interestPaid > 0 || principalPaid > 0;
      await db.runAsync(
        `UPDATE loan_repayment_schedule SET interest_paid = ?, principal_paid = ?, status = ?, updated_at = ? WHERE id = ?`,
        interestPaid, principalPaid, fullyPaid ? 'paid' : partiallyPaid ? 'partial' : 'pending', timestamp, installment.id,
      );
      affectedLoanIds.add(Number(installment.loan_id));
    }
    for (const loanId of affectedLoanIds) {
      const unpaid = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM loan_repayment_schedule
         WHERE loan_id = ? AND (interest_paid + 0.000001 < interest_due OR principal_paid + 0.000001 < principal_due)`, loanId,
      );
      if (Number(unpaid?.count ?? 0) === 0) {
        await db.runAsync(`UPDATE loan_records SET status = 'paid', updated_at = ? WHERE id = ? AND status = 'active'`, timestamp, loanId);
      }
    }
    await db.runAsync("UPDATE groups SET status = 'active', last_activity_at = ? WHERE id = ?", timestamp, groupId);
    await db.execAsync('COMMIT;');
    return transactionId;
  } catch (error) {
    await db.execAsync('ROLLBACK;');
    throw error;
  }
}

/**
 * Returns the final repayment due date for a member's current active/frozen
 * loan contract. Legacy loans without a loan_records entry return null.
 */
/**
 * Returns the issue date of the member's most recent loan.
 * Uses the loan contract first, then imported historical disbursements,
 * and finally the original ledger transaction timestamp for legacy loans.
 */
export async function getMemberLoanIssueDate(
  groupId: number,
  memberId: number,
): Promise<string | null> {
  const db = await getDatabase();

  const contract = await db.getFirstAsync<{ issue_date: string | null }>(
    `SELECT issue_date
     FROM loan_records
     WHERE group_id = ? AND member_id = ?
       AND status IN ('active', 'frozen', 'paid')
     ORDER BY issue_date DESC, id DESC
     LIMIT 1`,
    groupId,
    memberId,
  );
  if (contract?.issue_date) return dateOnly(contract.issue_date) ?? contract.issue_date;

  const historical = await db.getFirstAsync<{ transaction_date: string | null }>(
    `SELECT transaction_date
     FROM historical_transaction_imports
     WHERE group_id = ? AND member_id = ?
       AND historical_type = 'loan_disbursement'
       AND COALESCE(is_deleted, 0) = 0
     ORDER BY transaction_date DESC, id DESC
     LIMIT 1`,
    groupId,
    memberId,
  );
  if (historical?.transaction_date) return dateOnly(historical.transaction_date) ?? historical.transaction_date;

  const ledger = await db.getFirstAsync<{ created_at: string | null }>(
    `SELECT created_at
     FROM financial_transactions
     WHERE group_id = ? AND member_id = ?
       AND transaction_type = 'loan_issued'
       AND reversed = 0
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    groupId,
    memberId,
  );
  if (!ledger?.created_at) return null;
  return dateOnly(ledger.created_at) ?? ledger.created_at;
}

export async function getMemberLoanDueDate(
  groupId: number,
  memberId: number,
): Promise<string | null> {
  const db = await getDatabase();
  const contract = await db.getFirstAsync<{ due_date: string | null }>(
    `SELECT due_date
     FROM loan_records
     WHERE group_id = ? AND member_id = ? AND status IN ('active', 'frozen')
     ORDER BY issue_date DESC, id DESC
     LIMIT 1`,
    groupId,
    memberId,
  );
  if (contract?.due_date) return contract.due_date;

  const outstanding = await getMemberLoanBalance(groupId, memberId);
  if (outstanding.balance > 0) {
    const historicalLoan = await db.getFirstAsync<{ loan_due_date: string | null }>(
      `SELECT loan_due_date FROM historical_transaction_imports
       WHERE group_id = ? AND member_id = ? AND historical_type = 'loan_disbursement'
         AND loan_due_date IS NOT NULL
       ORDER BY transaction_date DESC, id DESC LIMIT 1`,
      groupId, memberId,
    );
    if (historicalLoan?.loan_due_date) return historicalLoan.loan_due_date;
  } else {
    const recordedLoanLedger = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND reversed = 0
         AND transaction_type IN ('loan_issued', 'loan_repayment')`,
      groupId, memberId,
    );
    const openingLoan = await db.getFirstAsync<{ amount: number }>(
      `SELECT COALESCE(opening_loan_balance, 0) AS amount
       FROM member_opening_balances WHERE group_id = ? AND member_id = ? LIMIT 1`,
      groupId, memberId,
    );
    // Do not return stale statement/opening due dates after a tracked balance
    // has been cleared. Legacy statement-only members remain supported below.
    if (Number(recordedLoanLedger?.count ?? 0) > 0 || Number(openingLoan?.amount ?? 0) > 0) return null;
  }

  // Older loans may have a due date saved in a member statement rather than
  // a loan contract record. Use that only when the last statement still had
  // an outstanding loan balance.
  const statement = await db.getFirstAsync<{
    individual_loan_due_date: string | null;
    individual_loan_balance: number;
  }>(
    `SELECT individual_loan_due_date, individual_loan_balance
     FROM member_statement_records
     WHERE member_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    memberId,
  );
  if (Number(statement?.individual_loan_balance ?? 0) > 0 && statement?.individual_loan_due_date) {
    return statement.individual_loan_due_date;
  }

  // Onboarded existing loans can store their due date with their opening balance.
  const opening = await db.getFirstAsync<{
    loan_due_date: string | null;
    opening_loan_balance: number;
  }>(
    `SELECT loan_due_date, opening_loan_balance
     FROM member_opening_balances
     WHERE group_id = ? AND member_id = ?
     LIMIT 1`,
    groupId,
    memberId,
  );
  if (Number(opening?.opening_loan_balance ?? 0) > 0 && opening?.loan_due_date) {
    return opening.loan_due_date;
  }

  return null;
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

  // A historical balance is the final amount owed on that date, not a repayment.
  // It replaces all earlier/opening loan figures; only later digital-cycle activity
  // is added to or deducted from that snapshot.
  const snapshot = await db.getFirstAsync<{ balance: number; transaction_date: string }>(
    `SELECT balance, transaction_date
     FROM historical_member_loan_balances
     WHERE group_id = ? AND member_id = ? AND is_deleted = 0
     ORDER BY transaction_date DESC, id DESC
     LIMIT 1`,
    groupId, memberId,
  );
  if (snapshot) {
    const snapshotDate = snapshot.transaction_date;
    const issuedAfter = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(ABS(amount)), 0) AS total
       FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND account_type = 'loan_fund'
         AND transaction_type = 'loan_issued' AND reversed = 0
         AND substr(created_at, 1, 10) > ?`,
      groupId, memberId, snapshotDate,
    );
    const repaymentsAfter = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND account_type = 'loan_repayment'
         AND transaction_type = 'loan_repayment' AND reversed = 0
         AND substr(created_at, 1, 10) > ?`,
      groupId, memberId, snapshotDate,
    );
    const interestAfter = await db.getFirstAsync<{ total: number }>(
      `SELECT
         COALESCE((SELECT SUM(lic.interest_amount) FROM loan_interest_charges lic
           WHERE lic.group_id = ? AND lic.member_id = ? AND substr(lic.created_at, 1, 10) > ?), 0)
         + COALESCE((SELECT SUM(lr.total_interest) FROM loan_records lr
           JOIN financial_transactions lft ON lft.id = lr.disbursement_transaction_id
           WHERE lr.group_id = ? AND lr.member_id = ? AND lr.status != 'cancelled'
             AND lft.reversed = 0 AND lr.issue_date > ?), 0)
         + COALESCE((SELECT SUM(mlic.interest_amount) FROM meeting_loan_interest_charges mlic
           WHERE mlic.group_id = ? AND mlic.member_id = ? AND mlic.charge_date > ?), 0)
         + COALESCE((SELECT SUM(hi.historical_interest) FROM historical_transaction_imports hi
           WHERE hi.group_id = ? AND hi.member_id = ? AND hi.historical_type = 'loan_disbursement'
             AND COALESCE(hi.is_deleted, 0) = 0 AND hi.transaction_date > ?), 0) AS total`,
      groupId, memberId, snapshotDate,
      groupId, memberId, snapshotDate,
      groupId, memberId, snapshotDate,
      groupId, memberId, snapshotDate,
    );
    const principal = Number(snapshot.balance || 0) + Number(issuedAfter?.total || 0);
    const interest = Number(interestAfter?.total || 0);
    const paid = Number(repaymentsAfter?.total || 0);
    return { principal, interest, balance: Math.max(0, principal + interest - paid) };
  }

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
      `SELECT
         COALESCE((SELECT SUM(lic.interest_amount) FROM loan_interest_charges lic
           WHERE lic.group_id = ? AND lic.member_id = ?), 0)
         + COALESCE((SELECT SUM(lr.total_interest) FROM loan_records lr
           JOIN financial_transactions lft ON lft.id = lr.disbursement_transaction_id
           WHERE lr.group_id = ? AND lr.member_id = ? AND lr.status != 'cancelled' AND lft.reversed = 0), 0)
         + COALESCE((SELECT SUM(mlic.interest_amount) FROM meeting_loan_interest_charges mlic
           WHERE mlic.group_id = ? AND mlic.member_id = ?), 0)
         + COALESCE((SELECT SUM(hi.historical_interest) FROM historical_transaction_imports hi
           WHERE hi.group_id = ? AND hi.member_id = ? AND hi.historical_type = 'loan_disbursement' AND COALESCE(hi.is_deleted, 0) = 0), 0)
         AS total`,
      groupId, memberId, groupId, memberId, groupId, memberId, groupId, memberId,
    );

  const openingPrincipal = await db.getFirstAsync<{ amount: number }>(
    `SELECT CASE WHEN EXISTS (
       SELECT 1 FROM historical_transaction_imports
       WHERE group_id = ? AND member_id = ? AND historical_type = 'loan_disbursement'
     ) THEN 0 ELSE COALESCE((
       SELECT opening_loan_balance FROM member_opening_balances
       WHERE group_id = ? AND member_id = ? LIMIT 1
     ), 0) END AS amount`,
    groupId, memberId, groupId, memberId,
  );
  const principal = Number(issued?.total ?? 0) + Number(openingPrincipal?.amount ?? 0);
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

  const normalizedReason = normalizeText(reason);
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
    normalizedReason,
    memberId,
    meetingId,
    timestamp,
  );

  // An assessed fine is a liability for the member, not cash received.
  // Keep it in the member passbook with the same assessment timestamp.
  await addPassbookEntry(
    db,
    groupId,
    memberId,
    meetingId,
    result.lastInsertRowId,
    'fine_assessed',
    -amount,
    normalizedReason,
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

async function requireOpenInsuranceMeeting(
  db: SQLite.SQLiteDatabase,
  groupId: number,
  meetingId: number | null,
): Promise<void> {
  if (!Number.isInteger(meetingId) || Number(meetingId) <= 0) {
    throw new Error('Open a group meeting before recording an insurance contribution or benefit.');
  }
  const meeting = await db.getFirstAsync<{ group_id: number; status: string }>(
    `SELECT group_id, status FROM group_meetings WHERE id = ? LIMIT 1`,
    meetingId,
  );
  if (!meeting || Number(meeting.group_id) !== groupId || String(meeting.status).toLowerCase() !== 'open') {
    throw new Error('Insurance contributions and benefits can only be recorded against this group’s open meeting.');
  }
}

async function getAgreedInsuranceContribution(
  db: SQLite.SQLiteDatabase,
  groupId: number,
): Promise<number> {
  const rules = await db.getFirstAsync<{ insurance_contribution_amount: number }>(
    `SELECT insurance_contribution_amount FROM vsla_setup_rules WHERE group_id = ? LIMIT 1`,
    groupId,
  );
  const amount = Number(rules?.insurance_contribution_amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Set the agreed Insurance Contribution per Member per Meeting in Setup Rules before collecting insurance.');
  }
  return amount;
}

async function assertInsuranceContributionAllowed(
  db: SQLite.SQLiteDatabase,
  groupId: number,
  memberId: number,
  amount: number,
  meetingId: number | null,
  checkDuplicate: boolean,
): Promise<void> {
  await requireOpenInsuranceMeeting(db, groupId, meetingId);
  const member = await db.getFirstAsync<{ group_id: number; status: string }>(
    `SELECT group_id, status FROM members WHERE id = ? LIMIT 1`,
    memberId,
  );
  if (!member || Number(member.group_id) !== groupId || String(member.status).toLowerCase() !== 'active') {
    throw new Error('Only active members of this group can pay insurance contributions.');
  }
  const agreedAmount = await getAgreedInsuranceContribution(db, groupId);
  if (!Number.isFinite(amount) || Math.abs(amount - agreedAmount) > 0.0001) {
    throw new Error(`The agreed insurance contribution for this meeting is ${agreedAmount.toLocaleString()}. Record that exact amount.`);
  }
  if (checkDuplicate) {
    const existing = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND meeting_id = ?
         AND account_type = 'insurance_fund'
         AND transaction_type = 'insurance_contribution'
         AND reversed = 0 LIMIT 1`,
      groupId, memberId, meetingId,
    );
    if (existing) {
      throw new Error('This member has already paid the insurance contribution for this meeting. The next contribution is due at the next meeting.');
    }
  }
}

async function assertMemberInsuranceEligible(
  db: SQLite.SQLiteDatabase,
  groupId: number,
  memberId: number,
  meetingId: number | null,
): Promise<void> {
  await requireOpenInsuranceMeeting(db, groupId, meetingId);
  const member = await db.getFirstAsync<{ group_id: number; status: string }>(
    `SELECT group_id, status FROM members WHERE id = ? LIMIT 1`,
    memberId,
  );
  if (!member || Number(member.group_id) !== groupId || String(member.status).toLowerCase() !== 'active') {
    throw new Error('Insurance benefits are available only to active members of this group.');
  }
  const requiredKin = await db.getFirstAsync<{ completed: number }>(
    `SELECT COUNT(*) AS completed
     FROM member_next_of_kin
     WHERE member_id = ? AND slot IN (1, 2)
       AND TRIM(COALESCE(name, '')) <> ''
       AND TRIM(COALESCE(phone, '')) <> ''`,
    memberId,
  );
  if (Number(requiredKin?.completed ?? 0) !== 2) {
    throw new Error('This member must have both required next-of-kin contacts (Slots 1 and 2, each with a name and phone number) completed before any insurance benefit can be disbursed.');
  }

  const requiredAmount = await getAgreedInsuranceContribution(db, groupId);
  const contribution = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM financial_transactions
     WHERE group_id = ? AND member_id = ? AND meeting_id = ?
       AND account_type = 'insurance_fund'
       AND transaction_type = 'insurance_contribution'
       AND reversed = 0`,
    groupId, memberId, meetingId,
  );
  if (Number(contribution?.total ?? 0) + 0.0001 < requiredAmount) {
    throw new Error('This member has not paid the agreed insurance contribution for the current meeting and is not eligible to receive an insurance benefit.');
  }
}

export type InsuranceContributionStatus = {
  member_id: number;
  contribution_amount: number;
  contributed: boolean;
};

export async function getInsuranceContributionStatus(
  groupId: number,
  meetingId: number,
): Promise<InsuranceContributionStatus[]> {
  const db = await getDatabase();
  const requiredAmount = await getAgreedInsuranceContribution(db, groupId);
  const rows = await db.getAllAsync<{ member_id: number; contribution_amount: number }>(
    `SELECT m.id AS member_id,
            COALESCE(SUM(CASE WHEN ft.reversed = 0 THEN ft.amount ELSE 0 END), 0) AS contribution_amount
     FROM members m
     LEFT JOIN financial_transactions ft
       ON ft.group_id = m.group_id
       AND ft.member_id = m.id
       AND ft.meeting_id = ?
       AND ft.account_type = 'insurance_fund'
       AND ft.transaction_type = 'insurance_contribution'
     WHERE m.group_id = ? AND LOWER(m.status) = 'active'
     GROUP BY m.id
     ORDER BY m.id ASC`,
    meetingId,
    groupId,
  );
  return rows.map((row) => ({
    member_id: Number(row.member_id),
    contribution_amount: Number(row.contribution_amount ?? 0),
    contributed: Number(row.contribution_amount ?? 0) + 0.0001 >= requiredAmount,
  }));
}

export async function recordInsuranceContribution(
  groupId: number,
  memberId: number,
  amount: number,
  meetingId: number | null = null,
): Promise<number> {
  const db = await getDatabase();
  await assertInsuranceContributionAllowed(db, groupId, memberId, amount, meetingId, true);

  await db.execAsync('BEGIN TRANSACTION;');
  try {
    const transactionId = await recordFinancialIncome(
      groupId,
      'insurance_fund',
      amount,
      'Insurance contribution',
      memberId,
      meetingId,
      'insurance_contribution',
    );
    await db.execAsync('COMMIT;');
    return transactionId;
  } catch (error) {
    await db.execAsync('ROLLBACK;').catch(() => undefined);
    throw error;
  }
}

async function recordInsurancePayout(
  groupId: number,
  memberId: number,
  amount: number,
  reason: string,
  meetingId: number | null,
  beneficiaryLabel: string,
  kinSlot?: 1 | 2 | 3,
): Promise<number> {
  const db = await getDatabase();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Insurance benefit amount must be greater than zero.');
  }
  const cleanReason = normalizeText(reason);
  if (!cleanReason) throw new Error('A reason is required for every insurance benefit.');

  await assertMemberInsuranceEligible(db, groupId, memberId, meetingId);
  const account = await getFinancialAccount(groupId, 'insurance_fund');
  if (!account) throw new Error('Insurance Fund account was not found.');
  if (Number(account.balance) + 0.0001 < amount) {
    throw new Error('Insufficient Insurance Fund balance.');
  }
  const member = await db.getFirstAsync<{ full_name: string }>(
    `SELECT full_name FROM members WHERE id = ? LIMIT 1`,
    memberId,
  );
  const group = await db.getFirstAsync<{ group_name: string; currency: string }>(
    `SELECT group_name, currency FROM groups WHERE id = ? LIMIT 1`,
    groupId,
  );
  const timestamp = now();

  await db.execAsync('BEGIN TRANSACTION;');
  try {
    const transactionId = await recordFinancialExpense(
      groupId,
      'insurance_fund',
      amount,
      cleanReason,
      memberId,
      meetingId,
      'insurance_benefit',
    );

    if (kinSlot !== undefined) {
      await db.runAsync(
        `INSERT INTO next_of_kin_benefits (
          member_id, slot, benefit_amount, reason, benefit_date, effective_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'received')`,
        memberId, kinSlot, amount, cleanReason, timestamp, timestamp,
      );
      if (kinSlot === 3) {
        await db.runAsync(
          `UPDATE member_next_of_kin SET benefit_received = 0, locked = 0, updated_at = ? WHERE member_id = ? AND slot = 3`,
          timestamp, memberId,
        );
      } else {
        await db.runAsync(
          `UPDATE member_next_of_kin SET benefit_received = 1, locked = 1, updated_at = ? WHERE member_id = ? AND slot = ?`,
          timestamp, memberId, kinSlot,
        );
      }
    }

    const currency = normalizeText(group?.currency ?? '') || 'UGX';
    const message = `Executive insurance disbursement for ${member?.full_name ?? 'a group member'}; beneficiary: ${beneficiaryLabel}; amount: ${currency} ${amount.toLocaleString()}; reason: ${cleanReason}. A new insurance contribution is due from each member at the next meeting.`;
    // member_id = NULL marks this as a group-wide notification in the existing queue.
    await queueNotification(
      groupId,
      null,
      'insurance_benefit_disbursed',
      'Insurance Benefit Disbursed',
      message,
      'high',
    );

    await db.execAsync('COMMIT;');
    return transactionId;
  } catch (error) {
    await db.execAsync('ROLLBACK;').catch(() => undefined);
    throw error;
  }
}

/**
 * Legacy slot-4 member benefit calls are intentionally blocked.
 * Slot 4 now represents an executive-authorized lump-sum transfer to another
 * group, never a direct payout to an individual member.
 */
export async function recordInsuranceBenefit(
  groupId: number,
  memberId: number,
  amount: number,
  reason: string,
  meetingId: number | null = null,
  beneficiaryLabel = 'Slot 4 — Group-to-group benefit',
): Promise<number> {
  void groupId;
  void memberId;
  void amount;
  void reason;
  void meetingId;
  void beneficiaryLabel;
  throw new Error('Slot 4 is reserved for executive-authorized whole-sum disbursements to another group. Use recordInsuranceGroupBenefit. Individual member benefits must use next-of-kin Slots 1, 2, or 3.');
}

export async function recordInsuranceGroupBenefit(
  groupId: number,
  recipientGroupName: string,
  amount: number,
  reason: string,
  meetingId: number | null,
  executiveMemberId: number,
): Promise<number> {
  const db = await getDatabase();
  const targetGroup = normalizeText(recipientGroupName);
  const cleanReason = normalizeText(reason);

  if (!targetGroup) throw new Error('Enter the name of the other group receiving the Slot 4 insurance benefit.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Insurance group disbursement amount must be greater than zero.');
  if (!cleanReason) throw new Error('A reason is required for every insurance group disbursement.');

  await requireOpenInsuranceMeeting(db, groupId, meetingId);
  await getAgreedInsuranceContribution(db, groupId);

  const group = await db.getFirstAsync<{ group_name: string; currency: string }>(
    `SELECT group_name, currency FROM groups WHERE id = ? LIMIT 1`,
    groupId,
  );
  if (!group) throw new Error('Group not found.');
  if (targetGroup.toLowerCase() === normalizeText(group.group_name).toLowerCase()) {
    throw new Error('Slot 4 is for disbursing a whole-sum benefit to another group, not the current group itself.');
  }

  const executive = await db.getFirstAsync<{
    id: number; group_id: number; status: string; role: string | null;
    assigned_roles: string | null; is_super_user: number | null; full_name: string;
  }>(
    `SELECT id, group_id, status, role, assigned_roles, is_super_user, full_name
     FROM members WHERE id = ? LIMIT 1`,
    executiveMemberId,
  );
  const executiveRoles = (executive?.assigned_roles || '')
    .split(',')
    .map((role: string) => canonicalExecutivePost(role));
  const authorizedExecutive = Boolean(
    executive &&
    Number(executive.group_id) === groupId &&
    String(executive.status).toLowerCase() === 'active' &&
    (
      String(executive.role || '').trim().toLowerCase() === 'executive' ||
      Number(executive.is_super_user) === 1 ||
      executiveRoles.some((role) => role && EXECUTIVE_POSTS.includes(role as (typeof EXECUTIVE_POSTS)[number]))
    )
  );
  if (!authorizedExecutive || !executive) {
    throw new Error('Only an active executive of this group can authorize a Slot 4 group-to-group disbursement.');
  }

  const currency = normalizeText(group.currency || '') || 'UGX';
  const transactionReason = `Slot 4 group-to-group insurance benefit to ${targetGroup}. Reason: ${cleanReason}. Authorized by ${executive.full_name}.`;
  await db.execAsync('BEGIN TRANSACTION;');
  try {
    // Re-check the available balance inside the transaction so simultaneous
    // payouts cannot each spend the same available balance.
    const account = await getFinancialAccount(groupId, 'insurance_fund');
    if (!account) throw new Error('Insurance Fund account was not found.');
    if (Number(account.balance) + 0.0001 < amount) throw new Error('Insufficient Insurance Fund balance.');

    const transactionId = await recordFinancialExpense(
      groupId,
      'insurance_fund',
      amount,
      transactionReason,
      null,
      meetingId,
      'insurance_benefit',
    );

    const message = `Executive Slot 4 insurance disbursement from ${group.group_name} to ${targetGroup}; amount: ${currency} ${amount.toLocaleString()}; reason: ${cleanReason}; authorized by: ${executive.full_name}. This is a whole-sum group-to-group benefit and is not an individual member payout. Every member must contribute the agreed insurance amount again at the next meeting. Individual members who have not contributed for the current meeting remain ineligible for individual insurance benefits.`;
    await queueNotification(
      groupId,
      null,
      'insurance_group_benefit_disbursed',
      'Slot 4 Insurance Fund Disbursement',
      message,
      'high',
    );

    await db.execAsync('COMMIT;');
    return transactionId;
  } catch (error) {
    await db.execAsync('ROLLBACK;').catch(() => undefined);
    throw error;
  }
}

export async function recordInsuranceKinBenefit(
  groupId: number,
  memberId: number,
  slot: 1 | 2 | 3,
  amount: number,
  reason: string,
  meetingId: number | null = null,
): Promise<number> {
  const db = await getDatabase();
  if (![1, 2, 3].includes(slot)) throw new Error('Choose next-of-kin slot 1, 2, or 3.');
  const kin = await getKin(db, memberId, slot);
  if (!kin || !normalizeText(kin.name)) {
    throw new Error(`Add a named next-of-kin beneficiary to slot ${slot} before disbursing the benefit.`);
  }
  if (slot !== 3 && (Number(kin.locked) === 1 || Number(kin.benefit_received) === 1)) {
    throw new Error(`Slot ${slot} is permanently locked because a benefit has already been paid through it. It cannot be edited, replaced, or reused.`);
  }
  await assertNoPendingKinBenefit(db, memberId, slot);
  return recordInsurancePayout(
    groupId,
    memberId,
    amount,
    reason,
    meetingId,
    `Slot ${slot} next of kin — ${kin.name}`,
    slot,
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

  const meeting = await db.getFirstAsync<{ group_id: number }>(
    `SELECT group_id FROM group_meetings WHERE id = ? LIMIT 1`,
    meetingId,
  );
  const setup = meeting
    ? await getVSLASetupRules(meeting.group_id)
    : null;
  const allowSocialFundForLoans =
    Number(setup?.allow_social_fund_for_loans ?? 0) === 1;
  const allowExternalFundForLoans =
    Number(setup?.allow_external_fund_for_loans ?? 0) === 1;
  const allowFinesForLoans =
    Number(setup?.allow_fines_for_loans ?? 1) === 1;

  const rows = await db.getAllAsync<{
    account_type: string;
    transaction_type: string;
    original_transaction_type: string | null;
    amount: number;
    member_id: number | null;
  }>(
    `SELECT
       ft.account_type,
       ft.transaction_type,
       original.transaction_type AS original_transaction_type,
       ft.amount,
       ft.member_id
     FROM financial_transactions ft
     LEFT JOIN financial_transactions original
       ON ft.transaction_type = 'reversal'
      AND original.id = ft.reversed_transaction_id
     WHERE ft.meeting_id = ? AND ft.reversed = 0`,
    meetingId,
  );

  let savings = 0;
  let fines = 0;
  let loanRepayment = 0;
  let socialFund = 0;
  let externalFund = 0;
  let directLoanFundIncome = 0;
  let loanDisbursement = 0;
  let miscellaneousExpense = 0;
  let insuranceFund = 0;
  let totalCollected = 0;

  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    const effectiveType = row.transaction_type === 'reversal'
      ? (row.original_transaction_type || 'reversal')
      : row.transaction_type;

    if (row.account_type === 'savings' && effectiveType !== 'reversal' && effectiveType !== 'loan_issued') {
      savings += amount;
      totalCollected += amount;
    }

    // A fine assessment is not cash collected. Fine-payment reversals
    // are mapped to their original transaction type and subtract normally.
    if (
      row.account_type === 'fines' &&
      row.member_id !== null &&
      effectiveType === 'fine_payment'
    ) {
      fines += amount;
      totalCollected += amount;
    }

    if (
      row.account_type === 'loan_repayment' &&
      effectiveType === 'loan_repayment'
    ) {
      loanRepayment += amount;
      totalCollected += amount;
    }

    if (row.account_type === 'social_fund' && effectiveType !== 'reversal') {
      socialFund += amount;
      totalCollected += amount;
    }

    if (row.account_type === 'external_fund' && effectiveType !== 'reversal') {
      externalFund += amount;
      totalCollected += amount;
    }

    if (
      row.account_type === 'loan_fund' &&
      effectiveType === 'loan_issued'
    ) {
      // Loan disbursements are negative. A positive reversal reduces the
      // net disbursement amount rather than being counted as a collection.
      loanDisbursement -= amount;
    } else if (
      row.account_type === 'loan_fund' &&
      effectiveType !== 'reversal' &&
      effectiveType !== 'loan_issued'
    ) {
      directLoanFundIncome += amount;
      totalCollected += amount;
    }

    if (row.account_type === 'insurance_fund') {
      insuranceFund += amount;
      if (effectiveType === 'insurance_contribution') {
        totalCollected += amount;
      }
    }

    if (
      row.account_type === 'expenditure_fund' &&
      effectiveType === 'expenditure'
    ) {
      // Expenses are negative; a reversal offsets the original expense.
      miscellaneousExpense -= amount;
    }
  }

  // Insurance remains separate. Social Fund and External Fund collections
  // enter the Loan Fund only when the group's Setup Rules explicitly allow it.
  // Loan disbursements reduce the available Loan Fund.
  const loanFundCollections =
    savings +
    (allowFinesForLoans ? fines : 0) +
    loanRepayment +
    (allowSocialFundForLoans ? socialFund : 0) +
    (allowExternalFundForLoans ? externalFund : 0) +
    directLoanFundIncome;
  const loanFund = Math.max(0, loanFundCollections - loanDisbursement);

  return {
    savings,
    fines,
    loanRepayment,
    socialFund,
    externalFund,
    directLoanFundIncome,
    loanDisbursement,
    loanFundCollections,
    totalCollected,
    miscellaneousExpense,
    loanFund,
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
    if (
      row.account_type === 'fines' &&
      row.transaction_type === 'fine_payment'
    ) {
      balances.fines += value;
    }
    if (row.account_type === 'external_fund') balances.external_fund += value;
    if (row.account_type === 'expenditure_fund') balances.expenditure_fund += value;
    if (row.account_type === 'insurance_fund') balances.insurance_fund += value;
    if (row.account_type === 'loan_fund' && row.transaction_type !== 'loan_issued') balances.loan_fund += value;
  }

  // Loan Fund follows the agreed formula:
  // savings + paid fines + all other Loan Fund collections - loan disbursements.
  // Insurance is separate. Expenditure Fund is also tracked separately and
  // is not subtracted from the Loan Fund formula.
  const issued = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(ABS(amount)), 0) AS total
     FROM financial_transactions
     WHERE group_id = ? AND account_type = 'loan_fund'
       AND transaction_type = 'loan_issued' AND reversed = 0`,
    groupId,
  );
  const issuedAmount = Number(issued?.total) || 0;

  const setup = await getVSLASetupRules(groupId);
  const allowSocialFundForLoans =
    Number(setup?.allow_social_fund_for_loans ?? 0) === 1;
  const allowExternalFundForLoans =
    Number(setup?.allow_external_fund_for_loans ?? 0) === 1;
  const allowFinesForLoans =
    Number(setup?.allow_fines_for_loans ?? 1) === 1;

  balances.loan_fund = Math.max(
    0,
    balances.savings +
      (allowFinesForLoans ? balances.fines : 0) +
      (allowSocialFundForLoans ? balances.social_fund : 0) +
      (allowExternalFundForLoans ? balances.external_fund : 0) +
      balances.loan_fund +
      balances.loan_repayment -
      issuedAmount,
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

  const frequency = String(rules?.meeting_frequency ?? '').toLowerCase();
  const meetingsPerCycle = frequency.startsWith('twice_')
    ? 24
    : frequency.includes('monthly')
      ? 12
      : frequency.includes('weekly')
        ? 52
        : frequency === 'biweekly'
          ? 26
          : 1;

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
   AUTOMATIC MEMBER FINES
   ============================================================

   Assessed fines are member liabilities only. They do NOT increase the
   group's cash/fines balance until the member actually pays the fine.
*/

async function hasAutomaticFine(
  db: SQLite.SQLiteDatabase,
  groupId: number,
  memberId: number,
  meetingId: number,
  reason: string,
): Promise<boolean> {
  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id
     FROM financial_transactions
     WHERE group_id = ?
       AND member_id = ?
       AND meeting_id = ?
       AND account_type = 'fines'
       AND transaction_type = 'fine'
       AND reason = ?
       AND reversed = 0
     LIMIT 1`,
    groupId, memberId, meetingId, reason,
  );
  return Boolean(existing);
}

async function addAutomaticFineIfNeeded(
  groupId: number, memberId: number, meetingId: number,
  amount: number, reason: string,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const db = await getDatabase();
  if (await hasAutomaticFine(db, groupId, memberId, meetingId, reason)) return;
  await recordFine(groupId, amount, reason, memberId, meetingId);
}

async function applyAutomaticAttendanceFine(
  groupId: number, memberId: number, meetingId: number,
  attendanceStatus: 'present' | 'late' | 'absent',
): Promise<void> {
  const setup = await getVSLASetupRules(groupId);
  if (attendanceStatus === 'late') {
    await addAutomaticFineIfNeeded(groupId, memberId, meetingId, Number(setup?.late_fine ?? 0), 'Late attendance fine');
  }
  if (attendanceStatus === 'absent') {
    await addAutomaticFineIfNeeded(groupId, memberId, meetingId, Number(setup?.absence_fine ?? 0), 'Absence fine');
  }
}

async function applyAutomaticMeetingActivityFines(
  groupId: number, meetingId: number,
): Promise<void> {
  const db = await getDatabase();
  const setup = await getVSLASetupRules(groupId);
  if (!setup) return;

  const members = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM members WHERE group_id = ? AND status = 'active' ORDER BY id ASC`,
    groupId,
  );

  for (const member of members) {
    const savings = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND meeting_id = ?
         AND account_type = 'savings' AND transaction_type = 'savings_contribution' AND reversed = 0`,
      groupId, member.id, meetingId,
    );

    if (Number(setup.non_saving_fine) > 0 && Number(savings?.total ?? 0) <= 0) {
      await addAutomaticFineIfNeeded(groupId, member.id, meetingId, Number(setup.non_saving_fine), 'Non-saving fine');
    }

    const currentMeeting = await db.getFirstAsync<{ meeting_number: number }>(
      `SELECT meeting_number FROM group_meetings WHERE id = ? LIMIT 1`,
      meetingId,
    );

    const priorLoan = await db.getFirstAsync<{ issued: number; repaid: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN t.transaction_type = 'loan_issued' THEN ABS(t.amount) ELSE 0 END), 0) AS issued,
         COALESCE(SUM(CASE WHEN t.transaction_type = 'loan_repayment' THEN t.amount ELSE 0 END), 0) AS repaid
       FROM financial_transactions t
       LEFT JOIN group_meetings gm ON gm.id = t.meeting_id
       WHERE t.group_id = ?
         AND t.member_id = ?
         AND t.reversed = 0
         AND (gm.meeting_number < ? OR t.meeting_id IS NULL)`,
      groupId, member.id, Number(currentMeeting?.meeting_number ?? 0),
    );

    const priorLoanBalance = Math.max(
      0,
      Number(priorLoan?.issued ?? 0) - Number(priorLoan?.repaid ?? 0),
    );

    const repayment = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND meeting_id = ?
         AND account_type = 'loan_repayment' AND transaction_type = 'loan_repayment' AND reversed = 0`,
      groupId, member.id, meetingId,
    );

    if (Number(setup.non_loan_repayment_fine) > 0 && priorLoanBalance > 0 && Number(repayment?.total ?? 0) <= 0) {
      await addAutomaticFineIfNeeded(groupId, member.id, meetingId, Number(setup.non_loan_repayment_fine), 'Non-loan-repayment fine');
    }

    const insurance = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND meeting_id = ?
         AND account_type = 'insurance_fund' AND transaction_type = 'insurance_contribution' AND reversed = 0`,
      groupId, member.id, meetingId,
    );

    if (
      Number(setup.insurance_contribution_amount ?? 0) > 0 &&
      Number(setup.non_insurance_contribution) > 0 &&
      Number(insurance?.total ?? 0) < Number(setup.insurance_contribution_amount)
    ) {
      await addAutomaticFineIfNeeded(groupId, member.id, meetingId, Number(setup.non_insurance_contribution), 'Non-insurance-contribution fine');
    }
  }
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

  await applyAutomaticAttendanceFine(
    meeting.group_id,
    memberId,
    meetingId,
    status as 'present' | 'late' | 'absent',
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
  const setup = await getVSLASetupRules(meeting.group_id);
  const socialFundNotAllocatedToLoans =
    Number(setup?.allow_social_fund_for_loans ?? 0) === 1
      ? 0
      : summary.socialFund;
  const externalFundNotAllocatedToLoans =
    Number(setup?.allow_external_fund_for_loans ?? 0) === 1
      ? 0
      : summary.externalFund;
  const finesNotAllocatedToLoans =
    Number(setup?.allow_fines_for_loans ?? 1) === 1
      ? 0
      : summary.fines;
  // Cash reconciliation includes every fund physically collected, even when
  // fines, Social Fund, or External Fund are kept separate from the Loan Fund.
  const expectedCash = Math.max(
    0,
    Number(meeting.loan_fund_at_start || 0) +
      Number(meeting.insurance_fund_at_start || 0) +
      summary.loanFundCollections +
      finesNotAllocatedToLoans +
      socialFundNotAllocatedToLoans +
      externalFundNotAllocatedToLoans -
      summary.loanDisbursement +
      summary.insuranceFund -
      summary.miscellaneousExpense,
  );
  const difference = Number((cashAtHand - expectedCash).toFixed(2));
  return { expectedCash, cashAtHand, difference, balanced: Math.abs(difference) < 0.01 };
}

export async function closeMeeting(
  meetingId: number,
  executiveMemberId: number,
  cashAtHand?: number | null,
  backupCompleted?: boolean,
  backupCreatedAt?: string,
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

  if (!backupCompleted || !backupCreatedAt) {
    throw new Error(
      'A successful, verified database backup file is required before the meeting can be closed.',
    );
  }

  // The database layer independently verifies the on-device backup receipt.
  // A UI boolean or timestamp alone is not proof that a real backup exists.
  let backupReceipt: {
    meetingId?: number;
    createdAt?: string;
    filePath?: string;
    fileName?: string;
    fileSize?: number;
    verified?: boolean;
    verifiedAtClose?: string;
  };
  try {
    backupReceipt = JSON.parse(backupCreatedAt) as typeof backupReceipt;
  } catch {
    throw new Error(
      'The backup receipt is invalid. Create and verify a new backup before closing the meeting.',
    );
  }

  if (
    !backupReceipt ||
    backupReceipt.verified !== true ||
    Number(backupReceipt.meetingId) !== Number(meetingId) ||
    typeof backupReceipt.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(backupReceipt.createdAt)) ||
    typeof backupReceipt.verifiedAtClose !== 'string' ||
    !Number.isFinite(Date.parse(backupReceipt.verifiedAtClose)) ||
    typeof backupReceipt.filePath !== 'string' ||
    !backupReceipt.filePath.startsWith(FileSystem.documentDirectory || FileSystem.cacheDirectory || '\0') ||
    typeof backupReceipt.fileName !== 'string' ||
    !backupReceipt.fileName.startsWith('ebadsave_backup_') ||
    !backupReceipt.fileName.endsWith('.json') ||
    !Number.isFinite(backupReceipt.fileSize) ||
    Number(backupReceipt.fileSize) <= 0
  ) {
    throw new Error(
      'The backup receipt does not match this meeting or a valid backup file. Create a new verified backup before closing.',
    );
  }

  const backupInfo = await FileSystem.getInfoAsync(backupReceipt.filePath);
  if (
    !backupInfo.exists ||
    !('size' in backupInfo) ||
    Number(backupInfo.size) <= 0 ||
    Number(backupInfo.size) !== Number(backupReceipt.fileSize)
  ) {
    throw new Error(
      'The verified backup file is missing or has changed. Create a new backup before closing the meeting.',
    );
  }

  let savedBackup: {
    version?: number;
    created_at?: string;
    tables?: Record<string, unknown>;
  };
  try {
    const backupContents = await FileSystem.readAsStringAsync(backupReceipt.filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    savedBackup = JSON.parse(backupContents) as typeof savedBackup;
  } catch {
    throw new Error(
      'The saved backup cannot be read or is not valid JSON. Create a new backup before closing the meeting.',
    );
  }

  const backedUpMeetings = savedBackup.tables?.group_meetings;
  if (
    savedBackup.version !== 1 ||
    typeof savedBackup.created_at !== 'string' ||
    !Number.isFinite(Date.parse(savedBackup.created_at)) ||
    !Array.isArray(backedUpMeetings) ||
    !backedUpMeetings.some((row: any) =>
      Number(row?.id) === Number(meetingId) && row?.status === 'open'
    )
  ) {
    throw new Error(
      'The saved backup does not contain this meeting in its open state. Create a new verified backup before closing.',
    );
  }

  const cashAmount = Number(cashAtHand);

  if (!Number.isFinite(cashAmount) || cashAmount < 0) {
    throw new Error('Cash in box must be entered and must be zero or greater.');
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
   * Loan Fund closing calculation:
   * previous Loan Fund balance + savings + paid fines + all other
   * Loan Fund collections - loan disbursements.
   * Insurance remains a separate fund and is not added to Loan Fund.
   */
  await applyAutomaticMeetingActivityFines(
    meeting.group_id,
    meetingId,
  );

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
      todaySummary.loanFundCollections -
      todaySummary.loanDisbursement,
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
  const reconciliation = await getMeetingCashReconciliation(
    meetingId,
    cashAmount,
  );

  if (!reconciliation.balanced) {
    throw new Error(
      `Cash does not balance. Expected UGX ${reconciliation.expectedCash.toLocaleString()}, but cash in box is UGX ${reconciliation.cashAtHand.toLocaleString()}. Difference: UGX ${Math.abs(reconciliation.difference).toLocaleString()}.`,
    );
  }

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
      reconciliation_note,
      backup_completed,
      backup_created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    meetingId,
    timestamp,
    lifetimeSummary.savings,
    closingLoanFund,
    lifetimeSummary.fundBalance,
    lifetimeSummary.insuranceFund,
    reconciliation?.cashAtHand ?? null,
    reconciliation?.expectedCash ?? null,
    reconciliation.balanced ? 1 : 0,
    'Cash at hand balances with the calculated closing cash.',
    1,
    backupCreatedAt,
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

  // Closing the first digital meeting permanently locks existing-group onboarding.
  if (Number(meeting.meeting_number) === 1) {
    await db.runAsync(
      `UPDATE groups
       SET onboarding_locked = 1,
           onboarding_locked_at = COALESCE(onboarding_locked_at, ?)
       WHERE id = ?`,
      timestamp,
      meeting.group_id,
    );
  }

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
 * Insurance benefit availability for individual member/next-of-kin benefits.
 * Slots 1 and 2 permanently lock after payout; Slot 3 remains reusable.
 * Slot 4 is a group-to-group disbursement and is not a member benefit slot.
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
    memberBenefitOpen: false,
    slots,
  };
}

/* ============================================================
   SUPERVISOR REPORTS — READ ONLY
   ============================================================

   These functions read the local SQLite data. A secure cross-phone
   Supervisor link will be added through a backend/hosting layer later.
*/

export type SupervisorDetailedMemberReport = {
  member_id: number;
  member_number: string;
  full_name: string;
  gender: string;
  age: number;
  phone: string | null;
  cell: string;
  district: string;
  role: string;
  assigned_roles: string;
  attendance_present: number;
  attendance_late: number;
  attendance_absent: number;
  total_savings: number;
  loan_balance: number;
  loan_due_date: string | null;
  insurance_contributions: number;
  fines_assessed: number;
  fines_paid: number;
  fines_outstanding: number;
};

export type SupervisorAggregatedReport = {
  group: GroupRecord;
  rules: VSLASetupRuleRecord | null;
  member_count: number;
  active_member_count: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  total_savings: number;
  total_loan_fund: number;
  total_loan_repayment: number;
  total_loan_balance: number;
  total_insurance_fund: number;
  total_fines_assessed: number;
  total_fines_paid: number;
  total_fines_outstanding: number;
  detailed_members: SupervisorDetailedMemberReport[];
  generated_at: string;
};

export async function getSupervisorDetailedReport(
  groupId: number,
): Promise<SupervisorDetailedMemberReport[]> {
  const db = await getDatabase();
  const members = await db.getAllAsync<{
    id: number; member_number: string; full_name: string; gender: string;
    age: number; phone: string | null; cell: string; district: string;
    role: string; assigned_roles: string;
  }>(
    `SELECT id, member_number, full_name, gender, age, phone, cell, district, role, assigned_roles
     FROM members WHERE group_id = ? AND status = 'active' ORDER BY member_number ASC`,
    groupId,
  );

  const report: SupervisorDetailedMemberReport[] = [];
  for (const member of members) {
    const attendance = await db.getFirstAsync<{ present: number; late: number; absent: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN attendance_status = 'present' THEN 1 ELSE 0 END), 0) AS present,
         COALESCE(SUM(CASE WHEN attendance_status = 'late' THEN 1 ELSE 0 END), 0) AS late,
         COALESCE(SUM(CASE WHEN attendance_status = 'absent' THEN 1 ELSE 0 END), 0) AS absent
       FROM meeting_attendance WHERE group_id = ? AND member_id = ?`,
      groupId, member.id,
    );
    const savings = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND account_type = 'savings'
       AND transaction_type = 'savings_contribution' AND reversed = 0`,
      groupId, member.id,
    );
    const loan = await getMemberLoanBalance(groupId, member.id);
    const insurance = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM financial_transactions
       WHERE group_id = ? AND member_id = ? AND account_type = 'insurance_fund'
       AND transaction_type = 'insurance_contribution' AND reversed = 0`,
      groupId, member.id,
    );
    const fines = await getMemberFines(groupId, member.id);
    const statement = await db.getFirstAsync<{ individual_loan_due_date: string | null }>(
      `SELECT individual_loan_due_date FROM member_statement_records
       WHERE member_id = ? ORDER BY id DESC LIMIT 1`,
      member.id,
    );

    report.push({
      member_id: member.id,
      member_number: member.member_number,
      full_name: member.full_name,
      gender: member.gender,
      age: member.age,
      phone: member.phone,
      cell: member.cell,
      district: member.district,
      role: member.role,
      assigned_roles: member.assigned_roles,
      attendance_present: Number(attendance?.present ?? 0),
      attendance_late: Number(attendance?.late ?? 0),
      attendance_absent: Number(attendance?.absent ?? 0),
      total_savings: Number(savings?.total ?? 0),
      loan_balance: Number(loan.balance ?? 0),
      loan_due_date: statement?.individual_loan_due_date ?? null,
      insurance_contributions: Number(insurance?.total ?? 0),
      fines_assessed: fines.reduce((sum, fine) => sum + fine.original_amount, 0),
      fines_paid: fines.reduce((sum, fine) => sum + fine.amount_paid, 0),
      fines_outstanding: fines.reduce((sum, fine) => sum + fine.outstanding_amount, 0),
    });
  }
  return report;
}

export async function getSupervisorAggregatedReport(
  groupId: number,
): Promise<SupervisorAggregatedReport> {
  const group = await getGroupById(groupId);
  if (!group) throw new Error('Group not found.');

  const db = await getDatabase();
  const rules = await getVSLASetupRules(groupId);
  const detailed = await getSupervisorDetailedReport(groupId);
  const summary = await getFinancialSummary(groupId);
  const attendance = await db.getFirstAsync<{ present: number; late: number; absent: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN attendance_status = 'present' THEN 1 ELSE 0 END), 0) AS present,
       COALESCE(SUM(CASE WHEN attendance_status = 'late' THEN 1 ELSE 0 END), 0) AS late,
       COALESCE(SUM(CASE WHEN attendance_status = 'absent' THEN 1 ELSE 0 END), 0) AS absent
     FROM meeting_attendance WHERE group_id = ?`,
    groupId,
  );
  const memberCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM members WHERE group_id = ?`, groupId,
  );

  return {
    group,
    rules,
    member_count: Number(memberCount?.count ?? 0),
    active_member_count: detailed.length,
    present_count: Number(attendance?.present ?? 0),
    late_count: Number(attendance?.late ?? 0),
    absent_count: Number(attendance?.absent ?? 0),
    total_savings: detailed.reduce((sum, m) => sum + m.total_savings, 0),
    total_loan_fund: summary.loanFund,
    total_loan_repayment: summary.loanRepayment,
    total_loan_balance: detailed.reduce((sum, m) => sum + m.loan_balance, 0),
    total_insurance_fund: summary.insuranceFund,
    total_fines_assessed: detailed.reduce((sum, m) => sum + m.fines_assessed, 0),
    total_fines_paid: detailed.reduce((sum, m) => sum + m.fines_paid, 0),
    total_fines_outstanding: detailed.reduce((sum, m) => sum + m.fines_outstanding, 0),
    detailed_members: detailed,
    generated_at: now(),
  };
}

/* ============================================================
   MEMBER PASSCODE ACTIVATION AND PRE-APP AUTHORIZATION
   ============================================================ */

export type MemberPasscodeVerificationResult =
  | {
      success: true;
      memberId: number;
      groupId: number;
      memberRole: 'executive' | 'ordinary';
    }
  | {
      success: false;
      reason:
        | 'invalid_passcode'
        | 'member_not_found'
        | 'member_inactive'
        | 'wrong_group'
        | 'phone_required'
        | 'not_activated'
        | 'locked'
        | 'incorrect_passcode';
    };

export type AppAccessProgress = {
  sessionId: number;
  groupId: number;
  executiveCount: number;
  ordinaryCount: number;
  totalCount: number;
  authorized: boolean;
};

const APP_AUTH_MAX_FAILED_ATTEMPTS = 5;
const APP_AUTH_LOCK_MINUTES = 15;

function normalizeUgandanPhoneNumber(
  phone: string | null | undefined,
): string | null {
  const raw = normalizeText(phone);
  if (!raw) return null;

  const compact = raw.replace(/[\s()-]/g, '');

  // Accept local Ugandan mobile format, e.g. 0772123456.
  if (/^0[0-9]{9}$/.test(compact)) {
    return `+256${compact.slice(1)}`;
  }

  // Accept international format, e.g. +256772123456.
  if (/^\+256[0-9]{9}$/.test(compact)) {
    return compact;
  }

  // Also accept the country code without a leading plus.
  if (/^256[0-9]{9}$/.test(compact)) {
    return `+${compact}`;
  }

  return null;
}

function isMemberExecutive(member: {
  role: string | null;
  is_super_user: number | null;
  assigned_roles: string | null;
}): boolean {
  if (Number(member.is_super_user ?? 0) === 1) return true;

  const role = normalizeText(member.role).toLowerCase();
  if (role === 'executive' || role === 'admin') return true;

  return (member.assigned_roles ?? '')
    .split(',')
    .some((rawRole) => {
      const canonical = canonicalExecutivePost(rawRole);
      return Boolean(
        canonical &&
        EXECUTIVE_POSTS.includes(
          canonical as (typeof EXECUTIVE_POSTS)[number],
        ),
      );
    });
}

/**
 * Assigns or replaces a member's personal four-character passcode.
 *
 * Members without phone numbers may still have a passcode credential,
 * but phone_eligible remains 0 and they cannot authorize app access.
 * Phone numbers are normalized locally; ownership verification is
 * intentionally not performed, per the agreed product requirement.
 */
export async function setMemberPasscode(
  memberId: number,
  passcode: string,
): Promise<{ memberId: number; phoneEligible: boolean }> {
  if (!isValidPasscode(passcode)) {
    throw new Error(
      'Passcode must be exactly four permitted characters.',
    );
  }

  const db = await getDatabase();
  const member = await db.getFirstAsync<{
    id: number;
    phone: string | null;
    status: string;
  }>(
    `SELECT id, phone, status
     FROM members
     WHERE id = ?
     LIMIT 1`,
    memberId,
  );

  if (!member) throw new Error('Member not found.');
  if (member.status !== 'active') {
    throw new Error('Only an active member can set a passcode.');
  }

  const rawPhone = normalizeText(member.phone);
  const normalizedPhone = normalizeUgandanPhoneNumber(rawPhone);

  if (rawPhone && !normalizedPhone) {
    throw new Error(
      'Enter a valid Ugandan phone number, such as 0772123456 or +256772123456.',
    );
  }

  if (normalizedPhone && normalizedPhone !== member.phone) {
    await db.runAsync(
      `UPDATE members SET phone = ? WHERE id = ?`,
      normalizedPhone,
      memberId,
    );
  }

  const randomBytes = await Crypto.getRandomBytesAsync(16);
  const salt = Array.from(randomBytes as Uint8Array)
    .map((byte: number) => byte.toString(16).padStart(2, '0'))
    .join('');
  const passcodeHash = await hashPasscode(passcode, salt);
  const timestamp = now();
  const phoneEligible = normalizedPhone !== null ? 1 : 0;

  await db.runAsync(
    `INSERT INTO member_credentials (
       member_id, salt, passcode_hash, phone_eligible,
       failed_attempts, locked_until, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, 0, NULL, ?, ?)
     ON CONFLICT(member_id) DO UPDATE SET
       salt = excluded.salt,
       passcode_hash = excluded.passcode_hash,
       phone_eligible = excluded.phone_eligible,
       failed_attempts = 0,
       locked_until = NULL,
       updated_at = excluded.updated_at`,
    memberId,
    salt,
    passcodeHash,
    phoneEligible,
    timestamp,
    timestamp,
  );

  return {
    memberId,
    phoneEligible: phoneEligible === 1,
  };
}

/**
 * Verifies a passcode for a member of the requested group.
 * Five failed attempts cause a 15-minute lockout.
 */
export async function verifyMemberPasscode(
  memberId: number,
  groupId: number,
  passcode: string,
  options: { requirePhone?: boolean } = {},
): Promise<MemberPasscodeVerificationResult> {
  if (!isValidPasscode(passcode)) {
    return { success: false, reason: 'invalid_passcode' };
  }

  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    member_id: number;
    group_id: number;
    member_status: string;
    phone: string | null;
    role: string | null;
    is_super_user: number | null;
    assigned_roles: string | null;
    salt: string | null;
    passcode_hash: string | null;
    phone_eligible: number | null;
    failed_attempts: number | null;
    locked_until: string | null;
  }>(
    `SELECT
       m.id AS member_id,
       m.group_id,
       m.status AS member_status,
       m.phone,
       m.role,
       m.is_super_user,
       m.assigned_roles,
       c.salt,
       c.passcode_hash,
       c.phone_eligible,
       c.failed_attempts,
       c.locked_until
     FROM members m
     LEFT JOIN member_credentials c ON c.member_id = m.id
     WHERE m.id = ?
     LIMIT 1`,
    memberId,
  );

  if (!row) return { success: false, reason: 'member_not_found' };

  if (Number(row.group_id) !== Number(groupId)) {
    return { success: false, reason: 'wrong_group' };
  }

  if (row.member_status !== 'active') {
    return { success: false, reason: 'member_inactive' };
  }

  if (options.requirePhone !== false) {
    const normalizedPhone = normalizeUgandanPhoneNumber(row.phone);
    if (!normalizedPhone || Number(row.phone_eligible ?? 0) !== 1) {
      return { success: false, reason: 'phone_required' };
    }
  }

  if (!row.salt || !row.passcode_hash) {
    return { success: false, reason: 'not_activated' };
  }

  if (row.locked_until) {
    const lockTime = new Date(row.locked_until).getTime();
    if (Number.isFinite(lockTime) && lockTime > Date.now()) {
      return { success: false, reason: 'locked' };
    }
  }

  const timestamp = now();
  const expectedHash = await hashPasscode(passcode, row.salt);

  if (expectedHash !== row.passcode_hash) {
    const failedAttempts = Number(row.failed_attempts ?? 0) + 1;
    const lockUntil =
      failedAttempts >= APP_AUTH_MAX_FAILED_ATTEMPTS
        ? new Date(
            Date.now() + APP_AUTH_LOCK_MINUTES * 60 * 1000,
          ).toISOString()
        : null;

    await db.runAsync(
      `UPDATE member_credentials
       SET failed_attempts = ?, locked_until = ?, updated_at = ?
       WHERE member_id = ?`,
      failedAttempts,
      lockUntil,
      timestamp,
      memberId,
    );

    await db.runAsync(
      `INSERT INTO member_auth_attempts (member_id, success, attempted_at)
       VALUES (?, 0, ?)`,
      memberId,
      timestamp,
    );

    return { success: false, reason: 'incorrect_passcode' };
  }

  await db.runAsync(
    `UPDATE member_credentials
     SET failed_attempts = 0, locked_until = NULL, updated_at = ?
     WHERE member_id = ?`,
    timestamp,
    memberId,
  );

  await db.runAsync(
    `INSERT INTO member_auth_attempts (member_id, success, attempted_at)
     VALUES (?, 1, ?)`,
    memberId,
    timestamp,
  );

  return {
    success: true,
    memberId,
    groupId: Number(row.group_id),
    memberRole: isMemberExecutive(row) ? 'executive' : 'ordinary',
  };
}

/**
 * Starts a fresh app-opening authorization session. Old open sessions for
 * the same group are closed, so a previous opening cannot be reused.
 */
export async function createAppAccessSession(
  groupId: number,
): Promise<number> {
  const db = await getDatabase();
  const group = await db.getFirstAsync<{ id: number; status: string }>(
    `SELECT id, status FROM groups WHERE id = ? LIMIT 1`,
    groupId,
  );

  if (!group || group.status !== 'active') {
    throw new Error('Select a registered active group.');
  }

  const timestamp = now();
  await db.runAsync(
    `UPDATE app_access_sessions
     SET status = 'closed', closed_at = ?
     WHERE group_id = ? AND status = 'open'`,
    timestamp,
    groupId,
  );

  const result = await db.runAsync(
    `INSERT INTO app_access_sessions (
       group_id, meeting_id, opened_at, closed_at, status
     )
     VALUES (?, NULL, ?, NULL, 'open')`,
    groupId,
    timestamp,
  );

  return Number(result.lastInsertRowId);
}

/**
 * Verifies a member's passcode and records their authorization only if
 * the member is eligible, belongs to the session's group, is distinct,
 * and fills one of the required roles. Required: two executives and one
 * ordinary member.
 */
export async function authorizeMemberForAppAccess(
  sessionId: number,
  memberId: number,
  passcode: string,
): Promise<AppAccessProgress> {
  const db = await getDatabase();
  const session = await db.getFirstAsync<{
    id: number;
    group_id: number;
    status: string;
  }>(
    `SELECT id, group_id, status
     FROM app_access_sessions
     WHERE id = ?
     LIMIT 1`,
    sessionId,
  );

  if (!session || session.status !== 'open') {
    throw new Error('App authorization session is not open.');
  }

  const alreadyAuthorized = await db.getFirstAsync<{ id: number }>(
    `SELECT id
     FROM app_access_authorizers
     WHERE session_id = ? AND member_id = ?
     LIMIT 1`,
    sessionId,
    memberId,
  );

  if (alreadyAuthorized) {
    throw new Error('This member has already authorized this opening.');
  }

  const verification = await verifyMemberPasscode(
    memberId,
    Number(session.group_id),
    passcode,
  );

  if (verification.success === false) {
    const messages: Record<
      Exclude<MemberPasscodeVerificationResult, { success: true }>['reason'],
      string
    > = {
      invalid_passcode: 'Enter a valid four-character passcode.',
      member_not_found: 'Member not found.',
      member_inactive: 'Only active members can authorize the app.',
      wrong_group: 'This member belongs to a different group.',
      phone_required: 'A registered phone number is required for authorization.',
      not_activated: 'This member has not activated a passcode.',
      locked: 'Too many failed attempts. Try again after the lockout period.',
      incorrect_passcode: 'Incorrect passcode.',
    };
    throw new Error(messages[verification.reason]);
  }

  const authorizers = await db.getAllAsync<{
    member_id: number;
    authorizer_role: string;
  }>(
    `SELECT member_id, authorizer_role
     FROM app_access_authorizers
     WHERE session_id = ?`,
    sessionId,
  );

  const executiveCount = authorizers.filter(
    (item) => item.authorizer_role === 'executive',
  ).length;
  const ordinaryCount = authorizers.filter(
    (item) => item.authorizer_role === 'ordinary',
  ).length;

  if (verification.memberRole === 'executive' && executiveCount >= 2) {
    throw new Error('Two executive members have already authorized this opening.');
  }

  if (verification.memberRole === 'ordinary' && ordinaryCount >= 1) {
    throw new Error('An ordinary member has already authorized this opening.');
  }

  const timestamp = now();
  await db.runAsync(
    `INSERT INTO app_access_authorizers (
       session_id, member_id, authorizer_role, authorized_at
     )
     VALUES (?, ?, ?, ?)`,
    sessionId,
    memberId,
    verification.memberRole,
    timestamp,
  );

  return getAppAccessProgress(sessionId);
}

export async function getAppAccessProgress(
  sessionId: number,
): Promise<AppAccessProgress> {
  const db = await getDatabase();
  const session = await db.getFirstAsync<{
    id: number;
    group_id: number;
    status: string;
  }>(
    `SELECT id, group_id, status
     FROM app_access_sessions
     WHERE id = ?
     LIMIT 1`,
    sessionId,
  );

  if (!session) throw new Error('App authorization session not found.');

  const counts = await db.getFirstAsync<{
    executive_count: number;
    ordinary_count: number;
    total_count: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN authorizer_role = 'executive' THEN 1 ELSE 0 END), 0) AS executive_count,
       COALESCE(SUM(CASE WHEN authorizer_role = 'ordinary' THEN 1 ELSE 0 END), 0) AS ordinary_count,
       COUNT(*) AS total_count
     FROM app_access_authorizers
     WHERE session_id = ?`,
    sessionId,
  );

  const executiveCount = Number(counts?.executive_count ?? 0);
  const ordinaryCount = Number(counts?.ordinary_count ?? 0);
  const totalCount = Number(counts?.total_count ?? 0);

  return {
    sessionId,
    groupId: Number(session.group_id),
    executiveCount,
    ordinaryCount,
    totalCount,
    authorized:
      session.status === 'open' &&
      executiveCount === 2 &&
      ordinaryCount === 1 &&
      totalCount === 3,
  };
}

export async function closeAppAccessSession(
  sessionId: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE app_access_sessions
     SET status = 'closed', closed_at = ?
     WHERE id = ? AND status = 'open'`,
    now(),
    sessionId,
  );
}
