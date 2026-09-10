import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'ebadsave.db';

export const MIN_GROUP_NUMBER = 2010;
export const MAX_GROUP_NUMBER = 9090;

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
 * Find the first available KYA number.
 *
 * Rules:
 * 1. Start at KYA 2010.
 * 2. Continue upwards one number at a time.
 * 3. Never use a number currently assigned to an active group.
 * 4. If a group has been inactive for 3 months, its number
 *    becomes available again.
 *
 * Therefore, if KYA 2010 becomes dormant while KYA 2011
 * remains active, the next new group can receive KYA 2010.
 */
async function findAvailableGroupNumber(
  db: SQLite.SQLiteDatabase,
): Promise<number> {
  const cutoff = getDormancyCutoff();
  const now = new Date().toISOString();

  // Release numbers belonging to groups that have been
  // inactive for at least three months.
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
 *
 * The number allocation and group insertion happen inside
 * an exclusive transaction so two registrations cannot
 * receive the same active number.
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
    const groupNumber = await findAvailableGroupNumber(transaction);

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
 * Any future savings, loan, meeting, contribution,
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
 * Get one group by its database ID.
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
