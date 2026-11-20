import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { getActiveGroup } from '../database/database';
import {
  formatFileSize,
  saveAutomaticCloudBackupPassphrase,
} from '../database/backup';
import { getCloudflareSessionGroupId } from '../services/cloudflareApi';
import {
  listCloudGroupBackups,
  uploadGroupDatabaseBackupToCloud,
} from './backup';

function extractFourDigitGroupNumber(value: string | number | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^\d{4}$/.test(digits) ? digits : null;
}

function extractGroupNumberFromCloudId(groupId: string | null): string | null {
  const match = groupId?.match(/(\d{4})$/);
  return match?.[1] ?? null;
}

export default function CloudBackupScreen() {
  const navigation = useNavigation<any>();

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastBackup, setLastBackup] = useState('No successful cloud backup yet');
  const [backupSize, setBackupSize] = useState<number | null>(null);
  const [verificationStatus, setVerificationStatus] = useState('Ready');
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  const loadLastBackup = useCallback(async () => {
    try {
      const cloudGroupId = await getCloudflareSessionGroupId();
      const cloudGroupNumber = extractGroupNumberFromCloudId(cloudGroupId);

      if (!cloudGroupNumber) {
        setVerificationStatus('Sign in as the group administrator to check cloud backups');
        return;
      }

      const result = await listCloudGroupBackups(
        '',
        `KYA${cloudGroupNumber}`,
      );

      if (!result.success) {
        setVerificationStatus(result.error || result.message);
        return;
      }

      if (result.backups.length === 0) {
        setLastBackup('No successful cloud backup yet');
        setBackupSize(null);
        setVerificationStatus(`No Cloudflare backups found for KYA ${cloudGroupNumber}`);
        return;
      }

      const latest = result.backups[0];
      setLastBackup(new Date(latest.createdAt).toLocaleString());
      setBackupSize(latest.bytes ?? null);
      setVerificationStatus(`Available in Cloudflare for KYA ${cloudGroupNumber}`);
    } catch (error) {
      setVerificationStatus(
        error instanceof Error
          ? error.message
          : 'Cloudflare may be temporarily unavailable.',
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLastBackup();
    }, [loadLastBackup]),
  );

  const startBackup = async () => {
    if (passphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase required',
        'Enter a recovery passphrase of at least 12 characters.',
      );
      return;
    }

    setIsBackingUp(true);
    setProgress(5);
    setVerificationStatus('Checking administrator and local group');

    try {
      const [group, cloudGroupId] = await Promise.all([
        getActiveGroup(),
        getCloudflareSessionGroupId(),
      ]);

      if (!group) {
        throw new Error(
          'No active local group was found. Select or open the group you intend to back up.',
        );
      }

      const localGroupNumber = extractFourDigitGroupNumber(group.group_number);
      if (!localGroupNumber) {
        throw new Error(
          'The active local group does not have a valid four-digit KYA group number.',
        );
      }

      const cloudGroupNumber = extractGroupNumberFromCloudId(cloudGroupId);
      if (!cloudGroupId || !cloudGroupNumber) {
        throw new Error(
          'No valid Cloudflare administrator session was found. Sign in as the administrator for this group.',
        );
      }

      if (localGroupNumber !== cloudGroupNumber) {
        throw new Error(
          `Group mismatch: this phone's active group is KYA ${localGroupNumber}, but the signed-in Cloudflare administrator belongs to KYA ${cloudGroupNumber}. Sign in to the matching group or make the correct local group active. The passphrase is not the cause.`,
        );
      }

      setProgress(15);
      setVerificationStatus(`Preparing encrypted backup for KYA ${localGroupNumber}`);

      await saveAutomaticCloudBackupPassphrase(passphrase);
      setProgress(25);

      const result = await uploadGroupDatabaseBackupToCloud(
        group.id,
        passphrase,
      );

      if (!result.success) {
        throw new Error(result.error || result.message);
      }

      setProgress(90);
      setVerificationStatus('Upload confirmed by Cloudflare');

      await loadLastBackup();

      setProgress(100);
      setVerificationStatus(`Encrypted backup uploaded for KYA ${localGroupNumber}`);

      Alert.alert(
        'Full backup complete',
        `${result.message}\n\nKeep the recovery passphrase safe. It is not stored by Cloudflare, and existing backups cannot be decrypted without the passphrase used when they were created.`,
      );
    } catch (error) {
      setVerificationStatus('Backup failed');
      Alert.alert(
        'Full backup failed',
        error instanceof Error
          ? error.message
          : 'The complete database backup could not be completed.',
      );
    } finally {
      setIsBackingUp(false);
    }
  };

  const sections = [
    {
      label: 'Members and accounts',
      description: 'Members, credentials, PIN accounts, roles and relationships',
    },
    {
      label: 'All financial transactions',
      description: 'Savings, loans, repayments, interest, fines and insurance',
    },
    {
      label: 'Meetings and attendance',
      description: 'Meeting records, roll call, minutes and closure summaries',
    },
    {
      label: 'Group funds and expenses',
      description: 'Fund balances, external funds and group expenditure',
    },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Full database backup</Text>
        <Text style={styles.subtitle}>
          Encrypted group backup — no records are excluded
        </Text>

        <View style={styles.lastBox}>
          <Text style={styles.lastLabel}>Last successful cloud backup</Text>
          <Text style={styles.lastValue}>{lastBackup}</Text>
          {backupSize !== null && (
            <Text style={styles.meta}>
              Size: {formatFileSize(backupSize)}
            </Text>
          )}
          <Text style={styles.status}>{verificationStatus}</Text>
        </View>

        {sections.map((section) => (
          <View key={section.label} style={styles.card}>
            <View style={styles.check}>
              <Text style={styles.checkText}>✓</Text>
            </View>
            <View style={styles.sectionText}>
              <Text style={styles.cardLabel}>{section.label}</Text>
              <Text style={styles.cardDesc}>{section.description}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.passLabel}>Recovery passphrase</Text>
        <Text style={styles.passHelp}>
          Use at least 12 characters. Cloudflare does not store this passphrase.
          Keep a safe copy: if it is lost, existing encrypted backups cannot be
          recovered.
        </Text>

        <View style={styles.passphraseRow}>
          <TextInput
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry={!showPassphrase}
            editable={!isBackingUp}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter recovery passphrase"
            placeholderTextColor="#94a3b8"
            returnKeyType="done"
            style={styles.passInput}
            accessibilityLabel="Recovery passphrase"
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
            style={styles.visibilityButton}
            onPress={() => setShowPassphrase((visible) => !visible)}
            disabled={isBackingUp}
          >
            <Text style={styles.visibilityText}>
              {showPassphrase ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        {isBackingUp && (
          <View style={styles.progressBox}>
            <ActivityIndicator color="#16a34a" size="small" />
            <Text style={styles.progressText}>
              Creating encrypted backup... {progress}%
            </Text>
            <Text style={styles.progressStatus}>{verificationStatus}</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${progress}%` }]} />
            </View>
          </View>
        )}

        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.btn, styles.back]}
            onPress={() => navigation.goBack()}
            disabled={isBackingUp}
          >
            <Text style={[styles.btnText, styles.backText]}>
              {'<- Back'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.next, isBackingUp && styles.disabled]}
            onPress={() => void startBackup()}
            disabled={isBackingUp}
          >
            <Text style={styles.btnText}>
              {isBackingUp ? 'Backing up...' : 'Backup now'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => navigation.navigate('Home')}
          disabled={isBackingUp}
        >
          <Text style={styles.doneText}>Done - Go to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 19,
  },
  lastBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  lastLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
  },
  lastValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0f172a',
    marginTop: 3,
  },
  meta: {
    fontSize: 12,
    color: '#475569',
    marginTop: 3,
  },
  status: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '400',
    marginTop: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 11,
    marginBottom: 8,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  sectionText: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0f172a',
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 17,
  },
  passLabel: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
  },
  passHelp: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
    marginBottom: 8,
  },
  passphraseRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passInput: {
    flex: 1,
    minHeight: 47,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  visibilityButton: {
    minWidth: 60,
    minHeight: 47,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
  },
  visibilityText: {
    color: '#166534',
    fontWeight: '600',
    fontSize: 12,
  },
  progressBox: {
    alignItems: 'center',
    marginTop: 12,
  },
  progressText: {
    marginTop: 6,
    fontWeight: '500',
    fontSize: 12,
    color: '#0f172a',
  },
  progressStatus: {
    marginTop: 4,
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
  },
  barBg: {
    height: 7,
    width: '100%',
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: 7,
    backgroundColor: '#16a34a',
  },
  navRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  btn: {
    flex: 1,
    minHeight: 47,
    padding: 12,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  back: {
    backgroundColor: '#e2e8f0',
  },
  next: {
    backgroundColor: '#16a34a',
  },
  disabled: {
    opacity: 0.7,
  },
  btnText: {
    fontWeight: '600',
    color: '#fff',
    fontSize: 12,
  },
  backText: {
    color: '#0f172a',
  },
  doneBtn: {
    marginTop: 10,
    padding: 12,
    alignItems: 'center',
  },
  doneText: {
    color: '#16a34a',
    fontWeight: '600',
    fontSize: 12,
  },
});
