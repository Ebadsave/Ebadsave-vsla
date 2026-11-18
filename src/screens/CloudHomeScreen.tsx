import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function CloudHomeScreen() {
  const navigation: any = useNavigation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cloud Backup & Restore</Text>
      <Text style={styles.subtitle}>
        Choose what you want to do. If your phone is new or you lost data, use Recovery. If your phone has data, use Backup.
      </Text>

      {/* BUTTON 1 - CLOUD RECOVERY */}
      <TouchableOpacity
        style={[styles.bigButton, styles.recoveryButton]}
        onPress={() => navigation.navigate('CloudRecovery')}
      >
        <Text style={styles.buttonIcon}>☁️</Text>
        <Text style={styles.buttonTitle}>Cloud Recovery</Text>
        <Text style={styles.buttonDesc}>
          Restore your group from Cloud on a new phone. Steps 1, 2, 3
        </Text>
      </TouchableOpacity>

      {/* BUTTON 2 - CLOUD BACKUP */}
      <TouchableOpacity
        style={[styles.bigButton, styles.backupButton]}
        onPress={() => navigation.navigate('CloudBackup')}
      >
        <Text style={styles.buttonIcon}>💾</Text>
        <Text style={styles.buttonTitle}>Cloud Backup</Text>
        <Text style={styles.buttonDesc}>
          Save your group to Cloud. Step 4 and the rest
        </Text>
      </TouchableOpacity>

      {/* BOTTOM NAV - BACK AND NEXT */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navButton, styles.backButton]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.navButtonText}>{"<- Back"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, styles.nextButton]}
          onPress={() => navigation.navigate('CloudRecovery')}
        >
          <Text style={styles.navButtonText}>{"Next ->"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 25, lineHeight: 20 },
  bigButton: { padding: 20, borderRadius: 14, marginBottom: 16, borderWidth: 1 },
  recoveryButton: { backgroundColor: '#E8F0FE', borderColor: '#1A73E8' },
  backupButton: { backgroundColor: '#E6F4EA', borderColor: '#34A853' },
  buttonIcon: { fontSize: 32, marginBottom: 8 },
  buttonTitle: { fontSize: 19, fontWeight: 'bold', color: '#111' },
  buttonDesc: { fontSize: 13, color: '#555', marginTop: 4, lineHeight: 18 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  navButton: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
  backButton: { backgroundColor: '#E0E0E0' },
  nextButton: { backgroundColor: '#1A73E8' },
  navButtonText: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
});
