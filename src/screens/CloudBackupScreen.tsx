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
import {
  getCloudflareSessionGroupId,
  getCloudflareAccessToken,
} from '../services/cloudflareApi';
import {
  listCloudGroupBackups,
  signInCloudflareBackupAdmin,
  uploadGroupDatabaseBackupToCloud,
} from './backup';

function fourDigitGroupNumber(
  value: string | number | null | undefined,
): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^\d{4}$/.test(digits) ? digits : null;
}

function groupNumberFromCloudId(groupId: string | null): string | null {
  return groupId?.match(/(\d{4})$/)?.[1] ?? null;
}

export default function CloudBackupScreen() {
  const navigation = useNavigation<any>();

  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [cloudGroupId, setCloudGroupId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  const [lastBackup, setLastBackup] = useState('Not checked');
  const [backupSize, setBackupSize] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    'Choose a local group to continue.',
  );

  const [adminName, setAdminName] = useState('');
  const [adminMemberNumber, setAdminMemberNumber] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [showAdminPin, setShowAdminPin] = useState(false);

  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [progress, setProgress] = useState(0);

  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedDigits = selectedGroup
    ? fourDigitGroupNumber(selectedGroup.group_number)
    : null;
  const signedInDigits = groupNumberFromCloudId(cloudGroupId);
  const administratorMatchesGroup = Boolean(
    selectedDigits && signedInDigits && selectedDigits === signedInDigits,
  );

  const loadScreenData = useCallback(async () => {
    setIsLoading(true);

    try {
      const [allGroups, sessionGroupId, accessToken] = await Promise.all([
        getAllGroups(),
        getCloudflareSessionGroupId(),
        getCloudflareAccessToken(),
      ]);

      const activeGroups = allGroups.filter(
        (group) => group.status === 'active',
      );
      const usableSession = accessToken ? sessionGroupId : null;
      const sessionDigits = groupNumberFromCloudId(usableSession);

      setGroups(activeGroups);
      setCloudGroupId(usableSession);

      setSelectedGroupId((previous) => {
        if (
          previous !== null
          && activeGroups.some((group) => group.id === previous)
        ) {
          return previous;
        }

        if (sessionDigits) {
          const matchingGroup = activeGroups.find(
            (group) =>
              fourDigitGroupNumber(group.group_number) === sessionDigits,
          );
          if (matchingGroup) return matchingGroup.id;
        }

        // Select automatically only when there is exactly one possible group.
        return activeGroups.length === 1 ? activeGroups[0].id : null;
      });

      if (activeGroups.length === 0) {
        setStatusMessage('No active local groups are registered on this device.');
      } else if (!usableSession || !sessionDigits) {
        setStatusMessage(
          'Select a group, then sign in using that group’s administrator credentials.',
        );
      } else {
        setStatusMessage(
          `Cloudflare administrator session: KYA ${sessionDigits}. Select the same local group to back it up.`,
        );
      }

      setLastBackup('Not checked');
      setBackupSize(null);
    } catch (error) {
      setGroups([]);
      setSelectedGroupId(null);
      setCloudGroupId(null);
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Could not load local groups or Cloudflare session.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSelectedGroupBackups = useCallback(async () => {
    if (!selectedDigits || !administratorMatchesGroup) {
      setLastBackup('Not checked');
      setBackupSize(null);
      return;
    }

    try {
      const result = await listCloudGroupBackups(
        '',
        `KYA${selectedDigits}`,
      );

      if (!result.success) {
        setStatusMessage(result.error || result.message);
        return;
      }

      if (result.backups.length === 0) {
        setLastBackup('No successful cloud backup yet');
        setBackupSize(null);
        setStatusMessage(
          `Administrator and local group match KYA ${selectedDigits}. No cloud backups exist for this group yet.`,
        );
        return;
      }

      const latest = result.backups[0];
      setLastBackup(new Date(latest.createdAt).toLocaleString());
      setBackupSize(latest.bytes ?? null);
      setStatusMessage(
        `Administrator and local group match KYA ${selectedDigits}.`,
      );
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Could not check this group’s cloud backups.',
      );
    }
  }, [administratorMatchesGroup, selectedDigits]);

  useFocusEffect(
    useCallback(() => {
      void loadScreenData();
    }, [loadScreenData]),
  );

  React.useEffect(() => {
    void loadSelectedGroupBackups();
  }, [loadSelectedGroupBackups]);

  const signInForSelectedGroup = async () => {
    if (!selectedGroup || !selectedDigits) {
      Alert.alert('Choose a group', 'Select the local group first.');
      return;
    }

    const normalizedMemberNumber = adminMemberNumber
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');

    if (adminName.trim().length < 2) {
      Alert.alert('Administrator name required', 'Enter the group administrator’s full name.');
      return;
    }

    if (!new RegExp(`^KYA${selectedDigits}\\d{3}$`).test(normalizedMemberNumber)) {
      Alert.alert(
        'Administrator number does not match',
        `Enter the administrator member number belonging to KYA ${selectedDigits}, such as KYA${selectedDigits}001.`,
      );
      return;
    }

    if (!/^\d{6,12}$/.test(adminPin)) {
      Alert.alert('Invalid PIN', 'The administrator PIN must contain 6–12 digits.');
      return;
    }

    setIsWorking(true);

    try {
      await signInCloudflareBackupAdmin(
        adminName.trim(),
        normalizedMemberNumber,
        adminPin,
      );

      const [newSessionGroupId, token] = await Promise.all([
        getCloudflareSessionGroupId(),
        getCloudflareAccessToken(),
      ]);

      if (!token || !newSessionGroupId) {
        throw new Error('Cloudflare sign-in did not save an administrator session.');
      }

      const sessionDigits = groupNumberFromCloudId(newSessionGroupId);
      if (sessionDigits !== selectedDigits) {
        throw new Error(
          `The signed-in administrator is for KYA ${sessionDigits ?? 'unknown'}, not the selected KYA ${selectedDigits}.`,
        );
      }

      setCloudGroupId(newSessionGroupId);
      setAdminPin('');
      setStatusMessage(`Signed in as administrator for KYA ${selectedDigits}.`);
      Alert.alert(
        'Administrator connected',
        `This Cloudflare session is now for KYA ${selectedDigits}.`,
      );
    } catch (error) {
      setStatusMessage('Administrator sign-in failed.');
      Alert.alert(
        'Administrator sign-in failed',
        error instanceof Error
          ? error.message
          : 'Could not sign in for the selected group.',
      );
    } finally {
      setIsWorking(false);
    }
  };

  const startBackup = async () => {
    if (!selectedGroup || !selectedDigits) {
      Alert.alert(
        'Choose a group',
        'Select an active local group before creating a backup.',
      );
      return;
    }

    if (!administratorMatchesGroup) {
      Alert.alert(
        'Sign in for this group',
        `The selected local group is KYA ${selectedDigits}, but the current Cloudflare administrator session is for KYA ${signedInDigits ?? 'unknown'}. Sign in below using KYA ${selectedDigits} administrator credentials. No backup has been uploaded.`,
      );
      return;
    }

    if (passphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase required',
        'Enter a recovery passphrase of at least 12 characters.',
      );
      return;
    }

    setIsWorking(true);
    setProgress(5);
    setStatusMessage(`Preparing backup for KYA ${selectedDigits}.`);

    try {
      await saveAutomaticCloudBackupPassphrase(passphrase);
      setProgress(20);

      const result = await uploadGroupDatabaseBackupToCloud(
        selectedGroup.id,
        passphrase,
      );

      if (!result.success) {
        throw new Error(result.error || result.message);
      }

      setProgress(90);
      setStatusMessage('Cloudflare confirmed the encrypted backup.');

      await loadSelectedGroupBackups();

      setProgress(100);
      setStatusMessage(`Encrypted backup uploaded for KYA ${selectedDigits}.`);

      Alert.alert(
        'Backup complete',
        `${result.message}\n\nKeep the recovery passphrase safe. It is not stored by Cloudflare. If it is lost, existing encrypted backups cannot be recovered.`,
      );
    } catch (error) {
      setStatusMessage('Backup failed. No success was reported.');
      Alert.alert(
        'Backup failed',
        error instanceof Error
          ? error.message
          : 'The group backup could not be completed.',
      );
    } finally {
      setIsWorking(false);
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
          Each backup is scoped to the group you select.
        </Text>

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>Cloud backup status</Text>
          <Text style={styles.statusText}>{statusMessage}</Text>
          <Text style={styles.lastLabel}>Last backup for selected group</Text>
          <Text style={styles.lastValue}>{lastBackup}</Text>
          {backupSize !== null && (
            <Text style={styles.meta}>Size: {formatFileSize(backupSize)}</Text>
          )}
        </View>

        <Text style={styles.sectionHeading}>Select a local group</Text>

        {isLoading ? (
          <ActivityIndicator color="#16a34a" style={styles.loader} />
        ) : groups.length === 0 ? (
          <Text style={styles.emptyText}>
            No active groups are registered in this device’s local database.
            Register the group first; production registration saves the
            Cloudflare-reserved KYA number into SQLite.
          </Text>
        ) : (
          groups.map((group) => {
            const selected = group.id === selectedGroupId;
            const digits = fourDigitGroupNumber(group.group_number);
            const matches = Boolean(
              digits && signedInDigits && digits === signedInDigits,
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
                disabled={isWorking}
              >
                <View style={styles.groupText}>
                  <Text style={styles.groupName}>
                    KYA {group.group_number} — {group.group_name}
                  </Text>
                  <Text style={styles.groupMeta}>
                    {group.district}, {group.country}
                  </Text>
                  <Text style={matches ? styles.match : styles.noMatch}>
                    {matches
                      ? 'Administrator session matches'
                      : `Administrator session: ${
                          signedInDigits ? `KYA ${signedInDigits}` : 'not signed in'
                        }`}
                  </Text>
                </View>
                <Text style={styles.radio}>{selected ? '●' : '○'}</Text>
              </TouchableOpacity>
            );
          })
        )}

        {selectedGroup && selectedDigits && !administratorMatchesGroup && (
          <View style={styles.adminCard}>
            <Text style={styles.sectionHeading}>
              Sign in for KYA {selectedDigits}
            </Text>
            <Text style={styles.help}>
              Each group has its own Cloudflare administrator account. Signing
              in for this group replaces the current Cloudflare session on
              this device; it does not combine groups or move their data.
            </Text>

            <Text style={styles.label}>Administrator full name</Text>
            <TextInput
              style={styles.input}
              value={adminName}
              onChangeText={setAdminName}
              placeholder="Administrator full name"
              autoCapitalize="words"
              editable={!isWorking}
            />

            <Text style={styles.label}>Administrator member number</Text>
            <TextInput
              style={styles.input}
              value={adminMemberNumber}
              onChangeText={setAdminMemberNumber}
              placeholder={`Example: KYA${selectedDigits}001`}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isWorking}
            />

            <Text style={styles.label}>Administrator PIN</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.flexInput}
                value={adminPin}
                onChangeText={(value) =>
                  setAdminPin(value.replace(/\D/g, '').slice(0, 12))
                }
                secureTextEntry={!showAdminPin}
                keyboardType="number-pad"
                maxLength={12}
                placeholder="Enter administrator PIN"
                editable={!isWorking}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={showAdminPin ? 'Hide administrator PIN' : 'Show administrator PIN'}
                style={styles.visibilityButton}
                onPress={() => setShowAdminPin((visible) => !visible)}
                disabled={isWorking}
              >
                <Text style={styles.visibilityText}>
                  {showAdminPin ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.signInButton, isWorking && styles.disabled]}
              onPress={() => void signInForSelectedGroup()}
              disabled={isWorking}
            >
              {isWorking
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Sign in for selected group</Text>}
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionHeading}>Backup includes</Text>
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
          Enter the same passphrase on a replacement phone to decrypt this
          backup. Cloudflare cannot recover a forgotten passphrase.
        </Text>
        <View style={styles.passphraseRow}>
          <TextInput
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry={!showPassphrase}
            editable={!isWorking}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="At least 12 characters"
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
            disabled={isWorking}
          >
            <Text style={styles.visibilityText}>
              {showPassphrase ? 'Hide' : 'Show'}
            </Text>
          </TouchableOpacity>
        </View>

        {isWorking && (
          <View style={styles.progressBox}>
            <ActivityIndicator color="#16a34a" size="small" />
            <Text style={styles.progressText}>
              {isBackingUp ? `Creating encrypted backup... ${progress}%` : 'Working...'}
            </Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${progress}%` }]} />
            </View>
          </View>
        )}

        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.btn, styles.back]}
            onPress={() => navigation.goBack()}
            disabled={isWorking}
          >
            <Text style={[styles.btnText, styles.backText]}>{'<- Back'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.next, isWorking && styles.disabled]}
            onPress={() => void startBackup()}
            disabled={isWorking || isLoading}
          >
            <Text style={styles.btnText}>
              {isBackingUp ? 'Backing up...' : 'Backup selected group'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => navigation.navigate('Home')}
          disabled={isWorking}
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
  statusBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusText: {
    color: '#166534',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  lastLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 8,
  },
  lastValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 2,
  },
  meta: {
    fontSize: 11,
    color: '#475569',
    marginTop: 3,
  },
  sectionHeading: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 3,
  },
  loader: { marginVertical: 12 },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    marginBottom: 10,
    lineHeight: 19,
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
  match: { color: '#15803d', fontSize: 11, marginTop: 5 },
  noMatch: { color: '#b45309', fontSize: 11, marginTop: 5 },
  radio: { color: '#16a34a', fontSize: 19 },
  adminCard: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  help: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  label: {
    color: '#334155',
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 5,
    fontSize: 12,
  },
  input: {
    minHeight: 46,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 11,
    color: '#0f172a',
    fontSize: 13,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  flexInput: {
    flex: 1,
    minHeight: 46,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 11,
    color: '#0f172a',
    fontSize: 13,
  },
  visibilityButton: {
    minWidth: 58,
    minHeight: 46,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
  },
  visibilityText: {
    color: '#166534',
    fontWeight: '700',
    fontSize: 11,
  },
  signInButton: {
    minHeight: 46,
    backgroundColor: '#15803d',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
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
  checkText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  sectionText: { flex: 1 },
  cardLabel: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
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
  progressBox: { alignItems: 'center', marginTop: 12 },
  progressText: {
    marginTop: 6,
    fontWeight: '600',
    fontSize: 13,
    color: '#0f172a',
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
  buttonText: { fontWeight: '700', color: '#fff', fontSize: 12 },
  btnText: { fontWeight: '700', color: '#fff', fontSize: 12 },
  backText: { color: '#0f172a' },
  doneBtn: { marginTop: 10, padding: 12, alignItems: 'center' },
  doneText: { color: '#16a34a', fontWeight: '700', fontSize: 13 },
});
