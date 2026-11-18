import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function CloudRecoveryScreen() {
  const navigation: any = useNavigation();
  const [step, setStep] = useState(1);
  const [groupCode, setGroupCode] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [selectedBackup, setSelectedBackup] = useState('');

  // Fake backups for now - later we connect to Cloudflare
  const backups = [
    { id: '1', label: 'Backup - 18 Nov 2026, 10:30 AM', size: '124 KB' },
    { id: '2', label: 'Backup - 11 Nov 2026, 09:15 AM', size: '118 KB' },
    { id: '3', label: 'Backup - 04 Nov 2026, 08:00 AM', size: '110 KB' },
  ];

  const goNext = () => {
    if (step === 1 && !groupCode.trim()) {
      Alert.alert('Missing Group Code', 'Enter your Group Code to continue.');
      return;
    }
    if (step === 2 && recoveryKey.trim().length < 4) {
      Alert.alert('Missing Recovery Key', 'Enter at least 4 characters for your Recovery Key.');
      return;
    }
    if (step === 3 && !selectedBackup) {
      Alert.alert('Choose a Backup', 'Select one backup to restore.');
      return;
    }
    if (step < 3) setStep(step + 1);
    else {
      Alert.alert('Recovery Started', `Restoring backup ${selectedBackup} for group ${groupCode}...`, [
        { text: 'OK', onPress: () => navigation.navigate('CloudBackup') },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cloud Recovery</Text>
      <Text style={styles.subtitle}>Step {step} of 3</Text>

      {/* Progress dots */}
      <View style={styles.progressRow}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[styles.dot, n <= step ? styles.dotActive : styles.dotInactive]} />
        ))}
      </View>

      {step === 1 && (
        <View>
          <Text style={styles.label}>STEP 1 - Group Code</Text>
          <Text style={styles.help}>Enter the Group Code given when the group was created.</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. EBAD-1234"
            value={groupCode}
            onChangeText={setGroupCode}
            autoCapitalize="characters"
          />
        </View>
      )}
            {step === 2 && (
        <View>
          <Text style={styles.label}>STEP 2 - Recovery Key</Text>
          <Text style={styles.help}>Enter the Recovery Key / PIN for group {groupCode || '...'}. This proves you are allowed to restore.</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter Recovery Key"
            value={recoveryKey}
            onChangeText={setRecoveryKey}
            secureTextEntry
          />
        </View>
      )}

      {step === 3 && (
        <View>
          <Text style={styles.label}>STEP 3 - Choose Backup to Restore</Text>
          <Text style={styles.help}>Pick the backup you want to restore. The newest is usually best.</Text>
          {backups.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[styles.backupCard, selectedBackup === b.id ? styles.backupCardSelected : null]}
              onPress={() => setSelectedBackup(b.id)}
            >
              <Text style={styles.backupLabel}>{b.label}</Text>
              <Text style={styles.backupSize}>{b.size} {selectedBackup === b.id ? '✓ Selected' : ''}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.btn, styles.back]}
          onPress={() => (step > 1 ? setStep(step - 1) : navigation.goBack())}
        >
          <Text style={[styles.btnText, styles.backText]}>{'<- Back'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.next]} onPress={goNext}>
          <Text style={styles.btnText}>{step === 3 ? 'Restore' : 'Next ->'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 4, marginBottom: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: { width: 28, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: '#16a34a' },
  dotInactive: { backgroundColor: '#e2e8f0' },
  label: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  help: { fontSize: 14, color: '#64748b', marginBottom: 12, lineHeight: 20 },
  input: { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: '#f8fafc' },
  backupCard: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 },
  backupCardSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  backupLabel: { fontSize: 15, fontWeight: '600' },
  backupSize: { fontSize: 13, color: '#64748b', marginTop: 4 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  btn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', marginHorizontal: 5 },
  back: { backgroundColor: '#e2e8f0' },
  next: { backgroundColor: '#16a34a' },
  btnText: { fontWeight: '700', color: '#fff', fontSize: 16 },
  backText: { color: '#0f172a' },
});
