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

import { getAutomaticCloudBackupConsent, setAutomaticCloudBackupConsent, runAutomaticCloudBackup } from '../database/backup';
import { registerAutomaticBackupTask, unregisterAutomaticBackupTask } from '../services/backupBackground';
import { getAllGroups, type GroupRecord } from '../database/database';
import { exportGroupDatabaseBackup, uploadGroupDatabaseBackupToCloud, listCloudGroupBackups, restoreCloudGroupDatabaseBackup, signInCloudflareBackupAdmin, signOutCloudflareBackupAdmin, type CloudBackupFileInfo } from './backup';

import {
exportDatabaseBackup,
emailBackupFile,
listBackupFiles,
restoreDatabaseBackup,
deleteBackupFile,
formatFileSize,
} from '../database/backup';

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
const [cloudBackupConsent, setCloudBackupConsent] = useState<boolean | null>(null);
const [changingConsent, setChangingConsent] = useState(false);
const [cloudBackupStatus, setCloudBackupStatus] = useState('Checking automatic cloud backup status…');
const [groups, setGroups] = useState<GroupRecord[]>([]);
const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
const [groupNumberInput, setGroupNumberInput] = useState('');
const [recoveryPassphrase, setRecoveryPassphrase] = useState('');
const [cloudGroupBackups, setCloudGroupBackups] = useState<CloudBackupFileInfo[]>([]);
const [groupCloudBusy, setGroupCloudBusy] = useState(false);
const [cloudAdminMemberNumber, setCloudAdminMemberNumber] = useState('');
const [cloudAdminPin, setCloudAdminPin] = useState('');
const [cloudAdminSignedIn, setCloudAdminSignedIn] = useState(false);
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
    console.error('Could not load automatic cloud backup setting:', error);
    setCloudBackupStatus(
      'Unable to verify the automatic cloud backup setting. Please reopen this screen.',
    );
  }
}, []);

const loadGroups = useCallback(async () => {
  try {
    const result = await getAllGroups();
    setGroups(result);
    if (result.length) {
      setSelectedGroupId((current) =>
        current !== null && result.some((group) => group.id === current)
          ? current
          : result[0].id,
      );
    } else {
      setSelectedGroupId(null);
    }
  } catch (error) {
    console.error('Could not load groups for group backup:', error);
  }
}, [selectedGroupId]);

const handleCloudflareAdminSignIn = async () => {
  try {
    setGroupCloudBusy(true);
    await signInCloudflareBackupAdmin(cloudAdminMemberNumber, cloudAdminPin);
    setCloudAdminPin('');
    setCloudAdminSignedIn(true);
    Alert.alert('Cloudflare Connected', 'Group administrator authenticated successfully.');
  } catch (error) {
    Alert.alert('Cloudflare Sign-in Failed', error instanceof Error ? error.message : 'Sign-in failed.');
  } finally { setGroupCloudBusy(false); }
};

const handleCloudflareAdminSignOut = async () => {
  await signOutCloudflareBackupAdmin();
  setCloudAdminSignedIn(false);
  setCloudGroupBackups([]);
};

const handleUploadGroupBackup = async () => {
  if (!cloudAdminSignedIn) { Alert.alert('Administrator Sign-in Required', 'Sign in with the group administrator member number and PIN first.'); return; }
  if (selectedGroupId === null) {
    Alert.alert('Select Group', 'Choose the registered group to back up.');
    return;
  }
  if (recoveryPassphrase.trim().length < 12) {
    Alert.alert('Passphrase Required', 'Use a passphrase of at least 12 characters and keep it safe. You need it on another phone to decrypt the backup.');
    return;
  }
  try {
    setGroupCloudBusy(true);
    const local = await exportGroupDatabaseBackup(selectedGroupId);
    if (!local.success) throw new Error(local.error || local.message);
    const result = await uploadGroupDatabaseBackupToCloud(selectedGroupId, recoveryPassphrase);
    if (!result.success) throw new Error(result.error || result.message);
    Alert.alert('Group Backup Saved', result.message);
  } catch (error) {
    Alert.alert('Group Backup Failed', error instanceof Error ? error.message : 'Could not upload group backup.');
  } finally { setGroupCloudBusy(false); }
};

const handleFindCloudGroupBackups = async () => {
  if (!cloudAdminSignedIn) { Alert.alert('Administrator Sign-in Required', 'Sign in with the group administrator first.'); return; }
  if (!groupNumberInput.trim()) {
    Alert.alert('Group Number Required', 'Enter the KYA group number, for example KYA2012.');
    return;
  }
  if (recoveryPassphrase.trim().length < 12) {
    Alert.alert('Passphrase Required', 'Enter the same cloud backup passphrase used when the backup was created.');
    return;
  }
  try {
    setGroupCloudBusy(true);
    const result = await listCloudGroupBackups(recoveryPassphrase, groupNumberInput);
    if (!result.success) throw new Error(result.error || result.message);
    setCloudGroupBackups(result.backups);
    if (!result.backups.length) Alert.alert('No Cloud Backups', result.message);
  } catch (error) {
    Alert.alert('Cloud Recovery', error instanceof Error ? error.message : 'Could not find backups.');
  } finally { setGroupCloudBusy(false); }
};

const handleRestoreCloudGroup = (backup: CloudBackupFileInfo) => {
  Alert.alert('Restore Group', `Restore ${groupNumberInput.trim()} from this encrypted cloud backup? The local database must be empty; existing local records will be protected.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Restore', onPress: async () => {
      try {
        setGroupCloudBusy(true);
        const result = await restoreCloudGroupDatabaseBackup(backup, recoveryPassphrase, groupNumberInput);
        if (!result.success) throw new Error(result.error || result.message);
        Alert.alert('Group Restored', result.message);
      } catch (error) {
        Alert.alert('Restore Stopped', error instanceof Error ? error.message : 'Could not restore this group.');
      } finally { setGroupCloudBusy(false); }
    } },
  ]);
};

const loadBackupFiles = useCallback(async () => {
try {
setLoading(true);
const files = await listBackupFiles();
setBackupFiles(files);
} catch (error) {
console.error('Error loading backups:', error);
Alert.alert('Error', 'Could not load backup files');
} finally {
setLoading(false);
}
}, []);

useFocusEffect(
useCallback(() => {
  void loadBackupFiles();
  void loadConsent();
  void loadGroups();
}, [loadBackupFiles, loadConsent, loadGroups])
);

const handleCloudBackupConsent = async () => {
  if (cloudBackupConsent === null) return;
  const nextValue = !cloudBackupConsent;
  try {
    setChangingConsent(true);
    const saved = await setAutomaticCloudBackupConsent(nextValue);
    if (!saved.success) throw new Error(saved.error || saved.message);
    if (nextValue) {
      setCloudBackupConsent(true);
      await registerAutomaticBackupTask();
      setCloudBackupStatus('Consent enabled. Starting the first encrypted cloud backup.');
      const result = await runAutomaticCloudBackup(true);
      setCloudBackupStatus(result.message);
      if (!result.success && !result.skipped) Alert.alert('Cloud Backup Pending', result.error || result.message);
    } else {
      await unregisterAutomaticBackupTask();
      setCloudBackupConsent(false);
      setCloudBackupStatus('Automatic cloud uploads are disabled. Local backups remain available.');
    }
  } catch (error) {
    setCloudBackupStatus('Could not update the automatic backup setting.');
    Alert.alert('Automatic Backup', error instanceof Error ? error.message : 'Could not update setting.');
  } finally { setChangingConsent(false); }
};

const handleExportBackup = async () => {
try {
setExporting(true);

  const result = await exportDatabaseBackup();

  if (!result.success) {
    Alert.alert('Backup Failed', result.error || result.message);
    return;
  }

  Alert.alert('Backup Created', result.message, [
    {
      text: 'Send via Email',
      onPress: () => {
        if (result.filePath && result.fileName) {
          handleEmailBackup(result.filePath, result.fileName);
        }
      },
    },
    {
      text: 'Done',
      onPress: () => loadBackupFiles(),
      style: 'cancel',
    },
  ]);
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Unknown error';

  Alert.alert('Error', message);
} finally {
  setExporting(false);
}

};

const handleEmailBackup = async (
filePath: string,
fileName: string
) => {
try {
const result = await emailBackupFile(filePath, fileName);

  if (!result.success) {
    Alert.alert('Email Failed', result.error || result.message);
    return;
  }

  Alert.alert('Email Sent', result.message, [
    {
      text: 'OK',
      onPress: () => loadBackupFiles(),
    },
  ]);
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Unknown error';

  Alert.alert('Error', message);
}

};

const handleRestoreBackup = async (filePath: string) => {
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

          const result = await restoreDatabaseBackup(filePath);

          if (!result.success) {
            Alert.alert(
              'Restore Failed',
              result.error || result.message
            );
            return;
          }

          Alert.alert('Restore Complete', result.message, [
            {
              text: 'OK',
              onPress: () => loadBackupFiles(),
            },
          ]);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Unknown error';

          Alert.alert('Restore Failed', message);
        } finally {
          setRestoringFile(null);
        }
      },
    },
  ]
);

};

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
      'No backup file was selected.'
    );
    return;
  }

  const fileName = file.name || 'Selected backup';

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
                  restoreResult.message
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
              ]
            );
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : 'Unknown error';

            Alert.alert(
              'Restore Failed',
              message
            );
          } finally {
            setRestoringFile(null);
          }
        },
      },
    ]
  );
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : 'Could not select backup file';

  Alert.alert('Restore Failed', message);
}

};

const handleDeleteBackup = async (filePath: string) => {
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
              result.error || result.message
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
  ]
);

};

return (
<ScrollView
style={styles.container}
contentContainerStyle={styles.content}
>
<View style={styles.header}>
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel="Go back to previous screen"
  style={styles.backButton}
  onPress={() => { if (navigation.canGoBack()) navigation.goBack(); else Alert.alert('Navigation', 'There is no previous screen to return to.'); }}
>
  <Text style={styles.backButtonText}>‹  Back</Text>
</TouchableOpacity>
<Text style={styles.title}>
Data Backup & Restore
</Text>

    <Text style={styles.subtitle}>
      Backup your data before uninstalling the app
    </Text>
  </View>

  <View style={styles.section}>
    <Text style={styles.sectionTitle}>Cloudflare Backup & Restore</Text>
    <TextInput value={cloudAdminMemberNumber} onChangeText={setCloudAdminMemberNumber} placeholder="Administrator member number (KYA2010001)" autoCapitalize="characters" style={styles.recoveryInput} />
    <TextInput value={cloudAdminPin} onChangeText={setCloudAdminPin} placeholder="Administrator PIN" secureTextEntry keyboardType="number-pad" style={styles.recoveryInput} />
    <TouchableOpacity style={[styles.button, styles.primaryButton, groupCloudBusy && styles.disabledButton]} onPress={() => void (cloudAdminSignedIn ? handleCloudflareAdminSignOut() : handleCloudflareAdminSignIn())} disabled={groupCloudBusy}>
      <Text style={styles.buttonText}>{cloudAdminSignedIn ? 'Sign Out of Cloudflare' : 'Sign In as Group Administrator'}</Text>
    </TouchableOpacity>
    <Text style={styles.bodyText}>Sign in as the group administrator to upload, list and restore encrypted group backups using Cloudflare Worker, R2 and D1.</Text>
    <View style={styles.infoBox}><Text style={styles.infoText}>Cloudflare backup requires an active group administrator account. Backups are encrypted on this device before upload.</Text></View>
  </View>



<View style={styles.section}>
  <Text style={styles.sectionTitle}>Group Cloud Backup & Recovery</Text>
  <Text style={styles.bodyText}>Create an encrypted backup for one group, or recover that group on another phone. Use a passphrase of at least 12 characters and keep it somewhere safe. The app cannot recover a forgotten passphrase.</Text>
  {groups.length ? groups.map((group) => (
    <TouchableOpacity key={group.id} onPress={() => setSelectedGroupId(group.id)} style={[styles.groupChoice, selectedGroupId === group.id && styles.groupChoiceSelected]}>
      <Text style={styles.groupChoiceText}>{selectedGroupId === group.id ? '✓ ' : ''}KYA {group.group_number} — {group.group_name}</Text>
    </TouchableOpacity>
  )) : <Text style={styles.bodyText}>No locally registered groups found for creating a group backup.</Text>}
  <TextInput value={recoveryPassphrase} onChangeText={setRecoveryPassphrase} placeholder="Cloud backup passphrase (12+ characters)" secureTextEntry autoCapitalize="none" style={styles.recoveryInput} />
  <TouchableOpacity accessibilityRole="button" style={[styles.button, styles.primaryButton, groupCloudBusy && styles.disabledButton]} onPress={() => void handleUploadGroupBackup()} disabled={groupCloudBusy}>
    {groupCloudBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Encrypted Group Cloud Backup</Text>}
  </TouchableOpacity>
  <TextInput value={groupNumberInput} onChangeText={setGroupNumberInput} placeholder="Group number to restore (e.g. KYA2012)" autoCapitalize="characters" style={styles.recoveryInput} />
  <TouchableOpacity accessibilityRole="button" style={[styles.button, styles.importButton, groupCloudBusy && styles.disabledButton]} onPress={() => void handleFindCloudGroupBackups()} disabled={groupCloudBusy}>
    <Text style={styles.importButtonText}>Find Group Backups in Cloud</Text>
  </TouchableOpacity>
  {cloudGroupBackups.map((backup) => (
    <View key={backup.objectId} style={styles.backupCard}>
      <View style={styles.backupInfo}><Text style={styles.backupName}>{backup.name}</Text><Text style={styles.backupDetails}>{backup.backupCreatedAt || backup.createdAt}</Text></View>
      <TouchableOpacity style={[styles.iconButton, styles.restoreButton, groupCloudBusy && styles.disabledButton]} onPress={() => handleRestoreCloudGroup(backup)} disabled={groupCloudBusy}><Text style={styles.buttonIcon}>↩️</Text></TouchableOpacity>
    </View>
  ))}
</View>

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
                    file.name
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

  <View style={styles.section}>
    <Text style={styles.sectionTitle}>
      After Reinstalling
    </Text>

    <View style={styles.instructionBox}>
      <Text style={styles.instructionTitle}>
        How to Restore:
      </Text>

      <View style={styles.instructionStep}>
        <Text style={styles.stepNumber}>1</Text>
        <Text style={styles.stepText}>
          Install Ebadsave VSLA
        </Text>
      </View>

      <View style={styles.instructionStep}>
        <Text style={styles.stepNumber}>2</Text>
        <Text style={styles.stepText}>
          Open Data Backup & Restore
        </Text>
      </View>

      <View style={styles.instructionStep}>
        <Text style={styles.stepNumber}>3</Text>
        <Text style={styles.stepText}>
          Tap "Import Backup File"
        </Text>
      </View>

      <View style={styles.instructionStep}>
        <Text style={styles.stepNumber}>4</Text>
        <Text style={styles.stepText}>
          Select your Ebadsave backup JSON file
        </Text>
      </View>

      <View style={styles.instructionStep}>
        <Text style={styles.stepNumber}>5</Text>
        <Text style={styles.stepText}>
          Confirm Restore and wait for completion
        </Text>
      </View>
    </View>
  </View>

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
        Keep a verified local backup and use the existing approved cloud backup until Cloudflare recovery has been tested.
      </Text>
    </View>
  </View>
</ScrollView>

);
}

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

backButton: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12, borderRadius: 8, backgroundColor: '#e5e7eb' },
backButtonText: { color: '#1f2937', fontSize: 16, fontWeight: '700' },

title: {
fontSize: 28,
fontWeight: 'bold',
color: '#1f2937',
marginBottom: 4,
},

subtitle: {
fontSize: 14,
color: '#6b7280',
},

section: {
marginBottom: 24,
},

groupChoice: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, marginTop: 6, backgroundColor: '#fff' },
groupChoiceSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
groupChoiceText: { color: '#1f2937', fontSize: 13 },
recoveryInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', marginTop: 10, color: '#111827' },
sectionTitle: {
fontSize: 16,
fontWeight: '600',
color: '#1f2937',
marginBottom: 12,
},
bodyText: { fontSize: 13, color: '#4b5563', lineHeight: 19, marginBottom: 12 },
consentButton: { backgroundColor: '#16a34a', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 8, marginBottom: 12, alignItems: 'center' },
disableConsentButton: { backgroundColor: '#b91c1c' },
consentButtonText: { color: '#fff', fontWeight: '700', textAlign: 'center' },

infoBox: {
backgroundColor: '#ecfdf5',
borderLeftWidth: 4,
borderLeftColor: '#16a34a',
padding: 12,
borderRadius: 8,
marginBottom: 16,
},

infoText: {
fontSize: 13,
color: '#047857',
lineHeight: 20,
},

button: {
paddingVertical: 12,
paddingHorizontal: 16,
borderRadius: 8,
flexDirection: 'row',
alignItems: 'center',
justifyContent: 'center',
gap: 8,
},

primaryButton: {
backgroundColor: '#16a34a',
},

importButton: {
backgroundColor: '#dbeafe',
marginTop: 10,
},

buttonIcon: {
fontSize: 20,
},

buttonText: {
color: '#ffffff',
fontSize: 15,
fontWeight: '600',
},

importButtonText: {
color: '#1d4ed8',
fontSize: 15,
fontWeight: '600',
},

disabledButton: {
opacity: 0.6,
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
borderRadius: 8,
padding: 24,
alignItems: 'center',
},

emptyTitle: {
fontSize: 15,
fontWeight: '600',
color: '#374151',
marginBottom: 4,
},

emptyText: {
fontSize: 13,
color: '#6b7280',
},

backupCard: {
backgroundColor: '#ffffff',
borderRadius: 8,
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
},

backupName: {
fontSize: 13,
fontWeight: '600',
color: '#1f2937',
marginBottom: 2,
},

backupDetails: {
fontSize: 12,
color: '#9ca3af',
},

backupActions: {
flexDirection: 'row',
gap: 8,
},

iconButton: {
width: 36,
height: 36,
borderRadius: 6,
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
borderRadius: 8,
padding: 16,
},

instructionTitle: {
fontSize: 14,
fontWeight: '600',
color: '#1f2937',
marginBottom: 12,
},

instructionStep: {
flexDirection: 'row',
marginBottom: 12,
alignItems: 'flex-start',
gap: 12,
},

stepNumber: {
width: 24,
height: 24,
borderRadius: 12,
backgroundColor: '#16a34a',
color: '#ffffff',
fontSize: 12,
fontWeight: 'bold',
textAlign: 'center',
textAlignVertical: 'center',
paddingTop: 2,
},

stepText: {
flex: 1,
fontSize: 13,
color: '#374151',
lineHeight: 18,
paddingTop: 2,
},

tipBox: {
backgroundColor: '#ffffff',
borderRadius: 8,
padding: 12,
marginBottom: 12,
borderLeftWidth: 3,
borderLeftColor: '#fbbf24',
},

tipTitle: {
fontSize: 13,
fontWeight: '600',
color: '#1f2937',
marginBottom: 4,
},

tipText: {
fontSize: 12,
color: '#6b7280',
lineHeight: 18,
},
});
