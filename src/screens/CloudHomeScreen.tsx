import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function CloudHomeScreen() {
  const navigation: any = useNavigation();

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Cloud Backup & Restore</Text>
      <Text style={styles.subtitle}>
        Choose what you want to do. If your phone is new or you lost data, use Recovery. If your phone has data, use Backup.
      </Text>

      <TouchableOpacity
        style={[styles.bigButton, styles.recoveryButton]}
        onPress={() => navigation.navigate('CloudRecovery')}
      >
        <Text style={styles.buttonIcon}>☁️</Text>
        <Text style={styles.buttonTitle}>Cloud Recovery</Text>
        <Text style={styles.buttonDesc}>Restore your group from Cloud on a new phone. Steps 1, 2, 3</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.bigButton, styles.backupButton]}
        onPress={() => navigation.navigate('CloudBackup')}
      >
        <Text style={styles.buttonIcon}>💾</Text>
        <Text style={styles.buttonTitle}>Cloud Backup</Text>
        <Text style={styles.buttonDesc}>Save your group to Cloud. Step 4 and the rest</Text>
      </TouchableOpacity>

      <View style={styles.navRow}>
        <TouchableOpacity style={[styles.navButton, styles.backButton]} onPress={() => navigation.goBack()}>
          <Text style={[styles.navButtonText, styles.backText]}>{"<- Back"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.navButton, styles.nextButton]} onPress={() => navigation.navigate('CloudRecovery')}>
          <Text style={styles.navButtonText}>{"Next ->"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 14, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 10.5, color: '#666', textAlign: 'center', marginBottom: 14, lineHeight: 15 },
  bigButton: { padding: 11, borderRadius: 10, marginBottom: 10, borderWidth: 1 },
  recoveryButton: { backgroundColor: '#E8F0FE', borderColor: '#1A73E8' },
  backupButton: { backgroundColor: '#E6F4EA', borderColor: '#34A853' },
  buttonIcon: { fontSize: 20, marginBottom: 4 },
  buttonTitle: { fontSize: 13, fontWeight: 'bold', color: '#111' },
  buttonDesc: { fontSize: 10.5, color: '#555', marginTop: 2, lineHeight: 14 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  navButton: { flex: 1, padding: 10, borderRadius: 9, alignItems: 'center', marginHorizontal: 4 },
  backButton: { backgroundColor: '#E0E0E0' },
  nextButton: { backgroundColor: '#1A73E8' },
  navButtonText: { fontSize: 12, fontWeight: 'bold', color: '#fff' },
  backText: { color: '#0f172a' },
});
