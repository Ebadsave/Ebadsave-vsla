import * as FileSystem from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import {
  createDatabaseBackup,
  restoreDatabaseBackup as restoreDatabaseBackupJson,
} from './database';

/**
 * Core backup tables needed for restoring previous app releases. Newer optional
 * tables are restored when present, while older valid backups stay compatible.
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

export interface BackupFileInfo {
  name: string;
  path: string;
  size: number;
  timestamp: string;
}

interface BackupEnvelope {
  version: 1;
  created_at: string;
  tables: Record<string, unknown[]>;
}

function getDocumentsDirectory(): string {
  const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error('Device storage is unavailable. The backup was not saved.');
  }
  return directory;
}

function parseAndValidateBackup(contents: string): BackupEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('The selected backup is not valid JSON. No data was changed.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup structure. No data was changed.');
  }
  const backup = parsed as Partial<BackupEnvelope>;
  if (backup.version !== 1 || typeof backup.created_at !== 'string' || !backup.tables || typeof backup.tables !== 'object') {
    throw new Error('This is not a supported Ebadsave VSLA backup. No data was changed.');
  }

  const missing = REQUIRED_BACKUP_TABLES.filter((table) => !Array.isArray(backup.tables?.[table]));
  if (missing.length) {
    throw new Error(
      `The backup is incomplete. Missing or invalid tables: ${missing.join(', ')}. No data was changed.`,
    );
  }

  return backup as BackupEnvelope;
}

/** Create a JSON backup using the app's shared SQLite database connection, then read it back and verify it. */
export async function exportDatabaseBackup(): Promise<{
  success: boolean;
  message: string;
  filePath?: string;
  fileName?: string;
  error?: string;
}> {
  try {
    const json = await createDatabaseBackup();
    // Validate the serialized database snapshot before writing it to storage.
    parseAndValidateBackup(json);

    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const fileName = `ebadsave_backup_${stamp}.json`;
    const filePath = `${getDocumentsDirectory()}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists || !('size' in info) || Number(info.size) <= 0) {
      throw new Error('The backup file could not be verified after saving.');
    }

    const savedContents = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    parseAndValidateBackup(savedContents);

    return {
      success: true,
      message: `Verified database backup created at ${now.toLocaleString()}.`,
      filePath,
      fileName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown backup error.';
    return { success: false, message: 'Backup failed.', error: message };
  }
}

export async function emailBackupFile(filePath: string, fileName: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      return { success: false, message: 'Email is not available on this device.', error: 'EMAIL_NOT_AVAILABLE' };
    }
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) {
      return { success: false, message: 'The backup file could not be found.', error: 'BACKUP_NOT_FOUND' };
    }

    const result = await MailComposer.composeAsync({
      subject: `Ebadsave VSLA Backup - ${new Date().toLocaleDateString()}`,
      body: `Please find attached your Ebadsave VSLA backup.\n\nFile: ${fileName}\nCreated: ${new Date().toLocaleString()}\n\nKeep this file safe. Restoring a backup replaces current records with the records in that backup.`,
      attachments: [filePath],
    });

    if (result.status === 'sent') return { success: true, message: 'Backup email sent.' };
    if (result.status === 'saved') return { success: true, message: 'Backup email saved as a draft.' };
    return { success: false, message: 'Email was not sent.', error: result.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error.';
    return { success: false, message: 'Could not email the backup.', error: message };
  }
}

export async function listBackupFiles(): Promise<BackupFileInfo[]> {
  try {
    const directory = getDocumentsDirectory();
    const names = await FileSystem.readDirectoryAsync(directory);
    const backups = names.filter((name) => name.startsWith('ebadsave_backup_') && name.endsWith('.json'));
    const details = await Promise.all(backups.map(async (name) => {
      const path = `${directory}${name}`;
      const info = await FileSystem.getInfoAsync(path);
      let timestamp = 'Unknown';
      try {
        const content = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
        const parsed = JSON.parse(content) as { created_at?: string };
        if (parsed.created_at) timestamp = new Date(parsed.created_at).toLocaleString();
      } catch {
        // Keep the file visible so the user can identify/remove an invalid backup.
      }
      return { name, path, size: info.exists && 'size' in info ? Number(info.size) : 0, timestamp };
    }));
    return details.sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

/** Validate the entire backup before calling the existing transactional database restore. */
export async function restoreDatabaseBackup(filePath: string): Promise<{
  success: boolean;
  message: string;
  tablesRestored?: number;
  error?: string;
}> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) throw new Error('The selected backup file does not exist.');
    const contents = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
    if (!contents.trim()) throw new Error('The selected backup file is empty. No data was changed.');

    const validated = parseAndValidateBackup(contents);
    // Re-serialize the validated object to avoid passing unvalidated file content onward.
    await restoreDatabaseBackupJson(JSON.stringify(validated));
    return {
      success: true,
      message: `Backup restored successfully (${REQUIRED_BACKUP_TABLES.length} required tables validated).`,
      tablesRestored: REQUIRED_BACKUP_TABLES.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown restore error.';
    return { success: false, message: 'Backup restore failed.', error: message };
  }
}

export async function deleteBackupFile(filePath: string): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) return { success: false, message: 'Backup file not found.' };
    await FileSystem.deleteAsync(filePath, { idempotent: false });
    return { success: true, message: 'Backup file deleted.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown deletion error.';
    return { success: false, message: 'Could not delete backup file.', error: message };
  }
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
