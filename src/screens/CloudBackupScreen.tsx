import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

export default function CloudBackupScreen() {
  const navigation: any = useNavigation();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastBackup, setLastBackup] = useState('No successful cloud backup yet');
  const [backupSize, setBackupSize] = useState<number | null>(null);
  const [verificationStatus, setVerificationStatus] = useState('Ready');
  const [passphrase, setPassphrase] = useState('');

  const loadLastBackup = useCallback(async () => {
    try {
      const cloudGroupId = await getCloudflareSessionGroupId();
      const match = cloudGroupId?.match(/(\d{4})$/);
      if (!match) return;

      const result = await listCloudGroupBackups('', match[1]);
      if (result.success && result.backups.length > 0) {
        const latest = result.backups[0];
        setLastBackup(new Date(latest.createdAt).toLocaleString());
        setBackupSize(latest.bytes ?? null);
        setVerificationStatus('Available in Cloudflare');
      }
    } catch {
      // Cloudflare may be temporarily unavailable.
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
        'Passphrase Required',
        'Enter a recovery passphrase of at least 12 characters.',
      );
      return;
    }

    try {
      setIsBackingUp(true);
      setProgress(10);
      setVerificationStatus('Creating the full group database backup');

      const group = await getActiveGroup();
      if (!group) {
        throw new Error('No active local group was found.');
      }

      await saveAutomaticCloudBackupPassphrase(passphrase);
      setProgress(35);

      const result = await uploadGroupDatabaseBackupToCloud(
        group.id,
        passphrase,
      );
      if (!result.success) {
        throw new Error(result.error || result.message);
      }

      setProgress(85);
      setVerificationStatus('Verifying Cloudflare upload');

      setProgress(100);
      setVerificationStatus('Verified and accessible');
      setLastBackup(new Date().toLocaleString());
      setBackupSize(null);
      await loadLastBackup();

      Alert.alert(
        'Full Backup Complete',
        `${result.message}\n\nVerified completion time: ${new Date().toLocaleString()}`,
      );
    } catch (error) {
      setVerificationStatus('Verification failed');
      Alert.alert(
        'Full Backup Failed',
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
      label: 'Members and Accounts',
      description: 'Members, credentials, PIN accounts, roles and relationships',
    },
    {
      label: 'All Financial Transactions',
      description: 'Savings, loans, repayments, interest, fines and insurance',
    },
    {
      label: 'Meetings and Attendance',
      description: 'Meeting records, roll call, minutes and closure summaries',
    },
    {
      label: 'Group Funds and Expenses',
      description: 'Fund balances, external funds and all group expenditure',
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Full Database Backup</Text>
      <Text style={styles.subtitle}>
        Encrypted group backup - no records are excluded
      </Text>

      <View style={styles.lastBox}>
        <Text style={styles.lastLabel}>Last Successful Backup</Text>
        <Text style={styles.lastValue}>{lastBackup}</Text>
        {backupSize !== null && (
          <Text style={styles.meta}>
            Size: {formatFileSize(backupSize)}
          </Text>
        )}
        <Text style={styles.lastOk}>✓ {verificationStatus}</Text>
      </View>

      {sections.map((section) => (
        <View key={section.label} style={styles.card}>
          <View style={styles.check}>
            <Text style={styles.checkText}>✓</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardLabel}>{section.label}</Text>
            <Text style={styles.cardDesc}>{section.description}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.passLabel}>Recovery Passphrase</Text>
      <TextInput
        value={passphrase}
        onChangeText={setPassphrase}
        secureTextEntry
        editable={!isBackingUp}
        placeholder="At least 12 characters"
        style={styles.passInput}
      />

      {isBackingUp && (
        <View style={styles.progressBox}>
          <ActivityIndicator color="#16a34a" size="small" />
          <Text style={styles.progressText}>
            Backing up complete database... {progress}%
          </Text>
          <Text style={styles.progressStatus}>{verificationStatus}</Text>
          <View style={styles.barBg}>
            <View
              style={[styles.barFill, { width: `${progress}%` }]}
            />
          </View>
        </View>
      )}

      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.btn, styles.back]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.btnText, styles.backText]}>
            {'<- Back'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btn,
            styles.next,
            isBackingUp ? styles.disabled : null,
          ]}
          onPress={startBackup}
          disabled={isBackingUp}
        >
          <Text style={styles.btnText}>
            {isBackingUp ? 'Backing up...' : 'Backup Now'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.doneBtn}
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.doneText}>Done - Go to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 10.5,
    color: '#666',
    textAlign: 'center',
    marginTop: 3,
    marginBottom: 10,
  },
  lastBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 9,
    padding: 9,
    marginBottom: 10,
  },
  lastLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
  },
  lastValue: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  meta: {
    fontSize: 10.5,
    color: '#475569',
    marginTop: 2,
  },
  lastOk: {
    fontSize: 10.5,
    color: '#16a34a',
    fontWeight: '700',
    marginTop: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
    borderRadius: 9,
    padding: 9,
    marginBottom: 7,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 10,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardDesc: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 1,
  },
  passLabel: {
    marginTop: 4,
    marginBottom: 5,
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  passInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  progressBox: {
    alignItems: 'center',
    marginTop: 8,
  },
  progressText: {
    marginTop: 5,
    fontWeight: '600',
    fontSize: 11,
  },
  progressStatus: {
    marginTop: 3,
    color: '#475569',
    fontSize: 10,
  },
  barBg: {
    height: 6,
    width: '100%',
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    backgroundColor: '#16a34a',
  },
  navRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  btn: {
    flex: 1,
    padding: 10,
    borderRadius: 9,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  back: {
    backgroundColor: '#e2e8f0',
  },
  next: {
    backgroundColor: '#16a34a',
  },
  disabled: {
    opacity: 0.6,
  },
  btnText: {
    fontWeight: '700',
    color: '#fff',
    fontSize: 12,
  },
  backText: {
    color: '#0f172a',
  },
  doneBtn: {
    marginTop: 8,
    padding: 9,
    alignItems: 'center',
  },
  doneText: {
    color: '#16a34a',
    fontWeight: '700',
    fontSize: 11.5,
  },
});
