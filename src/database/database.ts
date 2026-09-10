import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'ebadsave.db';

export const MIN_GROUP_NUMBER = 2010;
export const MAX_GROUP_NUMBER = 9090;

export const MIN_MEMBER_SEQUENCE = 1;
export const MAX_MEMBER_SEQUENCE = 999;

export type GroupStatus = 'active' | 'dormant';

export type GroupRecord = {
  id: number;
  group_number: number;
  group_name: string;
  district: string;
  country: string;
  status: GroupStatus;
  registered_at: string;
  last_activity_at: string;
  dormant_at: string | null;
};

export type MemberStatus = 'active' | 'inactive';

export type MemberRecord = {
  id: number;
  group_id: number;
  member_number: string;
  member_sequence: number;
  member_name: string;
  phone: string;
  status: MemberStatus;
  registered_at: string;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Open the Ebadsave SQLite database.
 *
 * SQLite data is stored locally on the device and survives
 * app restarts.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databasePromise;
}

/**
 * Create the database tables and indexes.
 */
export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_number INTEGER NOT NULL,
      group_name TEXT NOT NULL,
      district TEXT NOT NULL,
      country TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      registered_at TEXT NOT NULL,
      last_activity_at TEXT NOT NULL,
      dormant_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_active_number
    ON groups(group_number)
    WHERE status = 'active';

    CREATE INDEX IF NOT EXISTS idx_groups_status
    ON groups(status);

    CREATE INDEX IF NOT EXISTS idx_groups_last_activity
    ON groups(last_activity_at);

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      member_number TEXT NOT NULL UNIQUE,
      member_sequence INTEGER NOT NULL,
      member_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      registered_at TEXT NOT NULL,

      FOREIGN KEY (group_id)
        REFERENCES groups(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_members_group_sequence
    ON members(group_id, member_sequence);

    CREATE INDEX IF NOT EXISTS idx_members_group_id
    ON members(group_id);

    CREATE INDEX IF NOT EXISTS idx_members_status
    ON members(status);
  `);
}

/**
 * A group becomes eligible for number release after
 * 3 months without recorded activity.
 */
function getDormancyCutoff(): string {
  const cutoff = new Date();

  cutoff.setMonth(cutoff.getMonth() - 3);

  return cutoff.toISOString();
}

/**
 * Find the first available KYA group number.
 *
 * Rules:
 * 1. Start at KYA 2010.
 * 2. Continue upwards one number at a time.
 * 3. Never use a number currently assigned to an active group.
 * 4. If a group has been inactive for 3 months, its number
 *    becomes available again.
 */
async function findAvailableGroupNumber(
  db: SQLite.SQLiteDatabase,
): Promise<number> {
  const cutoff = getDormancyCutoff();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE groups
      SET
        status = 'dormant',
        dormant_at = ?
      WHERE
        status = 'active'
        AND last_activity_at <= ?
    `,
    now,
    cutoff,
  );

  const activeGroups = await db.getAllAsync<{
    group_number: number;
  }>(
    `
      SELECT group_number
      FROM groups
      WHERE status = 'active'
    `,
  );

  const activeNumbers = new Set(
    activeGroups.map((group) => group.group_number),
  );

  for (
    let number = MIN_GROUP_NUMBER;
    number <= MAX_GROUP_NUMBER;
    number++
  ) {
    if (!activeNumbers.has(number)) {
      return number;
    }
  }

  throw new Error(
    `No KYA group numbers are available between KYA ${MIN_GROUP_NUMBER} and KYA ${MAX_GROUP_NUMBER}.`,
  );
}

/**
 * Register a new group and permanently record its KYA number.
 */
export async function registerGroup(params: {
  groupName: string;
  district: string;
  country: string;
}): Promise<GroupRecord> {
  const groupName = params.groupName.trim();
  const district = params.district.trim();
  const country = params.country.trim();

  if (!groupName) {
    throw new Error('Group name is required.');
  }

  if (!district) {
    throw new Error('District is required.');
  }

  if (!country) {
    throw new Error('Country is required.');
  }

  const db = await getDatabase();

  let registeredGroup: GroupRecord | null = null;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const groupNumber =
      await findAvailableGroupNumber(transaction);

    const now = new Date().toISOString();

    const result = await transaction.runAsync(
      `
        INSERT INTO groups (
          group_number,
          group_name,
          district,
          country,
          status,
          registered_at,
          last_activity_at,
          dormant_at
        )
        VALUES (?, ?, ?, ?, 'active', ?, ?, NULL)
      `,
      groupNumber,
      groupName,
      district,
      country,
      now,
      now,
    );

    registeredGroup = {
      id: result.lastInsertRowId,
      group_number: groupNumber,
      group_name: groupName,
      district,
      country,
      status: 'active',
      registered_at: now,
      last_activity_at: now,
      dormant_at: null,
    };
  });

  if (!registeredGroup) {
    throw new Error('Failed to register the group.');
  }

  return registeredGroup;
}

/**
 * Record activity for a group.
 *
 * Any meeting, savings, loan, contribution,
 * or other approved group activity can call this function.
 *
 * Recording activity resets the group's 3-month dormancy clock.
 */
export async function recordGroupActivity(
  groupId: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE groups
      SET
        last_activity_at = ?,
        status = 'active',
        dormant_at = NULL
      WHERE id = ?
    `,
    new Date().toISOString(),
    groupId,
  );
}

/**
 * Get one group by database ID.
 */
export async function getGroupById(
  groupId: number,
): Promise<GroupRecord | null> {
  const db = await getDatabase();

  const group = await db.getFirstAsync<GroupRecord>(
    `
      SELECT
        id,
        group_number,
        group_name,
        district,
        country,
        status,
        registered_at,
        last_activity_at,
        dormant_at
      FROM groups
      WHERE id = ?
      LIMIT 1
    `,
    groupId,
  );

  return group ?? null;
}

/**
 * Get the currently active group with a particular KYA number.
 */
export async function getActiveGroupByNumber(
  groupNumber: number,
): Promise<GroupRecord | null> {
  const db = await getDatabase();

  const group = await db.getFirstAsync<GroupRecord>(
    `
      SELECT
        id,
        group_number,
        group_name,
        district,
        country,
        status,
        registered_at,
        last_activity_at,
        dormant_at
      FROM groups
      WHERE
        group_number = ?
        AND status = 'active'
      LIMIT 1
    `,
    groupNumber,
  );

  return group ?? null;
}

/**
 * Get all groups, including dormant historical groups.
 */
export async function getAllGroups(): Promise<GroupRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<GroupRecord>(
    `
      SELECT
        id,
        group_number,
        group_name,
        district,
        country,
        status,
        registered_at,
        last_activity_at,
        dormant_at
      FROM groups
      ORDER BY group_number ASC, registered_at ASC
    `,
  );
}

/**
 * Create the next permanent member number for a group.
 *
 * Example:
 *
 * Group KYA 2010:
 *   1   -> KYA 2010001
 *   2   -> KYA 2010002
 *   999 -> KYA 2010999
 *
 * Group KYA 2011:
 *   1   -> KYA 2011001
 *
 * Member numbers are never reused.
 */
async function findNextMemberSequence(
  db: SQLite.SQLiteDatabase,
  groupId: number,
): Promise<number> {
  const result = await db.getFirstAsync<{
    next_sequence: number;
  }>(
    `
      SELECT
        COALESCE(MAX(member_sequence), 0) + 1
        AS next_sequence
      FROM members
      WHERE group_id = ?
    `,
    groupId,
  );

  const nextSequence =
    result?.next_sequence ?? MIN_MEMBER_SEQUENCE;

  if (nextSequence > MAX_MEMBER_SEQUENCE) {
    throw new Error(
      'This group has reached the maximum of 999 members.',
    );
  }

  return nextSequence;
}

/**
 * Format a member number.
 *
 * Group number 2010 + sequence 1
 * becomes KYA 2010001.
 */
function formatMemberNumber(
  groupNumber: number,
  memberSequence: number,
): string {
  return `KYA${groupNumber}${String(memberSequence).padStart(3, '0')}`;
}

/**
 * Register a new member.
 *
 * The member number is permanently assigned and will
 * never be reused for another member in that group.
 */
export async function registerMember(params: {
  groupId: number;
  memberName: string;
  phone?: string;
}): Promise<MemberRecord> {
  const memberName = params.memberName.trim();
  const phone = (params.phone ?? '').trim();

  if (!memberName) {
    throw new Error('Member name is required.');
  }

  const db = await getDatabase();

  let registeredMember: MemberRecord | null = null;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const group = await transaction.getFirstAsync<GroupRecord>(
      `
        SELECT
          id,
          group_number,
          group_name,
          district,
          country,
          status,
          registered_at,
          last_activity_at,
          dormant_at
        FROM groups
        WHERE id = ?
        LIMIT 1
      `,
      params.groupId,
    );

    if (!group) {
      throw new Error('Group not found.');
    }

    if (group.status !== 'active') {
      throw new Error(
        'Members can only be added to an active group.',
      );
    }

    const memberSequence =
      await findNextMemberSequence(
        transaction,
        params.groupId,
      );

    const memberNumber = formatMemberNumber(
      group.group_number,
      memberSequence,
    );

    const now = new Date().toISOString();

    const result = await transaction.runAsync(
      `
        INSERT INTO members (
          group_id,
          member_number,
          member_sequence,
          member_name,
          phone,
          status,
          registered_at
        )
        VALUES (?, ?, ?, ?, ?, 'active', ?)
      `,
      params.groupId,
      memberNumber,
      memberSequence,
      memberName,
      phone,
      now,
    );

    registeredMember = {
      id: result.lastInsertRowId,
      group_id: params.groupId,
      member_number: memberNumber,
      member_sequence: memberSequence,
      member_name: memberName,
      phone,
      status: 'active',
      registered_at: now,
    };

    await transaction.runAsync(
      `
        UPDATE groups
        SET
          last_activity_at = ?,
          status = 'active',
          dormant_at = NULL
        WHERE id = ?
      `,
      now,
      params.groupId,
    );
  });

  if (!registeredMember) {
    throw new Error('Failed to register the member.');
  }

  return registeredMember;
}

/**
 * Get one member by database ID.
 */
export async function getMemberById(
  memberId: number,
): Promise<MemberRecord | null> {
  const db = await getDatabase();

  const member = await db.getFirstAsync<MemberRecord>(
    `
      SELECT
        id,
        group_id,
        member_number,
        member_sequence,
        member_name,
        phone,
        status,
        registered_at
      FROM members
      WHERE id = ?
      LIMIT 1
    `,
    memberId,
  );

  return member ?? null;
}

/**
 * Get one member by their permanent KYA member number.
 */
export async function getMemberByNumber(
  memberNumber: string,
): Promise<MemberRecord | null> {
  const db = await getDatabase();

  const member = await db.getFirstAsync<MemberRecord>(
    `
      SELECT
        id,
        group_id,
        member_number,
        member_sequence,
        member_name,
        phone,
        status,
        registered_at
      FROM members
      WHERE member_number = ?
      LIMIT 1
    `,
    memberNumber.trim(),
  );

  return member ?? null;
}

/**
 * Get all members belonging to one group.
 */
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
        member_sequence,
        member_name,
        phone,
        status,
        registered_at
      FROM members
      WHERE group_id = ?
      ORDER BY member_sequence ASC
    `,
    groupId,
  );
}

/**
 * Get all members in the database.
 */
export async function getAllMembers(): Promise<MemberRecord[]> {
  const db = await getDatabase();

  return db.getAllAsync<MemberRecord>(
    `
      SELECT
        id,
        group_id,
        member_number,
        member_sequence,
        member_name,
        phone,
        status,
        registered_at
      FROM members
      ORDER BY member_number ASC
    `,
  );
  }
