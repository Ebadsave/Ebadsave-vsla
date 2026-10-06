import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  getMembersByGroupId,
  getOpenMeeting,
  recordFine,
  recordInsuranceContribution,
  recordLoanRepayment,
  recordSavings,
  recordSocialFund,
} from '../database/database';

interface RouteParams {
  groupId?: number;
  meetingId?: number | null;
  currency?: string;
}

interface MemberItem {
  id: number;
  member_number: string;
  full_name: string;
  status: string;
}

interface AccountItem {
  account_type: string;
  balance: number;
}

type PaymentType =
  | 'savings'
  | 'loan_repayment'
  | 'insurance'
  | 'fines'
  | 'social_fund';

const PAYMENT_TYPES: Array<{ key: PaymentType; label: string }> = [
  { key: 'savings', label: 'Savings' },
  { key: 'loan_repayment', label: 'Loan repayment' },
  { key: 'insurance', label: 'Insurance contribution' },
  { key: 'fines', label: 'Fines' },
  { key: 'social_fund', label: 'Social fund' },
];

const FINE_TYPES = [
  'Absence fine',
  'Late fine',
  'Non-saving fine',
  'Non-loan repayment fine',
  'Non-insurance contribution fine',
];

function formatMoney(value: number): string {
  return Number(value || 0).toLocaleString();
}

export default function FinancialTransactionsScreen() {
  const route = useRoute();
  const params = (route.params ?? {}) as RouteParams;

  const groupId = Number(params.groupId ?? 0);
  const suppliedMeetingId =
    params.meetingId === undefined || params.meetingId === null
      ? null
      : Number(params.meetingId);
  const currency = params.currency?.trim() || 'UGX';

  const [meetingId, setMeetingId] = useState<number | null>(suppliedMeetingId);
  const [paymentType, setPaymentType] = useState<PaymentType>('savings');
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [fineType, setFineType] = useState(FINE_TYPES[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showFineTypes, setShowFineTypes] = useState(false);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);

  const loadData = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let activeMeetingId = suppliedMeetingId;

      if (activeMeetingId === null) {
        const openMeeting = await getOpenMeeting(groupId);
        activeMeetingId = openMeeting?.id ?? null;
      }

      setMeetingId(activeMeetingId);

      if (activeMeetingId === null) {
        throw new Error('No open meeting is available. Start the meeting first.');
      }

      const [memberRows, accountRows] = await Promise.all([
        getMembersByGroupId(groupId),
        getFinancialAccounts(groupId),
      ]);

      const activeMembers = (memberRows as MemberItem[]).filter(
        (member) => member.status?.toLowerCase() === 'active',
      );

      setMembers(activeMembers);
      setAccounts(accountRows as AccountItem[]);

      if (
        selectedMemberId === null ||
        !activeMembers.some((member) => member.id === selectedMemberId)
      ) {
        setSelectedMemberId(activeMembers[0]?.id ?? null);
      }
    } catch (error) {
      Alert.alert(
        'Payments',
        error instanceof Error ? error.message : 'Unable to load payments.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, selectedMemberId, suppliedMeetingId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const selectedAccountType =
    paymentType === 'savings'
      ? 'savings'
      : paymentType === 'loan_repayment'
        ? 'loan_repayment'
        : paymentType === 'insurance'
          ? 'insurance_fund'
          : paymentType === 'fines'
            ? 'fines'
            : 'social_fund';

  const selectedAccount = accounts.find(
    (account) => account.account_type === selectedAccountType,
  );

  const submitPayment = async () => {
    const numericAmount = Number(amount.replace(/,/g, '').trim());

    if (!meetingId) {
      Alert.alert('Meeting not started', 'Start the meeting before recording payments.');
      return;
    }

    if (!selectedMemberId) {
      Alert.alert('Member required', 'Select the member making this payment.');
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.');
      return;
    }

    if (paymentType === 'loan_repayment' && selectedAccount && numericAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid loan repayment amount.');
      return;
    }

    setSaving(true);
    try {
      if (paymentType === 'savings') {
        await recordSavings(groupId, selectedMemberId, numericAmount, meetingId);
      } else if (paymentType === 'loan_repayment') {
        await recordLoanRepayment(
          groupId,
          selectedMemberId,
          numericAmount,
          meetingId,
          'Loan repayment',
        );
      } else if (paymentType === 'insurance') {
        await recordInsuranceContribution(
          groupId,
          selectedMemberId,
          numericAmount,
          meetingId,
        );
      } else if (paymentType === 'fines') {
        await recordFine(
          groupId,
          numericAmount,
          fineType,
          selectedMemberId,
          meetingId,
        );
      } else {
        await recordSocialFund(
          groupId,
          numericAmount,
          meetingId,
          selectedMemberId,
          'Social fund contribution',
        );
      }

      setAmount('');
      await loadData();
      Alert.alert('Payment recorded', `${PAYMENT_TYPES.find((item) => item.key === paymentType)?.label} recorded successfully.`);
    } catch (error) {
      Alert.alert(
        'Payment failed',
        error instanceof Error ? error.message : 'Unable to record the payment.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!groupId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Group information is missing.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16a34a" />
          <Text style={styles.loadingText}>Loading payments...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!meetingId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>Payments</Text>
          <Text style={styles.emptyText}>Start a meeting before recording payments.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Payments</Text>
          <Text style={styles.headerSubtitle}>Meeting #{meetingId}</Text>
        </View>

        <View style={styles.typeGrid}>
          {PAYMENT_TYPES.map((item) => {
            const selected = paymentType === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.typeButton, selected && styles.typeButtonSelected]}
                onPress={() => {
                  setPaymentType(item.key);
                  setAmount('');
                }}
              >
                <Text style={[styles.typeButtonText, selected && styles.typeButtonTextSelected]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Member</Text>
          <TouchableOpacity
            style={styles.selector}
            onPress={() => setShowMembers((value) => !value)}
          >
            <Text style={selectedMember ? styles.selectorText : styles.placeholderText}>
              {selectedMember
                ? `${selectedMember.member_number} — ${selectedMember.full_name}`
                : 'Select member'}
            </Text>
            <Text style={styles.arrow}>{showMembers ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {showMembers && (
            <View style={styles.optionsBox}>
              {members.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={styles.option}
                  onPress={() => {
                    setSelectedMemberId(member.id);
                    setShowMembers(false);
                  }}
                >
                  <Text style={styles.optionText}>
                    {member.member_number} — {member.full_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {paymentType === 'fines' && (
            <>
              <Text style={styles.label}>Fine type</Text>
              <TouchableOpacity
                style={styles.selector}
                onPress={() => setShowFineTypes((value) => !value)}
              >
                <Text style={styles.selectorText}>{fineType}</Text>
                <Text style={styles.arrow}>{showFineTypes ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {showFineTypes && (
                <View style={styles.optionsBox}>
                  {FINE_TYPES.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={styles.option}
                      onPress={() => {
                        setFineType(item);
                        setShowFineTypes(false);
                      }}
                    >
                      <Text style={styles.optionText}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          <Text style={styles.label}>Amount ({currency})</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#9ca3af"
            style={styles.amountInput}
          />

          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Current {PAYMENT_TYPES.find((item) => item.key === paymentType)?.label} balance</Text>
            <Text style={styles.balanceValue}>
              {currency} {formatMoney(selectedAccount?.balance ?? 0)}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
            onPress={submitPayment}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitText}>Record payment</Text>
            )}
          </TouchableOpacity>
        </View>

        {members.length === 0 && (
          <Text style={styles.warningText}>No active members are available for this meeting.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7f6',
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#ffffff',
    marginTop: 4,
    opacity: 0.9,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  typeButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  typeButtonSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  typeButtonText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 13,
  },
  typeButtonTextSelected: {
    color: '#ffffff',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    elevation: 2,
  },
  label: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 7,
  },
  selector: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorText: {
    color: '#111827',
    flex: 1,
  },
  placeholderText: {
    color: '#9ca3af',
    flex: 1,
  },
  arrow: {
    color: '#6b7280',
    marginLeft: 8,
  },
  optionsBox: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    marginTop: 5,
    overflow: 'hidden',
  },
  option: {
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  optionText: {
    color: '#111827',
  },
  amountInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  balanceRow: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
  },
  balanceLabel: {
    color: '#166534',
    fontSize: 12,
  },
  balanceValue: {
    color: '#166534',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 3,
  },
  submitButton: {
    backgroundColor: '#16a34a',
    minHeight: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 10,
    color: '#6b7280',
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    color: '#6b7280',
    textAlign: 'center',
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '700',
  },
  warningText: {
    color: '#b45309',
    textAlign: 'center',
    marginTop: 14,
  },
});
