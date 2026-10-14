import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  getGroupOnboardingLock,
  getMembersByGroupId,
  getMemberOpeningBalances,
  saveMemberOpeningBalances,
} from '../database/database';

type Props = NativeStackScreenProps<RootStackParamList, 'ExistingGroupOnboarding'>;

type Member = {
  id: number;
  member_number: string;
  full_name: string;
};

type BalanceEntry = {
  memberId: number;
  memberName: string;
  memberNumber: string;
  shares: string;
  shareValue: string;
  savingsAmount: string;
  loanBalance: string;
  loanDueDate: string;
};

const toAmount = (value: string) => {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export default function ExistingGroupOnboardingScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupNumber, setGroupNumber] = useState('');
  const [locked, setLocked] = useState(false);
  const [entries, setEntries] = useState<BalanceEntry[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [group, onboarding, members, balances] = await Promise.all([
        getGroupById(groupId),
        getGroupOnboardingLock(groupId),
        getMembersByGroupId(groupId),
        getMemberOpeningBalances(groupId),
      ]);

      if (!group) throw new Error('The selected group could not be found.');
      setGroupName(group.group_name || '');
      setGroupNumber(`KYA ${group.group_number}`);
      setLocked(onboarding.onboarding_locked);

      const savedByMember = new Map<number, any>();
      for (const item of balances || []) savedByMember.set(Number(item.member_id), item);

      setEntries((members as Member[]).map((member) => {
        const existing = savedByMember.get(Number(member.id));
        return {
          memberId: Number(member.id),
          memberName: member.full_name,
          memberNumber: member.member_number,
          shares: existing?.opening_shares != null ? String(existing.opening_shares) : '',
          shareValue: existing?.share_value != null ? String(existing.share_value) : '',
          savingsAmount: existing?.opening_savings != null ? String(existing.opening_savings) : '',
          loanBalance: existing?.opening_loan_balance != null ? String(existing.opening_loan_balance) : '0',
          loanDueDate: existing?.loan_due_date || '',
        };
      }));
    } catch (error) {
      Alert.alert('Unable to load onboarding', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  const totalSavings = useMemo(() => entries.reduce((sum, entry) => {
    const explicitAmount = entry.savingsAmount.trim() !== '' ? toAmount(entry.savingsAmount) : null;
    const calculated = toAmount(entry.shares) * toAmount(entry.shareValue);
    return sum + (explicitAmount === null ? calculated : explicitAmount);
  }, 0), [entries]);

  const totalLoans = useMemo(() => entries.reduce((sum, entry) => sum + toAmount(entry.loanBalance), 0), [entries]);

  const updateEntry = (memberId: number, field: keyof BalanceEntry, value: string) => {
    setEntries((current) => current.map((entry) => entry.memberId === memberId ? { ...entry, [field]: value } : entry));
  };

  const handleSave = async () => {
    if (locked) {
      Alert.alert('Onboarding locked', 'Opening balances cannot be changed after the first digital meeting has been closed.');
      return;
    }

    for (const entry of entries) {
      if (entry.shares.trim() !== '' && (!Number.isInteger(Number(entry.shares)) || Number(entry.shares) < 0)) {
        Alert.alert('Invalid shares', `Enter a whole, non-negative share count for ${entry.memberName}.`);
        return;
      }
      if (entry.loanDueDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(entry.loanDueDate.trim())) {
        Alert.alert('Invalid due date', `Use YYYY-MM-DD for ${entry.memberName}'s loan due date.`);
        return;
      }
    }

    try {
      setSaving(true);
      await saveMemberOpeningBalances(groupId, entries.map((entry) => ({
        member_id: entry.memberId,
        opening_shares: entry.shares.trim() === '' ? null : Number(entry.shares),
        share_value: entry.shareValue.trim() === '' ? null : toAmount(entry.shareValue),
        opening_savings: entry.savingsAmount.trim() === '' ? null : toAmount(entry.savingsAmount),
        opening_loan_balance: toAmount(entry.loanBalance),
        loan_due_date: entry.loanDueDate.trim() || null,
      })));
      Alert.alert('Opening balances saved', 'Existing member balances have been saved for verification. They are not new meeting transactions.');
      await loadData();
    } catch (error) {
      Alert.alert('Could not save balances', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#16a34a" /><Text style={styles.loadingText}>Loading opening balances…</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.eyebrow}>EXISTING GROUP ONBOARDING</Text>
            <Text style={styles.title}>{groupName}</Text>
            <Text style={styles.groupNumber}>{groupNumber}</Text>
            <Text style={styles.subtitle}>Enter verified balances from the group's existing passbooks and loan records.</Text>
          </View>

          {locked ? (
            <View style={styles.lockNotice}>
              <Text style={styles.lockTitle}>🔒 Opening balances locked</Text>
              <Text style={styles.lockText}>The first digital meeting has been closed. Additional opening balances are not allowed. Use an authorised, audited adjustment for a genuine correction.</Text>
            </View>
          ) : (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Opening balances are not new savings</Text>
              <Text style={styles.noticeText}>The 1–5 shares-per-meeting rule does not apply to these historical balances. It applies to new savings at future meetings.</Text>
            </View>
          )}

          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Opening savings</Text><Text style={styles.summaryValue}>UGX {totalSavings.toLocaleString()}</Text></View>
            <View style={styles.summaryCard}><Text style={styles.summaryLabel}>Outstanding loans</Text><Text style={styles.summaryValue}>UGX {totalLoans.toLocaleString()}</Text></View>
          </View>

          {entries.length === 0 ? (
            <View style={styles.empty}><Text style={styles.emptyTitle}>No members registered</Text><Text style={styles.emptyText}>Register the group's members before entering their opening balances.</Text></View>
          ) : entries.map((entry) => (
            <View key={entry.memberId} style={styles.memberCard}>
              <Text style={styles.memberName}>{entry.memberName}</Text>
              <Text style={styles.memberNumber}>{entry.memberNumber}</Text>
              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}><Text style={styles.label}>Existing shares</Text><TextInput editable={!locked} keyboardType="number-pad" value={entry.shares} onChangeText={(v) => updateEntry(entry.memberId, 'shares', v)} placeholder="e.g. 40" style={styles.input} /></View>
                <View style={styles.fieldHalf}><Text style={styles.label}>Share value (UGX)</Text><TextInput editable={!locked} keyboardType="numeric" value={entry.shareValue} onChangeText={(v) => updateEntry(entry.memberId, 'shareValue', v)} placeholder="e.g. 2000" style={styles.input} /></View>
              </View>
              <Text style={styles.label}>Verified total savings (UGX, optional)</Text>
              <TextInput editable={!locked} keyboardType="numeric" value={entry.savingsAmount} onChangeText={(v) => updateEntry(entry.memberId, 'savingsAmount', v)} placeholder="Leave blank to calculate shares × value" style={styles.input} />
              <Text style={styles.label}>Outstanding loan balance (UGX)</Text>
              <TextInput editable={!locked} keyboardType="numeric" value={entry.loanBalance} onChangeText={(v) => updateEntry(entry.memberId, 'loanBalance', v)} placeholder="0" style={styles.input} />
              <Text style={styles.label}>Next loan due date (YYYY-MM-DD, optional)</Text>
              <TextInput editable={!locked} value={entry.loanDueDate} onChangeText={(v) => updateEntry(entry.memberId, 'loanDueDate', v)} placeholder="2026-11-01" autoCapitalize="none" style={styles.input} />
            </View>
          ))}

          {!locked && entries.length > 0 && (
            <TouchableOpacity disabled={saving} onPress={handleSave} style={[styles.saveButton, saving && styles.disabledButton]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Opening Balances</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backButtonText}>Back</Text></TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f7f5' },
  loadingText: { marginTop: 10, color: '#526052' },
  content: { padding: 16, paddingBottom: 36 },
  header: { backgroundColor: '#16a34a', borderRadius: 16, padding: 18, marginBottom: 14 },
  eyebrow: { color: '#dcfce7', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 23, fontWeight: '800', marginTop: 8 },
  groupNumber: { color: '#dcfce7', fontSize: 14, fontWeight: '700', marginTop: 3 },
  subtitle: { color: '#f0fdf4', marginTop: 10, lineHeight: 20 },
  notice: { backgroundColor: '#ecfdf5', borderColor: '#86efac', borderWidth: 1, padding: 12, borderRadius: 12, marginBottom: 14 },
  noticeTitle: { color: '#166534', fontWeight: '800', marginBottom: 4 },
  noticeText: { color: '#166534', lineHeight: 19 },
  lockNotice: { backgroundColor: '#fff1f2', borderColor: '#fda4af', borderWidth: 1, padding: 12, borderRadius: 12, marginBottom: 14 },
  lockTitle: { color: '#9f1239', fontWeight: '800', marginBottom: 4 },
  lockText: { color: '#881337', lineHeight: 19 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: { flex: 1, backgroundColor: '#fff', padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  summaryLabel: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  summaryValue: { color: '#166534', fontSize: 16, fontWeight: '800', marginTop: 7 },
  memberCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, marginBottom: 12 },
  memberName: { color: '#111827', fontSize: 16, fontWeight: '800' },
  memberNumber: { color: '#64748b', fontSize: 12, marginTop: 3, marginBottom: 12 },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldHalf: { flex: 1 },
  label: { color: '#374151', fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 5 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 9, paddingHorizontal: 11, color: '#111827', backgroundColor: '#fff' },
  saveButton: { backgroundColor: '#16a34a', minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  saveButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  disabledButton: { opacity: 0.65 },
  backButton: { alignItems: 'center', padding: 14, marginTop: 4 },
  backButtonText: { color: '#166534', fontWeight: '700' },
  empty: { backgroundColor: '#fff', padding: 22, borderRadius: 12, alignItems: 'center' },
  emptyTitle: { color: '#111827', fontWeight: '800', fontSize: 16 },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
