import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { authenticateMemberPassbook } from '../database/database';

type Props = { navigation: any };

export default function MemberPassbookLoginScreen({ navigation }: Props) {
  const [memberNumber, setMemberNumber] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    if (!memberNumber.trim() || pin.length !== 4) {
      Alert.alert('Enter your details', 'Enter your member number and your four-character private PIN.');
      return;
    }
    setLoading(true);
    try {
      const member = await authenticateMemberPassbook(memberNumber, pin);
      if (!member) {
        Alert.alert('Sign-in failed', 'The member number or PIN is incorrect, the member is inactive, or the passbook has not been activated on this phone.');
        return;
      }
      setPin('');
      navigation.replace('MemberPassbook', { memberId: member.memberId, groupId: member.groupId, currency: member.currency });
    } catch (error) {
      Alert.alert('Unable to sign in', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logo}><Text style={styles.logoText}>E</Text></View>
            <Text style={styles.brandTitle}>Ebadsave VSLA</Text>
            <Text style={styles.tagline}>Save together, grow together</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Member Passbook</Text>
            <Text style={styles.subtitle}>Sign in to view your savings, loans, contributions and transaction history.</Text>

            <Text style={styles.label}>Member Number</Text>
            <TextInput
              value={memberNumber}
              onChangeText={setMemberNumber}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Enter your member number"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              returnKeyType="next"
              accessibilityLabel="Member number"
            />

            <Text style={styles.label}>Private PIN</Text>
            <TextInput
              value={pin}
              onChangeText={(value) => setPin(value.replace(/\s/g, '').slice(0, 4))}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter 4-character PIN"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              maxLength={4}
              returnKeyType="done"
              onSubmitEditing={signIn}
              accessibilityLabel="Private PIN"
            />

            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={signIn} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Open My Passbook</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.notice}>
            Development note: this first milestone checks credentials saved in this phone's local database. Secure sign-in from a different phone requires the online service and server-side access controls, which are not connected yet.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0fdf4' },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  brand: { alignItems: 'center', marginBottom: 26 },
  logo: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '900' },
  brandTitle: { color: '#14532d', fontSize: 25, fontWeight: '900' },
  tagline: { color: '#64748b', fontSize: 13, marginTop: 4 },
  card: { backgroundColor: '#fff', padding: 22, borderRadius: 20, borderWidth: 1, borderColor: '#dcfce7', elevation: 2 },
  title: { color: '#0f172a', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#64748b', lineHeight: 21, marginTop: 8, marginBottom: 22 },
  label: { color: '#334155', fontSize: 14, fontWeight: '700', marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#0f172a', marginBottom: 17, backgroundColor: '#fff' },
  button: { backgroundColor: '#16a34a', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  backButton: { alignItems: 'center', padding: 13, marginTop: 5 },
  backText: { color: '#166534', fontWeight: '700' },
  notice: { color: '#64748b', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 18 },
});
