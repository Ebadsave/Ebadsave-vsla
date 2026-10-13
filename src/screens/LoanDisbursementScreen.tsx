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
  createLoanApplication,
  disburseApprovedLoanApplication,
  getFinancialSummary,
  getLoanPolicySettings,
  getMemberLoanBalance,
  getMemberSavings,
  getMembersByGroupId,
  getVSLASetupRules,
  refreshLoanApplicationDecision,
  type LoanInterestMethod,
  type LoanPolicySettings,
  type VSLASetupRuleRecord,
} from '../database/database';

type RouteParams = {
  groupId?: number;
  meetingId?: number | null;
  executiveMemberId?: number;
  currency?: string;
};

type Member = {
  id: number;
  member_number: string;
  full_name: string;
  status: string;
};

function money(value: number, currency: string): string {
  return `${currency} ${Math.round(value || 0).toLocaleString()}`;
}

function calculatePreview(
  principal: number,
  ratePercent: number,
  periods: number,
  method: LoanInterestMethod,
): { interest: number; total: number; instalment: number } {
  if (principal <= 0 || periods <= 0 || ratePercent < 0) {
    return { interest: 0, total: 0, instalment: 0 };
  }

  const principalPerPeriod = principal / periods;
  let remaining = principal;
  let interest = 0;
  for (let index = 0; index < periods; index += 1) {
    if (method === 'fixed') {
      interest += (principal * ratePercent) / 100 / periods;
    } else if (method === 'flat') {
      interest += (principal * ratePercent) / 100;
    } else {
      interest += (remaining * ratePercent) / 100;
    }
    remaining = Math.max(0, remaining - (index === periods - 1 ? remaining : principalPerPeriod));
  }
  const total = principal + interest;
  return { interest, total, instalment: total / periods };
}

function methodLabel(method: LoanInterestMethod): string {
  if (method === 'flat') return 'Flat interest';
  if (method === 'declining') return 'Declining balance';
  return 'Fixed interest';
}

export default function LoanDisbursementScreen() {
  const route = useRoute();
  const params = (route.params ?? {}) as RouteParams;
  const groupId = Number(params.groupId ?? 0);
  const meetingId = params.meetingId == null ? null : Number(params.meetingId);
  const executiveMemberId = params.executiveMemberId == null ? null : Number(params.executiveMemberId);
  const currency = params.currency?.trim() || 'UGX';

  const [loanFund, setLoanFund] = useState(0);
  const [rules, setRules] = useState<VSLASetupRuleRecord | null>(null);
  const [policy, setPolicy] = useState<LoanPolicySettings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [memberSavings, setMemberSavings] = useState(0);
  const [currentLoanBalance, setCurrentLoanBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [periodCount, setPeriodCount] = useState('1');
  const [reason, setReason] = useState('Loan issued to member');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
  const loanMultiple = Number(rules?.maximum_loan_multiple ?? 3);
  const maximumMemberLoan = Math.max(0, memberSavings * loanMultiple - currentLoanBalance);
  const requestedAmount = Number(amount.replace(/,/g, '').trim());
  const periods = Number(periodCount);
  const interestMethod = rules?.loan_interest_method ?? 'fixed';
  const interestRate = Number(rules?.loan_interest_percentage ?? 0);
  const interestPeriod = rules?.loan_interest_period ?? 'per month';
  const preview = useMemo(
    () => calculatePreview(requestedAmount, interestRate, periods, interestMethod),
    [requestedAmount, interestRate, periods, interestMethod],
  );
  const periodUnsupported = interestPeriod !== 'per month';
  const policyNeedsReview = Boolean(policy?.require_committee_approval) || Boolean(policy?.require_guarantor);

  const loadData = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [summary, setup, loanPolicy, groupMembers] = await Promise.all([
        getFinancialSummary(groupId),
        getVSLASetupRules(groupId),
        getLoanPolicySettings(groupId),
        getMembersByGroupId(groupId),
      ]);
      setLoanFund(Number(summary.loanFund ?? 0));
      setRules(setup);
      setPolicy(loanPolicy);
      const activeMembers = (groupMembers as Member[]).filter(
        (member) => member.status?.toLowerCase() === 'active',
      );
      setMembers(activeMembers);
      if (selectedMemberId !== null && !activeMembers.some((member) => member.id === selectedMemberId)) {
        setSelectedMemberId(null);
        setMemberSavings(0);
        setCurrentLoanBalance(0);
      }
    } catch (error) {
      Alert.alert('Loan Disbursement', error instanceof Error ? error.message : 'Unable to load the saved Setup Rules.');
    } finally {
      setLoading(false);
    }
  }, [groupId, selectedMemberId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleMemberSelect = async (memberId: number) => {
    if (!groupId || saving) return;
    setSelectedMemberId(memberId);
    setAmount('');
    try {
      const [savings, loan] = await Promise.all([
        getMemberSavings(groupId, memberId),
        getMemberLoanBalance(groupId, memberId),
      ]);
      setMemberSavings(Number(savings ?? 0));
      setCurrentLoanBalance(Number(loan?.balance ?? 0));
    } catch (error) {
      setMemberSavings(0);
      setCurrentLoanBalance(0);
      Alert.alert('Member Savings', error instanceof Error ? error.message : 'Unable to load this member’s savings and loan balance.');
    }
  };

  const submitLoan = async () => {
    if (!groupId) {
      Alert.alert('Missing Group', 'The selected group could not be found.');
      return;
    }
    if (!meetingId) {
      Alert.alert('Meeting Required', 'Start or select the current meeting before requesting a loan.');
      return;
    }
    if (!executiveMemberId) {
      Alert.alert('Executive Required', 'Return to the meeting and open Loan Disbursement using an assigned group executive.');
      return;
    }
    if (!rules) {
      Alert.alert('Setup Rules Required', 'Save the group’s loan rules in Setup Rules before continuing.');
      return;
    }
    if (periodUnsupported) {
      Alert.alert(
        'Interest Period Needs Database Support',
        `This group selected “${interestPeriod}” in Setup Rules. The current loan-contract calculator safely supports “per month” only. Change Interest Period to “per month” in Setup Rules before disbursing, or add database support for this period first. No loan has been created.`,
      );
      return;
    }
    if (!selectedMemberId || !selectedMember) {
      Alert.alert('Select Member', 'Select the member applying for the loan.');
      return;
    }
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a loan amount greater than zero.');
      return;
    }
    if (requestedAmount > maximumMemberLoan) {
      Alert.alert('Loan Limit Exceeded', `The member’s additional loan limit is ${money(maximumMemberLoan, currency)} after existing loan balances.`);
      return;
    }
    if (requestedAmount > loanFund) {
      Alert.alert('Insufficient Loan Fund', `Available Loan Fund: ${money(loanFund, currency)}.`);
      return;
    }
    if (!Number.isInteger(periods) || periods < 1 || periods > Number(rules.maximum_loan_repayment_period)) {
      Alert.alert('Invalid Repayment Period', `Enter between 1 and ${Number(rules.maximum_loan_repayment_period)} months, as allowed by Setup Rules.`);
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Reason Required', 'Enter the reason for this loan.');
      return;
    }

    const estimate = calculatePreview(requestedAmount, interestRate, periods, interestMethod);
    Alert.alert(
      'Confirm Loan Terms',
      `Member: ${selectedMember.full_name} (${selectedMember.member_number})\nPrincipal: ${money(requestedAmount, currency)}\nInterest method: ${methodLabel(interestMethod)}\nRate: ${interestRate}% per month\nTerm: ${periods} month(s)\nEstimated interest: ${money(estimate.interest, currency)}\nEstimated total due: ${money(estimate.total, currency)}\n\nThe saved Setup Rules will be used for the application.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => { void createAndProcessApplication(); },
        },
      ],
    );
  };

  const createAndProcessApplication = async () => {
    if (!groupId || !meetingId || !executiveMemberId || !selectedMemberId || !rules || !policy) return;
    setSaving(true);
    try {
      const applicationId = await createLoanApplication(
        groupId,
        selectedMemberId,
        meetingId,
        {
          requestedAmount,
          interestMethod,
          interestRate,
          repaymentPeriodCount: periods,
          repaymentPeriodUnit: 'months',
          reason: reason.trim(),
          requestedByMemberId: executiveMemberId,
        },
      );

      if (policyNeedsReview) {
        Alert.alert(
          'Loan Application Saved',
          `Application #${applicationId} has been saved as pending. No money has been disbursed. ${[policy.require_committee_approval ? `Complete at least ${policy.minimum_committee_approvals} verified committee approval(s)` : '', policy.require_guarantor ? 'record a verified guarantor signature' : ''].filter(Boolean).join(' and ')} before disbursement.`,
        );
      } else {
        const decision = await refreshLoanApplicationDecision(applicationId);
        if (decision !== 'approved') {
          Alert.alert('Application Pending', `Loan application #${applicationId} is saved, but it has not been approved or disbursed.`);
        } else {
          const result = await disburseApprovedLoanApplication(applicationId, executiveMemberId);
          Alert.alert(
            'Loan Disbursed',
            `Loan issued to ${selectedMember?.full_name}.\nPrincipal: ${money(requestedAmount, currency)}\nInterest: ${money(result.totalInterest, currency)}\nTotal due: ${money(result.totalDue, currency)}\nDue date: ${result.dueDate}`,
          );
        }
      }
      setAmount('');
      setReason('Loan issued to member');
      setSelectedMemberId(null);
      setMemberSavings(0);
      setCurrentLoanBalance(0);
      await loadData();
    } catch (error) {
      Alert.alert('Loan Application Failed', error instanceof Error ? error.message : 'Unable to save or disburse this loan.');
    } finally {
      setSaving(false);
    }
  };

  const filteredMembers = members.filter((member) => {
    const query = search.trim().toLowerCase();
    return !query || member.full_name.toLowerCase().includes(query) || member.member_number.toLowerCase().includes(query);
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16a34a" />
          <Text style={styles.muted}>Loading group Setup Rules and loan balances…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!groupId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}><Text style={styles.warning}>Group information is missing.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Loan Disbursement</Text>
        <Text style={styles.subtitle}>Loan terms are loaded from the group administrator’s saved Setup Rules.</Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Loan Fund</Text>
          <Text style={styles.balance}>{money(loanFund, currency)}</Text>
          <Text style={styles.ruleText}>Maximum loan: {loanMultiple}× savings, minus any existing loan balance.</Text>
        </View>

        <View style={styles.rulesCard}>
          <Text style={styles.cardTitle}>Saved Loan Rules</Text>
          <View style={styles.ruleRow}><Text style={styles.ruleName}>Interest method</Text><Text style={styles.ruleValue}>{methodLabel(interestMethod)}</Text></View>
          <View style={styles.ruleRow}><Text style={styles.ruleName}>Interest rate</Text><Text style={styles.ruleValue}>{interestRate}%</Text></View>
          <View style={styles.ruleRow}><Text style={styles.ruleName}>Interest period</Text><Text style={styles.ruleValue}>{interestPeriod}</Text></View>
          <View style={styles.ruleRow}><Text style={styles.ruleName}>Maximum repayment term</Text><Text style={styles.ruleValue}>{Number(rules?.maximum_loan_repayment_period ?? 12)} months</Text></View>
          <Text style={styles.methodDescription}>
            {interestMethod === 'fixed'
              ? 'Fixed: one total interest charge based on the original principal, divided across the repayment instalments.'
              : interestMethod === 'flat'
                ? 'Flat: interest is calculated on the original principal for each repayment period.'
                : 'Declining: interest is calculated on the outstanding principal at the start of each repayment period.'}
          </Text>
          {periodUnsupported && (
            <Text style={styles.warning}>
              Loan creation is paused because “{interestPeriod}” is not yet supported by the current contract calculator. Select “per month” in Setup Rules until database support is added.
            </Text>
          )}
          {policyNeedsReview && (
            <Text style={styles.notice}>
              Approval requirements are enabled. Submitting will save a pending application; it will not disburse money until the required committee approvals and/or guarantor signature are recorded.
            </Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Select Member</Text>
        <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder="Search member name or number" placeholderTextColor="#6b7280" editable={!saving} />
        {filteredMembers.length === 0 ? (
          <Text style={styles.emptyText}>No active members found.</Text>
        ) : filteredMembers.map((member) => (
          <TouchableOpacity
            key={member.id}
            style={[styles.memberButton, selectedMemberId === member.id && styles.selectedMember]}
            onPress={() => { void handleMemberSelect(member.id); }}
            disabled={saving}
          >
            <Text style={styles.memberNumber}>{member.member_number}</Text>
            <Text style={styles.memberName}>{member.full_name}</Text>
          </TouchableOpacity>
        ))}

        {selectedMember && (
          <View style={styles.memberInfo}>
            <Text style={styles.cardTitle}>Selected Member</Text>
            <Text style={styles.infoText}>{selectedMember.full_name}</Text>
            <Text style={styles.infoText}>{selectedMember.member_number}</Text>
            <Text style={styles.infoText}>Savings: {money(memberSavings, currency)}</Text>
            <Text style={styles.infoText}>Outstanding loan balance: {money(currentLoanBalance, currency)}</Text>
            <Text style={styles.maximumLoan}>Maximum additional loan: {money(maximumMemberLoan, currency)}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Loan Amount ({currency})</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="Enter loan amount"
          placeholderTextColor="#6b7280"
          editable={!saving}
        />

        <Text style={styles.sectionTitle}>Repayment Period (months)</Text>
        <TextInput
          style={styles.input}
          value={periodCount}
          onChangeText={(value) => setPeriodCount(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder={`1–${Number(rules?.maximum_loan_repayment_period ?? 12)} months`}
          placeholderTextColor="#6b7280"
          editable={!saving}
        />

        {Number.isFinite(requestedAmount) && requestedAmount > 0 && Number.isInteger(periods) && periods > 0 && periods <= Number(rules?.maximum_loan_repayment_period ?? 12) && !periodUnsupported && (
          <View style={styles.previewCard}>
            <Text style={styles.cardTitle}>Estimated Repayment</Text>
            <View style={styles.ruleRow}><Text style={styles.ruleName}>Interest method</Text><Text style={styles.ruleValue}>{methodLabel(interestMethod)}</Text></View>
            <View style={styles.ruleRow}><Text style={styles.ruleName}>Estimated interest</Text><Text style={styles.ruleValue}>{money(preview.interest, currency)}</Text></View>
            <View style={styles.ruleRow}><Text style={styles.ruleName}>Estimated total due</Text><Text style={styles.totalValue}>{money(preview.total, currency)}</Text></View>
            <View style={styles.ruleRow}><Text style={styles.ruleName}>Average instalment</Text><Text style={styles.ruleValue}>{money(preview.instalment, currency)}</Text></View>
            <Text style={styles.smallNote}>Final contract amounts and due date are calculated and saved by the database when the loan is disbursed.</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Reason</Text>
        <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Reason for the loan" placeholderTextColor="#6b7280" editable={!saving} />

        <TouchableOpacity
          style={[styles.disburseButton, (saving || !selectedMemberId || periodUnsupported) && styles.disabledButton]}
          onPress={() => { void submitLoan(); }}
          disabled={saving || !selectedMemberId || periodUnsupported}
        >
          {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>{policyNeedsReview ? 'Submit Loan Application' : 'Confirm & Disburse Loan'}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 25, fontWeight: '800', color: '#166534', marginBottom: 5 },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 15, lineHeight: 19 },
  balanceCard: { backgroundColor: '#f0fdf4', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#bbf7d0' },
  balanceLabel: { fontSize: 14, color: '#374151' },
  balance: { fontSize: 26, fontWeight: '800', color: '#16a34a', marginTop: 4 },
  ruleText: { marginTop: 8, fontSize: 13, color: '#374151', lineHeight: 18 },
  rulesCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 15, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  previewCard: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 15, marginTop: 12, borderWidth: 1, borderColor: '#bbf7d0' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#166534', marginBottom: 8 },
  ruleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  ruleName: { color: '#475569', flex: 1, fontSize: 13 },
  ruleValue: { color: '#0f172a', fontSize: 13, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  totalValue: { color: '#15803d', fontSize: 14, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  methodDescription: { color: '#475569', fontSize: 12, lineHeight: 18, marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  notice: { color: '#92400e', backgroundColor: '#fffbeb', padding: 10, borderRadius: 8, fontSize: 12, lineHeight: 18, marginTop: 10 },
  warning: { color: '#991b1b', backgroundColor: '#fef2f2', padding: 10, borderRadius: 8, fontSize: 12, lineHeight: 18, marginTop: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#166534', marginTop: 12, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: '#111827', backgroundColor: '#ffffff' },
  memberButton: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 13, marginTop: 8, backgroundColor: '#ffffff' },
  selectedMember: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  memberNumber: { fontSize: 13, fontWeight: '800', color: '#16a34a' },
  memberName: { fontSize: 16, fontWeight: '600', color: '#111827', marginTop: 3 },
  memberInfo: { backgroundColor: '#ffffff', borderRadius: 10, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#d1fae5' },
  infoText: { fontSize: 14, color: '#334155', marginBottom: 4 },
  maximumLoan: { fontSize: 15, fontWeight: '800', color: '#16a34a', marginTop: 5 },
  emptyText: { textAlign: 'center', color: '#6b7280', padding: 20 },
  smallNote: { color: '#64748b', fontSize: 11, lineHeight: 16, marginTop: 8 },
  disburseButton: { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: 24, minHeight: 52, justifyContent: 'center' },
  disabledButton: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  muted: { color: '#64748b', marginTop: 10 },
});
