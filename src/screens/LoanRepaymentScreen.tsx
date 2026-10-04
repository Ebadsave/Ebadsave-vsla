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
  getMembersByGroupId,
  recordLoanRepayment,
  getMemberLoanBalance,
} from '../database/database';

type Props = {
  route?: {
    params?: {
      groupId?: number;
      meetingId?: number | null;
      currency?: string;
    };
  };
};

type Member = {
  id: number;
  member_number: string;
  full_name: string;
  status: string;
};

const formatCurrency = (
  amount: number,
  currency = 'UGX',
) => `${currency} ${Math.round(amount).toLocaleString()}`;

export default function LoanRepaymentScreen({
  route,
}: Props) {
  const groupId = route?.params?.groupId;
  const meetingId = route?.params?.meetingId ?? null;

  /*
   * UGX is only the default currency.
   * Another country/group currency can be passed
   * through route.params.currency.
   */
  const currency = route?.params?.currency || 'UGX';

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] =
    useState<number | null>(null);

  const [loanBalance, setLoanBalance] = useState(0);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Loan repayment');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedMember = members.find(
    (member) => member.id === selectedMemberId,
  );

  /*
   * Load all active members belonging to this group.
   */
  const loadMembers = async () => {
    if (!groupId) return;

    try {
      const groupMembers =
        await getMembersByGroupId(groupId);

      setMembers(
        groupMembers.filter(
          (member) => member.status === 'active',
        ),
      );
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

  /*
   * Load the REAL outstanding loan balance
   * from database.ts.
   *
   * This means the screen does not keep its own
   * separate loan balance.
   */
  const loadLoanBalance = async (
    memberId: number,
  ) => {
    if (!groupId) return;

    try {
      const result = await getMemberLoanBalance(
        groupId,
        memberId,
      );

      setLoanBalance(
        Number(result?.balance ?? 0),
      );
    } catch (error) {
      console.error(
        'Failed to load loan balance:',
        error,
      );

      setLoanBalance(0);

      Alert.alert(
        'Error',
        'Unable to load loan balance.',
      );
    }
  };

  useEffect(() => {
    loadMembers();
  }, [groupId]);

  /*
   * Select a member and immediately load
   * that member's current outstanding loan.
   */
  const handleMemberSelect = async (
    memberId: number,
  ) => {
    if (loading) return;

    setSelectedMemberId(memberId);
    setAmount('');
    setLoanBalance(0);

    await loadLoanBalance(memberId);
  };

  /*
   * Validate and prepare repayment.
   */
  const handleRepayment = () => {
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

    if (loanBalance <= 0) {
      Alert.alert(
        'No Outstanding Loan',
        'This member has no outstanding loan balance.',
      );
      return;
    }

    const repaymentAmount = Number(
      amount.replace(/,/g, ''),
    );

    if (
      !Number.isFinite(repaymentAmount) ||
      repaymentAmount <= 0
    ) {
      Alert.alert(
        'Invalid Amount',
        'Enter a valid repayment amount.',
      );
      return;
    }

    /*
     * Prevent repayment from being greater
     * than the actual outstanding balance.
     */
    if (repaymentAmount > loanBalance) {
      Alert.alert(
        'Loan Payment Too High',
        `The member's current loan balance is ${formatCurrency(
          loanBalance,
          currency,
        )}.`,
      );
      return;
    }

    const remainingBalance =
      loanBalance - repaymentAmount;

    Alert.alert(
      'Confirm Repayment',
      `Member: ${selectedMember?.full_name}\n\n` +
        `Outstanding loan: ${formatCurrency(
          loanBalance,
          currency,
        )}\n` +
        `Repayment: ${formatCurrency(
          repaymentAmount,
          currency,
        )}\n` +
        `Remaining balance: ${formatCurrency(
          remainingBalance,
          currency,
        )}`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Confirm',
          onPress: () =>
            confirmRepayment(
              repaymentAmount,
            ),
        },
      ],
    );
  };

  /*
   * Save repayment to database.
   */
  const confirmRepayment = async (
    repaymentAmount: number,
  ) => {
    if (
      !groupId ||
      selectedMemberId === null
    ) {
      return;
    }

    try {
      setLoading(true);

      await recordLoanRepayment(
        groupId,
        selectedMemberId,
        repaymentAmount,
        meetingId,
        reason.trim() || 'Loan repayment',
      );

      /*
       * Reload the balance directly from
       * the database after saving.
       */
      await loadLoanBalance(
        selectedMemberId,
      );

      /*
       * Calculate the expected remaining balance
       * for the success message.
       */
      const remaining =
        Math.max(
          0,
          loanBalance - repaymentAmount,
        );

      Alert.alert(
        'Success',
        `Repayment of ${formatCurrency(
          repaymentAmount,
          currency,
        )} recorded.\n\n` +
          `Remaining loan balance: ${formatCurrency(
            remaining,
            currency,
          )}`,
      );

      setAmount('');
      setReason('Loan repayment');
    } catch (error) {
      Alert.alert(
        'Repayment Failed',
        error instanceof Error
          ? error.message
          : 'Unable to record repayment.',
      );
    } finally {
      setLoading(false);
    }
  };

  /*
   * Search members by name or member number.
   */
  const filteredMembers = members.filter(
    (member) => {
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
    },
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>
          Loan Repayment
        </Text>

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
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>
              Outstanding Loan
            </Text>

            <Text style={styles.balance}>
              {formatCurrency(
                loanBalance,
                currency,
              )}
            </Text>

            <Text style={styles.memberText}>
              {selectedMember.member_number}
            </Text>

            <Text style={styles.memberText}>
              {selectedMember.full_name}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Repayment Amount
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
          placeholder="Enter repayment amount"
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
          placeholder="Repayment reason"
          placeholderTextColor="#6b7280"
          editable={!loading}
        />

        <TouchableOpacity
          style={[
            styles.repayButton,
            (loading ||
              selectedMemberId ===
                null) &&
              styles.disabledButton,
          ]}
          onPress={handleRepayment}
          disabled={
            loading ||
            selectedMemberId === null
          }
        >
          <Text style={styles.buttonText}>
            {loading
              ? 'Processing...'
              : 'Record Repayment'}
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

  balanceCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
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
    marginBottom: 8,
  },

  memberText: {
    fontSize: 14,
    color: '#374151',
    marginTop: 2,
  },

  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    padding: 20,
  },

  repayButton: {
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
