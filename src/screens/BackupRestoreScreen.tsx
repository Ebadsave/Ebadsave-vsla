import React, { useCallback, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import {
  getAutomaticCloudBackupConsent,
  setAutomaticCloudBackupConsent,
  saveAutomaticCloudBackupPassphrase,
  runAutomaticCloudBackup,
  exportDatabaseBackup,
  emailBackupFile,
  listBackupFiles,
  restoreDatabaseBackup,
  deleteBackupFile,
  formatFileSize,
} from '../database/backup';

import {
  getAllGroups,
  type GroupRecord,
} from '../database/database';

import {
  getCloudflareSessionGroupId,
} from '../services/cloudflareApi';

import {
  exportGroupDatabaseBackup,
  uploadGroupDatabaseBackupToCloud,
  listCloudGroupBackups,
  restoreCloudGroupDatabaseBackup,
  signInCloudflareBackupAdmin,
  signOutCloudflareBackupAdmin,
  type CloudBackupFileInfo,
} from './backup';

interface BackupFile {
  name: string;
  path: string;
  size: number;
  timestamp: string;
}

/**
 * Normalize group numbers from SQLite.
 * Supports:
 * 2010
 * "2010"
 * "KYA 2010"
 * "KYA2010"
 */
function normalizeGroupNumber(
  value: string | number | null | undefined,
): string {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Extract the KYA group number from the authenticated
 * Cloudflare group ID.
 *
 * Example:
 * kya-2010 -> 2010
 */
function getCloudflareGroupNumber(
  groupId: string | null,
): string | null {
  const match = groupId?.match(/(\d{4})$/);

  return match?.[1] ?? null;
}

export default function BackupRestoreScreen() {
  const navigation = useNavigation<any>();

  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);

  const [cloudBackupConsent, setCloudBackupConsent] =
    useState<boolean | null>(null);

  const [changingConsent, setChangingConsent] = useState(false);

  const [cloudBackupStatus, setCloudBackupStatus] = useState(
    'Checking automatic cloud backup status…',
  );

  const [groups, setGroups] = useState<GroupRecord[]>([]);

  const [selectedGroupId, setSelectedGroupId] =
    useState<number | null>(null);

  const [groupNumberInput, setGroupNumberInput] = useState('');

  const [recoveryPassphrase, setRecoveryPassphrase] = useState('');

  const [cloudGroupBackups, setCloudGroupBackups] =
    useState<CloudBackupFileInfo[]>([]);

  const [groupCloudBusy, setGroupCloudBusy] = useState(false);

  const [cloudAdminName, setCloudAdminName] = useState('');
  const [cloudAdminMemberNumber, setCloudAdminMemberNumber] = useState('');
  const [cloudAdminPin, setCloudAdminPin] = useState('');

  const [showCloudAdminPin, setShowCloudAdminPin] = useState(false);

  const [cloudAdminSignedIn, setCloudAdminSignedIn] = useState(false);

  // =========================================================
  // LOAD AUTOMATIC BACKUP CONSENT
  // =========================================================

  const loadConsent = useCallback(async () => {
    try {
      const enabled = await getAutomaticCloudBackupConsent();

      setCloudBackupConsent(enabled);

      setCloudBackupStatus(
        enabled
          ? 'Consent is enabled. Automatic encrypted cloud uploads are allowed; backups may run approximately every 6 hours when Android/iOS allows them.'
          : 'Automatic cloud backup is off because consent is disabled. Local backups remain available.',
      );
    } catch (error) {
      console.error(
        'Could not load automatic cloud backup setting:',
        error,
      );

      setCloudBackupStatus(
        'Unable to verify the automatic cloud backup setting. Please reopen this screen.',
      );
    }
  }, []);

  // =========================================================
  // LOAD AND MATCH LOCAL GROUPS WITH CLOUDFLARE
  // =========================================================

  const loadGroups = useCallback(async () => {
    try {
      const result = await getAllGroups();

      setGroups(result);

      // Check the authenticated Cloudflare administrator's group.
      const cloudGroupId = await getCloudflareSessionGroupId();

      if (cloudGroupId) {
        const cloudNumber =
          getCloudflareGroupNumber(cloudGroupId);

        if (!cloudNumber) {
          setSelectedGroupId(null);

          console.error(
            'Could not extract group number from Cloudflare group ID:',
            cloudGroupId,
          );

          return;
        }

        // Find the matching group in local SQLite.
        const matchingGroup = result.find(
          group =>
            normalizeGroupNumber(group.group_number) === cloudNumber,
        );

        if (matchingGroup) {
          setSelectedGroupId(matchingGroup.id);

          console.log(
            'Cloudflare group matched with local SQLite group:',
            matchingGroup.id,
            cloudNumber,
          );
        } else {
          setSelectedGroupId(null);

          console.warn(
            `Cloudflare group KYA ${cloudNumber} was not found in local SQLite.`,
          );
        }

        return;
      }

      // If not signed in, preserve the existing local selection.
      setSelectedGroupId(current =>
        current !== null &&
        result.some(group => group.id === current)
          ? current
          : result[0]?.id ?? null,
      );

    } catch (error) {
      console.error(
        'Could not load groups for group backup:',
        error,
      );

      setGroups([]);
      setSelectedGroupId(null);
    }
  }, []);

  // =========================================================
  // CLOUDFLARE ADMINISTRATOR SIGN IN
  // =========================================================

  const handleCloudflareAdminSignIn = async () => {
    try {
      setGroupCloudBusy(true);

      await signInCloudflareBackupAdmin(
        cloudAdminName,
        cloudAdminMemberNumber,
        cloudAdminPin,
      );

      // Refresh local groups using the authenticated group ID.
      await loadGroups();

      setCloudAdminPin('');
      setCloudAdminSignedIn(true);

      setCloudGroupBackups([]);

      Alert.alert(
        'Cloudflare Connected',
        'Group administrator authenticated successfully. The app has checked for the matching local group.',
      );

    } catch (error) {
      Alert.alert(
        'Cloudflare Sign-in Failed',
        error instanceof Error
          ? error.message
          : 'Sign-in failed.',
      );
    } finally {
      setGroupCloudBusy(false);
    }
  };

  // =========================================================
  // CLOUDFLARE ADMINISTRATOR SIGN OUT
  // =========================================================

  const handleCloudflareAdminSignOut = async () => {
    try {
      setGroupCloudBusy(true);

      await signOutCloudflareBackupAdmin();

      setCloudAdminSignedIn(false);
      setCloudGroupBackups([]);

      await loadGroups();

      Alert.alert(
        'Signed Out',
        'Cloudflare administrator signed out successfully.',
      );

    } catch (error) {
      Alert.alert(
        'Sign Out Failed',
        error instanceof Error
          ? error.message
          : 'Could not sign out.',
      );
    } finally {
      setGroupCloudBusy(false);
    }
  };

  // =========================================================
  // CREATE ENCRYPTED GROUP CLOUD BACKUP
  // =========================================================

  const handleUploadGroupBackup = async () => {
    if (!cloudAdminSignedIn) {
      Alert.alert(
        'Administrator Sign-in Required',
        'Sign in with the group administrator member number and PIN first.',
      );
      return;
    }

    if (recoveryPassphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase Required',
        'Use a passphrase of at least 12 characters and keep it safe. You need it on another phone to decrypt the backup.',
      );
      return;
    }

    try {
      setGroupCloudBusy(true);

      // Always retrieve the latest local groups.
      const localGroups = await getAllGroups();

      setGroups(localGroups);

      // Retrieve the authenticated Cloudflare group.
      const cloudGroupId =
        await getCloudflareSessionGroupId();

      if (!cloudGroupId) {
        throw new Error(
          'Cloudflare group session is missing. Sign in again.',
        );
      }

      const cloudGroupNumber =
        getCloudflareGroupNumber(cloudGroupId);

      if (!cloudGroupNumber) {
        throw new Error(
          'Could not identify the authenticated Cloudflare group.',
        );
      }

      // Match the authenticated group against local SQLite.
      const matchingGroup = localGroups.find(
        group =>
          normalizeGroupNumber(group.group_number) === cloudGroupNumber,
      );

      if (!matchingGroup) {
        setSelectedGroupId(null);

        throw new Error(
          `Your Cloudflare administrator belongs to KYA ${cloudGroupNumber}, but this group was not found in this phone's local SQLite database.\n\n` +
          'Cloudflare registration does not automatically transfer local member and financial records.\n\n' +
          'No data was changed.',
        );
      }

      // Verify the selected group.
      const selectedGroup = localGroups.find(
        group => group.id === selectedGroupId,
      );

      if (
        selectedGroup &&
        selectedGroup.id !== matchingGroup.id
      ) {
        throw new Error(
          `The selected local group does not match your Cloudflare administrator account.\n\n` +
          `Please select KYA ${cloudGroupNumber}.`,
        );
      }

      // Automatically select the correct group.
      setSelectedGroupId(matchingGroup.id);

      // Verify that the local group exists and create its backup.
      const local = await exportGroupDatabaseBackup(
        matchingGroup.id,
      );

      if (!local.success) {
        throw new Error(
          local.error || local.message,
        );
      }

      // Encrypt and upload to the existing Cloudflare Worker/R2.
      const result = await uploadGroupDatabaseBackupToCloud(
        matchingGroup.id,
        recoveryPassphrase,
      );

      if (!result.success) {
        throw new Error(
          result.error || result.message,
        );
      }

      Alert.alert(
        'Group Backup Saved',
        `KYA ${cloudGroupNumber}\n\n${result.message}`,
      );

    } catch (error) {
      Alert.alert(
        'Group Backup Failed',
        error instanceof Error
          ? error.message
          : 'Could not upload group backup.',
      );
    } finally {
      setGroupCloudBusy(false);
    }
  };

  // =========================================================
  // FIND CLOUDFLARE GROUP BACKUPS
  // =========================================================

  const handleFindCloudGroupBackups = async () => {
    if (!cloudAdminSignedIn) {
      Alert.alert(
        'Administrator Sign-in Required',
        'Sign in with the group administrator first.',
      );
      return;
    }

    if (!groupNumberInput.trim()) {
      Alert.alert(
        'Group Number Required',
        'Enter the KYA group number, for example KYA2012.',
      );
      return;
    }

    if (recoveryPassphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase Required',
        'Enter the same cloud backup passphrase used when the backup was created.',
      );
      return;
    }

    try {
      setGroupCloudBusy(true);

      const result = await listCloudGroupBackups(
        recoveryPassphrase,
        groupNumberInput,
      );

      if (!result.success) {
        throw new Error(
          result.error || result.message,
        );
      }

      setCloudGroupBackups(result.backups);

      if (!result.backups.length) {
        Alert.alert(
          'No Cloud Backups',
          result.message,
        );
      }

    } catch (error) {
      Alert.alert(
        'Cloud Recovery',
        error instanceof Error
          ? error.message
          : 'Could not find backups.',
      );
    } finally {
      setGroupCloudBusy(false);
    }
  };

  // =========================================================
  // RESTORE CLOUDFLARE GROUP BACKUP
  // =========================================================

  const handleRestoreCloudGroup = (
    backup: CloudBackupFileInfo,
  ) => {
    Alert.alert(
      'Restore Group',
      `Restore ${groupNumberInput.trim()} from this encrypted cloud backup?\n\nThe local database must be empty; existing local records will be protected.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              setGroupCloudBusy(true);

              const result =
                await restoreCloudGroupDatabaseBackup(
                  backup,
                  recoveryPassphrase,
                  groupNumberInput,
                );

              if (!result.success) {
                throw new Error(
                  result.error || result.message,
                );
              }

              Alert.alert(
                'Group Restored',
                result.message,
              );

              await loadGroups();

            } catch (error) {
              Alert.alert(
                'Restore Stopped',
                error instanceof Error
                  ? error.message
                  : 'Could not restore this group.',
              );
            } finally {
              setGroupCloudBusy(false);
            }
          },
        },
      ],
    );
  };

  // =========================================================
  // LOAD LOCAL BACKUP FILES
  // =========================================================

  const loadBackupFiles = useCallback(async () => {
    try {
      setLoading(true);

      const files = await listBackupFiles();

      setBackupFiles(files);

    } catch (error) {
      console.error(
        'Error loading backups:',
        error,
      );

      Alert.alert(
        'Error',
        'Could not load backup files',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // =========================================================
  // SCREEN FOCUS
  // =========================================================

  useFocusEffect(
    useCallback(() => {
      void loadBackupFiles();
      void loadConsent();
      void loadGroups();
    }, [
      loadBackupFiles,
      loadConsent,
      loadGroups,
    ]),
  );

  // =========================================================
  // AUTOMATIC CLOUD BACKUP CONSENT
  // =========================================================

  const handleCloudBackupConsent = async () => {
    if (cloudBackupConsent === null) {
      return;
    }

    const nextValue = !cloudBackupConsent;

    try {
      setChangingConsent(true);

      if (nextValue) {
        if (!cloudAdminSignedIn) {
          throw new Error(
            'Sign in as the group administrator before enabling automatic backups.',
          );
        }

        if (selectedGroupId === null) {
          throw new Error(
            'Select the group to back up.',
          );
        }

        if (recoveryPassphrase.trim().length < 12) {
          throw new Error(
            'Enter a cloud backup passphrase of at least 12 characters first.',
          );
        }

        await saveAutomaticCloudBackupPassphrase(
          recoveryPassphrase,
        );
      }

      const saved =
        await setAutomaticCloudBackupConsent(nextValue);

      if (!saved.success) {
        throw new Error(saved.message);
      }

      if (nextValue) {
        setCloudBackupConsent(true);

        // Load optional native background-task modules only
        // when the user explicitly enables automatic backups.
        const {
          initializeAutomaticBackupTask,
        } = await import('../services/backupBackground');

        await initializeAutomaticBackupTask();

        setCloudBackupStatus(
          'Consent enabled. Starting the first encrypted cloud backup.',
        );

        const result =
          await runAutomaticCloudBackup(true);

        setCloudBackupStatus(result.message);

        if (!result.success && !result.skipped) {
          Alert.alert(
            'Cloud Backup Pending',
            result.error || result.message,
          );
        }

      } else {
        const {
          unregisterAutomaticBackupTask,
        } = await import('../services/backupBackground');

        await unregisterAutomaticBackupTask();

        setCloudBackupConsent(false);

        setCloudBackupStatus(
          'Automatic cloud uploads are disabled. Local backups remain available.',
        );
      }

    } catch (error) {
      if (nextValue) {
        await setAutomaticCloudBackupConsent(false).catch(
          () => undefined,
        );

        setCloudBackupConsent(false);
      }

      setCloudBackupStatus(
        'Could not update the automatic backup setting.',
      );

      Alert.alert(
        'Automatic Backup',
        error instanceof Error
          ? error.message
          : 'Could not update setting.',
      );
    } finally {
      setChangingConsent(false);
    }
  };

  // =========================================================
  // CREATE FULL LOCAL DATABASE BACKUP
  // =========================================================

  const handleExportBackup = async () => {
    try {
      setExporting(true);

      const result = await exportDatabaseBackup();

      if (!result.success) {
        Alert.alert(
          'Backup Failed',
          result.error || result.message,
        );
        return;
      }

      Alert.alert(
        'Backup Created',
        result.message,
        [
          {
            text: 'Send via Email',
            onPress: () => {
              if (result.filePath && result.fileName) {
                handleEmailBackup(
                  result.filePath,
                  result.fileName,
                );
              }
            },
          },
          {
            text: 'Done',
            onPress: () => loadBackupFiles(),
            style: 'cancel',
          },
        ],
      );

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error';

      Alert.alert('Error', message);

    } finally {
      setExporting(false);
    }
  };

  // =========================================================
  // EMAIL BACKUP
  // =========================================================

  const handleEmailBackup = async (
    filePath: string,
    fileName: string,
  ) => {
    try {
      const result = await emailBackupFile(
        filePath,
        fileName,
      );

      if (!result.success) {
        Alert.alert(
          'Email Failed',
          result.error || result.message,
        );
        return;
      }

      Alert.alert(
        'Email Sent',
        result.message,
        [
          {
            text: 'OK',
            onPress: () => loadBackupFiles(),
          },
        ],
      );

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error';

      Alert.alert('Error', message);
    }
  };

  // =========================================================
  // RESTORE LOCAL BACKUP
  // =========================================================

  const handleRestoreBackup = async (
    filePath: string,
  ) => {
    Alert.alert(
      'Restore Backup',
      'This will overwrite all current data. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            try {
              setRestoringFile(filePath);

              const result =
                await restoreDatabaseBackup(filePath);

              if (!result.success) {
                Alert.alert(
                  'Restore Failed',
                  result.error || result.message,
                );
                return;
              }

              Alert.alert(
                'Restore Complete',
                result.message,
                [
                  {
                    text: 'OK',
                    onPress: () => loadBackupFiles(),
                  },
                ],
              );

              await loadGroups();

            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : 'Unknown error';

              Alert.alert(
                'Restore Failed',
                message,
              );

            } finally {
              setRestoringFile(null);
            }
          },
        },
      ],
    );
  };

  // =========================================================
  // IMPORT BACKUP FILE
  // =========================================================

  const handlePickBackupFile = async () => {
    try {
      const result =
        await DocumentPicker.getDocumentAsync({
          type: 'application/json',
          copyToCacheDirectory: true,
          multiple: false,
        });

      if (result.canceled) {
        return;
      }

      const file = result.assets?.[0];

      if (!file?.uri) {
        Alert.alert(
          'Restore Failed',
          'No backup file was selected.',
        );
        return;
      }

      const fileName =
        file.name || 'Selected backup';

      Alert.alert(
        'Restore Backup',
        `Restore "${fileName}"?\n\nThis will overwrite all current data.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              try {
                setRestoringFile(file.uri);

                const restoreResult =
                  await restoreDatabaseBackup(file.uri);

                if (!restoreResult.success) {
                  Alert.alert(
                    'Restore Failed',
                    restoreResult.error ||
                      restoreResult.message,
                  );
                  return;
                }

                Alert.alert(
                  'Restore Complete',
                  restoreResult.message,
                  [
                    {
                      text: 'OK',
                      onPress: () => loadBackupFiles(),
                    },
                  ],
                );

                await loadGroups();

              } catch (error) {
                const message =
                  error instanceof Error
                    ? error.message
                    : 'Unknown error';

                Alert.alert(
                  'Restore Failed',
                  message,
                );

              } finally {
                setRestoringFile(null);
              }
            },
          },
        ],
      );

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not select backup file';

      Alert.alert(
        'Restore Failed',
        message,
      );
    }
  };

  // =========================================================
  // DELETE LOCAL BACKUP
  // =========================================================

  const handleDeleteBackup = async (
    filePath: string,
  ) => {
    Alert.alert(
      'Delete Backup',
      'This backup will be permanently deleted.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result =
                await deleteBackupFile(filePath);

              if (!result.success) {
                Alert.alert(
                  'Delete Failed',
                  result.error || result.message,
                );
                return;
              }

              await loadBackupFiles();

            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : 'Unknown error';

              Alert.alert('Error', message);
            }
          },
        },
      ],
    );
  };

  // =========================================================
  // USER INTERFACE
  // =========================================================

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >

      {/* HEADER */}

      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back to previous screen"
          style={styles.backButton}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              Alert.alert(
                'Navigation',
                'There is no previous screen to return to.',
              );
            }
          }}
        >
          <Text style={styles.backButtonText}>
            ‹  Back
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Data Backup & Restore
        </Text>

        <Text style={styles.subtitle}>
          Backup your data before uninstalling the app
        </Text>
      </View>

      {/* CLOUDFLARE ADMINISTRATOR */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Cloudflare Backup & Restore
        </Text>

        <TextInput
          value={cloudAdminName}
          onChangeText={setCloudAdminName}
          placeholder="Administrator full name"
          autoCapitalize="words"
          autoCorrect={false}
          editable={!cloudAdminSignedIn}
          style={styles.recoveryInput}
        />

        <TextInput
          value={cloudAdminMemberNumber}
          onChangeText={setCloudAdminMemberNumber}
          placeholder="Administrator member number (KYA2010001)"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!cloudAdminSignedIn}
          style={styles.recoveryInput}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 10,
          }}
        >
          <TextInput
            value={cloudAdminPin}
            onChangeText={setCloudAdminPin}
            placeholder="Administrator PIN"
            secureTextEntry={!showCloudAdminPin}
            keyboardType="number-pad"
            editable={!cloudAdminSignedIn}
            style={[
              styles.recoveryInput,
              {
                flex: 1,
                marginTop: 0,
                marginRight: 8,
              },
            ]}
            autoCapitalize="none"
          />

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              showCloudAdminPin
                ? 'Hide administrator PIN'
                : 'Show administrator PIN'
            }
            onPress={() =>
              setShowCloudAdminPin(visible => !visible)
            }
            style={styles.pinVisibilityButton}
          >
            <Text style={styles.pinVisibilityText}>
              {showCloudAdminPin ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            styles.primaryButton,
            groupCloudBusy && styles.disabledButton,
          ]}
          onPress={() =>
            void (
              cloudAdminSignedIn
                ? handleCloudflareAdminSignOut()
                : handleCloudflareAdminSignIn()
            )
          }
          disabled={groupCloudBusy}
        >
          <Text style={styles.buttonText}>
            {cloudAdminSignedIn
              ? 'Sign Out of Cloudflare'
              : 'Sign In as Group Administrator'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.bodyText}>
          Sign in as the group administrator to upload, list
          and restore encrypted group backups using Cloudflare
          Worker, R2 and D1.
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Cloudflare backup requires an active group
            administrator account. Backups are encrypted on
            this device before upload.
          </Text>
        </View>
      </View>

      {/* AUTOMATIC CLOUDFLARE BACKUP */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Automatic Cloudflare Backup
        </Text>

        <Text style={styles.bodyText}>
          {cloudBackupStatus}
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.button,
            cloudBackupConsent
              ? styles.importButton
              : styles.primaryButton,
            changingConsent && styles.disabledButton,
          ]}
          onPress={() =>
            void handleCloudBackupConsent()
          }
          disabled={
            changingConsent ||
            cloudBackupConsent === null
          }
        >
          {changingConsent ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {cloudBackupConsent
                ? 'Disable Automatic Backups'
                : 'Enable Automatic Backups'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.bodyText}>
          When enabled, encrypted group backups are scheduled
          approximately every six hours. Android controls
          the exact run time. Failed uploads remain failed
          and are retried on a later background run or when
          connectivity returns while the app is active.
        </Text>
      </View>

      {/* GROUP CLOUD BACKUP AND RECOVERY */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Group Cloud Backup & Recovery
        </Text>

        <Text style={styles.bodyText}>
          Create an encrypted backup for one group, or recover
          that group on another phone. Use a passphrase of at
          least 12 characters and keep it somewhere safe.
          The app cannot recover a forgotten passphrase.
        </Text>

        {/* LOCAL GROUP SELECTION */}

        {groups.length ? (
          groups.map(group => (
            <TouchableOpacity
              key={group.id}
              onPress={() =>
                setSelectedGroupId(group.id)
              }
              style={[
                styles.groupChoice,
                selectedGroupId === group.id &&
                  styles.groupChoiceSelected,
              ]}
            >
              <Text style={styles.groupChoiceText}>
                {selectedGroupId === group.id
                  ? '✓ '
                  : ''}
                KYA {group.group_number} — {group.group_name}
              </Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.bodyText}>
            No locally registered groups found for creating
            a group backup.
          </Text>
        )}

        <TextInput
          value={recoveryPassphrase}
          onChangeText={setRecoveryPassphrase}
          placeholder="Cloud backup passphrase (12+ characters)"
          secureTextEntry
          autoCapitalize="none"
          style={styles.recoveryInput}
        />

        {/* CREATE ENCRYPTED BACKUP */}

        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.button,
            styles.primaryButton,
            groupCloudBusy && styles.disabledButton,
          ]}
          onPress={() =>
            void handleUploadGroupBackup()
          }
          disabled={groupCloudBusy}
        >
          {groupCloudBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              Create Encrypted Group Cloud Backup
            </Text>
          )}
        </TouchableOpacity>

        {/* FIND CLOUD BACKUPS */}

        <TextInput
          value={groupNumberInput}
          onChangeText={setGroupNumberInput}
          placeholder="Group number to restore (e.g. KYA2012)"
          autoCapitalize="characters"
          style={styles.recoveryInput}
        />

        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.button,
            styles.importButton,
            groupCloudBusy && styles.disabledButton,
          ]}
          onPress={() =>
            void handleFindCloudGroupBackups()
          }
          disabled={groupCloudBusy}
        >
          <Text style={styles.importButtonText}>
            Find Group Backups in Cloud
          </Text>
        </TouchableOpacity>

        {/* CLOUD BACKUP LIST */}

        {cloudGroupBackups.map(backup => (
          <View
            key={backup.objectId}
            style={styles.backupCard}
          >
            <View style={styles.backupInfo}>
              <Text style={styles.backupName}>
                {backup.name}
              </Text>

              <Text style={styles.backupDetails}>
                {backup.backupCreatedAt ||
                  backup.createdAt}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.iconButton,
                styles.restoreButton,
                groupCloudBusy && styles.disabledButton,
              ]}
              onPress={() =>
                handleRestoreCloudGroup(backup)
              }
              disabled={groupCloudBusy}
            >
              <Text style={styles.buttonIcon}>
                ↩️
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* FULL LOCAL DATABASE BACKUP */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Create Backup
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💾 Create a backup of all your data including
            groups, members, meetings, and financial
            transactions. The backup file will be saved to
            your device and can be emailed to yourself.
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            styles.primaryButton,
            exporting && styles.disabledButton,
          ]}
          onPress={handleExportBackup}
          disabled={exporting}
        >
          {exporting ? (
            <ActivityIndicator
              color="#ffffff"
              size="small"
            />
          ) : (
            <>
              <Text style={styles.buttonIcon}>
                📦
              </Text>

              <Text style={styles.buttonText}>
                Create Backup
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            styles.importButton,
            restoringFile !== null &&
              styles.disabledButton,
          ]}
          onPress={handlePickBackupFile}
          disabled={restoringFile !== null}
        >
          {restoringFile ? (
            <ActivityIndicator
              color="#1d4ed8"
              size="small"
            />
          ) : (
            <>
              <Text style={styles.buttonIcon}>
                📂
              </Text>

              <Text style={styles.importButtonText}>
                Import Backup File
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* SAVED BACKUPS */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Saved Backups
        </Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              size="large"
              color="#16a34a"
            />

            <Text style={styles.loadingText}>
              Loading backups...
            </Text>
          </View>
        ) : backupFiles.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              No backups yet
            </Text>

            <Text style={styles.emptyText}>
              Create your first backup using the button
              above
            </Text>
          </View>
        ) : (
          <View>
            {backupFiles.map((file, index) => (
              <View
                key={`${file.path}-${index}`}
                style={styles.backupCard}
              >
                <View style={styles.backupInfo}>
                  <Text
                    style={styles.backupName}
                    numberOfLines={2}
                  >
                    {file.name}
                  </Text>

                  <Text style={styles.backupDetails}>
                    {file.timestamp} •{' '}
                    {formatFileSize(file.size)}
                  </Text>
                </View>

                <View style={styles.backupActions}>
                  <TouchableOpacity
                    style={[
                      styles.iconButton,
                      styles.restoreButton,
                      restoringFile === file.path &&
                        styles.disabledButton,
                    ]}
                    onPress={() =>
                      handleRestoreBackup(file.path)
                    }
                    disabled={restoringFile !== null}
                  >
                    {restoringFile === file.path ? (
                      <ActivityIndicator
                        color="#16a34a"
                        size="small"
                      />
                    ) : (
                      <Text style={styles.buttonIcon}>
                        ↩️
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.iconButton,
                      styles.emailButton,
                    ]}
                    onPress={() =>
                      handleEmailBackup(
                        file.path,
                        file.name,
                      )
                    }
                  >
                    <Text style={styles.buttonIcon}>
                      ✉️
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.iconButton,
                      styles.deleteButton,
                    ]}
                    onPress={() =>
                      handleDeleteBackup(file.path)
                    }
                  >
                    <Text style={styles.buttonIcon}>
                      🗑️
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* AFTER REINSTALLING */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          After Reinstalling
        </Text>

        <View style={styles.instructionBox}>
          <Text style={styles.instructionTitle}>
            How to Restore:
          </Text>

          {[
            'Install Ebadsave VSLA',
            'Open Data Backup & Restore',
            'Tap "Import Backup File"',
            'Select your Ebadsave backup JSON file',
            'Confirm Restore and wait for completion',
          ].map((step, index) => (
            <View
              key={index}
              style={styles.instructionStep}
            >
              <Text style={styles.stepNumber}>
                {index + 1}
              </Text>

              <Text style={styles.stepText}>
                {step}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* BEST PRACTICES */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          💡 Best Practices
        </Text>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>
            Email backups to yourself
          </Text>

          <Text style={styles.tipText}>
            After creating a backup, send it via email
            as a second safeguard.
          </Text>
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>
            Keep multiple backups
          </Text>

          <Text style={styles.tipText}>
            Don't delete old backups. You can restore
            from any of them.
          </Text>
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>
            Store in cloud
          </Text>

          <Text style={styles.tipText}>
            Keep a verified local backup and use the
            existing approved cloud backup until
            Cloudflare recovery has been tested.
          </Text>
        </View>
      </View>

    </ScrollView>
  );
}

// ===========================================================
// STYLES
// ===========================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },

  content: {
    padding: 16,
    paddingBottom: 32,
  },

  header: {
    marginBottom: 24,
  },

  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },

  backButtonText: {
    color: '#1
