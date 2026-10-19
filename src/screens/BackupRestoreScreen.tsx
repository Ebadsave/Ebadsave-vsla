import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from '@react-navigation/native';

import type { CloudBackupFileInfo } from './backup';
import {
  deleteBackupFile,
  emailBackupFile,
  exportDatabaseBackup,
  formatFileSize,
  listBackupFiles,
  listCloudBackups,
  restoreCloudDatabaseBackup,
  restoreDatabaseBackup,
  uploadDatabaseBackupToCloud,
} from './backup';

interface BackupFile {
  name: string;
  path: string;
  size: number;
  timestamp: string;
}

type CloudPassphraseAction = 'upload' | 'list' | 'restore';

export default function BackupRestoreScreen() {
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupFileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [passphraseModalVisible, setPassphraseModalVisible] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState('');
  const [cloudAction, setCloudAction] = useState<CloudPassphraseAction>('upload');
  const [selectedCloudBackup, setSelectedCloudBackup] = useState<CloudBackupFileInfo | null>(null);

  const loadBackupFiles = useCallback(async () => {
    try {
      setLoading(true);
      const files = await listBackupFiles();
      setBackupFiles(files);
    } catch (error) {
      console.error('Error loading backups:', error);
      Alert.alert('Error', 'Could not load local backup files.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBackupFiles();
    }, [loadBackupFiles]),
  );

  const openPassphraseModal = (action: CloudPassphraseAction, backup?: CloudBackupFileInfo) => {
    setCloudAction(action);
    setSelectedCloudBackup(backup || null);
    setPassphrase('');
    setPassphraseError('');
    setPassphraseModalVisible(true);
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
              void handleEmailBackup(result.filePath, result.fileName);
            }
          },
        },
        {
          text: 'Done',
          onPress: () => void loadBackupFiles(),
          style: 'cancel',
        },
      ]);
      await loadBackupFiles();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  };

  const handleEmailBackup = async (filePath: string, fileName: string) => {
    try {
      const result = await emailBackupFile(filePath, fileName);
      if (!result.success) {
        Alert.alert('Email Failed', result.error || result.message);
        return;
      }
      Alert.alert('Email Backup', result.message);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleRestoreBackup = (filePath: string) => {
    Alert.alert('Restore Backup', 'This will overwrite the current Ebadsave records. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        style: 'destructive',
        onPress: async () => {
          try {
            setRestoringFile(filePath);
            const result = await restoreDatabaseBackup(filePath);
            if (!result.success) {
              Alert.alert('Restore Failed', result.error || result.message);
              return;
            }
            Alert.alert('Restore Complete', result.message, [
              { text: 'OK', onPress: () => void loadBackupFiles() },
            ]);
          } catch (error) {
            Alert.alert('Restore Failed', error instanceof Error ? error.message : 'Unknown error');
          } finally {
            setRestoringFile(null);
          }
        },
      },
    ]);
  };

  const handlePickBackupFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file?.uri) {
        Alert.alert('Restore Failed', 'No backup file was selected.');
        return;
      }

      Alert.alert(
        'Restore Backup File',
        `Restore "${file.name || 'Selected backup'}"?\n\nThis will overwrite the current Ebadsave records.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              try {
                setRestoringFile(file.uri);
                const restoreResult = await restoreDatabaseBackup(file.uri);
                if (!restoreResult.success) {
                  Alert.alert('Restore Failed', restoreResult.error || restoreResult.message);
                  return;
                }
                Alert.alert('Restore Complete', restoreResult.message, [
                  { text: 'OK', onPress: () => void loadBackupFiles() },
                ]);
              } catch (error) {
                Alert.alert('Restore Failed', error instanceof Error ? error.message : 'Unknown error');
              } finally {
                setRestoringFile(null);
              }
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('Restore Failed', error instanceof Error ? error.message : 'Could not select backup file');
    }
  };

  const handleDeleteBackup = (filePath: string) => {
    Alert.alert('Delete Local Backup', 'This local backup file will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await deleteBackupFile(filePath);
            if (!result.success) {
              Alert.alert('Delete Failed', result.error || result.message);
              return;
            }
            await loadBackupFiles();
          } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'Unknown error');
          }
        },
      },
    ]);
  };

  const handlePassphraseSubmit = async () => {
    const submittedPassphrase = passphrase.trim();
    if (submittedPassphrase.length < 12) {
      setPassphraseError('Enter the same cloud passphrase (at least 12 characters).');
      return;
    }

    setPassphraseModalVisible(false);
    setCloudBusy(true);
    setPassphraseError('');

    try {
      if (cloudAction === 'upload') {
        setExporting(true);
        const local = await exportDatabaseBackup();
        if (!local.success || !local.filePath || !local.fileName) {
          Alert.alert('Local Backup Failed', local.error || local.message);
          return;
        }

        // A separate encrypted copy is uploaded. The original local JSON backup stays on the phone.
        const uploaded = await uploadDatabaseBackupToCloud(
          local.filePath,
          local.fileName,
          submittedPassphrase,
        );
        await loadBackupFiles();
        if (!uploaded.success) {
          Alert.alert(
            'Internet Backup Failed',
            `${uploaded.error || uploaded.message}\n\nA local backup was still saved on this device as ${local.fileName}.`,
          );
          return;
        }

        const listed = await listCloudBackups(submittedPassphrase);
        if (listed.success) setCloudBackups(listed.backups);
        Alert.alert('Internet Backup Complete', uploaded.message);
      } else if (cloudAction === 'list') {
        const listed = await listCloudBackups(submittedPassphrase);
        if (!listed.success) {
          Alert.alert('Internet Backups', listed.error || listed.message);
          return;
        }
        setCloudBackups(listed.backups);
        Alert.alert('Internet Backups', listed.backups.length
          ? `Found ${listed.backups.length} encrypted backup(s) for this vault.`
          : 'No backups were found for this passphrase.');
      } else {
        if (!selectedCloudBackup) {
          Alert.alert('Restore Failed', 'Select an internet backup first.');
          return;
        }
        const restored = await restoreCloudDatabaseBackup(selectedCloudBackup, submittedPassphrase);
        if (!restored.success) {
          Alert.alert('Internet Restore Failed', restored.error || restored.message);
          return;
        }
        await loadBackupFiles();
        Alert.alert('Internet Restore Complete', restored.message);
      }
    } catch (error) {
      Alert.alert('Internet Backup', error instanceof Error ? error.message : 'Unexpected cloud backup error');
    } finally {
      setCloudBusy(false);
      setExporting(false);
      setPassphrase('');
      setSelectedCloudBackup(null);
    }
  };

  const handleRestoreCloudBackup = (backup: CloudBackupFileInfo) => {
    Alert.alert(
      'Restore Internet Backup',
      `Restore "${backup.name}"? This replaces current Ebadsave records. Existing local backup files will remain unchanged, and an additional local copy of this cloud backup will be saved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => openPassphraseModal('restore', backup),
        },
      ],
    );
  };

  const cloudModalTitle = cloudAction === 'upload'
    ? 'Encrypt & Upload Backup'
    : cloudAction === 'list'
      ? 'Open Your Cloud Backup Vault'
      : 'Decrypt Internet Backup';

  const cloudModalText = cloudAction === 'upload'
    ? 'Create a new local backup and upload an encrypted copy to Back4App. Your local backup file will not be deleted.'
    : cloudAction === 'list'
      ? 'Enter the same passphrase used when the internet backups were created.'
      : `Enter the passphrase used to protect "${selectedCloudBackup?.name || 'this backup'}".`;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Data Backup & Restore</Text>
          <Text style={styles.subtitle}>Keep a local copy and an encrypted internet copy of your Ebadsave data.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Create Backup</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Back up groups, members, meeting records, and financial transactions. Local backups stay on this device unless you manually delete them.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton, exporting && styles.disabledButton]}
            onPress={handleExportBackup}
            disabled={exporting || cloudBusy}
          >
            {exporting ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.buttonText}>📦  Create Local Backup</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.cloudButton, cloudBusy && styles.disabledButton]}
            onPress={() => openPassphraseModal('upload')}
            disabled={cloudBusy || exporting}
          >
            {cloudBusy && cloudAction === 'upload'
              ? <ActivityIndicator color="#ffffff" size="small" />
              : <Text style={styles.buttonText}>☁️  Backup to Internet (Encrypted)</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.importButton, restoringFile !== null && styles.disabledButton]}
            onPress={handlePickBackupFile}
            disabled={restoringFile !== null || cloudBusy}
          >
            {restoringFile ? <ActivityIndicator color="#1d4ed8" size="small" /> : <Text style={styles.importButtonText}>📂  Import Backup File</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Internet Backups</Text>
          <View style={styles.secureInfoBox}>
            <Text style={styles.secureInfoText}>
              Cloud backup contents are encrypted before upload. Use a strong passphrase of at least 12 characters and keep it safe. It is not stored by this app; without it, cloud backups cannot be restored.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.cloudListButton, cloudBusy && styles.disabledButton]}
            onPress={() => openPassphraseModal('list')}
            disabled={cloudBusy}
          >
            <Text style={styles.buttonText}>🌐  Check Internet Backups</Text>
          </TouchableOpacity>

          {cloudBusy ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color="#16a34a" size="small" />
              <Text style={styles.loadingText}>Working with Back4App...</Text>
            </View>
          ) : cloudBackups.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No internet backups loaded</Text>
              <Text style={styles.emptyText}>Tap “Check Internet Backups” and enter your cloud passphrase.</Text>
            </View>
          ) : (
            <View>
              {cloudBackups.map((backup) => (
                <View key={backup.objectId} style={styles.cloudBackupCard}>
                  <View style={styles.backupInfo}>
                    <Text style={styles.backupName} numberOfLines={2}>{backup.name}</Text>
                    <Text style={styles.backupDetails}>
                      {backup.backupCreatedAt ? new Date(backup.backupCreatedAt).toLocaleString() : new Date(backup.createdAt).toLocaleString()}
                    </Text>
                    <Text style={styles.encryptedLabel}>Encrypted in Back4App</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.cloudRestoreButton, cloudBusy && styles.disabledButton]}
                    onPress={() => handleRestoreCloudBackup(backup)}
                    disabled={cloudBusy || restoringFile !== null}
                  >
                    <Text style={styles.cloudRestoreButtonText}>Restore</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saved Local Backups</Text>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#16a34a" />
              <Text style={styles.loadingText}>Loading local backups...</Text>
            </View>
          ) : backupFiles.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No local backups yet</Text>
              <Text style={styles.emptyText}>Create a local backup or upload an encrypted copy to the internet.</Text>
            </View>
          ) : (
            <View>
              {backupFiles.map((file) => (
                <View key={`${file.path}-${file.name}`} style={styles.backupCard}>
                  <View style={styles.backupInfo}>
                    <Text style={styles.backupName} numberOfLines={2}>{file.name}</Text>
                    <Text style={styles.backupDetails}>{file.timestamp} • {formatFileSize(file.size)}</Text>
                  </View>
                  <View style={styles.backupActions}>
                    <TouchableOpacity
                      style={[styles.iconButton, styles.restoreButton, restoringFile === file.path && styles.disabledButton]}
                      onPress={() => handleRestoreBackup(file.path)}
                      disabled={restoringFile !== null || cloudBusy}
                    >
                      {restoringFile === file.path ? <ActivityIndicator color="#16a34a" size="small" /> : <Text style={styles.buttonIcon}>↩️</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.iconButton, styles.emailButton]} onPress={() => void handleEmailBackup(file.path, file.name)}>
                      <Text style={styles.buttonIcon}>✉️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.iconButton, styles.deleteButton]} onPress={() => handleDeleteBackup(file.path)}>
                      <Text style={styles.buttonIcon}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Important</Text>
          <View style={styles.tipBox}>
            <Text style={styles.tipTitle}>Keep your passphrase safe</Text>
            <Text style={styles.tipText}>The encrypted cloud backup cannot be opened without the exact passphrase. Keep it separate from your phone.</Text>
          </View>
          <View style={styles.tipBox}>
            <Text style={styles.tipTitle}>Local backup files are preserved</Text>
            <Text style={styles.tipText}>Uploading to Back4App does not move, rename, overwrite, or delete your existing local backup files. Cloud restore saves an additional local copy first.</Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={passphraseModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPassphraseModalVisible(false);
          setPassphrase('');
          setPassphraseError('');
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{cloudModalTitle}</Text>
            <Text style={styles.modalDescription}>{cloudModalText}</Text>
            <TextInput
              style={styles.passphraseInput}
              value={passphrase}
              onChangeText={(value) => {
                setPassphrase(value);
                if (passphraseError) setPassphraseError('');
              }}
              placeholder="Cloud passphrase (12+ characters)"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={() => void handlePassphraseSubmit()}
            />
            {!!passphraseError && <Text style={styles.errorText}>{passphraseError}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setPassphraseModalVisible(false);
                  setPassphrase('');
                  setPassphraseError('');
                  setSelectedCloudBackup(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalContinueButton]} onPress={() => void handlePassphraseSubmit()}>
                <Text style={styles.modalContinueText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1f2937', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1f2937', marginBottom: 12 },
  infoBox: { backgroundColor: '#ecfdf5', borderLeftWidth: 4, borderLeftColor: '#16a34a', padding: 12, borderRadius: 8, marginBottom: 16 },
  infoText: { fontSize: 13, color: '#047857', lineHeight: 20 },
  secureInfoBox: { backgroundColor: '#eff6ff', borderLeftWidth: 4, borderLeftColor: '#2563eb', padding: 12, borderRadius: 8, marginBottom: 12 },
  secureInfoText: { fontSize: 13, color: '#1e40af', lineHeight: 20 },
  button: { minHeight: 46, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  primaryButton: { backgroundColor: '#16a34a' },
  cloudButton: { backgroundColor: '#15803d' },
  cloudListButton: { backgroundColor: '#166534' },
  importButton: { backgroundColor: '#dbeafe' },
  buttonIcon: { fontSize: 20 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  importButtonText: { color: '#1d4ed8', fontSize: 15, fontWeight: '600' },
  disabledButton: { opacity: 0.55 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  inlineLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  loadingText: { marginTop: 8, fontSize: 14, color: '#6b7280' },
  emptyBox: { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 20, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 4, textAlign: 'center' },
  emptyText: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 19 },
  backupCard: { backgroundColor: '#ffffff', borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  cloudBackupCard: { backgroundColor: '#ffffff', borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#bbf7d0', flexDirection: 'row', alignItems: 'center', gap: 10 },
  backupInfo: { flex: 1, minWidth: 0 },
  backupName: { fontSize: 13, fontWeight: '600', color: '#1f2937', marginBottom: 3 },
  backupDetails: { fontSize: 12, color: '#6b7280' },
  encryptedLabel: { fontSize: 11, color: '#15803d', marginTop: 4, fontWeight: '600' },
  backupActions: { flexDirection: 'row', gap: 8, marginTop: 10, alignSelf: 'flex-end' },
  iconButton: { width: 36, height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  restoreButton: { backgroundColor: '#dbeafe' },
  emailButton: { backgroundColor: '#fef3c7' },
  deleteButton: { backgroundColor: '#fee2e2' },
  cloudRestoreButton: { borderRadius: 7, backgroundColor: '#16a34a', paddingVertical: 10, paddingHorizontal: 12 },
  cloudRestoreButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  tipBox: { backgroundColor: '#ffffff', borderRadius: 8, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#fbbf24' },
  tipTitle: { fontSize: 13, fontWeight: '600', color: '#1f2937', marginBottom: 4 },
  tipText: { fontSize: 12, color: '#6b7280', lineHeight: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.55)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 20, elevation: 8 },
  modalTitle: { fontSize: 19, fontWeight: '700', color: '#111827', marginBottom: 8 },
  modalDescription: { fontSize: 13, color: '#4b5563', lineHeight: 19, marginBottom: 16 },
  passphraseInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, color: '#111827', fontSize: 15 },
  errorText: { color: '#b91c1c', marginTop: 8, fontSize: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  modalButton: { minWidth: 94, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center' },
  modalCancelButton: { backgroundColor: '#f3f4f6' },
  modalContinueButton: { backgroundColor: '#16a34a' },
  modalCancelText: { color: '#374151', fontWeight: '600' },
  modalContinueText: { color: '#ffffff', fontWeight: '700' },
});
