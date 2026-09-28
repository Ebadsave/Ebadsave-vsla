import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
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
  getVSLASetupRules,
  getMemberSavings,
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
  photo_uri?: string | null;
  role?: string | null;
};

export default function MemberCollectionScreen({ route }: Props) {
  const groupId = route?.params?.groupId;
  const meetingId = route?.params?.meetingId ?? null;

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');

  const [shareValue, setShareValue] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);

  const [sharesToday, setSharesToday] = useState('');
  const [loanPayment, setLoanPayment] = useState('');
  const [socialFund, setSocialFund] = useState('');
  const [insurance, setInsurance] = useState('');
  const [lateFine, setLateFine] = useState('');
  const [absenceFine, setAbsenceFine] = useState('');
  const [nonLoanRepayment, setNonLoanRepayment] = useState('');
  const [nonInsurancePayment, setNonInsurancePayment] = useState('');

  const [loading, setLoading] = useState(true);

  const selectedMember = members[selectedIndex];

  /*
   * Members are already stored in A-Z order.
   * Search works by member name OR member number.
   */
  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return members;
    }

    return members.filter((member) => {
      return (
        member.full_name.toLowerCase().includes(query) ||
        member.member_number.toLowerCase().includes(query)
      );
    });
  }, [members, searchQuery]);

  useEffect(() => {
    loadMembers();
  }, [groupId]);

  useEffect(() => {
    if (selectedMember && groupId) {
      loadMemberData(selectedMember.id);
    }
  }, [selectedMember?.id, groupId]);

  async function loadMembers() {
    if (!groupId) {
      Alert.alert(
        'No Active Group',
        'Please select or register an active group first.',
      );
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [groupMembers, rules] = await Promise.all([
        getMembersByGroupId(groupId),
        getVSLASetupRules(groupId),
      ]);

      /*
       * Always keep active members in alphabetical A-Z order.
       */
      const sortedMembers = groupMembers
        .filter((member) => member.status === 'active')
        .sort((a, b) =>
          a.full_name.localeCompare(
            b.full_name,
            undefined,
            {
              sensitivity: 'base',
            },
          ),
        );

      setMembers(sortedMembers);
      setShareValue(Number(rules?.share_value ?? 0));
      setSelectedIndex(0);
    } catch (error) {
      console.error('Failed to load members:', error);

      Alert.alert(
        'Error',
        'Unable to load members.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadMemberData(memberId: number) {
    if (!groupId) return;

    try {
      const savings = await getMemberSavings(
        groupId,
        memberId,
      );

      setTotalSavings(Number(savings ?? 0));
    } catch (error) {
      console.error(
        'Failed to load member savings:',
        error,
      );

      setTotalSavings(0);
    }

    clearPaymentFields();
  }

  function clearPaymentFields() {
    setSharesToday('');
    setLoanPayment('');
    setSocialFund('');
    setInsurance('');
    setLateFine('');
    setAbsenceFine('');
    setNonLoanRepayment('');
    setNonInsurancePayment('');
  }

  const savingsToday = useMemo(() => {
    const shares = Number(sharesToday);

    if (!Number.isFinite(shares) || shares <= 0) {
      return 0;
    }

    return shares * shareValue;
  }, [sharesToday, shareValue]);

  const totalPaymentToday = useMemo(() => {
    return (
      savingsToday +
      Number(loanPayment || 0) +
      Number(socialFund || 0) +
      Number(insurance || 0) +
      Number(lateFine || 0) +
      Number(absenceFine || 0) +
      Number(nonLoanRepayment || 0) +
      Number(nonInsurancePayment || 0)
    );
  }, [
    savingsToday,
    loanPayment,
    socialFund,
    insurance,
    lateFine,
    absenceFine,
    nonLoanRepayment,
    nonInsurancePayment,
  ]);

  function selectMember(memberId: number) {
    const index = members.findIndex(
      (member) => member.id === memberId,
    );

    if (index >= 0) {
      setSelectedIndex(index);
    }
  }

  function nextMember() {
    if (members.length === 0) return;

    if (selectedIndex < members.length - 1) {
      setSelectedIndex((current) => current + 1);

      /*
       * Clear search after moving to the next member
       * so the complete A-Z list is visible again.
       */
      setSearchQuery('');
    } else {
      Alert.alert(
        'End of Members',
        'You have reached the last member in A–Z order.',
      );
    }
  }
async function handleMakePayment() {
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
      'Enter at least one payment amount.',
    );
    return;
  }

  const paymentDetails = [
    sharesToday > 0
      ? `Savings: UGX ${savingsToday.toLocaleString()}`
      : null,

    loanPayment > 0
      ? `Loan repayment: UGX ${loanPayment.toLocaleString()}`
      : null,

    socialFund > 0
      ? `Social fund: UGX ${socialFund.toLocaleString()}`
      : null,

    insurance > 0
      ? `Insurance: UGX ${insurance.toLocaleString()}`
      : null,

    lateFine > 0
      ? `Late fine: UGX ${lateFine.toLocaleString()}`
      : null,

    absenceFine > 0
      ? `Absence fine: UGX ${absenceFine.toLocaleString()}`
      : null,

    nonLoanRepayment > 0
      ? `Non-loan repayment fine: UGX ${nonLoanRepayment.toLocaleString()}`
      : null,

    nonInsurancePayment > 0
      ? `Non-insurance payment: UGX ${nonInsurancePayment.toLocaleString()}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  Alert.alert(
    'Confirm Payment',
    `Member: ${selectedMember.full_name}\n\n${paymentDetails}\n\nTOTAL: UGX ${totalPaymentToday.toLocaleString()}`,
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Confirm',
        onPress: () => {
          Alert.alert(
            'Payment Ready',
            'The payment has been confirmed on this screen. Database recording will be connected in the next step.',
          );
        },
      },
    ],
  );
}

  function handlePrintReceipt() {
    if (!selectedMember) return;

    Alert.alert(
      'Receipt',
      'Receipt printing will be connected after payment recording is connected.',
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>
            Loading members...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!selectedMember) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>
            No Active Members
          </Text>

          <Text style={styles.emptyText}>
            There are no active members in this group.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>
          MEMBER COLLECTION
        </Text>

        {/* SEARCH */}
        <View style={styles.searchCard}>
          <Text style={styles.searchLabel}>
            SEARCH MEMBER
          </Text>

          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search name or member number"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.searchCount}>
            Showing {filteredMembers.length} of {members.length} members
          </Text>
        </View>

        {/* A-Z MEMBER LIST */}
        <View style={styles.memberListCard}>
          <View style={styles.memberListHeader}>
            <Text style={styles.memberListTitle}>
              MEMBERS — A TO Z
            </Text>

            <Text style={styles.memberListCount}>
              {members.length}
            </Text>
          </View>

          {filteredMembers.length === 0 ? (
            <Text style={styles.noSearchResults}>
              No member found.
            </Text>
          ) : (
            filteredMembers.map((member) => (
              <TouchableOpacity
                key={member.id}
                style={[
                  styles.memberListRow,
                  selectedMember.id === member.id &&
                    styles.selectedMemberRow,
                ]}
                onPress={() => selectMember(member.id)}
                activeOpacity={0.8}
              >
                <View style={styles.memberListNumber}>
                  <Text style={styles.memberListNumberText}>
                    {member.member_number.replace('KYA', '')}
                  </Text>
                </View>

                <View style={styles.memberListInfo}>
                  <Text style={styles.memberListName}>
                    {member.full_name}
                  </Text>

                  <Text style={styles.memberListMemberNumber}>
                    {member.member_number}
                  </Text>
                </View>

                {selectedMember.id === member.id && (
                  <Text style={styles.selectedText}>
                    SELECTED
                  </Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* SELECTED MEMBER */}
        <View style={styles.memberCard}>
          {selectedMember.photo_uri ? (
            <Image
              source={{
                uri: selectedMember.photo_uri,
              }}
              style={styles.photo}
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoText}>
                {selectedMember.full_name
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
          )}

          <Text style={styles.memberName}>
            {selectedMember.full_name}
          </Text>

          <Text style={styles.memberNumber}>
            {selectedMember.member_number}
          </Text>
        </View>

        {/* MEMBER SUMMARY */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>
            Loan due amount
          </Text>

          <Text style={styles.loanAmount}>
            UGX 0
          </Text>

          <Text style={styles.summaryLabel}>
            Total savings
          </Text>

          <Text style={styles.summaryValue}>
            UGX {totalSavings.toLocaleString()}
          </Text>

          <Text style={styles.summaryLabel}>
            Outstanding fines
          </Text>

          <Text style={styles.summaryValue}>
            UGX 0
          </Text>
        </View>

        {/* PAYMENTS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            MAKE PAYMENTS
          </Text>

          <Text style={styles.label}>
            Number of shares purchased
          </Text>

          <TextInput
            style={styles.input}
            value={sharesToday}
            onChangeText={setSharesToday}
            keyboardType="numeric"
            placeholder="Enter number of shares"
          />

          <Text style={styles.label}>
            Total savings amount today
          </Text>

          <View style={styles.readOnlyBox}>
            <Text style={styles.readOnlyText}>
              UGX {savingsToday.toLocaleString()}
            </Text>
          </View>

          <Text style={styles.label}>
            Loan payment
          </Text>

          <TextInput
            style={styles.input}
            value={loanPayment}
            onChangeText={setLoanPayment}
            keyboardType="numeric"
            placeholder="UGX"
          />

          <Text style={styles.label}>
            Social fund
          </Text>

          <TextInput
            style={styles.input}
            value={socialFund}
            onChangeText={setSocialFund}
            keyboardType="numeric"
            placeholder="UGX"
          />

          <Text style={styles.label}>
            Insurance
          </Text>

          <TextInput
            style={styles.input}
            value={insurance}
            onChangeText={setInsurance}
            keyboardType="numeric"
            placeholder="UGX"
          />

          <Text style={styles.label}>
            Late fine
          </Text>

          <TextInput
            style={styles.input}
            value={lateFine}
            onChangeText={setLateFine}
            keyboardType="numeric"
            placeholder="UGX"
          />

          <Text style={styles.label}>
            Absence fine
          </Text>

          <TextInput
            style={styles.input}
            value={absenceFine}
            onChangeText={setAbsenceFine}
            keyboardType="numeric"
            placeholder="UGX"
          />

          <Text style={styles.label}>
            Non-loan repayment
          </Text>

          <TextInput
            style={styles.input}
            value={nonLoanRepayment}
            onChangeText={setNonLoanRepayment}
            keyboardType="numeric"
            placeholder="UGX"
          />

          <Text style={styles.label}>
            Non-insurance payment
          </Text>

          <TextInput
            style={styles.input}
            value={nonInsurancePayment}
            onChangeText={setNonInsurancePayment}
            keyboardType="numeric"
            placeholder="UGX"
          />
        </View>

        {/* TOTAL PAYMENT */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>
            TOTAL PAYMENT TODAY
          </Text>

          <Text style={styles.totalAmount}>
            UGX {totalPaymentToday.toLocaleString()}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleMakePayment}
        >
          <Text style={styles.primaryButtonText}>
            MAKE PAYMENT
          </Text>
        </TouchableOpacity>

        {/* LOAN BALANCE */}
        <View style={styles.balanceCard}>
          <Text style={styles.summaryLabel}>
            REMAINING LOAN BALANCE
          </Text>

          <Text style={styles.balanceAmount}>
            UGX 0
          </Text>
        </View>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handlePrintReceipt}
        >
          <Text style={styles.secondaryButtonText}>
            PRINT RECEIPT
          </Text>
        </TouchableOpacity>

        <Text style={styles.servedBy}>
          You are being served by
        </Text>

        <Text style={styles.executiveName}>
          Executive
        </Text>

        <TouchableOpacity
          style={styles.nextButton}
          onPress={nextMember}
        >
          <Text style={styles.nextButtonText}>
            NEXT
          </Text>
        </TouchableOpacity>

        <Text style={styles.position}>
          Member {selectedIndex + 1} of {members.length}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  container: {
    padding: 16,
    paddingBottom: 40,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  loadingText: {
    fontSize: 16,
    color: '#555',
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },

  emptyText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#16a34a',
    textAlign: 'center',
    marginBottom: 16,
  },

  searchCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },

  searchLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 8,
  },

  searchInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },

  searchCount: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
  },

  memberListCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },

  memberListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  memberListTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#16a34a',
  },

  memberListCount: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#dcfce7',
    color: '#15803d',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 5,
  },

  memberListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },

  selectedMemberRow: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
  },

  memberListNumber: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  memberListNumberText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
  },

  memberListInfo: {
    flex: 1,
  },

  memberListName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },

  memberListMemberNumber: {
    fontSize: 12,
    color: '#64748b',
  },

  selectedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16a34a',
  },

  noSearchResults: {
    textAlign: 'center',
    color: '#64748b',
    paddingVertical: 16,
  },

  memberCard: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },

  photo: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginBottom: 10,
  },

  photoPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  photoText: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: '800',
  },

  memberName: {
    fontSize: 21,
    fontWeight: '800',
    color: '#111827',
  },

  memberNumber: {
    marginTop: 4,
    fontSize: 15,
    color: '#64748b',
  },

  summaryCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },

  summaryLabel: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 6,
  },

  summaryValue: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },

  loanAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
    marginBottom: 8,
  },

  section: {
    marginBottom: 16,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#16a34a',
    marginBottom: 12,
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
  },

  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },

  readOnlyBox: {
    height: 48,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
  },

  readOnlyText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#15803d',
  },

  totalCard: {
    backgroundColor: '#dcfce7',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
  },

  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
  },

  totalAmount: {
    fontSize: 25,
    fontWeight: '900',
    color: '#15803d',
    marginTop: 5,
  },

  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  balanceCard: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fffafa',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
  },

  balanceAmount: {
    fontSize: 23,
    fontWeight: '900',
    color: '#b91c1c',
    marginTop: 5,
  },

  secondaryButton: {
    height: 50,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  secondaryButtonText: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: '800',
  },

  servedBy: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 14,
  },

  executiveName: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginTop: 4,
    marginBottom: 16,
  },

  nextButton: {
    height: 52,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  nextButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  position: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 8,
  },
});

