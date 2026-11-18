import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function CloudBackupScreen() {
  const navigation: any = useNavigation();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cloud Backup</Text>
      <Text style={styles.subtitle}>Step 4 and the rest will be here soon. This is a placeholder so navigation works.</Text>
      <View style={styles.navRow}>
        <TouchableOpacity style={[styles.btn, styles.back]} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>{"<- Back"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.next]} onPress={() => navigation.navigate('Dashboard')}>
          <Text style={styles.btnText}>{"Done"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  btn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
  back: { backgroundColor: '#E0E0E0' },
  next: { backgroundColor: '#34A853' },
  btnText: { fontWeight: 'bold', color: '#fff', fontSize: 16 },
});
