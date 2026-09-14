
import React, { useCallback, useState } from 'react';
import {
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
  getAllGroups,
  getMembersByGroupId,
  registerMember,
  GroupRecord,
  MemberRecord,
} from '../database/database';

import { useFocusEffect } from '@react-navigation/native';

type MembersScreenProps = {
  navigation: any;
};

export default function MembersScreen({
  navigation,
}: MembersScreenProps) {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroup, setSelectedGroup] =
    useState<GroupRecord | null>(null);

  const [members, setMembers] =
    useState<MemberRecord[]>([]);

  const [showRegisterForm, setShowRegisterForm] =
    useState(false);

  const [memberName, setMemberName] =
    useState('');

  const [gender, setGender] =
    useState('');

  const [age, setAge] =
    useState('');

  const [phone, setPhone] =
    useState('');

  const [cell, setCell] =
    useState('');

  const [district, setDistrict] =
    useState('');

  const [saving, setSaving] =
    useState(false);

  const loadGroups = useCallback(async () => {
    try {
      const allGroups = await getAllGroups();

      const activeGroups = allGroups.filter(
        (group) =>
          group.status.toLowerCase() === 'active',
      );

      setGroups(activeGroups);

      if (selectedGroup) {
        const refreshedGroup =
          activeGroups.find(
            (group) =>
              group.id === selectedGroup.id,
          );

        if (refreshedGroup) {
          setSelectedGroup(refreshedGroup);

          const groupMembers =
            await getMembersByGroupId(
              refreshedGroup.id,
            );

          setMembers(groupMembers);
        } else {
          setSelectedGroup(null);
          setMembers([]);
        }
      } else if (activeGroups.length === 1) {
        setSelectedGroup(activeGroups[0]);

        const groupMembers =
          await getMembersByGroupId(
            activeGroups[0].id,
          );

        setMembers(groupMembers);
      }
    } catch (error) {
      console.error(
        'Failed to load groups:',
        error,
      );

      Alert.alert(
        'Error',
        'Unable to load groups.',
      );
    }
  }, [selectedGroup]);

  useFocusEffect(
    useCallback(() => {
      loadGroups();
    }, [loadGroups]),
  );

  const selectGroup = async (
    group: GroupRecord,
  ) => {
    try {
      setSelectedGroup(group);

      const groupMembers =
        await getMembersByGroupId(group.id);

      setMembers(groupMembers);
      setShowRegisterForm(false);
    } catch (error) {
      console.error(
        'Failed to load members:',
        error,
      );

      Alert.alert(
        'Error',
        'Unable to load members.',
      );
    }
  };

  const clearForm = () => {
    setMemberName('');
    setGender('');
    setAge('');
    setPhone('');
    setCell('');
    setDistrict('');
  };

  const handleRegisterMember = async () => {
    if (!selectedGroup) {
      Alert.alert(
        'No Group Selected',
        'Please select a group first.',
      );
      return;
    }

    const cleanName = memberName.trim();
    const cleanGender = gender.trim();
    const cleanAge = age.trim();
    const cleanPhone = phone.trim();
    const cleanCell = cell.trim();
    const cleanDistrict = district.trim();

    if (!cleanName) {
      Alert.alert(
        'Required',
        'Member name is required.',
      );
      return;
    }

    if (!cleanGender) {
      Alert.alert(
        'Required',
        'Gender is required.',
      );
      return;
    }

    const numericAge = Number(cleanAge);

    if (
      !cleanAge ||
      !Number.isInteger(numericAge) ||
      numericAge <= 0
    ) {
      Alert.alert(
        'Invalid Age',
        'Please enter a valid age.',
      );
      return;
    }

    if (!cleanCell) {
      Alert.alert(
        'Required',
        'Cell is required.',
      );
      return;
    }

    if (!cleanDistrict) {
      Alert.alert(
        'Required',
        'District is required.',
      );
      return;
    }

    try {
      setSaving(true);

      // registerMember returns the new member ID
      const newMemberId = await registerMember(
        selectedGroup.id,
        cleanName,
        cleanGender,
        numericAge,
        cleanPhone,
        cleanCell,
        cleanDistrict,
        null,
      );

      // Reload the complete member list
      const updatedMembers =
        await getMembersByGroupId(
          selectedGroup.id,
        );

      setMembers(updatedMembers);

      // Find the actual MemberRecord using the returned ID
      const newMember = updatedMembers.find(
        (member) => member.id === newMemberId,
      );

      clearForm();
      setShowRegisterForm(false);

      if (newMember) {
        Alert.alert(
          'Member Registered',
          `${newMember.full_name} has been registered successfully.\n\nMember Number: ${newMember.member_number}`,
        );
      } else {
        Alert.alert(
          'Member Registered',
          `${cleanName} has been registered successfully.`,
        );
      }
    } catch (error) {
      console.error(
        'Failed to register member:',
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : 'The member could not be registered.';

      Alert.alert(
        'Registration Failed',
        message,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>
            Members
          </Text>

          <Text style={styles.headerSubtitle}>
            Register and manage group members
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Group Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Select Group
          </Text>

          {groups.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                No active group
              </Text>

              <Text style={styles.emptyText}>
                Please register a group before
                registering members.
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() =>
                  navigation.navigate(
                    'Constitution',
                  )
                }
              >
                <Text
                  style={styles.secondaryButtonText}
                >
                  Open Constitution
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            groups.map((group) => {
              const selected =
                selectedGroup?.id === group.id;

              return (
                <TouchableOpacity
                  key={group.id}
                  style={[
                    styles.groupCard,
                    selected &&
                      styles.selectedGroupCard,
                  ]}
                  onPress={() =>
                    selectGroup(group)
                  }
                  activeOpacity={0.8}
                >
                  <View style={styles.groupNumberBox}>
                    <Text
                      style={
                        styles.groupNumberText
                      }
                    >
                      KYA {group.group_number}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.groupDetails
                    }
                  >
                    <Text
                      style={styles.groupName}
                    >
                      {group.group_name}
                    </Text>

                    <Text
                      style={styles.groupLocation}
                    >
                      {group.district},{' '}
                      {group.country}
                    </Text>
                  </View>

                  {selected && (
                    <Text
                      style={styles.checkMark}
                    >
                      ✓
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Selected Group */}
        {selectedGroup && (
          <>
            <View style={styles.selectedGroupBanner}>
              <Text
                style={styles.selectedGroupLabel}
              >
                CURRENT GROUP
              </Text>

              <Text
                style={styles.selectedGroupNumber}
              >
                KYA {selectedGroup.group_number}
              </Text>

              <Text
                style={styles.selectedGroupName}
              >
                {selectedGroup.group_name}
              </Text>

              <Text
                style={styles.memberCount}
              >
                {members.length} member
                {members.length === 1
                  ? ''
                  : 's'}
              </Text>
            </View>

            {/* Register Button */}
            {!showRegisterForm && (
              <TouchableOpacity
                style={styles.registerButton}
                onPress={() =>
                  setShowRegisterForm(true)
                }
                activeOpacity={0.8}
              >
                <Text
                  style={styles.registerButtonText}
                >
                  + Register New Member
                </Text>
              </TouchableOpacity>
            )}

            {/* Registration Form */}
            {showRegisterForm && (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>
                  Register New Member
                </Text>

                <Text style={styles.inputLabel}>
                  Full Name *
                </Text>

                <TextInput
                  style={styles.input}
                  value={memberName}
                  onChangeText={setMemberName}
                  placeholder="Enter member full name"
                  placeholderTextColor="#9ca3af"
                />

                <Text style={styles.inputLabel}>
                  Gender *
                </Text>

                <View style={styles.genderRow}>
                  {['Male', 'Female'].map(
                    (item) => (
                      <TouchableOpacity
                        key={item}
                        style={[
                          styles.genderButton,
                          gender === item &&
                            styles.genderButtonSelected,
                        ]}
                        onPress={() =>
                          setGender(item)
                        }
                      >
                        <Text
                          style={[
                            styles.genderButtonText,
                            gender === item &&
                              styles.genderButtonTextSelected,
                          ]}
                        >
                          {item}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>

                <Text style={styles.inputLabel}>
                  Age *
                </Text>

                <TextInput
                  style={styles.input}
                  value={age}
                  onChangeText={setAge}
                  placeholder="Enter age"
                  placeholderTextColor="#9ca3af"
                  keyboardType="number-pad"
                />

                <Text style={styles.inputLabel}>
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

                <Text style={styles.inputLabel}>
                  Cell *
                </Text>

                <TextInput
                  style={styles.input}
                  value={cell}
                  onChangeText={setCell}
                  placeholder="Enter cell"
                  placeholderTextColor="#9ca3af"
                />

                <Text style={styles.inputLabel}>
                  District *
                </Text>

                <TextInput
                  style={styles.input}
                  value={district}
                  onChangeText={setDistrict}
                  placeholder="Enter district"
                  placeholderTextColor="#9ca3af"
                />

                <View style={styles.formButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      clearForm();
                      setShowRegisterForm(false);
                    }}
                    disabled={saving}
                  >
                    <Text
                      style={styles.cancelButtonText}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      saving &&
                        styles.disabledButton,
                    ]}
                    onPress={
                      handleRegisterMember
                    }
                    disabled={saving}
                  >
                    <Text
                      style={styles.saveButtonText}
                    >
                      {saving
                        ? 'Registering...'
                        : 'Register Member'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Members List */}
            <View style={styles.membersSection}>
              <Text style={styles.sectionTitle}>
                Registered Members
              </Text>

              {members.length === 0 ? (
                <View style={styles.emptyMembers}>
                  <Text
                    style={styles.emptyMembersTitle}
                  >
                    No members yet
                  </Text>

                  <Text
                    style={styles.emptyMembersText}
                  >
                    Register the first member of
                    this group.
                  </Text>
                </View>
              ) : (
                members.map((member) => (
                  <View
                    key={member.id}
                    style={styles.memberCard}
                  >
                    <View
                      style={styles.memberAvatar}
                    >
                      <Text
                        style={
                          styles.memberAvatarText
                        }
                      >
                        {member.full_name
                          .charAt(0)
                          .toUpperCase()}
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
                        style={styles.memberNumber}
                      >
                        {member.member_number}
                      </Text>

                      <Text
                        style={styles.memberDetails}
                      >
                        {member.gender}
                        {' • '}
                        {member.age} years
                      </Text>

                      {member.phone && (
                        <Text
                          style={
                            styles.memberPhone
                          }
                        >
                          {member.phone}
                        </Text>
                      )}
                    </View>

                    <View
                      style={styles.statusBadge}
                    >
                      <Text
                        style={
                          styles.statusText
                        }
                      >
                        {member.status}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
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
    paddingHorizontal: 15,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  backText: {
    color: '#16a34a',
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '400',
  },

  headerTitleContainer: {
    flex: 1,
  },

  headerTitle: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '800',
  },

  headerSubtitle: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 2,
  },

  content: {
    padding: 16,
    paddingBottom: 35,
  },

  section: {
    marginBottom: 18,
  },

  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },

  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    elevation: 2,
  },

  selectedGroupCard: {
    borderColor: '#16a34a',
    borderWidth: 2,
  },

  groupNumberBox: {
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginRight: 10,
  },

  groupNumberText: {
    color: '#15803d',
    fontSize: 12,
    fontWeight: '800',
  },

  groupDetails: {
    flex: 1,
  },

  groupName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },

  groupLocation: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 3,
  },

  checkMark: {
    color: '#16a34a',
    fontSize: 22,
    fontWeight: '900',
    marginLeft: 8,
  },

  selectedGroupBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
  },

  selectedGroupLabel: {
    color: '#15803d',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  selectedGroupNumber: {
    color: '#16a34a',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 3,
  },

  selectedGroupName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },

  memberCount: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 5,
  },

  registerButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 18,
  },

  registerButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  formCard: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
  },

  formTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 15,
  },

  inputLabel: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 10,
  },

  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#111827',
    fontSize: 15,
  },

  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },

  genderButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
  },

  genderButtonSelected: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
  },

  genderButtonText: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '700',
  },

  genderButtonTextSelected: {
    color: '#15803d',
  },

  formButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },

  cancelButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: 'center',
  },

  cancelButtonText: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '800',
  },

  saveButton: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: 'center',
  },

  disabledButton: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },

  emptyBox: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },

  emptyTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },

  emptyText: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 5,
    lineHeight: 19,
  },

  secondaryButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 9,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginTop: 14,
  },

  secondaryButtonText: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '800',
  },

  membersSection: {
    marginTop: 3,
  },

  emptyMembers: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 20,
    alignItems: 'center',
  },

  emptyMembersTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },

  emptyMembersText: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 4,
  },

  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
  },

  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  memberAvatarText: {
    color: '#15803d',
    fontSize: 18,
    fontWeight: '900',
  },

  memberInfo: {
    flex: 1,
  },

  memberName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },

  memberNumber: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },

  memberDetails: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 3,
  },

  memberPhone: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },

  statusBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginLeft: 6,
  },

  statusText: {
    color: '#15803d',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
