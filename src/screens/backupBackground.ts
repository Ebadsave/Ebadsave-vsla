import * as BackgroundTask from 'expo-background-task';
import * as Network from 'expo-network';
import * as TaskManager from 'expo-task-manager';
import { runAutomaticCloudBackup, getAutomaticCloudBackupConsent } from '../database/backup';

export const EBADSAVE_BACKUP_TASK = 'ebadsave-automatic-cloud-backup';
const SIX_HOURS_IN_MINUTES = 6 * 60;

if (!TaskManager.isTaskDefined(EBADSAVE_BACKUP_TASK)) {
  TaskManager.defineTask(EBADSAVE_BACKUP_TASK, async () => {
    const result = await runAutomaticCloudBackup();
    return result.success
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  });
}

let networkSubscription: { remove: () => void } | null = null;

export async function registerAutomaticBackupTask(): Promise<void> {
  const consent = await getAutomaticCloudBackupConsent();
  if (!consent) throw new Error('Enable automatic cloud backup consent first.');

  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    throw new Error('Background tasks are unavailable on this device.');
  }

  const registered = await TaskManager.isTaskRegisteredAsync(EBADSAVE_BACKUP_TASK);
  if (registered) await BackgroundTask.unregisterTaskAsync(EBADSAVE_BACKUP_TASK);
  await BackgroundTask.registerTaskAsync(EBADSAVE_BACKUP_TASK, {
    minimumInterval: SIX_HOURS_IN_MINUTES,
  });
}

export async function unregisterAutomaticBackupTask(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(EBADSAVE_BACKUP_TASK);
  if (registered) await BackgroundTask.unregisterTaskAsync(EBADSAVE_BACKUP_TASK);
  networkSubscription?.remove();
  networkSubscription = null;
}

export async function initializeAutomaticBackupTask(): Promise<void> {
  if (!(await getAutomaticCloudBackupConsent())) return;
  await registerAutomaticBackupTask();

  networkSubscription?.remove();
  networkSubscription = Network.addNetworkStateListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      void runAutomaticCloudBackup();
    }
  });
}
