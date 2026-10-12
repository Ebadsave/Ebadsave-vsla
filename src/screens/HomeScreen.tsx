import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
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
  getFinancialTransactions,
  getLastConcludedMeeting,
  getMembersByGroupId,
  getOpenMeeting,
  type FinancialTransactionRecord,
  type GroupRecord,
  type MemberRecord,
} from '../database/database';

type HomeScreenProps = { navigation: any };
type DetailRow = { label: string; amount?: number; detail?: string; deduction?: boolean };
type CardDetails = { title: string; subtitle: string; rows: DetailRow[]; totalLabel: string; totalValue?: number; note?: string; warning?: string };

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
  loansOut: number;
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
  loansOut: 0,
  members: 0,
  currency: '',
  openMeetingId: null,
  lastClosedMeetingId: null,
};

const money = (currency: string, value: number) => {
  const amount = Number(value || 0).toLocaleString();
  return currency?.trim() ? `${currency.trim()} ${amount}` : amount;
};

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const [activeGroup, setActiveGroup] = useState<GroupRecord | null>(null);
  const [executiveMemberId, setExecutiveMemberId] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [lastMeetingNumber, setLastMeetingNumber] = useState<number | null>(null);
  const [currentMeetingNumber, setCurrentMeetingNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [cardDetailsVisible, setCardDetailsVisible] = useState(false);
  const [cardDetailsLoading, setCardDetailsLoading] = useState(false);
  const [cardDetails, setCardDetails] = useState<CardDetails | null>(null);

  const loadHome = useCallback(async () => {
    try {
      setLoading(true);

      const groups = await getAllGroups();

      const group =
        groups.find(
          (item) => item.status?.toLowerCase() === 'active',
        ) || null;

      setActiveGroup(group);

      if (!group) {
        setExecutiveMemberId(null);
        setDashboard(emptyDashboard);
        setLastMeetingNumber(null);
        setCurrentMeetingNumber(null);
        return;
      }

      const members = await getMembersByGroupId(group.id);

      // updateMemberRoles() stores the general role as 'executive' and the
      // actual post in assigned_roles. Older records may store the post in
      // role directly, so accept both formats without changing any records.
      const executiveRoles = new Set([
        'chairperson',
        'chair',
        'vice chair',
        'vice chairperson',
        'vice-chair',
        'secretary',
        'treasurer',
        'money counter',
        'key keeper',
        'supervisor',
      ]);

      const executive = members.find((member: MemberRecord) => {
        if (member.status?.toLowerCase() !== 'active') return false;

        const legacyRole = member.role?.trim().toLowerCase() || '';
        const assignedPosts = (member.assigned_roles || '')
          .split(',')
          .map((post) => post.trim().toLowerCase())
          .filter(Boolean);

        // Do not treat the generic value 'executive' alone as a post. A
        // member must have an actual executive post assigned.
        // Legacy records may mark the group administrator with is_super_user
        // even when assigned_roles has not been migrated yet. Keep this
        // compatible with that stored role while still requiring an actual
        // executive post for ordinary executive members.
        return Number(member.is_super_user) === 1 ||
          executiveRoles.has(legacyRole) ||
          assignedPosts.some((post) => executiveRoles.has(post));
      });

      setExecutiveMemberId(executive?.id ?? null);

      const summary = await getHomeDashboardSummary(group.id);
      setDashboard(summary);

      // Meeting IDs come from getHomeDashboardSummary().
      // Fetch only the corresponding meeting records when we need their numbers.
      const last = summary.lastClosedMeetingId
        ? await getLastConcludedMeeting(group.id)
        : null;

      const open = summary.openMeetingId
        ? await getOpenMeeting(group.id)
        : null;

      setLastMeetingNumber(last?.meeting_number ?? null);
      setCurrentMeetingNumber(open?.meeting_number ?? null);
    } catch (error) {
      console.error('Failed to load Home dashboard:', error);
      Alert.alert(
        'Home screen error',
        'Unable to load the latest database totals.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHome();
    }, [loadHome]),
  );

  const requireGroup = () => {
    if (!activeGroup) {
      Alert.alert(
        'No Active Group',
        'Please register a group before continuing.',
      );
      return false;
    }

    return true;
  };

  const requireExecutive = () => {
    if (!requireGroup()) return false;

    if (!executiveMemberId) {
      Alert.alert(
        'Executive Required',
        'Please assign an executive role to a member first.',
      );
      return false;
    }

    return true;
  };

  const openAddMembers = () => {
    if (!requireGroup()) return;

    navigation.navigate('AddMembers', {
      groupId: activeGroup!.id,
    });
  };

  const currentMeeting = async () => {
    if (!requireGroup()) return;

    const meeting = await getOpenMeeting(activeGroup!.id);

    if (!meeting) {
      Alert.alert(
        'No Current Meeting',
        'There is no open meeting. Start a new meeting first.',
      );
      return;
    }

    // Return to the meeting control screen so the user can continue roll call
    // and still reach the existing close-meeting checklist.
    navigation.navigate('NewMeeting', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  const previousSummary = async () => {
    if (!requireGroup()) return;

    const meeting = await getLastConcludedMeeting(activeGroup!.id);

    if (!meeting) {
      Alert.alert(
        'No Meeting Summary',
        'No concluded meeting is available yet.',
      );
      return;
    }

    navigation.navigate('MeetingSummary', {
      groupId: activeGroup!.id,
      meetingId: meeting.id,
      meetingNumber: meeting.meeting_number,
    });
  };

  const navigateWithGroup = (
    screen: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (!requireExecutive()) return;

    navigation.navigate(screen, {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
      currency: dashboard.currency,
      ...extra,
    });
  };

  const startMeeting = () => {
    if (!requireExecutive()) return;

    navigation.navigate('NewMeeting', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  const openCardDetails = async (cardKey: 'savings' | 'loansOut' | 'members' | 'loanFund' | 'insuranceFund' | 'fines') => {
    if (!requireGroup()) return;

    const titles: Record<typeof cardKey, string> = {
      savings: 'Total Savings — Breakdown',
      loansOut: 'Loans Out — Breakdown',
      members: 'Members — Details',
      loanFund: 'Loan Fund — Source of Funds',
      insuranceFund: 'Insurance Fund — Breakdown',
      fines: 'Fines Fund — Breakdown',
    };
    setCardDetails({ title: titles[cardKey], subtitle: 'Loading current records…', rows: [], totalLabel: 'Total' });
    setCardDetailsVisible(true);
    setCardDetailsLoading(true);

    try {
      const transactions: FinancialTransactionRecord[] = await getFinancialTransactions(activeGroup!.id);
      const valid = transactions.filter((t) => Number(t.reversed) !== 1);
      const sum = (rows: FinancialTransactionRecord[]) => rows.reduce((total, t) => {
        const amount = Number(t.amount);
        return total + (Number.isFinite(amount) ? amount : 0);
      }, 0);
      const byType = (rows: FinancialTransactionRecord[]): DetailRow[] => {
        const totals = new Map<string, number>();
        for (const transaction of rows) {
          const type = (transaction.transaction_type || 'other_transaction').replace(/_/g, ' ');
          const amount = Number(transaction.amount) || 0;
          totals.set(type, (totals.get(type) || 0) + amount);
        }
        return [...totals.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([label, amount]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), amount, deduction: amount < 0 }));
      };
      const accountRows = (account: string) => valid.filter((t) => t.account_type === account);
      let rows: DetailRow[] = [];
      let totalLabel = 'Current balance';
      let totalValue = 0;
      let subtitle = 'Based on recorded transactions in this group.';
      let note = 'Reversed transactions are excluded. Amounts are taken from the local transaction ledger.';
      let warning: string | undefined;

      if (cardKey === 'members') {
        const members = (await getMembersByGroupId(activeGroup!.id)).filter((m) => m.status?.toLowerCase() === 'active');
        rows = members.map((m) => ({
          label: m.full_name || `Member ${m.member_number}`,
          detail: [m.member_number, m.role || 'Member', m.phone || 'No phone number'].filter(Boolean).join(' • '),
        }));
        totalLabel = 'Active members';
        totalValue = members.length;
        subtitle = 'Active members registered in this group.';
        note = 'Tap Add Members in Group Management to register or update a member.';
      } else if (cardKey === 'savings') {
        const account = accountRows('savings');
        rows = byType(account);
        totalValue = dashboard.savings;
        subtitle = 'Savings transactions grouped by transaction type.';
        note = 'The total shown below is the current Savings balance from the database summary.';
      } else if (cardKey === 'loansOut') {
        const issued = valid.filter((t) => t.account_type === 'loan_fund' && t.transaction_type === 'loan_issued');
        const repayments = valid.filter((t) => t.account_type === 'loan_repayment' && t.transaction_type === 'loan_repayment');
        rows = [
          { label: 'Loans disbursed (recorded)', amount: issued.reduce((n, t) => n + Math.abs(Number(t.amount) || 0), 0) },
          { label: 'Loan repayments received (recorded)', amount: sum(repayments), deduction: true },
        ];
        totalValue = dashboard.loansOut;
        subtitle = 'Outstanding amount owed by members; separate from the Loan Fund cash balance.';
        note = 'The outstanding balance uses the database summary, including recorded interest charges. The rows above show transaction totals and may not sum to the outstanding balance when interest or adjustments apply.';
      } else if (cardKey === 'loanFund') {
        const savings = sum(accountRows('savings'));
        const fines = sum(accountRows('fines').filter((t) => t.transaction_type === 'fine_payment'));
        const repayments = sum(accountRows('loan_repayment'));
        const social = sum(accountRows('social_fund'));
        const external = sum(accountRows('external_fund'));
        const direct = sum(accountRows('loan_fund').filter((t) => t.transaction_type !== 'loan_issued'));
        const issued = accountRows('loan_fund').filter((t) => t.transaction_type === 'loan_issued').reduce((n, t) => n + Math.abs(Number(t.amount) || 0), 0);
        rows = [
          { label: 'Member savings', amount: savings },
          { label: 'Fines actually collected', amount: fines },
          { label: 'Loan repayments received', amount: repayments },
          { label: 'Social fund collections', amount: social },
          { label: 'External funds received', amount: external },
          { label: 'Direct Loan Fund collections / adjustments', amount: direct },
          { label: 'Loan disbursements', amount: issued, deduction: true },
        ];
        const calculated = savings + fines + repayments + social + external + direct - issued;
        totalValue = dashboard.loanFund;
        totalLabel = 'Loan Fund balance (database)';
        subtitle = 'Source of funds using your rule: savings + fines + all other collections − loan disbursements.';
        note = "Insurance contributions are kept separate. Expenditures are not included in this formula; review the group accounting rules if expenditures should also reduce Loan Fund.";
        if (Math.abs(calculated - dashboard.loanFund) > 0.01) warning = `Source calculation: ${money(dashboard.currency, calculated)}. Database Loan Fund: ${money(dashboard.currency, dashboard.loanFund)}. These figures differ; reconcile the ledger before relying on the breakdown.`;
      } else if (cardKey === 'insuranceFund') {
        rows = byType(accountRows('insurance_fund'));
        totalValue = dashboard.insuranceFund;
        subtitle = 'Insurance contributions and adjustments recorded separately from the Loan Fund.';
        note = 'Only transactions assigned to the Insurance Fund account are included in the breakdown.';
      } else {
        const fines = accountRows('fines');
        rows = byType(fines);
        totalValue = dashboard.fines;
        subtitle = 'Fines recorded in the group ledger, including amounts collected and any recorded adjustments.';
        note = 'This balance reflects recorded fine transactions; unpaid fines assessed but not collected may be tracked separately.';
      }

      setCardDetails({ title: titles[cardKey], subtitle, rows, totalLabel, totalValue, note, warning });
    } catch (error) {
      console.error(`Unable to load ${cardKey} card details:`, error);
      Alert.alert('Card details', 'Could not load the latest details. Please try again.');
      setCardDetailsVisible(false);
    } finally {
      setCardDetailsLoading(false);
    }
  };

  const cards = [
    {
      title: 'Total Savings',
      value: money(dashboard.currency, dashboard.savings),
      icon: 'S',
      action: () => openCardDetails('savings'),
    },
    {
      title: 'Loans Out',
      value: money(dashboard.currency, dashboard.loansOut),
      icon: 'L',
      action: () => openCardDetails('loansOut'),
    },
    {
      title: 'Members',
      value: String(dashboard.members),
      icon: 'M',
      action: () => openCardDetails('members'),
    },
    {
      title: 'Loan Fund',
      value: money(dashboard.currency, dashboard.loanFund),
      icon: 'F',
      action: () => openCardDetails('loanFund'),
    },
    {
      title: 'Insurance Fund',
      value: money(dashboard.currency, dashboard.insuranceFund),
      icon: 'I',
      action: () => openCardDetails('insuranceFund'),
    },
    {
      title: 'Fines Fund',
      value: money(dashboard.currency, dashboard.fines),
      icon: 'N',
      action: () => openCardDetails('fines'),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>E</Text>
          </View>

          <View style={styles.titleContainer}>
            <Text style={styles.appName}>Ebadsave VSLA</Text>
            <Text style={styles.tagline}>
              save together,grow together
            </Text>
          </View>
        </View>

        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('Constitution')}
          >
            <Text style={styles.headerButtonText}>Constitution</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={() =>
              requireGroup() &&
              navigation.navigate('SetupRules', {
                groupId: activeGroup!.id,
              })
            }
          >
            <Text style={styles.headerButtonText}>Setup Rules</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('BackupRestore')}
          >
            <Text style={styles.headerButtonText}>Backup & Restore</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.groupTitle}>
          {activeGroup
            ? `KYA ${activeGroup.group_number} • ${activeGroup.group_name}`
            : 'No active group'}
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open Backup and Restore"
          style={styles.backupRestoreAction}
          onPress={() => navigation.navigate('BackupRestore')}
          activeOpacity={0.85}
        >
          <Text style={styles.backupRestoreActionTitle}>Backup & Restore</Text>
          <Text style={styles.backupRestoreActionSubtitle}>
            Save a backup or restore a verified backup file
          </Text>
        </TouchableOpacity>

        <View style={styles.cardsGrid}>
          {cards.map((card) => (
            <TouchableOpacity
              key={card.title}
              style={styles.card}
              onPress={card.action}
              activeOpacity={0.8}
            >
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>{card.icon}</Text>
              </View>

              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardValue}>{card.value}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.meetingPanel}>
          <Text style={styles.sectionTitle}>Meeting</Text>

          {dashboard.openMeetingId ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={currentMeeting}
            >
              <Text style={styles.primaryButtonText}>
                Current Meeting
              </Text>

              <Text style={styles.buttonSubtext}>
                Resume meeting #{currentMeetingNumber ?? 'open'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={startMeeting}
            >
              <Text style={styles.primaryButtonText}>
                Start New Meeting
              </Text>

              <Text style={styles.buttonSubtext}>
                Register and continue with a new meeting
              </Text>
            </TouchableOpacity>
          )}

          {dashboard.lastClosedMeetingId && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={previousSummary}
            >
              <Text style={styles.secondaryButtonText}>
                Read Previous Meeting Summary
                {lastMeetingNumber ? ` #${lastMeetingNumber}` : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.activityContainer}>
          <Text style={styles.sectionTitle}>Database Status</Text>

          <View style={styles.statusBox}>
            <Text style={styles.statusText}>
              {loading
                ? 'Updating database totals…'
                : 'Home totals are linked to the database.'}
            </Text>

            <Text style={styles.statusText}>
              Loan fund: {money(dashboard.currency, dashboard.loanFund)}
            </Text>

            <Text style={styles.statusText}>
              Insurance:{' '}
              {money(dashboard.currency, dashboard.insuranceFund)}
            </Text>

            <Text style={styles.statusText}>
              Fines: {money(dashboard.currency, dashboard.fines)}
            </Text>
          </View>
        </View>

        <View style={styles.navigationSection}>
          <Text style={styles.sectionTitle}>Group Management</Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={openAddMembers}
          >
            <Text style={styles.actionButtonText}>Add Members</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigateWithGroup('MemberCollection')}
          >
            <Text style={styles.actionButtonText}>
              Member Collection
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigateWithGroup('Expenditure')}
          >
            <Text style={styles.actionButtonText}>Expenditure</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={cardDetailsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCardDetailsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.loanFundModal}>
            <Text style={styles.modalTitle}>{cardDetails?.title || 'Card details'}</Text>
            <Text style={styles.modalSubtitle}>{cardDetails?.subtitle || 'Details from your group records.'}</Text>

            {cardDetailsLoading ? (
              <Text style={styles.modalLoading}>Loading records…</Text>
            ) : (
              <ScrollView style={styles.breakdownList}>
                {cardDetails?.rows.length ? cardDetails.rows.map((row, index) => (
                  <View key={`${row.label}-${index}`} style={styles.breakdownRow}>
                    <View style={styles.breakdownRowText}>
                      <Text style={styles.breakdownLabel}>{row.label}</Text>
                      {row.detail ? <Text style={styles.breakdownDetail}>{row.detail}</Text> : null}
                    </View>
                    {typeof row.amount === 'number' ? (
                      <Text style={[styles.breakdownAmount, (row.deduction || row.amount < 0) && styles.deductionAmount]}>
                        {row.amount < 0 ? '− ' : ''}{money(dashboard.currency, Math.abs(row.amount))}
                      </Text>
                    ) : null}
                  </View>
                )) : (
                  <Text style={styles.modalLoading}>No matching records found.</Text>
                )}
                <View style={styles.breakdownDivider} />
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownTotalLabel}>{cardDetails?.totalLabel || 'Total'}</Text>
                  {typeof cardDetails?.totalValue === 'number' ? (
                    <Text style={styles.breakdownTotalAmount}>
                      {cardDetails?.title.startsWith('Members') ? String(cardDetails.totalValue) : money(dashboard.currency, cardDetails.totalValue)}
                    </Text>
                  ) : null}
                </View>
                {cardDetails?.warning ? <Text style={styles.breakdownWarning}>{cardDetails.warning}</Text> : null}
                {cardDetails?.note ? <Text style={styles.modalNote}>{cardDetails.note}</Text> : null}
              </ScrollView>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              style={styles.modalCloseButton}
              onPress={() => setCardDetailsVisible(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

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
    backgroundColor: '#fff',
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
    color: '#fff',
  },

  tagline: {
    marginTop: 2,
    fontSize: 12,
    color: '#fff',
  },

  headerButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },

  headerButton: {
    backgroundColor: '#fff',
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
    paddingBottom: 32,
  },

  groupTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 12,
  },

  backupRestoreAction: {
    backgroundColor: '#ecfdf5',
    borderColor: '#16a34a',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 14,
  },

  backupRestoreActionTitle: {
    color: '#166534',
    fontSize: 15,
    fontWeight: '800',
  },

  backupRestoreActionSubtitle: {
    color: '#166534',
    fontSize: 12,
    marginTop: 3,
  },

  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  card: {
    width: '48%',
    backgroundColor: '#fff',
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
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },

  iconText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#16a34a',
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

  meetingPanel: {
    marginTop: 8,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },

  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },

  buttonSubtext: {
    color: '#dcfce7',
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
    marginBottom: 5,
  },

  navigationSection: {
    marginTop: 22,
  },

  actionButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: 18,
  },
  loanFundModal: {
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#166534',
  },
  modalSubtitle: {
    marginTop: 5,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 19,
    color: '#4b5563',
  },
  modalLoading: {
    paddingVertical: 22,
    color: '#374151',
  },
  breakdownList: {
    flexShrink: 1,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  breakdownRowText: {
    flex: 1,
    minWidth: 0,
  },
  breakdownDetail: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    color: '#6b7280',
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#374151',
  },
  breakdownAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'right',
  },
  deductionAmount: {
    color: '#b91c1c',
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: '#9ca3af',
    marginTop: 7,
  },
  breakdownTotalLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
  },
  breakdownTotalAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#166534',
    textAlign: 'right',
  },
  breakdownWarning: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    fontSize: 12,
    lineHeight: 17,
  },
  modalNote: {
    marginTop: 12,
    marginBottom: 6,
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 17,
  },
  modalCloseButton: {
    marginTop: 12,
    backgroundColor: '#16a34a',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});
