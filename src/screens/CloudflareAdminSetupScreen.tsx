import React, { useMemo, useState } from 'react';
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

const API = 'https://ebadsave-vsla-cloudflare.info-ebadsave.workers.dev';

type ApiResponse = {
  ok?: boolean;
  role?: string;
  accessToken?: string;
  groupId?: string;
  error?: string;
  code?: string;
  message?: string;
  requestId?: string;
  [key: string]: unknown;
};

async function responseJson(response: Response): Promise<ApiResponse> {
  const raw = await response.text();
  const requestId = response.headers.get('x-request-id') || undefined;
  let data: ApiResponse = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const code = 'CLOUDFLARE_INVALID_JSON';
    throw new Error(
      `Cloudflare error ${code} (HTTP ${response.status}). ` +
      `Response was not valid JSON.${requestId ? ` Request ID: ${requestId}.` : ''}`,
    );
  }

  if (!response.ok || data.ok === false) {
    const code =
      (typeof data.code === 'string' && data.code) ||
      (typeof data.error === 'string' && data.error) ||
      'CLOUDFLARE_REQUEST_FAILED';
    const message =
      (typeof data.message === 'string' && data.message) ||
      (typeof data.error === 'string' && data.error) ||
      'Cloudflare rejected the request.';
    const id = (typeof data.requestId === 'string' && data.requestId) || requestId;
    throw new Error(
      `Cloudflare error ${code} (HTTP ${response.status}): ${message}` +
      `${id ? ` | Request ID: ${id}` : ''}`,
    );
  }

  return data;
}

async function apiRequest(
  endpoint: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<ApiResponse> {
  let response: Response;
  try {
    response = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('APP_NETWORK_ERROR: Could not connect to Cloudflare. Check the internet connection.');
  }
  return responseJson(response);
}

export default function CloudflareAdminSetupScreen({ navigation }: { navigation: any }) {
  const [groupNumber, setGroupNumber] = useState('');
  const [adminName, setAdminName] = useState('');
  const [memberNumber, setMemberNumber] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  const cleanGroupNumber = groupNumber.trim().toUpperCase().replace(/^KYA\s*/, '');
  const normalizedMemberNumber = memberNumber.trim().toUpperCase().replace(/\s+/g, '');
  const groupId = useMemo(() => /^\d{4}$/.test(cleanGroupNumber) ? `kya-${cleanGroupNumber}` : '', [cleanGroupNumber]);

  const start = () => {
    const numeric = Number(cleanGroupNumber);
    const validRange = (numeric >= 2000 && numeric <= 2009) || (numeric >= 2010 && numeric <= 9090);
    if (!/^\d{4}$/.test(cleanGroupNumber) || !validRange) {
      Alert.alert('Check group number', 'Enter a valid KYA number in the permitted range.');
      return;
    }
    if (!adminName.trim() || !new RegExp(`^KYA${cleanGroupNumber}\\d{3}$`).test(normalizedMemberNumber)) {
      Alert.alert('Check administrator details', 'Enter the administrator name and a member number belonging to this group.');
      return;
    }
    if (!/^\d{6,12}$/.test(pin)) {
      Alert.alert('Invalid PIN', 'PIN must contain 6 to 12 digits.');
      return;
    }
    if (pin !== confirm) {
      Alert.alert('PIN mismatch', 'The PIN entries do not match.');
      return;
    }
    Alert.alert(
      'Create group administrator',
      `Create a separate administrator account for KYA ${cleanGroupNumber}? This will not change any other group’s credentials.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create administrator', onPress: () => void submit() },
      ],
    );
  };

  const submit = async () => {
    if (busy || complete) return;
    setBusy(true);
    try {
      const created = await apiRequest('/v1/auth/admin/setup', {
        groupNumber: `KYA ${cleanGroupNumber}`,
        memberNumber: normalizedMemberNumber,
        memberName: adminName.trim(),
        pin,
        confirmPin: confirm,
      });

      if (created.ok !== true || created.role !== 'admin' || created.groupId !== groupId) {
        throw new Error('Cloudflare did not confirm this group’s administrator account.');
      }

      const loggedIn = await apiRequest('/v1/auth/login', { memberNumber: normalizedMemberNumber, memberName: adminName.trim(), pin });
      if (loggedIn.ok !== true || typeof loggedIn.accessToken !== 'string' || !loggedIn.accessToken) {
        throw new Error('Administrator was created, but sign-in was not confirmed. Do not repeat setup; check the account first.');
      }

      await SecureStore.setItemAsync('ebadsave_cloudflare_access_token', loggedIn.accessToken);
      await SecureStore.setItemAsync('ebadsave_cloudflare_group_id', groupId);
      setPin(''); setConfirm(''); setComplete(true);
      Alert.alert('Administrator ready', `KYA ${cleanGroupNumber} now has its own administrator credentials.`, [
        { text: 'Continue', onPress: () => navigation.navigate('Welcome') },
      ]);
    } catch (error) {
      Alert.alert('Setup not confirmed', error instanceof Error ? error.message : 'An unexpected setup error occurred.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Text style={s.brand}>Ebadsave VSLA</Text>
        <Text style={s.title}>Group administrator setup</Text>
        <Text style={s.sub}>Each group has its own administrator member number and PIN.</Text>
        <View style={s.card}>
          <Text style={s.label}>Group number</Text>
          <TextInput style={s.input} value={groupNumber} onChangeText={setGroupNumber} placeholder="e.g. 2010 or KYA 2010" autoCapitalize="characters" editable={!busy && !complete} />
          <Text style={s.preview}>Group ID: {groupId || 'Enter group number'}</Text>
          <Text style={s.label}>Administrator full name</Text>
          <TextInput style={s.input} value={adminName} onChangeText={setAdminName} placeholder="Administrator name" editable={!busy && !complete} />
          <Text style={s.label}>Administrator member number</Text>
          <TextInput style={s.input} value={memberNumber} onChangeText={setMemberNumber} placeholder="e.g. KYA2010001" autoCapitalize="characters" editable={!busy && !complete} />
        </View>
<Text style={s.label}>Create PIN (6–12 digits)</Text>
        <TextInput style={s.input} value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" maxLength={12} placeholder="New PIN" editable={!busy && !complete} />
        <Text style={s.label}>Confirm PIN</Text>
        <TextInput style={s.input} value={confirm} onChangeText={setConfirm} secureTextEntry keyboardType="number-pad" maxLength={12} placeholder="Re-enter PIN" editable={!busy && !complete} />
        <View style={s.warning}><Text style={s.warningText}>Your PIN is sent securely to Cloudflare. Backend security secrets are never entered or stored in this app.</Text></View>
        <TouchableOpacity style={[s.button, (busy || complete) && s.disabled]} onPress={start} disabled={busy || complete}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{complete ? 'Administrator created' : 'Create group administrator'}</Text>}
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
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  label: { color: '#334155', fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 13, color: '#0f172a', fontSize: 16 },
  preview: { color: '#64748b', fontSize: 12, marginTop: 6 },
  warning: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 17 },
  warningText: { color: '#9a3412', fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: '#16a34a', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 19 },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontWeight: '800' },
  back: { padding: 14, alignItems: 'center' },
  backText: { color: '#166534', fontWeight: '700' },
});
