import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { submitRemoteMemberRegistration } from '../services/cloudflareApi';

export default function MemberRemoteRegistrationScreen() {
  const [groupNumber, setGroupNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [nextOfKin, setNextOfKin] = useState('');
  const [cell, setCell] = useState('');
  const [district, setDistrict] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    const normalizedGroup = groupNumber
      .trim()
      .toUpperCase()
      .replace(/^KYA\s*/, '');

    if (!/^\d{4}$/.test(normalizedGroup)) {
      Alert.alert(
        'Check group number',
        'Enter the four digits after KYA, for example 2000.',
      );
      return;
    }

    if (
      !fullName.trim() ||
      !gender.trim() ||
      !cell.trim() ||
      !district.trim() ||
      !/^\d+$/.test(age) ||
      Number(age) < 18 ||
      Number(age) > 120
    ) {
      Alert.alert(
        'Incomplete details',
        'Enter your full name, gender, age (18–120), cell and district.',
      );
      return;
    }

    if (!/^\d{6,12}$/.test(pin)) {
      Alert.alert(
        'Invalid PIN',
        'PIN must be 6 to 12 digits.',
      );
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert(
        'PIN mismatch',
        'The two PIN entries do not match.',
      );
      return;
    }

    setSubmitting(true);

    try {
      await submitRemoteMemberRegistration({
        groupNumber: `KYA ${normalizedGroup}`,
        fullName: fullName.trim(),
        gender: gender.trim(),
        age: Number(age),
        phone: phone.trim() || undefined,
        nextOfKin: nextOfKin.trim() || undefined,
        cell: cell.trim(),
        district: district.trim(),
        pin,
      });

      setSubmitted(true);

      // Clear PIN values from screen state.
      setPin('');
      setConfirmPin('');
    } catch (error) {
      Alert.alert(
        'Registration not submitted',
        error instanceof Error
          ? error.message.replace(/_/g, ' ')
          : 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.success}>
        <Text style={styles.successTitle}>
          REGISTRATION PENDING
        </Text>

        <Text style={styles.body}>
          Your application has been submitted successfully.
          Your group administrator must review and approve
          it before a member number is issued.
        </Text>

        <Text style={styles.body}>
          You are not yet an active member and cannot access
          group financial records or conduct transactions.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>
        Remote Member Registration
      </Text>

      <Text style={styles.body}>
        Apply to join an existing Ebadsave VSLA group.
        Your registration remains pending until the group
        administrator approves it.
      </Text>

      <Field
        label="Group number"
        value={groupNumber}
        onChangeText={setGroupNumber}
        placeholder="KYA 2000"
      />

      <Field
        label="Full name"
        value={fullName}
        onChangeText={setFullName}
      />

      <Field
        label="Gender"
        value={gender}
        onChangeText={setGender}
        placeholder="Female / Male / Other"
      />

      <Field
        label="Age"
        value={age}
        onChangeText={setAge}
        keyboardType="number-pad"
      />

      <Field
        label="Phone (optional)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <Field
        label="Next of kin (optional)"
        value={nextOfKin}
        onChangeText={setNextOfKin}
      />

      <Field
        label="Cell"
        value={cell}
        onChangeText={setCell}
      />

      <Field
        label="District"
        value={district}
        onChangeText={setDistrict}
      />

      <Field
        label="Create PIN (6–12 digits)"
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        secureTextEntry
      />

      <Field
        label="Confirm PIN"
        value={confirmPin}
        onChangeText={setConfirmPin}
        keyboardType="number-pad"
        secureTextEntry
      />

      <TouchableOpacity
        disabled={submitting}
        style={[
          styles.button,
          submitting && styles.disabled,
        ]}
        onPress={() => void submit()}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            Submit registration
          </Text>
        )}
      </TouchableOpacity>

      <Text style={styles.footnote}>
        Your PIN must remain private. It must never be
        displayed to the group administrator.
      </Text>
    </ScrollView>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad';
  secureTextEntry?: boolean;
}

function Field(props: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {props.label}
      </Text>

      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        keyboardType={props.keyboardType ?? 'default'}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize="words"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 13,
    backgroundColor: '#f7faf7',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#166534',
  },
  body: {
    color: '#475569',
    lineHeight: 21,
  },
  field: {
    gap: 5,
  },
  label: {
    color: '#14532d',
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    padding: 12,
    color: '#111827',
  },
  button: {
    backgroundColor: '#16a34a',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
  },
  footnote: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  success: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: '#f0fdf4',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#166534',
    textAlign: 'center',
  },
});
