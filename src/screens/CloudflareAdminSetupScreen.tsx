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
import { saveAutomaticCloudBackupPassphrase } from '../database/backup';

type AdminMode = 'setup' | 'signin';
type PassphraseMode = 'setup' | 'signin';

const API_URL = 'https://ebadsave-vsla-cloudflare.info-ebadsave.workers.dev';

function getAdminGroupFromToken(token: string): string {
  try {
    const payload = token.split('.')[1];
    if (!payload) throw new Error('Missing token payload');

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      '=',
    );
    const claims = JSON.parse(globalThis.atob(padded)) as {
      groupId?: unknown;
      role?: unknown;
    };

    if (
      claims.role !== 'admin'
      || typeof claims.groupId !== 'string'
      || !claims.groupId
    ) {
      throw new Error('Not a group administrator');
    }

    return claims.groupId;
  } catch {
    throw new Error('Could not verify the administrator sign-in. Please sign in again.');
  }
}

export default function CloudflareAdminSetupScreen({
  navigation,
}: {
  navigation: any;
}) {
  const [adminMode, setAdminMode] = useState<AdminMode>('setup');
  const [passphraseMode, setPassphraseMode] = useState<PassphraseMode>('setup');
  const [busy, setBusy] = useState(false);
  const [adminSignedIn, setAdminSignedIn] = useState(false);
  const [signedInGroupId, setSignedInGroupId] = useState('');

  const [groupNumber, setGroupNumber] = useState('');
  const [adminName, setAdminName] = useState('');
  const [memberNumber, setMemberNumber] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [confirmAdminPin, setConfirmAdminPin] = useState('');

  const [signInName, setSignInName] = useState('');
  const [signInMemberNumber, setSignInMemberNumber] = useState('');
  const [signInPin, setSignInPin] = useState('');

  const [resetMemberNumber, setResetMemberNumber] = useState('');
  const [newMemberPin, setNewMemberPin] = useState('');
  const [confirmMemberPin, setConfirmMemberPin] = useState('');

  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [existingPassphrase, setExistingPassphrase] = useState('');
  const [passphraseSaved, setPassphraseSaved] = useState(false);

  const [showAdminPin, setShowAdminPin] = useState(false);
  const [showConfirmAdminPin, setShowConfirmAdminPin] = useState(false);
  const [showSignInPin, setShowSignInPin] = useState(false);
  const [showNewMemberPin, setShowNewMemberPin] = useState(false);
  const [showConfirmMemberPin, setShowConfirmMemberPin] = useState(false);
  const [showNewPassphrase, setShowNewPassphrase] = useState(false);
  const [showConfirmPassphrase, setShowConfirmPassphrase] = useState(false);
  const [showExistingPassphrase, setShowExistingPassphrase] = useState(false);

  const cleanGroupNumber = groupNumber
    .trim()
    .toUpperCase()
    .replace(/^KYA\s*/, '');

  const normalizedAdminMemberNumber = memberNumber
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

  const groupId = useMemo(
    () => /^\d{4}$/.test(cleanGroupNumber)
      ? `kya-${cleanGroupNumber}`
      : '',
    [cleanGroupNumber],
  );

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      getCloudflareAccessToken(),
      getCloudflareSessionGroupId(),
    ])
      .then(([token, sessionGroupId]) => {
        if (mounted && token && sessionGroupId) {
          setAdminSignedIn(true);
          setSignedInGroupId(sessionGroupId);
        }
      })
      .catch(() => {
        // No stored session; administrator can sign in below.
      });

    return () => {
      mounted = false;
    };
  }, []);

  const completeSignIn = async (
    name: string,
    number: string,
    pin: string,
  ) => {
    const normalizedNumber = number
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');

    const response = await fetch(`${API_URL}/v1/auth/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        memberNumber: normalizedNumber,
        memberName: name.trim(),
        pin,
      }),
    });

    const result = await response.json() as {
      ok?: boolean;
      accessToken?: string;
      error?: string;
      message?: string;
    };

    if (!response.ok || result.ok !== true || !result.accessToken) {
      throw new Error(
        result.message
          || result.error
          || `Sign-in failed (${response.status}).`,
      );
    }

    const tokenGroupId = getAdminGroupFromToken(result.accessToken);
    await saveCloudflareSession(result.accessToken, tokenGroupId);

    setAdminSignedIn(true);
    setSignedInGroupId(tokenGroupId);
    setSignInPin('');
  };

  const createAdministrator = async () => {
    const numericGroup = Number(cleanGroupNumber);
    const validRange =
      (numericGroup >= 2000 && numericGroup <= 2009)
      || (numericGroup >= 2010 && numericGroup <= 9090);

    if (!/^\d{4}$/.test(cleanGroupNumber) || !validRange) {
      Alert.alert('Check group number', 'Enter a valid KYA group number.');
      return;
    }

    if (adminName.trim().length < 2) {
      Alert.alert('Administrator name required', 'Enter the administrator’s full name.');
      return;
    }

    if (!new RegExp(`^KYA${cleanGroupNumber}\\d{3}$`).test(normalizedAdminMemberNumber)) {
      Alert.alert(
        'Check member number',
        `Enter an administrator member number belonging to KYA ${cleanGroupNumber}.`,
      );
      return;
    }

    if (!/^\d{6,12}$/.test(adminPin)) {
      Alert.alert('Invalid PIN', 'PIN must contain 6–12 digits.');
      return;
    }

    if (adminPin !== confirmAdminPin) {
      Alert.alert('PIN mismatch', 'The PIN entries do not match.');
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`${API_URL}/v1/auth/admin/setup`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          groupNumber: `KYA ${cleanGroupNumber}`,
          memberNumber: normalizedAdminMemberNumber,
          memberName: adminName.trim(),
          pin: adminPin,
          confirmPin: confirmAdminPin,
        }),
      });

      const result = await response.json() as {
        ok?: boolean;
        role?: string;
        groupId?: string;
        error?: string;
        message?: string;
      };

      if (
        !response.ok
        || result.ok !== true
        || result.role !== 'admin'
        || result.groupId !== groupId
      ) {
        throw new Error(
          result.message
            || result.error
            || `Administrator setup failed (${response.status}).`,
        );
      }

      await completeSignIn(
        adminName,
        normalizedAdminMemberNumber,
        adminPin,
      );

      setAdminPin('');
      setConfirmAdminPin('');

      Alert.alert(
        'Administrator ready',
        `KYA ${cleanGroupNumber} administrator setup and sign-in succeeded.`,
      );
    } catch (error) {
      Alert.alert(
        'Setup not confirmed',
        error instanceof Error
          ? error.message
          : 'Could not set up the administrator.',
      );
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    if (
      signInName.trim().length < 2
      || !signInMemberNumber.trim()
      || !/^\d{6,12}$/.test(signInPin)
    ) {
      Alert.alert(
        'Sign-in details required',
        'Enter the administrator name, member number, and 6–12 digit PIN.',
      );
      return;
    }

    setBusy(true);

    try {
      await completeSignIn(
        signInName,
        signInMemberNumber,
        signInPin,
      );
      Alert.alert('Signed in', 'Group administrator sign-in succeeded.');
    } catch (error) {
      Alert.alert(
        'Sign-in failed',
        error instanceof Error
          ? error.message
          : 'Could not sign in as administrator.',
      );
    } finally {
      setBusy(false);
    }
  };

  const resetMemberPin = () => {
    const target = resetMemberNumber
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');

    if (!adminSignedIn) {
      Alert.alert(
        'Administrator sign-in required',
        'Sign in as the group administrator first.',
      );
      return;
    }

    if (!/^KYA\d{7}$/.test(target)) {
      Alert.alert(
        'Invalid member number',
        'Enter the member’s number, for example KYA2010002.',
      );
      return;
    }

    if (!/^\d{6,12}$/.test(newMemberPin)) {
      Alert.alert(
        'Invalid new PIN',
        'The new PIN must contain 6–12 digits.',
      );
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

      Alert.alert(
        'PIN reset',
        `A new PIN was set for ${result.memberNumber || targetMemberNumber}.`,
      );
    } catch (error) {
      Alert.alert(
        'PIN reset failed',
        error instanceof Error
          ? error.message
          : 'Could not reset this member’s PIN.',
      );
    } finally {
      setBusy(false);
    }
  };

  const saveNewPassphrase = async () => {
    if (newPassphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase too short',
        'Use a passphrase containing at least 12 characters.',
      );
      return;
    }

    if (newPassphrase !== confirmPassphrase) {
      Alert.alert(
        'Passphrase mismatch',
        'The passphrase entries do not match.',
      );
      return;
    }

    setBusy(true);

    try {
      await saveAutomaticCloudBackupPassphrase(newPassphrase);
      setNewPassphrase('');
      setConfirmPassphrase('');
      setPassphraseSaved(true);

      Alert.alert(
        'Passphrase saved',
        'The passphrase is saved securely on this device and is ready to use for encrypted backups.',
      );
    } catch (error) {
      Alert.alert(
        'Could not save passphrase',
        error instanceof Error
          ? error.message
          : 'The passphrase could not be saved securely.',
      );
    } finally {
      setBusy(false);
    }
  };

  const useExistingPassphrase = async () => {
    if (existingPassphrase.trim().length < 12) {
      Alert.alert(
        'Passphrase required',
        'Enter the backup passphrase (at least 12 characters).',
      );
      return;
    }

    setBusy(true);

    try {
      await saveAutomaticCloudBackupPassphrase(existingPassphrase);
      setExistingPassphrase('');
      setPassphraseSaved(true);

      Alert.alert(
        'Passphrase saved on this device',
        'The passphrase is available to this device’s backup flow. It is not verified until an encrypted backup is successfully decrypted.',
      );
    } catch (error) {
      Alert.alert(
        'Could not save passphrase',
        error instanceof Error
          ? error.message
          : 'The passphrase could not be saved securely.',
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
      setPassphraseSaved(false);

      Alert.alert(
        'Signed out',
        'The Cloudflare administrator session has been cleared.',
      );
    } catch (error) {
      Alert.alert(
        'Sign-out failed',
        error instanceof Error
          ? error.message
          : 'Could not sign out.',
      );
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
          editable={!busy}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
          style={styles.visibilityButton}
          onPress={toggleVisible}
          disabled={busy}
        >
          <Text style={styles.visibilityText}>{visible ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const passphraseField = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    visible: boolean,
    toggleVisible: () => void,
    placeholder: string,
  ) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.flexInput}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={placeholder}
          editable={!busy}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
          style={styles.visibilityButton}
          onPress={toggleVisible}
          disabled={busy}
        >
          <Text style={styles.visibilityText}>{visible ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>Ebadsave VSLA</Text>
        <Text style={styles.title}>Group administrator</Text>
        <Text style={styles.subtitle}>
          Set up or sign in as this group’s administrator. After signing in,
          set up or enter the recovery passphrase used for encrypted backups.
        </Text>

        {adminSignedIn ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Administrator signed in</Text>
              <Text style={styles.help}>Group: {signedInGroupId}</Text>

              <TouchableOpacity
                style={[styles.secondaryButton, busy && styles.disabled]}
                onPress={() => void signOut()}
                disabled={busy}
              >
                <Text style={styles.secondaryText}>Sign out</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Cloud backup passphrase</Text>
              <Text style={styles.help}>
                This passphrase encrypts and decrypts group backups. It is
                stored securely on this device, not on Cloudflare. Keep a safe
                copy: losing it means encrypted backups cannot be recovered.
              </Text>

              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    passphraseMode === 'setup' && styles.modeButtonSelected,
                  ]}
                  onPress={() => setPassphraseMode('setup')}
                  disabled={busy}
                >
                  <Text
                    style={[
                      styles.modeText,
                      passphraseMode === 'setup' && styles.modeTextSelected,
                    ]}
                  >
                    Set up passphrase
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    passphraseMode === 'signin' && styles.modeButtonSelected,
                  ]}
                  onPress={() => setPassphraseMode('signin')}
                  disabled={busy}
                >
                  <Text
                    style={[
                      styles.modeText,
                      passphraseMode === 'signin' && styles.modeTextSelected,
                    ]}
                  >
                    Use existing
                  </Text>
                </TouchableOpacity>
              </View>

              {passphraseMode === 'setup' ? (
                <>
                  {passphraseField(
                    'Create passphrase (12+ characters)',
                    newPassphrase,
                    setNewPassphrase,
                    showNewPassphrase,
                    () => setShowNewPassphrase((value) => !value),
                    'Create a recovery passphrase',
                  )}

                  {passphraseField(
                    'Confirm passphrase',
                    confirmPassphrase,
                    setConfirmPassphrase,
                    showConfirmPassphrase,
                    () => setShowConfirmPassphrase((value) => !value),
                    'Re-enter the recovery passphrase',
                  )}

                  <TouchableOpacity
                    style={[styles.button, busy && styles.disabled]}
                    onPress={() => void saveNewPassphrase()}
                    disabled={busy}
                  >
                    {busy
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.buttonText}>Set up passphrase</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {passphraseField(
                    'Existing recovery passphrase',
                    existingPassphrase,
                    setExistingPassphrase,
                    showExistingPassphrase,
                    () => setShowExistingPassphrase((value) => !value),
                    'Enter the passphrase used for your backup',
                  )}

                  <TouchableOpacity
                    style={[styles.button, busy && styles.disabled]}
                    onPress={() => void useExistingPassphrase()}
                    disabled={busy}
                  >
                    {busy
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.buttonText}>Use existing passphrase</Text>}
                  </TouchableOpacity>
                </>
              )}

              {passphraseSaved && (
                <Text style={styles.successText}>
                  Passphrase saved securely on this device. To confirm it is
                  correct for a cloud backup, restore an existing backup.
                </Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Reset a member PIN</Text>
              <Text style={styles.help}>
                Reset an active member or executive in this group. Administrator
                PIN recovery is not included here.
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

              {pinField(
                'New member PIN (6–12 digits)',
                newMemberPin,
                setNewMemberPin,
                showNewMemberPin,
                () => setShowNewMemberPin((value) => !value),
                'Enter new PIN',
              )}

              {pinField(
                'Confirm new member PIN',
                confirmMemberPin,
                setConfirmMemberPin,
                showConfirmMemberPin,
                () => setShowConfirmMemberPin((value) => !value),
                'Re-enter new PIN',
              )}

              <TouchableOpacity
                style={[styles.button, busy && styles.disabled]}
                onPress={resetMemberPin}
                disabled={busy}
              >
                {busy
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buttonText}>Reset member PIN</Text>}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  adminMode === 'setup' && styles.modeButtonSelected,
                ]}
                onPress={() => setAdminMode('setup')}
                disabled={busy}
              >
                <Text
                  style={[
                    styles.modeText,
                    adminMode === 'setup' && styles.modeTextSelected,
                  ]}
                >
                  Sign up
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeButton,
                  adminMode === 'signin' && styles.modeButtonSelected,
                ]}
                onPress={() => setAdminMode('signin')}
                disabled={busy}
              >
                <Text
                  style={[
                    styles.modeText,
                    adminMode === 'signin' && styles.modeTextSelected,
                  ]}
                >
                  Sign in
                </Text>
              </TouchableOpacity>
            </View>

            {adminMode === 'setup' ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Sign up group administrator</Text>
                <Text style={styles.help}>
                  Create the first administrator account for this group.
                </Text>

                <Text style={styles.label}>Group number</Text>
                <TextInput
                  style={styles.input}
                  value={groupNumber}
                  onChangeText={setGroupNumber}
                  placeholder="Example: 2010 or KYA 2010"
                  autoCapitalize="characters"
                  editable={!busy}
                />

                <Text style={styles.help}>
                  Group ID: {groupId || 'Enter a four-digit group number'}
                </Text>

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

                {pinField(
                  'Create PIN (6–12 digits)',
                  adminPin,
                  setAdminPin,
                  showAdminPin,
                  () => setShowAdminPin((value) => !value),
                  'Create administrator PIN',
                )}

                {pinField(
                  'Confirm administrator PIN',
                  confirmAdminPin,
                  setConfirmAdminPin,
                  showConfirmAdminPin,
                  () => setShowConfirmAdminPin((value) => !value),
                  'Re-enter administrator PIN',
                )}

                <TouchableOpacity
                  style={[styles.button, busy && styles.disabled]}
                  onPress={() => void createAdministrator()}
                  disabled={busy}
                >
                  {busy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.buttonText}>Sign up administrator</Text>}
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

                {pinField(
                  'Administrator PIN',
                  signInPin,
                  setSignInPin,
                  showSignInPin,
                  () => setShowSignInPin((value) => !value),
                  'Enter administrator PIN',
                )}

                <TouchableOpacity
                  style={[styles.button, busy && styles.disabled]}
                  onPress={() => void signIn()}
                  disabled={busy}
                >
                  {busy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.buttonText}>Sign in administrator</Text>}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          style={styles.back}
          onPress={() => navigation.goBack()}
          disabled={busy}
        >
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  page: { flexGrow: 1, padding: 18, justifyContent: 'center' },
  brand: {
    color: '#16a34a',
    fontSize: 23,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 9,
  },
  title: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    lineHeight: 18,
  },
  modeRow: { flexDirection: 'row', marginBottom: 12 },
  modeButton: {
    flex: 1,
    padding: 11,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  modeButtonSelected: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
  },
  modeText: { color: '#475569', fontWeight: '600', fontSize: 12 },
  modeTextSelected: { color: '#166534' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  help: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 6,
  },
  label: {
    color: '#334155',
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 5,
    fontSize: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 11,
    color: '#0f172a',
    fontSize: 13,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  flexInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    color: '#0f172a',
    fontSize: 13,
  },
  visibilityButton: {
    marginLeft: 7,
    minWidth: 54,
    height: 44,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
  },
  visibilityText: {
    color: '#166534',
    fontWeight: '600',
    fontSize: 11,
  },
  button: {
    minHeight: 44,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 13,
  },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  secondaryButton: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryText: { color: '#166534', fontWeight: '600', fontSize: 12 },
  successText: {
    color: '#166534',
    backgroundColor: '#dcfce7',
    padding: 9,
    borderRadius: 7,
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
  },
  back: { padding: 11, alignItems: 'center' },
  backText: { color: '#166534', fontWeight: '600', fontSize: 12 },
});
