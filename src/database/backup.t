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
 * Saves to device Documents directory
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

    // Export all tables
    for (const table of BACKUP_TABLES) {
      try {
        const rows = await db.getAllAsync(`SELECT * FROM ${table}`);
        backup[table] = rows || [];
      } catch (error) {
        // Table might not exist yet, skip it
        backup[table] = [];
      }
    }

    // Generate filename with timestamp
    const dateStr = new Date()
      .toISOString()
      .split('T')[0]
      .replace(/-/g, '');
    const timeStr = new Date()
      .toISOString()
      .split('T')[1]
      .split('.')[0]
      .replace(/:/g, '');
    const fileName = `ebadsave_backup_${dateStr}_${timeStr}.json`;

    // Determine save path - try Documents first, fallback to app cache
    let filePath: string;
    const documentsDir =
      FileSystem.documentDirectory || FileSystem.cacheDirectory;

    if (!documentsDir) {
      throw new Error(
        'Could not access device storage directories'
      );
    }

    filePath = `${documentsDir}${fileName}`;

    // Write backup file
    const jsonContent = JSON.stringify(backup, null, 2);
    await FileSystem.writeAsStringAsync(filePath, jsonContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return {
      success: true,
      message: `Backup created successfully on ${new Date(backup.timestamp).toLocaleString()}`,
      filePath,
      fileName,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during backup';

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
    const isAvailable = await MailComposer.isAvailableAsync();

    if (!isAvailable) {
      return {
        success: false,
        message:
          'Email is not available on this device',
        error: 'EMAIL_NOT_AVAILABLE',
      };
    }

    // Get file size for display
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    const fileSize = fileInfo.exists && 'size' in fileInfo 
      ? formatFileSize((fileInfo as any).size) 
      : 'unknown';

    const result = await MailComposer.composeAsync({
      subject: `Ebadsave VSLA Backup - ${new Date().toLocaleDateString()}`,
      body: `Dear User,\n\nPlease find attached your Ebadsave VSLA data backup.\n\nBackup Details:\n- File: ${fileName}\n- Size: ${fileSize}\n- Date: ${new Date().toLocaleString()}\n\nTo restore this backup after reinstalling the app:\n1. Open the app\n2. Go to Settings > Data Management\n3. Select "Restore Backup"\n4. Choose this backup file\n\nKeep this email safe for future reference.\n\nBest regards,\nEbadsave VSLA`,
      attachments: [filePath],
    });

    if (result.status === 'sent') {
      return {
        success: true,
        message: 'Backup sent via email successfully',
      };
    } else if (result.status === 'saved') {
      return {
        success: true,
        message: 'Backup email saved as draft',
      };
    } else {
      return {
        success: false,
        message: 'Email was not sent',
        error: result.status,
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during email';

    return {
      success: false,
      message: 'Failed to send backup via email',
      error: errorMessage,
    };
  }
}

/**
 * List all available backup files in Documents directory
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
      FileSystem.documentDirectory || FileSystem.cacheDirectory;

    if (!documentsDir) {
      return [];
    }

    const files = await FileSystem.readDirectoryAsync(documentsDir);
    const backupFiles = files.filter((file) =>
      file.startsWith('ebadsave_backup_')
    );

    const fileDetails = await Promise.all(
      backupFiles.map(async (fileName) => {
        const filePath = `${documentsDir}${fileName}`;
        const fileInfo =
          await FileSystem.getInfoAsync(filePath);

        // Extract timestamp from filename
        const match = fileName.match(
          /ebadsave_backup_(\d{8})_(\d{6})/
        );
        let timestamp = 'Unknown';

        if (match) {
          const date = `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`;
          const time = `${match[2].slice(0, 2)}:${match[2].slice(2, 4)}:${match[2].slice(4, 6)}`;
          timestamp = `${date} ${time}`;
        }

        const size = fileInfo.exists && 'size' in fileInfo 
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

    // Sort by timestamp descending (newest first)
    return fileDetails.sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );
  } catch (error) {
    console.error('Error listing backup files:', error);
    return [];
  }
}

/**
 * Restore database from a backup file
 * WARNING: This will overwrite all existing data
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
    // Read backup file
    const fileContent = await FileSystem.readAsStringAsync(
      filePath,
      {
        encoding: FileSystem.EncodingType.UTF8,
      }
    );

    const backup = JSON.parse(fileContent) as BackupData;

    // Validate backup structure
    if (
      !backup.version ||
      !backup.timestamp ||
      backup.appName !== 'Ebadsave-VSLA'
    ) {
      throw new Error('Invalid backup file format');
    }

    const db = await SQLite.openDatabaseAsync(
      'ebadsave_vsla.db'
    );

    let tablesRestored = 0;

    // Process each table
    for (const table of BACKUP_TABLES) {
      const rows = backup[table] || [];

      if (!Array.isArray(rows) || rows.length === 0) {
        continue;
      }

      try {
        // Clear existing data
        await db.runAsync(`DELETE FROM ${table}`);

        // Get column names from first row
        const columns = Object.keys(rows[0]);
        const placeholders = columns
          .map(() => '?')
          .join(', ');
        const columnList = columns.join(', ');

        // Insert restored data
        for (const row of rows) {
          const values = columns.map((col) => row[col]);

          await db.runAsync(
            `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`,
            ...values
          );
        }

        tablesRestored++;
      } catch (tableError) {
        console.warn(
          `Warning: Could not restore table ${table}:`,
          tableError
        );
        // Continue with next table
      }
    }

    return {
      success: true,
      message: `Backup restored successfully. ${tablesRestored} tables recovered.`,
      tablesRestored,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during restore';

    return {
      success: false,
      message: 'Backup restore failed',
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
    await FileSystem.deleteAsync(filePath, {
      idempotent: true,
    });

    return {
      success: true,
      message: 'Backup file deleted successfully',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return {
      success: false,
      message: 'Failed to delete backup file',
      error: errorMessage,
    };
  }
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
