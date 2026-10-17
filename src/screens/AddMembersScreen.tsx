import React, { useCallback, useState } from 'react';
import {
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

import {
  deleteMember,
  getGroupById,
  getMembersByGroupId,
  registerMember,
  type GroupRecord,
  type MemberRecord,
} from '../database/database';

type Props = {
  navigation: any;
  route: { params?: { groupId?: number } };
};

export default function AddMembersScreen({ navigation, route }: Props) {
  const groupId = Number(route?.params?.groupId || 0);

  const [group, setGroup] = useState<GroupRecord | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [cell, setCell] = useState('');
  const [district, setDistrict] = useState('');

  const [kin1Name, setKin1Name] = useState('');
  const [kin1Phone, setKin1Phone] = useState('');
  const [kin2Name, setKin2Name] = useState('');
  const [kin2Phone, setKin2Phone] = useState('');

  const load = useCallback(async () => {
    if (!groupId) return;

    try {
      setLoading(true);
      const [loadedGroup, loadedMembers] = await Promise.all([
        getGroupById(groupId),
        getMembersByGroupId(groupId),
      ]);
      setGroup(loadedGroup);
      setMembers(loadedMembers);
    } catch (error) {
      console.error('Failed to load members:', error);
      Alert.alert('Members', 'Unable to load members from the database.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const clearForm = () => {
    setFullName('');
    setGender('');
    setAge('');
    setPhone('');
    setCell('');
    setDistrict('');
    setKin1Name('');
    setKin1Phone('');
    setKin2Name('');
    setKin2Phone('');
  };

  const addMember = async () => {
    if (!groupId) {
      Alert.alert('No Group', 'Please select an active group first.');
      return;
    }

    const cleanName = fullName.trim();
    const cleanGender = gender.trim();
    const cleanAge = Number(age.trim());
    const cleanCell = cell.trim();
    const cleanDistrict = district.trim();
    const cleanKin1Name = kin1Name.trim();
    const cleanKin1Phone = kin1Phone.trim();
    const cleanKin2Name = kin2Name.trim();
    const cleanKin2Phone = kin2Phone.trim();

    if (!cleanName) {
      Alert.alert('Required', 'Member name is required.');
      return;
    }
    if (!cleanGender) {
      Alert.alert('Required', 'Gender is required.');
      return;
    }
    if (!Number.isFinite(cleanAge) || cleanAge <= 0) {
      Alert.alert('Required', 'Enter a valid age.');
      return;
    }
    if (!cleanCell) {
      Alert.alert('Required', 'Cell is required.');
      return;
    }
    if (!cleanDistrict) {
      Alert.alert('Required', 'District is required.');
      return;
    }
    if (!cleanKin1Name || !cleanKin1Phone || !cleanKin2Name || !cleanKin2Phone) {
      Alert.alert('Next of Kin Required', 'Every member must have two next-of-kin contacts. Enter the full name and phone number for both Slot 1 and Slot 2.');
      return;
    }

    try {
      setSaving(true);
      const memberId = await registerMember(
        groupId,
        cleanName,
        cleanGender,
        cleanAge,
        phone.trim(),
        cleanCell,
        cleanDistrict,
        [
          { slot: 1, name: cleanKin1Name, phone: cleanKin1Phone },
          { slot: 2, name: cleanKin2Name, phone: cleanKin2Phone },
        ],
      );

      await load();
      clearForm();

      const created = members.find((member) => member.id === memberId);
      Alert.alert(
        'Member Added',
        `${cleanName} has been registered successfully.\n\nThe database assigned the member number automatically.`,
      );
      void created;
    } catch (error) {
      console.error('Failed to register member:', error);
      Alert.alert(
        'Registration Failed',
        error instanceof Error ? error.message : 'Unable to register member.',
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (member: MemberRecord) => {
    Alert.alert(
      'Delete Member',
      `Delete ${member.full_name} (${member.member_number})? This keeps the member number reserved and does not reuse it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMember(member.id, 'Member removed by group administrator.');
              await load();
            } catch (error) {
              Alert.alert(
                'Delete Failed',
                error instanceof Error ? error.message : 'Unable to delete member.',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Text style={styles.backText}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Add Members</Text>
            <Text style={styles.subtitle}>
              {group
                ? `KYA ${group.group_number} • ${group.group_name}`
                : 'Loading group…'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Register Member</Text>

            <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="Enter member name" />
            <Field label="Gender" value={gender} onChangeText={setGender} placeholder="Male or Female" />
            <Field label="Age" value={age} onChangeText={setAge} placeholder="Enter age" keyboardType="number-pad" />
            <Field label="Phone (optional)" value={phone} onChangeText={setPhone} placeholder="Enter phone number" keyboardType="phone-pad" />
            <Field label="Cell" value={cell} onChangeText={setCell} placeholder="Enter cell" />
            <Field label="District" value={district} onChangeText={setDistrict} placeholder="Enter district" />

            <Text style={styles.kinSectionTitle}>Insurance Next of Kin (Required)</Text>
            <Text style={styles.helperText}>Every member must register two named next-of-kin contacts with phone numbers. If a Slot 1 or Slot 2 beneficiary receives an insurance benefit, that slot locks until the contact is replaced.</Text>
            <Field label="Slot 1 — Next-of-kin full name" value={kin1Name} onChangeText={setKin1Name} placeholder="Enter first beneficiary name" />
            <Field label="Slot 1 — Phone number" value={kin1Phone} onChangeText={setKin1Phone} placeholder="Enter first beneficiary phone" keyboardType="phone-pad" />
            <Field label="Slot 2 — Next-of-kin full name" value={kin2Name} onChangeText={setKin2Name} placeholder="Enter second beneficiary name" />
            <Field label="Slot 2 — Phone number" value={kin2Phone} onChangeText={setKin2Phone} placeholder="Enter second beneficiary phone" keyboardType="phone-pad" />

            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.disabledButton]}
              onPress={addMember}
              disabled={saving}
            >
              <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Register Member'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>Active Members</Text>
              <Text style={styles.count}>{members.length}</Text>
            </View>

            {loading ? (
              <Text style={styles.emptyText}>Loading members…</Text>
            ) : members.length === 0 ? (
              <Text style={styles.emptyText}>No members registered yet.</Text>
            ) : (
              members.map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberNumber}>{member.member_number}</Text>
                    <Text style={styles.memberName}>{member.full_name}</Text>
                    <Text style={styles.memberDetails}>
                      {member.gender} • {member.age} years • {member.cell}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => confirmDelete(member)}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType || 'default'}
        autoCapitalize="words"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 36 },
  header: { marginBottom: 14 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 8 },
  backText: { color: '#16a34a', fontSize: 16, fontWeight: '700' },
  title: { fontSize: 25, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 4, color: '#166534', fontSize: 14, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  kinSectionTitle: { marginTop: 20, fontSize: 16, fontWeight: '800', color: '#166534' },
  helperText: { marginTop: 6, fontSize: 13, lineHeight: 19, color: '#4b5563' },
  field: { marginTop: 12 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  count: { minWidth: 30, textAlign: 'center', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 15, backgroundColor: '#dcfce7', color: '#166534', fontWeight: '800' },
  emptyText: { color: '#6b7280', textAlign: 'center', paddingVertical: 18 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  memberInfo: { flex: 1, paddingRight: 8 },
  memberNumber: { color: '#16a34a', fontSize: 13, fontWeight: '800' },
  memberName: { marginTop: 2, color: '#111827', fontSize: 16, fontWeight: '700' },
  memberDetails: { marginTop: 3, color: '#6b7280', fontSize: 12 },
  deleteButton: { borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  deleteText: { color: '#dc2626', fontSize: 12, fontWeight: '800' },
});
