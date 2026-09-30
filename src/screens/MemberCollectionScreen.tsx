import React, {
  useCallback,
  useEffect,
  useMemo,
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
  getFinancialTransactions,
  getMemberSavings,
  getMembersByGroupId,
  getVSLASetupRules,
} from '../database/database';

type MemberCollectionScreenProps = {
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
  photo_uri?: string | null;
  role?: string;
};

type FinancialTransaction = {
  id: number;
  group_id: number;
  member_id: number | null;
  meeting_id?: number | null;
  account_type: string;
  transaction_type: string;
  amount: number;
  reason?: string | null;
  created_at: string;
  reversed?: number;
};

/* -------------------------------------------------------
   CURRENCY
------------------------------------------------------- */

const formatUGX = (amount: number): string => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  return `UGX ${safeAmount.toLocaleString('en-UG')}`;
};

/* -------------------------------------------------------
   TRANSACTION NORMALIZATION
------------------------------------------------------- */

const normalizeTransactionType = (
  value: string | null | undefined,
): string => {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s-]/g, '_');
};

/* -------------------------------------------------------
   SCREEN
------------------------------------------------------- */

export default function MemberCollectionScreen({
  route,
}: MemberCollectionScreenProps) {
  const groupId = route?.params?.groupId ?? 0;
  const meetingId = route?.params?.meetingId ?? null;

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');

  const [shareValue, setShareValue] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);

  const [loanIssued, setLoanIssued] = useState(0);
  const [loanRepaid, setLoanRepaid] = useState(0);
  const [loanDue, setLoanDue] = useState(0);
  const [loanBalance, setLoanBalance] = useState(0);

  const [sharesToday, setSharesToday] = useState('');

  const [loanRepayment, setLoanRepayment] =
    useState('');

  const [socialFund, setSocialFund] =
    useState('');

  const [insurance, setInsurance] =
    useState('');

  const [lateFine, setLateFine] =
    useState('');

  const [absenceFine, setAbsenceFine] =
    useState('');

  const [nonLoanRepaymentFine, setNonLoanRepaymentFine] =
    useState('');

  const [nonInsurancePayment, setNonInsurancePayment] =
    useState('');

  const [loading, setLoading] = useState(false);

  const selectedMember = members[selectedIndex];

  /* -----------------------------------------------------
     CLEAR PAYMENT FIELDS
  ----------------------------------------------------- */

  function clearPaymentFields() {
    setSharesToday('');
    setLoanRepayment('');
    setSocialFund('');
    setInsurance('');
    setLateFine('');
    setAbsenceFine('');
    setNonLoanRepaymentFine('');
    setNonInsurancePayment('');
  }

  /* -----------------------------------------------------
     LOAD MEMBERS
  ----------------------------------------------------- */

  const loadMembers = useCallback(async () => {
    if (!groupId) {
      setMembers([]);
      return;
    }

    try {
      setLoading(true);

      const result =
        await getMembersByGroupId(groupId);

      const activeMembers = (result ?? [])
        .filter(
          (member: Member) =>
            String(member.status).toLowerCase() ===
            'active',
        )
        .sort(
          (a: Member, b: Member) =>
            a.full_name.localeCompare(
              b.full_name,
              undefined,
              {
                sensitivity: 'base',
              },
            ),
        );

      setMembers(activeMembers);

      setSelectedIndex((currentIndex) => {
        if (activeMembers.length === 0) {
          return 0;
        }

        return Math.min(
          currentIndex,
          activeMembers.length - 1,
        );
      });
    } catch (error) {
      console.error(
        'Failed to load members:',
        error,
      );

      Alert.alert(
        'Error',
        'Unable to load group members.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  /* -----------------------------------------------------
     LOAD MEMBER FINANCIAL DATA
  ----------------------------------------------------- */

  const loadMemberData = useCallback(
    async (memberId: number) => {
      if (!groupId || !memberId) {
        return;
      }

      try {
        const rules =
          await getVSLASetupRules(groupId);

        const savings =
          await getMemberSavings(
            groupId,
            memberId,
          );

        setShareValue(
          Number(rules?.share_value ?? 0),
        );

        setTotalSavings(
          Number.isFinite(Number(savings))
            ? Number(savings)
            : 0,
        );

        const transactions =
          (await getFinancialTransactions(
            groupId,
          )) as FinancialTransaction[];

        const memberTransactions =
          (transactions ?? []).filter(
            (transaction) =>
              Number(transaction.member_id) ===
                Number(memberId) &&
              Number(transaction.reversed ?? 0) ===
                0,
          );

        let issued = 0;
        let repaid = 0;

        for (const transaction of memberTransactions) {
          const accountType =
            String(
              transaction.account_type ?? '',
            ).toLowerCase();

          const transactionType =
            normalizeTransactionType(
              transaction.transaction_type,
            );

          const amount = Number(
            transaction.amount ?? 0,
          );

          if (
            !Number.isFinite(amount) ||
            amount <= 0
          ) {
            continue;
          }

          const isLoanDisbursement =
            accountType === 'loan_fund' &&
            (
              transactionType.includes(
                'loan_disbursement',
              ) ||
              transactionType.includes(
                'loan_issue',
              ) ||
              transactionType.includes(
                'loan_issued',
              ) ||
              transactionType === 'loan'
            );

          const isLoanRepayment =
            accountType === 'loan_repayment' ||
            transactionType.includes(
              'loan_repayment',
            ) ||
            transactionType === 'repayment' ||
            transactionType.includes(
              'loan_payment',
            );

          if (isLoanDisbursement) {
            issued += amount;
          }

          if (isLoanRepayment) {
            repaid += amount;
          }
        }

        const balance = Math.max(
          issued - repaid,
          0,
        );

        setLoanIssued(issued);
        setLoanRepaid(repaid);
        setLoanBalance(balance);

        /*
         * Historical collection requirement:
         *
         * loanDue represents the member's loan due
         * BEFORE today's payment.
         *
         * It is captured before payment confirmation.
         */
        setLoanDue(balance);

        clearPaymentFields();
      } catch (error) {
        console.error(
          'Failed to load member financial data:',
          error,
        );

        setTotalSavings(0);
        setLoanIssued(0);
        setLoanRepaid(0);
        setLoanDue(0);
        setLoanBalance(0);
      }
    },
    [groupId],
  );

  /* -----------------------------------------------------
     INITIAL LOAD
  ----------------------------------------------------- */

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (selectedMember) {
      loadMemberData(selectedMember.id);
    }
  }, [
    selectedMember,
    loadMemberData,
  ]);

  /* -----------------------------------------------------
     SEARCH + A-Z
  ----------------------------------------------------- */

  const filteredMembers = useMemo(() => {
    const query =
      searchQuery.trim().toLowerCase();

    if (!query) {
      return members;
    }

    return members.filter((member) => {
      const name =
        member.full_name.toLowerCase();

      const number =
        member.member_number.toLowerCase();

      return (
        name.includes(query) ||
        number.includes(query)
      );
    });
  }, [
    members,
    searchQuery,
  ]);

  /* -----------------------------------------------------
     PAYMENT CALCULATIONS
  ----------------------------------------------------- */

  const savingsToday =
    Number(sharesToday) > 0 &&
    Number.isFinite(Number(sharesToday)) &&
    shareValue > 0
      ? Number(sharesToday) * shareValue
      : 0;

  const loanPaymentToday =
    Number(loanRepayment) > 0 &&
    Number.isFinite(Number(loanRepayment))
      ? Number(loanRepayment)
      : 0;

  const socialFundToday =
    Number(socialFund) > 0 &&
    Number.isFinite(Number(socialFund))
      ? Number(socialFund)
      : 0;

  const insuranceToday =
    Number(insurance) > 0 &&
    Number.isFinite(Number(insurance))
      ? Number(insurance)
      : 0;

  const lateFineToday =
    Number(lateFine) > 0 &&
    Number.isFinite(Number(lateFine))
      ? Number(lateFine)
      : 0;

  const absenceFineToday =
    Number(absenceFine) > 0 &&
    Number.isFinite(Number(absenceFine))
      ? Number(absenceFine)
      : 0;

  const nonLoanRepaymentFineToday =
    Number(nonLoanRepaymentFine) > 0 &&
    Number.isFinite(
      Number(nonLoanRepaymentFine),
    )
      ? Number(nonLoanRepaymentFine)
      : 0;

  const nonInsurancePaymentToday =
    Number(nonInsurancePayment) > 0 &&
    Number.isFinite(
      Number(nonInsurancePayment),
    )
      ? Number(nonInsurancePayment)
      : 0;

  const totalPaymentToday =
    savingsToday +
    loanPaymentToday +
    socialFundToday +
    insuranceToday +
    lateFineToday +
    absenceFineToday +
    nonLoanRepaymentFineToday +
    nonInsurancePaymentToday;

  /*
   * Loan balance after today's payment.
   *
   * Example:
   * Current loan = 150,000
   * Payment      = 30,000
   * Remaining    = 120,000
   */

  const loanBalanceAfterPayment =
    Math.max(
      loanBalance -
        loanPaymentToday,
      0,
    );

  /* -----------------------------------------------------
     SELECT MEMBER
  ----------------------------------------------------- */

  function selectMember(
    memberId: number,
  ) {
    const index =
      members.findIndex(
        (member) =>
          Number(member.id) ===
          Number(memberId),
      );

    if (index >= 0) {
      setSelectedIndex(index);
    }
  }

  /* -----------------------------------------------------
     NEXT MEMBER
  ----------------------------------------------------- */

  function nextMember() {
    if (members.length === 0) {
      return;
    }

    setSelectedIndex(
      (currentIndex) => {
        if (
          currentIndex >=
          members.length - 1
        ) {
          return 0;
        }

        return currentIndex + 1;
      },
    );

    setSearchQuery('');
  }

  /* -----------------------------------------------------
     MAKE PAYMENT
  ----------------------------------------------------- *
  async function handleMakePayment() {
  if (!selectedMember) {
    Alert.alert(
      'No Member',
      'Please select a member first.',
    );
    return;
  }

  if (!totalPaymentToday || totalPaymentToday <= 0) {
    Alert.alert(
      'No Payment',
      'Enter at least one payment amount.',
    );
    return;
  }

  if (
    loanPaymentToday > loanBalance &&
    loanBalance > 0
  ) {
    Alert.alert(
      'Loan Payment Too High',
      `The member's current loan balance is ${formatUGX(
        loanBalance,
      )}.`,
    );
    return;
  }

  const confirmationMessage = [
    `Member: ${selectedMember.full_name}`,
    `Member No: ${selectedMember.member_number}`,
    '',
    `Savings: ${formatUGX(savingsToday)}`,
    `Loan repayment: ${formatUGX(loanPaymentToday)}`,
    `Social fund: ${formatUGX(socialFundToday)}`,
    `Insurance: ${formatUGX(insuranceToday)}`,
    `Late fine: ${formatUGX(lateFineToday)}`,
    `Absence fine: ${formatUGX(absenceFineToday)}`,
    `Non-loan repayment fine: ${formatUGX(
      nonLoanRepaymentFineToday,
    )}`,
    `Non-insurance payment: ${formatUGX(
      nonInsurancePaymentToday,
    )}`,
    '',
    `TOTAL: ${formatUGX(totalPaymentToday)}`,
    '',
    `Loan due before payment: ${formatUGX(loanDue)}`,
    `Loan balance after payment: ${formatUGX(
      loanBalanceAfterPayment,
    )}`,
  ].join('\n');

  Alert.alert(
    'Confirm Payment',
    confirmationMessage,
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Confirm',
        onPress: async () => {
          try {
            setLoading(true);

            const payments: Array<{
              accountType:
                | 'savings'
                | 'loan_fund'
                | 'loan_repayment'
                | 'social_fund'
                | 'fines'
                | 'external_fund'
                | 'expenditure_fund'
                | 'insurance_fund';
              amount: number;
              reason: string;
            }> = [];

            if (savingsToday > 0) {
              payments.push({
                accountType: 'savings',
                amount: savingsToday,
                reason: 'Savings contribution',
              });
            }

            if (loanPaymentToday > 0) {
              payments.push({
                accountType: 'loan_repayment',
                amount: loanPaymentToday,
                reason: 'Loan repayment',
              });
            }

            if (socialFundToday > 0) {
              payments.push({
                accountType: 'social_fund',
                amount: socialFundToday,
                reason: 'Social fund contribution',
              });
            }

            if (insuranceToday > 0) {
              payments.push({
                accountType: 'insurance_fund',
                amount: insuranceToday,
                reason: 'Insurance contribution',
              });
            }

            if (lateFineToday > 0) {
              payments.push({
                accountType: 'fines',
                amount: lateFineToday,
                reason: 'Late fine',
              });
            }

            if (absenceFineToday > 0) {
              payments.push({
                accountType: 'fines',
                amount: absenceFineToday,
                reason: 'Absence fine',
              });
            }

            if (nonLoanRepaymentFineToday > 0) {
              payments.push({
                accountType: 'fines',
                amount: nonLoanRepaymentFineToday,
                reason: 'Non-loan repayment fine',
              });
            }

            if (nonInsurancePaymentToday > 0) {
              payments.push({
                accountType: 'fines',
                amount: nonInsurancePaymentToday,
                reason: 'Non-insurance payment',
              });
            }

            if (payments.length === 0) {
              throw new Error(
                'No valid payment was entered.',
              );
            }

            const collection =
              await createFinancialCollection(
                groupId,
                selectedMember.id,
                meetingId,
                payments,
              );

            const receipt =
              await createReceipt(
                groupId,
                selectedMember.id,
                meetingId,
                collection.id,
                null,
                totalPaymentToday,
                [
                  'Member collection',
                  `Loan due before payment: ${formatUGX(
                    loanDue,
                  )}`,
                  `Loan balance after payment: ${formatUGX(
                    loanBalanceAfterPayment,
                  )}`,
                  `Confirmation: ${collection.confirmation_code}`,
                ].join(' | '),
              );

            await loadMemberData(
              selectedMember.id,
            );

            Alert.alert(
              'Payment Saved',
              [
                `Payment saved for ${selectedMember.full_name}.`,
                '',
                `Total: ${formatUGX(
                  totalPaymentToday,
                )}`,
                `Receipt: ${receipt.receipt_number}`,
                `Confirmation: ${collection.confirmation_code}`,
                '',
                `Loan balance after payment: ${formatUGX(
                  loanBalanceAfterPayment,
                )}`,
              ].join('\n'),
            );
          } catch (error) {
            console.error(
              'Failed to save member collection:',
              error,
            );

            Alert.alert(
              'Payment Failed',
              error instanceof Error
                ? error.message
                : 'Unable to save this payment.',
            );
          } finally {
            setLoading(false);
          }
        },
      },
    ],
  );
}
/* -----------------------------------------------------
     PRINT RECEIPT
  ----------------------------------------------------- */

  function handlePrintReceipt() {
    if (!selectedMember) {
      Alert.alert(
        'No Member',
        'Please select a member first.',
      );
      return;
    }

    if (totalPaymentToday <= 0) {
      Alert.alert(
        'No Payment',
        'There is no payment to print.',
      );
      return;
    }

    Alert.alert(
      'Receipt',
      `Receipt for ${
        selectedMember.full_name
      }\n\nTotal: ${formatUGX(
        totalPaymentToday,
      )}`,
    );
  }

  /* -----------------------------------------------------
     UI
  ----------------------------------------------------- */

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
          <Text
            style={styles.headerTitle}
          >
            Member Collection
          </Text>

          <Text
            style={styles.headerSubtitle}
          >
            Savings, loans, fines and funds
          </Text>
        </View>

        {/* SEARCH */}

        <View
          style={styles.searchContainer}
        >
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search member name or number"
            placeholderTextColor="#777"
            style={styles.searchInput}
          />
        </View>

        {/* MEMBER LIST */}

        <View
          style={styles.memberListCard}
        >
          <View
            style={styles.sectionHeader}
          >
            <Text
              style={styles.sectionTitle}
            >
              Members A-Z
            </Text>

            <Text
              style={styles.memberCount}
            >
              {filteredMembers.length}
            </Text>
          </View>

          {filteredMembers.length === 0 ? (
            <Text
              style={styles.emptyText}
            >
              No members found.
            </Text>
          ) : (
            filteredMembers.map(
              (member) => {
                const isSelected =
                  selectedMember?.id ===
                  member.id;

                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[
                      styles.memberRow,
                      isSelected &&
                        styles.selectedMemberRow,
                    ]}
                    onPress={() =>
                      selectMember(
                        member.id,
                      )
                    }
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
                        {
                          member.member_number
                        }
                      </Text>
                    </View>

                    {isSelected && (
                      <Text
                        style={
                          styles.selectedText
                        }
                      >
                        SELECTED
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              },
            )
          )}
        </View>

        {selectedMember && (
          <>
            {/* SELECTED MEMBER */}

            <View
              style={styles.selectedCard}
            >
              <Text
                style={styles.selectedLabel}
              >
                SELECTED MEMBER
              </Text>

              <Text
                style={styles.selectedName}
              >
                {selectedMember.full_name}
              </Text>

              <Text
                style={
                  styles.selectedNumber
                }
              >
                {
                  selectedMember.member_number
                }
              </Text>
            </View>

            {/* FINANCIAL SUMMARY */}

            <View
              style={styles.summaryCard}
            >
              <Text
                style={styles.sectionTitle}
              >
                Member Financial Summary
              </Text>

              <View
                style={styles.summaryRow}
              >
                <Text
                  style={styles.summaryLabel}
                >
                  Total Savings
                </Text>

                <Text
                  style={styles.summaryValue}
                >
                  {formatUGX(
                    totalSavings,
                  )}
                </Text>
              </View>

              <View
                style={styles.summaryRow}
              >
                <Text
                  style={styles.summaryLabel}
                >
                  Loan Issued
                </Text>

                <Text
                  style={styles.summaryValue}
                >
                  {formatUGX(
                    loanIssued,
                  )}
                </Text>
              </View>

              <View
                style={styles.summaryRow}
              >
                <Text
                  style={styles.summaryLabel}
                >
                  Loan Repaid
                </Text>

                <Text
                  style={styles.summaryValue}
                >
                  {formatUGX(
                    loanRepaid,
                  )}
                </Text>
              </View>

              <View
                style={[
                  styles.summaryRow,
                  styles.loanDueRow,
                ]}
              >
                <Text
                  style={styles.loanDueLabel}
                >
                  Loan Due
                </Text>

                <Text
                  style={styles.loanDueValue}
                >
                  {formatUGX(loanDue)}
                </Text>
              </View>

              <View
                style={styles.summaryRow}
              >
                <Text
                  style={styles.summaryLabel}
                >
                  Current Loan Balance
                </Text>

                <Text
                  style={
                    styles.loanBalanceValue
                  }
                >
                  {formatUGX(
                    loanBalance,
                  )}
                </Text>
              </View>
            </View>

            {/* SAVINGS */}

            <View
              style={styles.paymentCard}
            >
              <Text
                style={styles.sectionTitle}
              >
                Savings
              </Text>

              <Text
                style={styles.inputLabel}
              >
                Number of shares
              </Text>

              <TextInput
                value={sharesToday}
                onChangeText={
                  setSharesToday
                }
                placeholder="0"
                keyboardType="numeric"
                style={styles.input}
              />

              <View
                style={styles.calculatedRow}
              >
                <Text
                  style={
                    styles.calculatedLabel
                  }
                >
                  Savings today
                </Text>

                <Text
                  style={
                    styles.calculatedValue
                  }
                >
                  {formatUGX(
                    savingsToday,
                  )}
                </Text>
              </View>

              <Text
                style={styles.smallText}
              >
                Share value:{' '}
                {formatUGX(
                  shareValue,
                )}
              </Text>
            </View>

            {/* LOAN REPAYMENT */}

            <View
              style={styles.paymentCard}
            >
              <Text
                style={styles.sectionTitle}
              >
                Loan Repayment
              </Text>

              <View
                style={styles.loanInfoBox}
              >
                <Text
                  style={styles.loanInfoText}
                >
                  Loan due:{' '}
                  {formatUGX(
                    loanDue,
                  )}
                </Text>

                <Text
                  style={styles.loanInfoText}
                >
                  Current balance:{' '}
                  {formatUGX(
                    loanBalance,
                  )}
                </Text>

                <Text
                  style={styles.loanInfoText}
                >
                  After payment:{' '}
                  {formatUGX(
                    loanBalanceAfterPayment,
                  )}
                </Text>
              </View>

              <Text
                style={styles.inputLabel}
              >
                Amount paid
              </Text>

              <TextInput
                value={loanRepayment}
                onChangeText={
                  setLoanRepayment
                }
                placeholder="0"
                keyboardType="numeric"
                style={styles.input}
              />
            </View>

            {/* OTHER PAYMENTS */}

            <View
              style={styles.paymentCard}
            >
              <Text
                style={styles.sectionTitle}
              >
                Other Payments
              </Text>

              <Text
                style={styles.inputLabel}
              >
                Social Fund
              </Text>

              <TextInput
                value={socialFund}
                onChangeText={
                  setSocialFund
                }
                placeholder="0"
                keyboardType="numeric"
                style={styles.input}
              />

              <Text
                style={styles.inputLabel}
              >
                Insurance
              </Text>

              <TextInput
                value={insurance}
                onChangeText={
                  setInsurance
                }
                placeholder="0"
                keyboardType="numeric"
                style={styles.input}
              />

              <Text
                style={styles.inputLabel}
              >
                Late Fine
              </Text>

              <TextInput
                value={lateFine}
                onChangeText={
                  setLateFine
                }
                placeholder="0"
                keyboardType="numeric"
                style={styles.input}
              />

              <Text
                style={styles.inputLabel}
              >
                Absence Fine
              </Text>

              <TextInput
                value={absenceFine}
                onChangeText={
                  setAbsenceFine
                }
                placeholder="0"
                keyboardType="numeric"
                style={styles.input}
              />

              <Text
                style={styles.inputLabel}
              >
                Non-loan Repayment Fine
              </Text>

              <TextInput
                value={
                  nonLoanRepaymentFine
                }
                onChangeText={
                  setNonLoanRepaymentFine
                }
                placeholder="0"
                keyboardType="numeric"
                style={styles.input}
              />

              <Text
                style={styles.inputLabel}
              >
                Non-insurance Payment
              </Text>

              <TextInput
                value={
                  nonInsurancePayment
                }
                onChangeText={
                  setNonInsurancePayment
                }
                placeholder="0"
                keyboardType="numeric"
                style={styles.input}
              />
            </View>

            {/* TODAY'S TOTAL */}

            <View
              style={styles.totalCard}
            >
              <Text
                style={styles.totalLabel}
              >
                TOTAL PAYMENT TODAY
              </Text>

              <Text
                style={styles.totalAmount}
              >
                {formatUGX(
                  totalPaymentToday,
                )}
              </Text>

              <View
                style={styles.totalBreakdown}
              >
                <Text
                  style={styles.breakdownText}
                >
                  Savings:{' '}
                  {formatUGX(
                    savingsToday,
                  )}
                </Text>

                <Text
                  style={styles.breakdownText}
                >
                  Loan:{' '}
                  {formatUGX(
                    loanPaymentToday,
                  )}
                </Text>

                <Text
                  style={styles.breakdownText}
                >
                  Social:{' '}
                  {formatUGX(
                    socialFundToday,
                  )}
                </Text>

                <Text
                  style={styles.breakdownText}
                >
                  Insurance:{' '}
                  {formatUGX(
                    insuranceToday,
                  )}
                </Text>

                <Text
                  style={styles.breakdownText}
                >
                  Fines/Other:{' '}
                  {formatUGX(
                    lateFineToday +
                      absenceFineToday +
                      nonLoanRepaymentFineToday +
                      nonInsurancePaymentToday,
                  )}
                </Text>
              </View>
            </View>

            {/* ACTIONS */}

            <TouchableOpacity
              style={styles.payButton}
              onPress={
                handleMakePayment
              }
            >
              <Text
                style={
                  styles.payButtonText
                }
              >
                CONFIRM PAYMENT
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={
                styles.receiptButton
              }
              onPress={
                handlePrintReceipt
              }
            >
              <Text
                style={
                  styles.receiptButtonText
                }
              >
                PRINT RECEIPT
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.nextButton}
              onPress={nextMember}
            >
              <Text
                style={
                  styles.nextButtonText
                }
              >
                NEXT MEMBER
              </Text>
            </TouchableOpacity>
          </>
        )}

        {loading && (
          <Text
            style={styles.loadingText}
          >
            Loading members...
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* -------------------------------------------------------
   STYLES
------------------------------------------------------- */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7f5',
  },

  container: {
    paddingBottom: 40,
  },

  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },

  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },

  headerSubtitle: {
    color: '#fff',
    marginTop: 4,
    fontSize: 13,
  },

  searchContainer: {
    padding: 15,
  },

  searchInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },

  memberListCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },

  memberCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
  },

  memberList: {
    paddingBottom: 5,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  selectedMemberRow: {
    backgroundColor: '#ecfdf5',
  },

  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  memberAvatarText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },

  memberInfo: {
    flex: 1,
  },

  memberName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  memberNumber: {
    marginTop: 3,
    fontSize: 12,
    color: '#6b7280',
  },

  selectedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16a34a',
  },

  emptyText: {
    padding: 20,
    textAlign: 'center',
    color: '#6b7280',
  },

  selectedCard: {
    backgroundColor: '#16a34a',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 18,
    borderRadius: 12,
  },

  selectedLabel: {
    color: '#dcfce7',
    fontSize: 11,
    fontWeight: '800',
  },

  selectedName: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 5,
  },

  selectedNumber: {
    color: '#dcfce7',
    fontSize: 13,
    marginTop: 3,
  },

  summaryCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },

  summaryLabel: {
    fontSize: 14,
    color: '#4b5563',
  },

  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },

  loanDueRow: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 10,
    borderRadius: 8,
    borderBottomWidth: 0,
    marginTop: 5,
  },

  loanDueLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#c2410c',
  },

  loanDueValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#c2410c',
  },

  loanBalanceValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#b91c1c',
  },

  paymentCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },

  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },

  calculatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    padding: 10,
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
  },

  calculatedLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },

  calculatedValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#15803d',
  },

  smallText: {
    marginTop: 7,
    fontSize: 12,
    color: '#6b7280',
  },

  loanInfoBox: {
    backgroundColor: '#fff7ed',
    padding: 12,
    borderRadius: 9,
    marginTop: 10,
  },

  loanInfoText: {
    fontSize: 13,
    color: '#9a3412',
    fontWeight: '600',
    marginBottom: 4,
  },

  totalCard: {
    backgroundColor: '#111827',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 18,
    borderRadius: 12,
  },

  totalLabel: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '800',
  },

  totalAmount: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 5,
  },

  totalBreakdown: {
    marginTop: 12,
  },

  breakdownText: {
    color: '#e5e7eb',
    fontSize: 12,
    marginTop: 4,
  },

  payButton: {
    backgroundColor: '#16a34a',
    marginHorizontal: 15,
    marginTop: 18,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },

  payButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },

  receiptButton: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#16a34a',
  },

  receiptButtonText: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '800',
  },

  nextButton: {
    backgroundColor: '#374151',
    marginHorizontal: 15,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },

  nextButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  loadingText: {
    textAlign: 'center',
    marginTop: 15,
    marginBottom: 20,
    color: '#6b7280',
  },
});
