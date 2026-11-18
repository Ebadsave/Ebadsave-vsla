import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function CloudRecoveryScreen() {
  const navigation: any = useNavigation();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cloud Recovery</Text>
      <Text style={styles.subtitle}>Steps 1, 2, 3 will be here soon. Placeholder so navigation works.</Text>
      <View style={styles.navRow}>
        <TouchableOpacity style={[styles.btn, styles.back]} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>{"<- Back"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.next]} onPress={() => navigation.navigate('CloudBackup')}>
          <Text style={styles.btnText}>{"Next ->"}</Text>
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
  next: { backgroundColor: '#1A73E8' },
  btnText: { fontWeight: 'bold', color: '#fff', fontSize: 16 },
});
