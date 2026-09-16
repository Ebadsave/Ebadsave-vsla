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

const dbPromise = SQLite.openDatabaseAsync('ebadsave_vsla.db');

const GROUP_START = 2010;
const GROUP_END = 9090;
const GROUP_DORMANCY_DAYS = 90;

const now = (): string => new Date().toISOString();

const normalizeText = (
  value: string | null | undefined,
): string => (value ?? '').trim();

/*
 * Member passcode:
 * exactly 4 characters
 * A-Z, a-z, 0-9 only
 */
const isValidPasscode = (code: string): boolean =>
  /^[A-Za-z0-9]{4}$/.test(code);

/*
 * Group registration signature:
 * exactly 4 characters
 * A-Z, a-z, 0-9 only
 */
const isValidRegistrationSignature = (code: string): boolean =>
  /^[A-Za-z0-9]{4}$/.test(code);

async function hashPasscode(
  passcode: string,
  salt: string,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${passcode}`,
  );
}

function parseGroupNumber(
  value: number | string | null | undefined,
): number {
  if (typeof value === 'number') {
    return value;
  }

  const text = normalizeText(value);

  const match = text.match(/KYA\s*(\d{4})/i);

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
      END AS INTEGER
    ) AS group_number,
    group_name,
    district,
    country,
    status,
    created_at,
    last_activity_at
  FROM groups
`;

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

/*
 * Insurance is intentionally NOT included in fundBalance.
 */
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

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await dbPromise;

  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_number TEXT NOT NULL UNIQUE,
      group_name TEXT NOT NULL,
      district TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      registration_agreed INTEGER NOT NULL DEFAULT 0,
      registration_signature_hash TEXT,
      registration_signature_salt TEXT,
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
      meeting_id INTEGER NOT NULL UNIQUE,
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

    CREATE INDEX IF NOT EXISTS idx_financial_accounts_group
      ON financial_accounts(group_id);

    CREATE INDEX IF NOT EXISTS idx_financial_transactions_group
      ON financial_transactions(group_id);

    CREATE INDEX IF NOT EXISTS idx_members_group
      ON members(group_id);

    CREATE INDEX IF NOT EXISTS idx_kin_member
      ON member_next_of_kin(member_id);
  `);

  /*
   * Compatibility migrations for databases created by older versions.
   */
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

  await addColumnIfMissing(
    db,
    'groups',
    'registration_agreed',
    'INTEGER NOT NULL DEFAULT 0',
  );

  await addColumnIfMissing(
    db,
    'groups',
    'registration_signature_hash',
    'TEXT',
  );

  await addColumnIfMissing(
    db,
    'groups',
    'registration_signature_salt',
    'TEXT',
  );

  await ensureFinancialAccountsForAllGroups(db);

  await refreshGroupDormancy(db);

  await applyDueNextOfKinChanges(db);

  await applyDueNextOfKinBenefits(db);

  return db;
}

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(
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

async function ensureFinancialAccountsForGroup(
  db: SQLite.SQLiteDatabase,
  groupId: number,
): Promise<void> {
  const timestamp = now();

  for (const accountType of FINANCIAL_ACCOUNT_TYPES) {
    await db.runAsync(
      `
      INSERT OR IGNORE INTO financial_accounts
      (
        group_id,
        account_type,
        balance,
        created_at,
        updated_at
      )
      VALUES (?, ?, 0, ?, ?)
      `,
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
  const groups = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM groups`,
  );

  for (const group of groups) {
    await ensureFinancialAccountsForGroup(
      db,
      group.id,
    );
  }
}

export async function initializeDatabase(): Promise<void> {
  await getDatabase();
}

export async function initDatabase(): Promise<void> {
  await initializeDatabase();
}

async function refreshGroupDormancy(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const cutoff = new Date();

  cutoff.setDate(
    cutoff.getDate() - GROUP_DORMANCY_DAYS,
  );

  await db.runAsync(
    `
    UPDATE groups
    SET status = 'dormant'
    WHERE status = 'active'
      AND last_activity_at < ?
    `,
    cutoff.toISOString(),
  );
}

export async function getAllGroups(): Promise<GroupRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<GroupRecord>(
    `
    ${GROUP_SELECT}
    ORDER BY
      CASE
        WHEN status = 'active' THEN 0
        ELSE 1
      END,
      group_number ASC,
      id ASC
    `,
  );
}

export async function getActiveGroup(): Promise<GroupRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<GroupRecord>(
    `
    ${GROUP_SELECT}
    WHERE status = 'active'
    ORDER BY id ASC
    LIMIT 1
    `,
  );
}

/*
 * Group numbering rules:
 *
 * 1. Numbers are allocated sequentially upward.
 * 2. Active group numbers cannot be reused.
 * 3. Dormant groups become eligible for reuse only after 90 days.
 * 4. If a new unused number is available, it is preferred.
 * 5. Only when the full range has been used does the system
 *    recycle the oldest eligible dormant number.
 */
async function findNextAvailableGroupNumber(
  db: SQLite.SQLiteDatabase,
): Promise<number> {
  await refreshGroupDormancy(db);

  const groups = await db.getAllAsync<{
    group_number: string | number;
    status: string;
  }>(
    `
    SELECT group_number, status
    FROM groups
    `,
  );

  const usedNumbers = new Set<number>();

  const activeNumbers = new Set<number>();

  const dormantNumbers: Array<{
    number: number;
    lastActivity: string;
  }> = [];

  for (const group of groups) {
    const number = parseGroupNumber(
      group.group_number,
    );

    if (
      number < GROUP_START ||
      number > GROUP_END
    ) {
      continue;
    }

    usedNumbers.add(number);

    if (group.status === 'active') {
      activeNumbers.add(number);
    }
  }

  /*
   * Continue sequentially from the highest number already assigned.
   * This avoids jumping backward while unused numbers remain.
   */
  let highestUsed = GROUP_START - 1;

  for (const number of usedNumbers) {
    if (number > highestUsed) {
      highestUsed = number;
    }
  }

  if (highestUsed < GROUP_END) {
    const nextNumber = highestUsed + 1;

    if (!activeNumbers.has(nextNumber)) {
      return nextNumber;
    }
  }

  /*
   * If the full sequence has reached GROUP_END,
   * recycle only a dormant number that has been dormant
   * for at least 90 days.
   */
  const cutoff = new Date();

  cutoff.setDate(
    cutoff.getDate() - GROUP_DORMANCY_DAYS,
  );

  for (const group of groups) {
    const number = parseGroupNumber(
      group.group_number,
    );

    if (
      number < GROUP_START ||
      number > GROUP_END
    ) {
      continue;
    }

    if (group.status !== 'dormant') {
      continue;
    }

    /*
     * Read last activity through a second query below.
     */
    const dormantGroup =
      await db.getFirstAsync<{
        last_activity_at: string;
      }>(
        `
        SELECT last_activity_at
        FROM groups
        WHERE group_number = ?
        LIMIT 1
        `,
        String(number),
      );

    if (
      dormantGroup &&
      new Date(dormantGroup.last_activity_at).getTime()
        <= cutoff.getTime()
    ) {
      dormantNumbers.push({
        number,
        lastActivity:
          dormantGroup.last_activity_at,
      });
    }
  }

  if (dormantNumbers.length > 0) {
    dormantNumbers.sort(
      (a, b) =>
        new Date(a.lastActivity).getTime() -
        new Date(b.lastActivity).getTime(),
    );

    return dormantNumbers[0].number;
  }

  throw new Error(
    'No group number is currently available.',
  );
}

export async function createGroup(
  groupName: string,
  district: string,
  country: string,
  registrationAgreed = false,
  registrationSignature = '',
): Promise<number> {
  const db = await getDatabase();

  const cleanName = normalizeText(groupName);
  const cleanDistrict = normalizeText(district);
  const cleanCountry = normalizeText(country);
  const cleanSignature =
    normalizeText(registrationSignature);

  if (!cleanName) {
    throw new Error('Group name is required.');
  }

  if (!cleanDistrict) {
    throw new Error('District is required.');
  }

  if (!cleanCountry) {
    throw new Error('Country is required.');
  }

  if (!registrationAgreed) {
    throw new Error(
      'You must agree to the constitution before registering the group.',
    );
  }

  if (
    !isValidRegistrationSignature(
      cleanSignature,
    )
  ) {
    throw new Error(
      'Registration signature must contain exactly 4 letters or numbers.',
    );
  }

  const groupNumber =
    await findNextAvailableGroupNumber(db);

  const timestamp = now();

  const salt = Crypto.randomUUID();

  const signatureHash =
    await hashPasscode(
      cleanSignature,
      salt,
    );

  let groupId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `
      INSERT INTO groups
      (
        group_number,
        group_name,
        district,
        country,
        status,
        registration_agreed,
        registration_signature_hash,
        registration_signature_salt,
        created_at,
        last_activity_at
      )
      VALUES (?, ?, ?, ?, 'active', 1, ?, ?, ?, ?)
      `,
      groupNumber,
      cleanName,
      cleanDistrict,
      cleanCountry,
      signatureHash,
      salt,
      timestamp,
      timestamp,
    );

    groupId = result.lastInsertRowId;

    await ensureFinancialAccountsForGroup(
      db,
      groupId,
    );

    await insertDefaultConstitution(
      db,
      groupId,
    );
  });

  return groupId;
}

export async function registerGroup(
  input: {
    groupName: string;
    district: string;
    country: string;
    registrationAgreed: boolean;
    registrationSignature: string;
  },
): Promise<GroupRecord> {
  const groupId = await createGroup(
    input.groupName,
    input.district,
    input.country,
    input.registrationAgreed,
    input.registrationSignature,
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

export async function recordGroupActivity(
  groupId: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
    UPDATE groups
    SET status = 'active',
        last_activity_at = ?
    WHERE id = ?
    `,
    now(),
    groupId,
  );
}

export async function getGroupById(
  groupId: number,
): Promise<GroupRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<GroupRecord>(
    `
    ${GROUP_SELECT}
    WHERE id = ?
    LIMIT 1
    `,
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

  const cleanName = normalizeText(groupName);
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

  await db.withTransactionAsync(async () => {
    /*
     * group_number is deliberately NOT changed.
     */
    await db.runAsync(
      `
      UPDATE groups
      SET group_name = ?,
          district = ?,
          country = ?,
          last_activity_at = ?
      WHERE id = ?
      `,
      cleanName,
      cleanDistrict,
      cleanCountry,
      timestamp,
      groupId,
    );

    /*
     * Only Article 1 is changed.
     * Articles 2–12 remain untouched.
     */
    await db.runAsync(
      `
      UPDATE group_rules
      SET content = ?,
          updated_at = ?
      WHERE group_id = ?
        AND article_number = 1
      `,
      `This group shall operate as ${cleanName}.`,
      timestamp,
      groupId,
    );
  });

  const updatedGroup =
    await getGroupById(groupId);

  if (!updatedGroup) {
    throw new Error(
      'Group was updated but could not be loaded.',
    );
  }

  return updatedGroup;
}

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
      'This group shall operate as Ebadsave VSLA.',
    ],
    [
      2,
      'Membership',
      'Membership shall be open to eligible persons.',
    ],
    [
      3,
      'Contributions',
      'Members shall make regular savings.',
    ],
    [
      4,
      'Loans',
      'Members may apply for loans.',
    ],
    [
      5,
      'Meetings and Attendance',
      'Members shall attend meetings.',
    ],
    [
      6,
      'Leadership',
      'The group shall have leadership.',
    ],
    [
      7,
      'Welfare, and Insurance Fund',
      'The group may maintain welfare and insurance funds.',
    ],
    [
      8,
      'Penalties and Fines',
      'Members who fail to follow rules may be fined.',
    ],
    [
      9,
      'Sharing and Dissolution',
      'Savings and profits shall be shared.',
    ],
    [
      10,
      'Amendments',
      'Constitution may be amended.',
    ],
    [
      11,
      'Executive expire period',
      'Executive shall serve for agreed period.',
    ],
    [
      12,
      'Interest percentage and period of loan',
      'Group shall determine loan interest.',
    ],
  ];

  const timestamp = now();

  for (const article of articles) {
    await db.runAsync(
      `
      INSERT OR IGNORE INTO group_rules
      (
        group_id,
        article_number,
        title,
        content,
        effective_days,
        updated_at
      )
      VALUES (?, ?, ?, ?, 30, ?)
      `,
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
    `
    SELECT *
    FROM group_rules
    WHERE group_id = ?
    ORDER BY article_number ASC
    `,
    groupId,
  );
}

export async function getMembersByGroupId(
  groupId: number,
): Promise<MemberRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<MemberRecord>(
    `
    SELECT
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
      status,
      created_at
    FROM members
    WHERE group_id = ?
      AND status = 'active'
    ORDER BY member_number ASC
    `,
    groupId,
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
      `
      SELECT member_number
      FROM members
      WHERE group_id = ?
      `,
      groupId,
    );

  const deleted =
    await db.getAllAsync<{
      member_number: string;
    }>(
      `
      SELECT member_number
      FROM deleted_member_numbers
      WHERE group_id = ?
      `,
      groupId,
    );

  const used = new Set<number>();

  for (const item of [
    ...members,
    ...deleted,
  ]) {
    const match =
      item.member_number.match(/(\d{3})$/);

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
  return `KYA${String(groupNumber).padStart(
    4,
    '0',
  )}${String(sequence).padStart(3, '0')}`;
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

  const name = normalizeText(fullName);

  if (!name) {
    throw new Error('Full name is required.');
  }

  if (!normalizeText(gender)) {
    throw new Error('Gender is required.');
  }

  if (!Number.isFinite(age) || age <= 0) {
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

  let memberId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `
      INSERT INTO members
      (
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
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'member', 'active', ?)
      `,
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

    memberId = result.lastInsertRowId;

    await db.runAsync(
      `
      INSERT INTO member_next_of_kin
      (
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
      (?, 2, NULL, NULL, NULL, 0, 0, ?, ?)
      `,
      memberId,
      timestamp,
      timestamp,
      memberId,
      timestamp,
      timestamp,
    );

    const salt = Crypto.randomUUID();

    await db.runAsync(
      `
      INSERT INTO member_credentials
      (
        member_id,
        salt,
        passcode_hash,
        phone_eligible,
        created_at,
        updated_at
      )
      VALUES (?, ?, NULL, ?, ?, ?)
      `,
      memberId,
      salt,
      normalizeText(phone) ? 1 : 0,
      timestamp,
      timestamp,
    );

    await db.runAsync(
      `
      UPDATE groups
      SET status = 'active',
          last_activity_at = ?
      WHERE id = ?
      `,
      timestamp,
      groupId,
    );
  });

  return memberId;
}

export async function getNextOfKin(
  memberId: number,
): Promise<NextOfKinRecord[]> {
  const db = await getDatabase();

  await applyDueNextOfKinChanges(db);

  await applyDueNextOfKinBenefits(db);

  return db.getAllAsync<NextOfKinRecord>(
    `
    SELECT *
    FROM member_next_of_kin
    WHERE member_id = ?
    ORDER BY slot ASC
    `,
    memberId,
  );
}

async function getKin(
  db: SQLite.SQLiteDatabase,
  memberId: number,
  slot: number,
): Promise<NextOfKinRecord | null> {
  return db.getFirstAsync<NextOfKinRecord>(
    `
    SELECT *
    FROM member_next_of_kin
    WHERE member_id = ?
      AND slot = ?
    LIMIT 1
    `,
    memberId,
    slot,
  );
}

function validateKinSlot(slot: number): void {
  if (slot !== 1 && slot !== 2) {
    throw new Error(
      'Next-of-kin slot must be 1 or 2.',
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
      `
      SELECT id
      FROM next_of_kin_change_history
      WHERE member_id = ?
        AND slot = ?
        AND applied = 0
      LIMIT 1
      `,
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
      `
      SELECT id
      FROM next_of_kin_benefits
      WHERE member_id = ?
        AND slot = ?
        AND status = 'pending'
      LIMIT 1
      `,
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
    throw new Error('A reason is required.');
  }

  await applyDueNextOfKinChanges(db);

  await applyDueNextOfKinBenefits(db);

  const kin =
    await getKin(
      db,
      memberId,
      slot,
    );

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
      'This slot is locked because benefits have been received.',
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

  const effectiveDate = new Date();

  effectiveDate.setDate(
    effectiveDate.getDate() +
      Math.max(0, effectiveDays),
  );

  const result = await db.runAsync(
    `
    INSERT INTO next_of_kin_change_history
    (
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
    VALUES
    (?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `,
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

async function applyDueNextOfKinChanges(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const pending =
    await db.getAllAsync<any>(
      `
      SELECT *
      FROM next_of_kin_change_history
      WHERE applied = 0
        AND effective_at <= ?
      ORDER BY id ASC
      `,
      now(),
    );

  for (const change of pending) {
    if (change.action === 'delete') {
      await db.runAsync(
        `
        UPDATE member_next_of_kin
        SET name = NULL,
            phone = NULL,
            gender = NULL,
            updated_at = ?
        WHERE member_id = ?
          AND slot = ?
        `,
        now(),
        change.member_id,
        change.slot,
      );
    } else {
      await db.runAsync(
        `
        UPDATE member_next_of_kin
        SET name = ?,
            phone = ?,
            gender = ?,
            updated_at = ?
        WHERE member_id = ?
          AND slot = ?
        `,
        change.new_name,
        change.new_phone,
        change.new_gender,
        now(),
        change.member_id,
        change.slot,
      );
    }

    await db.runAsync(
      `
      UPDATE next_of_kin_change_history
      SET applied = 1
      WHERE id = ?
      `,
      change.id,
    );
  }
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

  const kin =
    await getKin(
      db,
      memberId,
      slot,
    );

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
      'This slot has already received benefits and is locked.',
    );
  }

  await assertNoPendingKinBenefit(
    db,
    memberId,
    slot,
  );

  const effectiveDate = new Date();

  effectiveDate.setDate(
    effectiveDate.getDate() +
      Math.max(0, effectiveDays),
  );

  const result = await db.runAsync(
    `
    INSERT INTO next_of_kin_benefits
    (
      member_id,
      slot,
      benefit_amount,
      reason,
      benefit_date,
      effective_at,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `,
    memberId,
    slot,
    amount,
    normalizeText(reason),
    now(),
    effectiveDate.toISOString(),
  );

  return result.lastInsertRowId;
}

async function applyDueNextOfKinBenefits(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const pending =
    await db.getAllAsync<any>(
      `
      SELECT id, member_id, slot
      FROM next_of_kin_benefits
      WHERE status = 'pending'
        AND effective_at <= ?
      ORDER BY id ASC
      `,
      now(),
    );

  for (const benefit of pending) {
    await db.runAsync(
      `
      UPDATE next_of_kin_benefits
      SET status = 'received'
      WHERE id = ?
      `,
      benefit.id,
    );

    await db.runAsync(
      `
      UPDATE member_next_of_kin
      SET benefit_received = 1,
          locked = 1,
          updated_at = ?
      WHERE member_id = ?
        AND slot = ?
      `,
      now(),
      benefit.member_id,
      benefit.slot,
    );
  }
}

export async function getFinancialAccounts(
  groupId: number,
): Promise<FinancialAccountRecord[]> {
  const db = await getDatabase();

  await ensureFinancialAccountsForGroup(
    db,
    groupId,
  );

  return db.getAllAsync<FinancialAccountRecord>(
    `
    SELECT
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
      END
    `,
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
    `
    SELECT
      id,
      group_id,
      account_type,
      balance,
      created_at,
      updated_at
    FROM financial_accounts
    WHERE group_id = ?
      AND account_type = ?
    LIMIT 1
    `,
    groupId,
    accountType,
  );
}

export async function recordFinancialIncome(
  groupId: number,
  accountType: FinancialAccountType,
  amount: number,
  reason: string,
  memberId: number | null = null,
  meetingId: number | null = null,
  transactionType = 'income',
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
    throw new Error('A reason is required.');
  }

  let transactionId = 0;

  await db.withTransactionAsync(async () => {
    await ensureFinancialAccountsForGroup(
      db,
      groupId,
    );

    const timestamp = now();

    const result = await db.runAsync(
      `
      INSERT INTO financial_transactions
      (
        group_id,
        account_type,
        amount,
        reason,
        member_id,
        meeting_id,
        transaction_type,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      groupId,
      accountType,
      amount,
      normalizeText(reason),
      memberId,
      meetingId,
      normalizeText(transactionType),
      timestamp,
    );

    transactionId =
      result.lastInsertRowId;

    await db.runAsync(
      `
      UPDATE financial_accounts
      SET balance = balance + ?,
          updated_at = ?
      WHERE group_id = ?
        AND account_type = ?
      `,
      amount,
      timestamp,
      groupId,
      accountType,
    );

    await db.runAsync(
      `
      UPDATE groups
      SET status = 'active',
          last_activity_at = ?
      WHERE id = ?
      `,
      timestamp,
      groupId,
    );
  });

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
    throw new Error('A reason is required.');
  }

  let transactionId = 0;

  await db.withTransactionAsync(async () => {
    await ensureFinancialAccountsForGroup(
      db,
      groupId,
    );

    const account =
      await db.getFirstAsync<{
        balance: number;
      }>(
        `
        SELECT balance
        FROM financial_accounts
        WHERE group_id = ?
          AND account_type = ?
        LIMIT 1
        `,
        groupId,
        accountType,
      );

    if (!account) {
      throw new Error(
        'Financial account was not found.',
      );
    }

    if (account.balance < amount) {
      throw new Error(
        `Insufficient ${accountType} balance.`,
      );
    }

    const negativeAmount =
      -Math.abs(amount);

    const timestamp = now();

    const result = await db.runAsync(
      `
      INSERT INTO financial_transactions
      (
        group_id,
        account_type,
        amount,
        reason,
        member_id,
        meeting_id,
        transaction_type,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      groupId,
      accountType,
      negativeAmount,
      normalizeText(reason),
      memberId,
      meetingId,
      normalizeText(transactionType),
      timestamp,
    );

    transactionId =
      result.lastInsertRowId;

    await db.runAsync(
      `
      UPDATE financial_accounts
      SET balance = balance + ?,
          updated_at = ?
      WHERE group_id = ?
        AND account_type = ?
      `,
      negativeAmount,
     
