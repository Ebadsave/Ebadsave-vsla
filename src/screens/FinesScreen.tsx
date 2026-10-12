import React, { useCallback, useEffect, useState } from 'react';
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
  getFinancialAccounts,
  getMemberOutstandingFineTotal,
  getMembersByGroupId,
  getOpenMeeting,
  recordFinePayment,
} from '../database/database';

interface RouteParams {
  groupId?: number;
  meetingId?: number | null;
  currency?: string;
}

interface Member {
  id: number;
  member_number: string | number;
  full_name: string;
  status?: string;
}

interface FinancialAccount {
  account_type: string;
  balance: number;
}

const formatMoney = (value: number): string =>
  Number(value || 0).toLocaleString();

export default function FinesScreen() {
  const route = useRoute();
  const params = (route.params || {}) as RouteParams;
  const groupId = Number(params.groupId ?? 0);
  const suppliedMeetingId = params.meetingId == null
    ? null
    : Number(params.meetingId);
  const currency = params.currency?.trim() || 'UGX';

  const [meetingId, setMeetingId] = useState<number | null>(suppliedMeetingId);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [outstandingFine, setOutstandingFine] = useState(0);
  const [amount, setAmount] = useState('');
  const [finesBalance, setFinesBalance] = useState(0);
  const [showMembers, setShowMembers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedMember = members.find((member) => member.id === selectedMemberId);

  const loadData = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let activeMeetingId = suppliedMeetingId;
      if (activeMeetingId === null) {
        const openMeeting = await getOpenMeeting(groupId);
        activeMeetingId = openMeeting?.id ?? null;
      }
      setMeetingId(activeMeetingId);

      const [memberRows, accountRows] = await Promise.all([
        getMembersByGroupId(groupId),
        getFinancialAccounts(groupId),
      ]);
      const activeMembers = (memberRows as Member[]).filter(
        (member) => !member.status || String(member.status).toLowerCase() === 'active',
      );
      setMembers(activeMembers);
      if (selectedMemberId === null || !activeMembers.some((member) => member.id === selectedMemberId)) {
        setSelectedMemberId(activeMembers[0]?.id ?? null);
      }
      const finesAccount = (accountRows as FinancialAccount[]).find(
        (account) => account.account_type === 'fines',
      );
      setFinesBalance(Number(finesAccount?.balance ?? 0));
    } catch (error) {
      Alert.alert(
        'Fine Payments',
        error instanceof Error ? error.message : 'Unable to load fine payment information.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, selectedMemberId, suppliedMeetingId]);

  const loadSelectedMemberFine = useCallback(async (memberId: number) => {
    try {
      const balance = await getMemberOutstandingFineTotal(groupId, memberId);
      setOutstandingFine(Number(balance) || 0);
    } catch (error) {
      setOutstandingFine(0);
      Alert.alert(
        'Fine Balance',
        error instanceof Error ? error.message : 'Unable to load this member’s outstanding fines.',
      );
    }
  }, [groupId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (groupId && selectedMemberId !== null) {
      void loadSelectedMemberFine(selectedMemberId);
    } else {
      setOutstandingFine(0);
    }
  }, [groupId, selectedMemberId, loadSelectedMemberFine]);

  async function handleFinePayment() {
    if (!meetingId) {
      Alert.alert('Meeting not started', 'Start a meeting before recording a fine payment.');
      return;
    }
    if (selectedMemberId === null) {
      Alert.alert('Member required', 'Select the member making the fine payment.');
      return;
    }

    const numericAmount = Number(amount.replace(/,/g, '').trim());
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a fine payment greater than zero.');
      return;
    }
    if (outstandingFine <= 0) {
      Alert.alert('No outstanding fine', 'This member has no unpaid fines. Fines are assessed automatically from roll call and meeting activity.');
      return;
    }
    if (numericAmount > outstandingFine) {
      Alert.alert(
        'Payment exceeds balance',
        `The member's outstanding fine balance is ${currency} ${formatMoney(outstandingFine)}.`,
      );
      return;
    }

    Alert.alert(
      'Confirm Fine Payment',
      `Member: ${selectedMember?.full_name ?? 'Member'}\nOutstanding fine: ${currency} ${formatMoney(outstandingFine)}\nPayment: ${currency} ${formatMoney(numericAmount)}\nRemaining: ${currency} ${formatMoney(outstandingFine - numericAmount)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Payment',
          onPress: async () => {
            try {
              setSaving(true);
              await recordFinePayment(groupId, selectedMemberId, numericAmount, meetingId);
              setAmount('');
              await loadSelectedMemberFine(selectedMemberId);
              await loadData();
              Alert.alert('Payment saved', `Fine payment of ${currency} ${formatMoney(numericAmount)} recorded for ${selectedMember?.full_name ?? 'the member'}.`);
            } catch (error) {
              Alert.alert(
                'Fine Payment Failed',
                error instanceof Error ? error.message : 'Unable to record the fine payment.',
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16a34a" />
          <Text style={styles.muted}>Loading fine payments...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!groupId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Group information is missing.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Fine Payment</Text>
          <Text style={styles.subtitle}>
            {meetingId ? `Meeting #${meetingId}` : 'No open meeting'}
          </Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.label}>Fines Fund Balance</Text>
          <Text style={styles.fundBalance}>{currency} {formatMoney(finesBalance)}</Text>
        </View>

        <Text style={styles.sectionTitle}>Select Member</Text>
        <TouchableOpacity style={styles.selector} onPress={() => setShowMembers((visible) => !visible)}>
          <View>
            <Text style={styles.memberName}>{selectedMember?.full_name ?? 'Select member'}</Text>
            {selectedMember && <Text style={styles.memberNumber}>KYA {selectedMember.member_number}</Text>}
          </View>
          <Text style={styles.arrow}>{showMembers ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showMembers && (
          <View style={styles.dropdown}>
            {members.length === 0 ? (
              <Text style={styles.muted}>No active members available.</Text>
            ) : members.map((member) => (
              <TouchableOpacity
                key={member.id}
                style={[styles.memberOption, member.id === selectedMemberId && styles.selectedOption]}
                onPress={() => {
                  setSelectedMemberId(member.id);
                  setAmount('');
                  setShowMembers(false);
                }}
              >
                <Text style={styles.memberName}>{member.full_name}</Text>
                <Text style={styles.memberNumber}>KYA {member.member_number}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.outstandingCard}>
          <Text style={styles.label}>Outstanding Fines</Text>
          <Text style={styles.outstandingValue}>{currency} {formatMoney(outstandingFine)}</Text>
          <Text style={styles.hint}>Fine assessments are generated automatically from roll call and meeting activity. This screen records payment only.</Text>
        </View>

        <Text style={styles.sectionTitle}>Fine Payment Amount</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={(text) => setAmount(text.replace(/[^0-9.]/g, ''))}
          placeholder="Enter amount to pay"
          placeholderTextColor="#6b7280"
          keyboardType="numeric"
          editable={!saving}
        />

        <TouchableOpacity
          style={[styles.payButton, (saving || !meetingId || selectedMemberId === null || outstandingFine <= 0) && styles.disabledButton]}
          onPress={handleFinePayment}
          disabled={saving || !meetingId || selectedMemberId === null || outstandingFine <= 0}
        >
          {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Record Fine Payment</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  container: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: { backgroundColor: '#16a34a', borderRadius: 14, padding: 20, marginBottom: 16 },
  title: { color: '#ffffff', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#ffffff', fontSize: 14, marginTop: 5 },
  balanceCard: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  label: { color: '#475569', fontSize: 14 },
  fundBalance: { color: '#166534', fontSize: 24, fontWeight: '700', marginTop: 4 },
  sectionTitle: { color: '#166534', fontSize: 16, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  selector: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberName: { color: '#111827', fontSize: 16, fontWeight: '600' },
  memberNumber: { color: '#16a34a', fontSize: 13, marginTop: 3 },
  arrow: { color: '#475569', fontSize: 14 },
  dropdown: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, marginTop: 6, overflow: 'hidden' },
  memberOption: { padding: 13, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  selectedOption: { backgroundColor: '#f0fdf4' },
  outstandingCard: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16, marginTop: 20 },
  outstandingValue: { color: '#166534', fontSize: 25, fontWeight: '700', marginTop: 4 },
  hint: { color: '#475569', fontSize: 13, lineHeight: 19, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827', marginTop: 4 },
  payButton: { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  disabledButton: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  muted: { color: '#64748b', marginTop: 8 },
  errorText: { color: '#b91c1c', fontSize: 16 },
});
