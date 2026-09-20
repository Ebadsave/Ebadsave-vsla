import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getFinancialSummary,
  recordSavings,
} from '../database/database';

type Props = {
  route?: {
    params?: {
      groupId?: number;
      memberId?: number;
      meetingId?: number | null;
    };
  };
};

export default function SavingsScreen({ route }: Props) {
  const groupId = route?.params?.groupId;
  const memberId = route?.params?.memberId;
  const meetingId = route?.params?.meetingId ?? null;

  const [totalSavings, setTotalSavings] = useState(0);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSavings = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    try {
      const summary = await getFinancialSummary(groupId);
      setTotalSavings(summary.savings ?? 0);
    } catch (error) {
      console.error('Failed to load savings:', error);
      Alert.alert('Error', 'Failed to load savings.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadSavings();
  }, [loadSavings]);

  const handleRecordSavings = async () => {
    if (!groupId) {
      Alert.alert('Error', 'Group ID is missing.');
      return;
    }

    if (!memberId) {
      Alert.alert('Error', 'Member ID is missing.');
      return;
    }

    const savingsAmount = Number(amount);

    if (!Number.isFinite(savingsAmount) || savingsAmount <= 0) {
      Alert.alert(
        'Invalid amount',
        'Enter a savings amount greater than zero.',
      );
      return;
    }

    try {
      setSaving(true);

      await recordSavings(
        groupId,
        memberId,
        savingsAmount,
        meetingId,
      );

      setAmount('');

      await loadSavings();

      Alert.alert(
        'Savings Recorded',
        `UGX ${savingsAmount.toLocaleString()} has been recorded successfully.`,
      );
    } catch (error) {
      console.error('Failed to record savings:', error);

      Alert.alert(
        'Transaction Failed',
        error instanceof Error
          ? error.message
          : 'Failed to record savings.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Savings</Text>

        <Text style={styles.amount}>
          UGX {totalSavings.toLocaleString()}
        </Text>

        <Text style={styles.subtitle}>
          Total group savings
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Savings Amount</Text>

          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="Enter amount"
            keyboardType="numeric"
            editable={!saving}
          />

          <TouchableOpacity
            style={[
              styles.button,
              saving && styles.buttonDisabled,
            ]}
            onPress={handleRecordSavings}
            disabled={saving || loading}
          >
            <Text style={styles.buttonText}>
              {saving ? 'Recording...' : 'Record Savings'}
            </Text>
          </TouchableOpacity>
        </View>
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
    textAlign: 'center',
    marginTop: 20,
  },
  amount: {
    marginTop: 20,
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
  },
  card: {
    marginTop: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#111827',
  },
  button: {
    marginTop: 16,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
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
