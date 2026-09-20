import React, { useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getFinancialSummary,
  getMembersByGroup,
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

export default function LoanDisbursementScreen({ route }: Props) {
  const groupId = route?.params?.groupId;
  const meetingId = route?.params?.meetingId ?? null;

  const [loanFund, setLoanFund] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Loan issued to member');
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!groupId) return;

    try {
      const summary = await getFinancialSummary(groupId);
      setLoanFund(summary.loanFund ?? 0);

      const groupMembers = await getMembersByGroup(groupId);

      setMembers(
        groupMembers.filter(
          (member: Member) => member.status === 'active',
        ),
      );
    } catch (error) {
      console.error('Failed to load loan data:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, [groupId]);

  const handleDisbursement = async () => {
    if (!groupId) {
      Alert.alert('Error', 'Group was not found.');
      return;
    }

    if (!selectedMemberId) {
      Alert.alert('Select Member', 'Please select a member.');
      return;
    }

    const loanAmount = Number(amount);

    if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a valid loan amount.');
      return;
    }

    if (loanAmount > loanFund) {
      Alert.alert(
        'Insufficient Loan Fund',
        `Available Loan Fund: UGX ${loanFund.toLocaleString()}`,
      );
      return;
    }

    try {
      setLoading(true);

      await issueLoan(
        groupId,
        selectedMemberId,
        loanAmount,
        reason.trim() || 'Loan issued to member',
        meetingId,
      );

      Alert.alert(
        'Success',
        `Loan of UGX ${loanAmount.toLocaleString()} has been disbursed.`,
      );

      setAmount('');
      setReason('Loan issued to member');
      setSelectedMemberId(null);

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Loan Disbursement</Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Loan Fund</Text>
          <Text style={styles.balance}>
            UGX {loanFund.toLocaleString()}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Select Member</Text>

        {members.map((member) => (
          <TouchableOpacity
            key={member.id}
            style={[
              styles.memberButton,
              selectedMemberId === member.id &&
                styles.selectedMember,
            ]}
            onPress={() => setSelectedMemberId(member.id)}
          >
            <Text style={styles.memberNumber}>
              {member.member_number}
            </Text>
            <Text style={styles.memberName}>
              {member.full_name}
            </Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionTitle}>Loan Amount</Text>

        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="Enter loan amount"
          placeholderTextColor="#6b7280"
        />

        <Text style={styles.sectionTitle}>Reason</Text>

        <TextInput
          style={styles.input}
          value={reason}
          onChangeText={setReason}
          placeholder="Loan reason"
          placeholderTextColor="#6b7280"
        />

        <TouchableOpacity
          style={[
            styles.disburseButton,
            loading && styles.disabledButton,
          ]}
          onPress={handleDisbursement}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Processing...' : 'Disburse Loan'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#16a34a',
    textAlign: 'center',
    marginBottom: 20,
  },
  balanceCard: {
    padding: 18,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    marginBottom: 20,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 15,
    color: '#374151',
  },
  balance: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: '700',
    color: '#16a34a',
  },
  sectionTitle: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  memberButton: {
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
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
    marginTop: 3,
    fontSize: 15,
    color: '#111827',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  disburseButton: {
    marginTop: 24,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
