port React, { useState } from 'react';
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { recordExpenditure } from '../database/database';

type ExpenditureScreenProps = {
  route: {
    params?: {
      groupId?: number;
      meetingId?: number | null;
      executiveMemberId?: number | null;
    };
  };
};

export default function ExpenditureScreen({
  route,
}: ExpenditureScreenProps) {
  const groupId = route.params?.groupId ?? null;
  const meetingId = route.params?.meetingId ?? null;

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!groupId) {
      Alert.alert(
        'No Active Group',
        'Please register or select an active group before recording an expenditure.',
      );
      return;
    }

    const trimmedAmount = amount.trim();
    const trimmedReason = reason.trim();

    if (!trimmedAmount) {
      Alert.alert(
        'Missing amount',
        'Please enter the expenditure amount.',
      );
      return;
    }

    const numericAmount = Number(trimmedAmount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert(
        'Invalid amount',
        'Please enter a valid amount greater than 0.',
      );
      return;
    }

    if (!trimmedReason) {
      Alert.alert(
        'Missing reason',
        'Please enter the reason for the expenditure.',
      );
      return;
    }

    try {
      setSaving(true);

      await recordExpenditure(
        groupId,
        numericAmount,
        trimmedReason,
        meetingId,
      );

      Alert.alert(
        'Expenditure recorded',
        `UGX ${numericAmount.toLocaleString()} has been recorded successfully.`,
      );

      setAmount('');
      setReason('');
    } catch (error) {
      console.error('Failed to record expenditure:', error);

      Alert.alert(
        'Error',
        'The expenditure could not be recorded. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Expenditure</Text>

        <Text style={styles.groupText}>
          Group: KYA {groupId ?? '—'}
        </Text>

        <Text style={styles.label}>Amount (UGX)</Text>

        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="Enter amount"
          keyboardType="numeric"
          editable={!saving}
        />

        <Text style={styles.label}>Reason</Text>

        <TextInput
          style={[styles.input, styles.reasonInput]}
          value={reason}
          onChangeText={setReason}
          placeholder="Enter reason for expenditure"
          multiline
          editable={!saving}
        />

        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {saving ? 'Saving...' : 'Record Expenditure'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  content: {
    flex: 1,
    padding: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#16a34a',
    marginBottom: 8,
  },

  groupText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 25,
  },

  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 18,
    color: '#111827',
    backgroundColor: '#ffffff',
  },

  reasonInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },

  button: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 5,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
