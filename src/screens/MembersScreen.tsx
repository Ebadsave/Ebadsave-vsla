import React, { useCallback, useEffect, useState } from 'react';
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
  type GroupRecord,
  type MemberRecord,
} from '../database/database';

type Gender = 'male' | 'female';

export default function MembersScreen() {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroup, setSelectedGroup] =
    useState<GroupRecord | null>(null);

  const [members, setMembers] = useState<MemberRecord[]>([]);

  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [cell, setCell] = useState('');
  const [district, setDistrict] = useState('');

  const [kin1Name, setKin1Name] = useState('');
  const [kin1Phone, setKin1Phone] = useState('');
  const [kin1Gender, setKin1Gender] =
    useState<Gender | null>(null);

  const [kin2Name, setKin2Name] = useState('');
  const [kin2Phone, setKin2Phone] = useState('');
  const [kin2Gender, setKin2Gender] =
    useState<Gender | null>(null);

  const [registering, setRegistering] = useState(false);

  const loadGroups = useCallback(async () => {
    try {
      const allGroups = await getAllGroups();

      const activeGroups = allGroups.filter(
        (group) => group.status === 'active',
      );

      setGroups(activeGroups);

      if (activeGroups.length > 0) {
        setSelectedGroup(activeGroups[0]);
        setDistrict(activeGroups[0].district);
      } else {
        setSelectedGroup(null);
        setMembers([]);
      }
    } catch (error) {
      console.error('Failed to load groups:', error);

      Alert.alert(
        'Error',
        'Could not load the registered groups.',
      );
    }
  }, []);

  const loadMembers = useCallback(
    async (groupId: number) => {
      try {
        const result = await getMembersByGroupId(groupId);
        setMembers(result);
      } catch (error) {
        console.error('Failed to load members:', error);

        Alert.alert(
          'Error',
          'Could not load group members.',
        );
      }
    },
    [],
  );

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (selectedGroup) {
      setDistrict(selectedGroup.district);
      loadMembers(selectedGroup.id);
    }
  }, [selectedGroup, loadMembers]);

  const clearForm = () => {
    setFullName('');
    setGender(null);
    setAge('');
    setPhone('');
    setCell('');
    setKin1Name('');
    setKin1Phone('');
    setKin1Gender(null);
    setKin2Name('');
    setKin2Phone('');
    setKin2Gender(null);
  };

  const handleRegister = async () => {
    if (!selectedGroup) {
      Alert.alert(
        'No Active Group',
        'Please register a group first.',
      );
      return;
    }

    if (!fullName.trim()) {
      Alert.alert(
        'Required',
        'Please enter the member full name.',
      );
      return;
    }

    if (!gender) {
      Alert.alert(
        'Required',
        'Please select the member gender.',
      );
      return;
    }

    const numericAge = Number(age);

    if (
      !age.trim() ||
      !Number.isInteger(numericAge) ||
      numericAge <= 0
    ) {
      Alert.alert(
        'Required',
        'Please enter a valid age.',
      );
      return;
    }

    if (!cell.trim()) {
      Alert.alert(
        'Required',
        'Please enter the member cell.',
      );
      return;
    }

    if (!district.trim()) {
      Alert.alert(
        'Required',
        'Please enter the member district.',
      );
      return;
    }

    if (kin1Name.trim() && !kin1Gender) {
      Alert.alert(
        'Next of Kin 1',
        'Please select the gender for Next of Kin 1.',
      );
      return;
    }

    if (kin2Name.trim() && !kin2Gender) {
      Alert.alert(
        'Next of Kin 2',
        'Please select the gender for Next of Kin 2.',
      );
      return;
    }

    try {
      setRegistering(true);

      await registerMember({
        groupId: selectedGroup.id,
        fullName: fullName.trim(),
        gender,
        age: numericAge,
        phone: phone.trim() || null,
        cell: cell.trim(),
        district: district.trim(),
        nextOfKin1Name: kin1Name.trim() || null,
        nextOfKin1Phone: kin1Phone.trim() || null,
        nextOfKin1Gender: kin1Gender,
        nextOfKin2Name: kin2Name.trim() || null,
        nextOfKin2Phone: kin2Phone.trim() || null,
        nextOfKin2Gender: kin2Gender,
      });

      await loadMembers(selectedGroup.id);

      Alert.alert(
        'Member Registered',
        `${fullName.trim()} has been registered successfully.`,
      );

      clearForm();
    } catch (error) {
      console.error(
        'Failed to register member:',
        error,
      );

      Alert.alert(
        'Registration Error',
        error instanceof Error
          ? error.message
          : 'The member could not be registered.',
      );
    } finally {
      setRegistering(false);
    }
  };

  const GenderButtons = ({
    value,
    onChange,
  }: {
    value: Gender | null;
    onChange: (value: Gender) => void;
  }) => {
    return (
      <View style={styles.genderRow}>
        <TouchableOpacity
          style={[
            styles.genderButton,
            value === 'male' && styles.genderSelected,
          ]}
          onPress={() => onChange('male')}
        >
          <Text
            style={[
              styles.genderText,
              value === 'male' &&
                styles.genderTextSelected,
            ]}
          >
            Male
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.genderButton,
            value === 'female' && styles.genderSelected,
          ]}
          onPress={() => onChange('female')}
        >
          <Text
            style={[
              styles.genderText,
              value === 'female' &&
                styles.genderTextSelected,
            ]}
          >
            Female
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            Members
          </Text>

          <Text style={styles.headerSubtitle}>
            Register and manage members
          </Text>
        </View>

        <View style={styles.countCircle}>
          <Text style={styles.countText}>
            {members.length}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>
          Active Group
        </Text>

        {selectedGroup ? (
          <View style={styles.groupCard}>
            <View style={styles.groupLogo}>
              <Text style={styles.groupLogoText}>
                E
              </Text>
            </View>

            <View>
              <Text style={styles.groupName}>
                {selectedGroup.group_name}
              </Text>

              <Text style={styles.groupNumber}>
                KYA {selectedGroup.group_number}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              No active group registered.
            </Text>
          </View>
        )}

        {groups.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.groupOptions}
          >
            {groups.map((group) => (
              <TouchableOpacity
                key={group.id}
                style={[
                  styles.groupOption,
                  selectedGroup?.id === group.id &&
                    styles.groupOptionSelected,
                ]}
                onPress={() =>
                  setSelectedGroup(group)
                }
              >
                <Text
                  style={[
                    styles.groupOptionText,
                    selectedGroup?.id === group.id &&
                      styles.groupOptionTextSelected,
                  ]}
                >
                  KYA {group.group_number}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Member Details
          </Text>

          <Text style={styles.label}>
            Full Names *
          </Text>

          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Enter full names"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>
            Gender *
          </Text>

          <GenderButtons
            value={gender}
            onChange={setGender}
          />

          <Text style={styles.label}>
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
            Cell *
          </Text>

          <TextInput
            style={styles.input}
            value={cell}
            onChangeText={setCell}
            placeholder="Enter cell"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>
            District *
          </Text>

          <TextInput
            style={styles.input}
            value={district}
            onChangeText={setDistrict}
            placeholder="Enter district"
            placeholderTextColor="#9ca3af"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.titleRow}>
            <Text style={styles.sectionTitle}>
              Next of Kin 1
            </Text>

            <Text style={styles.optional}>
              Optional
            </Text>
          </View>

          <Text style={styles.label}>
            Name
          </Text>

          <TextInput
            style={styles.input}
            value={kin1Name}
            onChangeText={setKin1Name}
            placeholder="Name"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>
            Phone
          </Text>

          <TextInput
            style={styles.input}
            value={kin1Phone}
            onChangeText={setKin1Phone}
            placeholder="Phone"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>
            Gender
          </Text>

          <GenderButtons
            value={kin1Gender}
            onChange={setKin1Gender}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.titleRow}>
            <Text style={styles.sectionTitle}>
              Next of Kin 2
            </Text>

            <Text style={styles.optional}>
              Optional
            </Text>
          </View>

          <Text style={styles.label}>
            Name
          </Text>

          <TextInput
            style={styles.input}
            value={kin2Name}
            onChangeText={setKin2Name}
            placeholder="Name"
            placeholderTextColor="#9ca3af"
          />

          <Text style={styles.label}>
            Phone
          </Text>

          <TextInput
            style={styles.input}
            value={kin2Phone}
            onChangeText={setKin2Phone}
            placeholder="Phone"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>
            Gender
          </Text>

          <GenderButtons
            value={kin2Gender}
            onChange={setKin2Gender}
          />
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>
            Automatic Member Number
          </Text>

          <Text style={styles.noticeText}>
            The system automatically assigns a permanent
            member number.
          </Text>

          <Text style={styles.example}>
            Example: KYA2010001
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.registerButton,
            registering &&
              styles.registerButtonDisabled,
          ]}
          onPress={handleRegister}
          disabled={registering}
        >
          <Text style={styles.registerButtonText}>
            {registering
              ? 'Registering...'
              : 'Register Member'}
          </Text>
        </TouchableOpacity>

        <View style={styles.membersSection}>
          <Text style={styles.sectionTitle}>
            Registered Members
          </Text>

          {members.length === 0 ? (
            <View style={styles.emptyMembers}>
              <Text style={styles.emptyMembersTitle}>
                No members yet
              </Text>

              <Text style={styles.emptyText}>
                Registered members will appear here.
              </Text>
            </View>
          ) : (
            members.map((member) => (
              <View
                key={member.id}
                style={styles.memberCard}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {member.full_name
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>

                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {member.full_name}
                  </Text>

                  <Text style={styles.memberNumber}>
                    {member.member_number}
                  </Text>

                  <Text style={styles.memberDetails}>
                    {member.gender} • Age {member.age}
                  </Text>

                  {member.phone ? (
                    <Text style={styles.memberPhone}>
                      {member.phone}
                    </Text>
                  ) : (
                    <Text style={styles.noPhone}>
                      No phone number
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
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
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },

  headerSubtitle: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 3,
  },

  countCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  countText: {
    color: '#16a34a',
    fontSize: 17,
    fontWeight: '900',
  },

  content: {
    padding: 16,
    paddingBottom: 40,
  },

  section: {
    marginTop: 22,
  },

  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },

  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 14,
  },

  groupLogo: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  groupLogoText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },

  groupName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },

  groupNumber: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },

  groupOptions: {
    marginTop: 10,
  },

  groupOption: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },

  groupOptionSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },

  groupOptionText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
  },

  groupOptionTextSelected: {
    color: '#ffffff',
  },

  label: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    backgroundColor: '#ffffff',
    color: '#111827',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },

  genderButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingVertical: 12,
    alignItems: 'center',
  },

  genderSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },

  genderText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },

  genderTextSelected: {
    color: '#ffffff',
  },

  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  optional: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 12,
  },

  notice: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 13,
    marginTop: 22,
  },

  noticeTitle: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '800',
  },

  noticeText: {
    color: '#4b5563',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },

  example: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 6,
  },

  registerButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },

  registerButtonDisabled: {
    opacity: 0.6,
  },

  registerButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  membersSection: {
    marginTop: 28,
  },

  memberCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 13,
    marginBottom: 10,
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  avatarText: {
    color: '#16a34a',
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
    fontWeight: '700',
    marginTop: 2,
  },

  memberDetails: {
    color: '#4b5563',
    fontSize: 12,
    marginTop: 4,
    textTransform: 'capitalize',
  },

  memberPhone: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },

  noPhone: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
  },

  emptyBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    padding: 15,
  },

  emptyText: {
    color: '#6b7280',
    fontSize: 13,
  },

  emptyMembers: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    padding: 22,
    alignItems: 'center',
  },

  emptyMembersTitle: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
});
