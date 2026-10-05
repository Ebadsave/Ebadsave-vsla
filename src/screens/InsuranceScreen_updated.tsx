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
  getInsuranceBenefitAvailability,
  getMembersByGroupId,
  getNextOfKin,
  recordInsuranceBenefit,
  recordInsuranceContribution,
  recordNextOfKinBenefit,
} from '../database/database';

interface RouteParams {
  groupId?: number;
  meetingId?: number | null;
  currency?: string;
}

type Member = {
  id: number;
  group_id: number;
  member_number: string | number;
  full_name: string;
  status?: string;
};

type Kin = {
  id?: number;
  member_id?: number;
  slot: number | null;
  name: string | null;
  phone?: string | null;
  gender?: string | null;
  benefit_received?: number | null;
  locked?: number | null;
};

type MemberWithKin = Member & {
  kin: Kin[];
};

type BenefitSlot = 1 | 2 | 3;

export default function InsuranceScreen() {
  const route = useRoute();
  const params = (route.params || {}) as RouteParams;

  const initialGroupId = Number(params.groupId || 0);
  const meetingId = params.meetingId ?? null;
  const currency = params.currency || 'UGX';

  const [groupId, setGroupId] = useState(
    initialGroupId > 0 ? String(initialGroupId) : '',
  );
  const [members, setMembers] = useState<MemberWithKin[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [contributionAmount, setContributionAmount] = useState('');
  const [benefitAmount, setBenefitAmount] = useState('');
  const [benefitReason, setBenefitReason] = useState('');
  const [insuranceBalance, setInsuranceBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savingContribution, setSavingContribution] = useState(false);
  const [savingBenefit, setSavingBenefit] = useState(false);
  const [savingSlot, setSavingSlot] = useState<BenefitSlot | null>(null);

  const selectedMember = members.find(
    (member) => member.id === selectedMemberId,
  );

  const refreshInsuranceBalance = useCallback(async (id: number) => {
    const accounts = await getFinancialAccounts(id);
    const account = accounts.find(
      (item) => item.account_type === 'insurance_fund',
    );
    setInsuranceBalance(Number(account?.balance ?? 0));
  }, []);

  const loadMembers = useCallback(async () => {
    const id = Number(groupId);
    if (!Number.isInteger(id) || id <= 0) {
      Alert.alert('Invalid Group', 'A valid group is required.');
      return;
    }

    try {
      setLoading(true);
      const groupMembers = (await getMembersByGroupId(id)) as Member[];

      const membersWithKin: MemberWithKin[] = await Promise.all(
        groupMembers
          .filter(
            (member) =>
              !member.status ||
              String(member.status).toLowerCase() === 'active',
          )
          .map(async (member) => {
            const kin = await getNextOfKin(member.id);
            return {
              ...member,
              kin: Array.isArray(kin) ? (kin as Kin[]) : [],
            };
          }),
      );

      setMembers(membersWithKin);
      setSelectedMemberId(null);
      await refreshInsuranceBalance(id);
    } catch (error) {
      Alert.alert(
        'Unable to Load Insurance',
        error instanceof Error ? error.message : 'Failed to load insurance data.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, refreshInsuranceBalance]);

  useEffect(() => {
    if (initialGroupId > 0) {
      void loadMembers();
    }
  }, [initialGroupId, loadMembers]);

  const getKinForSlot = (member: MemberWithKin, slot: BenefitSlot) =>
    member.kin.find((item) => Number(item.slot) === slot);

  const getSlotOpen = async (memberId: number, slot: BenefitSlot) => {
    const availability = await getInsuranceBenefitAvailability(memberId);
    const result = availability.slots.find((item) => item.slot === slot);
    return Boolean(result?.open);
  };

  const handleContribution = () => {
    if (!selectedMember) {
      Alert.alert('Select Member', 'Select a member before recording a contribution.');
      return;
    }

    const amount = Number(contributionAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a contribution greater than zero.');
      return;
    }

    Alert.alert(
      'Confirm Insurance Contribution',
      `${currency} ${amount.toLocaleString()} for ${selectedMember.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => void saveContribution(amount) },
      ],
    );
  };

  const saveContribution = async (amount: number) => {
    if (!selectedMember) return;

    try {
      setSavingContribution(true);
      await recordInsuranceContribution(
        Number(groupId),
        selectedMember.id,
        amount,
        meetingId,
      );
      setContributionAmount('');
      await refreshInsuranceBalance(Number(groupId));
      Alert.alert('Success', 'Insurance contribution recorded.');
    } catch (error) {
      Alert.alert(
        'Contribution Failed',
        error instanceof Error ? error.message : 'Unable to record contribution.',
      );
    } finally {
      setSavingContribution(false);
    }
  };

  const handleMemberBenefit = () => {
    if (!selectedMember) {
      Alert.alert('Select Member', 'Select a member before recording a benefit.');
      return;
    }

    const amount = Number(benefitAmount);
    const reason = benefitReason.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a benefit greater than zero.');
      return;
    }

    if (!reason) {
      Alert.alert('Reason Required', 'Enter the reason for the individual member benefit.');
      return;
    }

    Alert.alert(
      'Confirm Member Benefit',
      `${currency} ${amount.toLocaleString()} for ${selectedMember.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => void saveMemberBenefit(amount, reason) },
      ],
    );
  };

  const saveMemberBenefit = async (amount: number, reason: string) => {
    if (!selectedMember) return;

    try {
      setSavingBenefit(true);
      await recordInsuranceBenefit(
        Number(groupId),
        selectedMember.id,
        amount,
        reason,
        meetingId,
      );
      setBenefitAmount('');
      setBenefitReason('');
      await refreshInsuranceBalance(Number(groupId));
      Alert.alert('Success', 'Individual member insurance benefit recorded.');
    } catch (error) {
      Alert.alert(
        'Benefit Failed',
        error instanceof Error ? error.message : 'Unable to record member benefit.',
      );
    } finally {
      setSavingBenefit(false);
    }
  };

  const handleSlotBenefit = (slot: BenefitSlot) => {
    if (!selectedMember) {
      Alert.alert('Select Member', 'Select a member before recording a benefit.');
      return;
    }

    const amount = Number(benefitAmount);
    const reason = benefitReason.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a benefit greater than zero.');
      return;
    }

    if (!reason) {
      Alert.alert('Reason Required', 'Enter the reason for the benefit.');
      return;
    }

    Alert.alert(
      `Confirm Slot ${slot} Benefit`,
      `${currency} ${amount.toLocaleString()} for ${selectedMember.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => void saveSlotBenefit(slot, amount, reason),
        },
      ],
    );
  };

  const saveSlotBenefit = async (
    slot: BenefitSlot,
    amount: number,
    reason: string,
  ) => {
    if (!selectedMember) return;

    try {
      setSavingSlot(slot);

      const open = await getSlotOpen(selectedMember.id, slot);
      if (!open) {
        Alert.alert(
          'Benefit Not Available',
          `Slot ${slot} is not open for this member.`,
        );
        return;
      }

      await recordNextOfKinBenefit(
        selectedMember.id,
        slot,
        amount,
        reason,
        0,
      );

      setBenefitAmount('');
      setBenefitReason('');
      await refreshInsuranceBalance(Number(groupId));

      const kin = await getNextOfKin(selectedMember.id);
      setMembers((current) =>
        current.map((member) =>
          member.id === selectedMember.id
            ? { ...member, kin: (kin as Kin[]) || [] }
            : member,
        ),
      );

      Alert.alert(
        'Success',
        `Slot ${slot} insurance benefit recorded. ${slot === 3 ? 'Slot 3 remains OPEN for the active member.' : 'This slot is now locked according to the existing rule.'}`,
      );
    } catch (error) {
      Alert.alert(
        'Slot Benefit Failed',
        error instanceof Error ? error.message : 'Unable to record slot benefit.',
      );
    } finally {
      setSavingSlot(null);
    }
  };

  const renderSlot = (member: MemberWithKin, slot: BenefitSlot) => {
    const kin = getKinForSlot(member, slot);
    const isSlot3 = slot === 3;
    const locked = !isSlot3 && Number(kin?.locked ?? 0) === 1;
    const open = isSlot3 ? true : !locked && Number(kin?.benefit_received ?? 0) !== 1;

    return (
      <View style={styles.slot}>
        <View style={styles.slotHeader}>
          <Text style={styles.slotTitle}>Slot {slot} — Next of Kin</Text>
          <Text style={[styles.status, open ? styles.openStatus : styles.expiredStatus]}>
            {open ? 'OPEN' : 'LOCKED'}
          </Text>
        </View>

        {kin?.name ? (
          <>
            <Text style={styles.kinName}>{kin.name}</Text>
            {kin.phone ? <Text style={styles.kinDetails}>Phone: {kin.phone}</Text> : null}
            {kin.gender ? <Text style={styles.kinDetails}>Gender: {kin.gender}</Text> : null}
          </>
        ) : (
          <Text style={styles.emptyText}>No next of kin assigned</Text>
        )}

        <Text style={styles.openNote}>
          {isSlot3
            ? 'Open for recurring benefits while the member is active. It is not locked after payment.'
            : open
              ? 'Open for this member.'
              : 'This slot has already received a benefit.'}
        </Text>

        <TouchableOpacity
          style={[styles.slotButton, (!open || savingSlot !== null) && styles.disabledButton]}
          disabled={!open || savingSlot !== null}
          onPress={() => handleSlotBenefit(slot)}
        >
          {savingSlot === slot ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Pay Slot {slot} Benefit</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Insurance</Text>
        <Text style={styles.subtitle}>Insurance Fund • {currency}</Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Insurance Fund Balance</Text>
          <Text style={styles.balanceValue}>
            {currency} {insuranceBalance.toLocaleString()}
          </Text>
        </View>

        <View style={styles.groupCard}>
          <Text style={styles.label}>Group ID</Text>
          <TextInput
            style={styles.input}
            value={groupId}
            onChangeText={setGroupId}
            placeholder="Enter group ID"
            keyboardType="number-pad"
          />
          <TouchableOpacity
            style={[styles.loadButton, loading && styles.disabledButton]}
            onPress={() => void loadMembers()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Load Group Members</Text>
            )}
          </TouchableOpacity>
        </View>

        {members.length === 0 && !loading ? (
          <Text style={styles.emptyGroupText}>No active members loaded.</Text>
        ) : null}

        {members.map((member) => {
          const selected = selectedMemberId === member.id;
          return (
            <TouchableOpacity
              key={member.id}
              activeOpacity={0.9}
              onPress={() => setSelectedMemberId(member.id)}
              style={[styles.memberCard, selected && styles.selectedMemberCard]}
            >
              <View style={styles.memberHeader}>
                <View style={styles.memberHeaderText}>
                  <Text style={styles.memberNumber}>KYA {member.member_number}</Text>
                  <Text style={styles.memberName}>{member.full_name}</Text>
                </View>
                <Text style={[styles.selectBadge, selected && styles.selectedBadge]}>
                  {selected ? 'SELECTED' : 'SELECT'}
                </Text>
              </View>

              {selected ? (
                <View>
                  <Text style={styles.memberSectionTitle}>Insurance Contribution</Text>
                  <TextInput
                    style={styles.input}
                    value={contributionAmount}
                    onChangeText={setContributionAmount}
                    placeholder={`Amount in ${currency}`}
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity
                    style={[styles.actionButton, savingContribution && styles.disabledButton]}
                    disabled={savingContribution}
                    onPress={handleContribution}
                  >
                    {savingContribution ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.buttonText}>Record Contribution</Text>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.memberSectionTitle}>Member / Individual Benefit</Text>
                  <Text style={styles.openNote}>
                    OPEN while this member is active. This individual benefit is not locked by the screen.
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={benefitAmount}
                    onChangeText={setBenefitAmount}
                    placeholder={`Benefit amount in ${currency}`}
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={[styles.input, styles.reasonInput]}
                    value={benefitReason}
                    onChangeText={setBenefitReason}
                    placeholder="Reason for benefit"
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.actionButton, savingBenefit && styles.disabledButton]}
                    disabled={savingBenefit}
                    onPress={handleMemberBenefit}
                  >
                    {savingBenefit ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.buttonText}>Pay Individual Member Benefit</Text>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.memberSectionTitle}>Next-of-Kin Benefit Slots</Text>
                  {renderSlot(member, 1)}
                  {renderSlot(member, 2)}
                  {renderSlot(member, 3)}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: '#16a34a', textAlign: 'center' },
  subtitle: { marginTop: 5, marginBottom: 18, fontSize: 16, color: '#374151', textAlign: 'center' },
  balanceCard: { padding: 18, marginBottom: 16, borderRadius: 12, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  balanceLabel: { fontSize: 14, fontWeight: '600', color: '#166534' },
  balanceValue: { marginTop: 5, fontSize: 25, fontWeight: '800', color: '#15803d' },
  groupCard: { padding: 16, marginBottom: 16, borderRadius: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
  label: { marginBottom: 6, fontSize: 14, fontWeight: '600', color: '#374151' },
  input: { minHeight: 48, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, backgroundColor: '#ffffff', color: '#111827', fontSize: 16 },
  reasonInput: { minHeight: 80, textAlignVertical: 'top' },
  loadButton: { height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#16a34a' },
  actionButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginBottom: 16, borderRadius: 8, backgroundColor: '#16a34a' },
  slotButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 8, backgroundColor: '#16a34a' },
  disabledButton: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  emptyGroupText: { marginBottom: 16, textAlign: 'center', color: '#6b7280' },
  memberCard: { marginBottom: 14, padding: 16, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d1d5db' },
  selectedMemberCard: { borderColor: '#16a34a', borderWidth: 2 },
  memberHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberHeaderText: { flex: 1 },
  memberNumber: { fontSize: 13, fontWeight: '700', color: '#16a34a' },
  memberName: { marginTop: 3, fontSize: 19, fontWeight: '700', color: '#111827' },
  selectBadge: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, color: '#166534', backgroundColor: '#dcfce7', fontSize: 10, fontWeight: '800' },
  selectedBadge: { color: '#ffffff', backgroundColor: '#16a34a' },
  memberSectionTitle: { marginTop: 14, marginBottom: 8, fontSize: 15, fontWeight: '700', color: '#374151' },
  slot: { marginTop: 8, padding: 12, borderRadius: 9, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
  slotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slotTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
  status: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden', fontSize: 11, fontWeight: '700' },
  openStatus: { color: '#166534', backgroundColor: '#dcfce7' },
  expiredStatus: { color: '#991b1b', backgroundColor: '#fee2e2' },
  kinName: { marginTop: 7, fontSize: 15, fontWeight: '600', color: '#111827' },
  kinDetails: { marginTop: 3, fontSize: 13, color: '#4b5563' },
  emptyText: { marginTop: 6, fontSize: 13, color: '#6b7280', fontStyle: 'italic' },
  openNote: { marginTop: 6, marginBottom: 4, fontSize: 12, color: '#166534' },
});
