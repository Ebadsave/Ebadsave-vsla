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
      const membersWithKin: MemberWithKin[] = await Promise.all(
        groupMembers.map(async (member: Member) => {
          const kin = await getNextOfKin(member.id);
          return {
            ...member,
            kin: Array.isArray(kin) ? (kin as Kin[]) : [],
          };
        }),
      );
      setMembers(membersWithKin);
    } catch (error) {
      Alert.alert(
        'Unable to Load Members',
        error instanceof Error ? error.message : 'Failed to load group members.',
      );
    } finally {
      setLoading(false);
    }
  };

  const getKinForSlot = (member: MemberWithKin, slot: number) => {
    return member.kin.find((item) => Number(item.slot) === slot);
  };

  const renderSlot = (member: MemberWithKin, slot: number, title: string) => {
    const kin = getKinForSlot(member, slot);
    const benefitReceived = Number(kin?.benefit_received ?? 0) === 1;
    return (
      <View style={styles.slot}>
        <View style={styles.slotHeader}>
          <Text style={styles.slotTitle}>{title}</Text>
          <Text style={[styles.status, benefitReceived ? styles.expiredStatus : styles.openStatus]}>
            {benefitReceived ? 'PAID / EXPIRED' : 'OPEN'}
          </Text>
        </View>
        {slot === 1 ? (
          <Text style={styles.slotDescription}>Recurring insurance benefit</Text>
        ) : kin ? (
          <>
            <Text style={styles.kinName}>{kin.name || 'Name not provided'}</Text>
            {kin.phone ? <Text style={styles.kinDetails}>Phone: {kin.phone}</Text> : null}
            {kin.gender ? <Text style={styles.kinDetails}>Gender: {kin.gender}</Text> : null}
          </>
        ) : (
          <Text style={styles.emptyText}>No next of kin assigned</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Insurance</Text>
        <Text style={styles.subtitle}>Group Insurance Fund</Text>
        <View style={styles.groupCard}>
          <Text style={styles.label}>Group ID</Text>
          <TextInput style={styles.input} value={groupId} onChangeText={setGroupId} placeholder="Enter group ID" keyboardType="number-pad" />
          <TouchableOpacity style={[styles.loadButton, loading && styles.disabledButton]} onPress={loadMembers} disabled={loading}>
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Load Group Members</Text>}
          </TouchableOpacity>
        </View>
        {members.map((member) => (
          <View key={member.id} style={styles.memberCard}>
            <View style={styles.memberHeader}>
              <Text style={styles.memberNumber}>KYA {member.member_number}</Text>
              <Text style={styles.memberName}>{member.full_name}</Text>
            </View>
            <Text style={styles.memberSectionTitle}>Insurance Benefit Slots</Text>
            {renderSlot(member, 1, 'Slot 1 — Recurring Benefit')}
            {renderSlot(member, 2, 'Slot 2 — Next of Kin')}
            {renderSlot(member, 3, 'Slot 3 — Next of Kin')}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: '#16a34a', textAlign: 'center' },
  subtitle: { marginTop: 5, marginBottom: 18, fontSize: 16, color: '#374151', textAlign: 'center' },
  groupCard: { padding: 16, marginBottom: 16, borderRadius: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
  label: { marginBottom: 6, fontSize: 14, fontWeight: '600', color: '#374151' },
  input: { height: 48, marginBottom: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, backgroundColor: '#ffffff', color: '#111827', fontSize: 16 },
  loadButton: { height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#16a34a' },
  disabledButton: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  memberCard: { marginBottom: 16, padding: 16, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d1d5db' },
  memberHeader: { marginBottom: 12 },
  memberNumber: { fontSize: 13, fontWeight: '700', color: '#16a34a' },
  memberName: { marginTop: 3, fontSize: 19, fontWeight: '700', color: '#111827' },
  memberSectionTitle: { marginBottom: 8, fontSize: 15, fontWeight: '700', color: '#374151' },
  slot: { marginTop: 8, padding: 12, borderRadius: 9, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
  slotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slotTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
  status: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 11, fontWeight: '700' },
  openStatus: { color: '#166534', backgroundColor: '#dcfce7' },
  expiredStatus: { color: '#991b1b', backgroundColor: '#fee2e2' },
  slotDescription: { marginTop: 6, fontSize: 13, color: '#374151' },
  kinName: { marginTop: 7, fontSize: 15, fontWeight: '600', color: '#111827' },
  kinDetails: { marginTop: 3, fontSize: 13, color: '#4b5563' },
  emptyText: { marginTop: 6, fontSize: 13, color: '#6b7280', fontStyle: 'italic' },
});
