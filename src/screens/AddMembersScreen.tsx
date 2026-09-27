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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';

import {
  getMembersByGroupId,
  registerMember,
  updateMemberRole,
  MemberRecord,
} from '../database/database';

type Props = NativeStackScreenProps<RootStackParamList, 'AddMembers'>;

export default function AddMembersScreen({ route }: Props) {
  const { groupId } = route.params;

  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [cell, setCell] = useState('');
  const [district, setDistrict] = useState('');

  const [saving, setSaving] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      const result = await getMembersByGroupId(groupId);
      setMembers(result);
    } catch (error) {
      console.error('Failed to load members:', error);

      Alert.alert(
        'Error',
        'Members could not be loaded.',
      );
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers]),
  );

  const clearForm = () => {
    setFullName('');
    setGender('');
    setAge('');
    setPhone('');
    setCell('');
    setDistrict('');
  };

  const handleSaveMember = async () => {
    const trimmedName = fullName.trim();
    const trimmedGender = gender.trim();
    const trimmedAge = age.trim();
    const trimmedPhone = phone.trim();
    const trimmedCell = cell.trim();
    const trimmedDistrict = district.trim();

    if (!trimmedName) {
      Alert.alert(
        'Required',
        'Please enter the member name.',
      );
      return;
    }

    if (!trimmedGender) {
      Alert.alert(
        'Required',
        'Please enter the member gender.',
      );
      return;
    }

    if (!trimmedAge) {
      Alert.alert(
        'Required',
        'Please enter the member age.',
      );
      return;
    }

    const numericAge = Number(trimmedAge);

    if (
      !Number.isInteger(numericAge) ||
      numericAge <= 0
    ) {
      Alert.alert(
        'Invalid Age',
        'Please enter a valid age.',
      );
      return;
    }

    if (!trimmedCell) {
      Alert.alert(
        'Required',
        'Please enter the cell.',
      );
      return;
    }

    if (!trimmedDistrict) {
      Alert.alert(
        'Required',
        'Please enter the district.',
      );
      return;
    }

    try {
      setSaving(true);

      const memberId = await registerMember(
        groupId,
        trimmedName,
        trimmedGender,
        numericAge,
        trimmedPhone,
        trimmedCell,
        trimmedDistrict,
        null,
      );

      await loadMembers();

      clearForm();
      setShowForm(false);

      Alert.alert(
        'Member Registered',
        `Member registered successfully.\nMember ID: ${memberId}`,
      );
    } catch (error) {
      console.error(
        'Failed to register member:',
        error,
      );

      Alert.alert(
        'Registration Failed',
        error instanceof Error
          ? error.message
          : 'The member could not be registered.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAssignRole = async (
    member: MemberRecord,
    role: string,
  ) => {
    try {
      await updateMemberRole(
        member.id,
        role,
      );

      await loadMembers();

      Alert.alert(
        'Role Updated',
        `${member.full_name} is now ${
          role === 'executive'
            ? 'an Executive'
            : 'a Member'
        }.`,
      );
    } catch (error) {
      console.error(
        'Failed to update member role:',
        error,
      );

      Alert.alert(
        'Error',
        'The member role could not be updated.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            Members
          </Text>

          <TouchableOpacity
            style={styles.addButton}
            onPress={() =>
              setShowForm(
                (current) => !current,
              )
            }
            activeOpacity={0.8}
          >
            <Text style={styles.plus}>
              +
            </Text>

            <Text style={styles.addButtonText}>
              {showForm
                ? 'Close'
                : 'Add Member'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {showForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>
                Register Member
              </Text>

              <Text style={styles.label}>
                Member Name
              </Text>

              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter full name"
                placeholderTextColor="#9ca3af"
              />

              <Text style={styles.label}>
                Gender
              </Text>

              <TextInput
                style={styles.input}
                value={gender}
                onChangeText={setGender}
                placeholder="Male or Female"
                placeholderTextColor="#9ca3af"
              />

              <Text style={styles.label}>
                Age
              </Text>

              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                placeholder="Enter age"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
              />

              <Text style={styles.label}>
                Phone
              </Text>

              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Optional phone number"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>
                Cell
              </Text>

              <TextInput
                style={styles.input}
                value={cell}
                onChangeText={setCell}
                placeholder="Enter cell"
                placeholderTextColor="#9ca3af"
              />

              <Text style={styles.label}>
                District
              </Text>

              <TextInput
                style={styles.input}
                value={district}
                onChangeText={setDistrict}
                placeholder="Enter district"
                placeholderTextColor="#9ca3af"
              />

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  saving &&
                    styles.disabledButton,
                ]}
                onPress={handleSaveMember}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text
                  style={styles.saveButtonText}
                >
                  {saving
                    ? 'Saving...'
                    : 'Save Member'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.membersSection}>
            <Text style={styles.sectionTitle}>
              Registered Members (
              {members.length}
              )
            </Text>

            {members.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>
                  No members yet
                </Text>

                <Text style={styles.emptyText}>
                  Tap + Add Member to register
                  the first member.
                </Text>
              </View>
            ) : (
              members.map((member) => {
                const isExecutive =
                  member.role
                    ?.toLowerCase() ===
                  'executive';

                return (
                  <View
                    key={member.id}
                    style={styles.memberCard}
                  >
                    <View
                      style={
                        styles.memberNumberCircle
                      }
                    >
                      <Text
                        style={
                          styles.memberNumberText
                        }
                      >
                        {member.member_number.replace(
                          'KYA',
                          '',
                        )}
                      </Text>
                    </View>

                    <View
                      style={styles.memberInfo}
                    >
                      <Text
                        style={styles.memberName}
                      >
                        {member.full_name}
                      </Text>

                      <Text
                        style={
                          styles.memberNumber
                        }
                      >
                        {member.member_number}
                      </Text>

                      <Text
                        style={
                          styles.memberDetails
                        }
                      >
                        {member.gender} •{' '}
                        {member.age} years
                      </Text>

                      <Text
                        style={
                          styles.memberDetails
                        }
                      >
                        {member.cell} •{' '}
                        {member.district}
                      </Text>

                      <Text
                        style={styles.roleText}
                      >
                        Role:{' '}
                        {isExecutive
                          ? 'Executive'
                          : 'Member'}
                      </Text>

                      <View
                        style={styles.roleRow}
                      >
                        <TouchableOpacity
                          style={[
                            styles.roleButton,
                            isExecutive &&
                              styles.activeRoleButton,
                          ]}
                          onPress={() =>
                            handleAssignRole(
                              member,
                              'executive',
                            )
                          }
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.roleButtonText,
                              isExecutive &&
                                styles.activeRoleButtonText,
                            ]}
                          >
                            Executive
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.roleButton,
                            !isExecutive &&
                              styles.activeRoleButton,
                          ]}
                          onPress={() =>
                            handleAssignRole(
                              member,
                              'member',
                            )
                          }
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.roleButtonText,
                              !isExecutive &&
                                styles.activeRoleButtonText,
                            ]}
                          >
                            Member
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },

  addButton: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },

  plus: {
    color: '#16a34a',
    fontSize: 22,
    fontWeight: '700',
    marginRight: 5,
  },

  addButtonText: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '700',
  },

  content: {
    padding: 16,
    paddingBottom: 32,
  },

  formCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 22,
  },

  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 10,
  },

  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
  },

  saveButton: {
    backgroundColor: '#16a34a',
    borderRadius: 9,
    paddingVertical: 14,
    marginTop: 20,
  },

  disabledButton: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },

  membersSection: {
    marginTop: 4,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },

  emptyCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 28,
    alignItems: 'center',
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },

  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },

  memberCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },

  memberNumberCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
  },

  memberNumberText: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '800',
  },

  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },

  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  memberNumber: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: '#16a34a',
  },

  memberDetails: {
    marginTop: 3,
    fontSize: 13,
    color: '#6b7280',
  },

  roleText: {
    marginTop: 7,
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },

  roleRow: {
    flexDirection: 'row',
    marginTop: 10,
  },

  roleButton: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
    marginRight: 8,
  },

  activeRoleButton: {
    backgroundColor: '#16a34a',
  },

  roleButtonText: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '700',
  },

  activeRoleButtonText: {
    color: '#ffffff',
  },
});
