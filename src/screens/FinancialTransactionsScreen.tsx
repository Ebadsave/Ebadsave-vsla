import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../../App';

import {
  getMemberFines,
  getMemberSavings,
  getFinancialTransactions,
  getUndoableMeetingTransactions,
  reverseFinancialTransaction,
  getMemberLoanBalance,
  getMembersByGroupId,
  getOpenMeeting,
  getVSLASetupRules,
  recordFine,
  recordFinePayment,
  recordInsuranceContribution,
  recordLoanRepayment,
  recordSavings,
  recordSocialFund,
  type MemberFineRecord,
  type VSLASetupRuleRecord,
} from '../database/database';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface RouteParams {
  groupId?: number;
  meetingId?: number | null;
  executiveMemberId?: number;
  currency?: string;
}

interface MemberItem {
  id: number;
  member_number: string;
  full_name: string;
  status: string;
  role?: string | null;
}

function parseAmount(value: string): number {
  const cleaned = value.replace(/,/g, '').trim();

  if (!cleaned) {
    return 0;
  }

  const amount = Number(cleaned);

  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number): string {
  return Number(value || 0).toLocaleString();
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

export default function FinancialTransactionsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();

  const params = (route.params ?? {}) as RouteParams;

  const groupId = Number(params.groupId ?? 0);

  const suppliedMeetingId =
    params.meetingId === undefined || params.meetingId === null
      ? null
      : Number(params.meetingId);

  const currency = params.currency?.trim() || 'UGX';
  const executiveMemberId = params.executiveMemberId == null ? undefined : Number(params.executiveMemberId);

  const [meetingId, setMeetingId] = useState<number | null>(
    suppliedMeetingId,
  );

  const [members, setMembers] = useState<MemberItem[]>([]);
  const [selectedMemberId, setSelectedMemberId] =
    useState<number | null>(null);

  const [setupRules, setSetupRules] =
    useState<VSLASetupRuleRecord | null>(null);

  const [loanBalance, setLoanBalance] = useState(0);
  const [memberFines, setMemberFines] = useState<MemberFineRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [endingMeeting, setEndingMeeting] = useState(false);
  const [memberSavings, setMemberSavings] = useState<Record<number, { total: number; today: number }>>({});
  const [meetingTransactions, setMeetingTransactions] = useState<any[]>([]);

  const [showMembers, setShowMembers] = useState(false);
  const [showFineTypes, setShowFineTypes] = useState(false);

  const [shares, setShares] = useState('');
  const [loanRepayment, setLoanRepayment] = useState('');
  const [socialFund, setSocialFund] = useState('');
  const [insurance, setInsurance] = useState('');
  const [finePayment, setFinePayment] = useState('');

  const [newFineAmount, setNewFineAmount] = useState('');

  const [fineType, setFineType] = useState('Absence fine');
  const [recordingFine, setRecordingFine] = useState(false);

  const fineTypes = useMemo(
    () => [
      'Absence fine',
      'Late fine',
      'Non-saving fine',
      'Non-loan repayment fine',
      'Non-insurance contribution fine',
    ],
    [],
  );

  const selectedMember = useMemo(
    () =>
      members.find(
        (member) => member.id === selectedMemberId,
      ) ?? null,
    [members, selectedMemberId],
  );

  const shareValue = Number(
    setupRules?.share_value ?? 0,
  );

  const minimumShares = Number(
    setupRules?.minimum_shares_per_meeting ?? 0,
  );

  const maximumShares = Number(
    setupRules?.maximum_shares_per_meeting ?? 0,
  );

  const shareCount = Math.max(
    0,
    parseAmount(shares),
  );

  const savingsAmount =
    shareCount * shareValue;

  const loanAmount = Math.max(
    0,
    parseAmount(loanRepayment),
  );

  const socialAmount = Math.max(
    0,
    parseAmount(socialFund),
  );

  const insuranceAmount = Math.max(
    0,
    parseAmount(insurance),
  );

  const finePaymentAmount = Math.max(
    0,
    parseAmount(finePayment),
  );

  const outstandingFineTotal =
    memberFines.reduce(
      (total, fine) =>
        total + Number(fine.outstanding_amount || 0),
      0,
    );

  const totalPayment =
    savingsAmount +
    loanAmount +
    socialAmount +
    insuranceAmount +
    finePaymentAmount;

  const getSetupFineAmount = useCallback(
    (type: string): number => {
      if (!setupRules) {
        return 0;
      }

      switch (type) {
        case 'Absence fine':
          return Number(setupRules.absence_fine) || 0;

        case 'Late fine':
          return Number(setupRules.late_fine) || 0;

        case 'Non-saving fine':
          return (
            Number(setupRules.non_saving_fine) || 0
          );

        case 'Non-loan repayment fine':
          return (
            Number(
              setupRules.non_loan_repayment_fine,
            ) || 0
          );

        case 'Non-insurance contribution fine':
          return (
            Number(
              setupRules.non_insurance_contribution,
            ) || 0
          );

        default:
          return 0;
      }
    },
    [setupRules],
  );

  useEffect(() => {
    const amount = getSetupFineAmount(fineType);

    setNewFineAmount(
      amount > 0 ? String(amount) : '',
    );
  }, [fineType, getSetupFineAmount]);

  const loadMemberFinancialData = useCallback(
    async (memberId: number) => {
      const [loan, fines] = await Promise.all([
        getMemberLoanBalance(
          groupId,
          memberId,
        ),
        getMemberFines(
          groupId,
          memberId,
        ),
      ]);

      setLoanBalance(
        Number(loan.balance) || 0,
      );

      setMemberFines(fines);
    },
    [groupId],
  );

  const loadData = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let activeMeetingId =
        suppliedMeetingId;

      if (activeMeetingId === null) {
        const openMeeting =
          await getOpenMeeting(groupId);

        activeMeetingId =
          openMeeting?.id ?? null;
      }

      if (activeMeetingId === null) {
        throw new Error(
          'No open meeting is available. Start the meeting first.',
        );
      }

      const [
        memberRows,
        rules,
      ] = await Promise.all([
        getMembersByGroupId(groupId),
        getVSLASetupRules(groupId),
      ]);

      const activeMembers =
        (memberRows as MemberItem[])
          .filter(
            (member) =>
              member.status
                ?.toLowerCase() ===
              'active',
          )
          .sort((a, b) =>
            a.full_name.localeCompare(
              b.full_name,
              undefined,
              {
                sensitivity: 'base',
              },
            ),
          );

      const [savingsRows, allTransactions, undoableTransactions] = await Promise.all([
        Promise.all(activeMembers.map(async (member) => [member.id, await getMemberSavings(groupId, member.id)] as const)),
        getFinancialTransactions(groupId),
        getUndoableMeetingTransactions(activeMeetingId),
      ]);
      const today = new Date();
      const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const savingsByMember: Record<number, { total: number; today: number }> = {};
      for (const [memberId, total] of savingsRows) {
        savingsByMember[memberId] = { total: Number(total) || 0, today: 0 };
      }
      for (const transaction of allTransactions as any[]) {
        if (
          Number(transaction.meeting_id) === Number(activeMeetingId) &&
          transaction.account_type === 'savings' &&
          transaction.transaction_type === 'savings_contribution' &&
          Number(transaction.reversed || 0) === 0 &&
          transaction.member_id != null &&
          typeof transaction.created_at === 'string' &&
          new Date(transaction.created_at).toDateString() === today.toDateString()
        ) {
          const id = Number(transaction.member_id);
          if (savingsByMember[id]) savingsByMember[id].today += Number(transaction.amount) || 0;
        }
      }
      setMemberSavings(savingsByMember);
      setMeetingTransactions(undoableTransactions as any[]);
      setMeetingId(activeMeetingId);
      setMembers(activeMembers);
      setSetupRules(rules);

      const currentId =
        selectedMemberId !== null &&
        activeMembers.some(
          (member) =>
            member.id === selectedMemberId,
        )
          ? selectedMemberId
          : activeMembers[0]?.id ?? null;

      setSelectedMemberId(currentId);

      if (currentId !== null) {
        await loadMemberFinancialData(
          currentId,
        );
      } else {
        setLoanBalance(0);
        setMemberFines([]);
      }
    } catch (error) {
      Alert.alert(
        'Financial Transactions',
        error instanceof Error
          ? error.message
          : 'Unable to load financial transactions.',
      );
    } finally {
      setLoading(false);
    }
  }, [
    groupId,
    loadMemberFinancialData,
    selectedMemberId,
    suppliedMeetingId,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectMember = async (
    memberId: number,
  ) => {
    setSelectedMemberId(memberId);
    setShowMembers(false);

    setShares('');
    setLoanRepayment('');
    setSocialFund('');
    setInsurance('');
    setFinePayment('');

    if (meetingId) {
      try {
        await loadMemberFinancialData(
          memberId,
        );
      } catch (error) {
        Alert.alert(
          'Member details',
          error instanceof Error
            ? error.message
            : 'Unable to load member financial details.',
        );
      }
    }
  };

  const validateShares = (): boolean => {
    if (shareCount <= 0) {
      return true;
    }

    if (shareValue <= 0) {
      Alert.alert(
        'Share value missing',
        'The group share value has not been configured.',
      );

      return false;
    }

    if (
      shareCount < minimumShares
    ) {
      Alert.alert(
        'Savings below minimum',
        `This meeting requires at least ${formatMoney(
          minimumShares,
        )} share(s).`,
      );

      return false;
    }

    if (
      maximumShares > 0 &&
      shareCount > maximumShares
    ) {
      Alert.alert(
        'Savings above maximum',
        `This meeting allows a maximum of ${formatMoney(
          maximumShares,
        )} share(s).`,
      );

      return false;
    }

    return true;
  };

  const submitFinancialTransaction =
    async () => {
      if (!meetingId) {
        Alert.alert(
          'Meeting not started',
          'Start the meeting before recording payments.',
        );

        return;
      }

      if (!selectedMemberId) {
        Alert.alert(
          'Member required',
          'Select the member making this payment.',
        );

        return;
      }

      if (!validateShares()) {
        return;
      }

      if (
        loanAmount > loanBalance
      ) {
        Alert.alert(
          'Loan repayment too high',
          `The member's outstanding loan balance is ${currency} ${formatMoney(
            loanBalance,
          )}.`,
        );

        return;
      }

      if (
        finePaymentAmount >
        outstandingFineTotal
      ) {
        Alert.alert(
          'Fine payment too high',
          `The member's outstanding fines total is ${currency} ${formatMoney(
            outstandingFineTotal,
          )}.`,
        );

        return;
      }

      if (totalPayment <= 0) {
        Alert.alert(
          'Payment required',
          'Enter at least one financial payment for this member.',
        );

        return;
      }

      setSaving(true);

      const errors: string[] = [];
      const successfulPayments: string[] =
        [];

      if (savingsAmount > 0) {
        try {
          await recordSavings(
            groupId,
            selectedMemberId,
            savingsAmount,
            meetingId,
          );

          successfulPayments.push(
            'Savings',
          );

          setShares('');
        } catch (error) {
          errors.push(
            `Savings: ${
              error instanceof Error
                ? error.message
                : 'failed'
            }`,
          );
        }
      }

      if (loanAmount > 0) {
        try {
          await recordLoanRepayment(
            groupId,
            selectedMemberId,
            loanAmount,
            meetingId,
            'Loan repayment',
          );

          successfulPayments.push(
            'Loan repayment',
          );

          setLoanRepayment('');
        } catch (error) {
          errors.push(
            `Loan repayment: ${
              error instanceof Error
                ? error.message
                : 'failed'
            }`,
          );
        }
      }

      if (socialAmount > 0) {
        try {
          await recordSocialFund(
            groupId,
            socialAmount,
            meetingId,
            selectedMemberId,
            'Social fund contribution',
          );

          successfulPayments.push(
            'Social Fund',
          );

          setSocialFund('');
        } catch (error) {
          errors.push(
            `Social Fund: ${
              error instanceof Error
                ? error.message
                : 'failed'
            }`,
          );
        }
      }

      if (insuranceAmount > 0) {
        try {
          await recordInsuranceContribution(
            groupId,
            selectedMemberId,
            insuranceAmount,
            meetingId,
          );

          successfulPayments.push(
            'Insurance',
          );

          setInsurance('');
        } catch (error) {
          errors.push(
            `Insurance: ${
              error instanceof Error
                ? error.message
                : 'failed'
            }`,
          );
        }
      }

      if (finePaymentAmount > 0) {
        try {
          await recordFinePayment(
            groupId,
            selectedMemberId,
            finePaymentAmount,
            meetingId,
          );

          successfulPayments.push(
            'Fine payment',
          );

          setFinePayment('');
        } catch (error) {
          errors.push(
            `Fine payment: ${
              error instanceof Error
                ? error.message
                : 'failed'
            }`,
          );
        }
      }

      try {
        await loadData();
      } catch {
        // Keep the saved transaction even if refreshing the screen fails.
      }

      setSaving(false);

      if (errors.length > 0) {
        Alert.alert(
          'Some payments failed',
          [
            successfulPayments.length > 0
              ? `Saved: ${successfulPayments.join(
                  ', ',
                )}`
              : '',
            `Failed:\n${errors.join('\n')}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        );

        return;
      }

      Alert.alert(
        'Transaction recorded',
        `${
          selectedMember?.full_name ??
          'Member'
        } payment was saved successfully.`,
      );
    };

  const recordNewFine = async () => {
    if (!meetingId) {
      Alert.alert(
        'Meeting not started',
        'Start the meeting before recording a fine.',
      );

      return;
    }

    if (!selectedMemberId) {
      Alert.alert(
        'Member required',
        'Select a member before recording a fine.',
      );

      return;
    }

    const amount =
      getSetupFineAmount(fineType);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      Alert.alert(
        'Fine not configured',
        'This fine does not have a valid amount in Setup Rules.',
      );

      return;
    }

    setRecordingFine(true);

    try {
      await recordFine(
        groupId,
        amount,
        fineType,
        selectedMemberId,
        meetingId,
      );

      await loadMemberFinancialData(
        selectedMemberId,
      );

      Alert.alert(
        'Fine recorded',
        `${fineType}: ${currency} ${formatMoney(
          amount,
        )}`,
      );
    } catch (error) {
      Alert.alert(
        'Fine failed',
        error instanceof Error
          ? error.message
          : 'Unable to record the fine.',
      );
    } finally {
      setRecordingFine(false);
    }
  };

  const goToNextMember = () => {
    if (
      !selectedMemberId ||
      members.length === 0
    ) {
      return;
    }

    const currentIndex =
      members.findIndex(
        (member) =>
          member.id ===
          selectedMemberId,
      );

    if (
      currentIndex < 0 ||
      currentIndex >=
        members.length - 1
    ) {
      Alert.alert(
        'End of member list',
        'This is the last member in A–Z order.',
      );

      return;
    }

    void selectMember(
      members[currentIndex + 1].id,
    );
  };

  const handleNextScreen = () => {
    if (!meetingId) {
      Alert.alert(
        'Meeting not available',
        'There is no open meeting to continue.',
      );

      return;
    }

    navigation.navigate(
      'Expenditure',
      {
        groupId,
        meetingId,
      },
    );
  };

  const handleBack = () => {
    if (saving || endingMeeting) {
      return;
    }

    navigation.goBack();
  };

  const handleEndMeeting = () => {
    if (!meetingId) {
      Alert.alert('Meeting not available', 'There is no open meeting to close.');
      return;
    }
    const executive = members.find((member) => member.status?.toLowerCase() === 'active' && member.role?.toLowerCase() === 'executive');
    if (!executive) {
      Alert.alert('Executive Required', 'An active executive member is required to close the meeting.');
      return;
    }
    navigation.navigate('CloseMeeting', { groupId, executiveMemberId: executive.id, meetingId });
  };

  const handleUndoTransaction = (transaction: any) => {
    Alert.alert(
      'Undo transaction?',
      `Reverse ${transaction.transaction_type.replace(/_/g, ' ')} of ${currency} ${formatMoney(Math.abs(Number(transaction.amount) || 0))}? The original record will remain in the audit history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: async () => {
            try {
              await reverseFinancialTransaction(
                Number(transaction.id),
                'Transaction reversed by group executive through Financial Transactions',
                null,
              );
              await loadData();
              Alert.alert('Transaction reversed', 'The transaction was reversed and the balances were refreshed.');
            } catch (error) {
              Alert.alert('Unable to undo', error instanceof Error ? error.message : 'The transaction could not be reversed.');
            }
          },
        },
      ],
    );
  };

  if (!groupId) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            Group information is missing.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View style={styles.centered}>
          <ActivityIndicator
            size="large"
            color="#16a34a"
          />

          <Text style={styles.loadingText}>
            Loading financial transactions...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!meetingId) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View style={styles.centered}>
          <Text style={styles.title}>
            Financial Transactions
          </Text>

          <Text style={styles.emptyText}>
            Start a meeting before recording payments.
          </Text>

          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
          >
            <Text
              style={styles.backButtonText}
            >
              Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentIndex =
    selectedMemberId === null
      ? -1
      : members.findIndex(
          (member) =>
            member.id ===
            selectedMemberId,
        );

  const hasNextMember =
    currentIndex >= 0 &&
    currentIndex <
      members.length - 1;

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <ScrollView
        contentContainerStyle={
          styles.container
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            Financial Transactions
          </Text>

          <Text
            style={styles.headerSubtitle}
          >
            Meeting #{meetingId}
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.loanDisbursementLink}
            onPress={() =>
              navigation.navigate('LoanDisbursement', {
                groupId,
                meetingId,
                executiveMemberId,
                currency,
              })
            }
            disabled={saving || endingMeeting}
          >
            <Text style={styles.loanDisbursementLinkText}>
              Issue a New Loan
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.memberSavingsCard}>
          <Text style={styles.sectionTitle}>Member Savings</Text>
          {members.map((member) => (
            <View key={member.id} style={styles.memberSavingsRow}>
              <View style={styles.memberSavingsIdentity}>
                <Text style={styles.memberSavingsName}>{member.full_name}</Text>
                <Text style={styles.memberSavingsNumber}>Member {member.member_number}</Text>
              </View>
              <View style={styles.memberSavingsAmounts}>
                <Text style={styles.memberSavingsTotal}>{currency} {formatMoney(memberSavings[member.id]?.total ?? 0)}</Text>
                <Text style={styles.memberSavingsToday}>{currency} {formatMoney(memberSavings[member.id]?.today ?? 0)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.memberSavingsCard}>
          <Text style={styles.sectionTitle}>Transactions This Meeting</Text>
          {meetingTransactions.length === 0 ? (
            <Text style={styles.emptyText}>No transactions available to undo.</Text>
          ) : meetingTransactions.map((transaction) => {
            const member = members.find((item) => item.id === Number(transaction.member_id));
            return (
              <View key={transaction.id} style={styles.transactionUndoRow}>
                <View style={styles.transactionUndoDetails}>
                  <Text style={styles.memberSavingsName}>{member?.full_name ?? 'Group transaction'}</Text>
                  <Text style={styles.memberSavingsNumber}>{String(transaction.transaction_type).replace(/_/g, ' ')}</Text>
                  <Text style={styles.transactionAmount}>{currency} {formatMoney(Math.abs(Number(transaction.amount) || 0))}</Text>
                </View>
                <TouchableOpacity style={styles.undoButton} onPress={() => handleUndoTransaction(transaction)} disabled={saving || endingMeeting}>
                  <Text style={styles.undoButtonText}>Undo</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* MEMBER */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Member
          </Text>

          <TouchableOpacity
            style={styles.selector}
            onPress={() =>
              setShowMembers(
                (value) => !value,
              )
            }
          >
            <Text
              style={
                selectedMember
                  ? styles.selectorText
                  : styles.placeholderText
              }
            >
              {selectedMember
                ? `${selectedMember.member_number} — ${selectedMember.full_name}`
                : 'Select member'}
            </Text>

            <Text
              style={styles.arrow}
            >
              {showMembers
                ? '▲'
                : '▼'}
            </Text>
          </TouchableOpacity>

          {showMembers && (
            <View
              style={
                styles.optionsBox
              }
            >
              {members.map(
                (member) => (
                  <TouchableOpacity
                    key={member.id}
                    style={
                      styles.option
                    }
                    onPress={() =>
                      void selectMember(
                        member.id,
                      )
                    }
                  >
                    <Text
                      style={
                        styles.optionText
                      }
                    >
                      {
                        member.member_number
                      }{' '}
                      —{' '}
                      {
                        member.full_name
                      }
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>
          )}

          {selectedMember && (
            <View style={styles.memberSummary}>
              <Text style={styles.memberName}>
                {selectedMember.full_name}
              </Text>

              <Text style={styles.memberNumber}>
                Member #{selectedMember.member_number}
              </Text>
            </View>
          )}
        </View>

        {/* CURRENT LOAN BALANCE */}
        {selectedMember && (
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>
              Outstanding Loan Balance
            </Text>

            <Text style={styles.balanceAmount}>
              {currency} {formatMoney(loanBalance)}
            </Text>
          </View>
        )}

        {/* SAVINGS */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Savings
          </Text>

          <Text style={styles.fieldLabel}>
            Number of shares
          </Text>

          <TextInput
            style={styles.input}
            value={shares}
            onChangeText={setShares}
            placeholder="Enter number of shares"
            placeholderTextColor="#888"
            keyboardType="numeric"
            editable={!saving}
          />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              Share value
            </Text>

            <Text style={styles.infoValue}>
              {currency} {formatMoney(shareValue)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              Savings amount
            </Text>

            <Text style={styles.infoValue}>
              {currency} {formatMoney(savingsAmount)}
            </Text>
          </View>

          <Text style={styles.helperText}>
            Minimum shares: {formatMoney(minimumShares)}
            {maximumShares > 0
              ? ` • Maximum: ${formatMoney(maximumShares)}`
              : ''}
          </Text>
        </View>

        {/* LOAN REPAYMENT */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Loan Repayment
          </Text>

          <TextInput
            style={styles.input}
            value={loanRepayment}
            onChangeText={setLoanRepayment}
            placeholder="Enter repayment amount"
            placeholderTextColor="#888"
            keyboardType="numeric"
            editable={!saving}
          />

          <Text style={styles.helperText}>
            Outstanding balance: {currency}{' '}
            {formatMoney(loanBalance)}
          </Text>
        </View>

        {/* SOCIAL FUND */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Social Fund
          </Text>

          <TextInput
            style={styles.input}
            value={socialFund}
            onChangeText={setSocialFund}
            placeholder="Enter social fund contribution"
            placeholderTextColor="#888"
            keyboardType="numeric"
            editable={!saving}
          />
        </View>

        {/* INSURANCE */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Insurance
          </Text>

          <TextInput
            style={styles.input}
            value={insurance}
            onChangeText={setInsurance}
            placeholder="Enter insurance contribution"
            placeholderTextColor="#888"
            keyboardType="numeric"
            editable={!saving}
          />
        </View>

        {/* EXISTING FINES */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Existing Fines
          </Text>

          {memberFines.length === 0 ? (
            <Text style={styles.emptyText}>
              No outstanding fines for this member.
            </Text>
          ) : (
            <>
              {memberFines.map(
                (fine, index) => (
                  <View
                    key={
                      fine.id ??
                      `${fine.fine_type}-${index}`
                    }
                    style={styles.fineRow}
                  >
                    <View
                      style={
                        styles.fineDetails
                      }
                    >
                      <Text
                        style={
                          styles.fineType
                        }
                      >
                        {fine.fine_type}
                      </Text>

                      {'fine_date' in fine &&
                      typeof fine.fine_date ===
                        'string' ? (
                        <Text
                          style={
                            styles.fineDate
                          }
                        >
                          {formatDate(
                            fine.fine_date,
                          )}
                        </Text>
                      ) : null}
                    </View>

                    <Text
                      style={
                        styles.fineAmount
                      }
                    >
                      {currency}{' '}
                      {formatMoney(
                        Number(
                          fine.outstanding_amount ||
                            0,
                        ),
                      )}
                    </Text>
                  </View>
                ),
              )}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Outstanding fines
                </Text>

                <Text style={styles.totalValue}>
                  {currency}{' '}
                  {formatMoney(
                    outstandingFineTotal,
                  )}
                </Text>
              </View>
            </>
          )}

          {outstandingFineTotal > 0 && (
            <>
              <Text style={styles.fieldLabel}>
                Fine payment
              </Text>

              <TextInput
                style={styles.input}
                value={finePayment}
                onChangeText={setFinePayment}
                placeholder="Enter fine payment"
                placeholderTextColor="#888"
                keyboardType="numeric"
                editable={!saving}
              />
            </>
          )}
        </View>

        {/* NEW FINE */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Record New Fine
          </Text>

          <Text style={styles.fieldLabel}>
            Fine type
          </Text>

          <TouchableOpacity
            style={styles.selector}
            onPress={() =>
              setShowFineTypes(
                (value) => !value,
              )
            }
            disabled={recordingFine}
          >
            <Text style={styles.selectorText}>
              {fineType}
            </Text>

            <Text style={styles.arrow}>
              {showFineTypes
                ? '▲'
                : '▼'}
            </Text>
          </TouchableOpacity>

          {showFineTypes && (
            <View
              style={
                styles.optionsBox
              }
            >
              {fineTypes.map(
                (type) => (
                  <TouchableOpacity
                    key={type}
                    style={
                      styles.option
                    }
                    onPress={() => {
                      setFineType(type);
                      setShowFineTypes(false);
                    }}
                  >
                    <Text
                      style={
                        styles.optionText
                      }
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>
          )}

          <Text style={styles.fieldLabel}>
            Fine amount
          </Text>

          <TextInput
            style={[
              styles.input,
              styles.disabledInput,
            ]}
            value={
              newFineAmount
                ? `${currency} ${formatMoney(
                    Number(newFineAmount),
                  )}`
                : ''
            }
            editable={false}
            placeholder="Not configured"
            placeholderTextColor="#888"
          />

          <Text style={styles.helperText}>
            Fine amount is automatically taken from
            VSLA Setup Rules and cannot be edited here.
          </Text>

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              recordingFine &&
                styles.disabledButton,
            ]}
            onPress={() =>
              void recordNewFine()
            }
            disabled={recordingFine}
          >
            {recordingFine ? (
              <ActivityIndicator
                color="#ffffff"
              />
            ) : (
              <Text
                style={
                  styles.secondaryButtonText
                }
              >
                Record Fine
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* PAYMENT SUMMARY */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>
            Payment Summary
          </Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              Savings
            </Text>

            <Text style={styles.infoValue}>
              {currency} {formatMoney(savingsAmount)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              Loan repayment
            </Text>

            <Text style={styles.infoValue}>
              {currency} {formatMoney(loanAmount)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              Social Fund
            </Text>

            <Text style={styles.infoValue}>
              {currency} {formatMoney(socialAmount)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              Insurance
            </Text>

            <Text style={styles.infoValue}>
              {currency} {formatMoney(insuranceAmount)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              Fine payment
            </Text>

            <Text style={styles.infoValue}>
              {currency} {formatMoney(finePaymentAmount)}
            </Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Total Payment
            </Text>

            <Text style={styles.totalValue}>
              {currency} {formatMoney(totalPayment)}
            </Text>
          </View>
        </View>

        {/* SAVE PAYMENT */}
        <TouchableOpacity
          style={[
            styles.primaryButton,
            saving &&
              styles.disabledButton,
          ]}
          onPress={() =>
            void submitFinancialTransaction()
          }
          disabled={
            saving ||
            endingMeeting ||
            !selectedMember
          }
        >
          {saving ? (
            <ActivityIndicator
              color="#ffffff"
            />
          ) : (
            <Text
              style={
                styles.primaryButtonText
              }
            >
              Save Financial Transaction
            </Text>
          )}
        </TouchableOpacity>

        {/* NEXT MEMBER */}
        <TouchableOpacity
          style={[
            styles.nextMemberButton,
            !hasNextMember &&
              styles.disabledOutlineButton,
          ]}
          onPress={goToNextMember}
          disabled={
            !hasNextMember ||
            saving ||
            endingMeeting
          }
        >
          <Text
            style={[
              styles.nextMemberText,
              !hasNextMember &&
                styles.disabledOutlineText,
            ]}
          >
            Next Member
          </Text>
        </TouchableOpacity>

        {/* NEXT SCREEN */}
        <TouchableOpacity
          style={[
            styles.nextButton,
            (saving ||
              endingMeeting) &&
              styles.disabledButton,
          ]}
          onPress={handleNextScreen}
          disabled={
            saving ||
            endingMeeting
          }
        >
          <Text
            style={styles.nextButtonText}
          >
            Next: Expenditure
          </Text>
        </TouchableOpacity>

        {/* BACK */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          disabled={
            saving ||
            endingMeeting
          }
        >
          <Text
            style={styles.backButtonText}
          >
            Back
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.endMeetingButton, (saving || endingMeeting) && styles.disabledButton]}
          onPress={handleEndMeeting}
          disabled={saving || endingMeeting}
        >
          <Text style={styles.endMeetingText}>Close Meeting</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7f5',
  },

  container: {
    padding: 16,
    paddingBottom: 40,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  header: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },

  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },

  headerSubtitle: {
    color: '#ffffff',
    opacity: 0.9,
    marginTop: 4,
    fontSize: 14,
  },

  loanDisbursementLink: {
    alignSelf: 'flex-start',
    marginTop: 12,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },

  loanDisbursementLinkText: {
    color: '#166534',
    fontSize: 15,
    fontWeight: '800',
  },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#222222',
    marginBottom: 12,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
  },

  balanceCard: {
    backgroundColor: '#e8f5e9',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },

  balanceLabel: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '600',
  },

  balanceAmount: {
    color: '#15803d',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 5,
  },

  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#16a34a',
  },

  cashReconciliationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 14,
    marginTop: 8,
    marginBottom: 14,
  },

  cashInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    marginTop: 12,
    color: '#111827',
    fontSize: 16,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#222222',
    marginBottom: 12,
  },

  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#444444',
    marginBottom: 7,
    marginTop: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 16,
    color: '#222222',
    backgroundColor: '#ffffff',
  },

  disabledInput: {
    backgroundColor: '#eeeeee',
    color: '#666666',
  },

  selector: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 10,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
  },

  selectorText: {
    flex: 1,
    color: '#222222',
    fontSize: 15,
    fontWeight: '600',
  },

  placeholderText: {
    flex: 1,
    color: '#888888',
    fontSize: 15,
  },

  arrow: {
    marginLeft: 10,
    color: '#16a34a',
    fontWeight: '800',
  },

  optionsBox: {
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 10,
    marginTop: 6,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },

  option: {
    paddingHorizontal: 13,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },

  optionText: {
    color: '#222222',
    fontSize: 15,
  },

  memberSummary: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
  },

  memberName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#166534',
  },

  memberNumber: {
    fontSize: 13,
    color: '#555555',
    marginTop: 3,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },

  infoLabel: {
    color: '#555555',
    fontSize: 14,
  },

  infoValue: {
    color: '#222222',
    fontSize: 15,
    fontWeight: '700',
  },

  helperText: {
    color: '#777777',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },

  fineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },

  fineDetails: {
    flex: 1,
    paddingRight: 10,
  },

  fineType: {
    color: '#333333',
    fontSize: 14,
    fontWeight: '700',
  },

  fineDate: {
    color: '#888888',
    fontSize: 12,
    marginTop: 3,
  },

  fineAmount: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '800',
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#dddddd',
  },

  totalLabel: {
    color: '#222222',
    fontSize: 16,
    fontWeight: '800',
  },

  totalValue: {
    color: '#16a34a',
    fontSize: 17,
    fontWeight: '900',
  },

  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  secondaryButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#15803d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 14,
  },

  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  nextMemberButton: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },

  nextMemberText: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: '800',
  },

  disabledOutlineButton: {
    borderColor: '#cccccc',
    backgroundColor: '#eeeeee',
  },

  disabledOutlineText: {
    color: '#888888',
  },

  nextButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  nextButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  backButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cccccc',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  backButtonText: {
    color: '#444444',
    fontSize: 15,
    fontWeight: '700',
  },

  memberSavingsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    elevation: 1,
  },
  memberSavingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 10,
  },
  memberSavingsIdentity: { flex: 1 },
  memberSavingsAmounts: { alignItems: 'flex-end' },
  memberSavingsName: { color: '#111827', fontSize: 14, fontWeight: '800' },
  memberSavingsNumber: { color: '#6b7280', fontSize: 12, marginTop: 3 },
  memberSavingsTotal: { color: '#166534', fontWeight: '800', fontSize: 14 },
  memberSavingsToday: { color: '#dc2626', fontWeight: '800', fontSize: 13, marginTop: 3 },
  transactionUndoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', gap: 8 },
  transactionUndoDetails: { flex: 1 },
  transactionAmount: { color: '#111827', fontSize: 13, fontWeight: '700', marginTop: 3 },
  undoButton: { backgroundColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 13, paddingVertical: 9 },
  undoButtonText: { color: '#b91c1c', fontWeight: '800' },
  endMeetingButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  endMeetingText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  disabledButton: {
    opacity: 0.55,
  },

  emptyText: {
    color: '#777777',
    fontSize: 14,
    lineHeight: 20,
  },

  errorText: {
    color: '#dc2626',
    fontSize: 16,
    textAlign: 'center',
  },

  loadingText: {
    marginTop: 12,
    color: '#555555',
    fontSize: 15,
  },
});
