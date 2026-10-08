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
  updateMember,
  updateMemberRole,
  type GroupRecord,
  type MemberRecord,
} from '../database/database';

type Props = {
  navigation: any;
  route: { params?: { groupId?: number } };
};

const EXECUTIVE_ROLES = [
  'Member',
  'Chairperson',
  'Vice Chairperson',
  'Secretary',
  'Treasurer',
  'Money Counter',
  'Key Keeper',
  'Supervisor',
];

export default function AddMembersScreen({ navigation, route }: Props) {
  const groupId = Number(route?.params?.groupId || 0);

  const [group, setGroup] = useState<GroupRecord | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);

  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [cell, setCell] = useState('');
  const [district, setDistrict] = useState('');
  const [role, setRole] = useState('Member');

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
    setEditingMemberId(null);
    setFullName('');
    setGender('');
    setAge('');
    setPhone('');
    setCell('');
    setDistrict('');
    setRole('Member');
  };

  const editMember = (member: MemberRecord) => {
    setEditingMemberId(member.id);
    setFullName(member.full_name || '');
    setGender(member.gender || '');
    setAge(String(member.age || ''));
    setPhone(member.phone || '');
    setCell(member.cell || '');
    setDistrict(member.district || '');

    const savedRole = member.role?.trim() || 'Member';

    const matchingRole = EXECUTIVE_ROLES.find(
      (item) => item.toLowerCase() === savedRole.toLowerCase(),
    );

    setRole(matchingRole || 'Member');
  };

  const saveMember = async () => {
    if (!groupId) {
      Alert.alert('No Group', 'Please select an active group first.');
      return;
    }

    const cleanName = fullName.trim();
    const cleanGender = gender.trim();
    const cleanAge = Number(age.trim());
    const cleanCell = cell.trim();
    const cleanDistrict = district.trim();

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

    try {
      setSaving(true);

      if (editingMemberId !== null) {
        await updateMember(editingMemberId, {
          fullName: cleanName,
          gender: cleanGender,
          age: cleanAge,
          phone: phone.trim(),
          cell: cleanCell,
          district: cleanDistrict,
        });

        await updateMemberRole(editingMemberId, role);

        await load();
        clearForm();

        Alert.alert(
          'Member Updated',
          `${cleanName}'s details and role have been updated successfully.`,
        );
      } else {
        const memberId = await registerMember(
          groupId,
          cleanName,
          cleanGender,
          cleanAge,
          phone.trim(),
          cleanCell,
          cleanDistrict,
        );

        // Keep the existing automatic member-number generation.
        // Only assign the selected role after registration.
        await updateMemberRole(memberId, role);

        await load();
        clearForm();

        Alert.alert(
          'Member Added',
          `${cleanName} has been registered successfully.\n\nThe database assigned the member number automatically.`,
        );
      }
    } catch (error) {
      console.error('Failed to save member:', error);

      Alert.alert(
        editingMemberId !== null ? 'Update Failed' : 'Registration Failed',
        error instanceof Error
          ? error.message
          : 'Unable to save member.',
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
              await deleteMember(
                member.id,
                'Member removed by group administrator.',
              );

              if (editingMemberId === member.id) {
                clearForm();
              }

              await load();
            } catch (error) {
              Alert.alert(
                'Delete Failed',
                error instanceof Error
                  ? error.message
                  : 'Unable to delete member.',
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
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            >
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
            <Text style={styles.sectionTitle}>
              {editingMemberId !== null
                ? 'Edit Member'
                : 'Register Member'}
            </Text>

            <Field
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter member name"
            />

            <Field
              label="Gender"
              value={gender}
              onChangeText={setGender}
              placeholder="Male or Female"
            />

            <Field
              label="Age"
              value={age}
              onChangeText={setAge}
              placeholder="Enter age"
              keyboardType="number-pad"
            />

            <Field
              label="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter phone number"
              keyboardType="phone-pad"
            />

            <Field
              label="Cell"
              value={cell}
              onChangeText={setCell}
              placeholder="Enter cell"
            />

            <Field
              label="District"
              value={district}
              onChangeText={setDistrict}
              placeholder="Enter district"
            />

            <Text style={styles.label}>Executive Role</Text>

            <View style={styles.roleContainer}>
              {EXECUTIVE_ROLES.map((item) => {
                const selected = role === item;

                return (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.roleButton,
                      selected && styles.roleButtonSelected,
                    ]}
                    onPress={() => setRole(item)}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        selected && styles.roleButtonTextSelected,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                saving && styles.disabledButton,
              ]}
              onPress={saveMember}
              disabled={saving}
            >
              <Text style={styles.primaryButtonText}>
                {saving
                  ? 'Saving…'
                  : editingMemberId !== null
                    ? 'Save Changes'
                    : 'Register Member'}
              </Text>
            </TouchableOpacity>

            {editingMemberId !== null && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={clearForm}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>
                  Cancel Edit
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>Active Members</Text>

              <Text style={styles.count}>
                {members.length}
              </Text>
            </View>

            {loading ? (
              <Text style={styles.emptyText}>
                Loading members…
              </Text>
            ) : members.length === 0 ? (
              <Text style={styles.emptyText}>
                No members registered yet.
              </Text>
            ) : (
              members.map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberNumber}>
                      {member.member_number}
                    </Text>

                    <Text style={styles.memberName}>
                      {member.full_name}
                    </Text>

                    <Text style={styles.memberDetails}>
                      {member.gender} • {member.age} years • {member.cell}
                    </Text>

                    <Text style={styles.roleText}>
                      Role: {member.role || 'Member'}
                    </Text>
                  </View>

                  <View style={styles.memberActions}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => editMember(member)}
                    >
                      <Text style={styles.editText}>
                        Edit
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => confirmDelete(member)}
                    >
                      <Text style={styles.deleteText}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
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
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  content: {
    padding: 16,
    paddingBottom: 36,
  },

  header: {
    marginBottom: 14,
  },

  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginBottom: 8,
  },

  backText: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: '700',
  },

  title: {
    fontSize: 25,
    fontWeight: '800',
    color: '#111827',
  },

  subtitle: {
    marginTop: 4,
    color: '#166534',
    fontSize: 14,
    fontWeight: '600',
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  field: {
    marginTop: 12,
  },

  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },

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

  roleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
  },

  roleButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginRight: 7,
    marginBottom: 7,
    backgroundColor: '#fff',
  },

  roleButtonSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },

  roleButtonText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
  },

  roleButtonTextSelected: {
    color: '#fff',
  },

  primaryButton: {
    marginTop: 16,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },

  disabledButton: {
    opacity: 0.6,
  },

  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  cancelButton: {
    marginTop: 9,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },

  cancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  count: {
    minWidth: 30,
    textAlign: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 15,
    backgroundColor: '#dcfce7',
    color: '#166534',
    fontWeight: '800',
  },

  emptyText: {
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 18,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },

  memberInfo: {
    flex: 1,
    paddingRight: 8,
  },

  memberNumber: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '800',
  },

  memberName: {
    marginTop: 2,
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },

  memberDetails: {
    marginTop: 3,
    color: '#6b7280',
    fontSize: 12,
  },

  roleText: {
    marginTop: 4,
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },

  memberActions: {
    alignItems: 'flex-end',
    gap: 7,
  },

  editButton: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  editText: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '800',
  },

  deleteButton: {
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  deleteText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '800',
  },
});
