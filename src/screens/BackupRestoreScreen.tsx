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
  exportGroupDatabaseBackup,
  uploadGroupDatabaseBackupToCloud,
  listCloudGroupBackups,
  restoreCloudGroupDatabaseBackup,
  type CloudBackupFileInfo,
} from '../database/backup';
import {
  registerAutomaticBackupTask,
  unregisterAutomaticBackupTask,
} from '../services/backupBackground';
import {
  getAllGroups,
  type GroupRecord,
} from '../database/database';

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
  const [cloudBackupStatus, setCloudBackupStatus] = useState('Checking automatic cloud backup status...');
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupNumberInput, setGroupNumberInput] = useState('');
  const [recoveryPassphrase, setRecoveryPassphrase] = useState('');
  const [cloudGroupBackups, setCloudGroupBackups] = useState<CloudBackupFileInfo[]>([]);
  const [groupCloudBusy, setGroupCloudBusy] = useState(false);

  const handleGoBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home');
    }
  };

  const loadConsent = useCallback(async () => {
    try {
      const enabled = await getAutomaticCloudBackupConsent();
      setCloudBackupConsent(enabled);
      setCloudBackupStatus(
        enabled
          ? 'Automatic encrypted cloud backups are enabled.'
          : 'Automatic cloud backup is disabled.'
      );
    } catch {
      setCloudBackupStatus('Unable to verify automatic cloud backup settings.');
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const result = await getAllGroups();
      setGroups(result);
      setSelectedGroupId((currentId) => {
        if (currentId !== null && result.some((g) => g.id === currentId)) return currentId;
        return result.length > 0 ? result[0].id : null;
      });
    } catch {
      setGroups([]);
      setSelectedGroupId(null);
    }
  }, []);

  const loadBackupFiles = useCallback(async () => {
    try {
      setLoading(true);
      const files = await listBackupFiles();
      setBackupFiles(files);
    } catch {
      Alert.alert('Backup Files', 'Could not load local backup files.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBackupFiles();
      loadConsent();
      loadGroups();
    }, [loadBackupFiles, loadConsent, loadGroups])
  );

  const handleCloudBackupConsent = async () => {
    if (cloudBackupConsent === null || changingConsent) return;
    const nextValue = !cloudBackupConsent;
    try {
      setChangingConsent(true);
      const saved = await setAutomaticCloudBackupConsent(nextValue);
      if (!saved.success) throw new Error(saved.error || 'Could not save consent.');
      if (nextValue) {
        setCloudBackupConsent(true);
        await registerAutomaticBackupTask();
        setCloudBackupStatus('Consent enabled. Starting first backup...');
        const result = await runAutomaticCloudBackup(true);
        setCloudBackupStatus(result.message);
      } else {
        await unregisterAutomaticBackupTask();
        setCloudBackupConsent(false);
        setCloudBackupStatus('Automatic cloud uploads disabled.');
      }
    } catch (e: any) {
      Alert.alert('Automatic Backup', e.message);
    } finally {
      setChangingConsent(false);
    }
  };

  const handleUploadGroupBackup = async () => {
    if (groupCloudBusy) return;
    if (selectedGroupId === null) {
      Alert.alert('Select Group', 'No local group available to back up.');
      return;
    }
    if (recoveryPassphrase.trim().length < 12) {
      Alert.alert('Passphrase Required', 'Enter at least 12 characters.');
      return;
    }
    try {
      setGroupCloudBusy(true);
      const localResult = await exportGroupDatabaseBackup(selectedGroupId);
      if (!localResult.success) throw new Error(localResult.error || 'Could not create backup.');
      const uploadResult = await uploadGroupDatabaseBackupToCloud(selectedGroupId, recoveryPassphrase);
      if (!uploadResult.success) throw new Error(uploadResult.error || 'Upload failed.');
      Alert.alert('Group Backup Saved', uploadResult.message || 'Uploaded successfully.');
    } catch (e: any) {
      Alert.alert('Group Backup Failed', e.message);
    } finally {
      setGroupCloudBusy(false);
    }
  };

  const handleFindCloudGroupBackups = async () => {
    if (groupCloudBusy) return;
    const normalized = groupNumberInput.trim().toUpperCase().replace(/\s+/g, '');
    if (!normalized) {
      Alert.alert('Group Number Required', 'Enter group number e.g. KYA2012');
      return;
    }
    if (recoveryPassphrase.trim().length < 12) {
      Alert.alert('Passphrase Required', 'Enter passphrase used for backup.');
      return;
    }
    try {
      setGroupCloudBusy(true);
      setCloudGroupBackups([]);
      const result = await listCloudGroupBackups(recoveryPassphrase, normalized);
      if (!result.success) throw new Error(result.error || 'Search failed.');
      setCloudGroupBackups(result.backups || []);
      setGroupNumberInput(normalized);
      if (!result.backups?.length) {
        Alert.alert('No Cloud Backups', result.message || `No backups for ${normalized}`);
      }
    } catch (e: any) {
      Alert.alert('Cloud Recovery', e.message);
    } finally {
      setGroupCloudBusy(false);
    }
  };

  const handleRestoreCloudGroup = (backup: CloudBackupFileInfo) => {
    if (groupCloudBusy) return;
    Alert.alert('Restore Group', `Restore ${groupNumberInput} from cloud?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: async () => {
          try {
            setGroupCloudBusy(true);
            const result = await restoreCloudGroupDatabaseBackup(backup, recoveryPassphrase, groupNumberInput.trim().toUpperCase().replace(/\s+/g, ''));
            if (!result.success) throw new Error(result.error || 'Restore failed.');
            Alert.alert('Group Restored', result.message || 'Completed.', [{ text: 'OK', onPress: () => { loadGroups(); loadBackupFiles(); } }]);
          } catch (e: any) {
            Alert.alert('Restore Stopped', e.message);
          } finally {
            setGroupCloudBusy(false);
          }
        },
      },
    ]);
  };

  const handleExportBackup = async () => {
    if (exporting) return;
    try {
      setExporting(true);
      const result = await exportDatabaseBackup();
      if (!result.success) {
        Alert.alert('Backup Failed', result.error || result.message);
        return;
      }
      Alert.alert('Backup Created', result.message, [
        { text: 'Send via Email', onPress: () => result.filePath && result.fileName && handleEmailBackup(result.filePath, result.fileName) },
        { text: 'Done', onPress: () => loadBackupFiles() },
      ]);
    } catch (e: any) {
      Alert.alert('Backup Error', e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleEmailBackup = async (filePath: string, fileName: string) => {
    try {
      const result = await emailBackupFile(filePath, fileName);
      Alert.alert('Email Backup', result.message);
    } catch (e: any) {
      Alert.alert('Email Backup', e.message);
    }
  };

  const handleRestoreBackup = (filePath: string) => {
    Alert.alert('Restore Backup', 'Overwrite current data?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        style: 'destructive',
        onPress: async () => {
          try {
            setRestoringFile(filePath);
            const result = await restoreDatabaseBackup(filePath);
            if (!result.success) throw new Error(result.error || result.message);
            Alert.alert('Restore Complete', result.message, [{ text: 'OK', onPress: () => { loadBackupFiles(); loadGroups(); } }]);
          } catch (e: any) {
            Alert.alert('Restore Failed', e.message);
          } finally {
            setRestoringFile(null);
          }
        },
      },
    ]);
  };

  const handlePickBackupFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file?.uri) return;
      Alert.alert('Restore Backup', `Restore "${file.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            try {
              setRestoringFile(file.uri);
              const r = await restoreDatabaseBackup(file.uri);
              if (!r.success) throw new Error(r.error || r.message);
              Alert.alert('Restore Complete', r.message, [{ text: 'OK', onPress: () => { loadBackupFiles(); loadGroups(); } }]);
            } catch (e: any) {
              Alert.alert('Restore Failed', e.message);
            } finally {
              setRestoringFile(null);
            }
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert('Backup File', e.message);
    }
  };

  const handleDeleteBackup = (filePath: string) => {
    Alert.alert('Delete Backup', 'Permanently delete?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteBackupFile(filePath);
          if (result.success) loadBackupFiles();
          else Alert.alert('Delete Failed', result.error || result.message);
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack} activeOpacity={0.7}>
          <Text style={styles.backButtonText}>{'‹  Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Data Backup & Restore</Text>
        <Text style={styles.subtitle}>Protect your group data and recover it on another phone.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Automatic Back4App Backup</Text>
        <TouchableOpacity
          style={[styles.consentButton, cloudBackupConsent === true ? styles.disableConsentButton : null, (changingConsent || cloudBackupConsent === null) && styles.disabledButton]}
          onPress={handleCloudBackupConsent}
          disabled={changingConsent || cloudBackupConsent === null}
          activeOpacity={0.8}
        >
          {changingConsent ? <ActivityIndicator color="#fff" /> : <Text style={styles.consentButtonText}>{cloudBackupConsent === null ? 'Checking...' : cloudBackupConsent ? 'Disable Automatic Cloud Backup' : 'Enable Automatic Cloud Backup'}</Text>}
        </TouchableOpacity>
        <View style={styles.infoBox}><Text style={styles.infoText}>{cloudBackupStatus}</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Group Cloud Backup & Recovery</Text>
        {groups.length > 0 ? (
          groups.map((group) => (
            <TouchableOpacity key={group.id} onPress={() => setSelectedGroupId(group.id)} style={[styles.groupChoice, selectedGroupId === group.id && styles.groupChoiceSelected]} activeOpacity={0.7}>
              <Text style={styles.groupChoiceText}>{selectedGroupId === group.id ? '✓  ' : ''}KYA {group.group_number} — {group.group_name}</Text>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyCloudBox}><Text style={styles.emptyCloudTitle}>No groups on this phone yet</Text><Text style={styles.emptyCloudText}>You can still search for cloud backup below.</Text></View>
        )}

        <Text style={styles.fieldLabel}>Cloud backup passphrase</Text>
        <TextInput value={recoveryPassphrase} onChangeText={setRecoveryPassphrase} placeholder="Enter passphrase (12+ chars)" secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.recoveryInput} editable={!groupCloudBusy} />

        <TouchableOpacity style={[styles.button, styles.primaryButton, groupCloudBusy && styles.disabledButton]} onPress={handleUploadGroupBackup} disabled={groupCloudBusy} activeOpacity={0.8}>
          {groupCloudBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Encrypted Group Cloud Backup</Text>}
        </TouchableOpacity>

        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Group number to recover</Text>
        <TextInput value={groupNumberInput} onChangeText={setGroupNumberInput} placeholder="Enter group number (e.g. KYA2012)" autoCapitalize="characters" autoCorrect={false} style={styles.recoveryInput} editable={!groupCloudBusy} />

        <TouchableOpacity style={[styles.button, styles.importButton, groupCloudBusy && styles.disabledButton]} onPress={handleFindCloudGroupBackups} disabled={groupCloudBusy} activeOpacity={0.8}>
          {groupCloudBusy ? <ActivityIndicator color="#1d4ed8" /> : <Text style={styles.importButtonText}>Find Group Backups in Cloud</Text>}
        </TouchableOpacity>

        {cloudGroupBackups.length > 0 && (
          <View style={styles.cloudResults}>
            <Text style={styles.resultsTitle}>Available Cloud Backups</Text>
            {cloudGroupBackups.map((backup) => (
              <View key={backup.objectId} style={styles.backupCard}>
                <View style={styles.backupInfo}><Text style={styles.backupName} numberOfLines={2}>{backup.name}</Text><Text style={styles.backupDetails}>{backup.backupCreatedAt || backup.createdAt || 'Date unavailable'}</Text></View>
                <TouchableOpacity style={[styles.cloudRestoreButton, groupCloudBusy && styles.disabledButton]} onPress={() => handleRestoreCloudGroup(backup)} disabled={groupCloudBusy} activeOpacity={0.8}><Text style={styles.cloudRestoreButtonText}>Restore</Text></TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create Local Backup</Text>
        <TouchableOpacity style={[styles.button, styles.primaryButton, exporting && styles.disabledButton]} onPress={handleExportBackup} disabled={exporting} activeOpacity={0.8}>
          {exporting ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonIcon}>📦</Text><Text style={styles.buttonText}>Create Backup</Text></>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.importButton, restoringFile !== null && styles.disabledButton]} onPress={handlePickBackupFile} disabled={restoringFile !== null} activeOpacity={0.8}>
          <Text style={styles.buttonIcon}>📂</Text><Text style={styles.importButtonText}>Import Backup File</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved Backups</Text>
        {loading ? <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#16a34a" /><Text style={styles.loadingText}>Loading...</Text></View> : backupFiles.length === 0 ? <View style={styles.emptyBox}><Text style={styles.emptyTitle}>No local backups yet</Text></View> : backupFiles.map((file, index) => (
          <View key={`${file.path}-${index}`} style={styles.backupCard}>
            <View style={styles.backupInfo}><Text style={styles.backupName} numberOfLines={2}>{file.name}</Text><Text style={styles.backupDetails}>{file.timestamp} • {formatFileSize(file.size)}</Text></View>
            <View style={styles.backupActions}>
              <TouchableOpacity style={[styles.iconButton, styles.restoreButton]} onPress={() => handleRestoreBackup(file.path)} activeOpacity={0.7}><Text style={styles.buttonIcon}>↩️</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.iconButton, styles.emailButton]} onPress={() => handleEmailBackup(file.path, file.name)} activeOpacity={0.7}><Text style={styles.buttonIcon}>✉️</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.iconButton, styles.deleteButton]} onPress={() => handleDeleteBackup(file.path)} activeOpacity={0.7}><Text style={styles.buttonIcon}>🗑️</Text></TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.bottomBackButton} onPress={handleGoBack} activeOpacity={0.7}><Text style={styles.bottomBackButtonText}>‹  Return to Previous Screen</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 24 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, marginBottom: 14, borderRadius: 8, backgroundColor: '#e5e7eb' },
  backButtonText: { color: '#1f2937', fontSize: 16, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1f2937', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6b7280', lineHeight: 21 },
  section: { marginBottom: 26 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 8, marginBottom: 6 },
  fieldLabelSpaced: { marginTop: 20 },
  groupChoice: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 13, marginBottom: 7, backgroundColor: '#fff' },
  groupChoiceSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  groupChoiceText: { color: '#1f2937', fontSize: 14 },
  recoveryInput: { minHeight: 52, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 14, backgroundColor: '#fff', marginTop: 5, color: '#111827', fontSize: 16 },
  consentButton: { backgroundColor: '#16a34a', paddingVertical: 14, borderRadius: 9, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  disableConsentButton: { backgroundColor: '#b91c1c' },
  consentButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  infoBox: { backgroundColor: '#ecfdf5', borderLeftWidth: 4, borderLeftColor: '#16a34a', padding: 13, borderRadius: 8, marginTop: 12 },
  infoText: { fontSize: 13, color: '#047857', lineHeight: 20 },
  emptyCloudBox: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, padding: 15, marginBottom: 12 },
  emptyCloudTitle: { color: '#1e40af', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  emptyCloudText: { color: '#1e3a8a', fontSize: 13 },
  button: { minHeight: 54, paddingVertical: 14, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  primaryButton: { backgroundColor: '#16a34a' },
  importButton: { backgroundColor: '#dbeafe' },
  buttonIcon: { fontSize: 18 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  importButtonText: { color: '#1d4ed8', fontSize: 15, fontWeight: '700' },
  disabledButton: { opacity: 0.6 },
  cloudResults: { marginTop: 20 },
  resultsTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  cloudRestoreButton: { backgroundColor: '#16a34a', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 7, marginLeft: 10 },
  cloudRestoreButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  loadingContainer: { alignItems: 'center', paddingVertical: 32 },
  loadingText: { marginTop: 12, color: '#6b7280' },
  emptyBox: { backgroundColor: '#f3f4f6', borderRadius: 9, padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
  backupCard: { backgroundColor: '#fff', borderRadius: 9, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  backupInfo: { flex: 1 },
  backupName: { fontSize: 13, fontWeight: '700', color: '#1f2937', marginBottom: 5 },
  backupDetails: { fontSize: 12, color: '#6b7280' },
  backupActions: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  iconButton: { width: 36, height: 36, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  restoreButton: { backgroundColor: '#dbeafe' },
  emailButton: { backgroundColor: '#fef3c7' },
  deleteButton: { backgroundColor: '#fee2e2' },
  bottomBackButton: { backgroundColor: '#e5e7eb', borderRadius: 9, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  bottomBackButtonText: { color: '#1f2937', fontSize: 15, fontWeight: '700' },
});
