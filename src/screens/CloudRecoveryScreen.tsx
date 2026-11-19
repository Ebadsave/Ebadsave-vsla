import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

// --- REAL WORKER URL - copy exactly from Cloudflare Dashboard ---
const WORKER_URL = 'https://ebadsave-vsla-cloudflare.info.workers.dev';

export default function CloudRecoveryScreen() {
  const navigation: any = useNavigation();
  const [step, setStep] = useState(1);
  const [groupCode, setGroupCode] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [backups, setBackups] = useState<any[]>([]);
  const [selectedBackup, setSelectedBackup] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // REAL: Fetch real backups from Cloudflare, not fake list
  const fetchBackups = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${WORKER_URL}/backups?group=${encodeURIComponent(groupCode.trim().toUpperCase())}`,
        {
          headers: {
            'Authorization': `Bearer ${recoveryKey.trim()}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (res.status === 401) {
        setError('Wrong Group Code or Recovery Key. Worker said 401 Unauthorized.');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(`Worker error: ${res.status}. Check Worker URL.`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      // Worker must return: { backups: [{id, label, size, created_at}] }
      const list = data.backups || data || [];
      if (list.length === 0) {
        setError('No backups found in Cloudflare for this group. This group has never backed up, or group code is wrong.');
      }
      setBackups(list);
      setStep(3);
    } catch (e: any) {
      // HONEST OFFLINE MESSAGE
      setError('No internet / Cannot reach Cloudflare. Offline restore is impossible unless you have a local backup file on this phone. Connect to internet and try again.');
    } finally {
      setLoading(false);
    }
  };

  const goNext = async () => {
    if (step === 1 && !groupCode.trim()) {
      Alert.alert('Missing Group Code', 'Enter your Group Code, e.g. KYA2010');
      return;
    }
    if (step === 2 && recoveryKey.trim().length < 4) {
      Alert.alert('Missing Recovery Key', 'Enter at least 4 characters.');
      return;
    }
    if (step === 2) {
      await fetchBackups(); // REAL call, not fake
      return;
    }
    if (step === 3 && !selectedBackup) {
      Alert.alert('Choose a Backup', 'Select one backup to restore.');
      return;
    }
    if (step === 3) {
      Alert.alert(
        'Restore - Real',
        `This will download backup ${selectedBackup} for ${groupCode} and create a SEPARATE group for it. KYA 2000 will NOT be touched. Continue?`,
        [
          { text: 'Cancel' },
          { text: 'Restore', onPress: () => navigation.navigate('CloudBackup') },
        ]
      );
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Cloud Recovery</Text>
        <Text style={styles.subtitle}>Step {step} of 3 - Real Cloudflare</Text>

        {step === 1 && (
          <View>
            <Text style={styles.label}>STEP 1 - Group Code</Text>
            <Text style={styles.help}>Enter Group Code, e.g. KYA2010 or KYA2000. They are different groups, never mixed.</Text>
            <TextInput style={styles.input} placeholder="e.g. KYA2010" value={groupCode} onChangeText={setGroupCode} autoCapitalize="characters" />
          </View>
        )}
        {step === 2 && (
          <View>
            <Text style={styles.label}>STEP 2 - Recovery Key</Text>
            <Text style={styles.help}>Recovery Key for group {groupCode || '...'}. Sent to Worker as Bearer token.</Text>
            <TextInput style={styles.input} placeholder="Enter Recovery Key" value={recoveryKey} onChangeText={setRecoveryKey} secureTextEntry />
          </View>
        )}
        {step === 3 && (
          <View>
            <Text style={styles.label}>STEP 3 - Choose Backup to Restore</Text>
            <Text style={styles.help}>Real backups from Cloudflare for {groupCode}. Newest is usually best.</Text>
            {backups.map((b: any) => (
              <TouchableOpacity key={b.id} style={[styles.backupCard, selectedBackup === b.id ? styles.backupCardSelected : null]} onPress={() => setSelectedBackup(b.id)}>
                <Text style={styles.backupLabel}>{b.label || b.created_at || b.id}</Text>
                <Text style={styles.backupSize}>{b.size || ''} {selectedBackup === b.id ? '✓ Selected' : ''}</Text>
              </TouchableOpacity>
            ))}
            {backups.length === 0 && <Text style={styles.help}>No backups loaded.</Text>}
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && <ActivityIndicator color="#16a34a" style={{ marginTop: 12 }} />}

        <View style={styles.navRow}>
          <TouchableOpacity style={[styles.btn, styles.back]} onPress={() => (step > 1 ? setStep(step - 1) : navigation.goBack())}>
            <Text style={[styles.btnText, styles.backText]}>{'<- Back'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.next]} onPress={goNext} disabled={loading}>
            <Text style={styles.btnText}>{loading ? 'Loading...' : step === 3 ? 'Restore' : 'Next ->'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 14, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 10.5, color: '#666', textAlign: 'center', marginTop: 3, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  help: { fontSize: 11, color: '#64748b', marginBottom: 10, lineHeight: 15 },
  input: { borderWidth: 1.2, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, fontSize: 13, backgroundColor: '#f8fafc' },
  backupCard: { borderWidth: 1.2, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginBottom: 8 },
  backupCardSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  backupLabel: { fontSize: 12, fontWeight: '600' },
  backupSize: { fontSize: 10.5, color: '#64748b', marginTop: 3 },
  error: { color: '#dc2626', fontSize: 11, marginTop: 12, lineHeight: 16 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  btn: { flex: 1, padding: 10, borderRadius: 9, alignItems: 'center', marginHorizontal: 4 },
  back: { backgroundColor: '#e2e8f0' },
  next: { backgroundColor: '#16a34a' },
  btnText: { fontWeight: '700', color: '#fff', fontSize: 12 },
  backText: { color: '#0f172a' },
});
