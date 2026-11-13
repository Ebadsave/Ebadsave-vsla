import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API = 'https://ebadsave-vsla.info-ebadsave.workers.dev';

type Props = {
  navigation: any;
  route?: { params?: { groupNumber?: string; groupId?: string } };
};

async function responseJson(response: Response) {
  const raw = await response.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error('Cloudflare returned an invalid response.');
  }
  if (!response.ok) {
    const messages: Record<string, string> = {
      group_already_bootstrapped: 'This group already has an administrator. Sign in instead.',
      member_number_already_registered: 'This member number is already registered.',
      admin_member_number_must_belong_to_group: 'The member number must belong to the selected group.',
      invalid_credentials: 'The name, member number or PIN is incorrect.',
      account_locked: 'This account is temporarily locked. Try again later.',
      server_bootstrap_secret_not_configured: 'Administrator setup is temporarily unavailable. Please contact support.',
      server_pin_pepper_not_configured: 'Administrator setup is temporarily unavailable. Please contact support.',
    };
    throw new Error(messages[data.error] || data.error || `Request failed (${response.status}).`);
  }
  return data;
}

function groupDigitsFromMemberNumber(memberNumber: string) {
  const normalized = memberNumber.toUpperCase().replace(/\s+/g, '');
  return /^KYA\d{7}$/.test(normalized) ? normalized.slice(3, 7) : '';
}

export default function CloudflareAdminSetupScreen({ navigation, route }: Props) {
  const routeGroupNumber = String(route?.params?.groupNumber ?? '').replace(/^KYA\s*/i, '').trim();
  const [mode, setMode] = useState<'setup' | 'login'>(routeGroupNumber ? 'setup' : 'login');
  const [groupNumber, setGroupNumber] = useState(routeGroupNumber);
  const [memberName, setMemberName] = useState('');
  const [memberNumber, setMemberNumber] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const saveSession = async (loggedIn: any, groupId: string) => {
    if (loggedIn.ok !== true || typeof loggedIn.accessToken !== 'string') {
      throw new Error('Sign-in was not confirmed by the server.');
    }
    await SecureStore.setItemAsync('ebadsave_cloudflare_access_token', loggedIn.accessToken);
    await SecureStore.setItemAsync('ebadsave_cloudflare_group_id', groupId);
  };

  const signIn = async () => {
    const normalizedMemberNumber = memberNumber.trim().toUpperCase().replace(/\s+/g, '');
    const groupDigits = groupDigitsFromMemberNumber(normalizedMemberNumber);
    if (memberName.trim().length < 2) {
      Alert.alert('Name required', 'Enter the administrator name.');
      return;
    }
    if (!/^KYA\d{7}$/.test(normalizedMemberNumber)) {
      Alert.alert('Invalid member number', 'Enter the administrator member number, for example KYA2000001.');
      return;
    }
    if (!/^\d{6,12}$/.test(pin)) {
      Alert.alert('Invalid PIN', 'PIN must contain 6–12 digits.');
      return;
    }

    setBusy(true);
    try {
      const loggedIn = await responseJson(await fetch(`${API}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberName: memberName.trim(), memberNumber: normalizedMemberNumber, pin }),
      }));
      const groupId = route?.params?.groupId || `kya-${groupDigits}`;
      await saveSession(loggedIn, groupId);
      setPin('');
      setConfirmPin('');
      navigation.navigate('Welcome');
    } catch (error) {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  const createAdministrator = async () => {
    const normalizedGroup = groupNumber.trim().toUpperCase().replace(/^KYA\s*/, '');
    const normalizedMemberNumber = memberNumber.trim().toUpperCase().replace(/\s+/g, '');
    if (!/^\d{4}$/.test(normalizedGroup)) {
      Alert.alert('Group number required', 'Enter the four-digit group number, for example 2000.');
      return;
    }
    if (memberName.trim().length < 2) {
      Alert.alert('Name required', 'Enter the administrator name.');
      return;
    }
    if (!new RegExp(`^KYA${normalizedGroup}\\d{3}$`).test(normalizedMemberNumber)) {
      Alert.alert('Invalid member number', `Enter a member number belonging to KYA ${normalizedGroup}, ending in three digits.`);
      return;
    }
    if (!/^\d{6,12}$/.test(pin)) {
      Alert.alert('Invalid PIN', 'PIN must contain 6–12 digits.');
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert('PIN mismatch', 'The PIN entries do not match.');
      return;
    }

    setBusy(true);
    try {
      // The mobile app sends only group/member details and the PIN.
      // The Cloudflare Worker handles its private server-side setup secret.
      const created = await responseJson(await fetch(`${API}/v1/auth/admin/setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupNumber: `KYA ${normalizedGroup}`,
          memberNumber: normalizedMemberNumber,
          memberName: memberName.trim(),
          pin,
          confirmPin,
        }),
      }));
      if (created.ok !== true || created.role !== 'admin' || typeof created.groupId !== 'string') {
        throw new Error('The server did not confirm administrator setup.');
      }

      const loggedIn = await responseJson(await fetch(`${API}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberName: memberName.trim(), memberNumber: normalizedMemberNumber, pin }),
      }));
      await saveSession(loggedIn, created.groupId);
      setPin('');
      setConfirmPin('');
      Alert.alert('Administrator ready', `Administrator access for KYA ${normalizedGroup} is set up.`, [
        { text: 'Continue', onPress: () => navigation.navigate('Welcome') },
      ]);
    } catch (error) {
      Alert.alert('Setup failed', error instanceof Error ? error.message : 'Unable to complete administrator setup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Text style={s.brand}>Ebadsave VSLA</Text>
        <Text style={s.title}>Group administrator</Text>
        <Text style={s.sub}>Set up your administrator access or sign in.</Text>

        <View style={s.switchRow}>
          <TouchableOpacity style={[s.switchButton, mode === 'setup' && s.switchActive]} onPress={() => setMode('setup')} disabled={busy}>
            <Text style={[s.switchText, mode === 'setup' && s.switchTextActive]}>Set up</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.switchButton, mode === 'login' && s.switchActive]} onPress={() => setMode('login')} disabled={busy}>
            <Text style={[s.switchText, mode === 'login' && s.switchTextActive]}>Sign in</Text>
          </TouchableOpacity>
        </View>

        {mode === 'setup' && <>
          <Text style={s.label}>Group number</Text>
          <TextInput style={s.input} value={groupNumber} onChangeText={setGroupNumber} placeholder="Example: 2000" keyboardType="number-pad" maxLength={4} editable={!busy} />
        </>}

        <Text style={s.label}>Administrator name</Text>
        <TextInput style={s.input} value={memberName} onChangeText={setMemberName} placeholder="Enter full name" autoCapitalize="words" editable={!busy} />

        <Text style={s.label}>Administrator member number</Text>
        <TextInput style={s.input} value={memberNumber} onChangeText={setMemberNumber} placeholder="Example: KYA2000001" autoCapitalize="characters" autoCorrect={false} editable={!busy} />

        <Text style={s.label}>PIN (6–12 digits)</Text>
        <View style={s.pinRow}>
          <TextInput style={[s.input, s.pinInput]} value={pin} onChangeText={setPin} secureTextEntry={!showPin} keyboardType="number-pad" maxLength={12} placeholder="Enter PIN" editable={!busy} />
          <TouchableOpacity style={s.eyeButton} onPress={() => setShowPin(value => !value)}><Text style={s.eyeText}>{showPin ? 'Hide' : 'Show'}</Text></TouchableOpacity>
        </View>

        {mode === 'setup' && <>
          <Text style={s.label}>Confirm PIN</Text>
          <TextInput style={s.input} value={confirmPin} onChangeText={setConfirmPin} secureTextEntry={!showPin} keyboardType="number-pad" maxLength={12} placeholder="Re-enter PIN" editable={!busy} />
        </>}

        <TouchableOpacity style={[s.button, busy && s.disabled]} onPress={() => void (mode === 'setup' ? createAdministrator() : signIn())} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{mode === 'setup' ? 'Create administrator account' : 'Sign in'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.back} onPress={() => navigation.goBack()} disabled={busy}><Text style={s.backText}>Back</Text></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  page: { flexGrow: 1, padding: 22, justifyContent: 'center' },
  brand: { color: '#16a34a', fontSize: 25, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  title: { color: '#0f172a', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#64748b', textAlign: 'center', marginTop: 7, marginBottom: 20 },
  switchRow: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 10, padding: 4, marginBottom: 10 },
  switchButton: { flex: 1, padding: 11, alignItems: 'center', borderRadius: 8 },
  switchActive: { backgroundColor: '#16a34a' },
  switchText: { color: '#475569', fontWeight: '700' },
  switchTextActive: { color: '#fff' },
  label: { color: '#334155', fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 13, color: '#0f172a', fontSize: 16 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinInput: { flex: 1 },
  eyeButton: { padding: 12 },
  eyeText: { color: '#166534', fontWeight: '700' },
  button: { backgroundColor: '#16a34a', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 22 },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontWeight: '800' },
  back: { padding: 14, alignItems: 'center' },
  backText: { color: '#166534', fontWeight: '700' },
});
