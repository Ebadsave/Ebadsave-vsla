import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Modal,
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
  recordLoanRepayment,
  type GroupRecord,
  type MemberRecord,
} from '../database/database';

export default function LoanRepaymentActionScreen() {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);

  const [selectedGroup, setSelectedGroup] =
    useState<GroupRecord | null>(null);

  const [selectedMember, setSelectedMember] =
    useState<MemberRecord | null>(null);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  // Prevent a slower previous group's request from replacing the current list.
  const memberLoadRequest = useRef(0);

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    try {
      setLoading(true);

      const result = await getAllGroups();

      const activeGroups = result.filter(
        (group) => group.status === 'active',
      );

      setGroups(activeGroups);
    } catch (error) {
      console.error(error);

      Alert.alert(
        'Error',
        'Unable to load groups.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function selectGroup(group: GroupRecord) {
    // Clear the previous group's members immediately so they cannot remain
    // visible while the newly selected group's list is loading.
    const requestId = ++memberLoadRequest.current;
    setSelectedGroup(group);
    setSelectedMember(null);
    setShowMemberPicker(false);
    setMemberSearch('');
    setMembers([]);
    setAmount('');
    setReason('');

    try {
      const result = await getMembersByGroupId(group.id);

      // Ignore stale results if another group was selected while loading.
      if (requestId !== memberLoadRequest.current) return;

      // Enforce group ownership in the screen as a second safeguard.
      // MemberRecord.group_id is the authoritative group relationship.
      const activeMembers = result.filter(
        (member) =>
          Number(member.group_id) === Number(group.id) &&
          String(member.status ?? '').toLowerCase() === 'active',
      );

      setMembers(activeMembers);
    } catch (error) {
      if (requestId !== memberLoadRequest.current) return;
      console.error(error);

      Alert.alert(
        'Error',
        'Unable to load members for this group.',
      );
    }
  }

  function selectMember(member: MemberRecord) {
    // Do not allow a stale or mismatched member to be assigned to this group.
    if (Number(member.group_id) !== Number(selectedGroup?.id)) return;
    setSelectedMember(member);
    setShowMemberPicker(false);
    setMemberSearch('');
    setAmount('');
    setReason('');
  }

  const filteredMembers = members.filter((member) => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return true;
    return String(member.full_name ?? '').toLowerCase().includes(query) ||
      String(member.member_number ?? '').toLowerCase().includes(query);
  });

  async function handleRepayment() {
    if (!selectedGroup) {
      Alert.alert(
        'Select Group',
        'Please select a group first.',
      );
      return;
    }

    if (!selectedMember) {
      Alert.alert(
        'Select Member',
        'Please select the member making the repayment.',
      );
      return;
    }

    const numericAmount = Number(amount);

    if (
      !amount.trim() ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      Alert.alert(
        'Invalid Amount',
        'Please enter a valid repayment amount greater than zero.',
      );
      return;
    }

    try {
      setSaving(true);

      await recordLoanRepayment(
        selectedGroup.id,
        selectedMember.id,
        numericAmount,
        undefined,
        reason.trim() || undefined,
      );

      Alert.alert(
        'Repayment Recorded',
        `UGX ${numericAmount.toLocaleString()} loan repayment has been recorded for ${selectedMember.full_name}.`,
      );

      setAmount('');
      setReason('');
    } catch (error) {
      console.error(error);

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to record the loan repayment.';

      Alert.alert(
        'Repayment Failed',
        message,
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          size="large"
          color="#16a34a"
        />

        <Text style={styles.loadingText}>
          Loading groups...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>
        Loan Repayment
      </Text>

      <Text style={styles.subtitle}>
        Record a member's loan repayment.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          1. Select Group
        </Text>

        {groups.length === 0 ? (
          <Text style={styles.emptyText}>
            No active groups available.
          </Text>
        ) : (
          groups.map((group) => (
            <TouchableOpacity
              key={group.id}
              style={[
                styles.option,
                selectedGroup?.id === group.id &&
                  styles.selectedOption,
              ]}
              onPress={() => selectGroup(group)}
            >
              <Text
                style={[
                  styles.optionText,
                  selectedGroup?.id === group.id &&
                    styles.selectedOptionText,
                ]}
              >
                KYA {group.group_number}
              </Text>

              <Text
                style={[
                  styles.groupName,
                  selectedGroup?.id === group.id &&
                    styles.selectedOptionText,
                ]}
              >
                {group.group_name}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {selectedGroup && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Select Member</Text>

          {selectedMember ? (
            <View style={styles.selectedMemberCard}>
              <Text style={styles.selectedMemberNumber}>
                {selectedMember.member_number}
              </Text>
              <Text style={styles.selectedMemberName}>
                {selectedMember.full_name}
              </Text>
              <TouchableOpacity
                style={styles.changeMemberButton}
                onPress={() => setShowMemberPicker(true)}
                disabled={saving}
              >
                <Text style={styles.changeMemberText}>Change member</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.chooseMemberButton}
              onPress={() => setShowMemberPicker(true)}
              disabled={members.length === 0 || saving}
            >
              <Text style={styles.chooseMemberText}>
                {members.length === 0 ? 'No active members in this group' : 'Choose member'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Modal
        visible={showMemberPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMemberPicker(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose a member</Text>
            <TextInput
              style={styles.input}
              value={memberSearch}
              onChangeText={setMemberSearch}
              placeholder="Search name or member number"
              placeholderTextColor="#6b7280"
              autoCapitalize="none"
            />
            <ScrollView
              style={styles.memberPickerList}
              keyboardShouldPersistTaps="handled"
            >
              {filteredMembers.length === 0 ? (
                <Text style={styles.emptyText}>No matching active members.</Text>
              ) : filteredMembers.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={styles.pickerMemberOption}
                  onPress={() => selectMember(member)}
                >
                  <Text style={styles.optionText}>{member.member_number}</Text>
                  <Text style={styles.memberName}>{member.full_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.cancelPickerButton}
              onPress={() => setShowMemberPicker(false)}
            >
              <Text style={styles.cancelPickerText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {selectedMember && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            3. Repayment Details
          </Text>

          <Text style={styles.label}>
            Repayment Amount (UGX)
          </Text>

          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="Enter amount"
            keyboardType="numeric"
            editable={!saving}
          />

          <Text style={styles.label}>
            Reason / Note (Optional)
          </Text>

          <TextInput
            style={[
              styles.input,
              styles.multilineInput,
            ]}
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Weekly loan repayment"
            multiline
            editable={!saving}
          />

          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>
              Repayment Summary
            </Text>

            <Text style={styles.summaryText}>
              Group: KYA {selectedGroup?.group_number}
            </Text>

            <Text style={styles.summaryText}>
              Member: {selectedMember.full_name}
            </Text>

            <Text style={styles.summaryText}>
              Amount: UGX{' '}
              {Number(amount || 0).toLocaleString()}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              saving && styles.disabledButton,
            ]}
            onPress={handleRepayment}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>
                RECORD LOAN REPAYMENT
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },

  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#555555',
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#16a34a',
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 16,
    color: '#555555',
    marginBottom: 20,
  },

  section: {
    marginBottom: 24,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 12,
  },

  option: {
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#ffffff',
  },

  selectedOption: {
    borderColor: '#16a34a',
    backgroundColor: '#16a34a',
  },

  selectedMemberCard: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#f0fdf4',
  },

  selectedMemberNumber: {
    color: '#16a34a',
    fontSize: 15,
    fontWeight: '800',
  },

  selectedMemberName: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 5,
  },

  changeMemberButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#dcfce7',
  },

  changeMemberText: {
    color: '#166534',
    fontWeight: '700',
  },

  chooseMemberButton: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 10,
    padding: 16,
    backgroundColor: '#f0fdf4',
  },

  chooseMemberText: {
    color: '#166534',
    fontSize: 16,
    fontWeight: '700',
  },

  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  modalCard: {
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingBottom: 28,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#166534',
    marginBottom: 14,
  },

  memberPickerList: {
    maxHeight: 420,
  },

  pickerMemberOption: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 13,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },

  cancelPickerButton: {
    marginTop: 10,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },

  cancelPickerText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '700',
  },

  optionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#222222',
  },

  selectedOptionText: {
    color: '#ffffff',
  },

  groupName: {
    marginTop: 4,
    fontSize: 14,
    color: '#666666',
  },

  memberName: {
    marginTop: 4,
    fontSize: 14,
    color: '#666666',
  },

  emptyText: {
    fontSize: 15,
    color: '#777777',
    paddingVertical: 10,
  },

  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 7,
  },

  input: {
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#222222',
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },

  multilineInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },

  summary: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 18,
    backgroundColor: '#f0fdf4',
  },

  summaryTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 8,
  },

  summaryText: {
    fontSize: 15,
    color: '#333333',
    marginBottom: 4,
  },

  button: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },

  disabledButton: {
    opacity: 0.6,
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
