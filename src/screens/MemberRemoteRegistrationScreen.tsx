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
    const normalizedGroup = groupNumber.trim().toUpperCase().replace(/^KYA\s*/, '');

    if (!/^\d{4}$/.test(normalizedGroup)) {
      return Alert.alert(
        'Check group number',
        'Enter the four digits after KYA, for example 2000.',
      );
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
      return Alert.alert(
        'Incomplete details',
        'Enter your full name, gender, age (18–120), cell and district.',
      );
    }

    if (!/^\d{6,12}$/.test(pin)) {
      return Alert.alert('Invalid PIN', 'PIN must contain 6 to 12 digits.');
    }

    if (pin !== confirmPin) {
      return Alert.alert('PIN mismatch', 'The two PIN entries do not
