import React, { useEffect, useState } from 'react';
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
  getFinancialSummary,
  getMemberSavings,
  getMembersByGroupId,
  getVSLASetupRules,
  issueLoan,
} from '../database/database';

type Props = {
  route?: {
    params?: {
      groupId?: number;
      meetingId?: number | null;
    };
  };
};

type Member = {
  id: number;
  member_number: string;
  full_name: string;
  status: string;
};

export default function LoanDisbursementScreen({
  route,
}: Props) {
  const groupId = route?.params?.groupId;
  const meetingId = route?.params?.meetingId ?? null;

  const [loanFund, setLoanFund] = useState(0);
  const [loanMultiple, setLoanMultiple] = useState(3);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] =
    useState<number | null>(null);
  const [memberSavings, setMemberSavings] = useState(0);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState(
    'Loan issued to member',
  );
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedMember = members.find(
    (member) => member.id === selectedMemberId,
  );

  const maximumMemberLoan =
    memberSavings * loanMultiple;

  const loadData = async () => {
    if (!groupId) return;

    try {
      const summary =
        await getFinancialSummary(groupId);

      setLoanFund(summary.loanFund ?? 0);

      const rules =
        await getVSLASetupRules(groupId);

      if (rules) {
        setLoanMultiple(
          rules.maximum_loan_multiple,
        );
      }

      const groupMembers =
        await getMembersByGroupId(groupId);

      setMembers(
        groupMembers.filter(
          (member) => member.status === 'active',
        ),
      );
    } catch (error) {
      console.error(
        'Failed to load loan data:',
        error,
      );

      Alert.alert(
        'Error',
        'Unable to load loan data.',
      );
    }
  };

  useEffect(() => {
    loadData();
  }, [groupId]);

  const handleMemberSelect = async (
    memberId: number,
  ) => {
    if (!groupId || loading) return;

    try {
      setSelectedMemberId(memberId);

      const savings =
        await getMemberSavings(
          groupId,
          memberId,
        );

      setMemberSavings(savings);
      setAmount('');
    } catch (error) {
      console.error(
        'Failed to load member savings:',
        error,
      );

      setMemberSavings(0);

      Alert.alert(
        'Error',
        'Unable to load this member savings.',
      );
    }
  };

  const confirmDisbursement = async (
    loanAmount: number,
  ) => {
    if (
      !groupId ||
      selectedMemberId === null
    ) {
      return;
    }

    try {
      setLoading(true);

      await issueLoan(
        groupId,
        selectedMemberId,
        loanAmount,
        reason.trim() ||
          'Loan issued to member',
        meetingId,
      );

      Alert.alert(
        'Success',
        `Loan of UGX ${loanAmount.toLocaleString()} has been disbursed to ${selectedMember?.full_name}.`,
      );

      setAmount('');
      setReason(
        'Loan issued to member',
      );
      setSelectedMemberId(null);
      setMemberSavings(0);

      await loadData();
    } catch (error) {
      Alert.alert(
        'Loan Disbursement Failed',
        error instanceof Error
          ? error.message
          : 'Unable to disburse the loan.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDisbursement = () => {
    if (!groupId) {
      Alert.alert(
        'Error',
        'Group was not found.',
      );
      return;
    }

    if (selectedMemberId === null) {
      Alert.alert(
        'Select Member',
        'Please select a member.',
      );
      return;
    }

    if (memberSavings <= 0) {
      Alert.alert(
        'No Savings',
        'This member has no eligible savings for a loan.',
      );
      return;
    }

    const loanAmount = Number(
      amount.replace(/,/g, ''),
    );

    if (
      !Number.isFinite(loanAmount) ||
      loanAmount <= 0
    ) {
      Alert.alert(
        'Invalid Amount',
        'Enter a valid loan amount.',
      );
      return;
    }

    if (
      loanAmount > maximumMemberLoan
    ) {
      Alert.alert(
        'Loan Limit Exceeded',
        `This member can receive up to UGX ${maximumMemberLoan.toLocaleString()} based on the ${loanMultiple}× loan rule.`,
      );
      return;
    }

    if (loanAmount > loanFund) {
      Alert.alert(
        'Insufficient Loan Fund',
        `Available Loan Fund: UGX ${loanFund.toLocaleString()}`,
      );
      return;
    }

    Alert.alert(
      'Confirm Loan',
      `Member: ${selectedMember?.full_name}\n\nSavings: UGX ${memberSavings.toLocaleString()}\nMaximum loan: UGX ${maximumMemberLoan.toLocaleString()}\nLoan amount: UGX ${loanAmount.toLocaleString()}`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Confirm',
          onPress: () =>
            confirmDisbursement(
              loanAmount,
            ),
        },
      ],
    );
  };

  const filteredMembers =
    members.filter((member) => {
      const searchText =
        search.trim().toLowerCase();

      if (!searchText) return true;

      return (
        member.full_name
          .toLowerCase()
          .includes(searchText) ||
        member.member_number
          .toLowerCase()
          .includes(searchText)
      );
    });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>
          Loan Disbursement
        </Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>
            Available Loan Fund
          </Text>

          <Text style={styles.balance}>
            UGX {loanFund.toLocaleString()}
          </Text>

          <Text style={styles.ruleText}>
            Maximum loan rule: {loanMultiple}×
            member savings
          </Text>
        </View>

        <Text style={styles.sectionTitle}>
          Select Member
        </Text>

        <TextInput
          style={styles.input}
          value={search}
          onChangeText={setSearch}
          placeholder="Search member name or number"
          placeholderTextColor="#6b7280"
          editable={!loading}
        />

        {filteredMembers.length === 0 ? (
          <Text style={styles.emptyText}>
            No active members found.
          </Text>
        ) : (
          filteredMembers.map(
            (member) => (
              <TouchableOpacity
                key={member.id}
                style={[
                  styles.memberButton,
                  selectedMemberId ===
                    member.id &&
                    styles.selectedMember,
                ]}
                onPress={() =>
                  handleMemberSelect(
                    member.id,
                  )
                }
                disabled={loading}
              >
                <Text
                  style={
                    styles.memberNumber
                  }
                >
                  {member.member_number}
                </Text>

                <Text
                  style={styles.memberName}
                >
                  {member.full_name}
                </Text>
              </TouchableOpacity>
            ),
          )
        )}

        {selectedMember && (
          <View style={styles.memberInfo}>
            <Text style={styles.infoTitle}>
              Selected Member
            </Text>

            <Text style={styles.infoText}>
              {selectedMember.full_name}
            </Text>

            <Text style={styles.infoText}>
              {selectedMember.member_number}
            </Text>

            <Text style={styles.infoText}>
              Savings: UGX{' '}
              {memberSavings.toLocaleString()}
            </Text>

            <Text style={styles.maximumLoan}>
              Maximum Loan: UGX{' '}
              {maximumMemberLoan.toLocaleString()}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Loan Amount
        </Text>

        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={(text) =>
            setAmount(
              text.replace(
                /[^0-9.]/g,
                '',
              ),
            )
          }
          keyboardType="numeric"
          placeholder="Enter loan amount"
          placeholderTextColor="#6b7280"
          editable={!loading}
        />

        <Text style={styles.sectionTitle}>
          Reason
        </Text>

        <TextInput
          style={styles.input}
          value={reason}
          onChangeText={setReason}
          placeholder="Loan reason"
          placeholderTextColor="#6b7280"
          editable={!loading}
        />

        <TouchableOpacity
          style={[
            styles.disburseButton,
            (loading ||
              selectedMemberId ===
                null) &&
              styles.disabledButton,
          ]}
          onPress={handleDisbursement}
          disabled={
            loading ||
            selectedMemberId === null
          }
        >
          <Text style={styles.buttonText}>
            {loading
              ? 'Processing...'
              : 'Disburse Loan'}
          </Text>
        </TouchableOpacity>
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
    fontSize: 24,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 16,
  },

  balanceCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },

  balanceLabel: {
    fontSize: 14,
    color: '#374151',
  },

  balance: {
    fontSize: 26,
    fontWeight: '700',
    color: '#16a34a',
    marginTop: 4,
  },

  ruleText: {
    marginTop: 8,
    fontSize: 13,
    color: '#374151',
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#166534',
    marginTop: 12,
    marginBottom: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },

  memberButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },

  selectedMember: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },

  memberNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
  },

  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 3,
  },

  memberInfo: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
  },

  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 6,
  },

  infoText: {
    fontSize: 15,
    color: '#374151',
    marginBottom: 3,
  },

  maximumLoan: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16a34a',
    marginTop: 6,
  },

  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    padding: 20,
  },

  disburseButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },

  disabledButton: {
    opacity: 0.5,
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
