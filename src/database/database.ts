import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'ebadsave_vsla.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Open the Ebadsave VSLA SQLite database.
 *
 * The same database connection is reused throughout the app.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  const db = await databasePromise;

  // Enable foreign-key support.
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // Use WAL mode for better reliability and performance.
  await db.execAsync('PRAGMA journal_mode = WAL;');

  return db;
}

/**
 * Initialize the database.
 *
 * Step 1 only:
 * - Opens the SQLite database.
 * - Enables foreign keys.
 * - Enables WAL.
 *
 * Tables will be added in Steps 2–14.
 */
export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();

  // Confirm that the SQLite database is available.
  await db.execAsync('SELECT 1;');
}

/**
 * Compatibility alias.
 *
 * Some existing screens/code may call initDatabase().
 */
export async function initDatabase(): Promise<void> {
  await initializeDatabase();
}

/**
 * Close/reset the cached database connection.
 *
 * This is mainly useful for development/testing.
 */
export function resetDatabaseConnection(): void {
  databasePromise = null;
}

/**
 * Return the database name used by Ebadsave VSLA.
 */
export function getDatabaseName(): string {
  return DATABASE_NAME;
    }
