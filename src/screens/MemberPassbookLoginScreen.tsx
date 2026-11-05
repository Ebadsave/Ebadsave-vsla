import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { CloudflareApiError, signInMemberToCloudflare } from '../services/cloudflareApi';

type Props = { navigation: any };

export default function MemberPassbookLoginScreen({ navigation }: Props) {
  const [memberNumber, setMemberNumber] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    const normalizedNumber = memberNumber.trim().toUpperCase();
    if (!normalizedNumber) {
      Alert.alert('Member number required', 'Enter your member number.');
      return;
    }
    if (!/^\d+$/.test(pin)) {
      Alert.alert('Invalid PIN', 'Only numbers allowed');
      return;
    }
    if (pin.length < 6) {
      Alert.alert('Invalid PIN', 'PIN too short - PIN must be 6 to 12 digits');
      return;
    }
    if (pin.length > 12) {
      Alert.alert('Invalid PIN', 'PIN too long - maximum 12 digits');
      return;
    }

    setLoading(true);
    try {
      await signInMemberToCloudflare(normalizedNumber, pin);
      setPin('');
      navigation.replace('MemberPassbook');
    } catch (error) {
      const message = error instanceof CloudflareApiError
        ? (error.status === 401 ? 'Member number or PIN is incorrect, or this account is not activated for remote access.' : error.message)
        : error instanceof Error ? error.message : 'Please try again.';
      Alert.alert('Remote sign-in failed', message);
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
            <Text style={styles.title}>Remote Member Passbook</Text>
            <Text style={styles.subtitle}>Sign in securely to Cloudflare to view the passbook linked to your member account.</Text>
            <Text style={styles.label}>Member Number</Text>
            <TextInput
              value={memberNumber} onChangeText={setMemberNumber}
              autoCapitalize="characters" autoCorrect={false}
              placeholder="e.g. KYA2000001" placeholderTextColor="#94a3b8"
              style={styles.input} returnKeyType="next" accessibilityLabel="Member number"
            />
            <Text style={styles.label}>Private PIN (6–12 digits)</Text>
            <View style={styles.pinRow}>
              <TextInput
                value={pin}
                onChangeText={(value) => setPin(value.replace(/[^0-9]/g, '').slice(0, 12))}
                secureTextEntry={!showPin} keyboardType="number-pad" autoCapitalize="none"
                autoCorrect={false} placeholder="Enter your PIN" placeholderTextColor="#94a3b8"
                style={styles.pinInput} maxLength={12} returnKeyType="done"
                onSubmitEditing={signIn} accessibilityLabel="Private PIN"
              />
              <TouchableOpacity onPress={() => setShowPin((value) => !value)} accessibilityLabel={showPin ? 'Hide PIN' : 'Show PIN'}>
                <Text style={styles.showPin}>{showPin ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={signIn} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Open My Passbook</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.notice}>Your PIN is sent securely to the Ebadsave Cloudflare service for verification. It is not saved in this screen or included in the passbook request.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0fdf4' }, flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  brand: { alignItems: 'center', marginBottom: 26 },
  logo: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '900' },
  brandTitle: { color: '#14532d', fontSize: 25, fontWeight: '900' }, tagline: { color: '#64748b', fontSize: 13, marginTop: 4 },
  card: { backgroundColor: '#fff', padding: 22, borderRadius: 20, borderWidth: 1, borderColor: '#dcfce7', elevation: 2 },
  title: { color: '#0f172a', fontSize: 23, fontWeight: '800' }, subtitle: { color: '#64748b', lineHeight: 21, marginTop: 8, marginBottom: 22 },
  label: { color: '#334155', fontSize: 14, fontWeight: '700', marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#0f172a', marginBottom: 17, backgroundColor: '#fff' },
  pinRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, marginBottom: 17 },
  pinInput: { flex: 1, paddingVertical: 13, fontSize: 16, color: '#0f172a' }, showPin: { color: '#166534', fontWeight: '800', padding: 8 },
  button: { backgroundColor: '#16a34a', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.65 }, buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  backButton: { alignItems: 'center', padding: 13, marginTop: 5 }, backText: { color: '#166534', fontWeight: '700' },
  notice: { color: '#64748b', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 18 },
});
