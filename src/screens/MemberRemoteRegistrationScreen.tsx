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
        Your registration remains pending until
