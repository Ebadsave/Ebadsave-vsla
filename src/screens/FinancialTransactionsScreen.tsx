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
  closeMeeting,
  getMemberFines,
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

  /*
   * UGX is only the default display currency.
   * The screen does not lock the database to UGX.
   */
  const currency = params.currency?.trim() || 'UGX';

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

  const [showMembers, setShowMembers] = useState(false);
  const [showFineTypes, setShowFineTypes] = useState(false);

  const [shares, setShares] = useState('');
  const [loanRepayment, setLoanRepayment] = useState('');
  const [socialFund, setSocialFund] = useState('');
  const [insurance, setInsurance] = useState('');
  const [finePayment, setFinePayment] = useState('');

  /*
   * New fine amount is NOT manually editable.
   * It is automatically populated from Setup Rules.
   */
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

  /*
   * Get exact fine amount from Setup Rules.
   */
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

  /*
   * Automatically insert the exact Setup Rules amount
   * whenever the fine type changes.
   */
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

      /*
       * If no meetingId was passed, recover the
       * currently open meeting.
       */
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

    /*
     * Clear this member's unfinished payment
     * entries when moving to another member.
     */
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

  /*
   * Savings validation.
   *
   * IMPORTANT:
   * If the member is not making a savings payment,
   * savings rules do not block loan repayment,
   * social fund, insurance or fine payment.
   */
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

  /*
   * Save each payment independently.
   *
   * If one payment fails, the remaining payments
   * are still attempted.
   */
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

      /*
       * SAVINGS
       */
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

      /*
       * LOAN REPAYMENT
       */
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

      /*
       * SOCIAL FUND
       */
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

      /*
       * INSURANCE
       */
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

      /*
       * FINE PAYMENT
       */
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

      /*
       * Refresh this member regardless of whether
       * one or more payments failed.
       */
      try {
        await loadMemberFinancialData(
          selectedMemberId,
        );
      } catch {
        // Do not block the transaction flow.
      }

      setSaving(false);

      /*
       * IMPORTANT:
       * We do not lock the screen after a failure.
       * The user can continue with the same member
       * or select another member.
       */
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

  /*
   * Record a NEW fine.
   *
   * The amount is taken directly from Setup Rules.
   * The user cannot change it.
   */
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

  /*
   * Next member.
   */
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

  /*
   * NEXT SCREEN
   *
   * Financial Transactions -> Expenditure
   */
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

  /*
   * BACK
   */
  const handleBack = () => {
    if (saving || endingMeeting) {
      return;
    }

    navigation.goBack();
  };

  /*
   * END MEETING
   *
   * The database closeMeeting function requires
   * an executive member ID.
   *
   * We find the active executive from the group's
   * members instead of changing the route structure.
   */
  const handleEndMeeting = () => {
    if (!meetingId) {
      Alert.alert(
        'Meeting not available',
        'There is no open meeting to end.',
      );

      return;
    }

    const executive = members.find(
      (member) =>
        member.status
          ?.toLowerCase() ===
          'active' &&
        member.role
          ?.toLowerCase() ===
          'executive',
    );

    if (!executive) {
      Alert.alert(
        'Executive Required',
        'An active executive member is required to end the meeting.',
      );

      return;
    }

    Alert.alert(
      'End Meeting',
      'Are you sure you want to end this meeting? Once closed, it cannot continue as the current meeting.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'End Meeting',
          style: 'destructive',
          onPress: async () => {
            setEndingMeeting(true);

            try {
              await closeMeeting(
                meetingId,
                executive.id,
              );

              Alert.alert(
                'Meeting Ended',
                'The meeting has been closed successfully.',
                [
                  {
                    text: 'OK',
                    onPress: () =>
                      navigation.navigate(
                        'Home',
                      ),
                  },
                ],
              );
            } catch (error) {
              Alert.alert(
                'Unable to End Meeting',
                error instanceof Error
                  ? error.message
                  : 'The meeting could not be closed.',
              );
            } finally {
              setEndingMeeting(false);
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
               
