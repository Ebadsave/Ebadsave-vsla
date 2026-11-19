import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import {
  listCloudGroupBackups,
  restoreCloudGroupDatabaseBackup,
  type CloudBackupFileInfo,
} from './backup';

function normalizeGroupNumber(input: string): string {
  const digits = input.replace(/\D/g, '');
  return digits.length === 4 ? digits : '';
}

function formatBytes(bytes?: number): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 'Size unavailable';
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CloudRecoveryScreen() {
  const navigation = useNavigation<any>();
  const [step, setStep] = useState(1);
  const [groupCode, setGroupCode] = useState('');
  const [recoveryPassphrase, setRecoveryPassphrase] = useState('');
  const [backups, setBackups] = useState<CloudBackupFileInfo[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<CloudBackupFileInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const groupDigits = normalizeGroupNumber(groupCode);
  const displayGroup = groupDigits ? `KYA ${groupDigits}` : 'your group';

  const fetchBackups = async () => {
    if (!groupDigits) {
      setError('Enter a valid four-digit group number, such as KYA2010.');
      return;
    }
    if (recoveryPassphrase.trim().length < 12) {
      setError('Enter the cloud backup passphrase (at least 12 characters).');
      return;
    }

    setLoading(true);
    setError('');
    setSelectedBackup(null);
    try {
      // Listing requires an administrator session; the passphrase decrypts the backup.
      const result = await listCloudGroupBackups(recoveryPassphrase, `KYA${groupDigits}`);
      if (!result.success) throw new Error(result.error || result.message);
      setBackups(result.backups);
      if (result.backups.length === 0) {
        setError(`No cloud backups were found for ${displayGroup}. Sign in as that group's administrator and try again.`);
      } else {
        setStep(3);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load cloud backups. Check your connection and sign-in.');
    } finally {
      setLoading(false);
    }
  };

  const restoreSelectedBackup = async () => {
    if (!selectedBackup) {
      setError('Choose a backup to restore.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await restoreCloudGroupDatabaseBackup(
        selectedBackup,
        recoveryPassphrase,
        groupDigits,
      );
      if (!result.success) throw new Error(result.error || result.message);
      Alert.alert('Recovery complete', result.message, [
        { text: 'Continue', onPress: () => navigation.navigate('Home') },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore this backup. No data was changed.');
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => {
    setError('');
    if (step === 1) {
      if (!groupDigits) {
        setError('Enter a valid four-digit group number, such as KYA2010.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      void fetchBackups();
    } else if (step === 3) {
      Alert.alert(
        'Restore group backup?',
        `Restore the selected encrypted backup for ${displayGroup}? The backup is verified before local group data is changed.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore', style: 'destructive', onPress: () => void restoreSelectedBackup() },
        ],
      );
    }
  };

  const goBack = () => {
    setError('');
    if (step > 1) setStep(step - 1);
    else navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Cloud Recovery</Text>
        <Text style={styles.subtitle}>Step {step} of 3 · Encrypted Cloudflare backup</Text>

        {step === 1 && (
          <View>
            <Text style={styles.label}>STEP 1 — Group number</Text>
            <Text style={styles.help}>Enter the four-digit number of the group you want to recover.</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: 2010 or KYA2010"
              value={groupCode}
              onChangeText={(value) => { setGroupCode(value.toUpperCase()); setError(''); }}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.label}>STEP 2 — Sign-in and backup passphrase</Text>
            <Text style={styles.help}>
              Finding backups requires an active Cloudflare administrator session for {displayGroup}. Sign in from Data Backup &amp; Restore first. Then enter the passphrase used when the backup was created.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Cloud backup passphrase (12+ characters)"
              value={recoveryPassphrase}
              onChangeText={(value) => { setRecoveryPassphrase(value); setError(''); }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.label}>STEP 3 — Choose a backup</Text>
            <Text style={styles.help}>
              Available encrypted backups for {displayGroup}. Restore verifies the passphrase, integrity, and group identity before changing local data.
            </Text>
            {backups.map((backup) => (
              <TouchableOpacity
                key={backup.objectId}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedBackup?.objectId === backup.objectId }}
                style={[
                  styles.backupCard,
                  selectedBackup?.objectId === backup.objectId && styles.backupCardSelected,
                ]}
                onPress={() => setSelectedBackup(backup)}
              >
                <Text style={styles.backupLabel}>{backup.name}</Text>
                <Text style={styles.backupMeta}>
                  {backup.createdAt ? new Date(backup.createdAt).toLocaleString() : 'Date unavailable'}
                  {' · '}{formatBytes(backup.bytes)}
                </Text>
                {selectedBackup?.objectId === backup.objectId && (
                  <Text style={styles.selected}>✓ Selected</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {loading && <ActivityIndicator accessibilityLabel="Working" color="#16a34a" style={styles.spinner} />}

        <View style={styles.navRow}>
          <TouchableOpacity style={[styles.btn, styles.back]} onPress={goBack} disabled={loading}>
            <Text style={[styles.btnText, styles.backText]}>{'<- Back'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.next, loading && styles.disabled]}
            onPress={goNext}
            disabled={loading}
          >
            <Text style={styles.btnText}>
              {loading ? 'Working...' : step === 3 ? 'Restore' : step === 2 ? 'Find Backups' : 'Next ->'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: 16, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 6, color: '#0f172a' },
  help: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 19 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 13, fontSize: 15, backgroundColor: '#f8fafc', color: '#0f172a' },
  backupCard: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, marginBottom: 9 },
  backupCardSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  backupLabel: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  backupMeta: { fontSize: 12, color: '#64748b', marginTop: 5 },
  selected: { fontSize: 12, color: '#15803d', fontWeight: '700', marginTop: 5 },
  error: { color: '#b91c1c', fontSize: 13, marginTop: 14, lineHeight: 19 },
  spinner: { marginTop: 14 },
  navRow: { flexDirection: 'row', marginTop: 20 },
  btn: { flex: 1, padding: 13, borderRadius: 9, alignItems: 'center', marginHorizontal: 4 },
  back: { backgroundColor: '#e2e8f0' },
  next: { backgroundColor: '#16a34a' },
  disabled: { opacity: 0.6 },
  btnText: { fontWeight: '700', color: '#fff', fontSize: 14 },
  backText: { color: '#0f172a' },
});
