import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import {
  getGroupById,
  getMemberLoanBalance,
  getMemberLoanDueDate,
  getMemberShareOutBasis,
  getMembersByGroupId,
  getVSLASetupRules,
  type VSLASetupRuleRecord,
} from '../database/database';

type Props = NativeStackScreenProps<RootStackParamList, 'ShareOutCalculation'>;

type ShareOutRow = {
  memberId: number;
  memberName: string;
  memberNumber: string;
  savings: number;
  shares: number;
  sharesEstimated: boolean;
  loanBalance: number;
  loanDueDate: string | null;
  basis: number;
  payout?: number;
};

type GroupInfo = { group_name: string; group_number: string | number; currency?: string };

const numberFrom = (value: string): number => {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (currency: string, value: number): string =>
  `${currency || 'UGX'} ${Math.round(Number(value) || 0).toLocaleString()}`;

export default function ShareOutCalculationScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [rules, setRules] = useState<VSLASetupRuleRecord | null>(null);
  const [rows, setRows] = useState<ShareOutRow[]>([]);
  const [distributableAmount, setDistributableAmount] = useState('');
  const [preview, setPreview] = useState<ShareOutRow[] | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedGroup, members, loadedRules] = await Promise.all([
        getGroupById(groupId),
        getMembersByGroupId(groupId),
        getVSLASetupRules(groupId),
      ]);
      if (!loadedGroup) throw new Error('The selected group could not be found.');
      setGroup(loadedGroup as GroupInfo);
      setRules(loadedRules);

      const memberRows = await Promise.all((members as Array<{ id: number; full_name: string; member_number: string }>).map(async (member) => {
        const [basis, loan, dueDate] = await Promise.all([
          getMemberShareOutBasis(groupId, member.id),
          getMemberLoanBalance(groupId, member.id),
          getMemberLoanDueDate(groupId, member.id),
        ]);
        return {
          memberId: member.id,
          memberName: member.full_name,
          memberNumber: member.member_number,
          savings: basis.savings,
          shares: basis.shares,
          sharesEstimated: basis.sharesEstimated,
          loanBalance: loan.balance,
          loanDueDate: dueDate,
          basis: 0,
        } as ShareOutRow;
      }));
      setRows(memberRows);
      setPreview(null);
    } catch (error) {
      Alert.alert('Unable to load share-out data', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  const methodology = rules?.share_out_methodology === 'share_based' ? 'share_based' : 'savings_based';
  const basisLabel = methodology === 'share_based' ? 'Shares' : 'Recorded savings';
  const totalBasis = useMemo(
    () => rows.reduce((sum, row) => sum + (methodology === 'share_based' ? row.shares : row.savings), 0),
    [rows, methodology],
  );
  const currency = group?.currency || 'UGX';
  const totalLoansOutstanding = useMemo(() => rows.reduce((sum, row) => sum + row.loanBalance, 0), [rows]);
  const canCalculate = Number(rules?.share_out_enabled ?? 0) === 1;

  const calculatePreview = () => {
    if (!canCalculate) {
      Alert.alert('Share-out is disabled', 'Enable share-out in Setup Rules before calculating a cycle distribution.');
      return;
    }
    const amount = numberFrom(distributableAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Enter the distributable fund', 'Enter the amount approved for distribution after the group has reconciled its cash, loan book, expenses, assets and liabilities.');
      return;
    }
    if (!rows.length) {
      Alert.alert('No members', 'Register the group members before calculating share-out.');
      return;
    }
    const wholeAmount = Math.round(amount);
    if (Math.abs(amount - wholeAmount) > 0.0001) {
      Alert.alert('Whole-unit amount required', `Enter the ${currency} amount as a whole number. The preview uses ${money(currency, wholeAmount)}.`);
    }
    const weighted = rows.map((row) => ({
      ...row,
      basis: methodology === 'share_based' ? row.shares : row.savings,
    }));
    const basisTotal = weighted.reduce((sum, row) => sum + row.basis, 0);
    if (basisTotal <= 0) {
      Alert.alert('No share-out basis', methodology === 'share_based'
        ? 'No historical or estimated member shares are available. Import the share counts or enter verified opening shares first.'
        : 'No recorded savings are available. Import historical savings or enter verified opening savings first.');
      return;
    }

    const withRemainders = weighted.map((row) => {
      const raw = wholeAmount * row.basis / basisTotal;
      const basePayout = Math.floor(raw);
      return { ...row, payout: basePayout, fractionalRemainder: raw - basePayout };
    });
    let remaining = wholeAmount - withRemainders.reduce((sum, row) => sum + (row.payout ?? 0), 0);
    const order = withRemainders
      .map((row, index) => ({ index, remainder: row.fractionalRemainder, id: row.memberId }))
      .sort((a, b) => b.remainder - a.remainder || a.id - b.id);
    for (let i = 0; i < remaining && i < order.length; i += 1) {
      const index = order[i].index;
      withRemainders[index].payout = (withRemainders[index].payout ?? 0) + 1;
    }
    remaining -= Math.min(remaining, order.length);
    if (remaining > 0) {
      // Defensive fallback for floating-point edge cases; maintain exact pool total.
      withRemainders[0].payout = (withRemainders[0].payout ?? 0) + remaining;
    }
    setPreview(withRemainders.map(({ fractionalRemainder: _fractional, ...row }) => row));
  };

  const clearPreviewOnAmountChange = (value: string) => {
    setDistributableAmount(value);
    setPreview(null);
  };

  const shownRows = preview ?? rows.map((row) => ({ ...row, basis: methodology === 'share_based' ? row.shares : row.savings }));
  const totalPayout = preview?.reduce((sum, row) => sum + Number(row.payout ?? 0), 0) ?? 0;

  if (loading && !group) {
    return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#15803d" /><Text style={styles.loadingText}>Loading share-out records…</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.eyebrow}>END-OF-CYCLE SHARE-OUT</Text>
            <Text style={styles.title}>{group?.group_name ?? 'Selected group'}</Text>
            <Text style={styles.groupNumber}>KYA {group?.group_number ?? ''}</Text>
            <Text style={styles.subtitle}>Preview each member’s allocation using this group’s saved share-out methodology and reconciled member history.</Text>
          </View>

          <View style={styles.methodCard}>
            <Text style={styles.methodLabel}>Configured methodology</Text>
            <Text style={styles.methodName}>{methodology === 'share_based' ? 'Share-based' : 'Savings-based'}</Text>
            <Text style={styles.methodHelp}>{methodology === 'share_based'
              ? 'Allocation is proportional to recorded or estimated whole shares.'
              : 'Allocation is proportional to each member’s recorded savings.'}</Text>
            {!canCalculate ? <Text style={styles.disabledNotice}>Share-out is currently disabled in Setup Rules.</Text> : null}
          </View>

          <View style={styles.warning}>
            <Text style={styles.warningTitle}>Reconcile before final approval</Text>
            <Text style={styles.warningText}>Enter only the amount the group has approved for distribution after checking physical books, historical imports, group cash, outstanding member loans, expenses and liabilities. Member loan balances and due dates are displayed below for reconciliation but are not automatically deducted from these preview allocations. This preview does not record payments or close the cycle.</Text>
          </View>

          <View style={styles.poolCard}>
            <Text style={styles.label}>Total distributable fund ({currency})</Text>
            <TextInput
              value={distributableAmount}
              onChangeText={clearPreviewOnAmountChange}
              keyboardType="numeric"
              placeholder="Enter verified amount, e.g. 2500000"
              style={styles.input}
            />
            <TouchableOpacity disabled={!canCalculate || loading} onPress={calculatePreview} style={[styles.calculateButton, (!canCalculate || loading) && styles.disabledButton]}>
              <Text style={styles.calculateText}>Calculate Share-out Preview</Text>
            </TouchableOpacity>
            {preview ? (
              <View style={styles.poolResult}>
                <Text style={styles.resultLabel}>Total allocation preview</Text>
                <Text style={styles.resultAmount}>{money(currency, totalPayout)}</Text>
                <Text style={styles.smallText}>Expected pool: {money(currency, Math.round(numberFrom(distributableAmount)))} · Basis total: {totalBasis.toLocaleString()}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.memberHeader}>
            <Text style={styles.sectionTitle}>Member reconciliation and allocation</Text>
            <TouchableOpacity style={styles.refreshButton} onPress={() => void loadData()}><Text style={styles.refreshText}>Refresh</Text></TouchableOpacity>
          </View>
          {shownRows.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>No group members were found.</Text></View>
          ) : shownRows.map((row) => (
            <View key={row.memberId} style={styles.memberCard}>
              <View style={styles.memberTop}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{row.memberName}</Text>
                  <Text style={styles.memberNumber}>{row.memberNumber}</Text>
                </View>
                {preview ? <Text style={styles.payout}>{money(currency, Number(row.payout ?? 0))}</Text> : null}
              </View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Total recorded savings</Text><Text style={styles.detailValue}>{money(currency, row.savings)}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Share count</Text><Text style={styles.detailValue}>{Number(row.shares).toLocaleString()}{row.sharesEstimated ? ' (estimated for app-entered savings)' : ''}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>{basisLabel} used</Text><Text style={styles.detailValue}>{methodology === 'share_based' ? Number(row.basis).toLocaleString() : money(currency, row.basis)}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Outstanding loan balance</Text><Text style={[styles.detailValue, row.loanBalance > 0 && styles.loanBalance]}>{money(currency, row.loanBalance)}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Loan due date</Text><Text style={styles.detailValue}>{row.loanDueDate || 'Not recorded'}</Text></View>
            </View>
          ))}

          {preview ? (
            <View style={styles.confirmNotice}>
              <Text style={styles.confirmTitle}>Preview only — no payouts recorded</Text>
              <Text style={styles.confirmText}>Check the allocations against the passbooks and loan book. The current calculated total equals the entered distributable pool; final approval and payment recording are not performed by this screen.</Text>
            </View>
          ) : null}

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>Back</Text></TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f7f5' },
  loadingText: { color: '#64748b', marginTop: 10 },
  content: { padding: 16, paddingBottom: 38 },
  header: { backgroundColor: '#166534', padding: 18, borderRadius: 16, marginBottom: 14 },
  eyebrow: { color: '#dcfce7', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 8 },
  groupNumber: { color: '#bbf7d0', fontSize: 13, fontWeight: '800', marginTop: 3 },
  subtitle: { color: '#f0fdf4', fontSize: 13, lineHeight: 19, marginTop: 9 },
  methodCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#d1fae5', padding: 14, marginBottom: 12 },
  methodLabel: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  methodName: { color: '#166534', fontSize: 18, fontWeight: '900', marginTop: 4 },
  methodHelp: { color: '#475569', fontSize: 12, lineHeight: 17, marginTop: 5 },
  disabledNotice: { color: '#9a3412', backgroundColor: '#fff7ed', padding: 8, borderRadius: 7, marginTop: 8, fontSize: 12, fontWeight: '700' },
  warning: { backgroundColor: '#fffbeb', borderColor: '#fcd34d', borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 18 },
  warningTitle: { color: '#92400e', fontSize: 13, fontWeight: '900', marginBottom: 4 },
  warningText: { color: '#78350f', fontSize: 11, lineHeight: 17 },
  poolCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 15, marginBottom: 20 },
  label: { color: '#334155', fontSize: 12, fontWeight: '800', marginBottom: 7 },
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, color: '#111827', fontSize: 14 },
  calculateButton: { backgroundColor: '#15803d', borderRadius: 10, alignItems: 'center', paddingVertical: 14, marginTop: 12 },
  calculateText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  disabledButton: { opacity: 0.5 },
  poolResult: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 10, padding: 12, marginTop: 12 },
  resultLabel: { color: '#166534', fontSize: 11, fontWeight: '700' },
  resultAmount: { color: '#14532d', fontSize: 23, fontWeight: '900', marginTop: 4 },
  smallText: { color: '#64748b', fontSize: 11, marginTop: 5 },
  memberHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { color: '#111827', fontSize: 16, fontWeight: '900', flex: 1, marginBottom: 10 },
  refreshButton: { backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 10 },
  refreshText: { color: '#166534', fontSize: 11, fontWeight: '800' },
  memberCard: { backgroundColor: '#fff', borderRadius: 12, padding: 13, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10 },
  memberTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 7 },
  memberInfo: { flex: 1 },
  memberName: { color: '#111827', fontSize: 14, fontWeight: '900' },
  memberNumber: { color: '#64748b', fontSize: 11, marginTop: 3 },
  payout: { color: '#166534', fontSize: 17, fontWeight: '900', maxWidth: 145, textAlign: 'right' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 7, marginTop: 6 },
  detailLabel: { color: '#64748b', fontSize: 11, flex: 1 },
  detailValue: { color: '#334155', fontSize: 11, fontWeight: '700', textAlign: 'right', flex: 1.2 },
  loanBalance: { color: '#b45309' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', padding: 15 },
  emptyText: { color: '#64748b', fontSize: 12 },
  confirmNotice: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 12, padding: 13, marginTop: 10 },
  confirmTitle: { color: '#1d4ed8', fontSize: 13, fontWeight: '900' },
  confirmText: { color: '#1e40af', fontSize: 11, lineHeight: 17, marginTop: 4 },
  backButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, alignItems: 'center', paddingVertical: 13, marginTop: 13 },
  backText: { color: '#334155', fontSize: 14, fontWeight: '800' },
});
