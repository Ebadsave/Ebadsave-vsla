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

const API =
  'https://ebadsave-vsla-cloudflare.info-ebadsave.workers.dev';

const GROUP = {
  groupId: 'kya-2000',
  groupNumber: 'KYA 2000',
  memberNumber: 'KYA2000001',
  memberName: 'Twebaze Edwin',
};

type ApiResponse = {
  ok?: boolean;
  role?: string;
  accessToken?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
};

/**
 * Reads and validates Cloudflare responses.
 * Displays useful HTTP information when the Worker
 * returns HTML, invalid JSON, or an API error.
 */
async function responseJson(
  response: Response
): Promise<ApiResponse> {
  const raw = await response.text();

  let data: ApiResponse = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `Cloudflare returned a non-JSON response.\n\n` +
      `HTTP status: ${response.status}\n` +
      `Content-Type: ${
        response.headers.get('content-type') ?? 'unknown'
      }\n\n` +
      `Response: ${raw.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    const message =
      data.error ||
      data.message ||
      `HTTP ${response.status}`;

    throw new Error(
      `Cloudflare error (${response.status}): ${message}`
    );
  }

  return data;
}

/**
 * Sends a request to the Cloudflare Worker.
 */
async function apiRequest(
  endpoint: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<ApiResponse> {
  let response: Response;

  try {
    response = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(
      `Could not connect to Cloudflare.\n\n` +
      `${
        error instanceof Error
          ? error.message
          : 'Network connection failed.'
      }`
    );
  }

  return responseJson(response);
}

export default function CloudflareAdminSetupScreen({
  navigation,
}: {
  navigation: any;
}) {
  const [secret, setSecret] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  const start = () => {
    const cleanSecret = secret.trim();

    if (cleanSecret.length < 32) {
      Alert.alert(
        'Invalid bootstrap secret',
        'Enter the exact ADMIN_BOOTSTRAP_SECRET configured in Cloudflare. It must contain at least 32 characters.'
      );
      return;
    }

    if (!/^[0-9]{6,12}$/.test(pin)) {
      Alert.alert(
        'Invalid PIN',
        'Use a PIN containing 6–12 digits.'
      );
      return;
    }

    if (pin !== confirm) {
      Alert.alert(
        'PIN mismatch',
        'The PIN entries do not match.'
      );
      return;
    }

    Alert.alert(
      'One-time setup',
      'This permanently claims KYA 2000 in Cloudflare. Continue only if these details are correct.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Create administrator',
          style: 'destructive',
          onPress: () => void submit(),
        },
      ]
    );
  };

  const submit = async () => {
    if (busy || complete) return;

    setBusy(true);

    try {
      const cleanSecret = secret.trim();

      // STEP 1: Create the test administrator.
      const created = await apiRequest(
        '/v1/auth/bootstrap-admin',
        {
          ...GROUP,
          pin,
        },
        {
          'x-admin-bootstrap-secret': cleanSecret,
        }
      );

      if (
        created.ok !== true ||
        created.role !== 'admin'
      ) {
        throw new Error(
          'Cloudflare did not confirm administrator creation. Check the Worker response before retrying.'
        );
      }

      // STEP 2: Log in using the newly created administrator.
      let loggedIn: ApiResponse;

      try {
        loggedIn = await apiRequest(
          '/v1/auth/login',
          {
            memberNumber: GROUP.memberNumber,
            pin,
          }
        );
      } catch {
        throw new Error(
          'The administrator creation was confirmed, but login failed. Do not repeat the one-time bootstrap. The administrator may already exist. Check the Cloudflare records before attempting recovery.'
        );
      }

      if (
        loggedIn.ok !== true ||
        typeof loggedIn.accessToken !== 'string' ||
        loggedIn.accessToken.length === 0
      ) {
        throw new Error(
          'Administrator creation was confirmed, but Cloudflare did not return a valid login token. Do not repeat the one-time bootstrap.'
        );
      }

      // STEP 3: Securely store the login token and group ID.
      await SecureStore.setItemAsync(
        'ebadsave_cloudflare_access_token',
        loggedIn.accessToken
      );

      await SecureStore.setItemAsync(
        'ebadsave_cloudflare_group_id',
        GROUP.groupId
      );

      // STEP 4: Clear sensitive fields from the screen.
      setSecret('');
      setPin('');
      setConfirm('');

      setComplete(true);

      Alert.alert(
        'Administrator created',
        'KYA 2000 administrator creation and login succeeded. Your access token has been stored securely.',
        [
          {
            text: 'Continue',
            onPress: () => navigation.navigate('Welcome'),
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        'Setup not confirmed',
        error instanceof Error
          ? error.message
          : 'An unexpected setup error occurred.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
      >
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
        <TextInput
          style={s.input}
          value={secret}
          onChangeText={setSecret}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Enter bootstrap secret"
          editable={!busy && !complete}
        />

        <Text style={s.label}>Create PIN (6–12 digits)</Text>
        <TextInput
          style={s.input}
          value={pin}
          onChangeText={setPin}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={12}
          placeholder="New PIN"
          editable={!busy && !complete}
        />

        <Text style={s.label}>Confirm PIN</Text>
        <TextInput
          style={s.input}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={12}
          placeholder="Re-enter PIN"
          editable={!busy && !complete}
        />

        <View style={s.warning}>
          <Text style={s.warningText}>
            Never share your PIN or bootstrap secret.
            They are sent directly to Cloudflare over HTTPS.
          </Text>
        </View>

        <TouchableOpacity
          style={[s.button, (busy || complete) && s.disabled]}
          onPress={start}
          disabled={busy || complete}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.buttonText}>
              {complete ? 'Administrator created' : 'Create test administrator'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={s.back}
          onPress={() => navigation.goBack()}
          disabled={busy}
        >
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  page: { flexGrow: 1, padding: 22, justifyContent: 'center' },
  brand: {
    color: '#16a34a',
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  sub: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 8,
  },
  rowLabel: { color: '#64748b', fontSize: 13, flex: 1 },
  rowValue: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  label: {
    color: '#334155',
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 13,
    color: '#0f172a',
    fontSize: 16,
  },
  warning: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 17,
  },
  warningText: { color: '#9a3412', fontSize: 12, lineHeight: 18 },
  button: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 19,
  },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontWeight: '800' },
  back: { padding: 14, alignItems: 'center' },
  backText: { color: '#166534', fontWeight: '700' },
});
