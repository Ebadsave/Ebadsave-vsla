import React, { useCallback, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

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
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);

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
      loadBackupFiles();
    }, [loadBackupFiles])
  );

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
          style: 'default',
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
          onPress: async () => {
            try {
              setRestoringFile(filePath);

              const result = await restoreDatabaseBackup(filePath);

              if (!result.success) {
                Alert.alert('Restore Failed', result.error || result.message);
                return;
              }

              Alert.alert('Success', result.message, [
                {
                  text: 'OK',
                  onPress: () => loadBackupFiles(),
                },
              ]);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Unknown error';
              Alert.alert('Error', message);
            } finally {
              setRestoringFile(null);
            }
          },
          style: 'destructive',
        },
      ]
    );
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
          onPress: async () => {
            try {
              const result = await deleteBackupFile(filePath);

              if (!result.success) {
                Alert.alert('Delete Failed', result.error || result.message);
                return;
              }

              await loadBackupFiles();
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Unknown error';
              Alert.alert('Error', message);
            }
          },
          style: 'destructive',
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
        <Text style={styles.title}>Data Backup & Restore</Text>
        <Text style={styles.subtitle}>
          Backup your data before uninstalling the app
        </Text>
      </View>

      {/* Export Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create Backup</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💾 Create a backup of all your data including groups, members, meetings,
            and financial transactions. The backup file will be saved to your device
            and can be emailed to yourself for safekeeping.
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
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Text style={styles.buttonIcon}>📦</Text>
              <Text style={styles.buttonText}>Create Backup</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Backups List Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved Backups</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#16a34a" />
            <Text style={styles.loadingText}>Loading backups...</Text>
          </View>
        ) : backupFiles.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No backups yet</Text>
            <Text style={styles.emptyText}>
              Create your first backup using the button above
            </Text>
          </View>
        ) : (
          <View>
            {backupFiles.map((file, index) => (
              <View key={index} style={styles.backupCard}>
                <View style={styles.backupInfo}>
                  <Text style={styles.backupName}>{file.name}</Text>
                  <Text style={styles.backupDetails}>
                    {file.timestamp} • {formatFileSize(file.size)}
                  </Text>
                </View>

                <View style={styles.backupActions}>
                  <TouchableOpacity
                    style={[
                      styles.iconButton,
                      styles.restoreButton,
                      restoringFile === file.path && styles.disabledButton,
                    ]}
                    onPress={() => handleRestoreBackup(file.path)}
                    disabled={restoringFile !== null}
                  >
                    {restoringFile === file.path ? (
                      <ActivityIndicator color="#16a34a" size="small" />
                    ) : (
                      <Text style={styles.buttonIcon}>↩️</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.iconButton, styles.emailButton]}
                    onPress={() =>
                      handleEmailBackup(file.path, file.name)
                    }
                  >
                    <Text style={styles.buttonIcon}>✉️</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.iconButton, styles.deleteButton]}
                    onPress={() => handleDeleteBackup(file.path)}
                  >
                    <Text style={styles.buttonIcon}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Restore Instructions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>After Reinstalling</Text>

        <View style={styles.instructionBox}>
          <Text style={styles.instructionTitle}>How to Restore:</Text>

          <View style={styles.instructionStep}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>
              Install Ebadsave VSLA from the app store
            </Text>
          </View>

          <View style={styles.instructionStep}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>
              Open the app and go to Settings
            </Text>
          </View>

          <View style={styles.instructionStep}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>
              Tap "Restore Backup" and select your backup file
            </Text>
          </View>

          <View style={styles.instructionStep}>
            <Text style={styles.stepNumber}>4</Text>
            <Text style={styles.stepText}>
              All your data will be restored automatically
            </Text>
          </View>
        </View>
      </View>

      {/* Tips Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💡 Best Practices</Text>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>Email backups to yourself</Text>
          <Text style={styles.tipText}>
            After creating a backup, send it via email as a second safeguard
          </Text>
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>Keep multiple backups</Text>
          <Text style={styles.tipText}>
            Don't delete old backups. You can restore from any of them
          </Text>
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>Store in cloud</Text>
          <Text style={styles.tipText}>
            Save backup files to Google Drive or Dropbox for extra safety
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

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },

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

  buttonIcon: {
    fontSize: 20,
  },

  buttonText: {
    color: '#ffffff',
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
