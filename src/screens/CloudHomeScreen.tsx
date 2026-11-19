import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function CloudHomeScreen() {
  const navigation = useNavigation<any>();

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Cloud Backup &amp; Restore</Text>
      <Text style={styles.subtitle}>
        Create an encrypted backup or recover a group from an existing Cloudflare backup. Recovery needs the group's administrator session and the backup passphrase.
      </Text>

      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.bigButton, styles.recoveryButton]}
        onPress={() => navigation.navigate('CloudRecovery')}
      >
        <Text style={styles.buttonIcon}>☁️</Text>
        <Text style={styles.buttonTitle}>Cloud Recovery</Text>
        <Text style={styles.buttonDesc}>Find, verify, decrypt, and restore an encrypted group backup.</Text>
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.bigButton, styles.backupButton]}
        onPress={() => navigation.navigate('CloudBackup')}
      >
        <Text style={styles.buttonIcon}>💾</Text>
        <Text style={styles.buttonTitle}>Cloud Backup</Text>
        <Text style={styles.buttonDesc}>Create an encrypted backup of a group and upload it to Cloudflare.</Text>
      </TouchableOpacity>

      <View style={styles.navRow}>
        <TouchableOpacity accessibilityRole="button" style={[styles.navButton, styles.backButton]} onPress={() => navigation.goBack()}>
          <Text style={[styles.navButtonText, styles.backText]}>{'<- Back'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 18, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8, color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20, lineHeight: 19 },
  bigButton: { padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1 },
  recoveryButton: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  backupButton: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  buttonIcon: { fontSize: 24, marginBottom: 6 },
  buttonTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  buttonDesc: { fontSize: 13, color: '#475569', marginTop: 5, lineHeight: 18 },
  navRow: { flexDirection: 'row', marginTop: 8 },
  navButton: { flex: 1, padding: 13, borderRadius: 9, alignItems: 'center', marginHorizontal: 4 },
  backButton: { backgroundColor: '#e2e8f0' },
  navButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  backText: { color: '#0f172a' },
});
