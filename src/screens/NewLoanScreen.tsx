import React, { useCallback, useEffect, useState } from 'react';
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
import AdjustDatesScreen from './AdjustDatesScreen';
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
type Member = { id: number; member_number: string; full_name: string; status: string };
type InterestDate = { label: string; date: string; originalDate: string };
type Schedule = { kind: 'weekly'; weekday: number } | { kind: 'twiceDates'; days: number[] } | { kind: 'twiceRules'; rules: Array<{ occurrence: string; weekday: number }> } | { kind: 'monthlyDate'; day: number } | { kind: 'monthlyRule'; occurrence: string; weekday: number } | { kind: 'monthly' };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const OCCURRENCES = ['first', 'second', 'third', 'fourth', 'last'];

function money(value: number, currency: string): string {
  return `${currency} ${Math.round(value || 0).toLocaleString()}`;
}
function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
function addMonths(date: Date, months: number): Date {
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  targetMonth.setDate(Math.min(date.getDate(), lastDay));
  return targetMonth;
}
function dayDifference(a: Date, b: Date): number {
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86400000);
}
function displayDate(value: string): string {
  return parseDate(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function parseSchedule(rawValue: string): Schedule {
  const raw = String(rawValue || '').toLowerCase();
  if (raw === 'weekly') return { kind: 'weekly', weekday: 1 };
  if (raw === 'biweekly') return { kind: 'twiceDates', days: [1, 15] };
  const weekly = raw.match(/^weekly_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (weekly) return { kind: 'weekly', weekday: WEEKDAYS.findIndex((day) => day.toLowerCase() === weekly[1]) };
  const twiceDates = raw.match(/^twice_dates_(\d{1,2})_(\d{1,2})$/);
  if (twiceDates) return { kind: 'twiceDates', days: [Number(twiceDates[1]), Number(twiceDates[2])].sort((a, b) => a - b) };
  const twiceRules = raw.match(/^twice_rules_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (twiceRules) return { kind: 'twiceRules', rules: [{ occurrence: twiceRules[1], weekday: WEEKDAYS.findIndex((day) => day.toLowerCase() === twiceRules[2]) }, { occurrence: twiceRules[3], weekday: WEEKDAYS.findIndex((day) => day.toLowerCase() === twiceRules[4]) }] };
  const monthlyDate = raw.match(/^monthly_date_(\d{1,2})$/);
  if (monthlyDate) return { kind: 'monthlyDate', day: Number(monthlyDate[1]) };
  const monthlyRule = raw.match(/^monthly_rule_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (monthlyRule) return { kind: 'monthlyRule', occurrence: monthlyRule[1], weekday: WEEKDAYS.findIndex((day) => day.toLowerCase() === monthlyRule[2]) };
  const legacyWeekly = raw.match(/^weekly_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (legacyWeekly) return { kind: 'weekly', weekday: WEEKDAYS.findIndex((day) => day.toLowerCase() === legacyWeekly[1]) };
  return { kind: 'monthly' };
}
function occurrenceDate(year: number, monthIndex: number, occurrence: string, weekday: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0, 12).getDate();
  if (occurrence === 'last') {
    const date = new Date(year, monthIndex, lastDay, 12);
    date.setDate(lastDay - ((date.getDay() - weekday + 7) % 7));
    return date;
  }
  const first = new Date(year, monthIndex, 1, 12);
  const day = 1 + ((weekday - first.getDay() + 7) % 7) + (OCCURRENCES.indexOf(occurrence) * 7);
  return new Date(year, monthIndex, Math.min(day, lastDay), 12);
}
function scheduleDatesForMonth(year: number, monthIndex: number, schedule: Schedule): Date[] {
  if (schedule.kind === 'weekly') {
    const result: Date[] = [];
    const lastDay = new Date(year, monthIndex + 1, 0, 12).getDate();
    for (let day = 1; day <= lastDay; day += 1) {
      const date = new Date(year, monthIndex, day, 12);
      if (date.getDay() === schedule.weekday) result.push(date);
    }
    return result;
  }
  if (schedule.kind === 'twiceDates') {
    const lastDay = new Date(year, monthIndex + 1, 0, 12).getDate();
    return schedule.days.map((day) => new Date(year, monthIndex, Math.min(day, lastDay), 12));
  }
  if (schedule.kind === 'twiceRules') return schedule.rules.map((rule) => occurrenceDate(year, monthIndex, rule.occurrence, rule.weekday));
  if (schedule.kind === 'monthlyDate') {
    const lastDay = new Date(year, monthIndex + 1, 0, 12).getDate();
    return [new Date(year, monthIndex, Math.min(schedule.day, lastDay), 12)];
  }
  if (schedule.kind === 'monthlyRule') return [occurrenceDate(year, monthIndex, schedule.occurrence, schedule.weekday)];
  return [new Date(year, monthIndex, 1, 12)];
}
function nearestMeetingDate(target: Date, schedule: Schedule, previous: Date): Date {
  const min = dayDifference(previous, target) >= 27 ? new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 27, 12) : new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 27, 12);
  const max = new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 35, 12);
  const candidates: Date[] = [];
  for (let offset = -1; offset <= 2; offset += 1) {
    const month = new Date(target.getFullYear(), target.getMonth() + offset, 1, 12);
    candidates.push(...scheduleDatesForMonth(month.getFullYear(), month.getMonth(), schedule));
  }
  const valid = candidates.filter((date) => date >= min && date <= max);
  if (!valid.length) return target;
  valid.sort((a, b) => Math.abs(dayDifference(target, a)) - Math.abs(dayDifference(target, b)));
  return valid[0];
}
function buildInterestDates(startDate: Date, termMonths: number, schedule: Schedule): InterestDate[] {
  const dates: InterestDate[] = [{ label: 'Month 1', date: dateOnly(startDate), originalDate: dateOnly(startDate) }];
  let previous = startDate;
  for (let month = 1; month < termMonths; month += 1) {
    const target = addMonths(startDate, month);
    const meetingDate = nearestMeetingDate(target, schedule, previous);
    const value = dateOnly(meetingDate);
    dates.push({ label: `Month ${month + 1}`, date: value, originalDate: value });
    previous = meetingDate;
  }
  return dates;
}

export default function NewLoanScreen() {
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
  const [memberBalances, setMemberBalances] = useState<Record<number, { savings: number; loanBalance: number; maxLoan: number }>>({});
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Business');
  const [interestDates, setInterestDates] = useState<InterestDate[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [adjustingDates, setAdjustingDates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
  const loanMultiple = Math.max(0, Number(rules?.maximum_loan_multiple ?? 3));
  const maximumTermMonths = Math.max(1, Number(rules?.maximum_loan_repayment_period ?? 3));
  const interestRate = Math.max(0, Number(rules?.loan_interest_percentage ?? 0));
  const interestPeriod = String(rules?.loan_interest_period ?? 'per month').toLowerCase();
  const monthlyInterest = interestPeriod !== 'per loan';
  const requestedAmount = Number(amount.replace(/,/g, '').trim());
  const selectedBalance = selectedMemberId == null ? undefined : memberBalances[selectedMemberId];
  const maxLoan = selectedBalance?.maxLoan ?? 0;
  const previewInterest = monthlyInterest ? requestedAmount * interestRate / 100 : requestedAmount * interestRate / 100;
  const previewTotal = requestedAmount + previewInterest;
  const policyNeedsReview = Boolean(policy?.require_committee_approval) || Boolean(policy?.require_guarantor);

  const refreshInterestDates = useCallback((setup: VSLASetupRuleRecord, start = new Date(), adjusted?: InterestDate[]) => {
    const term = Math.max(1, Number(setup.maximum_loan_repayment_period ?? 3));
    const calculated = buildInterestDates(start, term, parseSchedule(setup.meeting_frequency));
    const base = adjusted?.length === calculated.length ? adjusted.map((item, index) => ({ ...calculated[index], date: item.date })) : calculated;
    const finalInterestDate = base[base.length - 1]?.date ?? dateOnly(addMonths(start, term - 1));
    const nextDue = addMonths(parseDate(finalInterestDate), 1);
    setInterestDates(base);
    setDueDate(dateOnly(nextDue));
  }, []);

  const loadData = useCallback(async () => {
    if (!groupId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [summary, setup, loanPolicy, groupMembers] = await Promise.all([
        getFinancialSummary(groupId), getVSLASetupRules(groupId), getLoanPolicySettings(groupId), getMembersByGroupId(groupId),
      ]);
      setLoanFund(Number(summary.loanFund ?? 0));
      setRules(setup);
      setPolicy(loanPolicy);
      if (setup) refreshInterestDates(setup);
      const activeMembers = (groupMembers as Member[]).filter((member) => member.status?.toLowerCase() === 'active');
      const results = await Promise.all(activeMembers.map(async (member) => {
        const [savings, loan] = await Promise.all([getMemberSavings(groupId, member.id), getMemberLoanBalance(groupId, member.id)]);
        const balance = Number(loan?.balance ?? 0);
        const maximum = Math.max(0, Number(savings ?? 0) * Number(setup?.maximum_loan_multiple ?? 3) - balance);
        return { member, savings: Number(savings ?? 0), loanBalance: balance, maxLoan: maximum };
      }));
      const eligible = results.filter((item) => item.loanBalance <= 0 && item.maxLoan > 0);
      setMembers(eligible.map((item) => item.member));
      const nextBalances: Record<number, { savings: number; loanBalance: number; maxLoan: number }> = {};
      eligible.forEach((item) => { nextBalances[item.member.id] = { savings: item.savings, loanBalance: item.loanBalance, maxLoan: item.maxLoan }; });
      setMemberBalances(nextBalances);
      if (selectedMemberId !== null && !eligible.some((item) => item.member.id === selectedMemberId)) setSelectedMemberId(null);
    } catch (error) {
      Alert.alert('New Loan', error instanceof Error ? error.message : 'Unable to load eligible members.');
    } finally { setLoading(false); }
  }, [groupId, refreshInterestDates, selectedMemberId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const chooseMember = (memberId: number) => {
    setSelectedMemberId(memberId);
    setAmount('');
    if (rules) refreshInterestDates(rules);
  };

  const openAdjustDates = () => {
    if (!rules) return;
    setAdjustingDates(true);
  };

  const submitLoan = async () => {
    if (!groupId || !meetingId || !executiveMemberId) {
      Alert.alert('Loan Details Missing', 'Open New Loan from the current meeting using an assigned active group executive.'); return;
    }
    if (!rules || !selectedMember || !selectedMemberId) { Alert.alert('Select Member', 'Select an eligible member.'); return; }
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) { Alert.alert('Loan Amount', 'Enter an amount greater than zero.'); return; }
    if (requestedAmount > maxLoan) { Alert.alert('Maximum Loan', `The maximum loan for this member is ${money(maxLoan, currency)}.`); return; }
    if (requestedAmount > loanFund) { Alert.alert('Loan Fund', `Available Loan Fund: ${money(loanFund, currency)}.`); return; }
    if (!['Business', 'Agriculture', 'Education'].includes(reason)) { Alert.alert('Loan Purpose', 'Select a loan purpose.'); return; }
    if (!dueDate || dueDate <= dateOnly(new Date())) { Alert.alert('Due Date', 'Choose a future due date.'); return; }
    const term = maximumTermMonths;
    const nextInterestDate = interestDates[1]?.date;
    const interestOffset = monthlyInterest && nextInterestDate ? dayDifference(parseDate(interestDates[0].date), parseDate(nextInterestDate)) : null;
    if (monthlyInterest && (interestOffset == null || interestOffset < 27 || interestOffset > 37)) {
      Alert.alert('Interest Date', 'The first monthly interest date must be 27–37 days after disbursement. Use Adjust Dates to choose a date in that range.'); return;
    }
    const latestBalance = await getMemberLoanBalance(groupId, selectedMemberId);
    if (Number(latestBalance?.balance ?? 0) > 0) { Alert.alert('Member Not Eligible', 'This member has an outstanding loan.'); await loadData(); setSelectedMemberId(null); return; }
    setSaving(true);
    try {
      const interestMethod: LoanInterestMethod = interestPeriod === 'per loan' ? 'flat' : (rules.loan_interest_method === 'declining' ? 'declining' : 'flat');
      const applicationId = await createLoanApplication(groupId, selectedMemberId, meetingId, {
        requestedAmount, interestMethod, interestRate, repaymentPeriodCount: term, repaymentPeriodUnit: 'months',
        requestedDueDate: dueDate, interestDayOffset: interestOffset,
        interestDates: interestDates.map((item) => ({ label: item.label, date: item.date })),
        reason, requestedByMemberId: executiveMemberId,
      });
      if (policyNeedsReview) {
        Alert.alert('Loan Application Saved', `Application #${applicationId} is pending approval. No money has been disbursed.`);
      } else {
        const decision = await refreshLoanApplicationDecision(applicationId);
        if (decision !== 'approved') Alert.alert('Application Pending', `Application #${applicationId} has been saved but is not approved yet.`);
        else {
          const result = await disburseApprovedLoanApplication(applicationId, executiveMemberId);
          Alert.alert('Loan Disbursed', `Loan issued to ${selectedMember.full_name}.\nPrincipal: ${money(requestedAmount, currency)}\nInitial interest: ${money(result.totalInterest, currency)}\nTotal due after initial interest: ${money(result.totalDue, currency)}\nDue date: ${displayDate(result.dueDate)}`);
        }
      }
      setSelectedMemberId(null); setAmount(''); setReason('Business'); await loadData();
    } catch (error) {
      Alert.alert('Loan Application Failed', error instanceof Error ? error.message : 'Unable to save the loan application.');
    } finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={styles.container}><View style={styles.center}><ActivityIndicator size="large" color="#16a34a" /><Text style={styles.muted}>Loading eligible members…</Text></View></SafeAreaView>;
  if (!groupId) return <SafeAreaView style={styles.container}><View style={styles.center}><Text style={styles.warning}>Group information is missing.</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => selectedMember ? setSelectedMemberId(null) : navigation.goBack()} disabled={saving}>
          <Text style={styles.backText}>‹ {selectedMember ? 'Eligible Members' : 'Back'}</Text>
        </TouchableOpacity>
        {!selectedMember ? <>
          <Text style={styles.title}>Eligible Members</Text>
          <Text style={styles.subtitle}>Select a member to start a new loan.</Text>
          <View style={styles.fundCard}><Text style={styles.fundLabel}>Total Loan Fund</Text><Text style={styles.fundValue}>{money(loanFund, currency)}</Text></View>
          {members.length === 0 ? <Text style={styles.empty}>No eligible members found.</Text> : members.map((member) => (
            <TouchableOpacity key={member.id} style={styles.memberCard} onPress={() => chooseMember(member.id)} disabled={saving}>
              <View style={styles.memberCopy}><Text style={styles.memberName}>{member.full_name}</Text><Text style={styles.memberNumber}>{member.member_number}</Text></View>
              <View style={styles.maxCopy}><Text style={styles.maxLabel}>Max Loan</Text><Text style={styles.maxValue}>{money(memberBalances[member.id]?.maxLoan ?? 0, currency)}</Text></View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </> : <>
          <Text style={styles.title}>New Loan for {selectedMember.full_name}</Text>
          <View style={styles.balanceCard}>
            <Text style={styles.sectionTitle}>Current Balances</Text>
            <View style={styles.balanceRow}><Text style={styles.balanceLabel}>Total Loan Fund</Text><Text style={styles.balanceValue}>{money(loanFund, currency)}</Text></View>
            <View style={styles.balanceRow}><Text style={styles.balanceLabel}>Member Savings</Text><Text style={styles.balanceValue}>{money(selectedBalance?.savings ?? 0, currency)}</Text></View>
            <View style={styles.balanceRow}><Text style={styles.balanceLabel}>Max Loan</Text><Text style={styles.maxValue}>{money(maxLoan, currency)}</Text></View>
          </View>
          <Text style={styles.sectionTitle}>How much does {selectedMember.full_name} want to borrow?</Text>
          <TextInput style={styles.amountInput} value={amount} onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder={`Amount (${currency})`} placeholderTextColor="#64748b" editable={!saving} />
          <View style={styles.termRow}><Text style={styles.termLabel}>Loan Term</Text><Text style={styles.termValue}>{maximumTermMonths} {maximumTermMonths === 1 ? 'month' : 'months'}</Text></View>
          <Text style={styles.sectionTitle}>Interest Dates</Text>
          <View style={styles.datesCard}>
            {interestDates.map((item, index) => <View key={`${item.label}-${index}`} style={styles.dateRow}>
              <View><Text style={styles.dateLabel}>{item.label}</Text><Text style={styles.dateValue}>{displayDate(item.date)}</Text></View>
              <Text style={styles.dateNote}>{index === 0 ? 'Interest applied Day 1' : 'Interest calculation'}</Text>
            </View>)}
            <TouchableOpacity style={styles.adjustButton} onPress={openAdjustDates} disabled={saving}><Text style={styles.adjustText}>Adjust Dates ›</Text></TouchableOpacity>
            <View style={styles.dueRow}><Text style={styles.dueLabel}>Due Date</Text><Text style={styles.dueValue}>{dueDate ? displayDate(dueDate) : '—'}</Text></View>
          </View>
          <Text style={styles.sectionTitle}>What is the loan for?</Text>
          <View style={styles.radioGroup}>{['Business', 'Agriculture', 'Education'].map((option) => <TouchableOpacity key={option} style={styles.radioOption} onPress={() => setReason(option)} disabled={saving}>
            <View style={[styles.radioOuter, reason === option && styles.radioOuterSelected]}>{reason === option && <View style={styles.radioInner} />}</View><Text style={styles.radioText}>{option}</Text>
          </TouchableOpacity>)}</View>
          {Number.isFinite(requestedAmount) && requestedAmount > 0 && <View style={styles.previewCard}><Text style={styles.previewTitle}>Day 1 Total Due</Text><Text style={styles.previewAmount}>{money(previewTotal, currency)}</Text><Text style={styles.previewNote}>Principal plus {interestRate}% initial interest ({money(previewInterest, currency)}).</Text></View>}
          <TouchableOpacity style={[styles.submitButton, saving && styles.disabled]} onPress={() => { void submitLoan(); }} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{policyNeedsReview ? 'Submit Loan Application' : 'Confirm & Disburse Loan'}</Text>}
          </TouchableOpacity>
        </>}
      </ScrollView>
      <Modal visible={adjustingDates} animationType="slide" onRequestClose={() => setAdjustingDates(false)}>
        <AdjustDatesScreen
          embedded
          title="Adjust Dates"
          interestDates={interestDates}
          dueDate={dueDate}
          startDate={interestDates[0]?.date ?? dateOnly(new Date())}
          meetingFrequency={rules?.meeting_frequency}
          onDone={(dates, nextDueDate) => {
            setInterestDates(dates);
            setDueDate(nextDueDate);
            setAdjustingDates(false);
          }}
          onCancel={() => setAdjustingDates(false)}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' }, content: { padding: 18, paddingBottom: 36 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, muted: { color: '#64748b', marginTop: 12 }, back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 14, marginBottom: 8 }, backText: { color: '#15803d', fontWeight: '700', fontSize: 15 }, title: { fontSize: 25, fontWeight: '800', color: '#0f172a', marginBottom: 6 }, subtitle: { fontSize: 14, color: '#64748b', marginBottom: 18 }, fundCard: { backgroundColor: '#166534', borderRadius: 16, padding: 18, marginBottom: 16 }, fundLabel: { color: '#dcfce7', fontSize: 13 }, fundValue: { color: '#fff', fontSize: 25, fontWeight: '800', marginTop: 5 }, memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 15, marginBottom: 10 }, memberCopy: { flex: 1 }, memberName: { fontSize: 16, color: '#0f172a', fontWeight: '700' }, memberNumber: { fontSize: 12, color: '#64748b', marginTop: 4 }, maxCopy: { alignItems: 'flex-end', marginRight: 10 }, maxLabel: { fontSize: 11, color: '#64748b' }, maxValue: { fontSize: 15, color: '#15803d', fontWeight: '800', marginTop: 3 }, chevron: { color: '#94a3b8', fontSize: 28, marginLeft: 3 }, empty: { color: '#64748b', padding: 20, textAlign: 'center' }, balanceCard: { backgroundColor: '#fff', borderRadius: 15, padding: 16, marginTop: 12, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' }, sectionTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800', marginTop: 16, marginBottom: 9 }, balanceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }, balanceLabel: { color: '#64748b', fontSize: 13 }, balanceValue: { color: '#0f172a', fontSize: 14, fontWeight: '700' }, amountInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 15, backgroundColor: '#fff', fontSize: 18, color: '#0f172a' }, termRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, marginTop: 14 }, termLabel: { color: '#166534', fontWeight: '700' }, termValue: { color: '#166534', fontWeight: '800' }, datesCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' }, dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }, dateLabel: { color: '#64748b', fontSize: 12 }, dateValue: { color: '#0f172a', fontWeight: '700', marginTop: 4 }, dateNote: { color: '#64748b', fontSize: 11, textAlign: 'right' }, adjustButton: { alignSelf: 'flex-end', paddingVertical: 13, paddingHorizontal: 3 }, adjustText: { color: '#15803d', fontWeight: '800' }, dueRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 13, borderTopWidth: 1, borderTopColor: '#e2e8f0' }, dueLabel: { color: '#0f172a', fontWeight: '800' }, dueValue: { color: '#b91c1c', fontWeight: '800' }, radioGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 3 }, radioOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 10, paddingHorizontal: 13 }, radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center', marginRight: 7 }, radioOuterSelected: { borderColor: '#15803d' }, radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#15803d' }, radioText: { color: '#0f172a', fontWeight: '600' }, previewCard: { backgroundColor: '#ecfdf5', borderRadius: 14, padding: 16, marginTop: 20, borderWidth: 1, borderColor: '#bbf7d0' }, previewTitle: { color: '#166534', fontWeight: '800', fontSize: 13 }, previewAmount: { color: '#14532d', fontWeight: '900', fontSize: 25, marginTop: 5 }, previewNote: { color: '#166534', fontSize: 12, marginTop: 4 }, submitButton: { backgroundColor: '#15803d', borderRadius: 13, padding: 16, alignItems: 'center', marginTop: 22 }, submitText: { color: '#fff', fontWeight: '800', fontSize: 15 }, disabled: { opacity: 0.6 }, warning: { color: '#b91c1c', fontWeight: '700' },
});
