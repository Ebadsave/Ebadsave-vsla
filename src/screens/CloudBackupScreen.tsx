import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function CloudBackupScreen() {
  const navigation: any = useNavigation();
  const [selected, setSelected] = useState<string[]>(['members', 'meetings', 'savings']);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastBackup, setLastBackup] = useState('18 Nov 2026, 10:30 AM - 124 KB');
  const [progress, setProgress] = useState(0);

  const options = [
    { id: 'members', label: 'Members & Groups', desc: 'Member list, roles, contacts' },
    { id: 'meetings', label: 'Meetings & Attendance', desc: 'Meetings, roll call, minutes' },
    { id: 'savings', label: 'Savings & Loans', desc: 'Savings, loans, repayments, fines' },
    { id: 'expenses', label: 'Expenses & Funds', desc: 'Expenses, insurance, external funds' },
  ];

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const startBackup = () => {
    if (selected.length === 0) {
      Alert.alert('Choose Something', 'Select at least one item to backup.');
      return;
    }
    setIsBackingUp(true);
    setProgress(0);
    let p = 0;
    const timer = setInterval(() => {
      p += 20;
      setProgress(p);
      if (p >= 100) {
        clearInterval(timer);
        setIsBackingUp(false);
        const now = new Date().toLocaleString();
        setLastBackup(`${now} - ${120 + selected.length * 5} KB`);
        Alert.alert('Backup Complete', `Backed up ${selected.length} items to cloud.`);
      }
    }, 300);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Cloud Backup</Text>
      <Text style={styles.subtitle}>Step 4 - Choose what to backup</Text>

      <View style={styles.lastBox}>
        <Text style={styles.lastLabel}>Last Backup</Text>
        <Text style={styles.lastValue}>{lastBackup}</Text>
        <Text style={styles.lastOk}>✓ Cloud is up to date</Text>
      </View>

      {options.map((o) => {
        const active = selected.includes(o.id);
        return (
          <TouchableOpacity key={o.id} style={[styles.card, active ? styles.cardActive : null]} onPress={() => toggle(o.id)}>
            <View style={[styles.check, active ? styles.checkActive : null]}>
              <Text style={styles.checkText}>{active ? '✓' : ''}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>{o.label}</Text>
              <Text style={styles.cardDesc}>{o.desc}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {isBackingUp && (
        <View style={styles.progressBox}>
          <ActivityIndicator color="#16a34a" size="small" />
          <Text style={styles.progressText}>Backing up... {progress}%</Text>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${progress}%` }]} />
          </View>
        </View>
      )}

      <View style={styles.navRow}>
        <TouchableOpacity style={[styles.btn, styles.back]} onPress={() => navigation.goBack()}>
          <Text style={[styles.btnText, styles.backText]}>{'<- Back'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.next, isBackingUp ? styles.disabled : null]} onPress={startBackup} disabled={isBackingUp}>
          <Text style={styles.btnText}>{isBackingUp ? 'Backing up...' : 'Backup Now'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.navigate('Home')}>
        <Text style={styles.doneText}>Done - Go to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 14, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 10.5, color: '#666', textAlign: 'center', marginTop: 3, marginBottom: 10 },
  lastBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 9, padding: 9, marginBottom: 10 },
  lastLabel: { fontSize: 10, color: '#64748b', fontWeight: '700' },
  lastValue: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  lastOk: { fontSize: 10.5, color: '#16a34a', fontWeight: '700', marginTop: 2 },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9, padding: 9, marginBottom: 7 },
  cardActive: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  checkActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkText: { color: '#fff', fontWeight: '800', fontSize: 10 },
  cardLabel: { fontSize: 12, fontWeight: '700' },
  cardDesc: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  progressBox: { alignItems: 'center', marginTop: 8 },
  progressText: { marginTop: 5, fontWeight: '600', fontSize: 11 },
  barBg: { height: 6, width: '100%', backgroundColor: '#e2e8f0', borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: '#16a34a' },
  navRow: { flexDirection: 'row', marginTop: 12 },
  btn: { flex: 1, padding: 10, borderRadius: 9, alignItems: 'center', marginHorizontal: 4 },
  back: { backgroundColor: '#e2e8f0' },
  next: { backgroundColor: '#16a34a' },
  disabled: { opacity: 0.6 },
  btnText: { fontWeight: '700', color: '#fff', fontSize: 12 },
  backText: { color: '#0f172a' },
  doneBtn: { marginTop: 8, padding: 9, alignItems: 'center' },
  doneText: { color: '#16a34a', fontWeight: '700', fontSize: 11.5 },
});
