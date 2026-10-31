/**
 * Cloud backup scheduling is disabled while backups are migrated to Cloudflare.
 * Local backup/export/import remains available in BackupRestoreScreen.
 * Keep these no-op exports because App.tsx imports this module during startup.
 */
export const EBADSAVE_BACKUP_TASK = 'ebadsave-automatic-cloud-backup';

export async function registerAutomaticBackupTask(): Promise<void> {
  return;
}

export async function unregisterAutomaticBackupTask(): Promise<void> {
  return;
}

export async function initializeAutomaticBackupTask(): Promise<void> {
  return;
}
