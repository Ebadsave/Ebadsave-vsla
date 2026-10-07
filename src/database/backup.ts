import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';

const BACKUP_TABLES = [
  'groups',
  'members',
  'deleted_member_numbers',
  'member_next_of_kin',
  'next_of_kin_change_history',
  'next_of_kin_benefits',
  'group_rules',
  'vsla_setup_rules',
  'group_meetings',
  'member_credentials',
  'member_auth_attempts',
  'member_transaction_signatures',
  'meeting_attendance',
  'meeting_closures',
  'financial_accounts',
  'financial_collections',
  'financial_collection_items',
  'financial_transactions',
  'financial_transaction_reversals',
  'receipts',
  'notification_queue',
  'notification_delivery',
  'meeting_audit_records',
  'member_passbook_records',
  'member_statement_records',
  'loan_interest_charges',
];

export interface BackupData {
  version: string;
  timestamp: string;
  appName: string;
  [key: string]: any;
}

/**
 * Export the entire database to a JSON backup file
 */
export async function exportDatabaseBackup(): Promise<{
  success: boolean;
  message: string;
  filePath?: string;
  fileName?: string;
  error?: string;
}> {
  try {
    const db = await SQLite.openDatabaseAsync('ebadsave_vsla.db');

    const backup: BackupData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      appName: 'Ebadsave-VSLA',
    };

    for (const table of BACKUP_TABLES) {
      try {
        const rows = await db.getAllAsync(
          `SELECT * FROM "${table}"`
        );

        backup[table] = rows || [];
      } catch {
        // Table may not exist yet.
        backup[table] = [];
      }
    }

    const now = new Date();

    const dateStr = now
      .toISOString()
      .split('T')[0]
      .replace(/-/g, '');

    const timeStr = now
      .toISOString()
      .split('T')[1]
      .split('.')[0]
      .replace(/:/g, '');

    const fileName =
      `ebadsave_backup_${dateStr}_${timeStr}.json`;

    const documentsDir =
      FileSystem.documentDirectory ||
      FileSystem.cacheDirectory;

    if (!documentsDir) {
      throw new Error(
        'Could not access device storage directories'
      );
    }

    const filePath = `${documentsDir}${fileName}`;

    const jsonContent = JSON.stringify(
      backup,
      null,
      2
    );

    await FileSystem.writeAsStringAsync(
      filePath,
      jsonContent,
      {
        encoding: FileSystem.EncodingType.UTF8,
      }
    );

    return {
      success: true,
      message:
        `Backup created successfully on ` +
        `${new Date(backup.timestamp).toLocaleString()}`,
      filePath,
      fileName,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error during backup';

    return {
      success: false,
      message: 'Backup failed',
      error: errorMessage,
    };
  }
}

/**
 * Send backup file via email
 */
export async function emailBackupFile(
  filePath: string,
  fileName: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    const isAvailable =
      await MailComposer.isAvailableAsync();

    if (!isAvailable) {
      return {
        success: false,
        message:
          'Email is not available on this device',
        error: 'EMAIL_NOT_AVAILABLE',
      };
    }

    const fileInfo =
      await FileSystem.getInfoAsync(filePath);

    const fileSize =
      fileInfo.exists && 'size' in fileInfo
        ? formatFileSize(
            (fileInfo as any).size
          )
        : 'unknown';

    const result =
      await MailComposer.composeAsync({
        subject:
          `Ebadsave VSLA Backup - ` +
          `${new Date().toLocaleDateString()}`,

        body:
          `Dear User,\n\n` +
          `Please find attached your Ebadsave VSLA data backup.\n\n` +
          `Backup Details:\n` +
          `- File: ${fileName}\n` +
          `- Size: ${fileSize}\n` +
          `- Date: ${new Date().toLocaleString()}\n\n` +
          `To restore this backup after reinstalling the app:\n` +
          `1. Open the app\n` +
          `2. Go to Settings > Data Management\n` +
          `3. Select "Restore Backup"\n` +
          `4. Choose this backup file\n\n` +
          `Keep this email safe for future reference.\n\n` +
          `Best regards,\n` +
          `Ebadsave VSLA`,

        attachments: [filePath],
      });

    if (result.status === 'sent') {
      return {
        success: true,
        message:
          'Backup sent via email successfully',
      };
    }

    if (result.status === 'saved') {
      return {
        success: true,
        message:
          'Backup email saved as draft',
      };
    }

    return {
      success: false,
      message: 'Email was not sent',
      error: result.status,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error during email';

    return {
      success: false,
      message:
        'Failed to send backup via email',
      error: errorMessage,
    };
  }
}

/**
 * List all available backup files
 */
export async function listBackupFiles(): Promise<
  Array<{
    name: string;
    path: string;
    size: number;
    timestamp: string;
  }>
> {
  try {
    const documentsDir =
      FileSystem.documentDirectory ||
      FileSystem.cacheDirectory;

    if (!documentsDir) {
      return [];
    }

    const files =
      await FileSystem.readDirectoryAsync(
        documentsDir
      );

    const backupFiles =
      files.filter((file) =>
        file.startsWith('ebadsave_backup_')
      );

    const fileDetails =
      await Promise.all(
        backupFiles.map(async (fileName) => {
          const filePath =
            `${documentsDir}${fileName}`;

          const fileInfo =
            await FileSystem.getInfoAsync(
              filePath
            );

          const match =
            fileName.match(
              /ebadsave_backup_(\d{8})_(\d{6})/
            );

          let timestamp = 'Unknown';

          if (match) {
            const date =
              `${match[1].slice(0, 4)}-` +
              `${match[1].slice(4, 6)}-` +
              `${match[1].slice(6, 8)}`;

            const time =
              `${match[2].slice(0, 2)}:` +
              `${match[2].slice(2, 4)}:` +
              `${match[2].slice(4, 6)}`;

            timestamp =
              `${date} ${time}`;
          }

          const size =
            fileInfo.exists && 'size' in fileInfo
              ? (fileInfo as any).size
              : 0;

          return {
            name: fileName,
            path: filePath,
            size,
            timestamp,
          };
        })
      );

    return fileDetails.sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );
  } catch (error) {
    console.error(
      'Error listing backups:',
      error
    );

    return [];
  }
}

/**
 * Restore database from a backup file
 *
 * WARNING:
 * This replaces the current database data
 * with the data contained in the backup.
 */
export async function restoreDatabaseBackup(
  filePath: string
): Promise<{
  success: boolean;
  message: string;
  tablesRestored?: number;
  error?: string;
}> {
  try {
    // --------------------------------------------------
    // 1. Check backup file
    // --------------------------------------------------

    const fileInfo =
      await FileSystem.getInfoAsync(filePath);

    if (!fileInfo.exists) {
      throw new Error(
        'Backup file could not be found'
      );
    }

    // --------------------------------------------------
    // 2. Read backup
    // --------------------------------------------------

    const fileContent =
      await FileSystem.readAsStringAsync(
        filePath,
        {
          encoding:
            FileSystem.EncodingType.UTF8,
        }
      );

    if (!fileContent.trim()) {
      throw new Error(
        'Backup file is empty'
      );
    }

    // --------------------------------------------------
    // 3. Parse JSON
    // --------------------------------------------------

    let backup: BackupData;

    try {
      backup =
        JSON.parse(fileContent) as BackupData;
    } catch {
      throw new Error(
        'Backup file contains invalid JSON data'
      );
    }

    // --------------------------------------------------
    // 4. Validate backup
    // --------------------------------------------------

    if (
      !backup ||
      typeof backup !== 'object' ||
      !backup.version ||
      !backup.timestamp ||
      backup.appName !== 'Ebadsave-VSLA'
    ) {
      throw new Error(
        'Invalid Ebadsave VSLA backup file'
      );
    }

    // --------------------------------------------------
    // 5. Open database
    // --------------------------------------------------

    const db =
      await SQLite.openDatabaseAsync(
        'ebadsave_vsla.db'
      );

    let tablesRestored = 0;

    // --------------------------------------------------
    // 6. Determine which tables actually exist
    // --------------------------------------------------

    const existingTables =
      await db.getAllAsync<{
        name: string;
      }>(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'`
      );

    const existingTableNames =
      new Set(
        existingTables.map(
          (table) => table.name
        )
      );

    // --------------------------------------------------
    // 7. Restore everything in one transaction
    // --------------------------------------------------

    await db.withTransactionAsync(
      async () => {
        /*
         * Foreign keys can prevent clearing/restoring
         * related tables in arbitrary order.
         *
         * Disable them while the restore is taking place.
         */
        await db.execAsync(
          'PRAGMA foreign_keys = OFF;'
        );

        // ------------------------------------------------
        // First clear existing data
        // ------------------------------------------------

        for (const table of BACKUP_TABLES) {
          if (
            !existingTableNames.has(table)
          ) {
            continue;
          }

          try {
            await db.runAsync(
              `DELETE FROM "${table}"`
            );
          } catch (error) {
            throw new Error(
              `Could not clear table "${table}". ` +
              `${
                error instanceof Error
                  ? error.message
                  : ''
              }`
            );
          }
        }

        // ------------------------------------------------
        // Then restore backup data
        // ------------------------------------------------

        for (const table of BACKUP_TABLES) {
          if (
            !existingTableNames.has(table)
          ) {
            continue;
          }

          const rows = backup[table];

          /*
           * If the backup does not contain this table,
           * leave it empty.
           */
          if (!Array.isArray(rows)) {
            continue;
          }

          /*
           * Empty table is still considered restored.
           */
          if (rows.length === 0) {
            tablesRestored++;
            continue;
          }

          const firstRow = rows[0];

          if (
            !firstRow ||
            typeof firstRow !== 'object'
          ) {
            throw new Error(
              `Invalid row data in table "${table}"`
            );
          }

          const columns =
            Object.keys(firstRow);

          if (columns.length === 0) {
            tablesRestored++;
            continue;
          }

          /*
           * Safely quote column names.
           */
          const columnList =
            columns
              .map(
                (column) =>
                  `"${column.replace(
                    /"/g,
                    '""'
                  )}"`
              )
              .join(', ');

          const placeholders =
            columns
              .map(() => '?')
              .join(', ');

          // ----------------------------------------------
          // Insert every row
          // ----------------------------------------------

          for (const row of rows) {
            if (
              !row ||
              typeof row !== 'object'
            ) {
              throw new Error(
                `Invalid row in table "${table}"`
              );
            }

            const values =
              columns.map(
                (column) =>
                  row[column] ?? null
              );

            await db.runAsync(
              `INSERT INTO "${table}" (${columnList})
               VALUES (${placeholders})`,
              ...values
            );
          }

          tablesRestored++;
        }

        /*
         * Turn foreign-key checking back on.
         */
        await db.execAsync(
          'PRAGMA foreign_keys = ON;'
        );
      }
    );

    // --------------------------------------------------
    // 8. Success
    // --------------------------------------------------

    return {
      success: true,
      message:
        `Backup restored successfully. ` +
        `${tablesRestored} tables restored.`,
      tablesRestored,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error during restore';

    console.error(
      'Database restore failed:',
      error
    );

    return {
      success: false,
      message:
        'Backup restore failed',
      error: errorMessage,
    };
  }
}

/**
 * Delete a backup file
 */
export async function deleteBackupFile(
  filePath: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    await FileSystem.deleteAsync(
      filePath,
      {
        idempotent: true,
      }
    );

    return {
      success: true,
      message:
        'Backup file deleted successfully',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error';

    return {
      success: false,
      message:
        'Failed to delete backup file',
      error: errorMessage,
    };
  }
}

/**
 * Get human-readable file size
 */
export function formatFileSize(
  bytes: number
): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;

  const sizes = [
    'Bytes',
    'KB',
    'MB',
    'GB',
  ];

  const i = Math.floor(
    Math.log(bytes) / Math.log(k)
  );

  return (
    Math.round(
      (bytes / Math.pow(k, i)) * 100
    ) / 100 +
    ' ' +
    sizes[i]
  );
  }
