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
  GroupRecord,
  MemberRecord,
} from '../database/database';

export default function MembersScreen() {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroup, setSelectedGroup] =
    useState<GroupRecord | null>(null);

  const [members, setMembers] = useState<MemberRecord[]>([]);

  const [memberName, setMemberName] = useState('');
  const [phone, setPhone] = useState('');

  const [registering, setRegistering] = useState(false);

  const loadGroups = useCallback(async () => {
    try {
      const allGroups = await getAllGroups();

      const activeGroups = allGroups.filter(
        (group) => group.status === 'active',
      );

      setGroups(activeGroups);

      if (activeGroups.length > 0) {
        setSelectedGroup((currentGroup) => {
          if (currentGroup) {
            const stillExists = activeGroups.find(
              (group) => group.id === currentGroup.id,
            );

            if (stillExists) {
              return stillExists;
            }
          }

          return activeGroups[0];
        });
      } else {
        setSelectedGroup(null);
      }
    } catch (error) {
      console.error(
        'Failed to load groups:',
        error,
      );
    }
  }, []);

  const loadMembers = useCallback(async () => {
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
    }
  }, [selectedGroup]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleRegisterMember = async () => {
    if (!selectedGroup) {
      Alert.alert(
        'No Active Group',
        'Please register an active group first.',
      );
      return;
    }

    if (!memberName.trim()) {
      Alert.alert(
        'Member Name Required',
        'Please enter the member name.',
      );
      return;
    }

    if (registering) {
      return;
    }

    try {
      setRegistering(true);

      const newMember =
        await registerMember({
          groupId: selectedGroup.id,
          memberName,
          phone,
        });

      setMemberName('');
      setPhone('');

      await loadMembers();
      await loadGroups();

      Alert.alert(
        'Member Registered',
        `${newMember.member_name} has been registered successfully.\n\nMember Number: ${newMember.member_number}`,
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

      Alert.alert('Registration Error', message);
    } finally {
      setRegistering(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>
          Members
        </Text>

        <Text style={styles.subtitle}>
          Register and manage group members
        </Text>

        {/* Group Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Select Group
          </Text>

          {groups.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                No active groups available.
              </Text>
            </View>
          ) : (
            groups.map((group) => {
              const selected =
                selectedGroup?.id === group.id;

              return (
                <TouchableOpacity
                  key={group.id}
                  style={[
                    styles.groupOption,
                    selected &&
                      styles.groupOptionSelected,
                  ]}
                  onPress={() =>
                    setSelectedGroup(group)
                  }
                  activeOpacity={0.8}
                >
                  <View style={styles.groupInfo}>
                    <Text
                      style={styles.groupNumber}
                    >
                      KYA {group.group_number}
                    </Text>

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

                  <View
                    style={[
                      styles.radio,
                      selected &&
                        styles.radioSelected,
                    ]}
                  >
                    {selected && (
                      <View
                        style={styles.radioInner}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Add Member */}
        {selectedGroup && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Add Member
            </Text>

            <View style={styles.selectedGroupBox}>
              <Text style={styles.selectedGroupLabel}>
                Registering member under
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
            </View>

            <Text style={styles.inputLabel}>
              Member Name
            </Text>

            <TextInput
              style={styles.input}
              value={memberName}
              onChangeText={setMemberName}
              placeholder="Enter member name"
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
            />

            <Text style={styles.inputLabel}>
              Phone Number
            </Text>

            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter phone number"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
            />

            <View style={styles.numberInfo}>
              <Text style={styles.numberInfoTitle}>
                Member number
              </Text>

              <Text style={styles.numberInfoText}>
                Automatically assigned after registration
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.registerButton,
                registering &&
                  styles.registerButtonDisabled,
              ]}
              onPress={handleRegisterMember}
              disabled={registering}
              activeOpacity={0.8}
            >
              <Text
                style={styles.registerButtonText}
              >
                {registering
                  ? 'Registering...'
                  : 'Register Member'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Registered Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Registered Members
          </Text>

          {!selectedGroup ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                Select an active group.
              </Text>
            </View>
          ) : members.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>
                —
              </Text>

              <Text style={styles.emptyText}>
                No members registered yet.
              </Text>
            </View>
          ) : (
            members.map((member) => (
              <View
                key={member.id}
                style={styles.memberCard}
              >
                <View style={styles.memberNumberBox}>
                  <Text
                    style={styles.memberNumber}
                  >
                    {member.member_number}
                  </Text>
                </View>

                <View style={styles.memberInfo}>
                  <Text
                    style={styles.memberName}
                  >
                    {member.member_name}
                  </Text>

                  {member.phone ? (
                    <Text
                      style={styles.memberPhone}
                    >
                      {member.phone}
                    </Text>
                  ) : (
                    <Text
                      style={styles.noPhone}
                    >
                      No phone number
                    </Text>
                  )}
                </View>

                <View
                  style={styles.activeBadge}
                >
                  <Text
                    style={styles.activeBadgeText}
                  >
                    Active
                  </Text>
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

  content: {
    padding: 16,
    paddingBottom: 40,
  },

  title: {
    color: '#111827',
    fontSize: 26,
    fontWeight: '900',
  },

  subtitle: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 20,
  },

  section: {
    marginBottom: 24,
  },

  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },

  groupOption: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },

  groupOptionSelected: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },

  groupInfo: {
    flex: 1,
  },

  groupNumber: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: '900',
  },

  groupName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 3,
  },

  groupLocation: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
  },

  radioSelected: {
    borderColor: '#16a34a',
  },

  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#16a34a',
  },

  selectedGroupBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },

  selectedGroupLabel: {
    color: '#6b7280',
    fontSize: 12,
  },

  selectedGroupNumber: {
    color: '#16a34a',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },

  selectedGroupName: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },

  inputLabel: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },

  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: 15,
    backgroundColor: '#ffffff',
    marginBottom: 14,
  },

  numberInfo: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },

  numberInfoTitle: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '800',
  },

  numberInfoText: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 3,
  },

  registerButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },

  registerButtonDisabled: {
    opacity: 0.6,
  },

  registerButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  memberCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    elevation: 1,
  },

  memberNumberBox: {
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginRight: 10,
  },

  memberNumber: {
    color: '#16a34a',
    fontSize: 12,
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

  memberPhone: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 3,
  },

  noPhone: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 3,
  },

  activeBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  activeBadgeText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
  },

  emptyBox: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },

  emptyIcon: {
    color: '#9ca3af',
    fontSize: 26,
    marginBottom: 5,
  },

  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },
});
