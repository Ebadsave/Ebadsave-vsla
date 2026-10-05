import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';

import {
  getFinancialAccounts,
  getOpenMeeting,
  recordExpenditure,
} from '../database/database';

interface RouteParams {
  groupId?: number;
  meetingId?: number | null;
  currency?: string;
}

interface FinancialAccount {
  account_type: string;
  balance: number;
}

function formatMoney(value: number): string {
  return Number(value || 0).toLocaleString();
}

export default function MiscellaneousExpenseScreen() {
  const route = useRoute();
  const params = (route.params || {}) as RouteParams;

  const groupId = Number(params.groupId ?? 0);

  const suppliedMeetingId =
    params.meetingId === undefined || params.meetingId === null
      ? null
      : Number(params.meetingId);

  // UGX is only the default currency.
  const currency = params.currency?.trim() || 'UGX';

  const [meetingId, setMeetingId] = useState<number | null>(
    suppliedMeetingId,
  );

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const [expenditureBalance, setExpenditureBalance] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      let activeMeetingId = suppliedMeetingId;

      if (activeMeetingId === null) {
        const openMeeting = await getOpenMeeting(groupId);
        activeMeetingId = openMeeting?.id ?? null;
      }

      setMeetingId(activeMeetingId);

      const accounts = await getFinancialAccounts(groupId);

      const expenditureAccount = (
        accounts as FinancialAccount[]
      ).find(
        (account) =>
          account.account_type === 'expenditure_fund',
      );

      setExpenditureBalance(
        Number(expenditureAccount?.balance ?? 0),
      );
    } catch (error) {
      Alert.alert(
        'Miscellaneous Expense',
        error instanceof Error
          ? error.message
          : 'Unable to load expenditure information.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, suppliedMeetingId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const submitExpense = async () => {
    const numericAmount = Number(
      amount.replace(/,/g, '').trim(),
    );

    if (!meetingId) {
      Alert.alert(
        'Meeting not started',
        'Start the meeting before recording an expense.',
      );
      return;
    }

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      Alert.alert(
        'Invalid amount',
        'Enter an expense amount greater than zero.',
      );
      return;
    }

    if (!reason.trim()) {
      Alert.alert(
        'Reason required',
        'Enter the reason for this miscellaneous expense.',
      );
      return;
    }

    setSaving(true);

    try {
      await recordExpenditure(
        groupId,
        numericAmount,
        reason.trim(),
        meetingId,
      );

      setAmount('');
      setReason('');

      await loadData();

      Alert.alert(
        'Expense recorded',
        `${currency} ${formatMoney(
          numericAmount,
        )} miscellaneous expense recorded successfully.`,
      );
    } catch (error) {
      Alert.alert(
        'Expense failed',
        error instanceof Error
          ? error.message
          : 'Unable to record the expense.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!groupId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            Group information is missing.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator
            size="large"
            color="#16a34a"
          />

          <Text style={styles.loadingText}>
            Loading expenses...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!meetingId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>
            Miscellaneous Expense
          </Text>

          <Text style={styles.emptyText}>
            Start a meeting before recording expenses.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            Miscellaneous Expense
          </Text>

          <Text style={styles.headerSubtitle}>
            Meeting #{meetingId}
          </Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>
            Expenditure Fund Balance
          </Text>

          <Text style={styles.balanceValue}>
            {currency}{' '}
            {formatMoney(expenditureBalance)}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>
          Expense Amount
        </Text>

        <View style={styles.amountContainer}>
          <Text style={styles.currencyLabel}>
            {currency}
          </Text>

          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.sectionTitle}>
          Reason for Expense
        </Text>

        <TextInput
          style={styles.reasonInput}
          value={reason}
          onChangeText={setReason}
          placeholder="Enter reason for this expense"
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[
            styles.saveButton,
            saving && styles.saveButtonDisabled,
          ]}
          onPress={submitExpense}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>
              Record Expense
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  container: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },

  headerTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },

  headerSubtitle: {
    marginTop: 5,
    color: '#ffffff',
    fontSize: 14,
  },

  balanceCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 14,
    padding: 18,
    marginBottom: 22,
  },

  balanceLabel: {
    fontSize: 14,
    color: '#166534',
    fontWeight: '600',
  },

  balanceValue: {
    marginTop: 6,
    fontSize: 23,
    fontWeight: '700',
    color: '#15803d',
  },

  sectionTitle: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  amountContainer: {
    height: 58,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },

  currencyLabel: {
    paddingLeft: 15,
    paddingRight: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#16a34a',
  },

  amountInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 8,
    fontSize: 18,
    color: '#111827',
  },

  reasonInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },

  saveButton: {
    height: 56,
    marginTop: 25,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#16a34a',
    textAlign: 'center',
  },

  loadingText: {
    marginTop: 10,
    color: '#374151',
  },

  emptyText: {
    marginTop: 10,
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
  },

  errorText: {
    fontSize: 16,
    color: '#dc2626',
    textAlign: 'center',
  },
});
