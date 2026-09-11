import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export type GroupRecord = {
  id: number;
  group_number: string;
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

const dbPromise = SQLite.openDatabaseAsync('ebadsave_vsla.db');

const now = (): string => new Date().toISOString();

const normalizeText = (value: string | null | undefined): string => {
  return (value ?? '').trim();
};

const isValidPasscode = (code: string): boolean => {
  return /^[A-Za-z0-9]{4}$/.test(code);
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

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await dbPromise;

  await db.execAsync(`
    PRAGMA foreign_keys = ON;

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

  await addColumnIfMissing(db, 'members', 'gender', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(db, 'members', 'age', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'members', 'cell', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing(
    db,
    'members',
    'district',
    "TEXT NOT NULL DEFAULT ''",
  );
  await addColumnIfMissing(db, 'members', 'photo_uri', 'TEXT');
  await addColumnIfMissing(
    db,
    'members',
    'role',
    "TEXT NOT NULL DEFAULT 'member'",
  );

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
    `PRAGMA table_info(${table})`,
  );

  const exists = columns.some((item) => item.name === column);

  if (!exists) {
    await db.execAsync(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`,
    );
  }
}

const GROUP_START = 2010;
const GROUP_END = 9090;

function groupNumberValue(groupNumber: string): number {
  const match = groupNumber.match(/KYA(\d{4})/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[1]);
}

function makeGroupNumber(number: number): string {
  return `KYA${number}`;
}

async function refreshGroupDormancy(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const cutoff = new Date();

  cutoff.setDate(cutoff.getDate() - 90);

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

export async function initDatabase(): Promise<void> {
  await getDatabase();
}

export async function getAllGroups(): Promise<GroupRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<GroupRecord>(
    `
      SELECT *
      FROM groups
      ORDER BY
        CASE WHEN status = 'active' THEN 0 ELSE 1 END,
        group_number
    `,
  );
}

export async function getActiveGroup(): Promise<GroupRecord | null> {
  const db = await getDatabase();

  return db.getFirstAsync<GroupRecord>(
    `
      SELECT *
      FROM groups
      WHERE status = 'active'
      ORDER BY id ASC
      LIMIT 1
    `,
  );
}

async function findNextAvailableGroupNumber(
  db: SQLite.SQLiteDatabase,
): Promise<string> {
  await refreshGroupDormancy(db);

  const groups = await db.getAllAsync<{
    group_number: string;
    status: string;
  }>(
    `
      SELECT group_number, status
      FROM groups
      WHERE status = 'active'
    `,
  );

  const activeNumbers = new Set(
    groups.map((group) => groupNumberValue(group.group_number)),
  );

  for (let number = GROUP_START; number <= GROUP_END; number += 1) {
    if (!activeNumbers.has(number)) {
      return makeGroupNumber(number);
    }
  }

  throw new Error('No group number is currently available.');
}

export async function createGroup(
  groupName: string,
  district: string,
  country: string,
): Promise<number> {
  const db = await getDatabase();

  const cleanName = normalizeText(groupName);
  const cleanDistrict = normalizeText(district);
  const cleanCountry = normalizeText(country);

  if (!cleanName) {
    throw new Error('Group name is required.');
  }

  if (!cleanDistrict) {
    throw new Error('District is required.');
  }

  if (!cleanCountry) {
    throw new Error('Country is required.');
  }

  const groupNumber = await findNextAvailableGroupNumber(db);
  const timestamp = now();

  const result = await db.runAsync(
    `
      INSERT INTO groups (
        group_number,
        group_name,
        district,
        country,
        status,
        created_at,
        last_activity_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `,
    groupNumber,
    cleanName,
    cleanDistrict,
    cleanCountry,
    timestamp,
    timestamp,
  );

  const groupId = result.lastInsertRowId;

  await insertDefaultConstitution(db, groupId);

  return groupId;
}

export async function recordGroupActivity(
  groupId: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE groups
      SET
        status = 'active',
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
      SELECT *
      FROM groups
      WHERE id = ?
      LIMIT 1
    `,
    groupId,
  );
}

async function insertDefaultConstitution(
  db: SQLite.SQLiteDatabase,
  groupId: number,
): Promise<void> {
  const articles: Array<[number, string, string]> = [
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
      `
        INSERT OR IGNORE INTO group_rules (
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
      ORDER BY member_number ASC
    `,
    groupId,
  );
}

async function getNextMemberSequence(
  db: SQLite.SQLiteDatabase,
  groupId: number,
): Promise<number> {
  const members = await db.getAllAsync<{
    member_number: string;
  }>(
    `
      SELECT member_number
      FROM members
      WHERE group_id = ?
    `,
    groupId,
  );

  const deleted = await db.getAllAsync<{
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

  for (const item of [...members, ...deleted]) {
    const match = item.member_number.match(/(\d{3})$/);

    if (match) {
      used.add(Number(match[1]));
    }
  }

  for (let number = 1; number <= 999; number += 1) {
    if (!used.has(number)) {
      return number;
    }
  }

  throw new Error('This group has reached the 999-member limit.');
}

function createMemberNumber(
  groupNumber: string,
  sequence: number,
): string {
  const numericGroup = groupNumber.replace(/^KYA/i, '');

  return `KYA${numericGroup}${String(sequence).padStart(3, '0')}`;
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

  const group = await getGroupById(groupId);

  if (!group) {
    throw new Error('Group not found.');
  }

  const sequence = await getNextMemberSequence(db, groupId);
  const memberNumber = createMemberNumber(
    group.group_number,
    sequence,
  );

  const timestamp = now();

  const result = await db.runAsync(
    `
      INSERT INTO members (
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

  const memberId = result.lastInsertRowId;

  await db.runAsync(
    `
      INSERT INTO member_next_of_kin (
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
      INSERT INTO member_credentials (
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

  const current = await db.getFirstAsync<MemberRecord>(
    `
      SELECT *
      FROM members
      WHERE id = ?
      LIMIT 1
    `,
    memberId,
  );

  if (!current) {
    throw new Error('Member not found.');
  }

  const fullName = data.fullName ?? current.full_name;
  const gender = data.gender ?? current.gender;
  const age = data.age ?? current.age;
  const phone = data.phone ?? current.phone ?? '';
  const cell = data.cell ?? current.cell;
  const district = data.district ?? current.district;
  const photoUri =
    data.photoUri === undefined
      ? current.photo_uri
      : data.photoUri;

  if (!normalizeText(fullName)) {
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

  await db.runAsync(
    `
      UPDATE members
      SET
        full_name = ?,
        gender = ?,
        age = ?,
        phone = ?,
        cell = ?,
        district = ?,
        photo_uri = ?
      WHERE id = ?
    `,
    normalizeText(fullName),
    normalizeText(gender),
    age,
    normalizeText(phone) || null,
    normalizeText(cell),
    normalizeText(district),
    photoUri,
    memberId,
  );

  const timestamp = now();

  await db.runAsync(
    `
      UPDATE member_credentials
      SET
        phone_eligible = ?,
        updated_at = ?
      WHERE member_id = ?
    `,
    normalizeText(phone) ? 1 : 0,
    timestamp,
    memberId,
  );
}

export async function deleteMember(
  memberId: number,
  reason: string,
): Promise<void> {
  const db = await getDatabase();

  const member = await db.getFirstAsync<MemberRecord>(
    `
      SELECT *
      FROM members
      WHERE id = ?
      LIMIT 1
    `,
    memberId,
  );

  if (!member) {
    throw new Error('Member not found.');
  }

  if (!normalizeText(reason)) {
    throw new Error('A reason is required when deleting a member.');
  }

  const timestamp = now();

  await db.runAsync(
    `
      UPDATE members
      SET status = 'deleted'
      WHERE id = ?
    `,
    memberId,
  );

  await db.runAsync(
    `
      INSERT INTO deleted_member_numbers (
        group_id,
        member_number,
        deleted_at
      )
      VALUES (?, ?, ?)
    `,
    member.group_id,
    member.member_number,
    timestamp,
  );

  await recordGroupActivity(member.group_id);
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
    throw new Error('Next-of-kin slot must be 1 or 2.');
  }
}

async function assertNoPendingKinChange(
  db: SQLite.SQLiteDatabase,
  memberId: number,
  slot: number,
): Promise<void> {
  const pending = await db.getFirstAsync<{ id: number }>(
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
  const pending = await db.getFirstAsync<{ id: number }>(
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
    throw new Error(
      'A reason is required for every next-of-kin change.',
    );
  }

  await applyDueNextOfKinChanges(db);
  await applyDueNextOfKinBenefits(db);

  const kin = await getKin(db, memberId, slot);

  if (!kin) {
    throw new Error('Next-of-kin slot not found.');
  }

  if (kin.locked === 1 || kin.benefit_received === 1) {
    throw new Error(
      'This next-of-kin slot is locked because benefits have been received.',
    );
  }

  await assertNoPendingKinChange(db, memberId, slot);
  await assertNoPendingKinBenefit(db, memberId, slot);

  const effectiveDate = new Date();

  effectiveDate.setDate(
    effectiveDate.getDate() + Math.max(0, effectiveDays),
  );

  const result = await db.runAsync(
    `
      INSERT INTO next_of_kin_change_history (
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
      VALUES (?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
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

  const kin = await getKin(db, memberId, slot);

  if (!kin) {
    throw new Error('Next-of-kin slot not found.');
  }

  if (kin.locked === 1 || kin.benefit_received === 1) {
    throw new Error(
      'This next-of-kin slot is locked because benefits have been received.',
    );
  }

  await assertNoPendingKinChange(db, memberId, slot);
  await assertNoPendingKinBenefit(db, memberId, slot);

  const effectiveDate = new Date();

  effectiveDate.setDate(
    effectiveDate.getDate() + Math.max(0, effectiveDays),
  );

  const result = await db.runAsync(
    `
      INSERT INTO next_of_kin_change_history (
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
      VALUES (?, ?, 'delete', ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, 0)
    `,
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

async function applyDueNextOfKinChanges(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const pending = await db.getAllAsync<{
    id: number;
    member_id: number;
    slot: number;
    action: string;
    new_name: string | null;
    new_phone: string | null;
    new_gender: string | null;
    effective_at: string;
  }>(
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
          SET
            name = NULL,
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
          SET
            name = ?,
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

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Benefit amount is invalid.');
  }

  if (!normalizeText(reason)) {
    throw new Error('A reason is required for a benefit.');
  }

  await applyDueNextOfKinChanges(db);
  await applyDueNextOfKinBenefits(db);

  const kin = await getKin(db, memberId, slot);

  if (!kin) {
    throw new Error('Next-of-kin slot not found.');
  }

  if (kin.locked === 1 || kin.benefit_received === 1) {
    throw new Error(
      'This next-of-kin slot has already received benefits and is locked.',
    );
  }

  await assertNoPendingKinBenefit(db, memberId, slot);

  const effectiveDate = new Date();

  effectiveDate.setDate(
    effectiveDate.getDate() + Math.max(0, effectiveDays),
  );

  const result = await db.runAsync(
    `
      INSERT INTO next_of_kin_benefits (
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
  const pending = await db.getAllAsync<{
    id: number;
    member_id: number;
    slot: number;
  }>(
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
        SET
          benefit_received = 1,
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

export async function setMemberPasscode(
  memberId: number,
  passcode: string,
): Promise<void> {
  const db = await getDatabase();

  if (!isValidPasscode(passcode)) {
    throw new Error(
      'Passcode must contain exactly 4 letters or numbers.',
    );
  }

  const member = await db.getFirstAsync<{
    phone: string | null;
  }>(
    `
      SELECT phone
      FROM members
      WHERE id = ?
      LIMIT 1
    `,
    memberId,
  );

  if (!member) {
    throw new Error('Member not found.');
  }

  if (!normalizeText(member.phone)) {
    throw new Error(
      'Only members with a phone number can have a passcode.',
    );
  }

  const credential = await db.getFirstAsync<{
    salt: string;
  }>(
    `
      SELECT salt
      FROM member_credentials
      WHERE member_id = ?
      LIMIT 1
    `,
    memberId,
  );

  const salt = credential?.salt ?? Crypto.randomUUID();
  const passcodeHash = await hashPasscode(passcode, salt);

  await db.runAsync(
    `
      INSERT INTO member_credentials (
        member_id,
        salt,
        passcode_hash,
        phone_eligible,
        failed_attempts,
        locked_until,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 1, 0, NULL, ?, ?)
      ON CONFLICT(member_id)
      DO UPDATE SET
        salt = excluded.salt,
        passcode_hash = excluded.passcode_hash,
        phone_eligible = 1,
        failed_attempts = 0,
        locked_until = NULL,
        updated_at = excluded.updated_at
    `,
    memberId,
    salt,
    passcodeHash,
    now(),
    now(),
  );
}

export async function hasMemberPasscode(
  memberId: number,
): Promise<boolean> {
  const db = await getDatabase();

  const result = await db.getFirstAsync<{
    passcode_hash: string | null;
  }>(
    `
      SELECT passcode_hash
      FROM member_credentials
      WHERE member_id = ?
      LIMIT 1
    `,
    memberId,
  );

  return Boolean(result?.passcode_hash);
}

export async function verifyMemberPasscode(
  memberId: number,
  passcode: string,
): Promise<boolean> {
  const db = await getDatabase();

  if (!isValidPasscode(passcode)) {
    return false;
  }

  const credential = await db.getFirstAsync<{
    salt: string;
    passcode_hash: string | null;
    failed_attempts: number;
    locked_until: string | null;
  }>(
    `
      SELECT
        salt,
        passcode_hash,
        failed_attempts,
        locked_until
      FROM member_credentials
      WHERE member_id = ?
      LIMIT 1
    `,
    memberId,
  );

  if (!credential?.passcode_hash) {
    return false;
  }

  if (
    credential.locked_until &&
    new Date(credential.locked_until).getTime() > Date.now()
  ) {
    return false;
  }

  const suppliedHash = await hashPasscode(
    passcode,
    credential.salt,
  );

  const success = suppliedHash === credential.passcode_hash;

  await db.runAsync(
    `
      INSERT INTO member_auth_attempts (
        member_id,
        success,
        attempted_at
      )
      VALUES (?, ?, ?)
    `,
    memberId,
    success ? 1 : 0,
    now(),
  );

  if (success) {
    await db.runAsync(
      `
        UPDATE member_credentials
        SET
          failed_attempts = 0,
          locked_until = NULL,
          updated_at = ?
        WHERE member_id = ?
      `,
      now(),
      memberId,
    );

    return true;
  }

  const attempts = credential.failed_attempts + 1;

  if (attempts >= 5) {
    const lockedUntil = new Date();

    lockedUntil.setMinutes(
      lockedUntil.getMinutes() + 15,
    );

    await db.runAsync(
      `
        UPDATE member_credentials
        SET
          failed_attempts = 0,
          locked_until = ?,
          updated_at = ?
        WHERE member_id = ?
      `,
      lockedUntil.toISOString(),
      now(),
      memberId,
    );
  } else {
    await db.runAsync(
      `
        UPDATE member_credentials
        SET
          failed_attempts = ?,
          updated_at = ?
        WHERE member_id = ?
      `,
      attempts,
      now(),
      memberId,
    );
  }

  return false;
}

export async function resetMemberPasscode(
  memberId: number,
  newPasscode: string,
): Promise<void> {
  await setMemberPasscode(memberId, newPasscode);
}

export async function signMemberTransaction(
  memberId: number,
  passcode: string,
  transactionType: string,
  transactionId: number | null = null,
): Promise<boolean> {
  const verified = await verifyMemberPasscode(
    memberId,
    passcode,
  );

  if (!verified) {
    return false;
  }

  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO member_transaction_signatures (
        member_id,
        transaction_type,
        transaction_id,
        signed_at
      )
      VALUES (?, ?, ?, ?)
    `,
    memberId,
    normalizeText(transactionType),
    transactionId,
    now(),
  );

  return true;
}

export async function createMeeting(
  groupId: number,
  meetingDate: string,
): Promise<number> {
  const db = await getDatabase();

  const result = await db.runAsync(
    `
      INSERT INTO group_meetings (
        group_id,
        meeting_date,
        opened_at,
        status,
        created_at
      )
      VALUES (?, ?, ?, 'open', ?)
    `,
    groupId,
    meetingDate,
    now(),
    now(),
  );

  await recordGroupActivity(groupId);

  return result.lastInsertRowId;
}

export async function openAppAccess(
  groupId: number,
  meetingId: number | null,
  authorizers: Array<{
    memberId: number;
    passcode: string;
    role: 'executive' | 'member';
  }>,
): Promise<number> {
  const db = await getDatabase();

  if (authorizers.length !== 3) {
    throw new Error(
      'Exactly three members are required to open access.',
    );
  }

  const uniqueMembers = new Set(
    authorizers.map((item) => item.memberId),
  );

  if (uniqueMembers.size !== 3) {
    throw new Error(
      'The three authorizers must be different members.',
    );
  }

  const executives = authorizers.filter(
    (item) => item.role === 'executive',
  );

  const ordinaryMembers = authorizers.filter(
    (item) => item.role === 'member',
  );

  if (executives.length !== 2 || ordinaryMembers.length !== 1) {
    throw new Error(
      'Access requires exactly 2 executive members and 1 ordinary member.',
    );
  }

  for (const authorizer of authorizers) {
    const member = await db.getFirstAsync<{
      id: number;
      group_id: number;
      role: string;
      phone: string | null;
    }>(
      `
        SELECT id, group_id, role, phone
        FROM members
        WHERE id = ?
        AND status = 'active'
        LIMIT 1
      `,
      authorizer.memberId,
    );

    if (!member || member.group_id !== groupId) {
      throw new Error(
        'Every authorizer must be an active member of this group.',
      );
    }

    const actualExecutive =
      member.role !== 'member';

    if (
      authorizer.role === 'executive' &&
      !actualExecutive
    ) {
      throw new Error(
        'An executive authorizer must have an executive role.',
      );
    }

    if (
      authorizer.role === 'member' &&
      actualExecutive
    ) {
      throw new Error(
        'The ordinary authorizer must not be an executive.',
      );
    }

    const verified = await verifyMemberPasscode(
      authorizer.memberId,
      authorizer.passcode,
    );

    if (!verified) {
      throw new Error(
        `Passcode verification failed for member ${member.id}.`,
      );
    }
  }

  const sessionResult = await db.runAsync(
    `
      INSERT INTO app_access_sessions (
        group_id,
        meeting_id,
        opened_at,
        status
      )
      VALUES (?, ?, ?, 'open')
    `,
    groupId,
    meetingId,
    now(),
  );

  const sessionId = sessionResult.lastInsertRowId;

  for (const authorizer of authorizers) {
    await db.runAsync(
      `
        INSERT INTO app_access_authorizers (
          session_id,
          member_id,
          authorizer_role,
          authorized_at
        )
        VALUES (?, ?, ?, ?)
      `,
      sessionId,
      authorizer.memberId,
      authorizer.role,
      now(),
    );
  }

  await recordGroupActivity(groupId);

  return sessionId;
}

export async function closeAppAccess(
  sessionId: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE app_access_sessions
      SET
        closed_at = ?,
        status = 'closed'
      WHERE id = ?
    `,
    now(),
    sessionId,
  );
}

export async function closeMeeting(
  meetingId: number,
  totalSavings: number,
  loanFund: number,
  groupFund: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE group_meetings
      SET
        closed_at = ?,
        status = 'closed'
      WHERE id = ?
    `,
    now(),
    meetingId,
  );

  await db.runAsync(
    `
      INSERT INTO meeting_closures (
        meeting_id,
        closed_at,
        total_savings,
        loan_fund,
        group_fund
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    meetingId,
    now(),
    totalSavings,
    loanFund,
    groupFund,
  );

  const meeting = await db.getFirstAsync<{
    group_id: number;
  }>(
    `
      SELECT group_id
      FROM group_meetings
      WHERE id = ?
      LIMIT 1
    `,
    meetingId,
  );

  if (meeting) {
    await recordGroupActivity(meeting.group_id);
  }
}

export async function saveMemberStatement(
  meetingId: number,
  memberId: number,
  individualTotalSavings: number,
  individualLoanBalance: number,
  individualLoanDueDate: string | null,
): Promise<number> {
  const db = await getDatabase();

  const result = await db.runAsync(
    `
      INSERT INTO member_statement_records (
        meeting_id,
        member_id,
        individual_total_savings,
        individual_loan_balance,
        individual_loan_due_date,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    meetingId,
    memberId,
    individualTotalSavings,
    individualLoanBalance,
    individualLoanDueDate,
    now(),
  );

  return result.lastInsertRowId;
}

export async function queueImportantGroupNotification(
  groupId: number,
  title: string,
  message: string,
): Promise<number> {
  const db = await getDatabase();

  const result = await db.runAsync(
    `
      INSERT INTO notification_queue (
        group_id,
        member_id,
        notification_type,
        priority,
        title,
        message,
        created_at,
        status
      )
      VALUES (?, NULL, 'group_summary', 'important', ?, ?, ?, 'pending')
    `,
    groupId,
    title,
    message,
    now(),
  );

  return result.lastInsertRowId;
}

export async function queueImportantMemberNotification(
  groupId: number,
  memberId: number,
  title: string,
  message: string,
): Promise<number> {
  const db = await getDatabase();

  const result = await db.runAsync(
    `
      INSERT INTO notification_queue (
        group_id,
        member_id,
        notification_type,
        priority,
        title,
        message,
        created_at,
        status
      )
      VALUES (?, ?, 'member_statement', 'important', ?, ?, ?, 'pending')
    `,
    groupId,
    memberId,
    title,
    message,
    now(),
  );

  return result.lastInsertRowId;
}

export async function getPendingNotifications(): Promise<
  Array<{
    id: number;
    group_id: number;
    member_id: number | null;
    notification_type: string;
    priority: string;
    title: string;
    message: string;
    created_at: string;
    status: string;
  }>
> {
  const db = await getDatabase();

  return db.getAllAsync(
    `
      SELECT *
      FROM notification_queue
      WHERE status = 'pending'
      ORDER BY
        CASE WHEN priority = 'important' THEN 0 ELSE 1 END,
        created_at ASC
    `,
  );
  }
