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

import { getAllGroups, type GroupRecord } from '../database/database';
import {
  formatFileSize,
  saveAutomaticCloudBackupPassphrase,
} from '../database/backup';
import { getCloudflareSessionGroupId } from '../services/cloudflareApi';
import {
  listCloudGroupBackups,
  uploadGroupDatabaseBackupToCloud,
} from './backup';

function groupDigits(value: string | number | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^\d{4}$/.test(digits) ? digits : null;
}

function cloudGroupDigits(groupId: string | null): string | null {
  return groupId?.match(/(\d{4})$/)?.[1] ?? null;
}

export default function CloudBackupScreen() {
  const navigation = useNavigation<any>();
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [cloudGroupId, setCloudGroupId] = useState<string | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastBackup, setLastBackup] = useState('No successful cloud backup yet');
  const [backupSize, setBackupSize] = useState<number | null>(null);
  const [verificationStatus, setVerificationStatus] = useState(
    'Checking local groups and administrator session',
  );
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);

  const loadScreenData = useCallback(async () => {
    setIsLoadingGroups(true);

    try {
      const [localGroups, sessionGroupId] = await Promise.all([
        getAllGroups(),
        getCloudflareSessionGroupId(),
      ]);

      const activeGroups = localGroups.filter(
        (group) => group.status === 'active',
      );
      const sessionNumber = cloudGroupDigits(sessionGroupId);
      const matchingGroup = sessionNumber
        ? activeGroups.find(
            (group) => groupDigits(group.group_number) === sessionNumber,
          )
        : undefined;

      setGroups(activeGroups);
      setCloudGroupId(sessionGroupId);
      setSelectedGroupId((previous) => {
        if (matchingGroup) return matchingGroup.id;
        if (
          previous !== null
          && activeGroups.some((group) => group.id === previous)
        ) {
          return previous;
        }
        return activeGroups.length === 1 ? activeGroups[0].id : null;
      });

      if (!sessionGroupId || !sessionNumber) {
        setVerificationStatus(
          'Sign in as the group administrator to back up to Cloudflare.',
        );
        setLastBackup('No administrator session');
        setBackupSize(null);
      } else if (!matchingGroup) {
        setVerificationStatus(
          `Cloudflare is signed in for KYA ${sessionNumber}. Select or register that same group locally.`,
        );
        setLastBackup(`Cloudflare group: KYA ${sessionNumber}`);
        setBackupSize(null);
      } else {
        const result = await listCloudGroupBackups(
          '',
          `KYA${sessionNumber}`,
        );

        if (!result.success) {
          setVerificationStatus(result.error || result.message);
        } else if (result.backups.length === 0) {
          setLastBackup('No successful cloud backup yet');
          setBackupSize(null);
          setVerificationStatus(
            `Local group and Cloudflare administrator match: KYA ${sessionNumber}`,
          );
        } else {
          const latest = result.backups[0];
          setLastBackup(new Date(latest.createdAt).toLocaleString());
          setBackupSize(latest.bytes ?? null);
          setVerificationStatus(
            `Local group and Cloudflare administrator match: KYA ${sessionNumber}`,
          );
        }
      }
    } catch (error) {
      setVerificationStatus(
        error instanceof Error ? error.message : 'Could not load local groups.',
      );
      setGroups([]);
    } finally {
      setIsLoadingGroups(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadScreenData();
    }, [loadScreenData]),
  );

  const startBackup = async () => {
    if (passphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase required',
        'Enter a recovery passphrase of at least 12 characters.',
      );
      return;
    }

    if (selectedGroupId === null) {
      Alert.alert(
        'Choose a group',
        'Select the local group that belongs to the signed-in Cloudflare administrator.',
      );
      return;
    }

    const group = groups.find((item) => item.id === selectedGroupId);
    if (!group || group.status !== 'active') {
      Alert.alert(
        'Group unavailable',
        'The selected local group is not active. Refresh the screen and choose an active group.',
      );
      return;
    }

    const localNumber = groupDigits(group.group_number);
    const cloudNumber = cloudGroupDigits(cloudGroupId);

    if (!localNumber) {
      Alert.alert(
        'Invalid local group number',
        'This SQLite group does not have a valid four-digit KYA number. Re-register or repair its local record before backing it up.',
      );
      return;
    }

    if (!cloudGroupId || !cloudNumber) {
      Alert.alert(
        'Administrator sign-in required',
        'Sign in as the Cloudflare administrator for this group, then retry.',
      );
      return;
    }

    if (localNumber !== cloudNumber) {
      Alert.alert(
        'Group number mismatch',
        `The selected local SQLite group is KYA ${localNumber}, but the Cloudflare administrator session belongs to KYA ${cloudNumber}. Select the correct local group or sign in as its administrator. The production group number is saved locally during group registration; uploading a backup is not required for SQLite to know it.`,
      );
      return;
    }

    setIsBackingUp(true);
    setProgress(5);
    setVerificationStatus(
      `Confirmed KYA ${localNumber} locally and in Cloudflare`,
    );

    try {
      await saveAutomaticCloudBackupPassphrase(passphrase);
      setProgress(20);
      setVerificationStatus(`Creating encrypted backup for KYA ${localNumber}`);

      const result = await uploadGroupDatabaseBackupToCloud(
        group.id,
        passphrase,
      );

      if (!result.success) {
        throw new Error(result.error || result.message);
      }

      setProgress(90);
      setVerificationStatus('Upload confirmed by Cloudflare');
      await loadScreenData();
      setProgress(100);
      setVerificationStatus(`Encrypted backup uploaded for KYA ${localNumber}`);

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

        <Text style={styles.sectionHeading}>
          Select the local group to back up
        </Text>

        {isLoadingGroups ? (
          <ActivityIndicator color="#16a34a" style={styles.loader} />
        ) : groups.length === 0 ? (
          <Text style={styles.emptyText}>
            No active local groups are registered on this device.
          </Text>
        ) : (
          groups.map((group) => {
            const selected = group.id === selectedGroupId;
            const number = groupDigits(group.group_number);
            const sessionNumber = cloudGroupDigits(cloudGroupId);
            const matchesCloud = Boolean(
              number && sessionNumber && number === sessionNumber,
            );

            return (
              <TouchableOpacity
                key={group.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[
                  styles.groupCard,
                  selected && styles.groupCardSelected,
                ]}
                onPress={() => setSelectedGroupId(group.id)}
                disabled={isBackingUp}
              >
                <View style={styles.groupText}>
                  <Text style={styles.groupName}>
                    KYA {group.group_number} — {group.group_name}
                  </Text>
                  <Text style={styles.groupMeta}>
                    {group.district}, {group.country}
                  </Text>
                  <Text
                    style={[
                      styles.matchText,
                      matchesCloud ? styles.match : styles.noMatch,
                    ]}
                  >
                    {matchesCloud
                      ? 'Matches signed-in Cloudflare administrator'
                      : `Cloudflare session: ${
                          sessionNumber ? `KYA ${sessionNumber}` : 'not signed in'
                        }`}
                  </Text>
                </View>
                <Text style={styles.radio}>{selected ? '●' : '○'}</Text>
              </TouchableOpacity>
            );
          })
        )}

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
          Use at least 12 characters. Cloudflare does not store it. Keep a safe
          copy: if it is lost, existing encrypted backups cannot be recovered.
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
            disabled={isBackingUp}
          >
            <Text style={[styles.btnText, styles.backText]}>
              {'<- Back'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.btn,
              styles.next,
              (isBackingUp || isLoadingGroups) && styles.disabled,
            ]}
            onPress={() => void startBackup()}
            disabled={isBackingUp || isLoadingGroups}
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
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 36,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
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
    fontWeight: '600',
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
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 17,
  },
  sectionHeading: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
    marginBottom: 7,
  },
  loader: { marginVertical: 12 },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    marginBottom: 10,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    padding: 11,
    marginBottom: 8,
  },
  groupCardSelected: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  groupText: { flex: 1, paddingRight: 8 },
  groupName: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  groupMeta: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 3,
  },
  matchText: { fontSize: 11, marginTop: 5 },
  match: { color: '#15803d' },
  noMatch: { color: '#b45309' },
  radio: { color: '#16a34a', fontSize: 19 },
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
  checkText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  sectionText: { flex: 1 },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
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
    fontWeight: '700',
    color: '#334155',
  },
  passHelp: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
    marginBottom: 8,
  },
  passphraseRow: { flexDirection: 'row', alignItems: 'center' },
  passInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  visibilityButton: {
    minWidth: 60,
    minHeight: 48,
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
    fontWeight: '700',
    fontSize: 12,
  },
  progressBox: { alignItems: 'center', marginTop: 12 },
  progressText: {
    marginTop: 6,
    fontWeight: '600',
    fontSize: 13,
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
  barFill: { height: 7, backgroundColor: '#16a34a' },
  navRow: { flexDirection: 'row', marginTop: 16 },
  btn: {
    flex: 1,
    minHeight: 48,
    padding: 12,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  back: { backgroundColor: '#e2e8f0' },
  next: { backgroundColor: '#16a34a' },
  disabled: { opacity: 0.6 },
  btnText: { fontWeight: '700', color: '#fff', fontSize: 13 },
  backText: { color: '#0f172a' },
  doneBtn: { marginTop: 10, padding: 12, alignItems: 'center' },
  doneText: { color: '#16a34a', fontWeight: '700', fontSize: 13 },
});
