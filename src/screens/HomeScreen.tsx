import React, { useCallback, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import {
  getAllGroups,
  getHomeDashboardSummary,
  getLastConcludedMeeting,
  getMembersByGroupId,
  getOpenMeeting,
  isMeetingRollCallComplete,
  type GroupRecord,
  type MemberRecord,
} from '../database/database';

type HomeScreenProps = {
  navigation: any;
};

type Dashboard = {
  savings: number;
  loanFund: number;
  loanRepayment: number;
  socialFund: number;
  fines: number;
  externalFund: number;
  expenditureFund: number;
  insuranceFund: number;
  fundBalance: number;
  members: number;
  currency: string;
  openMeetingId: number | null;
  lastClosedMeetingId: number | null;
};

const emptyDashboard: Dashboard = {
  savings: 0,
  loanFund: 0,
  loanRepayment: 0,
  socialFund: 0,
  fines: 0,
  externalFund: 0,
  expenditureFund: 0,
  insuranceFund: 0,
  fundBalance: 0,
  members: 0,
  currency: 'UGX',
  openMeetingId: null,
  lastClosedMeetingId: null,
};

const money = (currency: string, value: number) =>
  `${currency} ${Number(value || 0).toLocaleString()}`;

export default function HomeScreen({
  navigation,
}: HomeScreenProps) {
  const [activeGroup, setActiveGroup] =
    useState<GroupRecord | null>(null);

  const [executiveMemberId, setExecutiveMemberId] =
    useState<number | null>(null);

  const [openMeeting, setOpenMeeting] =
    useState<any | null>(null);

  const [dashboard, setDashboard] =
    useState<Dashboard>(emptyDashboard);

  const [lastMeeting, setLastMeeting] =
    useState<any | null>(null);

  const [loading, setLoading] =
    useState(false);

  /*
   * ============================================================
   * LOAD LIVE HOME DATA FROM DATABASE
   * ============================================================
   */
  const loadHome = useCallback(async () => {
    try {
      setLoading(true);

      const groups = await getAllGroups();

      const group =
        groups.find(
          (item) =>
            String(item.status).toLowerCase() === 'active',
        ) || null;

      if (!group) {
        setActiveGroup(null);
        setExecutiveMemberId(null);
        setOpenMeeting(null);
        setLastMeeting(null);
        setDashboard(emptyDashboard);
        return;
      }

      setActiveGroup(group);

      /*
       * Load active members.
       */
      const members =
        await getMembersByGroupId(group.id);

      const activeMembers = members.filter(
        (member: MemberRecord) =>
          String(member.status).toLowerCase() === 'active',
      );

      /*
       * Find executive.
       */
      const executive = activeMembers.find(
        (member: MemberRecord) =>
          String(member.role).toLowerCase() === 'executive',
      );

      setExecutiveMemberId(
        executive?.id ?? null,
      );

      /*
       * Load live financial totals.
       */
      const summary =
        await getHomeDashboardSummary(group.id);

      setDashboard({
        ...emptyDashboard,
        ...summary,
        members: activeMembers.length,
      });

      /*
       * Load currently open meeting.
       */
      const meeting =
        await getOpenMeeting(group.id);

      setOpenMeeting(meeting);

      /*
       * Load most recently closed meeting.
       */
      const previous =
        await getLastConcludedMeeting(group.id);

      setLastMeeting(previous);
    } catch (error) {
      console.error(
        'Failed to load Home dashboard:',
        error,
      );

      Alert.alert(
        'Home Screen',
        error instanceof Error
          ? error.message
          : 'Unable to load the latest database information.',
      );

      setActiveGroup(null);
      setExecutiveMemberId(null);
      setOpenMeeting(null);
      setLastMeeting(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /*
   * Refresh every time Home becomes active.
   * This means returning from Savings, Loans,
   * Fines, Expenditure, Meeting, etc. refreshes totals.
   */
  useFocusEffect(
    useCallback(() => {
      loadHome();
    }, [loadHome]),
  );

  /*
   * ============================================================
   * REQUIREMENTS
   * ============================================================
   */

  const requireGroup = (): boolean => {
    if (!activeGroup) {
      Alert.alert(
        'No Active Group',
        'Please register a group before continuing.',
      );

      return false;
    }

    return true;
  };

  const requireExecutive = (): boolean => {
    if (!requireGroup()) {
      return false;
    }

    if (!executiveMemberId) {
      Alert.alert(
        'Executive Required',
        'Please assign an executive member before continuing.',
      );

      return false;
    }

    return true;
  };

  const requireOpenMeeting = (): boolean => {
    if (!requireExecutive()) {
      return false;
    }

    if (!openMeeting) {
      Alert.alert(
        'No Current Meeting',
        'Please start a new meeting before recording transactions.',
      );

      return false;
    }

    return true;
  };

  /*
   * ============================================================
   * GROUP / SETTINGS
   * ============================================================
   */

  const handleConstitution = () => {
    navigation.navigate('Constitution');
  };

  const handleSetupRules = () => {
    if (!requireGroup()) return;

    navigation.navigate('SetupRules', {
      groupId: activeGroup!.id,
    });
  };

  const handleBackupRestore = () => {
    navigation.navigate('BackupRestore');
  };

  /*
   * ============================================================
   * MEMBERS
   * ============================================================
   */

  const handleAddMembers = () => {
    if (!requireGroup()) return;

    navigation.navigate('AddMembers', {
      groupId: activeGroup!.id,
    });
  };

  /*
   * ============================================================
   * NEW MEETING
   * ============================================================
   */

  const handleNewMeeting = () => {
    if (!requireExecutive()) return;

    /*
     * Never create Meeting 2 while Meeting 1 is still open.
     */
    if (openMeeting) {
      Alert.alert(
        'Meeting Already Open',
        `Meeting #${openMeeting.meeting_number ?? ''} is still open. Continue the current meeting instead of starting another one.`,
      );

      return;
    }

    navigation.navigate('NewMeeting', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  /*
   * ============================================================
   * CURRENT MEETING
   * ============================================================
   *
   * Flow:
   *
   * Home
   *   ↓
   * Current Meeting
   *   ↓
   * Roll Call if incomplete
   *   ↓
   * Financial Transactions
   *
   * The same meetingId is passed all the way through.
   */
  const handleCurrentMeeting = async () => {
    if (!requireExecutive()) return;

    /*
     * Refresh the meeting directly from DB so Home never
     * uses a stale meeting object.
     */
    const meeting =
      await getOpenMeeting(activeGroup!.id);

    if (!meeting) {
      setOpenMeeting(null);

      Alert.alert(
        'No Current Meeting',
        'There is no open meeting. Start a new meeting first.',
      );

      return;
    }

    setOpenMeeting(meeting);

    try {
      const rollCallComplete =
        await isMeetingRollCallComplete(
          meeting.id,
        );

      if (!rollCallComplete) {
        navigation.navigate('MeetingRollCall', {
          groupId: activeGroup!.id,
          meetingId: meeting.id,
          executiveMemberId: executiveMemberId!,
        });

        return;
      }

      navigation.navigate(
        'FinancialTransactions',
        {
          groupId: activeGroup!.id,
          meetingId: meeting.id,
          executiveMemberId: executiveMemberId!,
          currency: dashboard.currency,
        },
      );
    } catch (error) {
      Alert.alert(
        'Unable to Continue Meeting',
        error instanceof Error
          ? error.message
          : 'The current meeting could not be opened.',
      );
    }
  };

  /*
   * ============================================================
   * PREVIOUS MEETING
   * ============================================================
   */

  const handlePreviousMeeting = () => {
    if (!requireGroup()) return;

    if (!lastMeeting) {
      Alert.alert(
        'No Previous Meeting',
        'There is no concluded meeting yet.',
      );

      return;
    }

    navigation.navigate('MeetingSummary', {
      groupId: activeGroup!.id,
      meetingId: lastMeeting.id,
      meetingNumber:
        lastMeeting.meeting_number,
    });
  };

  /*
   * ============================================================
   * TRANSACTION SCREENS
   * ============================================================
   */

  const handleSavings = () => {
    if (!requireOpenMeeting()) return;

    navigation.navigate('Savings', {
      groupId: activeGroup!.id,
      meetingId: openMeeting!.id,
      executiveMemberId: executiveMemberId!,
      currency: dashboard.currency,
    });
  };

  const handleLoanDisbursement = () => {
    if (!requireOpenMeeting()) return;

    navigation.navigate('LoanDisbursement', {
      groupId: activeGroup!.id,
      meetingId: openMeeting!.id,
      executiveMemberId: executiveMemberId!,
      currency: dashboard.currency,
    });
  };

  const handleFines = () => {
    if (!requireOpenMeeting()) return;

    navigation.navigate('Fines', {
      groupId: activeGroup!.id,
      meetingId: openMeeting!.id,
      executiveMemberId: executiveMemberId!,
      currency: dashboard.currency,
    });
  };

  const handleInsurance = () => {
    if (!requireOpenMeeting()) return;

    navigation.navigate('Insurance', {
      groupId: activeGroup!.id,
      meetingId: openMeeting!.id,
      executiveMemberId: executiveMemberId!,
      currency: dashboard.currency,
    });
  };

  const handleExternalFunds = () => {
    if (!requireOpenMeeting()) return;

    navigation.navigate('ExternalFunds', {
      groupId: activeGroup!.id,
      meetingId: openMeeting!.id,
      executiveMemberId: executiveMemberId!,
      currency: dashboard.currency,
    });
  };

  const handleRepayment = () => {
    if (!requireOpenMeeting()) return;

    navigation.navigate('Repayment', {
      groupId: activeGroup!.id,
      meetingId: openMeeting!.id,
      executiveMemberId: executiveMemberId!,
      currency: dashboard.currency,
    });
  };

  const handleLoans = () => {
    if (!requireGroup()) return;

    navigation.navigate('Loans', {
      groupId: activeGroup!.id,
      meetingId: openMeeting?.id ?? null,
      executiveMemberId:
        executiveMemberId ?? undefined,
      currency: dashboard.currency,
    });
  };

  const handleMiscellaneousExpense = () => {
    if (!requireOpenMeeting()) return;

    navigation.navigate(
      'MiscellaneousExpense',
      {
        groupId: activeGroup!.id,
        meetingId: openMeeting!.id,
        executiveMemberId: executiveMemberId!,
        currency: dashboard.currency,
      },
    );
  };

  const handleExpenditure = () => {
    if (!requireOpenMeeting()) return;

    navigation.navigate('Expenditure', {
      groupId: activeGroup!.id,
      meetingId: openMeeting!.id,
      executiveMemberId: executiveMemberId!,
      currency: dashboard.currency,
    });
  };

  /*
   * ============================================================
   * DASHBOARD CARDS
   * ============================================================
   */

  const handleSavingsCard = () => {
    handleSavings();
  };

  const handleLoansCard = () => {
    handleLoans();
  };

  const handleMembersCard = () => {
    handleAddMembers();
  };

  const handleFundCard = () => {
    if (!requireOpenMeeting()) return;

    navigation.navigate(
      'FinancialTransactions',
      {
        groupId: activeGroup!.id,
        meetingId: openMeeting!.id,
        executiveMemberId: executiveMemberId!,
        currency: dashboard.currency,
      },
    );
  };

  const handleInsuranceCard = () => {
    handleInsurance();
  };

  const handleFinesCard = () => {
    handleFines();
  };

  const cards = [
    {
      title: 'Total Savings',
      value: money(
        dashboard.currency,
        dashboard.savings,
      ),
      icon: 'S',
      iconBackground: '#dcfce7',
      iconColor: '#16a34a',
      action: handleSavingsCard,
    },
    {
      title: 'Loans Out',
      value: money(
        dashboard.currency,
        dashboard.loanFund,
      ),
      icon: 'L',
      iconBackground: '#ffedd5',
      iconColor: '#f97316',
      action: handleLoansCard,
    },
    {
      title: 'Members',
      value: String(dashboard.members),
      icon: 'M',
      iconBackground: '#dbeafe',
      iconColor: '#2563eb',
      action: handleMembersCard,
    },
    {
      title: 'Fund Balance',
      value: money(
        dashboard.currency,
        dashboard.fundBalance,
      ),
      icon: 'F',
      iconBackground: '#dcfce7',
      iconColor: '#166534',
      action: handleFundCard,
    },
    {
      title: 'Insurance Fund',
      value: money(
        dashboard.currency,
        dashboard.insuranceFund,
      ),
      icon: 'I',
      iconBackground: '#fee2e2',
      iconColor: '#dc2626',
      action: handleInsuranceCard,
    },
    {
      title: 'Fines Fund',
      value: money(
        dashboard.currency,
        dashboard.fines,
      ),
      icon: 'N',
      iconBackground: '#ffffff',
      iconColor: '#374151',
      action: handleFinesCard,
    },
  ];

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>E</Text>
          </View>

          <View style={styles.titleContainer}>
            <Text style={styles.appName}>
              Ebadsave VSLA
            </Text>

            <Text style={styles.tagline}>
              save together,grow together
            </Text>
          </View>
        </View>

        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleConstitution}
            activeOpacity={0.8}
          >
            <Text style={styles.headerButtonText}>
              Constitution
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleSetupRules}
            activeOpacity={0.8}
          >
            <Text style={styles.headerButtonText}>
              Setup Rules
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleBackupRestore}
            activeOpacity={0.8}
          >
            <Text style={styles.headerButtonText}>
              Backup
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* GROUP */}
        <View style={styles.groupBox}>
          <Text style={styles.groupTitle}>
            {activeGroup
              ? `KYA ${activeGroup.group_number} • ${activeGroup.group_name}`
              : 'No active group'}
          </Text>

          {activeGroup && (
            <Text style={styles.groupLocation}>
              {activeGroup.district},{' '}
              {activeGroup.country}
            </Text>
          )}
        </View>

        {/* DASHBOARD CARDS */}
        <View style={styles.cardsGrid}>
          {cards.map((card) => (
            <TouchableOpacity
              key={card.title}
              style={styles.card}
              onPress={card.action}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor:
                      card.iconBackground,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.iconText,
                    {
                      color: card.iconColor,
                    },
                  ]}
                >
                  {card.icon}
                </Text>
              </View>

              <Text style={styles.cardTitle}>
                {card.title}
              </Text>

              <Text style={styles.cardValue}>
                {card.value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* MEETING */}
        <View style={styles.navigationSection}>
          <Text style={styles.sectionTitle}>
            Meeting
          </Text>

          {!openMeeting ? (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleNewMeeting}
              activeOpacity={0.8}
            >
              <Text style={styles.actionButtonText}>
                Start New Meeting
              </Text>

              <Text style={styles.buttonSubtext}>
                Create the next meeting
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.currentMeetingButton}
              onPress={handleCurrentMeeting}
              activeOpacity={0.8}
            >
              <Text
                style={
                  styles.currentMeetingButtonText
                }
              >
                Current Meeting
              </Text>

              <Text
                style={styles.currentMeetingSubtext}
              >
                Resume Meeting #
                {openMeeting.meeting_number ?? ''}
              </Text>
            </TouchableOpacity>
          )}

          {lastMeeting && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handlePreviousMeeting}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>
                Previous Meeting
                {lastMeeting.meeting_number
                  ? ` #${lastMeeting.meeting_number}`
                  : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* DATABASE STATUS */}
        <View style={styles.activityContainer}>
          <Text style={styles.sectionTitle}>
            Database Status
          </Text>

          <View style={styles.statusBox}>
            <Text style={styles.statusText}>
              {loading
                ? 'Updating database totals...'
                : 'Home is connected to the database.'}
            </Text>

            <Text style={styles.statusText}>
              Current currency:{' '}
              {dashboard.currency}
            </Text>

            <Text style={styles.statusText}>
              Savings:{' '}
              {money(
                dashboard.currency,
                dashboard.savings,
              )}
            </Text>

            <Text style={styles.statusText}>
              Loan fund:{' '}
              {money(
                dashboard.currency,
                dashboard.loanFund,
              )}
            </Text>

            <Text style={styles.statusText}>
              Fines:{' '}
              {money(
                dashboard.currency,
                dashboard.fines,
              )}
            </Text>

            <Text style={styles.statusText}>
              Insurance:{' '}
              {money(
                dashboard.currency,
                dashboard.insuranceFund,
              )}
            </Text>
          </View>
        </View>

        {/* MEMBERS */}
        <View style={styles.navigationSection}>
          <Text style={styles.sectionTitle}>
            Group Management
          </Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleAddMembers}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              Members
            </Text>
          </TouchableOpacity>
        </View>

        {/* FINANCIAL ACTIONS */}
        <View style={styles.navigationSection}>
          <Text style={styles.sectionTitle}>
            Financial Transactions
          </Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSavings}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              Savings
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleLoanDisbursement}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              Loan Disbursement
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleRepayment}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              Loan Repayment
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleFines}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              Fines
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleInsurance}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              Insurance
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleExternalFunds}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              External Funds
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleLoans}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              Loans
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleMiscellaneousExpense}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              Miscellaneous Expense
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleExpenditure}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>
              Expenditure
            </Text>
          </TouchableOpacity>
        </View>

        {/* REFRESH */}
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={loadHome}
          activeOpacity={0.8}
        >
          <Text style={styles.refreshButtonText}>
            Refresh Dashboard
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

  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },

  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  logo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  logoText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#16a34a',
  },

  titleContainer: {
    marginLeft: 12,
  },

  appName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },

  tagline: {
    marginTop: 2,
    fontSize: 12,
    color: '#ffffff',
  },

  headerButtons: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
    flexWrap: 'wrap',
  },

  headerButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },

  headerButtonText: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '700',
  },

  content: {
    padding: 16,
    paddingBottom: 40,
  },

  groupBox: {
    marginBottom: 14,
  },

  groupTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#166534',
  },

  groupLocation: {
    marginTop: 3,
    fontSize: 13,
    color: '#6b7280',
  },

  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  card: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },

  iconText: {
    fontSize: 17,
    fontWeight: '800',
  },

  cardTitle: {
    fontSize: 13,
    color: '#374151',
  },

  cardValue: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },

  navigationSection: {
    marginTop: 22,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },

  actionButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  actionButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },

  buttonSubtext: {
    color: '#dcfce7',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },

  currentMeetingButton: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  currentMeetingButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },

  currentMeetingSubtext: {
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },

  secondaryButton: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  secondaryButtonText: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },

  activityContainer: {
    marginTop: 12,
  },

  statusBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
  },

  statusText: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 6,
  },

  refreshButton: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },

  refreshButtonText: {
    color: '#16a34a',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
