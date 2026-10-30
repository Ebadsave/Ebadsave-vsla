import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API = 'https://ebadsave-vsla.info-ebadsave.workers.dev';
const GROUP = { groupId: 'kya-2000', groupNumber: 'KYA 2000', memberNumber: 'KYA2000001', memberName: 'Twebaze Edwin' };

async function responseJson(response: Response) {
  const raw = await response.text();
  let data: any;
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Cloudflare returned an invalid response.'); }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export default function CloudflareAdminSetupScreen({ navigation }: { navigation: any }) {
  const [secret, setSecret] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  const start = () => {
    if (!secret.trim()) return Alert.alert('Required', 'Enter the Cloudflare ADMIN_BOOTSTRAP_SECRET.');
    if (!/^\\d{6,12}$/.test(pin)) return Alert.alert('Invalid PIN', 'Use 6–12 digits.');
    if (pin !== confirm) return Alert.alert('PIN mismatch', 'The PIN entries do not match.');
    Alert.alert('One-time setup', 'This permanently claims KYA 2000 in Cloudflare. Continue only if these details are correct.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Create administrator', style: 'destructive', onPress: () => void submit() },
    ]);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const created = await responseJson(await fetch(`${API}/v1/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-bootstrap-secret': secret.trim() },
        body: JSON.stringify({ ...GROUP, pin }),
      }));
      if (created.ok !== true || created.role !== 'admin') throw new Error('Cloudflare did not confirm administrator creation.');

      const loggedIn = await responseJson(await fetch(`${API}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberNumber: GROUP.memberNumber, pin }),
      }));
      if (loggedIn.ok !== true || typeof loggedIn.accessToken !== 'string') {
        throw new Error('Administrator was created, but login failed. Do not repeat the one-time bootstrap; contact support to complete login.');
      }

      await SecureStore.setItemAsync('ebadsave_cloudflare_access_token', loggedIn.accessToken);
      await SecureStore.setItemAsync('ebadsave_cloudflare_group_id', GROUP.groupId);
      setComplete(true);
      setSecret(''); setPin(''); setConfirm('');
      Alert.alert('Administrator created', 'KYA 2000 administrator was created and login succeeded. The access token is stored securely. PIN and bootstrap secret were not saved.', [
        { text: 'Continue', onPress: () => navigation.navigate('Welcome') },
      ]);
    } catch (e) {
      Alert.alert('Setup not confirmed', e instanceof Error ? e.message : 'Unknown setup error.');
    } finally { setBusy(false); }
  };

  return <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.brand}>Ebadsave VSLA</Text>
      <Text style={s.title}>Cloudflare test administrator</Text>
      <Text style={s.sub}>One-time secure setup for KYA 2000</Text>
      <View style={s.card}>
        <Row label="Group number" value="KYA 2000" />
        <Row label="Group ID" value="kya-2000" />
        <Row label="Administrator" value="Twebaze Edwin" />
        <Row label="Member number" value="KYA2000001" />
      </View>
      <Text style={s.label}>Cloudflare ADMIN_BOOTSTRAP_SECRET</Text>
      <TextInput style={s.input} value={secret} onChangeText={setSecret} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Enter bootstrap secret" editable={!busy && !complete} />
      <Text style={s.label}>Create PIN (6–12 digits)</Text>
      <TextInput style={s.input} value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" maxLength={12} placeholder="New PIN" editable={!busy && !complete} />
      <Text style={s.label}>Confirm PIN</Text>
      <TextInput style={s.input} value={confirm} onChangeText={setConfirm} secureTextEntry keyboardType="number-pad" maxLength={12} placeholder="Re-enter PIN" editable={!busy && !complete} />
      <View style={s.warning}><Text style={s.warningText}>Never share your PIN or bootstrap secret. They are sent directly to Cloudflare over HTTPS and are not stored by this screen.</Text></View>
      <TouchableOpacity style={[s.button, (busy || complete) && s.disabled]} onPress={start} disabled={busy || complete}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{complete ? 'Administrator created' : 'Create test administrator'}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={s.back} onPress={() => navigation.goBack()} disabled={busy}><Text style={s.backText}>Back</Text></TouchableOpacity>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={s.row}><Text style={s.rowLabel}>{label}</Text><Text style={s.rowValue}>{value}</Text></View>;
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' }, page: { flexGrow: 1, padding: 22, justifyContent: 'center' },
  brand: { color: '#16a34a', fontSize: 25, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  title: { color: '#0f172a', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#64748b', textAlign: 'center', marginTop: 7, marginBottom: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 8 },
  rowLabel: { color: '#64748b', fontSize: 13, flex: 1 }, rowValue: { color: '#0f172a', fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' },
  label: { color: '#334155', fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 13, color: '#0f172a', fontSize: 16 },
  warning: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 17 },
  warningText: { color: '#9a3412', fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: '#16a34a', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 19 },
  disabled: { opacity: 0.55 }, buttonText: { color: '#fff', fontWeight: '800' },
  back: { padding: 14, alignItems: 'center' }, backText: { color: '#166534', fontWeight: '700' },
});
