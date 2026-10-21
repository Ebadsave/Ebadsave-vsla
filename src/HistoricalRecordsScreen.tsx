import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
  getHistoricalFinancialSummary,
  getHistoricalFinancialTransactions,
  getMembersByGroupId,
  getVSLASetupRules,
  recordHistoricalFinancialTransaction,
  type HistoricalFinancialTransactionRecord,
  type HistoricalFinancialType,
} from '../database/database';

type Props = NativeStackScreenProps<RootStackParamList, 'HistoricalRecords'>;

type MemberOption = {
  id: number;
  full_name: string;
  member_number: string;
  status?: string;
};

type Summary = {
  records: number;
  savings: number;
  loanDisbursements: number;
  loanRepayments: number;
  recordedHistoricalInterest: number;
};

const blankSummary: Summary = {
  records: 0,
  savings: 0,
  loanDisbursements: 0,
  loanRepayments: 0,
  recordedHistoricalInterest: 0,
};

const localDateString = (): string => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const amountValue = (value: string): number => {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number): string => `UGX ${Math.round(Number(value) || 0).toLocaleString()}`;

const typeLabel = (type: HistoricalFinancialType): string => {
  if (type === 'savings') return 'Savings';
  if (type === 'loan_disbursement') return 'Loan disbursement';
  return 'Loan repayment';
};

export default function HistoricalRecordsScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupNumber, setGroupNumber] = useState('');
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [memberPickerVisible, setMemberPickerVisible] = useState(false);
  const [transactionType, setTransactionType] = useState<HistoricalFinancialType>('savings');
  const [transactionDate, setTransactionDate] = useState(localDateString());
  const [amount, setAmount] = useState('');
  const [shareCount, setShareCount] = useState('1');
  const [shareValue, setShareValue] = useState('1000');
  const [loanDueDate, setLoanDueDate] = useState('');
  const [historicalInterest, setHistoricalInterest] = useState('0');
  const [sourceReference, setSourceReference] = useState('');
  const [sourceNotes, setSourceNotes] = useState('');
  const [records, setRecords] = useState<HistoricalFinancialTransactionRecord[]>([]);
  const [summary, setSummary] = useState<Summary>(blankSummary);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [group, loadedMembers, loadedRecords, loadedSummary, rules] = await Promise.all([
        getGroupById(groupId),
        getMembersByGroupId(groupId),
        getHistoricalFinancialTransactions(groupId, 100),
        getHistoricalFinancialSummary(groupId),
        getVSLASetupRules(groupId),
      ]);
      if (!group) throw new Error('The selected group could not be found.');
      setGroupName(group.group_name || '');
      setGroupNumber(`KYA ${group.group_number}`);
      const availableMembers = (loadedMembers as MemberOption[]).slice().sort((a, b) =>
        String(a.full_name).localeCompare(String(b.full_name)),
      );
      setMembers(availableMembers);
      setSelectedMemberId((current) =>
        current && availableMembers.some((member) => member.id === current)
          ? current
          : availableMembers[0]?.id ?? null,
      );
      setRecords(loadedRecords);
      setSummary(loadedSummary);
      if (rules?.share_value != null) setShareValue(String(rules.share_value));
    } catch (error) {
      Alert.alert('Unable to load historical records', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const calculatedSavingsAmount = useMemo(
    () => Math.max(0, amountValue(shareCount) * amountValue(shareValue)),
    [shareCount, shareValue],
  );

  const formAmount = transactionType === 'savings' ? calculatedSavingsAmount : amountValue(amount);

  const clearAfterSave = () => {
    setAmount('');
    setSourceReference('');
    setSourceNotes('');
    setLoanDueDate('');
    setHistoricalInterest('0');
    if (transactionType === 'savings') setShareCount('1');
  };

  const handleSave = async () => {
    if (!selectedMemberId) {
      Alert.alert('Select a member', 'Choose the member whose physical record you are entering.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD, for example 2025-04-17.');
      return;
    }
    if (formAmount <= 0) {
      Alert.alert('Invalid amount', transactionType === 'savings'
        ? 'Enter a whole share count and the share value for that date.'
        : 'Enter an amount greater than zero.');
      return;
    }
    if (!sourceReference.trim()) {
      Alert.alert('Physical-book reference required', 'Enter a unique reference for this exact line, such as M03-PB-04-LINE-02. The same reference cannot be imported twice into this group.');
      return;
    }

    try {
      setSaving(true);
      await recordHistoricalFinancialTransaction(groupId, {
        member_id: selectedMemberId,
        historical_type: transactionType,
        amount: formAmount,
        transaction_date: transactionDate.trim(),
        source_reference: sourceReference.trim(),
        source_notes: sourceNotes.trim(),
        share_count: transactionType === 'savings' ? Number(shareCount) : null,
        share_value: transactionType === 'savings' ? Number(shareValue) : null,
        loan_due_date: transactionType === 'loan_disbursement' ? loanDueDate.trim() || null : null,
        historical_interest: transactionType === 'loan_disbursement' ? amountValue(historicalInterest) : 0,
      });
      clearAfterSave();
      await loadData();
      Alert.alert('Historical entry imported', `${typeLabel(transactionType)} for ${selectedMember?.full_name ?? 'the selected member'} has been added to the group ledger. Today's share limits and loan rules were not applied to this older entry.`);
    } catch (error) {
      Alert.alert('Could not import entry', error instanceof Error ? error.message : 'Please check the information and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !groupName) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#15803d" />
        <Text style={styles.loadingText}>Loading historical records…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.eyebrow}>EXISTING VSLA GROUP • HISTORICAL IMPORT</Text>
            <Text style={styles.title}>{groupName}</Text>
            <Text style={styles.groupNumber}>{groupNumber}</Text>
            <Text style={styles.subtitle}>Enter the actual dated entries from each member’s physical passbook and the group loan book. Every entry is saved to this group’s ledger.</Text>
          </View>

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Before importing</Text>
            <Text style={styles.noticeText}>Use one unique source reference for each line in the physical book. Do not import the same transactions that are already in Ebadsave. For each member and transaction type, choose one source of truth: import the complete historical list, or rely on a verified opening balance. Do not combine an opening total with only part of the history it already covers; once historical entries are imported, the app prioritizes the transaction history instead of that opening total. Imported entries are not constrained by today’s minimum or maximum shares rule.</Text>
          </View>

          <Text style={styles.sectionTitle}>Imported history totals</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Records imported</Text><Text style={styles.summaryValue}>{summary.records.toLocaleString()}</Text></View>
            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Savings imported</Text><Text style={styles.summaryValue}>{money(summary.savings)}</Text></View>
            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Loans issued</Text><Text style={styles.summaryValue}>{money(summary.loanDisbursements)}</Text></View>
            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Repayments</Text><Text style={styles.summaryValue}>{money(summary.loanRepayments)}</Text></View>
          </View>
          {summary.recordedHistoricalInterest > 0 ? (
            <Text style={styles.interestNote}>Historical loan interest recorded: {money(summary.recordedHistoricalInterest)}</Text>
          ) : null}

          <Text style={styles.sectionTitle}>Add a historical entry</Text>
          <View style={styles.formCard}>
            <Text style={styles.label}>Transaction type</Text>
            <View style={styles.typeRow}>
              {([
                ['savings', 'Savings'],
                ['loan_disbursement', 'Loan issued'],
                ['loan_repayment', 'Repayment'],
              ] as Array<[HistoricalFinancialType, string]>).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.typeButton, transactionType === value && styles.typeButtonActive]}
                  onPress={() => setTransactionType(value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.typeButtonText, transactionType === value && styles.typeButtonTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Member</Text>
            <TouchableOpacity style={styles.memberSelect} onPress={() => setMemberPickerVisible(true)} activeOpacity={0.8}>
              <View style={styles.memberSelectText}>
                <Text style={styles.memberSelectName}>{selectedMember?.full_name ?? 'Select a member'}</Text>
                <Text style={styles.memberSelectNumber}>{selectedMember?.member_number ?? (members.length ? '' : 'No members registered')}</Text>
              </View>
              <Text style={styles.selectChevron}>Choose ▾</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Date recorded in the physical book (YYYY-MM-DD)</Text>
            <TextInput value={transactionDate} onChangeText={setTransactionDate} placeholder="2025-04-17" autoCapitalize="none" style={styles.input} />

            {transactionType === 'savings' ? (
              <>
                <View style={styles.twoColumns}>
                  <View style={styles.column}>
                    <Text style={styles.label}>Number of shares</Text>
                    <TextInput value={shareCount} onChangeText={setShareCount} keyboardType="number-pad" placeholder="e.g. 3" style={styles.input} />
                  </View>
                  <View style={styles.column}>
                    <Text style={styles.label}>Share value (UGX)</Text>
                    <TextInput value={shareValue} onChangeText={setShareValue} keyboardType="numeric" placeholder="Value on that date" style={styles.input} />
                  </View>
                </View>
                <View style={styles.calculatedAmountBox}>
                  <Text style={styles.calculatedAmountLabel}>Savings amount recorded to the ledger</Text>
                  <Text style={styles.calculatedAmount}>{money(calculatedSavingsAmount)}</Text>
                  <Text style={styles.smallHelp}>Calculated as shares × the share value used on that historical date.</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>Amount (UGX)</Text>
                <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="Enter amount from the book" style={styles.input} />
                {transactionType === 'loan_disbursement' ? (
                  <>
                    <Text style={styles.label}>Loan due date (YYYY-MM-DD, if recorded)</Text>
                    <TextInput value={loanDueDate} onChangeText={setLoanDueDate} placeholder="2025-10-17" autoCapitalize="none" style={styles.input} />
                    <Text style={styles.label}>Total historical interest payable for this loan (UGX)</Text>
                    <TextInput value={historicalInterest} onChangeText={setHistoricalInterest} keyboardType="numeric" placeholder="0 if not recorded" style={styles.input} />
                    <Text style={styles.smallHelp}>Use the total interest written in the loan book for this loan. If it is unavailable, enter 0 and verify the outstanding balance against the book before share-out.</Text>
                  </>
                ) : null}
              </>
            )}

            <Text style={styles.label}>Unique physical-book reference</Text>
            <TextInput value={sourceReference} onChangeText={setSourceReference} placeholder="e.g. M03-PB-04-LINE-02" autoCapitalize="characters" style={styles.input} />
            <Text style={styles.smallHelp}>Reference must identify this individual line and must be unique within this group.</Text>

            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput value={sourceNotes} onChangeText={setSourceNotes} placeholder="Book name, page, or verification note" style={[styles.input, styles.notesInput]} multiline />

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving || !selectedMemberId}
              style={[styles.saveButton, (saving || !selectedMemberId) && styles.disabledButton]}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Import Historical Entry</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>Recent imported entries</Text>
            <TouchableOpacity onPress={() => void loadData()} style={styles.refreshButton}><Text style={styles.refreshText}>Refresh</Text></TouchableOpacity>
          </View>
          {records.length === 0 ? (
            <View style={styles.emptyBox}><Text style={styles.emptyTitle}>No historical entries imported yet</Text><Text style={styles.emptyText}>Start with the oldest entries in the passbooks, then work forward by date.</Text></View>
          ) : records.map((record) => (
            <View key={record.id} style={styles.historyCard}>
              <View style={styles.historyTopRow}>
                <Text style={styles.historyType}>{typeLabel(record.historical_type)}</Text>
                <Text style={styles.historyAmount}>{money(record.amount)}</Text>
              </View>
              <Text style={styles.historyMember}>{record.member_name} · {record.member_number}</Text>
              <Text style={styles.historyMeta}>Date: {record.transaction_date} · Ref: {record.source_reference}</Text>
              {record.historical_type === 'savings' ? (
                <Text style={styles.historyMeta}>{record.share_count} shares × {money(Number(record.share_value ?? 0))}</Text>
              ) : null}
              {record.historical_type === 'loan_disbursement' ? (
                <Text style={styles.historyMeta}>Due: {record.loan_due_date || 'Not recorded'} · Interest: {money(record.historical_interest)}</Text>
              ) : null}
              {record.source_notes ? <Text style={styles.historyNotes}>{record.source_notes}</Text> : null}
            </View>
          ))}
          {records.length >= 100 ? <Text style={styles.smallHelp}>Showing the latest 100 imported records. Totals above include all imported entries.</Text> : null}

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={memberPickerVisible} transparent animationType="fade" onRequestClose={() => setMemberPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.memberPickerCard}>
            <Text style={styles.pickerTitle}>Choose member</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.memberList}>
              {members.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={[styles.memberOption, selectedMemberId === member.id && styles.memberOptionActive]}
                  onPress={() => { setSelectedMemberId(member.id); setMemberPickerVisible(false); }}
                >
                  <Text style={styles.memberOptionName}>{member.full_name}</Text>
                  <Text style={styles.memberOptionNumber}>{member.member_number}{member.status && member.status.toLowerCase() !== 'active' ? ` · ${member.status}` : ''}</Text>
                </TouchableOpacity>
              ))}
              {members.length === 0 ? <Text style={styles.emptyText}>Register group members before importing their records.</Text> : null}
            </ScrollView>
            <TouchableOpacity onPress={() => setMemberPickerVisible(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f7f5' },
  loadingText: { marginTop: 10, color: '#526052' },
  content: { padding: 16, paddingBottom: 40 },
  header: { backgroundColor: '#166534', borderRadius: 16, padding: 18, marginBottom: 14 },
  eyebrow: { color: '#dcfce7', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 8 },
  groupNumber: { color: '#bbf7d0', fontSize: 13, fontWeight: '800', marginTop: 3 },
  subtitle: { color: '#f0fdf4', marginTop: 10, lineHeight: 20, fontSize: 13 },
  notice: { backgroundColor: '#fffbeb', borderColor: '#fcd34d', borderWidth: 1, borderRadius: 12, padding: 13, marginBottom: 18 },
  noticeTitle: { color: '#92400e', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  noticeText: { color: '#78350f', fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: '#111827', fontSize: 17, fontWeight: '800', marginBottom: 10 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 },
  summaryCard: { width: '48.5%', backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  summaryLabel: { color: '#64748b', fontSize: 11, fontWeight: '600' },
  summaryValue: { color: '#166534', fontSize: 16, fontWeight: '800', marginTop: 5 },
  interestNote: { color: '#475569', fontSize: 12, marginBottom: 18 },
  formCard: { backgroundColor: '#fff', borderRadius: 14, padding: 15, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 22 },
  label: { color: '#334155', fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  typeButton: { flex: 1, minWidth: '28%', paddingVertical: 10, paddingHorizontal: 5, borderRadius: 9, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', backgroundColor: '#fff' },
  typeButtonActive: { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  typeButtonText: { color: '#475569', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  typeButtonTextActive: { color: '#166534' },
  memberSelect: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#fff' },
  memberSelectText: { flex: 1 },
  memberSelectName: { color: '#111827', fontSize: 14, fontWeight: '700' },
  memberSelectNumber: { color: '#64748b', fontSize: 11, marginTop: 3 },
  selectChevron: { color: '#15803d', fontSize: 12, fontWeight: '800', marginLeft: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, minHeight: 44, paddingHorizontal: 11, paddingVertical: 9, color: '#111827', fontSize: 14 },
  twoColumns: { flexDirection: 'row', gap: 10 },
  column: { flex: 1 },
  calculatedAmountBox: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 12 },
  calculatedAmountLabel: { color: '#166534', fontSize: 11, fontWeight: '700' },
  calculatedAmount: { color: '#14532d', fontSize: 21, fontWeight: '900', marginTop: 4 },
  smallHelp: { color: '#64748b', fontSize: 11, lineHeight: 16, marginTop: 6 },
  notesInput: { minHeight: 64, textAlignVertical: 'top' },
  saveButton: { backgroundColor: '#15803d', borderRadius: 10, paddingVertical: 14, marginTop: 18, alignItems: 'center' },
  disabledButton: { opacity: 0.55 },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: '#dcfce7', marginBottom: 10 },
  refreshText: { color: '#166534', fontSize: 12, fontWeight: '800' },
  historyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 9, borderWidth: 1, borderColor: '#e5e7eb' },
  historyTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  historyType: { color: '#166534', fontSize: 13, fontWeight: '800', flex: 1 },
  historyAmount: { color: '#111827', fontSize: 15, fontWeight: '900' },
  historyMember: { color: '#1f2937', fontSize: 12, fontWeight: '700', marginTop: 6 },
  historyMeta: { color: '#64748b', fontSize: 11, lineHeight: 16, marginTop: 3 },
  historyNotes: { color: '#475569', fontSize: 11, marginTop: 5, fontStyle: 'italic' },
  emptyBox: { backgroundColor: '#fff', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#e5e7eb' },
  emptyTitle: { color: '#334155', fontSize: 13, fontWeight: '800' },
  emptyText: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 5 },
  backButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  backButtonText: { color: '#334155', fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', padding: 20 },
  memberPickerCard: { backgroundColor: '#fff', borderRadius: 15, padding: 16, maxHeight: '82%' },
  pickerTitle: { color: '#14532d', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  memberList: { flexGrow: 0, flexShrink: 1 },
  memberOption: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 9, padding: 12, marginTop: 7 },
  memberOptionActive: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  memberOptionName: { color: '#111827', fontSize: 13, fontWeight: '700' },
  memberOptionNumber: { color: '#64748b', fontSize: 11, marginTop: 4 },
  cancelButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, alignItems: 'center', paddingVertical: 12, marginTop: 12 },
  cancelText: { color: '#334155', fontSize: 13, fontWeight: '700' },
});
