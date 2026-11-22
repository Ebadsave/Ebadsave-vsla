import React, { useCallback, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import {
  getMembersByGroupId,
  getHistoricalMigrationImports,
  getHistoricalMigrationDrafts,
  createHistoricalMigrationDraft,
  updateHistoricalMigrationDraft,
  deleteHistoricalMigrationDraft,
  type HistoricalMigrationImport,
  type HistoricalMigrationDraft,
  type HistoricalMigrationCategory,
} from '../database/database';

type Props = {
  route: { params: { groupId: number; executiveMemberId: number } };
  navigation: { goBack: () => void };
};

type Member = { id: number; full_name: string; member_number: string };

// ONLY 7 BUTTONS
const categories: { value: HistoricalMigrationCategory; label: string }[] = [
  { value: 'savings', label: '💰 Savings' },
  { value: 'previous_loan_balance', label: '📋 Previous Loan' },
  { value: 'fine', label: '⚠️ Fines' },
  { value: 'insurance', label: '🛡️ Insurance' },
  { value: 'group_income', label: 'Other money received' },
  { value: 'group_expense', label: 'Money spent' },
  { value: 'other', label: 'External loan / other' },
];

const formatDDMMYYYY = (iso: string) => {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};
const toISO = (v: string) => {
  const [d, m, y] = v.trim().split('-');
  return `${y}-${m}-${d}`;
};
const isValidDDMMYYYY = (v: string) => {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(v)) return false;
  const iso = toISO(v);
  const dt = new Date(`${iso}T12:00:00.000Z`);
  return Number.isFinite(dt.getTime()) && dt.toISOString().slice(0, 10) === iso;
};

export default function HistoricalMigrationScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imports, setImports] = useState<HistoricalMigrationImport[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedImport, setSelectedImport] = useState<HistoricalMigrationImport | null>(null);
  const [drafts, setDrafts] = useState<HistoricalMigrationDraft[]>([]);
  const [selectedMemberView, setSelectedMemberView] = useState<Member | null>(null);
  const [category, setCategory] = useState<HistoricalMigrationCategory>('savings');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<HistoricalMigrationDraft | null>(null);
  const [prevLoanAmount, setPrevLoanAmount] = useState('');
  const [prevLoanDate, setPrevLoanDate] = useState('');
  const [currentLoanAmount, setCurrentLoanAmount] = useState('');
  const [currentLoanDate, setCurrentLoanDate] = useState('');

  const amountPaid = (() => {
    const p = Number(prevLoanAmount.replace(/,/g, '')) || 0;
    const c = Number(currentLoanAmount.replace(/,/g, '')) || 0;
    const paid = p - c;
    return paid < 0 ? 0 : paid;
  })();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedImports, loadedMembers] = await Promise.all([
        getHistoricalMigrationImports(groupId),
        getMembersByGroupId(groupId),
      ]);
      setImports(loadedImports);
      setMembers((loadedMembers as Member[]).slice().sort((a, b) => a.full_name.localeCompare(b.full_name)));
      if (loadedImports.length > 0) {
        const first = loadedImports[0];
        setSelectedImport(first);
        setDrafts(await getHistoricalMigrationDrafts(first.id, groupId));
      }
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again.');
    } finally { setLoading(false); }
  }, [groupId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const resetForm = () => {
    setEditing(null);
    setDate(''); setAmount(''); setDescription('');
    setPrevLoanAmount(''); setPrevLoanDate('');
    setCurrentLoanAmount(''); setCurrentLoanDate('');
  };

  const saveRecord = async () => {
    if (!selectedImport || !selectedMemberView) return;
    if (category === 'previous_loan_balance') {
      if (!isValidDDMMYYYY(prevLoanDate)) {
        Alert.alert('Check date', 'Enter Previous Loan date as DD-MM-YYYY. Example: 17-04-2021.');
        return;
      }
      if (!isValidDDMMYYYY(currentLoanDate)) {
        Alert.alert('Check date', 'Enter Current Loan date as DD-MM-YYYY.');
        return;
      }
      const prev = Number(prevLoanAmount.replace(/,/g, ''));
      const curr = Number(currentLoanAmount.replace(/,/g, ''));
      if (!Number.isFinite(prev) || prev < 0 || !Number.isFinite(curr) || curr < 0) {
        Alert.alert('Check amount', 'Enter correct amounts.');
        return;
      }
      if (curr > prev) {
        Alert.alert('Check amounts', 'Current Loan cannot be more than Previous Loan.');
        return;
      }
      setSaving(true);
      try {
        await createHistoricalMigrationDraft({
          import_id: selectedImport.id,
          group_id: groupId,
          member_id: selectedMemberView.id,
          category: 'previous_loan_balance',
          transaction_date: toISO(prevLoanDate),
          amount: prev,
          is_opening_balance: false,
          description: `Previous Loan Taken (with interest). Current / Balance Loan: ${curr}. Amount Paid: ${amountPaid}. ${description.trim()}`,
          source_reference: selectedImport.source_reference || '',
        });
        await createHistoricalMigrationDraft({
          import_id: selectedImport.id,
          group_id: groupId,
          member_id: selectedMemberView.id,
          category: 'loan_issued',
          transaction_date: toISO(currentLoanDate),
          amount: curr,
          is_opening_balance: false,
          description: `Current / Balance Loan. From Previous Loan of ${prev}. Amount Paid: ${amountPaid}.`,
          source_reference: selectedImport.source_reference || '',
        });
        setDrafts(await getHistoricalMigrationDrafts(selectedImport.id, groupId));
        resetForm();
        Alert.alert('Saved', 'Previous Loan and Current Loan saved.');
      } catch (e) {
        Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.');
      } finally { setSaving(false); }
      return;
    }
    if (!isValidDDMMYYYY(date)) {
      Alert.alert('Check date', 'Enter date as DD-MM-YYYY. Example: 17-04-2021.');
      return;
    }
    const value = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value < 0) {
      Alert.alert('Check amount', 'Enter correct amount in UGX.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        import_id: selectedImport.id,
        group_id: groupId,
        member_id: selectedMemberView.id,
        category,
        transaction_date: toISO(date),
        amount: value,
        is_opening_balance: false,
        description: description.trim(),
        source_reference: selectedImport.source_reference || '',
      };
      if (editing) await updateHistoricalMigrationDraft({ ...payload, id: editing.id });
      else await createHistoricalMigrationDraft(payload);
      setDrafts(await getHistoricalMigrationDrafts(selectedImport.id, groupId));
      resetForm();
      Alert.alert('Saved', 'Record saved.');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.');
    } finally { setSaving(false); }
  };

  const editDraft = (draft: HistoricalMigrationDraft) => {
    setEditing(draft);
    setCategory(draft.category === 'loan_issued' ? 'previous_loan_balance' : draft.category);
    setDate(formatDDMMYYYY(draft.transaction_date));
    setAmount(String(draft.amount));
    setDescription(draft.description);
  };

  const removeDraft = (draft: HistoricalMigrationDraft) => {
    Alert.alert('Remove?', 'Remove this entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await deleteHistoricalMigrationDraft(draft.id, draft.import_id, groupId);
        setDrafts(await getHistoricalMigrationDrafts(draft.import_id, groupId));
      } },
    ]);
  };

  if (loading) {
    return (<SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#16a34a" /><Text style={styles.help}>Loading…</Text></SafeAreaView>);
  }

  const visibleDrafts = selectedMemberView ? drafts.filter(d => d.member_id === selectedMemberView.id) : [];
  const prevDrafts = visibleDrafts.filter(d => d.category === 'previous_loan_balance');
  const currDrafts = visibleDrafts.filter(d => d.category === 'loan_issued');
  const totalPrev = prevDrafts.reduce((s, d) => s + Number(d.amount), 0);
  const totalCurr = currDrafts.reduce((s, d) => s + Number(d.amount), 0);
  const totalPaid = totalPrev - totalCurr < 0 ? 0 : totalPrev - totalCurr;
  const bookName = selectedImport?.evidence_name || 'Old Book';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹ Back</Text></TouchableOpacity>
        <TouchableOpacity
  onPress={() => navigation.navigate('HistoricalMigrationReview', {
    groupId,
    executiveMemberId,
    bookName,
    adminPin: '1234', // change to your real admin PIN
  })}
  style={[styles.primary, { backgroundColor: '#1d4ed8' }]}
>
  <Text style={styles.primaryText}>CHECK ALL MEMBERS - REVIEW PAGE</Text>
</TouchableOpacity>

        {/* BOOK NAME AS TITLE - NO REGISTER, NO LIST */}
        <View style={styles.header}>
          <Text style={styles.kicker}>EBADSAVE VSLA</Text>
          <Text style={styles.title}>{bookName}</Text>
          <Text style={styles.sub}>Enter old records. Then finish.</Text>
        </View>

        <View style={styles.stepCard}>
          <Text style={styles.stepNumber}>STEP 1</Text>
          <Text style={styles.stepTitle}>Enter old money records</Text>
          <Text style={styles.help}>Tap a member, enter his records.</Text>

          {!selectedMemberView && (
            <>
              <Text style={styles.label}>Choose the member</Text>
              {members.map(m => (
                <TouchableOpacity key={m.id} onPress={() => { setSelectedMemberView(m); resetForm(); }} style={styles.memberRow}>
                  <View style={styles.avatar}><Text>👤</Text></View>
                  <Text style={styles.memberName}>{m.full_name}</Text>
                  <Text style={styles.arrow}>›</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {selectedMemberView && (
            <>
              <TouchableOpacity onPress={() => { setSelectedMemberView(null); resetForm(); }} style={styles.backRow}>
                <Text style={styles.backText}>‹ Back to members</Text>
              </TouchableOpacity>
              <View style={styles.memberDetailHeader}>
                <View style={styles.avatarLarge}><Text>👤</Text></View>
                <Text style={styles.groupTitle}>{selectedMemberView.full_name}</Text>
                <Text style={styles.groupCode}>{selectedMemberView.member_number}</Text>
              </View>

              <Text style={styles.label}>Choose the kind of record</Text>
              <View style={styles.categoryGrid}>
                {categories.map(item => (
                  <TouchableOpacity key={item.value} onPress={() => { setCategory(item.value); resetForm(); }} style={[styles.categoryButton, category === item.value && styles.chipOn]}>
                    <Text style={[styles.categoryButtonText, category === item.value && styles.chipTextOn]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {category === 'previous_loan_balance' && (
                <>
                  <Text style={styles.sectionTitle}>Previous Loan Taken</Text>
                  <Text style={styles.help}>Amount includes interest.</Text>
                  <Text style={styles.label}>Previous Loan Amount (UGX) - with interest</Text>
                  <TextInput value={prevLoanAmount} onChangeText={setPrevLoanAmount} style={styles.input} placeholder="Enter amount" keyboardType="decimal-pad" />
                  <Text style={styles.label}>Date when loan was issued (DD-MM-YYYY)</Text>
                  <TextInput value={prevLoanDate} onChangeText={setPrevLoanDate} style={styles.input} placeholder="DD-MM-YYYY  Example: 17-04-2021" keyboardType="numbers-and-punctuation" />
                  <Text style={styles.sectionTitle}>Current Loan / Balance Loan</Text>
                  <Text style={styles.help}>Money he is carrying right now.</Text>
                  <Text style={styles.label}>Current Loan Amount (UGX)</Text>
                  <TextInput value={currentLoanAmount} onChangeText={setCurrentLoanAmount} style={styles.input} placeholder="Enter amount" keyboardType="decimal-pad" />
                  <Text style={styles.label}>Date (DD-MM-YYYY)</Text>
                  <TextInput value={currentLoanDate} onChangeText={setCurrentLoanDate} style={styles.input} placeholder="DD-MM-YYYY" keyboardType="numbers-and-punctuation" />
                  <Text style={styles.label}>Amount Paid - Auto, do not edit</Text>
                  <View style={styles.autoBox}>
                    <Text style={styles.autoText}>UGX {amountPaid.toLocaleString()}</Text>
                    <Text style={styles.help}>Previous Loan minus Current Loan.</Text>
                  </View>
                </>
              )}

              {category !== 'previous_loan_balance' && (
                <>
                  <Text style={styles.label}>Date written in the old book (DD-MM-YYYY)</Text>
                  <TextInput value={date} onChangeText={setDate} style={styles.input} placeholder="DD-MM-YYYY  Example: 17-04-2021" keyboardType="numbers-and-punctuation" />
                  <Text style={styles.label}>Amount in UGX</Text>
                  <TextInput value={amount} onChangeText={setAmount} style={styles.input} placeholder="Enter amount" keyboardType="decimal-pad" />
                </>
              )}

              <Text style={styles.label}>Extra details (optional)</Text>
              <TextInput value={description} onChangeText={setDescription} style={[styles.input, styles.multiline]} multiline placeholder="Enter any other details" />

              <TouchableOpacity disabled={saving} onPress={() => void saveRecord()} style={[styles.primary, saving && styles.disabled]}>
                <Text style={styles.primaryText}>{saving ? 'SAVING…' : 'SAVE OLD RECORD'}</Text>
              </TouchableOpacity>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Summary for {selectedMemberView.full_name}</Text>
                <View style={styles.detailRow}><Text style={styles.rowLabel}>Previous Loan</Text><Text style={styles.rowValue}>UGX {totalPrev.toLocaleString()}</Text></View>
                <View style={styles.detailRow}><Text style={styles.rowLabel}>Current Loan / Balance</Text><Text style={styles.rowValue}>UGX {totalCurr.toLocaleString()}</Text></View>
                <View style={styles.detailRow}><Text style={styles.rowLabel}>Amount Paid</Text><Text style={styles.rowValue}>UGX {totalPaid.toLocaleString()}</Text></View>
                <View style={styles.detailRow}><Text style={styles.rowLabel}>All Records</Text><Text style={styles.rowValue}>{visibleDrafts.length}</Text></View>
              </View>

              <Text style={styles.heading}>Records for this member ({visibleDrafts.length})</Text>
              {visibleDrafts.map(draft => (
                <View key={draft.id} style={styles.draftCard}>
                  <Text style={styles.importTitle}>
                    {draft.category === 'previous_loan_balance' ? 'Previous Loan' : draft.category === 'loan_issued' ? 'Current Loan' : draft.category} • UGX {Number(draft.amount).toLocaleString()}
                  </Text>
                  <Text style={styles.meta}>{formatDDMMYYYY(draft.transaction_date)}</Text>
                  {!!draft.description && (<Text style={styles.meta}>{draft.description}</Text>)}
                  <View style={styles.row}>
                    <TouchableOpacity onPress={() => editDraft(draft)} style={styles.smallButton}><Text style={styles.smallText}>Change</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => removeDraft(draft)} style={[styles.smallButton, styles.delete]}><Text style={[styles.smallText, styles.deleteText]}>Remove</Text></TouchableOpacity>
                  </View>
                </View>
              ))}

              <TouchableOpacity onPress={() => { Alert.alert('Finished', `All records for ${selectedMemberView.full_name} are saved.`); setSelectedMemberView(null); }} style={[styles.primary, { backgroundColor: '#14532d' }]}>
                <Text style={styles.primaryText}>FINISH - DONE FOR THIS MEMBER</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f6f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 13, paddingBottom: 38 },
  back: { paddingVertical: 10 },
  backText: { color: '#166534', fontWeight: '500', fontSize: 12 },
  backRow: { marginTop: 12, paddingVertical: 6 },
  header: { backgroundColor: '#14532d', borderRadius: 16, padding: 17, marginBottom: 16 },
  kicker: { color: '#bbf7d0', fontSize: 10, fontWeight: '500' },
  title: { color: '#fff', fontSize: 18, fontWeight: '500', lineHeight: 22, marginTop: 7 },
  sub: { color: '#f0fdf4', fontSize: 12, lineHeight: 17, marginTop: 7 },
  stepCard: { backgroundColor: '#fff', borderRadius: 14, padding: 13, borderWidth: 1, borderColor: '#dbe4dc', marginBottom: 13 },
  stepNumber: { color: '#16a34a', fontSize: 10, fontWeight: '500' },
  stepTitle: { color: '#14532d', fontSize: 15, fontWeight: '700', lineHeight: 19, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#14532d', marginTop: 16 },
  heading: { fontSize: 16, fontWeight: '600', color: '#111827', marginTop: 13, marginBottom: 9 },
  label: { fontSize: 12, fontWeight: '500', color: '#334155', marginTop: 12, marginBottom: 7 },
  input: { minHeight: 30, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 11, color: '#111827', fontSize: 12, backgroundColor: '#fff' },
  multiline: { minHeight: 75, textAlignVertical: 'top', paddingTop: 10 },
  chipOn: { backgroundColor: '#166534', borderColor: '#166534' },
  chipTextOn: { color: '#fff' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  categoryButton: { width: '30%', minHeight: 40, borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 10, padding: 10, justifyContent: 'center', backgroundColor: '#f0fdf4' },
  categoryButtonText: { color: '#14532d', fontSize: 12, fontWeight: '500', textAlign: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  avatarLarge: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  memberName: { flex: 1, fontSize: 12, fontWeight: '500', color: '#111827', marginLeft: 10 },
  memberDetailHeader: { marginTop: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  arrow: { fontSize: 18, color: '#111827' },
  groupTitle: { fontSize: 18, fontWeight: '500', lineHeight: 22, color: '#111827' },
  groupCode: { fontSize: 12, fontWeight: '400', color: '#64748b', marginTop: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  rowLabel: { fontSize: 12, fontWeight: '500', color: '#334155' },
  rowValue: { fontSize: 12, fontWeight: '500', color: '#111827' },
  autoBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 10, padding: 11 },
  autoText: { fontSize: 15, fontWeight: '700', color: '#14532d' },
  summaryCard: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#93c5fd', borderRadius: 10, padding: 11, marginTop: 14 },
  summaryTitle: { fontSize: 12, fontWeight: '700', color: '#1e3a8a' },
  primary: { minHeight: 49, backgroundColor: '#16a34a', borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontSize: 12, fontWeight: '500', textAlign: 'center' },
  disabled: { opacity: 0.35 },
  importTitle: { fontSize: 12, fontWeight: '500', color: '#111827' },
  meta: { fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 14 },
  help: { fontSize: 11, color: '#64748b', lineHeight: 14, marginTop: 7 },
  draftCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe4dc', borderRadius: 10, padding: 11, marginTop: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallButton: { flex: 1, backgroundColor: '#dbeafe', padding: 11, borderRadius: 8, alignItems: 'center' },
  delete: { backgroundColor: '#fee2e2' },
  smallText: { color: '#1d4ed8', fontWeight: '500', fontSize: 12 },
  deleteText: { color: '#b91c1c' },
});
