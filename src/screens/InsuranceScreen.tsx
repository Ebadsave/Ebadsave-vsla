import React, { useState } from 'react';
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
import {
  getMembersByGroupId,
  getNextOfKin,
  updateNextOfKinBenefit,
  addInsuranceRecord,
} from '../database/database';

type Member = {
  id: number;
  group_id: number;
  member_number: string | number;
  full_name: string;
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

export default function InsuranceScreen() {
  const [groupId, setGroupId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [members, setMembers] = useState<MemberWithKin[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMembers = async () => {
    const id = Number(groupId);
    if (!Number.isInteger(id) || id <= 0) {
      Alert.alert('Invalid Group', 'Enter a valid group ID.');
      return;
    }
    try {
      setLoading(true);
      const groupMembers = await getMembersByGroupId(id);
      const membersWithKin = await Promise.all(
        groupMembers.map(async (member: Member) => {
          const kin = await getNextOfKin(member.id);
          return { ...member, kin: Array.isArray(kin) ? (kin as Kin[]) : [] };
        }),
      );
      setMembers(membersWithKin);
    } catch (error) {
      Alert.alert('Unable to Load Members', error instanceof Error ? error.message : 'Failed to load members.');
    } finally {
      setLoading(false);
    }
  };

  const handlePayout = async (member: MemberWithKin, slot: number) => {
    const kin = member.kin.find((k) => Number(k.slot) === slot);
    if (!kin) return Alert.alert('No Kin', 'No kin assigned to this slot.');
    if (Number(kin.benefit_received ?? 0) === 1) return Alert.alert('Expired', 'Slot already paid.');
    if (!payAmount || Number.isNaN(Number(payAmount))) return Alert.alert('Enter Amount', 'Enter payout amount.');
    try {
      await addInsuranceRecord({
        group_id: member.group_id,
        member_id: member.id,
        kin_id: kin.id,
        slot,
        amount: Number(payAmount),
       
