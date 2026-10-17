import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect, useRoute } from '@react-navigation/native';

import {
  getFinancialAccounts,
  getInsuranceContributionStatus,
  getMembersByGroupId,
  getNextOfKin,
  getOpenMeeting,
  getVSLASetupRules,
  recordInsuranceGroupBenefit,
  recordInsuranceContribution,
  recordInsuranceKinBenefit,
  requestNextOfKinChange,
  type GroupMeetingRecord,
  type MemberRecord,
  type NextOfKinRecord,
  type VSLASetupRuleRecord,
} from '../database/database';

type RouteParams = {
  groupId?: number;
  executiveMemberId?: number;
  currency?: string;
};

type BenefitSlot = 1 | 2 | 3;
type InsuranceMember = MemberRecord & {
  kin: NextOfKinRecord[];
  contributedThisMeeting: boolean;
  contributionAmount: number;
};

const money = (currency: string, amount: number) =>
  `${currency} ${Number(amount || 0).toLocaleString()}`;

export default function InsuranceScreen() {
  const route = useRoute();
  const params = (route.params || {}) as RouteParams;
  const groupId = Number(params.groupId || 0);
  const currency = params.currency || 'UGX';

  const [members, setMembers] = useState<InsuranceMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [rules, setRules] = useState<VSLASetupRuleRecord | null>(null);
  const [meeting, setMeeting] = useState<GroupMeetingRecord | null>(null);
  const [insuranceBalance, setInsuranceBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savingContributionId, setSavingContributionId] = useState<number | null>(null);
  const [savingPayout, setSavingPayout] = useState(false);
  const [savingGroupPayout, setSavingGroupPayout] = useState(false);
  const [benefitAmount, setBenefitAmount] = useState('');
  const [benefitReason, setBenefitReason] = useState('');
  const [recipientGroupName, setRecipientGroupName] = useState('');
  const [groupBenefitAmount, setGroupBenefitAmount] = useState('');
  const [groupBenefitReason, setGroupBenefitReason] = useState('');
  const [editingSlot, setEditingSlot] = useState<BenefitSlot | null>(null);
  const [replacementName, setReplacementName] = useState('');
  const [replacementPhone, setReplacementPhone] = useState('');
  const [savingKin, setSavingKin] = useState(false);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );
  const agreedContribution = Number(rules?.insurance_contribution_amount ?? 0);

  const loadData = useCallback(async () => {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      Alert.alert('Insurance', 'A valid group is required to open Insurance.');
      return;
    }

    try {
      setLoading(true);
      const [loadedMembers, loadedRules, openMeeting, accounts] = await Promise.all([
        getMembersByGroupId(groupId),
        getVSLASetupRules(groupId),
        getOpenMeeting(groupId),
        getFinancialAccounts(groupId),
      ]);

      const contributionStatus =
        openMeeting && Number(loadedRules?.insurance_contribution_amount ?? 0) > 0
          ? await getInsuranceContributionStatus(groupId, openMeeting.id)
          : [];
      const statusByMember = new Map<number, (typeof contributionStatus)[number]>(
        contributionStatus.map((item) => [item.member_id, item] as const),
      );

      const withKin: InsuranceMember[] = await Promise.all(
        loadedMembers
          .filter((member) => String(member.status).toLowerCase() === 'active')
          .map(async (member) => {
            const kin = await getNextOfKin(member.id);
            const status = statusByMember.get(member.id);
            return {
              ...member,
              kin,
              contributedThisMeeting: Boolean(status?.contributed),
              contributionAmount: Number(status?.contribution_amount ?? 0),
            };
          }),
      );

      setRules(loadedRules);
      setMeeting(openMeeting);
      setMembers(withKin);
      setSelectedMemberId((current) =>
        current !== null && withKin.some((member) => member.id === current)
          ? current
          : null,
      );
      setInsuranceBalance(
        Number(accounts.find((account) => account.account_type === 'insurance_fund')?.balance ?? 0),
      );
    } catch (error) {
      console.error('Failed to load insurance data:', error);
      Alert.alert(
        'Unable to Load Insurance',
        error instanceof Error ? error.message : 'Failed to load insurance data from the database.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const refreshSelectedKin = async (memberId: number) => {
    const kin = await getNextOfKin(memberId);
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId ? { ...member, kin } : member,
      ),
    );
  };

  const confirmContribution = (member: InsuranceMember) => {
    if (!meeting) {
      Alert.alert('No Open Meeting', 'Start a group meeting before recording insurance contributions.');
      return;
    }
    if (!Number.isFinite(agreedContribution) || agreedContribution <= 0) {
      Alert.alert(
        'Insurance Amount Not Set',
        'Open Setup Rules and set the agreed insurance contribution per member first.',
      );
      return;
    }
    if (member.contributedThisMeeting) {
      Alert.alert('Already Paid', `${member.full_name} has already contributed to the current insurance collection cycle. Another contribution is due only after a benefit is disbursed.`);
      return;
    }

    Alert.alert(
      'Confirm Insurance Contribution',
      `Record the setup-defined contribution of ${money(currency, agreedContribution)} for ${member.full_name}? This member can contribute again only after an insurance benefit has been disbursed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Record', onPress: () => void saveContribution(member) },
      ],
    );
  };

  const saveContribution = async (member: InsuranceMember) => {
    if (!meeting || agreedContribution <= 0) return;
    try {
      setSavingContributionId(member.id);
      await recordInsuranceContribution(groupId, member.id, agreedContribution, meeting.id);
      await loadData();
      Alert.alert(
        'Contribution Recorded',
        `${member.full_name} paid ${money(currency, agreedContribution)} into the current insurance collection cycle. This member is not charged again until an insurance benefit has been disbursed.`,
      );
    } catch (error) {
      Alert.alert(
        'Contribution Failed',
        error instanceof Error ? error.message : 'Unable to record the insurance contribution.',
      );
    } finally {
      setSavingContributionId(null);
    }
  };

  const startReplaceKin = (slot: BenefitSlot) => {
    if (!selectedMember) return;
    const existing = selectedMember.kin.find((item) => Number(item.slot) === slot);
    const locked = slot !== 3 && (
      Number(existing?.locked ?? 0) === 1 ||
      Number(existing?.benefit_received ?? 0) === 1
    );
    if (locked) {
      Alert.alert(
        'Permanently Locked',
        `Slot ${slot} has already paid a benefit. It cannot be edited, replaced, reopened, or reused.`,
      );
      return;
    }
    setEditingSlot(slot);
    setReplacementName(existing?.name ?? '');
    setReplacementPhone(existing?.phone ?? '');
  };

  const saveReplacementKin = async () => {
    if (!selectedMember || editingSlot === null) return;
    if (!replacementName.trim() || !replacementPhone.trim()) {
      Alert.alert('Required', 'Enter the replacement next-of-kin full name and phone number.');
      return;
    }
    try {
      setSavingKin(true);
      await requestNextOfKinChange(
        selectedMember.id,
        editingSlot,
        replacementName.trim(),
        replacementPhone.trim(),
        null,
        'Next-of-kin contact added or replaced by the group executive.',
        0,
      );
      await refreshSelectedKin(selectedMember.id);
      setEditingSlot(null);
      setReplacementName('');
      setReplacementPhone('');
      Alert.alert(
        'Next of Kin Updated',
        editingSlot === 3
          ? 'Slot 3 has been updated. Slot 3 remains reusable after benefits are paid.'
          : `Slot ${editingSlot} has been updated. Slots 1 and 2 can only be edited before a benefit is paid; after payout, each slot is permanently locked.`,
      );
    } catch (error) {
      Alert.alert(
        'Update Failed',
        error instanceof Error ? error.message : 'Unable to update next-of-kin contact.',
      );
    } finally {
      setSavingKin(false);
    }
  };

  const confirmPayout = (slot: BenefitSlot) => {
    if (!selectedMember) {
      Alert.alert('Select Member', 'Select the member whose insurance entitlement is being used.');
      return;
    }
    if (!meeting) {
      Alert.alert('No Open Meeting', 'Insurance benefits can only be disbursed during an open group meeting.');
      return;
    }
    if (!selectedMember.contributedThisMeeting) {
      Alert.alert(
        'Not Eligible',
        `${selectedMember.full_name} has not paid the agreed insurance contribution for the current collection cycle. No insurance benefit can be paid to or through this member.`,
      );
      return;
    }

    const amount = Number(benefitAmount.trim());
    const reason = benefitReason.trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a benefit amount greater than zero.');
      return;
    }
    if (!reason) {
      Alert.alert('Reason Required', 'Enter the reason for the insurance disbursement.');
      return;
    }
    if (amount > insuranceBalance) {
      Alert.alert('Insufficient Insurance Fund', 'The benefit cannot be greater than the current Insurance Fund balance.');
      return;
    }

    const mandatoryKin = [1, 2].map((requiredSlot) =>
      selectedMember.kin.find((item) => Number(item.slot) === requiredSlot),
    );
    if (mandatoryKin.some((kin) => !kin?.name?.trim() || !kin?.phone?.trim())) {
      Alert.alert(
        'Required Next of Kin Missing',
        'Complete both required next-of-kin contacts in Slots 1 and 2, including each phone number, before any insurance benefit can be disbursed.',
      );
      return;
    }

    const kin = selectedMember.kin.find((item) => Number(item.slot) === slot);
    if (!kin?.name?.trim()) {
      Alert.alert('Beneficiary Required', `Add a named next-of-kin beneficiary to slot ${slot} before disbursing a benefit.`);
      return;
    }
    if (slot !== 3 && (Number(kin.locked) === 1 || Number(kin.benefit_received) === 1)) {
      Alert.alert('Permanently Locked', `Slot ${slot} has already received a benefit and cannot be used again.`);
      return;
    }
    const beneficiary = `Slot ${slot} — ${kin.name}`;

    Alert.alert(
      'Confirm Insurance Disbursement',
      `Member: ${selectedMember.full_name}\nBeneficiary: ${beneficiary}\nAmount: ${money(currency, amount)}\nReason: ${reason}\n\nThe Insurance Fund will be debited. A group-wide notification will be queued, and a new contribution cycle begins after this benefit is disbursed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disburse', style: 'destructive', onPress: () => void savePayout(slot, amount, reason, beneficiary) },
      ],
    );
  };

  const savePayout = async (
    slot: BenefitSlot,
    amount: number,
    reason: string,
    beneficiary: string,
  ) => {
    if (!selectedMember || !meeting) return;
    try {
      setSavingPayout(true);
      await recordInsuranceKinBenefit(
        groupId,
        selectedMember.id,
        slot,
        amount,
        reason,
        meeting.id,
      );

      setBenefitAmount('');
      setBenefitReason('');
      await loadData();
      await refreshSelectedKin(selectedMember.id);
      Alert.alert(
        'Insurance Benefit Disbursed',
        `${money(currency, amount)} was recorded for ${beneficiary}. Reason: ${reason}. The Insurance Fund has been debited and a group-wide notification has been queued. Each member can contribute again after this benefit has been disbursed.`,
      );
    } catch (error) {
      Alert.alert(
        'Disbursement Failed',
        error instanceof Error ? error.message : 'Unable to disburse the insurance benefit.',
      );
    } finally {
      setSavingPayout(false);
    }
  };

  const confirmGroupPayout = () => {
    if (!meeting) {
      Alert.alert('No Open Meeting', 'Start a group meeting before recording the Slot 4 disbursement.');
      return;
    }
    if (agreedContribution <= 0) {
      Alert.alert('Insurance Amount Not Set', 'Set the agreed insurance contribution in Setup Rules before a Slot 4 disbursement.');
      return;
    }
    if (!Number.isInteger(Number(params.executiveMemberId)) || Number(params.executiveMemberId) <= 0) {
      Alert.alert('Executive Required', 'An active executive must authorize the Slot 4 group-to-group disbursement.');
      return;
    }

    const target = recipientGroupName.trim();
    const amount = Number(groupBenefitAmount.trim());
    const reason = groupBenefitReason.trim();
    if (!target) {
      Alert.alert('Recipient Group Required', 'Enter the name of the other group receiving the insurance benefit.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a whole-sum disbursement amount greater than zero.');
      return;
    }
    if (!reason) {
      Alert.alert('Reason Required', 'Enter the reason for the group-to-group insurance disbursement.');
      return;
    }
    if (amount > insuranceBalance) {
      Alert.alert('Insufficient Insurance Fund', 'The disbursement cannot be greater than the available Insurance Fund balance.');
      return;
    }

    Alert.alert(
      'Confirm Slot 4 Disbursement',
      `Recipient group: ${target}
Amount: ${money(currency, amount)}
Reason: ${reason}

This whole-sum transfer will debit this group's Insurance Fund and be announced to all members. It is not tied to a selected member. Individual members who have not paid this meeting's contribution remain ineligible for individual benefits. Members contribute again only after an insurance benefit has been disbursed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disburse to Group', style: 'destructive', onPress: () => void saveGroupPayout(target, amount, reason) },
      ],
    );
  };

  const saveGroupPayout = async (target: string, amount: number, reason: string) => {
    if (!meeting) return;
    const executiveMemberId = Number(params.executiveMemberId ?? 0);
    try {
      setSavingGroupPayout(true);
      await recordInsuranceGroupBenefit(
        groupId,
        target,
        amount,
        reason,
        meeting.id,
        executiveMemberId,
      );
      setRecipientGroupName('');
      setGroupBenefitAmount('');
      setGroupBenefitReason('');
      await loadData();
      Alert.alert(
        'Slot 4 Disbursement Recorded',
        `${money(currency, amount)} was disbursed to ${target}. Reason: ${reason}. The Insurance Fund has been debited and a group-wide notification has been queued. Each member can pay the agreed insurance contribution again after this disbursement.`,
      );
    } catch (error) {
      Alert.alert(
        'Group Disbursement Failed',
        error instanceof Error ? error.message : 'Unable to record the Slot 4 group-to-group disbursement.',
      );
    } finally {
      setSavingGroupPayout(false);
    }
  };

  const renderKinSlot = (member: InsuranceMember, slot: BenefitSlot) => {
    const kin = member.kin.find((item) => Number(item.slot) === slot);
    const locked = slot !== 3 && (Number(kin?.locked ?? 0) === 1 || Number(kin?.benefit_received ?? 0) === 1);
    const isEditing = editingSlot === slot;

    return (
      <View key={slot} style={styles.slotCard}>
        <View style={styles.slotHeadingRow}>
          <Text style={styles.slotTitle}>Slot {slot} — Next of Kin</Text>
          <Text style={[styles.badge, locked ? styles.lockedBadge : styles.openBadge]}>
            {slot === 3 ? 'OPEN / RECURRING' : locked ? 'LOCKED' : 'OPEN'}
          </Text>
        </View>
        {kin?.name ? (
          <>
            <Text style={styles.kinName}>{kin.name}</Text>
            <Text style={styles.muted}>Phone: {kin.phone || 'Not provided'}</Text>
          </>
        ) : (
          <Text style={styles.warningText}>No beneficiary assigned. Add a named contact before using this slot.</Text>
        )}
        <View style={styles.inlineButtons}>
          <TouchableOpacity
            style={[styles.outlineButton, locked && styles.disabledButton]}
            onPress={() => startReplaceKin(slot)}
            disabled={locked || savingKin}
          >
            <Text style={styles.outlineButtonText}>{locked ? 'Permanently Locked' : kin?.name ? 'Edit Contact' : 'Add Beneficiary'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, (!meeting || !member.contributedThisMeeting || !kin?.name || locked || savingPayout) && styles.disabledButton]}
            onPress={() => confirmPayout(slot)}
            disabled={!meeting || !member.contributedThisMeeting || !kin?.name || locked || savingPayout}
          >
            <Text style={styles.buttonText}>{savingPayout ? 'Processing…' : 'Disburse Benefit'}</Text>
          </TouchableOpacity>
        </View>
        {slot === 3
          ? <Text style={styles.slotNote}>Slot 3 remains open after a benefit and can be used again.</Text>
          : locked
            ? <Text style={styles.slotNote}>This slot is permanently locked after its first paid benefit. It cannot be edited, replaced, reopened, or reused.</Text>
            : <Text style={styles.slotNote}>This contact can be edited until the first benefit is paid through this slot.</Text>}
        {isEditing ? (
          <View style={styles.editorBox}>
            <Text style={styles.fieldLabel}>New / corrected next-of-kin name</Text>
            <TextInput style={styles.input} value={replacementName} onChangeText={setReplacementName} placeholder="Full name" placeholderTextColor="#94a3b8" />
            <Text style={styles.fieldLabel}>Phone number</Text>
            <TextInput style={styles.input} value={replacementPhone} onChangeText={setReplacementPhone} placeholder="Phone number" keyboardType="phone-pad" placeholderTextColor="#94a3b8" />
            <View style={styles.inlineButtons}>
              <TouchableOpacity style={styles.outlineButton} onPress={() => setEditingSlot(null)} disabled={savingKin}>
                <Text style={styles.outlineButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, savingKin && styles.disabledButton]} onPress={() => void saveReplacementKin()} disabled={savingKin}>
                <Text style={styles.buttonText}>{savingKin ? 'Saving…' : 'Save Contact'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Insurance Fund</Text>
          <Text style={styles.subtitle}>One contribution per member per insurance collection cycle. Contributions reopen only after a benefit is disbursed. Executive group-to-group disbursements are managed below.</Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Insurance Fund</Text>
          <Text style={styles.balanceValue}>{money(currency, insuranceBalance)}</Text>
          <Text style={styles.smallText}>
            Agreed contribution: {agreedContribution > 0 ? money(currency, agreedContribution) : 'Not set'} per member, once per insurance collection cycle.
          </Text>
          <Text style={styles.smallText}>
            {meeting ? `Open meeting #${meeting.meeting_number} • ${meeting.meeting_date}` : 'No open meeting. Start a meeting before collecting contributions or disbursing benefits.'}
          </Text>
        </View>

        {agreedContribution <= 0 ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Setup Required</Text>
            <Text style={styles.noticeText}>Open Setup Rules and set the agreed insurance contribution per member. Each member contributes once in a collection cycle; contributions become due again only after a benefit has been disbursed.</Text>
          </View>
        ) : null}

        {!meeting ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Meeting Required</Text>
            <Text style={styles.noticeText}>Insurance money is recorded against the current open meeting. Contributions from previous meetings do not make a member eligible for this meeting.</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Members and Insurance Contributions</Text>
            <TouchableOpacity onPress={() => void loadData()} style={styles.refreshButton}>
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.helpText}>Every active member pays the exact amount set in Setup Rules once per insurance collection cycle. A new contribution becomes due only after an insurance benefit has been disbursed. A member who has not contributed in the current cycle cannot receive an individual benefit.</Text>

          {loading ? <ActivityIndicator color="#15803d" style={styles.loader} /> : null}
          {!loading && members.length === 0 ? <Text style={styles.emptyText}>No active group members were found.</Text> : null}
          {members.map((member) => {
            const selected = selectedMemberId === member.id;
            const paid = member.contributedThisMeeting;
            return (
              <TouchableOpacity
                key={member.id}
                style={[styles.memberCard, selected && styles.selectedMemberCard]}
                onPress={() => { setSelectedMemberId(member.id); setEditingSlot(null); }}
                activeOpacity={0.85}
              >
                <View style={styles.memberHeadingRow}>
                  <View style={styles.memberIdentity}>
                    <Text style={styles.memberNumber}>{member.member_number}</Text>
                    <Text style={styles.memberName}>{member.full_name}</Text>
                  </View>
                  <Text style={[styles.badge, paid ? styles.openBadge : styles.dueBadge]}>{paid ? 'PAID THIS CYCLE' : 'CONTRIBUTION DUE'}</Text>
                </View>
                <Text style={styles.muted}>
                  Paid this cycle: {money(currency, member.contributionAmount)}{selected ? ' • SELECTED' : ''}
                </Text>
                <TouchableOpacity
                  style={[styles.actionButton, styles.contributionButton, (paid || !meeting || agreedContribution <= 0 || savingContributionId === member.id) && styles.disabledButton]}
                  onPress={() => confirmContribution(member)}
                  disabled={paid || !meeting || agreedContribution <= 0 || savingContributionId !== null}
                >
                  <Text style={styles.buttonText}>{savingContributionId === member.id ? 'Recording…' : paid ? 'Contribution Complete' : `Record ${money(currency, agreedContribution)} Contribution`}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.card}>
          <View style={styles.slotCard}>
            <View style={styles.slotHeadingRow}>
              <Text style={styles.slotTitle}>Slot 4 — Whole-Sum Benefit to Another Group</Text>
              <Text style={[styles.badge, styles.openBadge]}>EXECUTIVE ONLY / RECURRING</Text>
            </View>
            <Text style={styles.muted}>Use Slot 4 only when the executive authorizes a lump-sum insurance disbursement to another group. This is a group-level transfer, not a payment to the selected member. The app records the recipient group, amount, reason and authorizing executive, then queues a notice for all members.</Text>
            <Text style={styles.fieldLabel}>Recipient group name</Text>
            <TextInput
              style={styles.input}
              value={recipientGroupName}
              onChangeText={setRecipientGroupName}
              placeholder="Enter the other group's name"
              placeholderTextColor="#94a3b8"
              editable={!savingGroupPayout}
            />
            <Text style={styles.fieldLabel}>Whole-sum amount</Text>
            <TextInput
              style={styles.input}
              value={groupBenefitAmount}
              onChangeText={setGroupBenefitAmount}
              keyboardType="decimal-pad"
              placeholder="Enter amount to disburse"
              placeholderTextColor="#94a3b8"
              editable={!savingGroupPayout}
            />
            <Text style={styles.fieldLabel}>Reason for group disbursement (required)</Text>
            <TextInput
              style={[styles.input, styles.reasonInput]}
              value={groupBenefitReason}
              onChangeText={setGroupBenefitReason}
              placeholder="Explain why funds are being sent to this group"
              placeholderTextColor="#94a3b8"
              multiline
              editable={!savingGroupPayout}
            />
            <Text style={styles.helpText}>Group-to-group disbursements are not tied to an individual member's contribution status. A new insurance contribution cycle starts after a benefit has been disbursed.</Text>
            <TouchableOpacity
              style={[styles.actionButton, (!meeting || agreedContribution <= 0 || savingGroupPayout || Number(groupBenefitAmount) > insuranceBalance) && styles.disabledButton]}
              onPress={confirmGroupPayout}
              disabled={!meeting || agreedContribution <= 0 || savingGroupPayout || Number(groupBenefitAmount) > insuranceBalance}
            >
              <Text style={styles.buttonText}>{savingGroupPayout ? 'Recording Group Disbursement…' : 'Executive: Disburse Slot 4 to Another Group'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 14 },
  title: { fontSize: 27, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 5, color: '#4b5563', fontSize: 14, lineHeight: 20 },
  balanceCard: { padding: 18, borderRadius: 14, borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', marginBottom: 14 },
  balanceLabel: { fontSize: 14, fontWeight: '700', color: '#166534' },
  balanceValue: { marginTop: 5, fontSize: 28, fontWeight: '900', color: '#15803d' },
  smallText: { marginTop: 7, fontSize: 13, color: '#166534', lineHeight: 19 },
  noticeCard: { borderRadius: 12, padding: 14, marginBottom: 14, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' },
  noticeTitle: { fontSize: 15, fontWeight: '800', color: '#9a3412', marginBottom: 4 },
  noticeText: { fontSize: 13, lineHeight: 19, color: '#7c2d12' },
  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 15, marginBottom: 14 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { flex: 1, fontSize: 17, lineHeight: 23, fontWeight: '800', color: '#111827' },
  refreshButton: { borderWidth: 1, borderColor: '#16a34a', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  refreshText: { color: '#15803d', fontWeight: '700', fontSize: 12 },
  helpText: { marginTop: 8, marginBottom: 9, color: '#4b5563', fontSize: 13, lineHeight: 19 },
  loader: { marginVertical: 18 },
  emptyText: { marginVertical: 14, textAlign: 'center', color: '#6b7280' },
  memberCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 11, padding: 12, marginTop: 10, backgroundColor: '#ffffff' },
  selectedMemberCard: { borderColor: '#16a34a', borderWidth: 2, backgroundColor: '#f0fdf4' },
  memberHeadingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  memberIdentity: { flex: 1 },
  memberNumber: { fontSize: 12, fontWeight: '800', color: '#15803d' },
  memberName: { marginTop: 3, fontSize: 16, fontWeight: '800', color: '#111827' },
  muted: { marginTop: 5, fontSize: 13, lineHeight: 18, color: '#4b5563' },
  badge: { maxWidth: '58%', overflow: 'hidden', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  openBadge: { color: '#166534', backgroundColor: '#dcfce7' },
  dueBadge: { color: '#9a3412', backgroundColor: '#ffedd5' },
  lockedBadge: { color: '#991b1b', backgroundColor: '#fee2e2' },
  actionButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#16a34a' },
  contributionButton: { marginTop: 10 },
  disabledButton: { opacity: 0.45 },
  buttonText: { color: '#ffffff', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  fieldLabel: { marginTop: 12, marginBottom: 6, fontSize: 13, fontWeight: '700', color: '#374151' },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, backgroundColor: '#ffffff', color: '#111827', paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  reasonInput: { minHeight: 84, textAlignVertical: 'top' },
  slotCard: { marginTop: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 11, padding: 12, backgroundColor: '#f9fafb' },
  slotHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  slotTitle: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '800', color: '#111827' },
  kinName: { marginTop: 8, fontSize: 15, fontWeight: '700', color: '#111827' },
  warningText: { marginTop: 8, fontSize: 13, lineHeight: 18, color: '#9a3412' },
  inlineButtons: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'stretch' },
  outlineButton: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#16a34a', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: '#ffffff' },
  outlineButtonText: { textAlign: 'center', color: '#15803d', fontSize: 12, fontWeight: '800' },
  slotNote: { marginTop: 8, fontSize: 12, lineHeight: 17, color: '#166534' },
  editorBox: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#d1d5db' },
});
