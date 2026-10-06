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
  getMemberFines,
  getMemberLoanBalance,
  getMembersByGroupId,
  getOpenMeeting,
  getVSLASetupRules,
  recordFine,
  recordFinePayment,
  recordInsuranceContribution,
  recordLoanRepayment,
  recordSavings,
  recordSocialFund,
  type MemberFineRecord,
  type VSLASetupRuleRecord,
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

function parseAmount(value: string): number {
  return Number(value.replace(/,/g, '').trim());
}

function formatMoney(value: number): string {
  return Number(value || 0).toLocaleString();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
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
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [setupRules, setSetupRules] = useState<VSLASetupRuleRecord | null>(null);
  const [loanBalance, setLoanBalance] = useState(0);
  const [memberFines, setMemberFines] = useState<MemberFineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showFineTypes, setShowFineTypes] = useState(false);

  const [shares, setShares] = useState('');
  const [loanRepayment, setLoanRepayment] = useState('');
  const [socialFund, setSocialFund] = useState('');
  const [insurance, setInsurance] = useState('');
  const [finePayment, setFinePayment] = useState('');
  const [newFineAmount, setNewFineAmount] = useState('');
  const [fineType, setFineType] = useState('Absence fine');
  const [recordingFine, setRecordingFine] = useState(false);

  const fineTypes = useMemo(
    () => [
      'Absence fine',
      'Late fine',
      'Non-saving fine',
      'Non-loan repayment fine',
      'Non-insurance contribution fine',
    ],
    [],
  );

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const shareValue = Number(setupRules?.share_value ?? 0);
  const minimumShares = Number(setupRules?.minimum_shares_per_meeting ?? 0);
  const maximumShares = Number(setupRules?.maximum_shares_per_meeting ?? 0);
  const shareCount = Math.max(0, parseAmount(shares) || 0);
  const savingsAmount = shareCount * shareValue;
  const outstandingFineTotal = memberFines.reduce(
    (total, fine) => total + fine.outstanding_amount,
    0,
  );

  const loanAmount = Math.max(0, parseAmount(loanRepayment) || 0);
  const socialAmount = Math.max(0, parseAmount(socialFund) || 0);
  const insuranceAmount = Math.max(0, parseAmount(insurance) || 0);
  const finePaymentAmount = Math.max(0, parseAmount(finePayment) || 0);
  const totalPayment =
    savingsAmount + loanAmount + socialAmount + insuranceAmount + finePaymentAmount;

  const loadMemberFinancialData = useCallback(
    async (memberId: number) => {
      const [loan, fines] = await Promise.all([
        getMemberLoanBalance(groupId, memberId),
        getMemberFines(groupId, memberId),
      ]);

      setLoanBalance(Number(loan.balance) || 0);
      setMemberFines(fines);
    },
    [groupId],
  );

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

      if (activeMeetingId === null) {
        throw new Error('No open meeting is available. Start the meeting first.');
      }

      const [memberRows, rules] = await Promise.all([
        getMembersByGroupId(groupId),
        getVSLASetupRules(groupId),
      ]);

      const activeMembers = (memberRows as MemberItem[])
        .filter((member) => member.status?.toLowerCase() === 'active')
        .sort((a, b) =>
          a.full_name.localeCompare(b.full_name, undefined, {
            sensitivity: 'base',
          }),
        );

      setMeetingId(activeMeetingId);
      setMembers(activeMembers);
      setSetupRules(rules);

      const currentId =
        selectedMemberId !== null &&
        activeMembers.some((member) => member.id === selectedMemberId)
          ? selectedMemberId
          : activeMembers[0]?.id ?? null;

      setSelectedMemberId(currentId);

      if (currentId !== null) {
        await loadMemberFinancialData(currentId);
      } else {
        setLoanBalance(0);
        setMemberFines([]);
      }
    } catch (error) {
      Alert.alert(
        'Financial Transactions',
        error instanceof Error ? error.message : 'Unable to load financial transactions.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, loadMemberFinancialData, selectedMemberId, suppliedMeetingId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectMember = async (memberId: number) => {
    setSelectedMemberId(memberId);
    setShowMembers(false);
    setShares('');
    setLoanRepayment('');
    setSocialFund('');
    setInsurance('');
    setFinePayment('');
    setNewFineAmount('');

    if (meetingId) {
      try {
        await loadMemberFinancialData(memberId);
      } catch (error) {
        Alert.alert(
          'Member details',
          error instanceof Error ? error.message : 'Unable to load member financial details.',
        );
      }
    }
  };

  const validateShares = (): boolean => {
    if (shareCount < minimumShares) {
      Alert.alert(
        'Savings below minimum',
        `This meeting requires at least ${formatMoney(minimumShares)} share(s).`,
      );
      return false;
    }

    if (maximumShares > 0 && shareCount > maximumShares) {
      Alert.alert(
        'Savings above maximum',
        `This meeting allows a maximum of ${formatMoney(maximumShares)} share(s).`,
      );
      return false;
    }

    if (shareValue <= 0) {
      Alert.alert('Share value missing', 'The group share value has not been configured.');
      return false;
    }

    return true;
  };

  const submitFinancialTransaction = async () => {
    if (!meetingId) {
      Alert.alert('Meeting not started', 'Start the meeting before recording payments.');
      return;
    }

    if (!selectedMemberId) {
      Alert.alert('Member required', 'Select the member making this payment.');
      return;
    }

    if (!validateShares()) return;

    if (loanAmount > loanBalance) {
      Alert.alert(
        'Loan repayment too high',
        `The member's outstanding loan balance is ${currency} ${formatMoney(loanBalance)}.`,
      );
      return;
    }

    if (finePaymentAmount > outstandingFineTotal) {
      Alert.alert(
        'Fine payment too high',
        `The member's outstanding fines total is ${currency} ${formatMoney(outstandingFineTotal)}.`,
      );
      return;
    }

    if (totalPayment <= 0) {
      Alert.alert('Payment required', 'Enter at least one financial payment for this member.');
      return;
    }

    setSaving(true);
    try {
      if (savingsAmount > 0) {
        await recordSavings(groupId, selectedMemberId, savingsAmount, meetingId);
      }

      if (loanAmount > 0) {
        await recordLoanRepayment(
          groupId,
          selectedMemberId,
          loanAmount,
          meetingId,
          'Loan repayment',
        );
      }

      if (socialAmount > 0) {
        await recordSocialFund(
          groupId,
          socialAmount,
          meetingId,
          selectedMemberId,
          'Social fund contribution',
        );
      }

      if (insuranceAmount > 0) {
        await recordInsuranceContribution(
          groupId,
          selectedMemberId,
          insuranceAmount,
          meetingId,
        );
      }

      if (finePaymentAmount > 0) {
        await recordFinePayment(
          groupId,
          selectedMemberId,
          finePaymentAmount,
          meetingId,
        );
      }

      Alert.alert(
        'Transaction recorded',
        `${selectedMember?.full_name ?? 'Member'} paid ${currency} ${formatMoney(totalPayment)}.`,
      );

      setShares('');
      setLoanRepayment('');
      setSocialFund('');
      setInsurance('');
      setFinePayment('');
      await loadMemberFinancialData(selectedMemberId);
    } catch (error) {
      Alert.alert(
        'Transaction failed',
        error instanceof Error ? error.message : 'Unable to record the financial transaction.',
      );
    } finally {
      setSaving(false);
    }
  };

  const recordNewFine = async () => {
    if (!meetingId || !selectedMemberId) {
      Alert.alert('Member required', 'Select a member before recording a fine.');
      return;
    }

    const amount = parseAmount(newFineAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid fine', 'Enter a fine amount greater than zero.');
      return;
    }

    setRecordingFine(true);
    try {
      await recordFine(
        groupId,
        amount,
        fineType,
        selectedMemberId,
        meetingId,
      );

      setNewFineAmount('');
      await loadMemberFinancialData(selectedMemberId);

      Alert.alert(
        'Fine recorded',
        `${fineType} of ${currency} ${formatMoney(amount)} was recorded as an outstanding fine.`,
      );
    } catch (error) {
      Alert.alert(
        'Fine failed',
        error instanceof Error ? error.message : 'Unable to record the fine.',
      );
    } finally {
      setRecordingFine(false);
    }
  };

  const goToNextMember = () => {
    if (!selectedMemberId || members.length === 0) return;

    const currentIndex = members.findIndex(
      (member) => member.id === selectedMemberId,
    );

    if (currentIndex < 0 || currentIndex >= members.length - 1) {
      Alert.alert('End of member list', 'This is the last member in A–Z order.');
      return;
    }

    void selectMember(members[currentIndex + 1].id);
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
          <Text style={styles.loadingText}>Loading financial transactions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!meetingId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>Financial Transactions</Text>
          <Text style={styles.emptyText}>Start a meeting before recording payments.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasNextMember =
    selectedMemberId !== null &&
    members.findIndex((member) => member.id === selectedMemberId) < members.length - 1;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Financial Transactions</Text>
          <Text style={styles.headerSubtitle}>Meeting #{meetingId}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Member</Text>
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
                  onPress={() => void selectMember(member.id)}
                >
                  <Text style={styles.optionText}>
                    {member.member_number} — {member.full_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* 1. SAVINGS */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. SAVINGS</Text>
          <Text style={styles.helperText}>
            Rules: {formatMoney(minimumShares)}–{formatMoney(maximumShares)} shares per meeting
          </Text>

          <Text style={styles.label}>Shares purchased</Text>
          <TextInput
            value={shares}
            onChangeText={setShares}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="#9ca3af"
            style={styles.amountInput}
          />

          <View style={styles.readOnlyRow}>
            <Text style={styles.readOnlyLabel}>Share value</Text>
            <Text style={styles.readOnlyValue}>
              {currency} {formatMoney(shareValue)}
            </Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Savings amount</Text>
            <Text style={styles.totalValue}>
              {currency} {formatMoney(savingsAmount)}
            </Text>
          </View>
        </View>

        {/* 2. LOAN REPAYMENT */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>2. LOAN REPAYMENT</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Outstanding loan</Text>
            <Text style={styles.balanceValue}>
              {currency} {formatMoney(loanBalance)}
            </Text>
          </View>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            value={loanRepayment}
            onChangeText={setLoanRepayment}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#9ca3af"
            style={styles.amountInput}
          />
        </View>

        {/* 3. SOCIAL FUND */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>3. SOCIAL FUND</Text>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            value={socialFund}
            onChangeText={setSocialFund}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#9ca3af"
            style={styles.amountInput}
          />
        </View>

        {/* 4. INSURANCE */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>4. INSURANCE</Text>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            value={insurance}
            onChangeText={setInsurance}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#9ca3af"
            style={styles.amountInput}
          />
        </View>

        {/* 5. FINES — LAST */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>5. FINES</Text>
          <Text style={styles.helperText}>
            Existing fines from previous and current meetings are shown below.
          </Text>

          {memberFines.length === 0 ? (
            <View style={styles.noFineBox}>
              <Text style={styles.noFineText}>No recorded fines for this member.</Text>
            </View>
          ) : (
            memberFines.map((fine) => (
              <View key={fine.id} style={styles.fineRow}>
                <View style={styles.fineDetails}>
                  <Text style={styles.fineType}>{fine.fine_type}</Text>
                  <Text style={styles.fineDate}>Recorded {formatDate(fine.created_at)}</Text>
                </View>
                <View style={styles.fineAmounts}>
                  <Text style={styles.fineAmount}>
                    {currency} {formatMoney(fine.original_amount)}
                  </Text>
                  <Text style={styles.paidText}>
                    Paid: {currency} {formatMoney(fine.amount_paid)}
                  </Text>
                  <Text
                    style={
                      fine.outstanding_amount > 0
                        ? styles.outstandingText
                        : styles.paidCompleteText
                    }
                  >
                    {fine.outstanding_amount > 0
                      ? `Outstanding: ${currency} ${formatMoney(fine.outstanding_amount)}`
                      : 'Paid in full'}
                  </Text>
                </View>
              </View>
            ))
          )}

          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Total outstanding fines</Text>
            <Text style={styles.balanceValue}>
              {currency} {formatMoney(outstandingFineTotal)}
            </Text>
          </View>

          <Text style={styles.label}>Fine payment</Text>
          <TextInput
            value={finePayment}
            onChangeText={setFinePayment}
            keyboardType="decimal-pad"
            placeholder={outstandingFineTotal > 0 ? '0' : 'No outstanding fine'}
            placeholderTextColor="#9ca3af"
            style={styles.amountInput}
            editable={outstandingFineTotal > 0}
          />

          <Text style={styles.label}>Record a new fine</Text>
          <TouchableOpacity
            style={styles.selector}
            onPress={() => setShowFineTypes((value) => !value)}
          >
            <Text style={styles.selectorText}>{fineType}</Text>
            <Text style={styles.arrow}>{showFineTypes ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {showFineTypes && (
            <View style={styles.optionsBox}>
              {fineTypes.map((item) => (
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

          <TextInput
            value={newFineAmount}
            onChangeText={setNewFineAmount}
            keyboardType="decimal-pad"
            placeholder="New fine amount"
            placeholderTextColor="#9ca3af"
            style={styles.amountInput}
          />

          <TouchableOpacity
            style={[styles.secondaryButton, recordingFine && styles.submitButtonDisabled]}
            onPress={() => void recordNewFine()}
            disabled={recordingFine}
          >
            {recordingFine ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.secondaryButtonText}>Record New Fine</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* TOTAL PAYMENT */}
        <View style={styles.totalCard}>
          <Text style={styles.totalPaymentLabel}>TOTAL PAYMENT</Text>
          <Text style={styles.totalPaymentValue}>
            {currency} {formatMoney(totalPayment)}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, saving && styles.submitButtonDisabled]}
          onPress={() => void submitFinancialTransaction()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitText}>RECORD FINANCIAL TRANSACTION</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.nextButton, !hasNextMember && styles.disabledNextButton]}
          onPress={goToNextMember}
          disabled={!hasNextMember || saving}
        >
          <Text style={styles.nextButtonText}>NEXT MEMBER — A–Z</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f7f6' },
  container: { padding: 16, paddingBottom: 40 },
  header: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },
  headerTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800' },
  headerSubtitle: { color: '#ffffff', marginTop: 4, opacity: 0.9 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
  },
  sectionTitle: { color: '#166534', fontSize: 18, fontWeight: '900', marginBottom: 10 },
  helperText: { color: '#6b7280', fontSize: 12, marginBottom: 6 },
  label: { color: '#374151', fontSize: 14, fontWeight: '700', marginTop: 10, marginBottom: 7 },
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
  selectorText: { color: '#111827', flex: 1 },
  placeholderText: { color: '#9ca3af', flex: 1 },
  arrow: { color: '#6b7280', marginLeft: 8 },
  optionsBox: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, marginTop: 5, overflow: 'hidden' },
  option: { padding: 13, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  optionText: { color: '#111827' },
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
  readOnlyRow: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  readOnlyLabel: { color: '#4b5563', fontWeight: '700' },
  readOnlyValue: { color: '#111827', fontWeight: '800' },
  totalRow: {
    marginTop: 10,
    padding: 13,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: { color: '#166534', fontWeight: '800' },
  totalValue: { color: '#166534', fontSize: 18, fontWeight: '900' },
  balanceRow: { marginTop: 12, padding: 12, backgroundColor: '#f0fdf4', borderRadius: 10 },
  balanceLabel: { color: '#166534', fontSize: 12 },
  balanceValue: { color: '#166534', fontSize: 17, fontWeight: '800', marginTop: 3 },
  fineRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    flexDirection: 'row',
  },
  fineDetails: { flex: 1, paddingRight: 8 },
  fineType: { color: '#111827', fontWeight: '800' },
  fineDate: { color: '#6b7280', fontSize: 11, marginTop: 4 },
  fineAmounts: { alignItems: 'flex-end' },
  fineAmount: { color: '#111827', fontWeight: '800' },
  paidText: { color: '#6b7280', fontSize: 11, marginTop: 3 },
  outstandingText: { color: '#b91c1c', fontSize: 12, fontWeight: '800', marginTop: 3 },
  paidCompleteText: { color: '#15803d', fontSize: 12, fontWeight: '800', marginTop: 3 },
  noFineBox: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, marginTop: 4 },
  noFineText: { color: '#6b7280', textAlign: 'center' },
  secondaryButton: {
    backgroundColor: '#6b7280',
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryButtonText: { color: '#ffffff', fontWeight: '800' },
  totalCard: {
    backgroundColor: '#166534',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    alignItems: 'center',
  },
  totalPaymentLabel: { color: '#dcfce7', fontSize: 13, fontWeight: '900' },
  totalPaymentValue: { color: '#ffffff', fontSize: 27, fontWeight: '900', marginTop: 4 },
  submitButton: {
    backgroundColor: '#16a34a',
    minHeight: 56,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  submitButtonDisabled: { opacity: 0.65 },
  submitText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  nextButton: {
    backgroundColor: '#111827',
    minHeight: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledNextButton: { backgroundColor: '#9ca3af' },
  nextButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 10, color: '#6b7280' },
  title: { color: '#111827', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  emptyText: { color: '#6b7280', textAlign: 'center' },
  errorText: { color: '#b91c1c', fontWeight: '700' },
});
