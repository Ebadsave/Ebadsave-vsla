import * as FileSystem from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import {
  createDatabaseBackup as createDatabaseBackupPayload,
  restoreDatabaseBackup as restoreDatabaseFromPayload,
} from './database';

/**
 * This list mirrors the canonical SQLite backup schema in database.ts.
 * Requiring every table prevents an incomplete/old backup from silently
 * clearing records that the backup never contained.
 */
const REQUIRED_BACKUP_TABLES = [
  'groups',
  'group_registration_attempts',
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
  'app_access_sessions',
  'app_access_authorizers',
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
  'sync_queue',
  'member_passbook_records',
  'member_statement_records',
  'loan_interest_charges',
] as const;

export interface BackupData {
  version: 1;
  created_at: string;
  tables: Record<string, unknown[]>;
}

function validateBackupPayload(raw: string): BackupData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('The backup file is not valid JSON.');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as any).version !== 1 ||
    typeof (parsed as any).created_at !== 'string' ||
    !Number.isFinite(Date.parse((parsed as any).created_at)) ||
    !(parsed as any).tables ||
    typeof (parsed as any).tables !== 'object' ||
    Array.isArray((parsed as any).tables)
  ) {
    throw new Error(
      'This is not a valid Ebadsave VSLA backup. No data was changed.',
    );
  }

  const tables = (parsed as any).tables as Record<string, unknown>;
  const missingTables = REQUIRED_BACKUP_TABLES.filter(
    (table) => !Array.isArray(tables[table]),
  );

  if (missingTables.length > 0) {
    throw new Error(
      'This backup is incomplete and cannot safely replace your database. ' +
        `Missing tables: ${missingTables.join(', ')}. No data was changed.`,
    );
  }

  for (const table of REQUIRED_BACKUP_TABLES) {
    const rows = tables[table] as unknown[];
    if (
      !rows.every(
        (row) => row !== null && typeof row === 'object' && !Array.isArray(row),
      )
    ) {
      throw new Error(
        `The backup contains invalid row data in "${table}". No data was changed.`,
      );
    }
  }

  return parsed as BackupData;
}

/** Export the app's actual SQLite database into a verified JSON file. */
export async function exportDatabaseBackup(): Promise<{
  success: boolean;
  message: string;
  filePath?: string;
  fileName?: string;
  error?: string;
}> {
  try {
    const documentsDir =
      FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!documentsDir) {
      throw new Error('Device storage is not available for backups.');
    }

    const payload = await createDatabaseBackupPayload();
    validateBackupPayload(payload);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const fileName = `ebadsave_backup_${dateStr}_${timeStr}.json`;
    const filePath = `${documentsDir}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, payload, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Read the file back and validate it; success is only reported after this.
    const savedContent = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    validateBackupPayload(savedContent);

    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (!fileInfo.exists || !('size' in fileInfo) || fileInfo.size <= 0) {
      throw new Error('The backup file could not be verified after saving.');
    }

    return {
      success: true,
      message: `Backup created and verified at ${new Date().toLocaleString()}.`,
      filePath,
      fileName,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Backup failed',
      error: error instanceof Error ? error.message : 'Unknown backup error.',
    };
  }
}

/** Send a verified backup file via the device's email composer. */
export async function emailBackupFile(
  filePath: string,
  fileName: string,
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists || !('size' in info) || info.size <= 0) {
      throw new Error('The backup file does not exist or is empty.');
    }

    if (!(await MailComposer.isAvailableAsync())) {
      return {
        success: false,
        message: 'Email is not available on this device.',
        error: 'EMAIL_NOT_AVAILABLE',
      };
    }

    const result = await MailComposer.composeAsync({
      subject: `Ebadsave VSLA Backup - ${new Date().toLocaleDateString()}`,
      body:
        'Attached is your Ebadsave VSLA database backup. Keep this file in a safe place. ' +
        'It contains sensitive group and financial records.',
      attachments: [filePath],
    });

    if (result.status === 'sent' || result.status === 'saved') {
      return {
        success: true,
        message:
          result.status === 'sent'
            ? `Backup ${fileName} was sent.`
            : `A draft containing ${fileName} was saved.`,
      };
    }

    return { success: false, message: 'Email was not sent.', error: result.status };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to send backup via email.',
      error: error instanceof Error ? error.message : 'Unknown email error.',
    };
  }
}

export async function listBackupFiles(): Promise<
  Array<{ name: string; path: string; size: number; timestamp: string }>
> {
  const documentsDir =
    FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!documentsDir) return [];

  try {
    const files = await FileSystem.readDirectoryAsync(documentsDir);
    const matching = files.filter((name) => /^ebadsave_backup_\d{8}_\d{6}\.json$/.test(name));
    const details = await Promise.all(
      matching.map(async (name) => {
        const path = `${documentsDir}${name}`;
        const info = await FileSystem.getInfoAsync(path);
        const match = name.match(/^ebadsave_backup_(\d{8})_(\d{6})\.json$/);
        let timestamp = 'Unknown';
        if (match) {
          timestamp = `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)} ${match[2].slice(0, 2)}:${match[2].slice(2, 4)}:${match[2].slice(4, 6)}`;
        }
        return {
          name,
          path,
          size: info.exists && 'size' in info ? info.size : 0,
          timestamp,
        };
      }),
    );
    return details.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}

/** Restore only a complete, validated canonical backup. */
export async function restoreDatabaseBackup(
  filePath: string,
): Promise<{
  success: boolean;
  message: string;
  tablesRestored?: number;
  error?: string;
}> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists || !('size' in info) || info.size <= 0) {
      throw new Error('The backup file could not be found or is empty.');
    }

    const content = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const validated = validateBackupPayload(content);

    // Database-level restore owns the transaction and table order.
    await restoreDatabaseFromPayload(JSON.stringify(validated));

    return {
      success: true,
      message: 'Backup restored successfully. Your database was restored from the verified file.',
      tablesRestored: REQUIRED_BACKUP_TABLES.length,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Backup restore failed. Existing data was not intentionally cleared.',
      error: error instanceof Error ? error.message : 'Unknown restore error.',
    };
  }
}

export async function deleteBackupFile(
  filePath: string,
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    await FileSystem.deleteAsync(filePath, { idempotent: true });
    return { success: true, message: 'Backup file deleted successfully.' };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to delete backup file.',
      error: error instanceof Error ? error.message : 'Unknown delete error.',
    };
  }
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Bytes';
  const units = ['Bytes', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = Math.round((bytes / 1024 ** exponent) * 100) / 100;
  return `${value} ${units[exponent]}`;
}
