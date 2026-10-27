/**
 * Ebadsave VSLA background encrypted cloud backup.
 * Import from App.tsx at module scope so the task is defined before background launch.
 * Six hours is a minimum interval, not an exact execution time; Android/iOS decide.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import {
  getAutomaticCloudBackupConsent,
  runAutomaticCloudBackup,
} from '../database/backup';

export const EBADSAVE_BACKUP_TASK = 'ebadsave-automatic-cloud-backup';
const MINIMUM_INTERVAL_MINUTES = 6 * 60;

if (!TaskManager.isTaskDefined(EBADSAVE_BACKUP_TASK)) {
  TaskManager.defineTask(EBADSAVE_BACKUP_TASK, async () => {
    try {
      if (!(await getAutomaticCloudBackupConsent())) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }
      const result = await runAutomaticCloudBackup(false);
      return result.success || result.skipped
        ? BackgroundTask.BackgroundTaskResult.Success
        : BackgroundTask.BackgroundTaskResult.Failed;
    } catch (error) {
      console.error('Ebadsave background backup failed:', error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerAutomaticBackupTask(): Promise<void> {
  if (!(await getAutomaticCloudBackupConsent())) {
    throw new Error('Enable automatic cloud backup consent first.');
  }
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    throw new Error('Background tasks are unavailable in this app build.');
  }
  const registered = await TaskManager.isTaskRegisteredAsync(EBADSAVE_BACKUP_TASK);
  if (!registered) {
    await BackgroundTask.registerTaskAsync(EBADSAVE_BACKUP_TASK, {
      minimumInterval: MINIMUM_INTERVAL_MINUTES,
    });
  }
}

export async function unregisterAutomaticBackupTask(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(EBADSAVE_BACKUP_TASK)) {
    await BackgroundTask.unregisterTaskAsync(EBADSAVE_BACKUP_TASK);
  }
}

export async function initializeAutomaticBackupTask(): Promise<void> {
  if (await getAutomaticCloudBackupConsent()) {
    await registerAutomaticBackupTask();
  } else {
    await unregisterAutomaticBackupTask();
  }
}
