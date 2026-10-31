/**
 * Automatic cloud backup scheduling is intentionally disabled during the
 * Remote automatic uploads are disabled. Local backup/export/import functions remain available.
 * These no-op exports keep the existing App.tsx bootstrap import compatible.
 */
export const EBADSAVE_BACKUP_TASK = 'ebadsave-automatic-cloud-backup';
export async function registerAutomaticBackupTask(): Promise<void> { return; }
export async function unregisterAutomaticBackupTask(): Promise<void> { return; }
export async function initializeAutomaticBackupTask(): Promise<void> { return; }
