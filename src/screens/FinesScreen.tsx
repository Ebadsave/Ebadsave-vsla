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
  getMembersByGroupId,
  getOpenMeeting,
  recordFine,
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

const FINE_TYPES = [
  'Absence fine',
  'Late fine',
  'Non-saving fine',
  'Non-loan repayment fine',
  'Non-insurance contribution fine',
];

function formatMoney(value: number): string {
  return Number(value || 0).toLocaleString();
}

export default function FinesScreen() {
  const route = useRoute();
  const params = (route.params || {}) as RouteParams;

  const groupId = Number(params.groupId ?? 0);
  const suppliedMeetingId =
    params.meetingId === undefined || params.meetingId === null
      ? null
      : Number(params.meetingId);

  // UGX is only the default. The screen supports another currency
  // when one is supplied through navigation.
  const currency = params.currency?.trim() || 'UGX';

  const [meetingId, setMeetingId] = useState<number | null>(
    suppliedMeetingId,
  );

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(
    null,
  );

  const [fineType, setFineType] = useState(FINE_TYPES[0]);
  const [amount, setAmount] = useState('');

  const [finesBalance, setFinesBalance] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showMembers, setShowMembers] = useState(false);
  const [showFineTypes, setShowFineTypes] = useState(false);

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
        (member) =>
          !member.status ||
          String(member.status).toLowerCase() === 'active',
      );

      setMembers(activeMembers);

      if (
        selectedMemberId === null ||
        !activeMembers.some((member) => member.id === selectedMemberId)
      ) {
        setSelectedMemberId(activeMembers[0]?.id ?? null);
      }

      const finesAccount = (accountRows as FinancialAccount[]).find(
        (account) => account.account_type === 'fines',
      );

      setFinesBalance(Number(finesAccount?.balance ?? 0));
    } catch (error) {
      Alert.alert(
        'Fines',
        error instanceof Error
          ? error.message
          : 'Unable to load fines information.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, selectedMemberId, suppliedMeetingId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedMember = members.find(
    (member) => member.id === selectedMemberId,
  );

  const submitFine = async () => {
    const numericAmount = Number(
      amount.replace(/,/g, '').trim(),
    );

    if (!meetingId) {
      Alert.alert(
        'Meeting not started',
        'Start the meeting before recording a fine.',
      );
      return;
    }

    if (!selectedMemberId) {
      Alert.alert(
        'Member required',
        'Select the member who is receiving the fine.',
      );
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert(
        'Invalid amount',
        'Enter a fine amount greater than zero.',
      );
      return;
    }

    setSaving(true);

    try {
      await recordFine(
        groupId,
        numericAmount,
        fineType,
        selectedMemberId,
        meetingId,
      );

      setAmount('');

      await loadData();

      Alert.alert(
        'Fine recorded',
        `${fineType} of ${currency} ${formatMoney(
          numericAmount,
        )} has been recorded for ${selectedMember?.full_name ?? 'member'}.`,
      );
    } catch (error) {
      Alert.alert(
        'Fine failed',
        error instanceof Error
          ? error.message
          : 'Unable to record the fine.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!groupId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            Group information is missing.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16a34a" />
          <Text style={styles.loadingText}>
            Loading fines...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!meetingId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>Fines</Text>
          <Text style={styles.emptyText}>
            Start a meeting before recording fines.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Fines</Text>
          <Text style={styles.headerSubtitle}>
            Meeting #{meetingId}
          </Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>
            Fines Fund Balance
          </Text>

          <Text style={styles.balanceValue}>
            {currency} {formatMoney(finesBalance)}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>
          Select Member
        </Text>

        <TouchableOpacity
          style={styles.selector}
          onPress={() => setShowMembers(!showMembers)}
        >
          <View style={styles.selectorContent}>
            <Text style={styles.selectorMain}>
              {selectedMember
                ? selectedMember.full_name
                : 'Select member'}
            </Text>

            {selectedMember && (
              <Text style={styles.selectorSub}>
                KYA {selectedMember.member_number}
              </Text>
            )}
          </View>

          <Text style={styles.arrow}>
            {showMembers ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>

        {showMembers && (
          <View style={styles.dropdown}>
            {members.length === 0 ? (
              <Text style={styles.noMembers}>
                No active members available.
              </Text>
            ) : (
              members.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={[
                    styles.memberOption,
                    selectedMemberId === member.id &&
                      styles.selectedOption,
                  ]}
                  onPress={() => {
                    setSelectedMemberId(member.id);
                    setShowMembers(false);
                  }}
                >
                  <Text style={styles.memberName}>
                    {member.full_name}
                  </Text>

                  <Text style={styles.memberNumber}>
                    KYA {member.member_number}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Fine Type
        </Text>

        <TouchableOpacity
          style={styles.selector}
          onPress={() => setShowFineTypes(!showFineTypes)}
        >
          <Text style={styles.selectorMain}>
            {fineType}
          </Text>

          <Text style={styles.arrow}>
            {showFineTypes ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>

        {showFineTypes && (
          <View style={styles.dropdown}>
            {FINE_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.memberOption,
                  fineType === type &&
                    styles.selectedOption,
                ]}
                onPress={() => {
                  setFineType(type);
                  setShowFineTypes(false);
                }}
              >
                <Text style={styles.memberName}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Fine Amount
        </Text>

        <View style={styles.amountContainer}>
          <Text style={styles.currencyLabel}>
            {currency}
          </Text>

          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
          />
        </View>

        <TouchableOpacity
          style={[
            styles.saveButton,
            saving && styles.saveButtonDisabled,
          ]}
          onPress={submitFine}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>
              Record Fine
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  container: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },

  headerTitle: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
  },

  headerSubtitle: {
    marginTop: 5,
    color: '#ffffff',
    fontSize: 14,
  },

  balanceCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 14,
    padding: 18,
    marginBottom: 22,
  },

  balanceLabel: {
    fontSize: 14,
    color: '#166534',
    fontWeight: '600',
  },

  balanceValue: {
    marginTop: 6,
    fontSize: 23,
    fontWeight: '700',
    color: '#15803d',
  },

  sectionTitle: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  selector: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
  },

  selectorContent: {
    flex: 1,
  },

  selectorMain: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },

  selectorSub: {
    marginTop: 3,
    fontSize: 13,
    color: '#6b7280',
  },

  arrow: {
    fontSize: 14,
    color: '#16a34a',
    marginLeft: 10,
  },

  dropdown: {
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },

  memberOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },

  selectedOption: {
    backgroundColor: '#f0fdf4',
  },

  memberName: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },

  memberNumber: {
    marginTop: 3,
    fontSize: 13,
    color: '#6b7280',
  },

  noMembers: {
    padding: 15,
    color: '#6b7280',
    textAlign: 'center',
  },

  amountContainer: {
    height: 58,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },

  currencyLabel: {
    paddingLeft: 15,
    paddingRight: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#16a34a',
  },

  amountInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 8,
    fontSize: 18,
    color: '#111827',
  },

  saveButton: {
    height: 56,
    marginTop: 25,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#16a34a',
  },

  loadingText: {
    marginTop: 10,
    color: '#374151',
  },

  emptyText: {
    marginTop: 10,
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
  },

  errorText: {
    fontSize: 16,
    color: '#dc2626',
    textAlign: 'center',
  },
});
