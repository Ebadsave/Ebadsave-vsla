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
  runAutomaticCloudBackup,
  exportDatabaseBackup,
  emailBackupFile,
  listBackupFiles,
  restoreDatabaseBackup,
  deleteBackupFile,
  formatFileSize,
} from '../database/backup';

import {
  registerAutomaticBackupTask,
  unregisterAutomaticBackupTask,
} from '../services/backupBackground';

import {
  getAllGroups,
  type GroupRecord,
} from '../database/database';

import {
  exportGroupDatabaseBackup,
  uploadGroupDatabaseBackupToCloud,
  listCloudGroupBackups,
  restoreCloudGroupDatabaseBackup,
  type CloudBackupFileInfo,
} from './backup';

interface BackupFile {
  name: string;
  path: string;
  size: number;
  timestamp: string;
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
    'Checking automatic cloud backup status...',
  );

  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const [groupNumberInput, setGroupNumberInput] = useState('');
  const [recoveryPassphrase, setRecoveryPassphrase] = useState('');

  const [cloudGroupBackups, setCloudGroupBackups] =
    useState<CloudBackupFileInfo[]>([]);

  const [groupCloudBusy, setGroupCloudBusy] = useState(false);

  // ---------------------------------------------------------
  // BACK BUTTON
  // ---------------------------------------------------------

  const handleGoBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    Alert.alert(
      'Navigation',
      'There is no previous screen in the navigation history.',
    );
  };

  // ---------------------------------------------------------
  // LOAD AUTOMATIC BACKUP CONSENT
  // ---------------------------------------------------------

  const loadConsent = useCallback(async () => {
    try {
      const enabled = await getAutomaticCloudBackupConsent();

      setCloudBackupConsent(enabled);

      setCloudBackupStatus(
        enabled
          ? 'Automatic encrypted cloud backups are enabled. Backups may run approximately every 6 hours when Android or iOS allows them.'
          : 'Automatic cloud backup is disabled. Local backups remain available.',
      );
    } catch (error) {
      console.error(
        'Could not load automatic cloud backup setting:',
        error,
      );

      setCloudBackupStatus(
        'Unable to verify automatic cloud backup settings.',
      );
    }
  }, []);

  // ---------------------------------------------------------
  // LOAD REGISTERED GROUPS
  // ---------------------------------------------------------

  const loadGroups = useCallback(async () => {
    try {
      const result = await getAllGroups();

      setGroups(result);

      setSelectedGroupId((currentId) => {
        if (
          currentId !== null &&
          result.some((group) => group.id === currentId)
        ) {
          return currentId;
        }

        return result.length > 0 ? result[0].id : null;
      });
    } catch (error) {
      console.error(
        'Could not load registered groups:',
        error,
      );

      setGroups([]);
      setSelectedGroupId(null);
    }
  }, []);

  // ---------------------------------------------------------
  // LOAD LOCAL BACKUP FILES
  // ---------------------------------------------------------

  const loadBackupFiles = useCallback(async () => {
    try {
      setLoading(true);

      const files = await listBackupFiles();

      setBackupFiles(files);
    } catch (error) {
      console.error('Error loading backups:', error);

      Alert.alert(
        'Backup Files',
        'Could not load local backup files.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // ---------------------------------------------------------
  // REFRESH SCREEN WHEN IT BECOMES ACTIVE
  // ---------------------------------------------------------

  useFocusEffect(
    useCallback(() => {
      void loadBackupFiles();
      void loadConsent();
      void loadGroups();
    }, [loadBackupFiles, loadConsent, loadGroups]),
  );

  // ---------------------------------------------------------
  // ENABLE OR DISABLE AUTOMATIC CLOUD BACKUP
  // ---------------------------------------------------------

  const handleCloudBackupConsent = async () => {
    if (cloudBackupConsent === null || changingConsent) {
      return;
    }

    const nextValue = !cloudBackupConsent;

    try {
      setChangingConsent(true);

      const saved = await setAutomaticCloudBackupConsent(nextValue);

      if (!saved.success) {
        throw new Error(
          saved.error || saved.message || 'Could not save consent.',
        );
      }

      if (nextValue) {
        setCloudBackupConsent(true);

        await registerAutomaticBackupTask();

        setCloudBackupStatus(
          'Consent enabled. Starting the first encrypted cloud backup.',
        );

        const result = await runAutomaticCloudBackup(true);

        setCloudBackupStatus(result.message);

        if (!result.success && !result.skipped) {
          Alert.alert(
            'Cloud Backup',
            result.error || result.message,
          );
        }
      } else {
        await unregisterAutomaticBackupTask();

        setCloudBackupConsent(false);

        setCloudBackupStatus(
          'Automatic cloud uploads are disabled. Local backups remain available.',
        );
      }
    } catch (error) {
      setCloudBackupStatus(
        'Could not update the automatic cloud backup setting.',
      );

      Alert.alert(
        'Automatic Backup',
        error instanceof Error
          ? error.message
          : 'Could not update the automatic backup setting.',
      );
    } finally {
      setChangingConsent(false);
    }
  };

  // ---------------------------------------------------------
  // CREATE ENCRYPTED GROUP CLOUD BACKUP
  // ---------------------------------------------------------

  const handleUploadGroupBackup = async () => {
    if (groupCloudBusy) {
      return;
    }

    if (selectedGroupId === null) {
      Alert.alert(
        'Select Group',
        'No locally registered group is available to back up. To recover a group from another phone, enter its group number below and use Find Group Backups in Cloud.',
      );

      return;
    }

    if (recoveryPassphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase Required',
        'Enter a passphrase containing at least 12 characters. Keep it safe because you will need the same passphrase to recover the backup.',
      );

      return;
    }

    try {
      setGroupCloudBusy(true);

      // Create the encrypted group backup.
      const localResult = await exportGroupDatabaseBackup(
        selectedGroupId,
      );

      if (!localResult.success) {
        throw new Error(
          localResult.error ||
            localResult.message ||
            'Could not create the group backup.',
        );
      }

      // Upload the group backup to the cloud.
      const uploadResult = await uploadGroupDatabaseBackupToCloud(
        selectedGroupId,
        recoveryPassphrase,
      );

      if (!uploadResult.success) {
        throw new Error(
          uploadResult.error ||
            uploadResult.message ||
            'The group backup could not be uploaded.',
        );
      }

      Alert.alert(
        'Group Backup Saved',
        uploadResult.message ||
          'The encrypted group backup was uploaded successfully.',
      );
    } catch (error) {
      Alert.alert(
        'Group Backup Failed',
        error instanceof Error
          ? error.message
          : 'Could not upload the encrypted group backup.',
      );
    } finally {
      setGroupCloudBusy(false);
    }
  };

  // ---------------------------------------------------------
  // FIND ENCRYPTED GROUP BACKUPS IN BACK4APP
  // ---------------------------------------------------------

  const handleFindCloudGroupBackups = async () => {
    if (groupCloudBusy) {
      return;
    }

    const normalizedGroupNumber = groupNumberInput
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');

    if (!normalizedGroupNumber) {
      Alert.alert(
        'Group Number Required',
        'Enter the group number you want to recover, for example KYA2012.',
      );

      return;
    }

    if (!/^KYA\d+$/.test(normalizedGroupNumber)) {
      Alert.alert(
        'Invalid Group Number',
        'Enter a valid group number, for example KYA2012 or KYA 2012.',
      );

      return;
    }

    if (recoveryPassphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase Required',
        'Enter the same passphrase that was used when the encrypted cloud backup was created.',
      );

      return;
    }

    try {
      setGroupCloudBusy(true);

      // Clear previous search results before searching again.
      setCloudGroupBackups([]);

      const result = await listCloudGroupBackups(
        recoveryPassphrase,
        normalizedGroupNumber,
      );

      if (!result.success) {
        throw new Error(
          result.error ||
            result.message ||
            'Could not search for cloud backups.',
        );
      }

      setCloudGroupBackups(result.backups || []);

      setGroupNumberInput(normalizedGroupNumber);

      if (!result.backups || result.backups.length === 0) {
        Alert.alert(
          'No Cloud Backups Found',
          result.message ||
            `No backups were found for ${normalizedGroupNumber}. Check the group number, passphrase, and Back4App connection.`,
        );

        return;
      }

      Alert.alert(
        'Cloud Backups Found',
        `Found ${result.backups.length} backup(s) for ${normalizedGroupNumber}. Select a backup below to begin recovery.`,
      );
    } catch (error) {
      Alert.alert(
        'Cloud Recovery',
        error instanceof Error
          ? error.message
          : 'Could not find group backups in the cloud.',
      );
    } finally {
      setGroupCloudBusy(false);
    }
  };

  // ---------------------------------------------------------
  // RESTORE A GROUP FROM AN ENCRYPTED CLOUD BACKUP
  // ---------------------------------------------------------

  const handleRestoreCloudGroup = (
    backup: CloudBackupFileInfo,
  ) => {
    if (groupCloudBusy) {
      return;
    }

    if (!recoveryPassphrase.trim()) {
      Alert.alert(
        'Passphrase Required',
        'Enter the backup passphrase before restoring this group.',
      );

      return;
    }

    Alert.alert(
      'Restore Group',
      `Restore ${groupNumberInput.trim()} from this encrypted cloud backup?\n\nThe recovery service must validate the backup and protect existing local records.`,
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

              const result = await restoreCloudGroupDatabaseBackup(
                backup,
                recoveryPassphrase,
                groupNumberInput.trim().toUpperCase().replace(/\s+/g, ''),
              );

              if (!result.success) {
                throw new Error(
                  result.error ||
                    result.message ||
                    'Could not restore the group.',
                );
              }

              Alert.alert(
                'Group Restored',
                result.message ||
                  'The group recovery operation completed successfully.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      void loadGroups();
                      void loadBackupFiles();
                    },
                  },
                ],
              );
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

  // ---------------------------------------------------------
  // CREATE LOCAL DATABASE BACKUP
  // ---------------------------------------------------------

  const handleExportBackup = async () => {
    if (exporting) {
      return;
    }

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
                void handleEmailBackup(
                  result.filePath,
                  result.fileName,
                );
              }
            },
          },
          {
            text: 'Done',
            style: 'cancel',
            onPress: () => {
              void loadBackupFiles();
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        'Backup Error',
        error instanceof Error
          ? error.message
          : 'Could not create the database backup.',
      );
    } finally {
      setExporting(false);
    }
  };

  // ---------------------------------------------------------
  // EMAIL BACKUP FILE
  // ---------------------------------------------------------

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
        'Email Backup',
        result.message,
        [
          {
            text: 'OK',
            onPress: () => {
              void loadBackupFiles();
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        'Email Backup',
        error instanceof Error
          ? error.message
          : 'Could not email the backup file.',
      );
    }
  };

  // ---------------------------------------------------------
  // RESTORE LOCAL BACKUP
  // ---------------------------------------------------------

  const handleRestoreBackup = (filePath: string) => {
    Alert.alert(
      'Restore Backup',
      'Restoring this backup may overwrite current application data. Make sure you have a recent backup before continuing.',
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

              const result = await restoreDatabaseBackup(
                filePath,
              );

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
                    onPress: () => {
                      void loadBackupFiles();
                      void loadGroups();
                    },
                  },
                ],
              );
            } catch (error) {
              Alert.alert(
                'Restore Failed',
                error instanceof Error
                  ? error.message
                  : 'Could not restore the backup.',
              );
            } finally {
              setRestoringFile(null);
            }
          },
        },
      ],
    );
  };

  // ---------------------------------------------------------
  // PICK AND RESTORE A BACKUP FILE
  // ---------------------------------------------------------

  const handlePickBackupFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
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

      const fileName = file.name || 'Selected backup';

      Alert.alert(
        'Restore Backup',
        `Restore "${fileName}"?\n\nMake sure you have a recent backup of your current data before continuing.`,
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
                      onPress: () => {
                        void loadBackupFiles();
                        void loadGroups();
                      },
                    },
                  ],
                );
              } catch (error) {
                Alert.alert(
                  'Restore Failed',
                  error instanceof Error
                    ? error.message
                    : 'Could not restore the selected backup file.',
                );
              } finally {
                setRestoringFile(null);
              }
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        'Backup File',
        error instanceof Error
          ? error.message
          : 'Could not select the backup file.',
      );
    }
  };

  // ---------------------------------------------------------
  // DELETE LOCAL BACKUP
  // ---------------------------------------------------------

  const handleDeleteBackup = (filePath: string) => {
    Alert.alert(
      'Delete Backup',
      'This backup file will be permanently deleted from this device.',
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
              const result = await deleteBackupFile(filePath);

              if (!result.success) {
                Alert.alert(
                  'Delete Failed',
                  result.error || result.message,
                );

                return;
              }

              await loadBackupFiles();
            } catch (error) {
              Alert.alert(
                'Delete Failed',
                error instanceof Error
                  ? error.message
                  : 'Could not delete the backup.',
              );
            }
          },
        },
      ],
    );
  };

  // ---------------------------------------------------------
  // SCREEN UI
  // ---------------------------------------------------------

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* HEADER AND BACK BUTTON */}

      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back to previous screen"
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <Text style={styles.backButtonText}>
            {'‹  Back'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Data Backup & Restore
        </Text>

        <Text style={styles.subtitle}>
          Protect your group data and recover it on another phone.
        </Text>
      </View>

      {/* AUTOMATIC CLOUD BACKUP */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Automatic Back4App Backup
        </Text>

        <Text style={styles.bodyText}>
          Enable consent to allow encrypted cloud backups
          approximately every 6 hours when Android or iOS
          allows them. Actual timing depends on the operating
          system. Local SQLite records are not changed simply
          by uploading a backup.
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.consentButton,
            cloudBackupConsent === true
              ? styles.disableConsentButton
              : null,
            (changingConsent ||
              cloudBackupConsent === null) &&
              styles.disabledButton,
          ]}
          onPress={() => {
            void handleCloudBackupConsent();
          }}
          disabled={
            changingConsent ||
            cloudBackupConsent === null
          }
        >
          {changingConsent ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.consentButtonText}>
              {cloudBackupConsent === null
                ? 'Checking Automatic Backup...'
                : cloudBackupConsent
                  ? 'Disable Automatic Cloud Backup'
                  : 'Enable Automatic Cloud Backup'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {cloudBackupConsent === null
              ? 'Checking saved automatic backup consent...'
              : cloudBackupConsent
                ? 'Consent enabled: automatic encrypted cloud backups are allowed.'
                : 'Consent disabled: automatic cloud backups are turned off.'}
          </Text>
        </View>

        <Text style={styles.bodyText}>
          {cloudBackupStatus}
        </Text>
      </View>

      {/* GROUP CLOUD BACKUP AND RECOVERY */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Group Cloud Backup & Recovery
        </Text>

        <Text style={styles.bodyText}>
          Create an encrypted backup for a registered group,
          or find and restore an existing group backup on
          another phone. Use a passphrase of at least
          12 characters and keep it safe. A forgotten
          passphrase cannot be recovered by the app.
        </Text>

        {/* REGISTERED GROUPS */}

        {groups.length > 0 ? (
          <>
            <Text style={styles.fieldLabel}>
              Select the group to back up
            </Text>

            {groups.map((group) => (
              <TouchableOpacity
                key={group.id}
                accessibilityRole="button"
                onPress={() => {
                  setSelectedGroupId(group.id);
                }}
                style={[
                  styles.groupChoice,
                  selectedGroupId === group.id &&
                    styles.groupChoiceSelected,
                ]}
              >
                <Text style={styles.groupChoiceText}>
                  {selectedGroupId === group.id
                    ? '✓  '
                    : ''}
                  KYA {group.group_number}
                  {' — '}
                  {group.group_name}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <View style={styles.emptyCloudBox}>
            <Text style={styles.emptyCloudTitle}>
              No groups on this phone yet
            </Text>

            <Text style={styles.emptyCloudText}>
              You can still search for an existing cloud
              backup below. Having no local group does not
              prove that your cloud backup has been deleted.
            </Text>
          </View>
        )}

        {/* SHARED PASSPHRASE INPUT */}

        <Text style={styles.fieldLabel}>
          Cloud backup passphrase
        </Text>

        <TextInput
          value={recoveryPassphrase}
          onChangeText={setRecoveryPassphrase}
          placeholder="Enter passphrase (12+ characters)"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.recoveryInput}
          editable={!groupCloudBusy}
          accessibilityLabel="Cloud backup passphrase"
        />

        {/* CREATE GROUP BACKUP */}

        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.button,
            styles.primaryButton,
            groupCloudBusy && styles.disabledButton,
          ]}
          onPress={() => {
            void handleUploadGroupBackup();
          }}
          disabled={groupCloudBusy}
        >
          {groupCloudBusy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>
              Create Encrypted Group Cloud Backup
            </Text>
          )}
        </TouchableOpacity>

        {/* GROUP NUMBER TO RECOVER */}

        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
          Group number to recover
        </Text>

        <TextInput
          value={groupNumberInput}
          onChangeText={setGroupNumberInput}
          placeholder="Enter group number (e.g. KYA2012)"
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.recoveryInput}
          editable={!groupCloudBusy}
          accessibilityLabel="Group number to recover"
        />

        {/* FIND CLOUD BACKUPS */}

        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.button,
            styles.importButton,
            groupCloudBusy && styles.disabledButton,
          ]}
          onPress={() => {
            void handleFindCloudGroupBackups();
          }}
          disabled={groupCloudBusy}
        >
          {groupCloudBusy ? (
            <ActivityIndicator color="#1d4ed8" />
          ) : (
            <Text style={styles.importButtonText}>
              Find Group Backups in Cloud
            </Text>
          )}
        </TouchableOpacity>

        {/* CLOUD BACKUP SEARCH RESULTS */}

        {cloudGroupBackups.length > 0 && (
          <View style={styles.cloudResults}>
            <Text style={styles.resultsTitle}>
              Available Cloud Backups
            </Text>

            {cloudGroupBackups.map((backup) => (
              <View
                key={backup.objectId}
                style={styles.backupCard}
              >
                <View style={styles.backupInfo}>
                  <Text
                    style={styles.backupName}
                    numberOfLines={2}
                  >
                    {backup.name}
                  </Text>

                  <Text style={styles.backupDetails}>
                    {backup.backupCreatedAt ||
                      backup.createdAt ||
                      'Backup date unavailable'}
                  </Text>
                </View>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Restore ${backup.name}`}
                  style={[
                    styles.cloudRestoreButton,
                    groupCloudBusy &&
                      styles.disabledButton,
                  ]}
                  onPress={() => {
                    handleRestoreCloudGroup(backup);
                  }}
                  disabled={groupCloudBusy}
                >
                  <Text style={styles.cloudRestoreButtonText}>
                    Restore
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* CREATE LOCAL BACKUP */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Create Local Backup
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Create a backup of your application data,
            including groups, members, meetings, and
            financial transactions, according to the
            existing backup implementation. You can
            save the backup file on your device and
            email it to yourself.
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          style={[
            styles.button,
            styles.primaryButton,
            exporting && styles.disabledButton,
          ]}
          onPress={() => {
            void handleExportBackup();
          }}
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
          accessibilityRole="button"
          style={[
            styles.button,
            styles.importButton,
            restoringFile !== null &&
              styles.disabledButton,
          ]}
          onPress={() => {
            void handlePickBackupFile();
          }}
          disabled={restoringFile !== null}
        >
          {restoringFile !== null ? (
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

      {/* SAVED LOCAL BACKUPS */}

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
              No local backups yet
            </Text>

            <Text style={styles.emptyText}>
              Create a backup using the button above.
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
                    {file.timestamp}
                    {' • '}
                    {formatFileSize(file.size)}
                  </Text>
                </View>

                <View style={styles.backupActions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Restore local backup"
                    style={[
                      styles.iconButton,
                      styles.restoreButton,
                      restoringFile === file.path &&
                        styles.disabledButton,
                    ]}
                    onPress={() => {
                      handleRestoreBackup(file.path);
                    }}
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
                    accessibilityRole="button"
                    accessibilityLabel="Email local backup"
                    style={[
                      styles.iconButton,
                      styles.emailButton,
                    ]}
                    onPress={() => {
                      void handleEmailBackup(
                        file.path,
                        file.name,
                      );
                    }}
                  >
                    <Text style={styles.buttonIcon}>
                      ✉️
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Delete local backup"
                    style={[
                      styles.iconButton,
                      styles.deleteButton,
                    ]}
                    onPress={() => {
                      handleDeleteBackup(file.path);
                    }}
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

      {/* RESTORE INSTRUCTIONS */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          After Reinstalling
        </Text>

        <View style={styles.instructionBox}>
          <Text style={styles.instructionTitle}>
            How to restore a local backup
          </Text>

          {[
            'Install Ebadsave VSLA.',
            'Open Data Backup & Restore.',
            'Tap Import Backup File.',
            'Select your backup JSON file.',
            'Confirm restoration and wait for completion.',
          ].map((step, index) => (
            <View
              key={step}
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
          Best Practices
        </Text>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>
            Keep the passphrase safe
          </Text>

          <Text style={styles.tipText}>
            An encrypted group backup cannot be recovered
            without the correct passphrase.
          </Text>
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>
            Keep an additional backup
          </Text>

          <Text style={styles.tipText}>
            Keep a separate backup copy in a secure
            location in case your phone is lost or damaged.
          </Text>
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>
            Verify cloud recovery
          </Text>

          <Text style={styles.tipText}>
            Before relying on a cloud backup, verify that
            it can be found and restored using the correct
            group number and passphrase.
          </Text>
        </View>
      </View>

      {/* BOTTOM BACK BUTTON */}

      <TouchableOpacity
        accessibilityRole="button"
        style={styles.bottomBackButton}
        onPress={handleGoBack}
      >
        <Text style={styles.bottomBackButtonText}>
          ‹  Return to Previous Screen
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------
// STYLES
// ---------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },

  content: {
    padding: 16,
    paddingBottom: 40,
  },

  header: {
    marginBottom: 24,
  },

  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },

  backButtonText: {
    color: '#1f2937',
    fontSize: 16,
    fontWeight: '700',
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 21,
  },

  section: {
    marginBottom: 26,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },

  bodyText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 21,
    marginBottom: 12,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
    marginBottom: 6,
  },

  fieldLabelSpaced: {
    marginTop: 20,
  },

  groupChoice: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 13,
    marginBottom: 7,
    backgroundColor: '#ffffff',
  },

  groupChoiceSelected: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },

  groupChoiceText: {
    color: '#1f2937',
    fontSize: 14,
    lineHeight: 20,
  },

  recoveryInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    marginTop: 5,
    color: '#111827',
    fontSize: 16,
  },

  consentButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 9,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },

  disableConsentButton: {
    backgroundColor: '#b91c1c',
  },

  consentButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 14,
  },

  infoBox: {
    backgroundColor: '#ecfdf5',
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
    padding: 13,
    borderRadius: 8,
    marginBottom: 14,
  },

  infoText: {
    fontSize: 13,
    color: '#047857',
    lineHeight: 20,
  },

  emptyCloudBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
  },

  emptyCloudTitle: {
    color: '#1e40af',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },

  emptyCloudText: {
    color: '#1e3a8a',
    fontSize: 13,
    lineHeight: 20,
  },

  button: {
    minHeight: 54,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },

  primaryButton: {
    backgroundColor: '#16a34a',
  },

  importButton: {
    backgroundColor: '#dbeafe',
  },

  buttonIcon: {
    fontSize: 18,
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },

  importButtonText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },

  disabledButton: {
    opacity: 0.6,
  },

  cloudResults: {
    marginTop: 20,
  },

  resultsTitle: {
    color: '#1f2937',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },

  cloudRestoreButton: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 7,
    marginLeft: 10,
  },

  cloudRestoreButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },

  emptyBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 9,
    padding: 24,
    alignItems: 'center',
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },

  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 19,
  },

  backupCard: {
    backgroundColor: '#ffffff',
    borderRadius: 9,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  backupInfo: {
    flex: 1,
    minWidth: 0,
  },

  backupName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 5,
  },

  backupDetails: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },

  backupActions: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 8,
  },

  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },

  restoreButton: {
    backgroundColor: '#dbeafe',
  },

  emailButton: {
    backgroundColor: '#fef3c7',
  },

  deleteButton: {
    backgroundColor: '#fee2e2',
  },

  instructionBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 9,
    padding: 16,
  },

  instructionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 14,
  },

  instructionStep: {
    flexDirection: 'row',
    marginBottom: 13,
    alignItems: 'flex-start',
    gap: 12,
  },

  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 3,
  },

  stepText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
    paddingTop: 3,
  },

  tipBox: {
    backgroundColor: '#ffffff',
    borderRadius: 9,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#fbbf24',
  },

  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 5,
  },

  tipText: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
  },

  bottomBackButton: {
    backgroundColor: '#e5e7eb',
    borderRadius: 9,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 16,
  },

  bottomBackButtonText: {
    color: '#1f2937',
    fontSize: 15,
    fontWeight: '700',
  },
});
