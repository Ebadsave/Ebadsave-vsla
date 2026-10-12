import React, { useEffect, useMemo, useState } from 'react';
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import {
  getFinancialSummary,
  getMemberLoanBalance,
  getMemberSavings,
  getMembersByGroupId,
  getVSLASetupRules,
  issueLoan,
  type MemberRecord,
  type VSLASetupRuleRecord,
} from '../database/database';

type Props = NativeStackScreenProps<RootStackParamList, 'LoanDisbursement'>;

function parseAmount(value: string): number {
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(currency: string, amount: number): string {
  return `${currency} ${Math.round(Number(amount) || 0).toLocaleString()}`;
}

export default function LoanDisbursementScreen({ route, navigation }: Props) {
  const { groupId, meetingId } = route.params;
  const currency = route.params.currency?.trim() || 'UGX';

  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [rules, setRules] = useState<VSLASetupRuleRecord | null>(null);
  const [loanFund, setLoanFund] = useState(0);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [memberSavings, setMemberSavings] = useState(0);
  const [memberLoanBalance, setMemberLoanBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Loan issued to member');
  const [search, setSearch] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [memberLoading, setMemberLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const loanMultiple = Math.max(0, Number(rules?.maximum_loan_multiple ?? 3));
  const maximumLoanBySavings = memberSavings * loanMultiple;
  const remainingMemberLimit = Math.max(0, maximumLoanBySavings - memberLoanBalance);
  const requestedAmount = parseAmount(amount);

  async function loadData() {
    try {
      setInitialLoading(true);
      const [summary, setup, groupMembers] = await Promise.all([
        getFinancialSummary(groupId),
        getVSLASetupRules(groupId),
        getMembersByGroupId(groupId),
      ]);
      setLoanFund(Number(summary.loanFund) || 0);
      setRules(setup);
      setMembers(
        groupMembers.filter((member) => member.status?.toLowerCase() === 'active'),
      );
    } catch (error) {
      console.error('Failed to load loan disbursement data:', error);
      Alert.alert(
        'Unable to Load Loan Data',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setInitialLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // The group and meeting are fixed for this screen instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, meetingId]);

  async function handleSelectMember(memberId: number) {
    if (saving || memberLoading) return;
    setSelectedMemberId(memberId);
    setMemberSavings(0);
    setMemberLoanBalance(0);
    setAmount('');
    try {
      setMemberLoading(true);
      const [savings, loan] = await Promise.all([
        getMemberSavings(groupId, memberId),
        getMemberLoanBalance(groupId, memberId),
      ]);
      setMemberSavings(Math.max(0, Number(savings) || 0));
      setMemberLoanBalance(Math.max(0, Number(loan.balance) || 0));
    } catch (error) {
      console.error('Failed to load member loan details:', error);
      Alert.alert(
        'Unable to Load Member',
        error instanceof Error ? error.message : 'Could not load this member’s savings and loan balance.',
      );
      setSelectedMemberId(null);
    } finally {
      setMemberLoading(false);
    }
  }

  async function saveDisbursement() {
    if (!selectedMember || !selectedMemberId) {
      Alert.alert('Select Member', 'Select the member receiving the loan.');
      return;
    }
    if (memberSavings <= 0) {
      Alert.alert('No Eligible Savings', 'This member has no recorded savings to calculate a loan limit.');
      return;
    }
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a loan amount greater than zero.');
      return;
    }
    if (requestedAmount > remainingMemberLimit) {
      Alert.alert(
        'Loan Limit Exceeded',
        `Based on the ${loanMultiple}× savings rule and this member’s existing loan balance, the maximum additional loan is ${money(currency, remainingMemberLimit)}.`,
      );
      return;
    }
    if (requestedAmount > loanFund) {
      Alert.alert('Insufficient Loan Fund', `Available Loan Fund: ${money(currency, loanFund)}.`);
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Reason Required', 'Enter the reason for this loan.');
      return;
    }

    const interestText = `${Number(rules?.loan_interest_percentage ?? 0)}% ${rules?.loan_interest_period || 'per month'}`;
    Alert.alert(
      'Confirm Loan Disbursement',
      `Member: ${selectedMember.full_name}\nMember number: ${selectedMember.member_number}\nLoan amount: ${money(currency, requestedAmount)}\nSavings: ${money(currency, memberSavings)}\nExisting outstanding balance: ${money(currency, memberLoanBalance)}\nMaximum additional loan: ${money(currency, remainingMemberLimit)}\nConfigured interest: ${interestText}\n\nThe member must be marked Present or Late in roll call for this open meeting. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm Loan', onPress: () => { void commitDisbursement(); } },
      ],
    );
  }

  async function commitDisbursement() {
    if (!selectedMember || !selectedMemberId) return;
    try {
      setSaving(true);
      await issueLoan(
        groupId,
        selectedMemberId,
        requestedAmount,
        reason.trim(),
        meetingId,
      );
      Alert.alert(
        'Loan Recorded',
        `${money(currency, requestedAmount)} was recorded for ${selectedMember.full_name}. The member’s passbook and group Loan Fund have been updated.`,
        [{ text: 'OK' }],
      );
      setAmount('');
      setReason('Loan issued to member');
      setSelectedMemberId(null);
      setMemberSavings(0);
      setMemberLoanBalance(0);
      await loadData();
    } catch (error) {
      Alert.alert(
        'Loan Disbursement Failed',
        error instanceof Error ? error.message : 'The loan could not be recorded.',
      );
    } finally {
      setSaving(false);
    }
  }

  const filteredMembers = members.filter((member) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return member.full_name.toLowerCase().includes(term) ||
      member.member_number.toLowerCase().includes(term);
  });

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.loadingText}>Loading loan fund and members…</Text>
      </SafeAreaView>
    );
  }

  if (!groupId || !meetingId) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>Loan Disbursement</Text>
        <Text style={styles.emptyText}>A group and an open meeting are required to issue a loan.</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Loan Disbursement</Text>
          <Text style={styles.subtitle}>Meeting #{meetingId} · issue a new member loan</Text>
        </View>

        <View style={styles.fundCard}>
          <Text style={styles.fundLabel}>Available Loan Fund</Text>
          <Text style={styles.fundAmount}>{money(currency, loanFund)}</Text>
          <View style={styles.divider} />
          <Text style={styles.ruleText}>Loan limit: {loanMultiple}× member savings</Text>
          <Text style={styles.ruleText}>
            Interest configured in Setup Rules: {Number(rules?.loan_interest_percentage ?? 0)}% {rules?.loan_interest_period || 'per month'}
          </Text>
          <Text style={styles.ruleText}>
            Maximum repayment period configured: {Number(rules?.maximum_loan_repayment_period ?? 0)} months
          </Text>
        </View>

        <Text style={styles.sectionTitle}>1. Select Member</Text>
        <TextInput
          style={styles.input}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by member name or number"
          placeholderTextColor="#6b7280"
          editable={!saving && !memberLoading}
          accessibilityLabel="Search members"
        />

        {filteredMembers.length === 0 ? (
          <Text style={styles.emptyText}>No active members found.</Text>
        ) : filteredMembers.map((member) => (
          <TouchableOpacity
            key={member.id}
            style={[styles.memberButton, selectedMemberId === member.id && styles.selectedMember]}
            onPress={() => { void handleSelectMember(member.id); }}
            disabled={saving || memberLoading}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedMemberId === member.id, disabled: saving || memberLoading }}
          >
            <Text style={styles.memberNumber}>{member.member_number}</Text>
            <Text style={styles.memberName}>{member.full_name}</Text>
          </TouchableOpacity>
        ))}

        {memberLoading && (
          <View style={styles.inlineLoading}>
            <ActivityIndicator color="#16a34a" />
            <Text style={styles.mutedText}>Loading member savings and loan balance…</Text>
          </View>
        )}

        {selectedMember && !memberLoading && (
          <View style={styles.memberCard}>
            <Text style={styles.memberCardTitle}>Selected Member</Text>
            <Text style={styles.memberDetail}>{selectedMember.full_name}</Text>
            <Text style={styles.memberDetail}>Member number: {selectedMember.member_number}</Text>
            <Text style={styles.memberDetail}>Total recorded savings: {money(currency, memberSavings)}</Text>
            <Text style={styles.memberDetail}>Existing outstanding loan: {money(currency, memberLoanBalance)}</Text>
            <Text style={styles.limitText}>Maximum additional loan: {money(currency, remainingMemberLimit)}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>2. Loan Details</Text>
        <Text style={styles.label}>Loan Amount ({currency})</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={(text) => setAmount(text.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="Enter amount to disburse"
          placeholderTextColor="#6b7280"
          editable={!saving && !memberLoading}
          accessibilityLabel="Loan amount"
        />
        {selectedMember && requestedAmount > 0 && (
          <View style={styles.estimateCard}>
            <Text style={styles.estimateTitle}>Review</Text>
            <Text style={styles.estimateRow}>Loan amount: {money(currency, requestedAmount)}</Text>
            <Text style={styles.estimateRow}>Available Loan Fund after issue: {money(currency, Math.max(0, loanFund - requestedAmount))}</Text>
            <Text style={styles.estimateRow}>Configured rate: {Number(rules?.loan_interest_percentage ?? 0)}% {rules?.loan_interest_period || 'per month'}</Text>
            <Text style={styles.estimateNote}>Interest timing and calculation follow the current database rules. The first-month estimate is informational.</Text>
          </View>
        )}

        <Text style={styles.label}>Reason for Loan</Text>
        <TextInput
          style={[styles.input, styles.reasonInput]}
          value={reason}
          onChangeText={setReason}
          placeholder="Why is the loan being issued?"
          placeholderTextColor="#6b7280"
          editable={!saving}
          multiline
          maxLength={240}
          accessibilityLabel="Reason for loan"
        />

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Before issuing</Text>
          <Text style={styles.noticeText}>The database requires an open meeting and the member must be marked Present or Late in roll call. The loan is rejected if the Loan Fund is insufficient.</Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, (saving || memberLoading || !selectedMember) && styles.disabledButton]}
          onPress={() => { void saveDisbursement(); }}
          disabled={saving || memberLoading || !selectedMember}
          accessibilityRole="button"
        >
          {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Confirm and Disburse Loan</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()} disabled={saving}>
          <Text style={styles.secondaryButtonText}>Back to Financial Transactions</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 36 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#ffffff' },
  header: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#166534' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 5 },
  loadingText: { marginTop: 12, color: '#475569', fontSize: 15 },
  fundCard: { backgroundColor: '#f0fdf4', borderRadius: 14, padding: 17, borderWidth: 1, borderColor: '#bbf7d0', marginBottom: 20 },
  fundLabel: { color: '#166534', fontSize: 14, fontWeight: '700' },
  fundAmount: { color: '#15803d', fontSize: 28, fontWeight: '800', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#bbf7d0', marginVertical: 12 },
  ruleText: { color: '#365b45', fontSize: 13, marginTop: 4 },
  sectionTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800', marginTop: 8, marginBottom: 10 },
  label: { color: '#334155', fontSize: 14, fontWeight: '700', marginTop: 12, marginBottom: 7 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#ffffff', paddingHorizontal: 13, paddingVertical: 12, fontSize: 16, color: '#0f172a' },
  reasonInput: { minHeight: 82, textAlignVertical: 'top' },
  memberButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 13, marginBottom: 8, backgroundColor: '#ffffff' },
  selectedMember: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  memberNumber: { fontSize: 12, fontWeight: '800', color: '#15803d' },
  memberName: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginTop: 3 },
  memberCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 12, padding: 14, marginTop: 8 },
  memberCardTitle: { color: '#166534', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  memberDetail: { color: '#334155', fontSize: 14, marginTop: 3 },
  limitText: { color: '#166534', fontSize: 15, fontWeight: '800', marginTop: 8 },
  estimateCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#cbd5e1', marginTop: 10 },
  estimateTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  estimateRow: { color: '#334155', fontSize: 14, marginTop: 4 },
  estimateNote: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 8 },
  notice: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 10, padding: 13, marginTop: 18 },
  noticeTitle: { color: '#9a3412', fontSize: 14, fontWeight: '800' },
  noticeText: { color: '#7c2d12', fontSize: 13, lineHeight: 19, marginTop: 5 },
  primaryButton: { minHeight: 50, backgroundColor: '#16a34a', borderRadius: 11, alignItems: 'center', justifyContent: 'center', padding: 14, marginTop: 18 },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  disabledButton: { opacity: 0.55 },
  secondaryButton: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: '#16a34a', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', padding: 12, marginTop: 10 },
  secondaryButtonText: { color: '#166534', fontSize: 14, fontWeight: '800' },
  emptyText: { color: '#64748b', fontSize: 14, paddingVertical: 12 },
  inlineLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  mutedText: { color: '#64748b', fontSize: 13 },
});
