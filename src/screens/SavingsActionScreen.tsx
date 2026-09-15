import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

import {
  getAllGroups,
  getMembersByGroupId,
  recordSavings,
  type GroupRecord,
  type MemberRecord,
} from '../database/database';

export default function SavingsActionScreen() {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);

  const [selectedGroup, setSelectedGroup] = useState<GroupRecord | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberRecord | null>(
    null,
  );

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    try {
      setLoading(true);

      const allGroups = await getAllGroups();

      const activeGroups = allGroups.filter(
        (group) => group.status.toLowerCase() === 'active',
      );

      setGroups(activeGroups);

      if (activeGroups.length === 1) {
        await selectGroup(activeGroups[0]);
      }
    } catch (error) {
      console.error('Failed to load groups:', error);

      Alert.alert(
        'Error',
        'Unable to load groups. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function selectGroup(group: GroupRecord) {
    try {
      setSelectedGroup(group);
      setSelectedMember(null);

      const groupMembers = await getMembersByGroupId(group.id);

      const activeMembers = groupMembers.filter(
        (member) => member.status.toLowerCase() === 'active',
      );

      setMembers(activeMembers);
    } catch (error) {
      console.error('Failed to load members:', error);

      Alert.alert(
        'Error',
        'Unable to load members for this group.',
      );
    }
  }

  function validateAmount(): number | null {
    const cleanedAmount = amount.trim().replace(/,/g, '');

    if (!cleanedAmount) {
      Alert.alert(
        'Amount required',
        'Please enter the savings amount.',
      );
      return null;
    }

    const numericAmount = Number(cleanedAmount);

    if (!Number.isFinite(numericAmount)) {
      Alert.alert(
        'Invalid amount',
        'Please enter a valid savings amount.',
      );
      return null;
    }

    if (numericAmount <= 0) {
      Alert.alert(
        'Invalid amount',
        'Savings amount must be greater than UGX 0.',
      );
      return null;
    }

    return numericAmount;
  }

  async function saveSavings() {
    if (!selectedGroup) {
      Alert.alert(
        'Group required',
        'Please select a group first.',
      );
      return;
    }

    if (!selectedMember) {
      Alert.alert(
        'Member required',
        'Please select the member who is saving.',
      );
      return;
    }

    const numericAmount = validateAmount();

    if (numericAmount === null) {
      return;
    }

    try {
      setSaving(true);

      /*
       * Uses the existing database function:
       * recordSavings(groupId, memberId, amount)
       */
      await recordSavings(
        selectedGroup.id,
        selectedMember.id,
        numericAmount,
      );

      Alert.alert(
        'Savings recorded',
        `UGX ${numericAmount.toLocaleString()} has been recorded for ${selectedMember.full_name}.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setAmount('');
              setDescription('');
            },
          },
        ],
      );
    } catch (error) {
      console.error('Failed to record savings:', error);

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to record the savings transaction.';

      Alert.alert(
        'Savings failed',
        message,
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color="#16a34a"
          />

          <Text style={styles.loadingText}>
            Loading savings...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>
              Savings Action
            </Text>

            <Text style={styles.subtitle}>
              Record a member savings contribution
            </Text>
          </View>

          {/* GROUP */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Select Group
            </Text>

            {groups.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  No active group is available.
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={
                  styles.horizontalList
                }
              >
                {groups.map((group) => {
                  const isSelected =
                    selectedGroup?.id === group.id;

                  return (
                    <TouchableOpacity
                      key={group.id}
                      style={[
                        styles.groupButton,
                        isSelected &&
                          styles.selectedButton,
                      ]}
                      onPress={() =>
                        selectGroup(group)
                      }
                      disabled={saving}
                    >
                      <Text
                        style={[
                          styles.groupButtonText,
                          isSelected &&
                            styles.selectedButtonText,
                        ]}
                      >
                        KYA {group.group_number}
                      </Text>

                      <Text
                        style={[
                          styles.groupName,
                          isSelected &&
                            styles.selectedButtonText,
                        ]}
                        numberOfLines={1}
                      >
                        {group.group_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* SELECTED GROUP */}
          {selectedGroup && (
            <View style={styles.selectedInfo}>
              <Text style={styles.selectedInfoLabel}>
                Selected Group
              </Text>

              <Text style={styles.selectedInfoValue}>
                KYA {selectedGroup.group_number}
              </Text>

              <Text style={styles.selectedInfoName}>
                {selectedGroup.group_name}
              </Text>
            </View>
          )}

          {/* MEMBER */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Select Member
            </Text>

            {!selectedGroup ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  Select a group first.
                </Text>
              </View>
            ) : members.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  No active members found in this group.
                </Text>
              </View>
            ) : (
              <View style={styles.memberList}>
                {members.map((member) => {
                  const isSelected =
                    selectedMember?.id === member.id;

                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        styles.memberButton,
                        isSelected &&
                          styles.selectedMemberButton,
                      ]}
                      onPress={() =>
                        setSelectedMember(member)
                      }
                      disabled={saving}
                    >
                      <View
                        style={styles.memberNumberBox}
                      >
                        <Text
                          style={[
                            styles.memberNumber,
                            isSelected &&
                              styles.selectedMemberText,
                          ]}
                        >
                          {member.member_number}
                        </Text>
                      </View>

                      <View
                        style={styles.memberDetails}
                      >
                        <Text
                          style={[
                            styles.memberName,
                            isSelected &&
                              styles.selectedMemberText,
                          ]}
                        >
                          {member.full_name}
                        </Text>

                        <Text
                          style={[
                            styles.memberPhone,
                            isSelected &&
                              styles.selectedMemberText,
                          ]}
                        >
                          {member.phone ||
                            'No phone number'}
                        </Text>
                      </View>

                      {isSelected && (
                        <Text style={styles.checkMark}>
                          ✓
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* AMOUNT */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Savings Amount (UGX)
            </Text>

            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="Enter amount"
              placeholderTextColor="#888"
              keyboardType="numeric"
              editable={!saving}
            />
          </View>

          {/* DESCRIPTION */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Description (Optional)
            </Text>

            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Example: Weekly savings"
              placeholderTextColor="#888"
              multiline
              editable={!saving}
            />
          </View>

          {/* SUMMARY */}
          {selectedMember &&
            amount.trim() !== '' && (
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>
                  Savings Summary
                </Text>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Member
                  </Text>

                  <Text style={styles.summaryValue}>
                    {selectedMember.full_name}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Member Number
                  </Text>

                  <Text style={styles.summaryValue}>
                    {selectedMember.member_number}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Amount
                  </Text>

                  <Text style={styles.summaryAmount}>
                    UGX {amount.replace(/,/g, '')}
                  </Text>
                </View>
              </View>
            )}

          {/* SAVE */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              saving && styles.disabledButton,
            ]}
            onPress={saveSavings}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />
            ) : (
              <Text style={styles.saveButtonText}>
                SAVE SAVINGS
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.note}>
            Savings are recorded in the member's group
            Savings Account.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  keyboardContainer: {
    flex: 1,
  },

  container: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    marginBottom: 24,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#16a34a',
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 15,
    color: '#666666',
  },

  section: {
    marginBottom: 22,
  },

  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222222',
    marginBottom: 10,
  },

  horizontalList: {
    paddingRight: 10,
  },

  groupButton: {
    width: 180,
    minHeight: 75,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    backgroundColor: '#FFFFFF',
  },

  selectedButton: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },

  groupButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16a34a',
    marginBottom: 4,
  },

  selectedButtonText: {
    color: '#FFFFFF',
  },

  groupName: {
    fontSize: 13,
    color: '#555555',
  },

  selectedInfo: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 15,
    marginBottom: 22,
  },

  selectedInfoLabel: {
    fontSize: 13,
    color: '#166534',
    marginBottom: 4,
  },

  selectedInfoValue: {
    fontSize: 21,
    fontWeight: '800',
    color: '#15803D',
  },

  selectedInfoName: {
    fontSize: 14,
    color: '#166534',
    marginTop: 3,
  },

  memberList: {
    gap: 10,
  },

  memberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FFFFFF',
  },

  selectedMemberButton: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },

  memberNumberBox: {
    minWidth: 82,
  },

  memberNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
  },

  memberDetails: {
    flex: 1,
    marginLeft: 10,
  },

  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222222',
  },

  memberPhone: {
    fontSize: 13,
    color: '#777777',
    marginTop: 3,
  },

  selectedMemberText: {
    color: '#FFFFFF',
  },

  checkMark: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginLeft: 8,
  },

  amountInput: {
    height: 56,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 20,
    color: '#222222',
    backgroundColor: '#FFFFFF',
  },

  descriptionInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingTop: 14,
    fontSize: 16,
    color: '#222222',
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top',
  },

  summaryBox: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
  },

  summaryTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#222222',
    marginBottom: 12,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  summaryLabel: {
    fontSize: 14,
    color: '#666666',
    flex: 1,
  },

  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222222',
    flex: 1,
    textAlign: 'right',
  },

  summaryAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: '#16a34a',
    flex: 1,
    textAlign: 'right',
  },

  saveButton: {
    height: 56,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  disabledButton: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  note: {
    textAlign: 'center',
    color: '#777777',
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
  },

  emptyBox: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 18,
    backgroundColor: '#F9FAFB',
  },

  emptyText: {
    textAlign: 'center',
    color: '#777777',
    fontSize: 14,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 10,
    color: '#666666',
    fontSize: 15,
  },
});
