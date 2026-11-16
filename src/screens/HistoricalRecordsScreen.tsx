import React, { useCallback, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import {
  canManageHistoricalEntries, editHistoricalEntry, getGroupById,
  getHistoricalExtraEntries, getHistoricalFinancialSummary, getHistoricalFinancialTransactions,
  getHistoricalLoanBalanceEntries, getMembersByGroupId, getVSLASetupRules, getGroupOnboardingLock,
  recordHistoricalExtraEntry, recordHistoricalFinancialTransaction, recordHistoricalLoanBalance,
  editHistoricalLoanBalanceEntry, softDeleteHistoricalLoanBalanceEntry, softDeleteHistoricalEntry,
  type HistoricalExtraRecord, type HistoricalFinancialTransactionRecord,
  type HistoricalLoanBalanceRecord,
} from '../database/database';

type Props = NativeStackScreenProps<RootStackParamList, 'HistoricalRecords'>;
type MemberOption = { id: number; full_name: string; member_number: string; photo_uri: string | null; status?: string; };
type EntryType = 'savings' | 'loan_balance' | 'loan_disbursement' | 'fine' | 'insurance' | 'external_loan';
type Entry = {
  id: number; kind: 'standard' | 'extra' | 'snapshot'; type: EntryType; amount: number; date: string;
  member_id: number | null; member_name: string; member_number: string; source_reference: string;
  source_notes: string; share_count?: number | null; share_value?: number | null;
  loan_due_date?: string | null; historical_interest?: number; fine_reason?: string;
  lender_name?: string; interest_amount?: number; due_date?: string | null; edited_at?: string | null;
};
type Summary = { records: number; savings: number; fines: number; insurance: number; externalLoans: number; loanDisbursements: number; loanBalances: number; loanRepayments: number; };
const initialSummary: Summary = { records: 0, savings: 0, fines: 0, insurance: 0, externalLoans: 0, loanDisbursements: 0, loanBalances: 0, loanRepayments: 0 };
const amountValue = (v: string) => { const n = Number(v.replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0; };
const money = (v: number) => `UGX ${Math.round(Number(v) || 0).toLocaleString()}`;
const displayDate = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : (iso || ''); };
const toIsoDate = (display: string) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(display.trim());
  if (!m) return '';
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === iso ? iso : '';
};
const labels: Record<EntryType, { title: string; icon: string; color: string; bg: string }> = {
  savings: { title: 'Savings', icon: '🪙', color: '#166534', bg: '#dcfce7' },
  loan_balance: { title: 'Previous Loan', icon: '🤲', color: '#9a3412', bg: '#ffedd5' },
  loan_disbursement: { title: 'Loan Issued', icon: '💸', color: '#92400e', bg: '#fef3c7' },
  fine: { title: 'Fine', icon: '⚠️', color: '#b91c1c', bg: '#fee2e2' },
  insurance: { title: 'Insurance', icon: '🛡️', color: '#1d4ed8', bg: '#dbeafe' },
  external_loan: { title: 'External Loan', icon: '🏦', color: '#6b21a8', bg: '#f3e8ff' },
};
const typeFromStandard = (r: HistoricalFinancialTransactionRecord): EntryType =>
  r.historical_type === 'savings' ? 'savings' :
  r.historical_type === 'loan_disbursement' ? 'loan_disbursement' : 'loan_balance';
const labelFor = (type: EntryType) => labels[type].title;

export default function HistoricalRecordsScreen({ route, navigation }: Props) {
  const { groupId, executiveMemberId } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupNumber, setGroupNumber] = useState('');
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [memberPickerVisible, setMemberPickerVisible] = useState(false);
  const [memberListTab, setMemberListTab] = useState<'current' | 'finished'>('current');
  const [canAdmin, setCanAdmin] = useState(false);
  const [historicalLocked, setHistoricalLocked] = useState(false);
  const [type, setType] = useState<EntryType>('savings');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [shareCount, setShareCount] = useState('1');
  const [shareValue, setShareValue] = useState('1000');
  const [previousBalance, setPreviousBalance] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [interest, setInterest] = useState('0');
  const [fineReason, setFineReason] = useState<'late' | 'absent' | 'other'>('late');
  const [lenderName, setLenderName] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [records, setRecords] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [recordSearch, setRecordSearch] = useState('');
  const [passcodeVisible, setPasscodeVisible] = useState(false);
  const [passcodeEntry, setPasscodeEntry] = useState('');
  const [pendingEdit, setPendingEdit] = useState<Entry | null>(null);
  const [passcodeSetup, setPasscodeSetup] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [group, loadedMembers, oldRows, extraRows, snapshotRows, baseSummary, rules, admin, onboardingLock] = await Promise.all([
        getGroupById(groupId),
        getMembersByGroupId(groupId),
        getHistoricalFinancialTransactions(groupId, 10000),
        getHistoricalExtraEntries(groupId, 10000),
        getHistoricalLoanBalanceEntries(groupId, 10000),
        getHistoricalFinancialSummary(groupId),
        getVSLASetupRules(groupId),
        executiveMemberId ? canManageHistoricalEntries(groupId, executiveMemberId) : Promise.resolve(false),
        getGroupOnboardingLock(groupId),
      ]);
      setHistoricalLocked(onboardingLock.onboarding_locked);
      if (!group) throw new Error('The selected group could not be found.');
      setGroupName(group.group_name || '');
      setGroupNumber(`KYA ${group.group_number}`);
      const memberList = (loadedMembers as MemberOption[]).slice().sort((a,b) => a.full_name.localeCompare(b.full_name));
      setMembers(memberList);
      const nextSelectedId = selectedMemberId && memberList.some(m => m.id === selectedMemberId) ? selectedMemberId : memberList[0]?.id ?? null;
      setSelectedMemberId(nextSelectedId);
      if (rules?.share_value != null) setShareValue(String(rules.share_value));
      setCanAdmin(admin);

      const standard: Entry[] = oldRows.map((r: HistoricalFinancialTransactionRecord) => ({
        id: r.id, kind: 'standard', type: typeFromStandard(r), amount: Number(r.amount), date: r.transaction_date,
        member_id: r.member_id, member_name: r.member_name, member_number: r.member_number,
        source_reference: r.source_reference, source_notes: r.source_notes, share_count: r.share_count,
        share_value: r.share_value, loan_due_date: r.loan_due_date, historical_interest: r.historical_interest,
        edited_at: (r as any).edited_at,
      }));
      const extras: Entry[] = extraRows.map((r: HistoricalExtraRecord) => ({
        id: r.id, kind: 'extra', type: r.entry_type, amount: Number(r.amount), date: r.transaction_date,
        member_id: r.member_id, member_name: r.member_name, member_number: r.member_number,
        source_reference: r.source_reference, source_notes: r.source_notes, fine_reason: r.fine_reason,
        lender_name: r.lender_name, interest_amount: Number(r.interest_amount), due_date: r.due_date, edited_at: r.edited_at,
      }));
      const snapshots: Entry[] = snapshotRows.map((r: HistoricalLoanBalanceRecord) => ({
        id: r.id, kind: 'snapshot', type: 'loan_balance', amount: Number(r.balance), date: r.transaction_date,
        member_id: r.member_id, member_name: r.member_name, member_number: r.member_number,
        source_reference: r.source_reference, source_notes: r.source_notes, edited_at: r.edited_at,
      }));
      const allRecords = [...standard, ...extras, ...snapshots].sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id);
      setRecords(allRecords);
      const latestSnapshots = new Map<number, Entry>();
      snapshots.forEach(row => {
        if (row.member_id == null) return;
        const old = latestSnapshots.get(row.member_id);
        if (!old || row.date > old.date || (row.date === old.date && row.id > old.id)) latestSnapshots.set(row.member_id, row);
      });
      setSummary({
        records: baseSummary.records + snapshots.length,
        savings: baseSummary.savings,
        fines: baseSummary.fines,
        insurance: baseSummary.insurance,
        externalLoans: baseSummary.externalLoans,
        loanDisbursements: baseSummary.loanDisbursements,
        loanBalances: Array.from(latestSnapshots.values()).reduce((sum, row) => sum + row.amount, 0),
        loanRepayments: 0,
      });
      const chosenSnapshot = nextSelectedId == null ? null : latestSnapshots.get(nextSelectedId);
      setPreviousBalance(chosenSnapshot?.amount ?? 0);
    } catch (e) {
      Alert.alert('Could not load group records', e instanceof Error ? e.message : 'Please try again.');
    } finally { setLoading(false); }
  }, [groupId, executiveMemberId, selectedMemberId]);
  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  const selectedMember = useMemo(() => members.find(m => m.id === selectedMemberId) ?? null, [members, selectedMemberId]);
  const completedHistoricalMemberIds = useMemo(() => new Set(records.filter(r => r.member_id != null).map(r => r.member_id as number)), [records]);
  const visibleMembers = useMemo(() => members.filter(member => memberListTab === 'finished'
    ? completedHistoricalMemberIds.has(member.id) : !completedHistoricalMemberIds.has(member.id)), [members, memberListTab, completedHistoricalMemberIds]);

  const selectedMemberLoanComparison = useMemo(() => {
    if (!selectedMemberId) return null;
    const memberRecords = records.filter(r => r.member_id === selectedMemberId);
    const issuedRecords = memberRecords.filter(r => r.type === 'loan_disbursement');
    const snapshots = memberRecords.filter(r => r.kind === 'snapshot').sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id);
    const totalIssued = issuedRecords.reduce((sum, r) => sum + r.amount, 0);
    const latestSnapshot = snapshots[0] ?? null;
    const latestIssue = issuedRecords.slice().sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id)[0];
    return {
      totalIssued,
      issueDate: latestIssue?.date ?? null,
      previousBalance: latestSnapshot?.amount ?? null,
      balanceDate: latestSnapshot?.date ?? null,
      amountPaid: latestSnapshot ? totalIssued - latestSnapshot.amount : null,
    };
  }, [records, selectedMemberId]);

  // A historical balance is an outstanding asset snapshot, never a new cash outflow.
  const totalIncome = summary.savings + summary.fines;
  const totalLoansOut = summary.loanDisbursements;
  const outstandingLoanAssets = summary.loanBalances;
  const totalCashInBox = totalIncome + summary.externalLoans - totalLoansOut;
  const insuranceFund = summary.insurance;
  const totalGroupAssets = totalCashInBox + outstandingLoanAssets + insuranceFund;
  const savingsAmount = amountValue(shareCount) * amountValue(shareValue);

  const filteredRecords = useMemo(() => {
    const q = recordSearch.trim().toLocaleLowerCase();
    if (!q) return records;
    return records.filter(r => [r.member_name, r.member_number, r.lender_name, r.source_reference, r.source_notes, labelFor(r.type), displayDate(r.date), String(r.amount)]
      .some(v => String(v || '').toLocaleLowerCase().includes(q)));
  }, [records, recordSearch]);

  const chooseType = (next: EntryType) => {
    setType(next);
    if (!editing) { setAmount(''); setDate(''); setDueDate(''); setInterest('0'); setLenderName(''); setReference(''); setNotes(''); }
  };
  const chooseMember = (member: MemberOption) => {
    setSelectedMemberId(member.id);
    setMemberPickerVisible(false);
    const snapshot = records.filter(r => r.kind === 'snapshot' && r.member_id === member.id)
      .sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id)[0];
    setPreviousBalance(snapshot?.amount ?? 0);
  };
  const resetForm = () => {
    setEditing(null); setAmount(''); setDate(''); setDueDate(''); setInterest('0'); setLenderName('');
    setReference(''); setNotes(''); setShareCount('1'); setFineReason('late');
  };

  const save = async () => {
    if (historicalLocked) { Alert.alert('Historical setup locked', 'The first meeting has been closed. New historical entries are no longer allowed.'); return; }
    if (type !== 'external_loan' && !selectedMemberId) { Alert.alert('Choose a member', 'Tap a member photo first.'); return; }
    const iso = toIsoDate(date);
    if (!iso) { Alert.alert('Date is not correct', 'Enter date as DD-MM-YYYY, for example 17-04-2025.'); return; }
    const dueIso = dueDate.trim() ? toIsoDate(dueDate) : '';
    if (dueDate.trim() && !dueIso) { Alert.alert('Due date is not correct', 'Enter due date as DD-MM-YYYY.'); return; }
    let saveAmount = amountValue(amount);
    if (type === 'savings' && !editing) saveAmount = savingsAmount;
    if (!Number.isFinite(saveAmount) || (type === 'loan_balance' ? saveAmount < 0 : saveAmount <= 0)) {
      Alert.alert('Enter an amount', type === 'loan_balance' ? 'The previous outstanding balance cannot be negative.' : 'The amount must be greater than zero.');
      return;
    }
    if (type === 'external_loan' && !lenderName.trim()) { Alert.alert('Lender required', 'Enter the name of the person or institution lending to the group.'); return; }
    if (editing && !canAdmin) { Alert.alert('Admin only', 'Only the group administrator can edit entries.'); return; }
    if (type !== 'external_loan') {
      const duplicate = records.some(r => r.id !== editing?.id && r.member_id === selectedMemberId && r.type === type && r.date === iso);
      if (duplicate) { Alert.alert('Possible duplicate record', 'This member already has a historical record of this type on this date. Search the records and edit the existing entry instead.'); return; }
    }
    setSaving(true);
    try {
      if (type === 'loan_balance') {
        if (editing) {
          if (editing.kind !== 'snapshot') throw new Error('This previous loan balance is not stored as a snapshot. Please create a new snapshot instead of editing the old transaction.');
          await editHistoricalLoanBalanceEntry(groupId, editing.id, {
            member_id: selectedMemberId!, balance: saveAmount, transaction_date: iso,
            source_reference: reference.trim(), source_notes: notes,
          }, executiveMemberId);
        } else {
          await recordHistoricalLoanBalance(groupId, {
            member_id: selectedMemberId!, balance: saveAmount, transaction_date: iso,
            source_reference: reference.trim(), source_notes: notes,
          });
        }
        setPreviousBalance(saveAmount);
        setMemberListTab('finished');
      } else if (editing) {
        if (editing.kind === 'snapshot') throw new Error('A historical loan snapshot cannot be changed into another entry type.');
        await editHistoricalEntry(groupId, editing.kind as 'standard' | 'extra', editing.id, {
          amount: saveAmount, transaction_date: iso, fine_reason: fineReason, lender_name: lenderName,
          interest_amount: amountValue(interest), due_date: dueIso || null, source_notes: notes,
        }, executiveMemberId);
      } else if (type === 'savings' || type === 'loan_disbursement') {
        const ref = reference.trim() || `AUTO-${groupId}-${Date.now()}`;
        await recordHistoricalFinancialTransaction(groupId, {
          member_id: selectedMemberId!, historical_type: type,
          amount: saveAmount, transaction_date: iso, source_reference: ref, source_notes: notes,
          share_count: type === 'savings' ? Number(shareCount) : null,
          share_value: type === 'savings' ? amountValue(shareValue) : null,
          loan_due_date: type === 'loan_disbursement' ? (dueIso || null) : null,
          historical_interest: type === 'loan_disbursement' ? amountValue(interest) : 0,
        });
        if (selectedMemberId != null) setMemberListTab('finished');
      } else {
        const result = await recordHistoricalExtraEntry(groupId, {
          member_id: type === 'external_loan' ? null : selectedMemberId, entry_type: type,
          amount: saveAmount, transaction_date: iso, fine_reason: type === 'fine' ? fineReason : '',
          lender_name: type === 'external_loan' ? lenderName.trim() : '',
          interest_amount: type === 'external_loan' ? amountValue(interest) : 0,
          due_date: type === 'external_loan' ? (dueIso || null) : null,
          source_reference: reference.trim(), source_notes: notes,
        });
        if (selectedMemberId != null) setMemberListTab('finished');
        if (!result.cloudSynced) Alert.alert('Saved on this phone', `${labelFor(type)} is saved locally, but Back4App sync failed. Check internet and sync before another phone relies on this entry.`);
      }
      resetForm();
      await loadData();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please check the entry.');
    } finally { setSaving(false); }
  };

  const openEditForm = (entry: Entry) => {
    setEditing(entry); setType(entry.type); setSelectedMemberId(entry.member_id); setDate(displayDate(entry.date)); setAmount(String(entry.amount));
    setShareCount(String(entry.share_count ?? 1)); setShareValue(String(entry.share_value ?? shareValue));
    setDueDate(displayDate(entry.due_date || entry.loan_due_date || '')); setInterest(String(entry.interest_amount ?? entry.historical_interest ?? 0));
    setFineReason((entry.fine_reason === 'absent' || entry.fine_reason === 'other') ? entry.fine_reason : 'late');
    setLenderName(entry.lender_name || ''); setReference(entry.source_reference || ''); setNotes(entry.source_notes || '');
    if (entry.kind === 'snapshot') setPreviousBalance(entry.amount);
  };
  const beginEdit = async (entry: Entry) => {
    if (historicalLocked) { Alert.alert('Historical records locked', 'After the first meeting closes, historical records can only be viewed.'); return; }
    if (!canAdmin) { Alert.alert('Admin only', 'Only the group administrator can edit entries.'); return; }
    setPendingEdit(entry); setPasscodeEntry('');
    const stored = await AsyncStorage.getItem(`@ebadsave/historical_records_passcode_${groupId}`);
    setPasscodeSetup(!stored); setPasscodeVisible(true);
  };
  const unlockEdit = async () => {
    const code = passcodeEntry.trim();
    if (code.length < 4) { Alert.alert('Passcode required', 'Use at least 4 characters.'); return; }
    const key = `@ebadsave/historical_records_passcode_${groupId}`;
    const stored = await AsyncStorage.getItem(key);
    if (!stored) await AsyncStorage.setItem(key, code);
    else if (stored !== code) { Alert.alert('Incorrect passcode', 'The record remains read-only.'); return; }
    const entry = pendingEdit; setPasscodeVisible(false); setPendingEdit(null); setPasscodeEntry('');
    if (entry) openEditForm(entry);
  };
  const askDelete = (entry: Entry) => {
    if (historicalLocked) { Alert.alert('Historical records locked', 'After the first meeting closes, historical records can only be viewed.'); return; }
    if (!canAdmin) { Alert.alert('Admin only', 'Only the group administrator can delete entries.'); return; }
    setDeleteTarget(entry);
  };
  const confirmDelete = async () => {
    if (!deleteTarget || !executiveMemberId) return;
    try {
      if (deleteTarget.kind === 'snapshot') {
        await softDeleteHistoricalLoanBalanceEntry(groupId, deleteTarget.id, executiveMemberId);
      } else {
        await softDeleteHistoricalEntry(groupId, deleteTarget.kind as 'standard' | 'extra', deleteTarget.id, executiveMemberId);
      }
      setDeleteTarget(null);
      await loadData();
    } catch (e) {
      setDeleteTarget(null);
      Alert.alert('Could not delete', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  if (loading && !groupName) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#166534"/><Text style={styles.help}>Loading group records…</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {historicalLocked && <View style={styles.lockedNotice}><Text style={styles.lockedTitle}>HISTORICAL SETUP LOCKED</Text><Text style={styles.lockedText}>The first meeting has been closed. New historical entries are disabled; existing records remain available for viewing.</Text></View>}
      <View style={styles.header}><Text style={styles.eyebrow}>EBADSAVE • KYAMUSONI TUTUNGUKYE</Text><Text style={styles.title}>{groupName}</Text><Text style={styles.groupNo}>{groupNumber}</Text><Text style={styles.subtitle}>Tap the big picture buttons. Enter what is written in the passbook.</Text></View>

      <TouchableOpacity onPress={() => navigation.navigate('HistoricalMigration' as never, { groupId, executiveMemberId } as never)} style={{backgroundColor:'#166534',borderRadius:12,padding:14,marginBottom:12,alignItems:'center'}}>
        <Text style={{color:'#fff',fontSize:15,fontWeight:'900'}}>📚 Open Historical Ledger Migration</Text>
        <Text style={{color:'#dcfce7',fontSize:12,marginTop:4}}>Register evidence • prepare drafts • submit for verification</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>📊 Imported history totals</Text>
      <View style={styles.summaryCard}>
        <View style={styles.totalLine}><Text style={styles.totalLabel}>🪙 Savings</Text><Text style={styles.totalValue}>{money(summary.savings)}</Text></View>
        <View style={styles.totalLine}><Text style={styles.totalLabel}>⚠️ Fines</Text><Text style={styles.totalValue}>{money(summary.fines)}</Text></View>
        <View style={styles.totalLine}><Text style={styles.totalLabel}>🏦 External Loans (IN)</Text><Text style={styles.totalValue}>{money(summary.externalLoans)}</Text></View>
        <View style={styles.totalLine}><Text style={[styles.totalLabel,{color:'#b91c1c'}]}>💸 Loans Issued (OUT)</Text><Text style={[styles.totalValue,{color:'#b91c1c'}]}>- {money(summary.loanDisbursements)}</Text></View>
        <View style={styles.totalLine}><Text style={[styles.totalLabel,{color:'#9a3412'}]}>🤲 Previous Outstanding Loan Balances (ASSETS)</Text><Text style={[styles.totalValue,{color:'#9a3412'}]}>{money(outstandingLoanAssets)}</Text></View>
        <View style={styles.totalDivider}/>
        <Text style={styles.cashBoxLabel}>NET HISTORICAL CASH MOVEMENT (Loan Fund)</Text>
        <Text style={styles.cashBoxValue}>{money(totalCashInBox)}</Text>
        <Text style={styles.help}>Formula: Savings + Fines + External Loans - Actual Loans Issued. Historical snapshots are not subtracted again.</Text>
        <View style={styles.totalDivider}/>
        <Text style={[styles.cashBoxLabel,{color:'#14532d'}]}>CASH IN BOX (ESTIMATE)</Text>
        <Text style={[styles.cashBoxValue,{color:'#166534'}]}>{money(totalCashInBox)}</Text>
        <Text style={styles.help}>This is an estimate from imported entries. It is not a reconciled physical cash count if repayments or other cash movements are missing.</Text>
        <View style={[styles.totalDivider,{backgroundColor:'#1d4ed8'}]}/>
        <View style={styles.totalLine}><Text style={[styles.totalLabel,{color:'#1d4ed8'}]}>🛡️ Insurance Fund (SEPARATE Social Fund)</Text><Text style={[styles.totalValue,{color:'#1d4ed8'}]}>{money(insuranceFund)}</Text></View>
        <Text style={styles.help}>Insurance is NOT added to loan fund. Kept separate for welfare.</Text>
        <View style={styles.totalDivider}/>
        <View style={styles.totalLine}><Text style={[styles.totalLabel,{fontWeight:'900'}]}>TOTAL GROUP ASSETS (ESTIMATE)</Text><Text style={[styles.totalValue,{fontWeight:'900'}]}>{money(totalGroupAssets)}</Text></View>
        <Text style={styles.help}>Estimated cash + recorded outstanding loan snapshots + insurance. Avoid treating this as audited accounts.</Text>
      </View>

      <Text style={styles.sectionTitle}>{editing ? '✏️ Edit entry' : '➕ Add historical entry'}</Text>
      <View style={styles.formCard}>
        <View style={styles.typeGrid}>
          {(['savings','loan_balance','fine','insurance','external_loan'] as EntryType[]).map(t =>
            <TouchableOpacity key={t} disabled={!!editing && t !== editing.type} onPress={() => chooseType(t)}
              style={[styles.typeButton,{backgroundColor:type===t?labels[t].color:labels[t].bg,borderColor:labels[t].color,opacity:!!editing&&t!==editing.type?0.35:1}]}
              activeOpacity={0.85}>
              <Text style={styles.typeIcon}>{labels[t].icon}</Text><Text style={[styles.typeText,{color:type===t?'#fff':labels[t].color}]}>{labels[t].title}</Text>
            </TouchableOpacity>
          )}
        </View>
        {type !== 'external_loan' && <>
          <Text style={styles.label}>👤 Member — tap photo</Text>
          <TouchableOpacity style={styles.memberSelect} onPress={() => setMemberPickerVisible(true)} activeOpacity={0.85}>
            {selectedMember?.photo_uri ? <Image source={{uri:selectedMember.photo_uri}} style={styles.selectedPhoto}/> : <View style={styles.selectedPhotoPlaceholder}><Text style={styles.photoEmoji}>👤</Text></View>}
            <View style={{flex:1}}><Text style={styles.memberName}>{selectedMember?.full_name || 'Choose member'}</Text><Text style={styles.memberNumber}>{selectedMember?.member_number || 'Tap to select'}</Text></View><Text style={styles.pickArrow}>▦</Text>
          </TouchableOpacity>
        </>}
        {selectedMemberLoanComparison && <View style={styles.loanComparison}>
          <Text style={styles.loanComparisonTitle}>📘 MEMBER LOAN HISTORY COMPARISON</Text>
          <Text style={styles.loanComparisonLine}>Loan Issued (recorded total): {money(selectedMemberLoanComparison.totalIssued)}</Text>
          <Text style={styles.loanComparisonDate}>Issue date (latest recorded issue): {selectedMemberLoanComparison.issueDate ? displayDate(selectedMemberLoanComparison.issueDate) : 'Not recorded'}</Text>
          <Text style={styles.loanComparisonLine}>Previous Loan Balance: {selectedMemberLoanComparison.previousBalance !== null ? money(selectedMemberLoanComparison.previousBalance) : 'Not recorded'}</Text>
          <Text style={styles.loanComparisonDate}>Report date: {selectedMemberLoanComparison.balanceDate ? displayDate(selectedMemberLoanComparison.balanceDate) : 'Not recorded'}</Text>
          {selectedMemberLoanComparison.amountPaid !== null && <>
            <Text style={styles.loanComparisonLine}>Historical Difference (Issued − Balance):</Text>
            <Text style={[styles.loanComparisonAmount,selectedMemberLoanComparison.amountPaid<0&&styles.negativeAmount]}>{money(selectedMemberLoanComparison.amountPaid)}</Text>
            <Text style={styles.loanComparisonDate}>This is a historical comparison, not a verified repayment total. Interest, multiple loans and other adjustments may affect the actual amount paid.</Text>
          </>}
        </View>}
        {type === 'savings' && <>
          <Text style={styles.label}>🪙 Number of shares</Text><TextInput value={shareCount} onChangeText={setShareCount} keyboardType="numeric" style={styles.input} placeholder="Number of shares"/>
          <Text style={styles.label}>Value of one share (UGX)</Text><TextInput value={shareValue} onChangeText={setShareValue} keyboardType="numeric" style={styles.input} placeholder="Share value"/>
          <View style={styles.calculated}><Text style={styles.calculatedLabel}>TOTAL SAVINGS</Text><Text style={styles.calculatedValue}>{money(savingsAmount)}</Text></View>
        </>}
        {type === 'loan_balance' && <>
          {!editing && <View style={styles.balanceBox}><Text style={styles.balanceLabel}>🤲 PREVIOUS LOAN BALANCE</Text><Text style={styles.balanceValue}>{money(previousBalance)}</Text><Text style={styles.help}>This shows the latest imported snapshot for the selected member. Enter the balance from the historical loan book below.</Text></View>}
          <Text style={styles.label}>{editing ? 'Previous loan amount (UGX)' : 'Previous loan balance (UGX)'}</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" style={styles.input} placeholder="Previous loan balance"/>
          <Text style={styles.label}>Reference (optional)</Text><TextInput value={reference} onChangeText={setReference} style={styles.input} placeholder="Ledger page / book reference"/>
        </>}
        {(type === 'loan_disbursement' || type === 'external_loan') && <>
          <Text style={styles.label}>💰 Amount (UGX)</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" style={styles.input} placeholder="Enter amount"/>
          <Text style={styles.label}>Interest (UGX)</Text><TextInput value={interest} onChangeText={setInterest} keyboardType="numeric" style={styles.input} placeholder="Interest amount"/>
          <Text style={styles.label}>{type === 'external_loan' ? '🏦 Lender name' : 'Due date (DD-MM-YYYY)'}</Text>
          {type === 'external_loan' ? <TextInput value={lenderName} onChangeText={setLenderName} style={styles.input} placeholder="Bank / lender / person"/> : null}
          {type === 'loan_disbursement' ? <TextInput value={dueDate} onChangeText={setDueDate} style={styles.input} placeholder="DD-MM-YYYY" keyboardType="numbers-and-punctuation"/> : null}
          {type === 'external_loan' && <><Text style={styles.label}>Due date (DD-MM-YYYY)</Text><TextInput value={dueDate} onChangeText={setDueDate} style={styles.input} placeholder="DD-MM-YYYY" keyboardType="numbers-and-punctuation"/></>}
        </>}
        {(type === 'fine' || type === 'insurance') && <><Text style={styles.label}>💰 Amount (UGX)</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" style={styles.input} placeholder="Enter amount"/></>}
        {type === 'fine' && <>
          <Text style={styles.label}>⚠️ Reason — tap icon</Text>
          <View style={styles.reasonRow}>{([['late','⏰','Late'],['absent','🚫','Absent'],['other','❗','Other']] as const).map(([value,icon,label]) =>
            <TouchableOpacity key={value} onPress={() => setFineReason(value)} style={[styles.reasonButton,fineReason===value&&styles.reasonButtonActive]}>
              <Text style={styles.reasonIcon}>{icon}</Text><Text style={styles.reasonText}>{label}</Text>
            </TouchableOpacity>)}
          </View>
        </>}
        {type === 'insurance' && <View style={styles.balanceBox}><Text style={styles.balanceLabel}>🛡️ INSURANCE / WELFARE FUND (Separate from loan fund)</Text><Text style={styles.help}>This contribution is recorded separately and NOT added to loan cash box.</Text></View>}
        <Text style={styles.label}>📅 Date (DD-MM-YYYY)</Text><TextInput value={date} onChangeText={setDate} style={styles.input} placeholder="DD-MM-YYYY" keyboardType="numbers-and-punctuation"/>
        <Text style={styles.label}>Notes (optional)</Text><TextInput value={notes} onChangeText={setNotes} style={[styles.input,styles.notes]} placeholder="Optional note" multiline/>
        <TouchableOpacity onPress={save} disabled={saving||historicalLocked} style={[styles.saveButton,{backgroundColor:labels[type].color},saving&&styles.disabled]}>
          <Text style={styles.saveIcon}>{saving?'⏳':'💾'}</Text><Text style={styles.saveText}>{saving?'Saving…':editing?'Save Changes':'Save Entry'}</Text>
        </TouchableOpacity>
        {editing && <TouchableOpacity onPress={resetForm} style={styles.cancelEdit}><Text style={styles.cancelEditText}>Cancel edit</Text></TouchableOpacity>}
      </View>

      <View style={styles.recentHeader}><Text style={styles.sectionTitle}>📚 Recent imported entries</Text><TouchableOpacity onPress={() => void loadData()} style={styles.refresh}><Text style={styles.refreshText}>↻ Refresh</Text></TouchableOpacity></View>
      <TextInput value={recordSearch} onChangeText={setRecordSearch} style={styles.input} placeholder="🔎 Search name, member number, type, date, reference…" returnKeyType="search"/>
      {!filteredRecords.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>{records.length?'No matching records':'No entries yet'}</Text><Text style={styles.help}>{records.length?'Try another name, number, type, date, or reference.':'Start entering records from the physical passbooks.'}</Text></View> :
        filteredRecords.map(r => <View key={`${r.kind}-${r.id}`} style={styles.entryCard}>
          <View style={styles.entryTop}><View style={[styles.entryTypePill,{backgroundColor:labels[r.type].bg}]}><Text style={{fontSize:17}}>{labels[r.type].icon}</Text><Text style={[styles.entryTypeText,{color:labels[r.type].color}]}>{labelFor(r.type)}</Text></View><Text style={styles.entryAmount}>{money(r.amount)}</Text></View>
          <Text style={styles.entryMember}>{r.member_name||r.lender_name||'Group liability'} {r.member_number?`· ${r.member_number}`:''}</Text>
          <Text style={styles.entryMeta}>{r.kind==='snapshot'?'Report date':'Date'}: {displayDate(r.date)}</Text>
          {r.type==='fine' && <Text style={styles.entryMeta}>Reason: {r.fine_reason||'Other'}</Text>}
          {r.type==='external_loan' && <Text style={styles.entryMeta}>Lender: {r.lender_name} · Interest: {money(r.interest_amount||0)} · Due: {r.due_date?displayDate(r.due_date):'Not recorded'}</Text>}
          {r.type==='loan_disbursement' && <Text style={styles.entryMeta}>Due date: {r.loan_due_date?displayDate(r.loan_due_date):'Not recorded'} · Interest: {money(r.historical_interest||0)}</Text>}
          <Text style={styles.audit}>🔒 Saved record · READ ONLY{r.edited_at?` · Edited ${r.edited_at.slice(0,10)}`:''}</Text>
          {!!r.source_reference && <Text style={styles.entryMeta}>Reference: {r.source_reference}</Text>}
          {!!r.source_notes && <Text style={styles.entryMeta}>{r.source_notes}</Text>}
          {canAdmin && <View style={styles.actions}>
            <TouchableOpacity onPress={() => beginEdit(r)} style={styles.editButton}><Text style={styles.actionIcon}>✏️</Text><Text style={styles.editText}>Unlock & Edit</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => askDelete(r)} style={styles.deleteButton}><Text style={styles.actionIcon}>🗑️</Text><Text style={styles.deleteText}>Delete</Text></TouchableOpacity>
          </View>}
        </View>)}
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>⬅ Back</Text></TouchableOpacity>
    </ScrollView>
  </KeyboardAvoidingView>

  <Modal visible={memberPickerVisible} transparent animationType="fade" onRequestClose={() => setMemberPickerVisible(false)}>
    <View style={styles.modalShade}><View style={styles.memberModal}>
      <Text style={styles.modalTitle}>👤 Choose member photo</Text>
      <Text style={styles.help}>Current members have no historical entries yet. Finished members already have at least one saved historical entry.</Text>
      <View style={styles.memberTabs}>
        <TouchableOpacity onPress={() => setMemberListTab('current')} style={[styles.memberTab,memberListTab==='current'&&styles.memberTabActive]}><Text style={[styles.memberTabText,memberListTab==='current'&&styles.memberTabTextActive]}>Current ({members.filter(m=>!completedHistoricalMemberIds.has(m.id)).length})</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setMemberListTab('finished')} style={[styles.memberTab,memberListTab==='finished'&&styles.memberTabActive]}><Text style={[styles.memberTabText,memberListTab==='finished'&&styles.memberTabTextActive]}>Finished ({members.filter(m=>completedHistoricalMemberIds.has(m.id)).length})</Text></TouchableOpacity>
      </View>
      <ScrollView><View style={styles.photoGrid}>{visibleMembers.map(m =>
        <TouchableOpacity key={m.id} onPress={() => chooseMember(m)} style={[styles.photoTile,selectedMemberId===m.id&&styles.photoTileActive]}>
          {m.photo_uri?<Image source={{uri:m.photo_uri}} style={styles.memberPhoto}/>:<View style={styles.memberPhotoEmpty}><Text style={styles.photoEmoji}>👤</Text></View>}
          <Text style={styles.photoName} numberOfLines={2}>{m.full_name}</Text><Text style={styles.photoNumber}>{m.member_number}</Text>
        </TouchableOpacity>)}</View>
        {!visibleMembers.length&&<Text style={styles.help}>{members.length===0?'No members are registered yet.':memberListTab==='finished'?'No members have historical entries yet.':'All members have at least one historical entry.'}</Text>}
      </ScrollView>
      <TouchableOpacity onPress={() => setMemberPickerVisible(false)} style={styles.noButton}><Text style={styles.noText}>Close</Text></TouchableOpacity>
    </View></View>
  </Modal>

  <Modal visible={passcodeVisible} transparent animationType="fade" onRequestClose={() => setPasscodeVisible(false)}>
    <View style={styles.modalShade}><View style={styles.deleteModal}>
      <Text style={styles.modalTitle}>{passcodeSetup?'🔐 Set edit passcode':'🔐 Unlock historical record'}</Text>
      <Text style={styles.help}>{passcodeSetup?'Create a passcode of at least 4 characters. You will need it to edit locked records on this phone.':'Historical records are read-only until the group passcode is entered.'}</Text>
      <TextInput value={passcodeEntry} onChangeText={setPasscodeEntry} style={styles.input} placeholder="Enter passcode" secureTextEntry autoCapitalize="none" autoCorrect={false}/>
      <TouchableOpacity onPress={() => void unlockEdit()} style={styles.saveButton}><Text style={styles.saveText}>{passcodeSetup?'Set passcode & edit':'Unlock & edit'}</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => {setPasscodeVisible(false);setPendingEdit(null);setPasscodeEntry('');}} style={styles.noButton}><Text style={styles.noText}>Cancel</Text></TouchableOpacity>
    </View></View>
  </Modal>

  <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
    <View style={styles.modalShade}><View style={styles.deleteModal}>
      <Text style={styles.deleteModalIcon}>🗑️</Text><Text style={styles.modalTitle}>Delete this?</Text>
      <Text style={styles.deleteQuestion}>Delete this? {money(deleteTarget?.amount||0)} {deleteTarget?labelFor(deleteTarget.type):'entry'} for {deleteTarget?.member_name||deleteTarget?.lender_name||'the group'}?</Text>
      <Text style={styles.help}>The record will be marked deleted, not erased. Group totals will be recalculated.</Text>
      <View style={styles.confirmRow}>
        <TouchableOpacity onPress={() => setDeleteTarget(null)} style={styles.noButtonLarge}><Text style={styles.noTextLarge}>NO</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => void confirmDelete()} style={styles.yesButtonLarge}><Text style={styles.yesTextLarge}>YES, DELETE</Text></TouchableOpacity>
      </View>
    </View></View>
  </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f3f6f4'},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#f3f6f4'},content:{padding:14,paddingBottom:40},
  header:{backgroundColor:'#14532d',borderRadius:18,padding:18,marginBottom:16},eyebrow:{color:'#bbf7d0',fontSize:10,fontWeight:'900',letterSpacing:.7},title:{color:'#fff',fontSize:23,fontWeight:'900',marginTop:8},groupNo:{color:'#dcfce7',fontSize:14,fontWeight:'800',marginTop:3},subtitle:{color:'#f0fdf4',fontSize:13,lineHeight:19,marginTop:10},
  sectionTitle:{fontSize:18,fontWeight:'900',color:'#111827',marginTop:10,marginBottom:10},summaryCard:{backgroundColor:'#fff',borderRadius:15,padding:14,borderWidth:1,borderColor:'#dbe4dc',marginBottom:18},totalLine:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:7},totalLabel:{color:'#334155',fontSize:14,fontWeight:'700',flexShrink:1},totalValue:{color:'#111827',fontSize:14,fontWeight:'900'},totalDivider:{height:1,backgroundColor:'#cbd5e1',marginVertical:10},cashBoxLabel:{fontSize:12,color:'#14532d',fontWeight:'900'},cashBoxValue:{fontSize:22,color:'#14532d',fontWeight:'900',marginTop:5},
  formCard:{backgroundColor:'#fff',borderRadius:16,padding:14,borderWidth:1,borderColor:'#e2e8f0',marginBottom:20},typeGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},typeButton:{width:'31.5%',minHeight:92,borderWidth:2,borderRadius:13,alignItems:'center',justifyContent:'center',padding:7},typeIcon:{fontSize:27},typeText:{fontSize:12,fontWeight:'900',textAlign:'center',marginTop:5},label:{color:'#334155',fontSize:13,fontWeight:'800',marginTop:14,marginBottom:6},input:{minHeight:48,borderRadius:10,borderWidth:1,borderColor:'#cbd5e1',backgroundColor:'#fff',paddingHorizontal:12,color:'#111827',fontSize:16},notes:{minHeight:65,textAlignVertical:'top',paddingTop:10},memberSelect:{flexDirection:'row',alignItems:'center',gap:11,borderWidth:2,borderColor:'#94a3b8',borderRadius:13,padding:10,marginTop:2},selectedPhoto:{width:58,height:58,borderRadius:29},selectedPhotoPlaceholder:{width:58,height:58,borderRadius:29,backgroundColor:'#e2e8f0',alignItems:'center',justifyContent:'center'},photoEmoji:{fontSize:27},memberName:{fontSize:15,fontWeight:'900',color:'#111827'},memberNumber:{fontSize:12,color:'#64748b',marginTop:3},pickArrow:{fontSize:24,color:'#166534',fontWeight:'900'},calculated:{marginTop:10,padding:12,borderRadius:11,backgroundColor:'#f0fdf4',borderColor:'#86efac',borderWidth:1},calculatedLabel:{fontSize:11,fontWeight:'900',color:'#166534'},calculatedValue:{fontSize:22,fontWeight:'900',color:'#14532d',marginTop:3},balanceBox:{marginTop:12,padding:12,borderRadius:12,backgroundColor:'#fff7ed',borderColor:'#fdba74',borderWidth:1},balanceLabel:{fontSize:12,fontWeight:'900',color:'#9a3412'},balanceValue:{fontSize:22,fontWeight:'900',color:'#9a3412',marginTop:4},
  loanComparison:{marginTop:12,padding:13,borderRadius:12,backgroundColor:'#eff6ff',borderWidth:1,borderColor:'#93c5fd'},loanComparisonTitle:{color:'#1e40af',fontSize:13,fontWeight:'900',marginBottom:8},loanComparisonLine:{color:'#1e293b',fontSize:13,fontWeight:'800',marginTop:6},loanComparisonDate:{color:'#64748b',fontSize:11,marginTop:3,lineHeight:16},loanComparisonAmount:{color:'#166534',fontSize:22,fontWeight:'900',marginTop:5},negativeAmount:{color:'#dc2626'},
  reasonRow:{flexDirection:'row',gap:8},reasonButton:{flex:1,borderWidth:1,borderColor:'#fecaca',borderRadius:11,paddingVertical:12,alignItems:'center',backgroundColor:'#fff'},reasonButtonActive:{backgroundColor:'#fee2e2',borderWidth:2,borderColor:'#b91c1c'},reasonIcon:{fontSize:24},reasonText:{fontSize:13,fontWeight:'900',color:'#991b1b',marginTop:4},saveButton:{minHeight:55,borderRadius:13,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:9,marginTop:20},saveIcon:{fontSize:23},saveText:{color:'#fff',fontSize:17,fontWeight:'900'},disabled:{opacity:.6},cancelEdit:{marginTop:9,alignItems:'center',padding:12},cancelEditText:{color:'#475569',fontWeight:'800'},
  recentHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},refresh:{padding:9,backgroundColor:'#dcfce7',borderRadius:9},refreshText:{color:'#166534',fontWeight:'900'},entryCard:{backgroundColor:'#fff',borderRadius:14,borderWidth:1,borderColor:'#e2e8f0',padding:13,marginBottom:9},entryTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},entryTypePill:{flexDirection:'row',alignItems:'center',gap:6,paddingVertical:6,paddingHorizontal:8,borderRadius:9,flexShrink:1},entryTypeText:{fontWeight:'900',fontSize:12},entryAmount:{fontSize:16,fontWeight:'900',color:'#111827'},entryMember:{fontSize:14,fontWeight:'900',color:'#1f2937',marginTop:9},entryMeta:{fontSize:12,color:'#64748b',marginTop:4,lineHeight:17},audit:{fontSize:11,color:'#1d4ed8',fontWeight:'800',marginTop:5},actions:{flexDirection:'row',gap:10,marginTop:12},editButton:{flex:1,backgroundColor:'#dbeafe',borderRadius:10,minHeight:43,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},deleteButton:{flex:1,backgroundColor:'#fee2e2',borderRadius:10,minHeight:43,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},actionIcon:{fontSize:18},editText:{color:'#1d4ed8',fontWeight:'900'},deleteText:{color:'#b91c1c',fontWeight:'900'},empty:{backgroundColor:'#fff',padding:15,borderRadius:12},emptyTitle:{fontWeight:'900',color:'#334155'},help:{fontSize:12,color:'#64748b',lineHeight:17,marginTop:6},backButton:{minHeight:48,borderWidth:1,borderColor:'#cbd5e1',borderRadius:12,alignItems:'center',justifyContent:'center',marginTop:12},backText:{fontSize:14,fontWeight:'900',color:'#334155'},
  lockedNotice:{backgroundColor:'#fee2e2',borderColor:'#ef4444',borderWidth:1,borderRadius:10,padding:12,marginBottom:12},lockedTitle:{color:'#991b1b',fontWeight:'900'},lockedText:{color:'#991b1b',marginTop:4},
  modalShade:{flex:1,backgroundColor:'rgba(15,23,42,.6)',justifyContent:'center',padding:14},memberTabs:{flexDirection:'row',gap:8,marginTop:12,marginBottom:4},memberTab:{flex:1,minHeight:42,borderRadius:10,borderWidth:1,borderColor:'#cbd5e1',alignItems:'center',justifyContent:'center',backgroundColor:'#f8fafc'},memberTabActive:{backgroundColor:'#166534',borderColor:'#166534'},memberTabText:{fontSize:13,fontWeight:'900',color:'#334155'},memberTabTextActive:{color:'#fff'},memberModal:{maxHeight:'88%',backgroundColor:'#fff',borderRadius:18,padding:15},modalTitle:{fontSize:21,fontWeight:'900',color:'#111827',textAlign:'center',marginBottom:7},photoGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginTop:12},photoTile:{width:'31.5%',alignItems:'center',padding:7,marginBottom:9,borderWidth:1,borderColor:'#e2e8f0',borderRadius:12,backgroundColor:'#fff'},photoTileActive:{borderWidth:2,borderColor:'#16a34a',backgroundColor:'#f0fdf4'},memberPhoto:{width:66,height:66,borderRadius:33},memberPhotoEmpty:{width:66,height:66,borderRadius:33,backgroundColor:'#e2e8f0',alignItems:'center',justifyContent:'center'},photoName:{fontSize:11,fontWeight:'900',color:'#111827',textAlign:'center',marginTop:6},photoNumber:{fontSize:10,color:'#64748b',marginTop:3},noButton:{minHeight:46,backgroundColor:'#e2e8f0',borderRadius:11,alignItems:'center',justifyContent:'center',marginTop:12},noText:{fontSize:15,fontWeight:'900',color:'#334155'},deleteModal:{backgroundColor:'#fff',borderRadius:20,padding:20,alignItems:'center'},deleteModalIcon:{fontSize:45,marginBottom:6},deleteQuestion:{fontSize:17,fontWeight:'800',textAlign:'center',color:'#334155',lineHeight:24,marginTop:8},confirmRow:{flexDirection:'row',gap:12,width:'100%',marginTop:18},noButtonLarge:{flex:1,minHeight:58,backgroundColor:'#e2e8f0',borderRadius:12,alignItems:'center',justifyContent:'center'},noTextLarge:{fontSize:17,fontWeight:'900',color:'#334155'},yesButtonLarge:{flex:1,minHeight:58,backgroundColor:'#b91c1c',borderRadius:12,alignItems:'center',justifyContent:'center'},yesTextLarge:{fontSize:16,fontWeight:'900',color:'#fff'},
});
