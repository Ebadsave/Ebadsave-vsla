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
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMembersByGroupId,
  getHistoricalMigrationImports,
  getHistoricalMigrationDrafts,
  type HistoricalMigrationDraft,
} from '../database/database';

type Props = {
  route: { params: { groupId: number; executiveMemberId: number; bookName?: string; adminPin?: string } };
  navigation: { goBack: () => void; navigate: (screen: string, params: any) => void };
};

type Member = { id: number; full_name: string; member_number: string };

const formatDDMMYYYY = (iso: string) => {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};
const isOverdue = (isoDate: string, amount: number) => {
  if (!isoDate || amount <= 0) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(`${isoDate.slice(0, 10)}T00:00:00`) < today;
};

// Helpers
const toAmount = (v: any) => Number(String(v ?? 0).replace(/,/g, '')) || 0;
const getImportId = (d: any) => Number(d.import_id ?? d.importId ?? d.importID ?? 0);

export default function HistoricalMigrationReviewScreen({ route, navigation }: Props) {
  const { groupId, executiveMemberId, bookName, adminPin } = route.params;
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [drafts, setDrafts] = useState<HistoricalMigrationDraft[]>([]);
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmedUntil, setConfirmedUntil] = useState<string | null>(null);

  const CONFIRM_KEY = `hm_confirm_${groupId}`;
  const TRUST_DAYS = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedMembers, loadedImports] = await Promise.all([
        getMembersByGroupId(groupId),
        getHistoricalMigrationImports(groupId),
      ]);
      setMembers((loadedMembers as Member[]).slice().sort((a, b) => a.full_name.localeCompare(b.full_name)));
      let allDrafts: HistoricalMigrationDraft[] = [];
      for (const imp of loadedImports) {
        const d = await getHistoricalMigrationDrafts(imp.id, groupId);
        allDrafts = [...allDrafts, ...d];
      }
      setDrafts(allDrafts);
      // 2-day trust check - unchanged
      const saved = await AsyncStorage.getItem(CONFIRM_KEY);
      if (saved) {
        const until = new Date(saved);
        if (until > new Date()) setConfirmedUntil(saved);
        else {
          await AsyncStorage.removeItem(CONFIRM_KEY);
          setConfirmedUntil(null);
        }
      }
    } catch (e) {
      Alert.alert('Could not load', e instanceof Error ? e.message : 'Try again.');
    } finally { setLoading(false); }
  }, [groupId, CONFIRM_KEY]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // ===== CORE FIX: Latest intake only, for ALL categories =====
  // For one member + one category, take only drafts from that member's latest import_id.
  // Old intakes are IGNORED, not added. If you re-enter a corrected analysis, only the new one counts.
  const getLatestAmount = (memberId: number, category: string) => {
    const list = drafts.filter(d => d.member_id === memberId && d.category === category);
    if (!list.length) return 0;
    const latestImportId = Math.max(...list.map(d => getImportId(d)));
    return list
      .filter(d => getImportId(d) === latestImportId)
      .reduce((s, d) => s + toAmount((d as any).amount), 0);
  };

  const getMemberSummary = (memberId: number) => {
    const list = drafts.filter(d => d.member_id === memberId);

    // Each one is separate - we NEVER add Previous + Current together
    const savings = getLatestAmount(memberId, 'savings');
    const prev = getLatestAmount(memberId, 'previous_loan_balance'); // Loan taken before app + interest
    const curr = getLatestAmount(memberId, 'loan_issued'); // What he still owes now
    const fines = getLatestAmount(memberId, 'fine');
    const insurance = getLatestAmount(memberId, 'insurance');

    // Paid logic - kept as you wanted:
    // If paying well: curr < prev, paid = prev - curr
    // If defaulting: curr > prev (interest accumulating), paid = 0, show OVERDUE
    const paid = prev - curr < 0 ? 0 : prev - curr;

    const loanDueDate = list.find(d => d.category === 'previous_loan_balance' && d.loan_due_date)?.loan_due_date || '';
    const overdue = isOverdue(loanDueDate, curr);
    return { savings, prev, curr, fines, insurance, paid, loanDueDate, overdue, count: list.length };
  };

  // ===== Group Totals: sum of each member's LATEST only, not sum of all drafts =====
  const totalSavings = members.reduce((t, m) => t + getLatestAmount(m.id, 'savings'), 0);
  const totalPrev = members.reduce((t, m) => t + getLatestAmount(m.id, 'previous_loan_balance'), 0);
  const totalCurr = members.reduce((t, m) => t + getLatestAmount(m.id, 'loan_issued'), 0);
  const totalFines = members.reduce((t, m) => t + getLatestAmount(m.id, 'fine'), 0);
  const totalInsurance = members.reduce((t, m) => t + getLatestAmount(m.id, 'insurance'), 0);

  const onConfirmPress = () => {
    if (confirmedUntil) {
      Alert.alert('Already confirmed', `Confirmed until ${formatDDMMYYYY(confirmedUntil)}. No PIN needed.`);
      return;
    }
    setShowPin(true);
  };

  const confirmWithPin = async () => {
    // PIN must be 6-12 characters
    const entered = pin.trim();
    if (entered.length < 6) {
      Alert.alert('PIN too short', 'Enter 6 to 12 characters.');
      return;
    }
    if (entered.length > 12) {
      Alert.alert('PIN too long', 'Enter 6 to 12 characters.');
      return;
    }
    // '6-12' was not a PIN, it was a length description. Use real default.
    const correctPin = adminPin || '123456';
    if (entered !== correctPin) {
      Alert.alert('Wrong PIN', 'Enter correct Administrator PIN.');
      return;
    }
    const until = new Date();
    until.setDate(until.getDate() + TRUST_DAYS);
    await AsyncStorage.setItem(CONFIRM_KEY, until.toISOString());
    setConfirmedUntil(until.toISOString());
    setShowPin(false);
    setPin('');
    Alert.alert('Confirmed', `All records confirmed. Trust rests for 20 days until ${formatDDMMYYYY(until.toISOString())}.`);
  };

  if (loading) {
    return (<SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#16a34a" /><Text style={styles.help}>Loading summary…</Text></SafeAreaView>);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹ Back</Text></TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.kicker}>EBADSAVE VSLA</Text>
          <Text style={styles.title}>Check All Records</Text>
          <Text style={styles.sub}>{bookName || 'Old Book'} • Summary of all members</Text>
        </View>

        {confirmedUntil ? (
          <View style={styles.confirmedBox}>
            <Text style={styles.confirmedText}>✓ CONFIRMED - Trust rests until {formatDDMMYYYY(confirmedUntil)}</Text>
            <Text style={styles.help}>No PIN needed until that date.</Text>
          </View>
        ) : (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Not confirmed yet. Check all members, then Confirm with Administrator PIN.</Text>
          </View>
        )}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Group Totals - Latest Intake Only</Text>
          <View style={styles.detailRow}><Text style={styles.rowLabel}>Members</Text><Text style={styles.rowValue}>{members.length}</Text></View>
          <View style={styles.detailRow}><Text style={styles.rowLabel}>Total Savings</Text><Text style={styles.rowValue}>UGX {totalSavings.toLocaleString()}</Text></View>
          <View style={styles.detailRow}><Text style={styles.rowLabel}>Total Previous Loan</Text><Text style={styles.rowValue}>UGX {totalPrev.toLocaleString()}</Text></View>
          <View style={styles.detailRow}><Text style={styles.rowLabel}>Total Current Loan</Text><Text style={styles.rowValue}>UGX {totalCurr.toLocaleString()}</Text></View>
          <View style={styles.detailRow}><Text style={styles.rowLabel}>Total Paid</Text><Text style={styles.rowValue}>UGX {(totalPrev - totalCurr < 0 ? 0 : totalPrev - totalCurr).toLocaleString()}</Text></View>
          <View style={styles.detailRow}><Text style={styles.rowLabel}>Total Fines</Text><Text style={styles.rowValue}>UGX {totalFines.toLocaleString()}</Text></View>
          <View style={styles.detailRow}><Text style={styles.rowLabel}>Total Insurance</Text><Text style={styles.rowValue}>UGX {totalInsurance.toLocaleString()}</Text></View>
        </View>

        {members.map(m => {
          const s = getMemberSummary(m.id);
          return (
            <View key={m.id} style={[styles.draftCard, s.overdue && styles.overdueCard]}>
              <View style={styles.detailRow}>
                <Text style={styles.groupTitle}>{m.full_name}</Text>
                {s.overdue && <Text style={styles.overdueText}>OVERDUE</Text>}
              </View>
              <Text style={styles.groupCode}>{m.member_number} • {s.count} records</Text>
              <View style={styles.detailRow}><Text style={styles.rowLabel}>Savings</Text><Text style={styles.rowValue}>UGX {s.savings.toLocaleString()}</Text></View>
              <View style={styles.detailRow}><Text style={styles.rowLabel}>Previous Loan</Text><Text style={styles.rowValue}>UGX {s.prev.toLocaleString()}</Text></View>
              <View style={styles.detailRow}><Text style={styles.rowLabel}>Current Loan</Text><Text style={s.overdue ? styles.overdueText : styles.rowValue}>UGX {s.curr.toLocaleString()}</Text></View>
              {!!s.loanDueDate && <View style={styles.detailRow}><Text style={styles.rowLabel}>Loan Due Date</Text><Text style={s.overdue ? styles.overdueText : styles.rowValue}>{formatDDMMYYYY(s.loanDueDate)}</Text></View>}
              <View style={styles.detailRow}><Text style={styles.rowLabel}>Amount Paid</Text><Text style={styles.rowValue}>UGX {s.paid.toLocaleString()}</Text></View>
              <View style={styles.detailRow}><Text style={styles.rowLabel}>Fines</Text><Text style={styles.rowValue}>UGX {s.fines.toLocaleString()}</Text></View>
              <View style={styles.detailRow}><Text style={styles.rowLabel}>Insurance</Text><Text style={styles.rowValue}>UGX {s.insurance.toLocaleString()}</Text></View>
              <View style={styles.row}>
                <TouchableOpacity onPress={() => navigation.navigate('HistoricalMigration', { groupId, executiveMemberId, bookName })} style={styles.smallButton}>
                  <Text style={styles.smallText}>Edit This Member</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {!showPin ? (
          <TouchableOpacity onPress={onConfirmPress} style={[styles.primary, { backgroundColor: confirmedUntil ? '#94a3b8' : '#16a34a' }]}>
            <Text style={styles.primaryText}>{confirmedUntil ? 'ALREADY CONFIRMED' : 'CONFIRM ALL RECORDS'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.pinCard}>
            <Text style={styles.label}>Administrator PIN (6-12 characters)</Text>
            <TextInput value={pin} onChangeText={setPin} style={styles.input} placeholder="Enter Admin PIN (6-12)" keyboardType="number-pad" secureTextEntry maxLength={12} />
            <Text style={styles.help}>PIN must be 6 to 12 characters.</Text>
            <TouchableOpacity onPress={() => void confirmWithPin()} style={styles.primary}>
              <Text style={styles.primaryText}>CONFIRM WITH PIN</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowPin(false); setPin(''); }} style={styles.secondary}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
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
  label: { fontSize: 12, fontWeight: '500', color: '#334155', marginTop: 12, marginBottom: 7 },
  input: { minHeight: 30, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 11, color: '#111827', fontSize: 12, backgroundColor: '#fff' },
  groupTitle: { fontSize: 18, fontWeight: '500', lineHeight: 22, color: '#111827' },
  groupCode: { fontSize: 12, fontWeight: '400', color: '#64748b', marginTop: 4 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  rowLabel: { fontSize: 12, fontWeight:
