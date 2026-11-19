import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ScrollView, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard
} from 'react-native';
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Cloud Recovery</Text>
          <Text style={styles.subtitle}>Step {step} of 3</Text>

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
                returnKeyType="next"
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
                returnKeyType="done"
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
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 14, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 10, color: '#666', textAlign: 'center', marginTop: 3, marginBottom: 10 },
  progressRow: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginBottom: 16 },
  dot: { width: 20, height: 5, borderRadius: 3 },
  dotActive: { backgroundColor: '#16a34a' },
  dotInactive: { backgroundColor: '#e2e8f0' },
  label: { fontSize: 10, fontWeight: '500', marginBottom: 3 },
  help: { fontSize: 10, color: '#64748b', marginBottom: 8, lineHeight: 15 },
  input: { borderWidth: 1.2, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 12, backgroundColor: '#f8fafc' },
  backupCard: { borderWidth: 1.2, borderColor: '#e2e8f0', borderRadius: 9, padding: 10, marginBottom: 7 },
  backupCardSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  backupLabel: { fontSize: 10, fontWeight: '400' },
  backupSize: { fontSize: 9, color: '#64748b', marginTop: 2 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  btn: { flex: 1, padding: 9, borderRadius: 9, alignItems: 'center', marginHorizontal: 3 },
  back: { backgroundColor: '#e2e8f0' },
  next: { backgroundColor: '#16a34a' },
  btnText: { fontWeight: '500', color: '#fff', fontSize: 12 },
  backText: { color: '#0f172a' },
});
