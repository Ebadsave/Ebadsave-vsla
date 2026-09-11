import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

const DATABASE_NAME = 'ebadsave.db';

const MIN_GROUP_NUMBER = 2010;
const MAX_GROUP_NUMBER = 9090;
const MIN_MEMBER_SEQUENCE = 1;
const MAX_MEMBER_SEQUENCE = 999;

let database: SQLite.SQLiteDatabase | null = null;

export type GroupRecord = {
  id: number;
  group_number: string;
  group_name: string;
  district: string;
  country: string;
  status: 'active' | 'dormant';
  last_activity_at: string;
  created_at: string;
};

export type MemberRecord = {
  id: number;
  group_id: number;
  member_number: string;
  member_sequence: number;
  member_name: string;
  gender: string;
  age: number;
  phone: string;
  cell: string;
  district: string;
  photo_uri: string | null;
  status: 'active' | 'deleted';
  registered_at: string;
};

export type NextOfKinRecord = {
  id: number;
  member_id: number;
  slot: 1 | 2;
  name: string;
  phone: string;
  gender: string;
  benefit_received: number;
  benefit_received_at: string | null;
  effective_at: string;
  created_at: string;
  updated_at: string;
};

export type GroupRules = {
  group_id: number;
  kin_changes_require_meeting: number;
  kin_change_effective_days: number;
  benefit_effective_days: number;
};

export type MeetingRecord = {
  id: number;
  group_id: number;
  meeting_date: string;
  status: 'open' | 'closed';
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export type MemberStatement = {
  member_id: number;
  member_number: string;
  member_name: string;
  individual_total_savings: number;
  individual_loan_balance: number;
  individual_loan_due_date: string | null;
};

export type NextOfKinChangeHistory = {
  id: number;
  member_id: number;
  slot: number;
  action: string;
  old_name: string | null;
  old_phone: string | null;
  old_gender: string | null;
  new_name: string | null;
  new_phone: string | null;
  new_gender: string | null;
  reason: string;
  meeting_date: string;
  requested_at: string;
  effective_at: string;
  status: string;
  created_at: string;
};

export type NextOfKinBenefit = {
  id: number;
  member_id: number;
  next_of_kin_id: number;
  slot: number;
  benefit_type: string;
  amount: number;
  reason: string;
  benefit_date: string;
  effective_at: string;
  status: string;
  recorded_at: string;
};

export type MeetingAuthorizer = {
  id: number;
  meeting_id: number;
  member_id: number;
  role: 'executive' | 'member';
  authorized_at: string;
};

function now(): string {
  return new Date().toISOString();
}

function dateOnly(value: Date = new Date()): string {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function isValidFourCharacterCode(code: string): boolean {
  return /^[A-Za-z0-9]{4}$/.test(code);
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!database) {
    database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return database;
}

async function columnExists(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const columns = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${tableName})`,
  );

  return columns.some((column) => column.name === columnName);
}

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  if (!(await columnExists(db, tableName, columnName))) {
    await db.runAsync(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`,
    );
  }
}

async function hashPasscode(
  passcode: string,
  salt: string,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${passcode}`,
  );
}

async function createPasscodeSalt(): Promise<string> {
  return Crypto.randomUUID();
}

/* =========================================================
   DATABASE INITIALIZATION
   ========================================================= */

export async function initializeDatabase(): Promise<void> {
  const db = await getDb();

  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_number TEXT NOT NULL UNIQUE,
      group_name TEXT NOT NULL,
      district TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      last_activity_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_number TEXT NOT NULL UNIQUE,
      member_sequence INTEGER NOT NULL,
      member_name TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT '',
      age INTEGER NOT NULL DEFAULT 0,
      phone TEXT NOT NULL DEFAULT '',
      cell TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      photo_uri TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      registered_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS deleted_member_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_number TEXT NOT NULL UNIQUE,
      member_sequence INTEGER NOT NULL,
      deleted_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS member_next_of_kin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      benefit_received INTEGER NOT NULL DEFAULT 0,
      benefit_received_at TEXT,
      effective_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(member_id, slot),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS next_of_kin_change_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
      action TEXT NOT NULL,
      old_name TEXT,
      old_phone TEXT,
      old_gender TEXT,
      new_name TEXT,
      new_phone TEXT,
      new_gender TEXT,
      reason TEXT NOT NULL,
      meeting_date TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      effective_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS next_of_kin_benefits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      next_of_kin_id INTEGER NOT NULL,
      slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
      benefit_type TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      benefit_date TEXT NOT NULL,
      effective_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      recorded_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id),
      FOREIGN KEY (next_of_kin_id) REFERENCES member_next_of_kin(id)
    );

    CREATE TABLE IF NOT EXISTS group_rules (
      group_id INTEGER PRIMARY KEY,
      kin_changes_require_meeting INTEGER NOT NULL DEFAULT 1,
      kin_change_effective_days INTEGER NOT NULL DEFAULT 30,
      benefit_effective_days INTEGER NOT NULL DEFAULT 30,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS group_meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      meeting_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      opened_at TEXT,
      closed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(group_id, meeting_date),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );

    CREATE TABLE IF NOT EXISTS member_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL UNIQUE,
      phone_verified INTEGER NOT NULL DEFAULT 0,
      passcode_hash TEXT,
      passcode_salt TEXT,
      passcode_set_at TEXT,
      reset_requested_at TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS member_auth_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      successful INTEGER NOT NULL DEFAULT 0,
      attempted_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS member_transaction_signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      transaction_id INTEGER,
      amount REAL NOT NULL DEFAULT 0,
      signature_verified INTEGER NOT NULL DEFAULT 0,
      signed_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_openings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL UNIQUE,
      opened_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_opening_authorizers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('executive', 'member')),
      authorized_at TEXT NOT NULL,
      UNIQUE(meeting_id, member_id),
      FOREIGN KEY (meeting_id) REFERENCES group_meetings(id),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_closures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL UNIQUE,
      closed_at TEXT NOT NULL,
      total_savings REAL NOT NULL DEFAULT 0,
      total_loan_fund REAL NOT NULL DEFAULT 0,
      total_group_fund REAL NOT NULL DEFAULT 0,
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
      member_id INTEGER,
      notification_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      channel TEXT NOT NULL DEFAULT 'fcm',
      fallback_channel TEXT NOT NULL DEFAULT 'sms',
      scheduled_at TEXT,
      sent_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS notification_delivery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      attempted_at TEXT NOT NULL,
      provider_reference TEXT,
      FOREIGN KEY (notification_id) REFERENCES notification_queue(id)
    );

    CREATE INDEX IF NOT EXISTS idx_members_group
      ON members(group_id);

    CREATE INDEX IF NOT EXISTS idx_members_number
      ON members(member_number);

    CREATE INDEX IF NOT EXISTS idx_kin_member
      ON member_next_of_kin(member_id);

    CREATE INDEX IF NOT EXISTS idx_meetings_group_date
      ON group_meetings(group_id, meeting_date);

    CREATE INDEX IF NOT EXISTS idx_auth_member
      ON member_auth_attempts(member_id);

    CREATE INDEX IF NOT EXISTS idx_notifications_member
      ON notification_queue(member_id);
  `);

  // Migration for databases created by earlier versions.

  await addColumnIfMissing(
    db,
    'members',
    'gender',
    `TEXT NOT NULL DEFAULT ''`,
  );

  await addColumnIfMissing(
    db,
    'members',
    'age',
    `INTEGER NOT NULL DEFAULT 0`,
  );

  await addColumnIfMissing(
    db,
    'members',
    'cell',
    `TEXT NOT NULL DEFAULT ''`,
  );

  await addColumnIfMissing(
    db,
    'members',
    'district',
    `TEXT NOT NULL DEFAULT ''`,
  );

  await addColumnIfMissing(
    db,
    'members',
    'photo_uri',
    `TEXT`,
  );

  await addColumnIfMissing(
    db,
    'members',
    'status',
    `TEXT NOT NULL DEFAULT 'active'`,
  );

  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_deleted_member_number
      ON deleted_member_numbers(member_number);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_member_group_sequence
      ON members(group_id, member_sequence);
  `);
}

/* =========================================================
   GROUP MANAGEMENT
   ========================================================= */

export async function createGroup(input: {
  groupName: string;
  district: string;
  country: string;
}): Promise<GroupRecord> {
  const db = await getDb();
  const currentDate = now();

  const nextNumber = await findNextAvailableGroupNumber();

  if (!nextNumber) {
    throw new Error('No group numbers are currently available.');
  }

  const groupNumber = `KYA ${nextNumber}`;

  const result = await db.runAsync(
    `
      INSERT INTO groups
      (
        group_number,
        group_name,
        district,
        country,
        status,
        last_activity_at,
        created_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `,
    groupNumber,
    input.groupName.trim(),
    input.district.trim(),
    input.country.trim(),
    currentDate,
    currentDate,
  );

  const groupId = result.lastInsertRowId;

  await db.runAsync(
    `
      INSERT OR IGNORE INTO group_rules
      (
        group_id,
        kin_changes_require_meeting,
        kin_change_effective_days,
        benefit_effective_days
      )
      VALUES (?, 1, 30, 30)
    `,
    groupId,
  );

  const group = await db.getFirstAsync<GroupRecord>(
    `SELECT * FROM groups WHERE id = ?`,
    groupId,
  );

  if (!group) {
    throw new Error('Group could not be created.');
  }

  return group;
}

async function findNextAvailableGroupNumber(): Promise<number | null> {
  const db = await getDb();

  for (
    let number = MIN_GROUP_NUMBER;
    number <= MAX_GROUP_NUMBER;
    number += 1
  ) {
    const groupNumber = `KYA ${number}`;

    const active = await db.getFirstAsync<{ id: number }>(
      `
        SELECT id
        FROM groups
        WHERE group_number = ?
          AND status = 'active'
        LIMIT 1
      `,
      groupNumber,
    );

    if (!active) {
      return number;
    }
  }

  return null;
}

export async function getAllGroups(): Promise<GroupRecord[]> {
  const db = await getDb();

  return db.getAllAsync<GroupRecord>(
    `
      SELECT *
      FROM groups
      ORDER BY CAST(REPLACE(group_number, 'KYA ', '') AS INTEGER)
    `,
  );
}

export async function getActiveGroup(): Promise<GroupRecord | null> {
  const db = await getDb();

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

export async function getGroupById(
  groupId: number,
): Promise<GroupRecord | null> {
  const db = await getDb();

  return db.getFirstAsync<GroupRecord>(
    `SELECT * FROM groups WHERE id = ?`,
    groupId,
  );
}

export async function recordGroupActivity(
  groupId: number,
): Promise<void> {
  const db = await getDb();

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

/* =========================================================
   GROUP RULES
   ========================================================= */

export async function getGroupRules(
  groupId: number,
): Promise<GroupRules> {
  const db = await getDb();

  await db.runAsync(
    `
      INSERT OR IGNORE INTO group_rules
      (
        group_id,
        kin_changes_require_meeting,
        kin_change_effective_days,
        benefit_effective_days
      )
      VALUES (?, 1, 30, 30)
    `,
    groupId,
  );

  const rules = await db.getFirstAsync<GroupRules>(
    `
      SELECT *
      FROM group_rules
      WHERE group_id = ?
    `,
    groupId,
  );

  if (!rules) {
    throw new Error('Group rules could not be loaded.');
  }

  return rules;
}

export async function updateGroupRules(input: {
  groupId: number;
  kinChangesRequireMeeting?: boolean;
  kinChangeEffectiveDays?: number;
  benefitEffectiveDays?: number;
}): Promise<void> {
  const db = await getDb();
  const current = await getGroupRules(input.groupId);

  const meetingRequired =
    input.kinChangesRequireMeeting === undefined
      ? current.kin_changes_require_meeting
      : input.kinChangesRequireMeeting
        ? 1
        : 0;

  const kinDays =
    input.kinChangeEffectiveDays === undefined
      ? current.kin_change_effective_days
      : Math.max(0, Math.floor(input.kinChangeEffectiveDays));

  const benefitDays =
    input.benefitEffectiveDays === undefined
      ? current.benefit_effective_days
      : Math.max(0, Math.floor(input.benefitEffectiveDays));

  await db.runAsync(
    `
      UPDATE group_rules
      SET kin_changes_require_meeting = ?,
          kin_change_effective_days = ?,
          benefit_effective_days = ?
      WHERE group_id = ?
    `,
    meetingRequired,
    kinDays,
    benefitDays,
    input.groupId,
  );
}

/* =========================================================
   MEMBERS
   ========================================================= */

export async function registerMember(input: {
  groupId: number;
  memberName: string;
  gender?: string;
  age?: number;
  phone?: string;
  cell?: string;
  district?: string;
  photoUri?: string | null;
}): Promise<MemberRecord> {
  const db = await getDb();

  const fullName = input.memberName.trim();

  if (!fullName) {
    throw new Error('Full name is required.');
  }

  if (!input.gender?.trim()) {
    throw new Error('Gender is required.');
  }

  if (
    input.age === undefined ||
    !Number.isInteger(input.age) ||
    input.age <= 0
  ) {
    throw new Error('A valid age is required.');
  }

  if (!input.cell?.trim()) {
    throw new Error('Cell is required.');
  }

  if (!input.district?.trim()) {
    throw new Error('District is required.');
  }

  const sequence = await findNextMemberSequence(input.groupId);

  if (sequence === null) {
    throw new Error(
      'This group has reached the maximum of 999 member numbers.',
    );
  }

  const group = await getGroupById(input.groupId);

  if (!group) {
    throw new Error('Group not found.');
  }

  const groupDigits = group.group_number.replace('KYA ', '');

  const memberNumber =
    `KYA${groupDigits}${String(sequence).padStart(3, '0')}`;

  const registeredAt = now();

  const result = await db.runAsync(
    `
      INSERT INTO members
      (
        group_id,
        member_number,
        member_sequence,
        member_name,
        gender,
        age,
        phone,
        cell,
        district,
        photo_uri,
        status,
        registered_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `,
    input.groupId,
    memberNumber,
    sequence,
    fullName,
    input.gender.trim(),
    input.age,
    input.phone?.trim() ?? '',
    input.cell.trim(),
    input.district.trim(),
    input.photoUri ?? null,
    registeredAt,
  );

  const memberId = result.lastInsertRowId;

  await db.runAsync(
    `
      INSERT INTO member_credentials
      (
        member_id,
        phone_verified,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?)
    `,
    memberId,
    input.phone?.trim() ? 1 : 0,
    registeredAt,
    registeredAt,
  );

  await recordGroupActivity(input.groupId);

  const member = await getMemberById(memberId);

  if (!member) {
    throw new Error('Member could not be created.');
  }

  return member;
}

async function findNextMemberSequence(
  groupId: number,
): Promise<number | null> {
  const db = await getDb();

  for (
    let sequence = MIN_MEMBER_SEQUENCE;
    sequence <= MAX_MEMBER_SEQUENCE;
    sequence += 1
  ) {
    const existing = await db.getFirstAsync<{ id: number }>(
      `
        SELECT id
        FROM members
        WHERE group_id = ?
          AND member_sequence = ?
        LIMIT 1
      `,
      groupId,
      sequence,
    );

    const deleted = await db.getFirstAsync<{ id: number }>(
      `
        SELECT id
        FROM deleted_member_numbers
        WHERE group_id = ?
          AND member_sequence = ?
        LIMIT 1
      `,
      groupId,
      sequence,
    );

    if (!existing && !deleted) {
      return sequence;
    }
  }

  return null;
}

export async function getMemberById(
  memberId: number,
): Promise<MemberRecord | null> {
  const db = await getDb();

  return db.getFirstAsync<MemberRecord>(
    `
      SELECT *
      FROM members
      WHERE id = ?
    `,
    memberId,
  );
}

export async function getMemberByNumber(
  memberNumber: string,
): Promise<MemberRecord | null> {
  const db = await getDb();

  return db.getFirstAsync<MemberRecord>(
    `
      SELECT *
      FROM members
      WHERE member_number = ?
    `,
    memberNumber,
  );
}

export async function getMembersByGroupId(
  groupId: number,
): Promise<MemberRecord[]> {
  const db = await getDb();

  return db.getAllAsync<MemberRecord>(
    `
      SELECT *
      FROM members
      WHERE group_id = ?
        AND status = 'active'
      ORDER BY member_sequence ASC
    `,
    groupId,
  );
}

export async function getAllMembers(): Promise<MemberRecord[]> {
  const db = await getDb();

  return db.getAllAsync<MemberRecord>(
    `
      SELECT *
      FROM members
      WHERE status = 'active'
      ORDER BY group_id ASC, member_sequence ASC
    `,
  );
}

/* =========================================================
   MEMBER PASSCODES
   ========================================================= */

export async function setMemberPasscode(
  memberId: number,
  passcode: string,
): Promise<void> {
  const db = await getDb();

  if (!isValidFourCharacterCode(passcode)) {
    throw new Error(
      'Passcode must contain exactly 4 letters or numbers.',
    );
  }

  const member = await getMemberById(memberId);

  if (!member) {
    throw new Error('Member not found.');
  }

  if (!member.phone.trim()) {
    throw new Error(
      'Only members with a registered phone number can use a passcode.',
    );
  }

  const salt = await createPasscodeSalt();
  const hash = await hashPasscode(passcode, salt);
  const currentDate = now();

  await db.runAsync(
    `
      INSERT INTO member_credentials
      (
        member_id,
        phone_verified,
        passcode_hash,
        passcode_salt,
        passcode_set_at,
        failed_attempts,
        locked_until,
        created_at,
        updated_at
      )
      VALUES (?, 1, ?, ?, ?, 0, NULL, ?, ?)
      ON CONFLICT(member_id)
      DO UPDATE SET
        phone_verified = 1,
        passcode_hash = excluded.passcode_hash,
        passcode_salt = excluded.passcode_salt,
        passcode_set_at = excluded.passcode_set_at,
        failed_attempts = 0,
        locked_until = NULL,
        updated_at = excluded.updated_at
    `,
    memberId,
    hash,
    salt,
    currentDate,
    currentDate,
    currentDate,
  );
}

export async function hasMemberPasscode(
  memberId: number,
): Promise<boolean> {
  const db = await getDb();

  const credential = await db.getFirstAsync<{
    passcode_hash: string | null;
  }>(
    `
      SELECT passcode_hash
      FROM member_credentials
      WHERE member_id = ?
    `,
    memberId,
  );

  return Boolean(credential?.passcode_hash);
}

export async function verifyMemberPasscode(
  memberId: number,
  passcode: string,
  action = 'transaction',
): Promise<boolean> {
  const db = await getDb();

  if (!isValidFourCharacterCode(passcode)) {
    throw new Error('Passcode must contain exactly 4 characters.');
  }

  const member = await getMemberById(memberId);

  if (!member) {
    throw new Error('Member not found.');
  }

  if (!member.phone.trim()) {
    throw new Error(
      'This member has no phone number and cannot use a passcode.',
    );
  }

  const credential = await db.getFirstAsync<{
    passcode_hash: string | null;
    passcode_salt: string | null;
    failed_attempts: number;
    locked_until: string | null;
  }>(
    `
      SELECT
        passcode_hash,
        passcode_salt,
        failed_attempts,
        locked_until
      FROM member_credentials
      WHERE member_id = ?
    `,
    memberId,
  );

  if (!credential?.passcode_hash || !credential.passcode_salt) {
    await db.runAsync(
      `
        INSERT INTO member_auth_attempts
        (
          member_id,
          action,
          successful,
          attempted_at
        )
        VALUES (?, ?, 0, ?)
      `,
      memberId,
      `${action}_no_passcode`,
      now(),
    );

    return false;
  }

  if (
    credential.locked_until &&
    new Date(credential.locked_until).getTime() > Date.now()
  ) {
    throw new Error(
      'Too many incorrect attempts. Please try again later.',
    );
  }

  const suppliedHash = await hashPasscode(
    passcode,
    credential.passcode_salt,
  );

  const successful = suppliedHash === credential.passcode_hash;
  const
