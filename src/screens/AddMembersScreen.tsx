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
  updateMemberRoles,
  MemberRecord,
} from '../database/database';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'AddMembers'
>;

const EXECUTIVE_ROLES = [
  'Chairperson',
  'Vice Chairperson',
  'Secretary',
  'Treasurer',
  'Loan Officer',
  'Key Holder 1',
  'Key Holder 2',
  'Key Holder 3',
  'Money Counter',
  'Supervisor',
];

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

  const [isSuperUser, setIsSuperUser] = useState(false);
  const [selectedRoles, setSelectedRoles] =
    useState<string[]>(['Member']);

  const [saving, setSaving] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      const result = await getMembersByGroupId(groupId);
      setMembers(result);
    } catch (error) {
      console.error(
        'Failed to load members:',
        error,
      );

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

    setIsSuperUser(false);
    setSelectedRoles(['Member']);
  };

  const toggleSuperUser = () => {
    const nextValue = !isSuperUser;

    setIsSuperUser(nextValue);

    if (nextValue) {
      setSelectedRoles(['Chairperson']);
    } else {
      setSelectedRoles(['Member']);
    }
  };

  const toggleRole = (role: string) => {
    if (isSuperUser) {
      return;
    }

    setSelectedRoles((current) => {
      const exists = current.includes(role);

      if (exists) {
        const updated = current.filter(
          (item) => item !== role,
        );

        return updated.length === 0
          ? ['Member']
          : updated;
      }

      const withoutMember = current.filter(
        (item) => item !== 'Member',
      );

      if (withoutMember.length >= 2) {
        Alert.alert(
          'Maximum 2 Roles',
          'A normal Executive can have a maximum of 2 executive roles.',
        );

        return current;
      }

      return [...withoutMember, role];
    });
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

      await updateMemberRoles(
        memberId,
        isSuperUser,
        selectedRoles,
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

  const handleChangeExistingRole = async (
    member: MemberRecord,
    makeExecutive: boolean,
  ) => {
    try {
      if (!makeExecutive) {
        await updateMemberRoles(
          member.id,
          false,
          ['Member'],
        );
      } else {
        await updateMemberRoles(
          member.id,
          false,
          ['Chairperson'],
        );
      }

      await loadMembers();

      Alert.alert(
        'Role Updated',
        makeExecutive
          ? `${member.full_name} is now an Executive.`
          : `${member.full_name} is now a Member.`,
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

              {/* SUPER USER */}
              <View style={styles.superUserCard}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={toggleSuperUser}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.checkbox,
                      isSuperUser &&
                        styles.checkboxChecked,
                    ]}
                  >
                    {isSuperUser && (
                      <Text
                        style={styles.checkmark}
                      >
                        ✓
                      </Text>
                    )}
                  </View>

                  <View
                    style={styles.checkboxTextArea}
                  >
                    <Text
                      style={
                        styles.superUserTitle
                      }
                    >
                      Chairperson is Group Admin
                    </Text>

                    <Text
                      style={
                        styles.superUserDescription
                      }
                    >
                      Super User - Full access
                    </Text>
                  </View>
                </TouchableOpacity>

                {isSuperUser && (
                  <View
                    style={styles.superUserBanner}
                  >
                    <Text
                      style={
                        styles.superUserBannerText
                      }
                    >
                      SUPER USER - All Permissions
                      Granted
                    </Text>

                    <Text
                      style={
                        styles.superUserBannerSubtext
                      }
                    >
                      Chairperson, Group Admin and
                      all executive permissions are
                      automatically assigned.
                    </Text>
                  </View>
                )}
              </View>

              {/* ROLE SELECTION */}
              <View
                style={[
                  styles.rolesCard,
                  isSuperUser &&
                    styles.rolesCardDisabled,
                ]}
              >
                <Text style={styles.rolesTitle}>
                  Choose Roles To Assign
                </Text>

                <Text style={styles.rolesLimit}>
                  Normal Executive: Maximum 2
                  roles
                </Text>

                {EXECUTIVE_ROLES.map((role) => {
                  const selected =
                    selectedRoles.includes(role);

                  return (
                    <TouchableOpacity
                      key={role}
                      style={styles.roleSelectRow}
                      disabled={isSuperUser}
                      onPress={() =>
                        toggleRole(role)
                      }
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.roleCheckbox,
                          selected &&
                            styles.roleCheckboxSelected,
                        ]}
                      >
                        {selected && (
                          <Text
                            style={
                              styles.roleCheckmark
                            }
                          >
                            ✓
                          </Text>
                        )}
                      </View>

                      <Text
                        style={[
                          styles.roleSelectText,
                          isSuperUser &&
                            styles.disabledRoleText,
                        ]}
                      >
                        {role}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                <View
                  style={styles.memberRoleRow}
                >
                  <Text
                    style={styles.memberRoleText}
                  >
                    ✓ Member
                  </Text>
                </View>
              </View>

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

                const isSuperUserMember =
                  Number(
                    member.is_super_user ?? 0,
                  ) === 1;

                const assignedRoles =
                  member.assigned_roles
                    ? member.assigned_roles
                        .split(',')
                        .map((role) =>
                          role.trim(),
                        )
                        .filter(Boolean)
                    : [];

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
                        Status:{' '}
                        {isExecutive
                          ? 'Executive'
                          : 'Member'}
                      </Text>

                      {isSuperUserMember && (
                        <View
                          style={
                            styles.superUserMemberBadge
                          }
                        >
                          <Text
                            style={
                              styles.superUserMemberBadgeText
                            }
                          >
                            SUPER USER
                          </Text>
                        </View>
                      )}

                      {assignedRoles.length >
                        0 && (
                        <Text
                          style={
                            styles.assignedRolesText
                          }
                        >
                          Roles:{' '}
                          {isSuperUserMember
                            ? 'All Executive Roles'
                            : assignedRoles.join(
                                ', ',
                              )}
                        </Text>
                      )}

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
                            handleChangeExistingRole(
                              member,
                              true,
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
                            handleChangeExistingRole(
                              member,
                              false,
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

  superUserCard: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#f0fdf4',
  },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#16a34a',
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },

  checkboxChecked: {
    backgroundColor: '#16a34a',
  },

  checkmark: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },

  checkboxTextArea: {
    marginLeft: 10,
    flex: 1,
  },

  superUserTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  superUserDescription: {
    marginTop: 2,
    fontSize: 12,
    color: '#16a34a',
  },

  superUserBanner: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#16a34a',
  },

  superUserBannerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },

  superUserBannerSubtext: {
    marginTop: 4,
    color: '#dcfce7',
    fontSize: 12,
    lineHeight: 17,
  },

  rolesCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#ffffff',
  },

  rolesCardDisabled: {
    opacity: 0.45,
  },

  rolesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  rolesLimit: {
    marginTop: 3,
    marginBottom: 8,
    fontSize: 12,
    color: '#6b7280',
  },

  roleSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
  },

  roleCheckbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: '#16a34a',
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },

  roleCheckboxSelected: {
    backgroundColor: '#16a34a',
  },

  roleCheckmark: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  roleSelectText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#374151',
  },

  disabledRoleText: {
    color: '#9ca3af',
  },

  memberRoleRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },

  memberRoleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16a34a',
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

  superUserMemberBadge: {
    alignSelf: 'flex-start',
    marginTop: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: '#16a34a',
  },

  superUserMemberBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },

  assignedRolesText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
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
