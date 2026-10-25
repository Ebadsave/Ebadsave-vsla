import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
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
  saveLoanGuarantorSignature,
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
): { interest: number; total: number; instalment: number } {
  if (principal <= 0 || ratePercent < 0) {
    return { interest: 0, total: 0, instalment: 0 };
  }
  // Disbursement charges only the first month's interest. Later monthly
  // charges are recorded by the recurring meeting-day interest process.
  const interest = principal * ratePercent / 100;
  return { interest, total: principal + interest, instalment: 0 };
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), 1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), lastDay));
  return result;
}

function monthsUntilDue(startDate: Date, dueDate: Date): number {
  const monthDifference = (dueDate.getFullYear() - startDate.getFullYear()) * 12
    + dueDate.getMonth() - startDate.getMonth();
  return Math.max(1, monthDifference + (dueDate.getDate() > startDate.getDate() ? 1 : 0));
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function methodLabel(method: LoanInterestMethod, interestPeriod: string): string {
  if (interestPeriod === 'per loan') return 'One-time interest';
  return method === 'declining' ? 'Monthly interest (declining)' : 'Monthly interest (fixed)';
}

export default function LoanDisbursementScreen() {
  const navigation = useNavigation<any>();
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
  const [guarantorMembers, setGuarantorMembers] = useState<Member[]>([]);
  const [selectedGuarantorIds, setSelectedGuarantorIds] = useState<number[]>([]);
  const [signatureFlow, setSignatureFlow] = useState<{ applicationId: number; memberIds: number[]; index: number; requestedAmount: number; borrowerName: string } | null>(null);
  const [guarantorPasscode, setGuarantorPasscode] = useState('');
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [memberSavings, setMemberSavings] = useState(0);
  const [currentLoanBalance, setCurrentLoanBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(() => formatDate(addMonths(new Date(), 1)));
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [interestDayOffset, setInterestDayOffset] = useState(30);
  const [interestDayVisible, setInterestDayVisible] = useState(false);
  const [interestCalendarMonth, setInterestCalendarMonth] = useState(() => new Date());
  const [reason, setReason] = useState('Agriculture');
  const [reasonVisible, setReasonVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
  const loanMultiple = Number(rules?.maximum_loan_multiple ?? 3);
  const maximumMemberLoan = Math.max(0, memberSavings * loanMultiple - currentLoanBalance);
  const requestedAmount = Number(amount.replace(/,/g, '').trim());
  const maximumTermMonths = Math.max(1, Number(rules?.maximum_loan_repayment_period ?? 12));
  const parsedDueDate = parseDate(dueDate);
  const periods = monthsUntilDue(new Date(), parsedDueDate);
  const storedInterestCalculator = rules?.loan_interest_calculator === 'standard' ? 'standard' : 'common_vsla';
  const storedInterestMethod: LoanInterestMethod = rules?.loan_interest_method ?? 'fixed';
  const storedInterestPeriod = rules?.loan_interest_period ?? 'per month';
  const oneTimeInterest = storedInterestPeriod === 'per loan';
  const interestMethod: LoanInterestMethod = oneTimeInterest
    ? 'flat'
    : storedInterestCalculator === 'common_vsla'
      ? 'declining'
      : storedInterestMethod === 'declining' ? 'declining' : 'flat';
  // Repayments remain flexible; the member selects a final repayment date within the saved maximum term.
  const interestRate = Number(rules?.loan_interest_percentage ?? 0);
  const interestPeriod = oneTimeInterest ? 'per loan' : 'per month';
  const effectivePeriodCount = periods;
  const minimumDueDate = formatDate(addMonths(new Date(), 0));
  const maximumDueDate = formatDate(addMonths(new Date(), maximumTermMonths));
  const preview = useMemo(
    () => calculatePreview(requestedAmount, interestRate),
    [requestedAmount, interestRate],
  );
  const estimatedInterestDate = formatDate(addDays(new Date(), interestDayOffset));
  const estimatedInterestDateLabel = parseDate(estimatedInterestDate).toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', year: 'numeric',
  });

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
      setGuarantorMembers(activeMembers);
      const eligibility = await Promise.all(activeMembers.map(async (member) => {
        const balance = await getMemberLoanBalance(groupId, member.id);
        return { member, eligible: Number(balance?.balance ?? 0) <= 0 };
      }));
      const eligibleMembers = eligibility.filter((item) => item.eligible).map((item) => item.member);
      setMembers(eligibleMembers);
      if (selectedMemberId !== null && !eligibleMembers.some((member) => member.id === selectedMemberId)) {
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

  useEffect(() => {
    const maxMonths = Math.max(1, Number(rules?.maximum_loan_repayment_period ?? 12));
    const latestAllowed = formatDate(addMonths(new Date(), maxMonths));
    if (dueDate > latestAllowed) setDueDate(latestAllowed);
    if (dueDate <= formatDate(new Date())) setDueDate(formatDate(addMonths(new Date(), 1)));
  }, [rules, dueDate]);

  const handleMemberSelect = async (memberId: number) => {
    if (!groupId || saving) return;
    setSelectedMemberId(memberId);
    setSelectedGuarantorIds((current) => current.filter((id) => id !== memberId));
    setAmount('');
    try {
      const [savings, loan] = await Promise.all([
        getMemberSavings(groupId, memberId),
        getMemberLoanBalance(groupId, memberId),
      ]);
      if (Number(loan?.balance ?? 0) > 0) {
        setSelectedMemberId(null);
        setMemberSavings(0);
        setCurrentLoanBalance(Number(loan.balance));
        Alert.alert('Member Not Eligible', 'This member has an outstanding loan and cannot receive another loan until it is fully repaid.');
        await loadData();
        return;
      }
      setMemberSavings(Number(savings ?? 0));
      setCurrentLoanBalance(0);
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
    if (!selectedMemberId || !selectedMember) {
      Alert.alert('Select Member', 'Select the member applying for the loan.');
      return;
    }
    if (selectedGuarantorIds.length < 1 || selectedGuarantorIds.length > 3) {
      Alert.alert('Select Guarantors', 'Select 1–3 active members from this VSLA group.');
      return;
    }
    if (selectedGuarantorIds.includes(selectedMemberId)) {
      Alert.alert('Select Guarantors', 'The borrower cannot guarantee their own loan.');
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
    const freshBalance = await getMemberLoanBalance(groupId, selectedMemberId);
    if (Number(freshBalance?.balance ?? 0) > 0) {
      Alert.alert('Member Not Eligible', 'This member has an outstanding loan. Repay it fully before disbursing another loan.');
      await loadData();
      setSelectedMemberId(null);
      return;
    }
    if (dueDate <= formatDate(new Date()) || dueDate > maximumDueDate) {
      Alert.alert('Invalid Repayment Date', `Choose a future repayment date within the maximum term of ${maximumTermMonths} months from Setup Rules.`);
      return;
    }
    const requiredPeriods = effectivePeriodCount;
    if (!Number.isInteger(requiredPeriods) || requiredPeriods < 1 || requiredPeriods > maximumTermMonths) {
      Alert.alert('Invalid Repayment Date', `Choose a repayment date within ${maximumTermMonths} months, as allowed by Setup Rules.`);
      return;
    }
    if (interestPeriod !== 'per loan' &&
        (!Number.isInteger(interestDayOffset) || interestDayOffset < 27 || interestDayOffset > 35)) {
      Alert.alert('Invalid Monthly Interest Date', 'Choose one interest date between 27 and 35 days after the loan issue date.');
      return;
    }
    if (!['Agriculture', 'Business', 'Education', 'Emergency'].includes(reason)) {
      Alert.alert('Reason Required', 'Select a reason for this loan.');
      return;
    }

    const estimate = calculatePreview(requestedAmount, interestRate);
    const interestScheduleSummary = interestPeriod === 'per loan'
      ? 'Interest schedule: one time; no monthly interest date is required.'
      : `First monthly interest date: ${interestDayOffset} days after the actual issue date (estimated ${estimatedInterestDateLabel} if issued today). Subsequent dates repeat monthly from that scheduled date.`;
    Alert.alert(
      'Confirm Loan Terms',
      `Member: ${selectedMember.full_name} (${selectedMember.member_number})\nPrincipal: ${money(requestedAmount, currency)}\nInterest method: ${methodLabel(interestMethod, interestPeriod)}\nRate: ${interestRate}% (${interestPeriod === 'per loan' ? 'one time' : 'per month'})\n${interestScheduleSummary}\nRepayment due date: ${dueDate}\nInitial month interest only: ${money(estimate.interest, currency)}\nBalance after initial interest: ${money(estimate.total, currency)}\n\nRepayments are allowed on any day. Setup Rules set the maximum repayment term.`,
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
    if (!groupId || !meetingId || !executiveMemberId || !selectedMemberId || !rules) {
      Alert.alert('Loan Details Missing', 'Please check the group, meeting, executive, selected member, and saved Setup Rules before continuing.');
      return;
    }
    if (!policy) {
      Alert.alert('Loan Policy Unavailable', 'The group loan policy could not be loaded. Return to the screen and try again. No loan has been created.');
      return;
    }
    const latestMemberBalance = await getMemberLoanBalance(groupId, selectedMemberId);
    if (Number(latestMemberBalance?.balance ?? 0) > 0) {
      Alert.alert('Member Not Eligible', 'This member now has an outstanding loan. Repay it fully before disbursing another loan.');
      setSelectedMemberId(null);
      setMemberSavings(0);
      setCurrentLoanBalance(0);
      await loadData();
      return;
    }
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
          repaymentPeriodCount: effectivePeriodCount,
          repaymentPeriodUnit: 'months',
          requestedDueDate: dueDate,
          interestDayOffset: interestPeriod === 'per loan' ? null : interestDayOffset,
          reason: reason.trim(),
          requestedByMemberId: executiveMemberId,
        },
      );

      setSignatureFlow({
        applicationId,
        memberIds: [...selectedGuarantorIds],
        index: 0,
        requestedAmount,
        borrowerName: selectedMember?.full_name ?? 'Member',
      });
      setGuarantorPasscode('');
    } catch (error) {
      Alert.alert('Loan Application Failed', error instanceof Error ? error.message : 'Unable to save or disburse this loan.');
    } finally {
      setSaving(false);
    }
  };

  const confirmGuarantorSignature = async () => {
    if (!signatureFlow || signatureSaving) return;
    const guarantorId = signatureFlow.memberIds[signatureFlow.index];
    if (!guarantorId || !guarantorPasscode.trim()) {
      Alert.alert('Passcode Required', 'Enter this guarantor’s passcode.');
      return;
    }
    setSignatureSaving(true);
    try {
      await saveLoanGuarantorSignature(
        signatureFlow.applicationId,
        guarantorId,
        signatureFlow.requestedAmount,
        guarantorPasscode.trim(),
      );
      setGuarantorPasscode('');
      if (signatureFlow.index + 1 < signatureFlow.memberIds.length) {
        setSignatureFlow({ ...signatureFlow, index: signatureFlow.index + 1 });
        return;
      }

      setSignatureFlow(null);
      const decision = await refreshLoanApplicationDecision(signatureFlow.applicationId);
      if (decision === 'approved') {
        const result = await disburseApprovedLoanApplication(signatureFlow.applicationId, executiveMemberId as number);
        Alert.alert(
          'Loan Disbursed',
          `Loan issued to ${signatureFlow.borrowerName}.\nIssue date: ${result.issueDate}\nPrincipal: ${money(signatureFlow.requestedAmount, currency)}\nInterest charged initially: ${money(result.totalInterest, currency)}\nCurrent balance after initial interest: ${money(result.totalDue, currency)}\nDue date: ${result.dueDate}`,
        );
      } else if (decision === 'rejected') {
        Alert.alert('Loan Rejected', `Loan application #${signatureFlow.applicationId} was rejected.`);
      } else {
        Alert.alert(
          'Application Saved',
          `Application #${signatureFlow.applicationId} is pending required committee approval.`,
        );
      }
      setAmount('');
      setReason('Agriculture');
      setDueDate(formatDate(addMonths(new Date(), 1)));
      setSelectedMemberId(null);
      setSelectedGuarantorIds([]);
      setMemberSavings(0);
      setCurrentLoanBalance(0);
      await loadData();
    } catch (error) {
      Alert.alert('Guarantor Signature', error instanceof Error ? error.message : 'Unable to verify this guarantor.');
    } finally {
      setSignatureSaving(false);
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
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.backToMeetingButton}
          onPress={() => navigation.goBack()}
          disabled={saving}
        >
          <Text style={styles.backToMeetingText}>← Return to Meeting</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Loan Disbursement</Text>
        <Text style={styles.subtitle}>Loan terms are loaded from the group administrator’s saved Setup Rules.</Text>

        {!executiveMemberId && (
          <View style={styles.warning}>
            <Text style={styles.warningTitle}>Executive authorization required</Text>
            <Text style={styles.warningBody}>The current meeting did not pass an authorized executive member to this screen. Return to the meeting and open Loan Disbursement from the meeting workflow. If no executive is assigned, assign an active member to an executive post in Group Management first. No loan can be disbursed without this authorization.</Text>
          </View>
        )}

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Loan Fund</Text>
          <Text style={styles.balance}>{money(loanFund, currency)}</Text>
          <Text style={styles.ruleText}>Maximum loan: {loanMultiple}× savings, minus any existing loan balance.</Text>
        </View>

        <View style={styles.rulesCard}>
          <Text style={styles.cardTitle}>Saved Loan Rules</Text>
          <View style={styles.ruleRow}><Text style={styles.ruleName}>Interest method</Text><Text style={styles.ruleValue}>{methodLabel(interestMethod, interestPeriod)}</Text></View>
          <View style={styles.ruleRow}><Text style={styles.ruleName}>Interest rate</Text><Text style={styles.ruleValue}>{interestRate}%</Text></View>
          <View style={styles.ruleRow}><Text style={styles.ruleName}>Interest frequency</Text><Text style={styles.ruleValue}>{interestPeriod === 'per loan' ? 'One time' : 'Monthly'}</Text></View>
          <View style={styles.ruleRow}><Text style={styles.ruleName}>Maximum repayment term</Text><Text style={styles.ruleValue}>{Number(rules?.maximum_loan_repayment_period ?? 12)} months</Text></View>
          <Text style={styles.methodDescription}>
            {interestPeriod === 'per loan'
              ? 'Interest is applied only once to the original loan principal.'
              : interestMethod === 'declining'
                ? 'Monthly interest is recalculated on the remaining balance owed.'
                : 'The same fixed monthly interest charge is based on the original principal.'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Select Member</Text>
        <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder="Search member name or number" placeholderTextColor="#6b7280" editable={!saving} />
        {filteredMembers.length === 0 ? (
          <Text style={styles.emptyText}>No eligible members found. Members with outstanding loans cannot receive another loan.</Text>
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

        <Text style={styles.sectionTitle}>Loan Guarantors</Text>
        <Text style={styles.smallNote}>Select 1–3 active members of this VSLA group.</Text>
        {guarantorMembers.filter((member) => member.id !== selectedMemberId).map((member) => {
          const selected = selectedGuarantorIds.includes(member.id);
          const atLimit = selectedGuarantorIds.length >= 3;
          return (
            <TouchableOpacity
              key={`guarantor-${member.id}`}
              style={[styles.memberButton, selected && styles.selectedMember]}
              disabled={saving || signatureFlow !== null || (!selected && atLimit)}
              onPress={() => setSelectedGuarantorIds((current) => selected
                ? current.filter((id) => id !== member.id)
                : current.length < 3 ? [...current, member.id] : current)}
            >
              <Text style={styles.memberNumber}>{member.member_number}{selected ? '  ✓' : ''}</Text>
              <Text style={styles.memberName}>{member.full_name}</Text>
            </TouchableOpacity>
          );
        })}
        <Text style={styles.smallNote}>Selected: {selectedGuarantorIds.length}/3</Text>

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

        {interestPeriod !== 'per loan' && (
          <>
            <Text style={styles.sectionTitle}>First Monthly Interest Date</Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.datePickerButton}
              onPress={() => { setInterestCalendarMonth(parseDate(estimatedInterestDate)); setInterestDayVisible(true); }}
              disabled={saving}
            >
              <View>
                <Text style={styles.datePickerLabel}>Selected first monthly interest date</Text>
                <Text style={styles.datePickerValue}>{estimatedInterestDateLabel}</Text>
                <Text style={styles.smallNote}>{interestDayOffset} days after issue (estimated)</Text>
                <Text style={styles.smallNote}>Estimated date if issued today: {estimatedInterestDateLabel}</Text>
              </View>
              <Text style={styles.dropdownArrow}>▾</Text>
            </TouchableOpacity>
            <Text style={styles.smallNote}>Choose a calendar date 27–35 days after the expected loan issue date. The date shown above is an estimate; if an application is pending, the schedule starts from the actual disbursement date. Later monthly dates follow this selected date. The final repayment due date below is separate.</Text>
          </>
        )}

        <Text style={styles.sectionTitle}>Repayment Due Date</Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.datePickerButton}
          onPress={() => {
            setCalendarMonth(parseDate(dueDate));
            setCalendarVisible(true);
          }}
          disabled={saving}
        >
          <View>
            <Text style={styles.datePickerLabel}>Final repayment date</Text>
            <Text style={styles.datePickerValue}>{parseDate(dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          </View>
          <Text style={styles.dropdownArrow}>▾</Text>
        </TouchableOpacity>
        <Text style={styles.smallNote}>Maximum term from Setup Rules: {maximumTermMonths} month(s). Adjust the date using the calendar. Repayments remain flexible; monthly interest is charged only when each recurring meeting check is due.</Text>

        {Number.isFinite(requestedAmount) && requestedAmount > 0 && Number.isInteger(effectivePeriodCount) && effectivePeriodCount > 0 && effectivePeriodCount <= maximumTermMonths && (
          <View style={styles.previewCard}>
            <Text style={styles.cardTitle}>Estimated Repayment</Text>
            <View style={styles.ruleRow}><Text style={styles.ruleName}>Interest method</Text><Text style={styles.ruleValue}>{methodLabel(interestMethod, interestPeriod)}</Text></View>
            <View style={styles.ruleRow}><Text style={styles.ruleName}>Initial month interest only</Text><Text style={styles.ruleValue}>{money(preview.interest, currency)}</Text></View>
            <View style={styles.ruleRow}><Text style={styles.ruleName}>Balance after initial interest</Text><Text style={styles.totalValue}>{money(preview.total, currency)}</Text></View>
            <Text style={styles.smallNote}>
              Only the first month’s interest is included here. Later monthly interest is charged once per qualifying meeting while the loan remains outstanding; no future months are added at disbursement.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Reason</Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.datePickerButton}
          onPress={() => setReasonVisible(true)}
          disabled={saving}
        >
          <Text style={styles.datePickerValue}>{reason}</Text>
          <Text style={styles.dropdownArrow}>▾</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.disburseButton, (saving || !selectedMemberId) && styles.disabledButton]}
          onPress={() => { void submitLoan(); }}
          disabled={saving || !selectedMemberId}
        >
          {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Continue</Text>}
        </TouchableOpacity>
        <Modal visible={interestDayVisible} transparent animationType="fade" onRequestClose={() => setInterestDayVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.calendarCard}>
              <Text style={styles.cardTitle}>Choose first monthly interest date</Text>
              <Text style={styles.smallNote}>Choose a date between 27 and 35 days after the expected issue date. The date is recalculated from the actual disbursement date when the loan is issued.</Text>
              <View style={styles.calendarHeader}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.calendarNav}
                  onPress={() => setInterestCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                  disabled={formatDate(new Date(interestCalendarMonth.getFullYear(), interestCalendarMonth.getMonth(), 1)) <= formatDate(new Date(addDays(new Date(), 27).getFullYear(), addDays(new Date(), 27).getMonth(), 1))}
                ><Text style={styles.calendarNavText}>‹</Text></TouchableOpacity>
                <Text style={styles.calendarMonth}>{monthLabel(interestCalendarMonth)}</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.calendarNav}
                  onPress={() => setInterestCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                  disabled={formatDate(new Date(interestCalendarMonth.getFullYear(), interestCalendarMonth.getMonth(), 1)) >= formatDate(new Date(addDays(new Date(), 35).getFullYear(), addDays(new Date(), 35).getMonth(), 1))}
                ><Text style={styles.calendarNavText}>›</Text></TouchableOpacity>
              </View>
              <View style={styles.calendarGrid}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <Text key={day} style={styles.calendarWeekday}>{day}</Text>)}
                {Array.from({ length: new Date(interestCalendarMonth.getFullYear(), interestCalendarMonth.getMonth(), 1).getDay() }, (_, index) => <View key={`interest-blank-${index}`} style={styles.calendarDay} />)}
                {Array.from({ length: new Date(interestCalendarMonth.getFullYear(), interestCalendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => {
                  const day = index + 1;
                  const date = new Date(interestCalendarMonth.getFullYear(), interestCalendarMonth.getMonth(), day);
                  const dateValue = formatDate(date);
                  const minInterestDate = formatDate(addDays(new Date(), 27));
                  const maxInterestDate = formatDate(addDays(new Date(), 35));
                  const disabled = dateValue < minInterestDate || dateValue > maxInterestDate;
                  const selected = dateValue === estimatedInterestDate;
                  return (
                    <TouchableOpacity
                      key={`interest-${dateValue}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled }}
                      style={[styles.calendarDay, selected && styles.calendarDaySelected, disabled && styles.calendarDayDisabled]}
                      disabled={disabled || saving}
                      onPress={() => {
                        const offset = Math.round((new Date(`${dateValue}T12:00:00`).getTime() - new Date(`${formatDate(new Date())}T12:00:00`).getTime()) / 86400000);
                        setInterestDayOffset(offset);
                        setInterestDayVisible(false);
                      }}
                    ><Text style={[styles.calendarDayText, selected && styles.calendarDayTextSelected, disabled && styles.calendarDayTextDisabled]}>{day}</Text></TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.smallNote}>Only eligible dates from {formatDate(addDays(new Date(), 27))} through {formatDate(addDays(new Date(), 35))} can be selected.</Text>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setInterestDayVisible(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={calendarVisible} transparent animationType="fade" onRequestClose={() => setCalendarVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.calendarCard}>
              <Text style={styles.cardTitle}>Choose repayment date</Text>
              <View style={styles.calendarHeader}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.calendarNav}
                  onPress={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                  disabled={formatDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)) <= formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                ><Text style={styles.calendarNavText}>‹</Text></TouchableOpacity>
                <Text style={styles.calendarMonth}>{monthLabel(calendarMonth)}</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.calendarNav}
                  onPress={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                  disabled={formatDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)) >= formatDate(new Date(parseDate(maximumDueDate).getFullYear(), parseDate(maximumDueDate).getMonth(), 1))}
                ><Text style={styles.calendarNavText}>›</Text></TouchableOpacity>
              </View>
              <View style={styles.calendarGrid}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <Text key={day} style={styles.calendarWeekday}>{day}</Text>)}
                {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() }, (_, index) => <View key={`blank-${index}`} style={styles.calendarDay} />)}
                {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, index) => {
                  const day = index + 1;
                  const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                  const dateValue = formatDate(date);
                  const disabled = dateValue <= minimumDueDate || dateValue > maximumDueDate;
                  const selected = dateValue === dueDate;
                  return (
                    <TouchableOpacity
                      key={dateValue}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled }}
                      style={[styles.calendarDay, selected && styles.calendarDaySelected, disabled && styles.calendarDayDisabled]}
                      disabled={disabled || saving}
                      onPress={() => { setDueDate(dateValue); setCalendarVisible(false); }}
                    ><Text style={[styles.calendarDayText, selected && styles.calendarDayTextSelected, disabled && styles.calendarDayTextDisabled]}>{day}</Text></TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.smallNote}>Choose a date from tomorrow through {maximumDueDate}.</Text>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setCalendarVisible(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={signatureFlow !== null} transparent animationType="fade" onRequestClose={() => {}}>
          <View style={styles.modalBackdrop}>
            <View style={styles.reasonCard}>
              <Text style={styles.cardTitle}>Guarantor Confirmation</Text>
              <Text style={styles.infoText}>
                {signatureFlow ? guarantorMembers.find((member) => member.id === signatureFlow.memberIds[signatureFlow.index])?.full_name ?? 'Selected guarantor' : ''}
              </Text>
              <Text style={styles.smallNote}>
                {signatureFlow ? `${signatureFlow.index + 1} of ${signatureFlow.memberIds.length}` : ''}
              </Text>
              <TextInput
                style={styles.input}
                value={guarantorPasscode}
                onChangeText={setGuarantorPasscode}
                placeholder="Passcode"
                placeholderTextColor="#6b7280"
                secureTextEntry
                keyboardType="number-pad"
                editable={!signatureSaving}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[styles.disburseButton, signatureSaving && styles.disabledButton]}
                onPress={() => { void confirmGuarantorSignature(); }}
                disabled={signatureSaving}
              >
                <Text style={styles.buttonText}>{signatureSaving ? 'Confirming…' : 'Confirm Guarantee'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={reasonVisible} transparent animationType="fade" onRequestClose={() => setReasonVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.reasonCard}>
              <Text style={styles.cardTitle}>Select loan reason</Text>
              {['Agriculture', 'Business', 'Education', 'Emergency'].map((option) => (
                <TouchableOpacity
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: reason === option }}
                  style={[styles.reasonOption, reason === option && styles.reasonOptionSelected]}
                  onPress={() => { setReason(option); setReasonVisible(false); }}
                ><Text style={[styles.reasonOptionText, reason === option && styles.reasonOptionTextSelected]}>{option}{reason === option ? '  ✓' : ''}</Text></TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.cancelButton} onPress={() => setReasonVisible(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  warningTitle: { color: '#991b1b', fontWeight: '800', marginBottom: 5 },
  warningBody: { color: '#991b1b', fontSize: 12, lineHeight: 18 },
  backToMeetingButton: { alignSelf: 'flex-start', backgroundColor: '#ffffff', borderColor: '#16a34a', borderWidth: 1, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 13, marginBottom: 14 },
  backToMeetingText: { color: '#166534', fontSize: 14, fontWeight: '800' },
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
  datePickerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 13, backgroundColor: '#ffffff' },
  datePickerLabel: { color: '#64748b', fontSize: 12, marginBottom: 4 },
  datePickerValue: { color: '#111827', fontSize: 16, fontWeight: '700' },
  dropdownArrow: { color: '#166534', fontSize: 24, fontWeight: '800', marginLeft: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  calendarCard: { width: '100%', maxWidth: 380, backgroundColor: '#ffffff', borderRadius: 16, padding: 16 },
  interestDayCard: { width: '100%', maxWidth: 380, maxHeight: '85%', backgroundColor: '#ffffff', borderRadius: 16, padding: 16 },
  interestDayList: { flexGrow: 0, marginTop: 10 },
  reasonCard: { width: '100%', maxWidth: 360, backgroundColor: '#ffffff', borderRadius: 16, padding: 16 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calendarNav: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' },
  calendarNavText: { color: '#166534', fontSize: 28, fontWeight: '700', lineHeight: 30 },
  calendarMonth: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarWeekday: { width: '14.2857%', textAlign: 'center', color: '#64748b', fontSize: 11, fontWeight: '700', paddingVertical: 8 },
  calendarDay: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  calendarDaySelected: { backgroundColor: '#16a34a' },
  calendarDayDisabled: { opacity: 0.35 },
  calendarDayText: { color: '#0f172a', fontSize: 14 },
  calendarDayTextSelected: { color: '#ffffff', fontWeight: '800' },
  calendarDayTextDisabled: { color: '#94a3b8' },
  reasonOption: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 13, marginBottom: 8, backgroundColor: '#ffffff' },
  reasonOptionSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  reasonOptionText: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  reasonOptionTextSelected: { color: '#166534', fontWeight: '800' },
  cancelButton: { alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  cancelButtonText: { color: '#64748b', fontSize: 14, fontWeight: '700' },
  muted: { color: '#64748b', marginTop: 10 },
});
