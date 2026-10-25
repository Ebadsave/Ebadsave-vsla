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
  getMemberLoanDueDate,
  getMemberLoanIssueDate,
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

const localDateString = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const displayDate = (value: string): string => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', year: 'numeric',
  });
};

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
  const [loanDueDate, setLoanDueDate] = useState<string | null>(null);
  const [loanIssueDate, setLoanIssueDate] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Loan repayment');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedMember = members.find(
    (member) => member.id === selectedMemberId,
  );
  const isLoanOverdue = loanBalance > 0 && Boolean(loanDueDate && loanDueDate < localDateString());
  const loanStatus = loadingBalance ? 'LOADING' : loanBalance <= 0 ? 'PAID' : isLoanOverdue ? 'OVERDUE' : 'ACTIVE';

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
          (member) => String(member.status ?? '').toLowerCase() === 'active',
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
  ): Promise<number> => {
    if (!groupId) {
      throw new Error('Group was not found.');
    }

    const [result, dueDate, issueDate] = await Promise.all([
      getMemberLoanBalance(groupId, memberId),
      getMemberLoanDueDate(groupId, memberId),
      getMemberLoanIssueDate(groupId, memberId),
    ]);
    const balance = Math.max(0, Number(result?.balance ?? 0));
    setLoanBalance(balance);
    setLoanDueDate(dueDate);
    setLoanIssueDate(issueDate);
    return balance;
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
    if (loading || loadingBalance) return;

    setSelectedMemberId(memberId);
    setAmount('');
    setLoanBalance(0);
    setLoanDueDate(null);
    setLoanIssueDate(null);
    setLoadingBalance(true);

    try {
      await loadLoanBalance(memberId);
    } catch (error) {
      setLoanBalance(0);
      setLoanDueDate(null);
      setLoanIssueDate(null);
      Alert.alert(
        'Loan Balance',
        error instanceof Error ? error.message : 'Unable to load this member’s loan balance.',
      );
    } finally {
      setLoadingBalance(false);
    }
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

    if (loadingBalance) {
      Alert.alert('Please Wait', 'The member’s current loan balance is still loading.');
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
    const memberId = selectedMemberId;
    if (!groupId || memberId === null) return;

    try {
      setLoading(true);

      // Refresh before writing so an outdated screen balance cannot authorize
      // a payment that exceeds the current amount due.
      const [currentBalance, latestDueDate, latestIssueDate] = await Promise.all([
        getMemberLoanBalance(groupId, memberId),
        getMemberLoanDueDate(groupId, memberId),
        getMemberLoanIssueDate(groupId, memberId),
      ]);
      const latestDue = Math.max(0, Number(currentBalance?.balance ?? 0));
      setLoanDueDate(latestDueDate);
      setLoanIssueDate(latestIssueDate);

      if (latestDue <= 0) {
        setLoanBalance(0);
        Alert.alert('No Outstanding Loan', 'This member has no outstanding loan balance.');
        return;
      }

      if (repaymentAmount > latestDue) {
        setLoanBalance(latestDue);
        Alert.alert(
          'Amount Due Changed',
          `The current amount due is ${formatCurrency(latestDue, currency)}. Please enter an amount no greater than this and try again.`,
        );
        return;
      }

      await recordLoanRepayment(
        groupId,
        memberId,
        repaymentAmount,
        meetingId,
        reason.trim() || 'Loan repayment',
      );

      // Use the database result after recording, rather than calculating
      // from a potentially stale React state value.
      const [updatedBalance, updatedDueDate, updatedIssueDate] = await Promise.all([
        getMemberLoanBalance(groupId, memberId),
        getMemberLoanDueDate(groupId, memberId),
        getMemberLoanIssueDate(groupId, memberId),
      ]);
      const remaining = Math.max(0, Number(updatedBalance?.balance ?? 0));
      setLoanBalance(remaining);
      setLoanDueDate(updatedDueDate);
      setLoanIssueDate(updatedIssueDate);

      Alert.alert(
        'Success',
        `Amount Paid: ${formatCurrency(repaymentAmount, currency)}\n\n` +
          `Amount Due: ${formatCurrency(remaining, currency)}`,
      );

      setAmount('');
      setReason('Loan repayment');
    } catch (error) {
      Alert.alert(
        'Repayment Failed',
        error instanceof Error ? error.message : 'Unable to record repayment.',
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
                disabled={loading || loadingBalance}
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
              Amount Due
            </Text>

            <Text style={styles.balance}>
              {loadingBalance ? 'Loading…' : formatCurrency(loanBalance, currency)}
            </Text>

            <Text style={styles.memberText}>
              {selectedMember.member_number}
            </Text>

            <Text style={styles.memberText}>
              {selectedMember.full_name}
            </Text>
            {loanIssueDate && (
              <Text style={styles.memberText}>
                Loan issued: {displayDate(loanIssueDate)}
              </Text>
            )}
            {loanDueDate && (
              <Text style={[styles.memberText, isLoanOverdue && styles.overdueText]}>
                Final repayment due: {displayDate(loanDueDate)}
              </Text>
            )}
            <View style={[styles.statusBadge, loanStatus === 'OVERDUE' ? styles.statusOverdue : loanStatus === 'PAID' ? styles.statusPaid : styles.statusActive]}>
              <Text style={[styles.statusText, loanStatus === 'OVERDUE' ? styles.statusTextOverdue : styles.statusTextNormal]}>
                {loanStatus}
              </Text>
            </View>
            {isLoanOverdue && loanDueDate && (
              <View style={styles.overdueNotice} accessibilityRole="alert">
                <Text style={styles.overdueTitle}>OVERDUE</Text>
                <Text style={styles.overdueBody}>
                  The final repayment date was {displayDate(loanDueDate)}. Repayments are still accepted; this warning does not block payment.
                </Text>
              </View>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>
          Amount Paid
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
          placeholder="Enter amount paid"
          placeholderTextColor="#6b7280"
          editable={!loading && !loadingBalance && selectedMemberId !== null && loanBalance > 0}
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
              loadingBalance ||
              selectedMemberId === null ||
              loanBalance <= 0) &&
              styles.disabledButton,
          ]}
          onPress={handleRepayment}
          disabled={
            loading ||
            loadingBalance ||
            selectedMemberId === null ||
            loanBalance <= 0
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

  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 9,
  },
  statusOverdue: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca' },
  statusActive: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#bbf7d0' },
  statusPaid: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#bbf7d0' },
  statusText: { fontSize: 12, fontWeight: '800' },
  statusTextOverdue: { color: '#b91c1c' },
  statusTextNormal: { color: '#166534' },
  overdueText: {
    color: '#b91c1c',
    fontWeight: '800',
  },

  overdueNotice: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },

  overdueTitle: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 3,
  },

  overdueBody: {
    color: '#991b1b',
    fontSize: 12,
    lineHeight: 17,
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
