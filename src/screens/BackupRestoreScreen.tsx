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

import { useFocusEffect, useNavigation } from '@react-navigation/native';

import {
  getAutomaticCloudBackupConsent,
  setAutomaticCloudBackupConsent,
  saveAutomaticCloudBackupPassphrase,
  runAutomaticCloudBackup,
} from '../database/backup';

import {
  getAllGroups,
  type GroupRecord,
} from '../database/database';

import { getCloudflareSessionGroupId } from '../services/cloudflareApi';

import {
  exportGroupDatabaseBackup,
  uploadGroupDatabaseBackupToCloud,
  listCloudGroupBackups,
  restoreCloudGroupDatabaseBackup,
  signInCloudflareBackupAdmin,
  signOutCloudflareBackupAdmin,
  type CloudBackupFileInfo,
} from './backup';

// =========================================================
// HELPERS
// =========================================================

function normalizeGroupNumber(
  value: string | number | null | undefined,
): string {
  return String(value ?? '').replace(/\D/g, '');
}

function getCloudflareGroupNumber(
  groupId: string | null,
): string | null {
  if (!groupId) return null;

  const match = groupId.match(/(\d{4})$/);

  return match?.[1] ?? null;
}

// =========================================================
// MAIN SCREEN
// =========================================================

export default function BackupRestoreScreen() {
  const navigation = useNavigation<any>();

  const [groupCloudBusy, setGroupCloudBusy] = useState(false);

  const [cloudBackupConsent, setCloudBackupConsent] =
    useState<boolean | null>(null);

  const [changingConsent, setChangingConsent] = useState(false);

  const [cloudBackupStatus, setCloudBackupStatus] = useState(
    'Checking automatic cloud backup status...',
  );

  const [groups, setGroups] = useState<GroupRecord[]>([]);

  const [selectedGroupId, setSelectedGroupId] =
    useState<number | null>(null);

  const [cloudAdminName, setCloudAdminName] = useState('');

  const [cloudAdminMemberNumber, setCloudAdminMemberNumber] =
    useState('');

  const [cloudAdminPin, setCloudAdminPin] = useState('');

  const [showCloudAdminPin, setShowCloudAdminPin] = useState(false);

  const [cloudAdminSignedIn, setCloudAdminSignedIn] = useState(false);

  const [recoveryPassphrase, setRecoveryPassphrase] = useState('');

  const [showRecoveryPassphrase, setShowRecoveryPassphrase] =
    useState(false);

  const [groupNumberInput, setGroupNumberInput] = useState('');

  const [cloudGroupBackups, setCloudGroupBackups] =
    useState<CloudBackupFileInfo[]>([]);

  // =======================================================
  // LOAD AUTOMATIC BACKUP CONSENT
  // =======================================================

  const loadConsent = useCallback(async () => {
    try {
      const enabled = await getAutomaticCloudBackupConsent();

      setCloudBackupConsent(enabled);

      setCloudBackupStatus(
        enabled
          ? 'Automatic encrypted Cloudflare backups are enabled.'
          : 'Automatic cloud backups are currently disabled.',
      );
    } catch (error) {
      console.error(
        'Could not load automatic cloud backup setting:',
        error,
      );

      setCloudBackupStatus(
        'Unable to check automatic cloud backup settings.',
      );
    }
  }, []);

  // =======================================================
  // LOAD LOCAL GROUPS AND CLOUDFLARE SESSION
  // =======================================================

  const loadGroups = useCallback(async () => {
    try {
      const result = await getAllGroups();

      setGroups(result);

      const cloudGroupId = await getCloudflareSessionGroupId();

      if (cloudGroupId) {
        const cloudNumber =
          getCloudflareGroupNumber(cloudGroupId);

        if (!cloudNumber) {
          console.warn(
            'Could not extract group number from Cloudflare session:',
            cloudGroupId,
          );

          return;
        }

        // Populate group number even on a replacement phone.
        setGroupNumberInput(cloudNumber);

        // Local group is required for backup, not cloud restore.
        const matchingGroup = result.find(
          group =>
            normalizeGroupNumber(group.group_number) === cloudNumber,
        );

        if (matchingGroup) {
          setSelectedGroupId(matchingGroup.id);
        } else {
          setSelectedGroupId(null);

          console.log(
            `KYA ${cloudNumber} is not registered locally. Cloud restore remains available.`,
          );
        }

        return;
      }

      setSelectedGroupId(current =>
        current !== null &&
        result.some(group => group.id === current)
          ? current
          : result[0]?.id ?? null,
      );
    } catch (error) {
      console.error('Could not load local groups:', error);

      setGroups([]);
      setSelectedGroupId(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadConsent();
      void loadGroups();
    }, [loadConsent, loadGroups]),
  );

  // =======================================================
  // ADMINISTRATOR SIGN IN / SIGN OUT
  // =======================================================

  const handleCloudflareAdminSignIn = async () => {
    if (!cloudAdminName.trim()) {
      Alert.alert(
        'Administrator Name Required',
        'Enter the group administrator full name.',
      );
      return;
    }

    if (!cloudAdminMemberNumber.trim()) {
      Alert.alert(
        'Member Number Required',
        'Enter the administrator member number.',
      );
      return;
    }

    if (!cloudAdminPin.trim()) {
      Alert.alert(
        'PIN Required',
        'Enter the administrator PIN.',
      );
      return;
    }

    try {
      setGroupCloudBusy(true);

      await signInCloudflareBackupAdmin(
        cloudAdminName.trim(),
        cloudAdminMemberNumber.trim(),
        cloudAdminPin,
      );

      setCloudAdminPin('');
      setCloudAdminSignedIn(true);
      setCloudGroupBackups([]);

      await loadGroups();

      Alert.alert(
        'Cloudflare Connected',
        'Group administrator authenticated successfully. You can now access the group cloud backups.',
      );
    } catch (error) {
      Alert.alert(
        'Cloudflare Sign-in Failed',
        error instanceof Error
          ? error.message
          : 'Administrator authentication failed.',
      );
    } finally {
      setGroupCloudBusy(false);
    }
  };

  const handleCloudflareAdminSignOut = async () => {
    try {
      setGroupCloudBusy(true);

      await signOutCloudflareBackupAdmin();

      setCloudAdminSignedIn(false);
      setCloudGroupBackups([]);
      setGroupNumberInput('');

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

  // =======================================================
  // CREATE ENCRYPTED GROUP CLOUD BACKUP
  // =======================================================

  const handleUploadGroupBackup = async () => {
    if (!cloudAdminSignedIn) {
      Alert.alert(
        'Administrator Sign-in Required',
        'Sign in as the group administrator first.',
      );
      return;
    }

    if (recoveryPassphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase Required',
        'Enter a cloud backup passphrase of at least 12 characters.',
      );
      return;
    }

    try {
      setGroupCloudBusy(true);

      const localGroups = await getAllGroups();

      setGroups(localGroups);

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

      // Backup requires the authenticated group locally.
      const matchingGroup = localGroups.find(
        group =>
          normalizeGroupNumber(group.group_number) ===
          cloudGroupNumber,
      );

      if (!matchingGroup) {
        setSelectedGroupId(null);

        throw new Error(
          `KYA ${cloudGroupNumber} was not found in this phone's local SQLite database.\n\n` +
            'A cloud backup requires the original local group and its records to exist on this phone.\n\n' +
            'No backup was uploaded.',
        );
      }

      setSelectedGroupId(matchingGroup.id);

      const local = await exportGroupDatabaseBackup(
        matchingGroup.id,
      );

      if (!local.success) {
        throw new Error(local.error || local.message);
      }

      const result = await uploadGroupDatabaseBackupToCloud(
        matchingGroup.id,
        recoveryPassphrase,
      );

      if (!result.success) {
        throw new Error(result.error || result.message);
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

  // =======================================================
  // FIND GROUP BACKUPS IN CLOUD
  // =======================================================

  const handleFindCloudGroupBackups = async () => {
    if (!cloudAdminSignedIn) {
      Alert.alert(
        'Administrator Sign-in Required',
        'Sign in as the group administrator first.',
      );
      return;
    }

    const normalizedNumber =
      normalizeGroupNumber(groupNumberInput);

    if (
      !normalizedNumber ||
      normalizedNumber.length !== 4
    ) {
      Alert.alert(
        'Invalid Group Number',
        'Enter the four-digit KYA group number, for example 2010.',
      );
      return;
    }

    if (recoveryPassphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase Required',
        'Enter the same cloud backup passphrase used when the backup was created. It must contain at least 12 characters.',
      );
      return;
    }

    try {
      setGroupCloudBusy(true);

      setCloudGroupBackups([]);

      setGroupNumberInput(normalizedNumber);

      // IMPORTANT:
      // backup.ts expects KYA2010, not just 2010.
      const result = await listCloudGroupBackups(
        recoveryPassphrase,
        `KYA${normalizedNumber}`,
      );

      if (!result.success) {
        throw new Error(result.error || result.message);
      }

      setCloudGroupBackups(result.backups);

      if (result.backups.length === 0) {
        Alert.alert(
          'No Cloud Backups Found',
          result.message ||
            `No backups were found for KYA ${normalizedNumber}.`,
        );
      }
    } catch (error) {
      Alert.alert(
        'Cloud Recovery',
        error instanceof Error
          ? error.message
          : 'Could not find group backups.',
      );
    } finally {
      setGroupCloudBusy(false);
    }
  };

  // =======================================================
  // RESTORE GROUP FROM CLOUDFLARE
  // =======================================================

  const handleRestoreCloudGroup = (
    backup: CloudBackupFileInfo,
  ) => {
    if (!cloudAdminSignedIn) {
      Alert.alert(
        'Sign-in Required',
        'Sign in as the group administrator before restoring.',
      );
      return;
    }

    const normalizedNumber =
      normalizeGroupNumber(groupNumberInput);

    if (normalizedNumber.length !== 4) {
      Alert.alert(
        'Invalid Group Number',
        'Enter a valid four-digit KYA group number.',
      );
      return;
    }

    if (recoveryPassphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase Required',
        'Enter the cloud backup passphrase.',
      );
      return;
    }

    Alert.alert(
      'Restore Group Database',
      `Restore KYA ${normalizedNumber} from this encrypted Cloudflare backup?\n\n` +
        'This is intended for restoring a group on a new phone where the group may not yet exist in local SQLite.\n\n' +
        'Existing local records must be protected by the restore implementation.',
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

              // Do not require a local group on a replacement phone.
              const result =
                await restoreCloudGroupDatabaseBackup(
                  backup,
                  recoveryPassphrase,
                  normalizedNumber,
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
                'Restore Failed',
                error instanceof Error
                  ? error.message
                  : 'Could not restore the cloud backup.',
              );
            } finally {
              setGroupCloudBusy(false);
            }
          },
        },
      ],
    );
  };

  // =======================================================
  // AUTOMATIC CLOUDFLARE BACKUP CONSENT
  // =======================================================

  const handleCloudBackupConsent = async () => {
    if (cloudBackupConsent === null) return;

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
            'The authenticated group must exist locally before automatic backup can be enabled.',
          );
        }

        if (recoveryPassphrase.trim().length < 12) {
          throw new Error(
            'Enter a cloud backup passphrase of at least 12 characters.',
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

        const {
          initializeAutomaticBackupTask,
        } = await import('../services/backupBackground');

        await initializeAutomaticBackupTask();

        setCloudBackupStatus(
          'Automatic encrypted cloud backup enabled. Starting the first backup.',
        );

        const result = await runAutomaticCloudBackup(true);

        setCloudBackupStatus(result.message);

        if (!result.success && !result.skipped) {
          Alert.alert(
            'Automatic Backup Pending',
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
          'Automatic Cloudflare backups have been disabled.',
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
        'Could not update automatic cloud backup settings.',
      );

      Alert.alert(
        'Automatic Backup',
        error instanceof Error
          ? error.message
          : 'Could not update automatic backup settings.',
      );
    } finally {
      setChangingConsent(false);
    }
  };

  // =======================================================
  // USER INTERFACE
  // =======================================================

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
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
            ‹ Back
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Cloud Backup &amp; Restore
        </Text>

        <Text style={styles.subtitle}>
          Securely back up and restore your VSLA group using Cloudflare.
        </Text>
      </View>

      {/* ADMINISTRATOR SIGN IN */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          1. Group Administrator Sign In
        </Text>

        <Text style={styles.bodyText}>
          Sign in using the registered group administrator details.
        </Text>

        <Text style={styles.label}>
          Administrator Full Name
        </Text>

        <TextInput
          value={cloudAdminName}
          onChangeText={setCloudAdminName}
          placeholder="Enter administrator full name"
          autoCapitalize="words"
          autoCorrect={false}
          editable={!cloudAdminSignedIn}
          style={styles.recoveryInput}
        />

        <Text style={styles.label}>
          Administrator Member Number
        </Text>

        <TextInput
          value={cloudAdminMemberNumber}
          onChangeText={setCloudAdminMemberNumber}
          placeholder="Example: KYA2010001"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!cloudAdminSignedIn}
          style={styles.recoveryInput}
        />

        <Text style={styles.label}>
          Administrator PIN
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            value={cloudAdminPin}
            onChangeText={setCloudAdminPin}
            placeholder="Enter administrator PIN"
            secureTextEntry={!showCloudAdminPin}
            keyboardType="number-pad"
            editable={!cloudAdminSignedIn}
            autoCapitalize="none"
            style={styles.flexInput}
          />

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() =>
              setShowCloudAdminPin(value => !value)
            }
            style={styles.visibilityButton}
          >
            <Text style={styles.visibilityText}>
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
          {groupCloudBusy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>
              {cloudAdminSignedIn
                ? 'Sign Out of Cloudflare'
                : 'Sign In as Group Administrator'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {cloudAdminSignedIn
              ? 'Administrator authenticated. Cloud backup and recovery are available.'
              : 'Administrator authentication is required before accessing group cloud backups.'}
          </Text>
        </View>
      </View>

      {/* CLOUD PASSPHRASE */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          2. Cloud Backup Passphrase
        </Text>

        <Text style={styles.bodyText}>
          Enter the same passphrase used when the encrypted backup was
          created. It must contain at least 12 characters.
        </Text>

        <Text style={styles.label}>
          Recovery Passphrase
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            value={recoveryPassphrase}
            onChangeText={setRecoveryPassphrase}
            placeholder="Enter cloud backup passphrase"
            secureTextEntry={!showRecoveryPassphrase}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.flexInput}
          />

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() =>
              setShowRecoveryPassphrase(value => !value)
            }
            style={styles.visibilityButton}
          >
            <Text style={styles.visibilityText}>
              {showRecoveryPassphrase ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.helperText}>
          Keep this passphrase safe. Without it, an encrypted backup
          cannot be decrypted.
        </Text>
      </View>

      {/* GROUP CLOUD BACKUP AND RESTORE */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          3. Group Cloud Backup &amp; Recovery
        </Text>

        <Text style={styles.bodyText}>
          Enter the four-digit group number to locate encrypted backups
          stored in Cloudflare.
        </Text>

        <Text style={styles.label}>
          KYA Group Number
        </Text>

        <TextInput
          value={groupNumberInput}
          onChangeText={text => {
            setGroupNumberInput(text.toUpperCase());
            setCloudGroupBackups([]);
          }}
          placeholder="Example: 2010 or KYA2010"
          autoCapitalize="characters"
          autoCorrect={false}
          keyboardType="default"
          returnKeyType="search"
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
          {groupCloudBusy ? (
            <ActivityIndicator color="#1d4ed8" />
          ) : (
            <Text style={styles.importButtonText}>
              Find Group Backups in Cloud
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>
            Available Cloud Backups
          </Text>

          {cloudGroupBackups.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                No backups displayed
              </Text>

              <Text style={styles.emptyText}>
                Sign in, enter your passphrase and group number, then tap
                Find Group Backups in Cloud.
              </Text>
            </View>
          ) : (
            cloudGroupBackups.map(backup => (
              <View
                key={backup.objectId}
                style={styles.backupCard}
              >
                <View style={styles.backupInfo}>
                  <Text style={styles.backupName}>
                    {backup.name}
                  </Text>

                  <Text style={styles.backupDetails}>
                    {backup.backupCreatedAt || backup.createdAt}
                  </Text>
                </View>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Restore this cloud backup"
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
                  <Text style={styles.restoreIcon}>
                    ↩
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </View>

      {/* CREATE GROUP CLOUD BACKUP */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          4. Create Encrypted Group Backup
        </Text>

        <Text style={styles.bodyText}>
          This operation backs up an existing local group. The group must
          already be registered on this phone. Cloud restoration on a new
          phone does not have this requirement.
        </Text>

        <Text style={styles.label}>
          Local Groups Available for Backup
        </Text>

        {groups.length > 0 ? (
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
                {selectedGroupId === group.id ? '✓ ' : ''}
                KYA {group.group_number} — {group.group_name}
              </Text>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              No locally registered groups are available for creating a
              backup.
            </Text>
          </View>
        )}

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
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>
              Create Encrypted Group Cloud Backup
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* AUTOMATIC CLOUD BACKUP */}

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
              ? styles.disableAutoButton
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
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>
              {cloudBackupConsent
                ? 'Disable Automatic Backups'
                : 'Enable Automatic Backups'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.helperText}>
          When enabled, encrypted group backups can run approximately
          every six hours, depending on Android background scheduling
          and connectivity.
        </Text>
      </View>

      {/* SECURITY INFORMATION */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Cloud Backup Security
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            • Administrator authentication is required.
          </Text>

          <Text style={styles.infoText}>
            • Cloud backups are encrypted before upload.
          </Text>

          <Text style={styles.infoText}>
            • A recovery passphrase of at least 12 characters is required.
          </Text>

          <Text style={styles.infoText}>
            • Group recovery does not require the group to exist in local
            SQLite beforehand.
          </Text>

          <Text style={styles.infoText}>
            • Keep your recovery passphrase secure.
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
    paddingBottom: 40,
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
    color: '#1f2937',
    fontSize: 16,
    fontWeight: '700',
  },

  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },

  section: {
    marginBottom: 26,
    padding: 14,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },

  bodyText: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
    marginBottom: 12,
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },

  recoveryInput: {
    height: 50,
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 0,
    backgroundColor: '#ffffff',
    color: '#111827',
    fontSize: 14,
    marginTop: 0,
    width: '100%',
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 0,
  },

  flexInput: {
    flex: 1,
    height: 50,
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 0,
    backgroundColor: '#ffffff',
    color: '#111827',
    fontSize: 14,
  },

  visibilityButton: {
    height: 50,
    minHeight: 50,
    minWidth: 65,
    marginLeft: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  visibilityText: {
    color: '#166534',
    fontWeight: '600',
    fontSize: 10,
  },

  helperText: {
    fontSize: 5,
    color: '#6b7280',
    lineHeight: 15,
    marginTop: 5,
  },

  button: {
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center', 
  },
   });
