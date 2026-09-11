import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

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

  const [fullName, setFullName] =
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

  const [registering, setRegistering] =
    useState(false);

  const loadGroups = useCallback(
    async () => {
      try {
        const allGroups =
          await getAllGroups();

        setGroups(allGroups);

        const activeGroups =
          allGroups.filter(
            (group) =>
              group.status === 'active',
          );

        if (activeGroups.length > 0) {
          setSelectedGroup(
            activeGroups[0],
          );
        } else {
          setSelectedGroup(null);
          setMembers([]);
        }
      } catch (error) {
        console.error(
          'Failed to load groups:',
          error,
        );

        Alert.alert(
          'Error',
          'Could not load groups.',
        );
      }
    },
    [],
  );

  const loadMembers = useCallback(
    async () => {
      if (!selectedGroup) {
        setMembers([]);
        return;
      }

      try {
        const groupMembers =
          await getMembersByGroupId(
            selectedGroup.id,
          );

        setMembers(groupMembers);
      } catch (error) {
        console.error(
          'Failed to load members:',
          error,
        );

        Alert.alert(
          'Error',
          'Could not load members.',
        );
      }
    },
    [selectedGroup],
  );

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const clearForm = () => {
    setFullName('');
    setGender('');
    setAge('');
    setPhone('');
    setCell('');
    setDistrict('');
  };

  const handleRegisterMember =
    async () => {
      if (!selectedGroup) {
        Alert.alert(
          'No Active Group',
          'Please register or select an active group first.',
        );
        return;
      }

      if (!fullName.trim()) {
        Alert.alert(
          'Required',
          'Full Names are required.',
        );
        return;
      }

      if (!gender.trim()) {
        Alert.alert(
          'Required',
          'Gender is required.',
        );
        return;
      }

      const numericAge =
        Number(age.trim());

      if (
        !age.trim() ||
        !Number.isFinite(numericAge) ||
        numericAge <= 0
      ) {
        Alert.alert(
          'Invalid Age',
          'Please enter a valid age.',
        );
        return;
      }

      if (!cell.trim()) {
        Alert.alert(
          'Required',
          'Cell is required.',
        );
        return;
      }

      if (!district.trim()) {
        Alert.alert(
          'Required',
          'District is required.',
        );
        return;
      }

      try {
        setRegistering(true);

        /*
         * IMPORTANT:
         * registerMember() expects separate
         * arguments in this exact order:
         *
         * groupId,
         * fullName,
         * gender,
         * age,
         * phone,
         * cell,
         * district,
         * photoUri
         */
        const memberId =
          await registerMember(
            selectedGroup.id,
            fullName.trim(),
            gender.trim(),
            numericAge,
            phone.trim(),
            cell.trim(),
            district.trim(),
            null,
          );

        await loadMembers();

        clearForm();

        Alert.alert(
          'Member Registered',
          `Member has been registered successfully.\n\nMember number will be assigned by the system.`,
        );

        console.log(
          'Registered member ID:',
          memberId,
        );
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
          'Registration Error',
          message,
        );
      } finally {
        setRegistering(false);
      }
    };

  return (
    <SafeAreaView
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() =>
            navigation.goBack()
          }
          activeOpacity={0.8}
        >
          <Text
            style={styles.backText}
          >
            ‹
          </Text>
        </TouchableOpacity>

        <View style={styles.headerTitleBox}>
          <Text
            style={styles.headerTitle}
          >
            Members
          </Text>

          <Text
            style={styles.headerSubtitle}
          >
            Register and manage group members
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.content
        }
      >
        {/* Group */}
        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
          >
            Active Group
          </Text>

          {selectedGroup ? (
            <View style={styles.groupCard}>
              <Text
                style={styles.groupName}
              >
                {selectedGroup.group_name}
              </Text>

              <Text
                style={styles.groupNumber}
              >
                KYA {selectedGroup.group_number}
              </Text>

              <Text
                style={styles.groupLocation}
              >
                {selectedGroup.district},{' '}
                {selectedGroup.country}
              </Text>
            </View>
          ) : (
            <View
              style={styles.emptyCard}
            >
              <Text
                style={styles.emptyText}
              >
                No active group found.
              </Text>

              <TouchableOpacity
                style={styles.constitutionButton}
                onPress={() =>
                  navigation.navigate(
                    'Constitution',
                  )
                }
                activeOpacity={0.8}
              >
                <Text
                  style={
                    styles.constitutionButtonText
                  }
                >
                  Open Constitution
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Registration Form */}
        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
          >
            Register New Member
          </Text>

          <View style={styles.formCard}>
            <Text
              style={styles.label}
            >
              Full Names *
            </Text>

            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter full names"
              placeholderTextColor="#9ca3af"
            />

            <Text
              style={styles.label}
            >
              Gender *
            </Text>

            <View style={styles.genderRow}>
              <TouchableOpacity
                style={[
                  styles.genderButton,
                  gender === 'Male' &&
                    styles.genderButtonActive,
                ]}
                onPress={() =>
                  setGender('Male')
                }
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.genderText,
                    gender === 'Male' &&
                      styles.genderTextActive,
                  ]}
                >
                  Male
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.genderButton,
                  gender === 'Female' &&
                    styles.genderButtonActive,
                ]}
                onPress={() =>
                  setGender('Female')
                }
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.genderText,
                    gender === 'Female' &&
                      styles.genderTextActive,
                  ]}
                >
                  Female
                </Text>
              </TouchableOpacity>
            </View>

            <Text
              style={styles.label}
            >
              Age *
            </Text>

            <TextInput
              style={styles.input}
              value={age}
              onChangeText={setAge}
              placeholder="Enter age"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
            />

            <Text
              style={styles.label}
            >
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

            <Text
              style={styles.label}
            >
              Cell *
            </Text>

            <TextInput
              style={styles.input}
              value={cell}
              onChangeText={setCell}
              placeholder="Enter cell"
              placeholderTextColor="#9ca3af"
            />

            <Text
              style={styles.label}
            >
              District *
            </Text>

            <TextInput
              style={styles.input}
              value={district}
              onChangeText={setDistrict}
              placeholder="Enter district"
              placeholderTextColor="#9ca3af"
            />

            <Text
              style={styles.infoText}
            >
              * Required fields
            </Text>

            <Text
              style={styles.numberInfo}
            >
              The system will permanently assign
              the member number automatically.
            </Text>

            <TouchableOpacity
              style={[
                styles.registerButton,
                registering &&
                  styles.disabledButton,
              ]}
              onPress={
                handleRegisterMember
              }
              disabled={registering}
              activeOpacity={0.8}
            >
              <Text
                style={
                  styles.registerButtonText
                }
              >
                {registering
                  ? 'Registering...'
                  : 'Register Member'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Member List */}
        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
          >
            Registered Members
          </Text>

          {members.length === 0 ? (
            <View
              style={styles.emptyMembers}
            >
              <Text
                style={styles.emptyMembersTitle}
              >
                No members yet
              </Text>

              <Text
                style={styles.emptyMembersText}
              >
                Registered members will appear
                here.
              </Text>
            </View>
          ) : (
            members.map(
              (member) => (
                <View
                  key={member.id}
                  style={styles.memberCard}
                >
                  <View
                    style={
                      styles.memberAvatar
                    }
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
                    style={
                      styles.memberInfo
                    }
                  >
                    <Text
                      style={
                        styles.memberName
                      }
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
                      {member.gender} • Age{' '}
                      {member.age}
                    </Text>

                    <Text
                      style={
                        styles.memberDetails
                      }
                    >
                      {member.cell},{' '}
                      {member.district}
                    </Text>

                    {member.phone ? (
                      <Text
                        style={
                          styles.memberPhone
                        }
                      >
                        {member.phone}
                      </Text>
                    ) : (
                      <Text
                        style={
                          styles.noPhone
                        }
                      >
                        No phone number
                      </Text>
                    )}
                  </View>
                </View>
              ),
            )
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
    paddingHorizontal: 15,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  backText: {
    color: '#16a34a',
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '500',
    marginTop: -3,
  },

  headerTitleBox: {
    flex: 1,
  },

  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },

  headerSubtitle: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 2,
  },

  content: {
    padding: 16,
    paddingBottom: 40,
  },

  section: {
    marginBottom: 20,
  },

  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },

  groupCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 15,
  },

  groupName: {
    color: '#166534',
    fontSize: 17,
    fontWeight: '800',
  },

  groupNumber: {
    color: '#16a34a',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },

  groupLocation: {
    color: '#4b5563',
    fontSize: 13,
    marginTop: 4,
  },

  emptyCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    padding: 16,
    alignItems: 'center',
  },

  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    marginBottom: 12,
  },

  constitutionButton: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  constitutionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },

  formCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 15,
  },

  label: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    backgroundColor: '#ffffff',
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
    borderRadius: 9,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },

  genderButtonActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
  },

  genderText: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '700',
  },

  genderTextActive: {
    color: '#15803d',
  },

  infoText: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 12,
  },

  numberInfo: {
    color: '#166534',
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },

  registerButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },

  disabledButton: {
    opacity: 0.6,
  },

  registerButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
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
    fontWeight: '800',
  },

  emptyMembersText: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 5,
  },

  memberCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 13,
    marginBottom: 10,
    elevation: 1,
  },

  memberAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  memberAvatarText: {
    color: '#16a34a',
    fontSize: 19,
    fontWeight: '900',
  },

  memberInfo: {
    flex: 1,
  },

  memberName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },

  memberNumber: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },

  memberDetails: {
    color: '#4b5563',
    fontSize: 12,
    marginTop: 3,
  },

  memberPhone: {
    color: '#374151',
    fontSize: 12,
    marginTop: 3,
  },

  noPhone: {
    color: '#9ca3af',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 3,
  },
});
