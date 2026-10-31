/**
 * Legacy duplicate background-task module retained for path compatibility.
 * Automatic cloud scheduling is disabled during the Back4App-to-Cloudflare
 * backup migration. Local backup functions are not affected.
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
