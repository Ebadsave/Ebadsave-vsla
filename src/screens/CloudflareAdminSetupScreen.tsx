import React, { useEffect, useMemo, useState } from 'react';
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
import {
  getCloudflareAccessToken,
  getCloudflareSessionGroupId,
  saveCloudflareSession,
  signOutCloudflareSession,
} from '../services/cloudflareApi';
import { cloudflareRequest } from '../services/cloudflareApi';

type Mode = 'setup' | 'signin';

function decodeGroupIdFromToken(token: string): string {
  try {
    const payload = token.split('.')[1];
    if (!payload) throw new Error('Missing token payload');

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const claims = JSON.parse(globalThis.atob(padded)) as {
      groupId?: unknown;
      role?: unknown;
    };

    if (claims.role !== 'admin' || typeof claims.groupId !== 'string' || !claims.groupId) {
      throw new Error('This account is not a group administrator.');
    }
    return claims.groupId;
  } catch {
    throw new Error('Could not verify the administrator sign-in. Please sign in again.');
  }
}

export default function CloudflareAdminSetupScreen({ navigation }: { navigation: any }) {
  const [mode, setMode] = useState<Mode>('setup');
  const [busy, setBusy] = useState(false);
  const [adminSignedIn, setAdminSignedIn] = useState(false);
  const [signedInGroupId, setSignedInGroupId] = useState('');

  const [groupNumber, setGroupNumber] = useState('');
  const [adminName, setAdminName] = useState('');
  const [memberNumber, setMemberNumber] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [signInName, setSignInName] = useState('');
  const [signInMemberNumber, setSignInMemberNumber] = useState('');
  const [signInPin, setSignInPin] = useState('');

  const [resetMemberNumber, setResetMemberNumber] = useState('');
  const [newMemberPin, setNewMemberPin] = useState('');
  const [confirmMemberPin, setConfirmMemberPin] = useState('');

  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [showSignInPin, setShowSignInPin] = useState(false);
  const [showNewMemberPin, setShowNewMemberPin] = useState(false);
  const [showConfirmMemberPin, setShowConfirmMemberPin] = useState(false);

  const cleanGroupNumber = groupNumber.trim().toUpperCase().replace(/^KYA\s*/, '');
  const normalizedMemberNumber = memberNumber.trim().toUpperCase().replace(/\s+/g, '');
  const groupId = useMemo(
    () => /^\d{4}$/.test(cleanGroupNumber) ? `kya-${cleanGroupNumber}` : '',
    [cleanGroupNumber],
  );

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      getCloudflareAccessToken(),
      getCloudflareSessionGroupId(),
    ]).then(([token, sessionGroupId]) => {
      if (mounted && token && sessionGroupId) {
        setAdminSignedIn(true);
        setSignedInGroupId(sessionGroupId);
      }
    }).catch(() => {
      // No saved Cloudflare session; administrator can sign in below.
    });

    return () => {
      mounted = false;
    };
  }, []);

  const completeSignIn = async (name: string, number: string, value: string) => {
    const normalizedNumber = number.trim().toUpperCase().replace(/\s+/g, '');
    const response = await fetch(
      'https://ebadsave-vsla-cloudflare.info-ebadsave.workers.dev/v1/auth/login',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberNumber: normalizedNumber,
          memberName: name.trim(),
          pin: value,
        }),
      },
    );

    const result = await response.json() as {
      ok?: boolean;
      accessToken?: string;
      error?: string;
      message?: string;
    };

    if (!response.ok || result.ok !== true || !result.accessToken) {
      throw new Error(result.message || result.error || `Sign-in failed (${response.status}).`);
    }

    const tokenGroupId = decodeGroupIdFromToken(result.accessToken);
    await saveCloudflareSession(result.accessToken, tokenGroupId);

    setAdminSignedIn(true);
    setSignedInGroupId(tokenGroupId);
    setSignInPin('');
  };

  const createAdministrator = async () => {
    const numericGroup = Number(cleanGroupNumber);
    const validRange =
      (numericGroup >= 2000 && numericGroup <= 2009) ||
      (numericGroup >= 2010 && numericGroup <= 9090);

    if (!/^\d{4}$/.test(cleanGroupNumber) || !validRange) {
      Alert.alert('Check group number', 'Enter a valid KYA group number.');
      return;
    }
    if (adminName.trim().length < 2) {
      Alert.alert('Administrator name required', 'Enter the administrator’s full name.');
      return;
    }
    if (!new RegExp(`^KYA${cleanGroupNumber}\\d{3}$`).test(normalizedMemberNumber)) {
      Alert.alert(
        'Check member number',
        `Enter an administrator member number belonging to KYA ${cleanGroupNumber}.`,
      );
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
      const response = await fetch(
        'https://ebadsave-vsla-cloudflare.info-ebadsave.workers.dev/v1/auth/admin/setup',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            groupNumber: `KYA ${cleanGroupNumber}`,
            memberNumber: normalizedMemberNumber,
            memberName: adminName.trim(),
            pin,
            confirmPin,
          }),
        },
      );

      const result = await response.json() as {
        ok?: boolean;
        role?: string;
        groupId?: string;
        error?: string;
        message?: string;
      };

      if (!response.ok || result.ok !== true || result.role !== 'admin' || result.groupId !== groupId) {
        throw new Error(result.message || result.error || `Administrator setup failed (${response.status}).`);
      }

      // Sign in immediately after successful setup.
      await completeSignIn(adminName, normalizedMemberNumber, pin);
      setPin('');
      setConfirmPin('');

      Alert.alert(
        'Administrator ready',
        `KYA ${cleanGroupNumber} administrator setup and sign-in succeeded.`,
      );
    } catch (error) {
      Alert.alert(
        'Setup not confirmed',
        error instanceof Error ? error.message : 'Could not set up the administrator.',
      );
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    if (signInName.trim().length < 2 || !signInMemberNumber.trim() || !/^\d{6,12}$/.test(signInPin)) {
      Alert.alert('Sign-in details required', 'Enter the administrator name, member number, and 6–12 digit PIN.');
      return;
    }

    setBusy(true);
    try {
      await completeSignIn(signInName, signInMemberNumber, signInPin);
      Alert.alert('Signed in', 'Group administrator sign-in succeeded.');
    } catch (error) {
      Alert.alert(
        'Sign-in failed',
        error instanceof Error ? error.message : 'Could not sign in as administrator.',
      );
    } finally {
      setBusy(false);
    }
  };

  const resetMemberPin = async () => {
    const target = resetMemberNumber.trim().toUpperCase().replace(/\s+/g, '');

    if (!adminSignedIn) {
      Alert.alert('Administrator sign-in required', 'Sign in as the group administrator first.');
      return;
    }
    if (!/^KYA\d{7}$/.test(target)) {
      Alert.alert('Invalid member number', 'Enter the member’s number, for example KYA2010002.');
      return;
    }
    if (!/^\d{6,12}$/.test(newMemberPin)) {
      Alert.alert('Invalid new PIN', 'The new PIN must contain 6–12 digits.');
      return;
    }
    if (newMemberPin !== confirmMemberPin) {
      Alert.alert('PIN mismatch', 'The new PIN entries do not match.');
      return;
    }

    Alert.alert(
      'Reset member PIN?',
      `Set a new PIN for ${target}? This only works for an active member or executive in ${signedInGroupId}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset PIN',
          style: 'destructive',
          onPress: () => void submitMemberPinReset(target),
        },
      ],
    );
  };

  const submitMemberPinReset = async (targetMemberNumber: string) => {
    setBusy(true);
    try {
      const result = await cloudflareRequest<{
        ok?: boolean;
        memberNumber?: string;
      }>('/v1/auth/users/reset-pin', {
        method: 'POST',
        body: {
          memberNumber: targetMemberNumber,
          pin: newMemberPin,
          confirmPin: confirmMemberPin,
        },
        authenticated: true,
      });

      if (result.ok !== true) {
        throw new Error('Worker did not confirm the member PIN reset.');
      }

      setResetMemberNumber('');
      setNewMemberPin('');
      setConfirmMemberPin('');
      Alert.alert('PIN reset', `A new PIN was set for ${result.memberNumber || targetMemberNumber}.`);
    } catch (error) {
      Alert.alert(
        'PIN reset failed',
        error instanceof Error ? error.message : 'Could not reset this member’s PIN.',
      );
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await signOutCloudflareSession();
      setAdminSignedIn(false);
      setSignedInGroupId('');
      Alert.alert('Signed out', 'The Cloudflare administrator session has been cleared.');
    } catch (error) {
      Alert.alert('Sign-out failed', error instanceof Error ? error.message : 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  };

  const pinField = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    visible: boolean,
    toggleVisible: () => void,
    placeholder: string,
    editable = true,
  ) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.flexInput}
          value={value}
          onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, 12))}
          secureTextEntry={!visible}
          keyboardType="number-pad"
          maxLength={12}
          placeholder={placeholder}
          editable={editable && !busy}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
          style={styles.visibilityButton}
          onPress={toggleVisible}
        >
          <Text style={styles.visibilityText}>{visible ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Ebadsave VSLA</Text>
        <Text style={styles.title}>Group administrator</Text>
        <Text style={styles.subtitle}>
          Set up or sign in as this group’s administrator. A signed-in administrator can reset a member or executive PIN in their own group.
        </Text>

        {adminSignedIn ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Administrator signed in</Text>
            <Text style={styles.help}>Group: {signedInGroupId}</Text>
            <Text style={styles.sectionTitle}>Reset a member PIN</Text>
            <Text style={styles.help}>
              Enter the member’s existing Cloudflare member number and assign a new PIN. Admin accounts cannot be reset here.
            </Text>

            <Text style={styles.label}>Member number</Text>
            <TextInput
              style={styles.input}
              value={resetMemberNumber}
              onChangeText={setResetMemberNumber}
              placeholder="Example: KYA2010002"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
            />

            {pinField('New PIN (6–12 digits)', newMemberPin, setNewMemberPin, showNewMemberPin, () => setShowNewMemberPin(v => !v), 'Enter new PIN')}
            {pinField('Confirm new PIN', confirmMemberPin, setConfirmMemberPin, showConfirmMemberPin, () => setShowConfirmMemberPin(v => !v), 'Re-enter new PIN')}

            <TouchableOpacity style={[styles.button, busy && styles.disabled]} onPress={() => void resetMemberPin()} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Reset member PIN</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={() => void signOut()} disabled={busy}>
              <Text style={styles.secondaryText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeButton, mode === 'setup' && styles.modeButtonSelected]}
                onPress={() => setMode('setup')}
                disabled={busy}
              >
                <Text style={[styles.modeText, mode === 'setup' && styles.modeTextSelected]}>Set up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, mode === 'signin' && styles.modeButtonSelected]}
                onPress={() => setMode('signin')}
                disabled={busy}
              >
                <Text style={[styles.modeText, mode === 'signin' && styles.modeTextSelected]}>Sign in</Text>
              </TouchableOpacity>
            </View>

            {mode === 'setup' ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Set up group administrator</Text>
                <Text style={styles.help}>Only one initial administrator can be registered for each group.</Text>

                <Text style={styles.label}>Group number</Text>
                <TextInput
                  style={styles.input}
                  value={groupNumber}
                  onChangeText={setGroupNumber}
                  placeholder="Example: 2010 or KYA 2010"
                  autoCapitalize="characters"
                  editable={!busy}
                />
                <Text style={styles.help}>Group ID: {groupId || 'Enter a four-digit group number'}</Text>

                <Text style={styles.label}>Administrator full name</Text>
                <TextInput
                  style={styles.input}
                  value={adminName}
                  onChangeText={setAdminName}
                  placeholder="Administrator name"
                  autoCapitalize="words"
                  editable={!busy}
                />

                <Text style={styles.label}>Administrator member number</Text>
                <TextInput
                  style={styles.input}
                  value={memberNumber}
                  onChangeText={setMemberNumber}
                  placeholder="Example: KYA2010001"
                  autoCapitalize="characters"
                  editable={!busy}
                />

                {pinField('Create PIN (6–12 digits)', pin, setPin, showPin, () => setShowPin(v => !v), 'Create PIN')}
                {pinField('Confirm PIN', confirmPin, setConfirmPin, showConfirmPin, () => setShowConfirmPin(v => !v), 'Confirm PIN')}

                <TouchableOpacity style={[styles.button, busy && styles.disabled]} onPress={() => void createAdministrator()} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create administrator</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Administrator sign-in</Text>
                <Text style={styles.label}>Administrator full name</Text>
                <TextInput
                  style={styles.input}
                  value={signInName}
                  onChangeText={setSignInName}
                  placeholder="Administrator full name"
                  autoCapitalize="words"
                  editable={!busy}
                />

                <Text style={styles.label}>Administrator member number</Text>
                <TextInput
                  style={styles.input}
                  value={signInMemberNumber}
                  onChangeText={setSignInMemberNumber}
                  placeholder="Example: KYA2010001"
                  autoCapitalize="characters"
                  editable={!busy}
                />

                {pinField('Administrator PIN', signInPin, setSignInPin, showSignInPin, () => setShowSignInPin(v => !v), 'Enter administrator PIN')}

                <TouchableOpacity style={[styles.button, busy && styles.disabled]} onPress={() => void signIn()} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} disabled={busy}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  page: { flexGrow: 1, padding: 18, justifyContent: 'center' },
  brand: { color: '#16a34a', fontSize: 23, fontWeight: '600', textAlign: 'center', marginBottom: 9 },
  title: { color: '#0f172a', fontSize: 20, fontWeight: '500', textAlign: 'center' },
  subtitle: { color: '#64748b', textAlign: 'center', marginTop: 6, marginBottom: 18, lineHeight: 17 },
  modeRow: { flexDirection: 'row', marginBottom: 12 },
  modeButton: { flex: 1, padding: 12, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', backgroundColor: '#fff' },
  modeButtonSelected: { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  modeText: { color: '#475569', fontWeight: '500' },
  modeTextSelected: { color: '#166534' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionTitle: { color: '#0f172a', fontSize: 16, fontWeight: '500', marginBottom: 6 },
  help: { color: '#64748b', fontSize: 11, lineHeight: 17, marginBottom: 6 },
  label: { color: '#334155', fontWeight: '500', marginTop: 8, marginBottom: 5 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, padding: 12, color: '#0f172a', fontSize: 15 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  flexInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 11, color: '#0f172a', fontSize: 13 },
  visibilityButton: { marginLeft: 7, minWidth: 56, height: 46, borderRadius: 8, borderWidth: 1, borderColor: '#16a34a', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0fdf4' },
  visibilityText: { color: '#166534', fontWeight: '500', fontSize: 11 },
  button: { minHeight: 47, backgroundColor: '#16a34a', borderRadius: 8, padding: 13, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderColor: '#16a34a', borderRadius: 7, padding: 10, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  secondaryText: { color: '#166534', fontWeight: '500' },
  back: { padding: 12, alignItems: 'center' },
  backText: { color: '#166534', fontWeight: '500' },
});
