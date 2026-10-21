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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

import {
  getAllGroups,
  getHomeDashboardSummary,
  getLastConcludedMeeting,
  getMembersByGroupId,
  getOpenMeeting,
  type GroupRecord,
  type MemberRecord,
} from '../database/database';

type HomeScreenProps = {
  navigation: any;
  route?: any;
};

// Keep one explicit selection so the group name on screen and all data queries
// always use the same group, including after navigating away and returning.
export const ACTIVE_GROUP_STORAGE_KEY = '@ebadsave/activeGroupId';

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
  // Currency is loaded from the active group's configured currency.
  currency: '',
  openMeetingId: null,
  lastClosedMeetingId: null,
};

const money = (currency: string, value: number) => {
  const amount = Number(value || 0).toLocaleString();
  return currency?.trim() ? `${currency.trim()} ${amount}` : amount;
};

export default function HomeScreen({ navigation, route }: HomeScreenProps) {
  const routeGroupId = typeof route?.params?.groupId === 'number'
    ? route.params.groupId
    : undefined;
  const [activeGroup, setActiveGroup] = useState<GroupRecord | null>(null);
  const [availableGroups, setAvailableGroups] = useState<GroupRecord[]>([]);
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);
  const [executiveMemberId, setExecutiveMemberId] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [lastMeetingNumber, setLastMeetingNumber] = useState<number | null>(null);
  const [currentMeetingNumber, setCurrentMeetingNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const loadHome = useCallback(async (preferredGroupId?: number) => {
    try {
      setLoading(true);

      const [allGroups, savedGroupId] = await Promise.all([
        getAllGroups(),
        AsyncStorage.getItem(ACTIVE_GROUP_STORAGE_KEY),
      ]);
      const activeGroups = allGroups.filter(
        (item) => item.status?.toLowerCase() === 'active',
      );
      setAvailableGroups(activeGroups);

      const storedId = savedGroupId ? Number(savedGroupId) : NaN;
      const requestedId = preferredGroupId ?? storedId;
      const group = activeGroups.find(
        (item) => item.id === requestedId,
      ) || activeGroups[0] || null;

      setActiveGroup(group);
      // Never leave the previous group's totals visible under the new name
      // while the selected group's records are loading.
      setDashboard(emptyDashboard);
      setExecutiveMemberId(null);
      setLastMeetingNumber(null);
      setCurrentMeetingNumber(null);

      if (!group) {
        return;
      }

      // Persist the exact group used to load the dashboard. Do not infer the
      // selected group from the first database row on subsequent visits.
      await AsyncStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, String(group.id));

      const members = await getMembersByGroupId(group.id);
      const executive = members.find(
        (member: MemberRecord) =>
          member.status?.toLowerCase() === 'active' &&
          (member.role?.toLowerCase() === 'executive' || Number(member.is_super_user ?? 0) === 1),
      );
      setExecutiveMemberId(executive?.id ?? null);

      const summary = await getHomeDashboardSummary(group.id);
      setDashboard(summary);

      // All meeting details are looked up using the same selected group ID.
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
      Alert.alert('Home screen error', 'Unable to load the selected group and its database totals.');
    } finally {
      setLoading(false);
    }
  }, []);

  const switchToGroup = async (group: GroupRecord) => {
    try {
      setGroupPickerVisible(false);
      await AsyncStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, String(group.id));
      await loadHome(group.id);
    } catch (error) {
      console.error('Failed to switch group:', error);
      Alert.alert('Group switch failed', 'Could not switch to the selected group. Please try again.');
    }
  };

  useFocusEffect(
    useCallback(() => {
      let focused = true;

      const loadRequestedGroup = async () => {
        // Constitution passes groupId when a user explicitly opens a group.
        // Consume that request after it is loaded so it does not override a
        // later manual switch when returning from another screen.
        await loadHome(routeGroupId);
        if (focused && routeGroupId !== undefined) {
          navigation.setParams?.({ groupId: undefined });
        }
      };

      void loadRequestedGroup();
      return () => {
        focused = false;
      };
    }, [loadHome, navigation, routeGroupId]),
  );

  const requireGroup = () => {
    if (!activeGroup) {
      Alert.alert('No Active Group', 'Please register a group before continuing.');
      return false;
    }
    return true;
  };

  const requireExecutive = () => {
    if (!requireGroup()) return false;
    if (!executiveMemberId) {
      Alert.alert('Executive Required', 'Please assign an executive member first.');
      return false;
    }
    return true;
  };

  const openAddMembers = () => {
    if (!requireGroup()) return;
    navigation.navigate('AddMembers', { groupId: activeGroup!.id });
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

    navigation.navigate('FinancialTransactions', {
      groupId: activeGroup!.id,
      meetingId: meeting.id,
      currency: dashboard.currency,
    });
  };

  const previousSummary = async () => {
    if (!requireGroup()) return;
    const meeting = await getLastConcludedMeeting(activeGroup!.id);
    if (!meeting) {
      Alert.alert('No Meeting Summary', 'No concluded meeting is available yet.');
      return;
    }

    navigation.navigate('MeetingSummary', {
      groupId: activeGroup!.id,
      meetingId: meeting.id,
      meetingNumber: meeting.meeting_number,
    });
  };

  const navigateWithGroup = (screen: string, extra: Record<string, unknown> = {}) => {
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

  const cards = [
    { title: 'Total Savings', value: money(dashboard.currency, dashboard.savings), icon: 'S', action: () => navigateWithGroup('FinancialTransactions') },
    { title: 'Loans Out', value: money(dashboard.currency, dashboard.loansOut), icon: 'L', action: () => navigateWithGroup('Loans') },
    { title: 'Members', value: String(dashboard.members), icon: 'M', action: openAddMembers },
    { title: 'Fund Balance', value: money(dashboard.currency, dashboard.fundBalance), icon: 'F', action: () => navigateWithGroup('FinancialTransactions') },
    { title: 'Insurance Fund', value: money(dashboard.currency, dashboard.insuranceFund), icon: 'I', action: () => navigateWithGroup('Insurance') },
    { title: 'Fines Fund', value: money(dashboard.currency, dashboard.fines), icon: 'N', action: () => navigateWithGroup('Fines') },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <View style={styles.logo}><Text style={styles.logoText}>E</Text></View>
          <View style={styles.titleContainer}>
            <Text style={styles.appName}>Ebadsave VSLA</Text>
            <Text style={styles.tagline}>save together,grow together</Text>
          </View>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.navigate('Constitution')}>
            <Text style={styles.headerButtonText}>Constitution</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => requireGroup() && navigation.navigate('SetupRules', { groupId: activeGroup!.id })}>
            <Text style={styles.headerButtonText}>Setup Rules</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.groupSwitcherRow}>
          <View style={styles.groupTitleArea}>
            <Text style={styles.groupTitle}>
              {activeGroup ? `KYA ${activeGroup.group_number} • ${activeGroup.group_name}` : 'No active group'}
            </Text>
            {activeGroup ? (
              <Text style={styles.groupSubtitle}>
                {activeGroup.district}, {activeGroup.country}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.switchGroupButton}
            onPress={() => setGroupPickerVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.switchGroupButtonText}>Switch group ▾</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardsGrid}>
          {cards.map((card) => (
            <TouchableOpacity key={card.title} style={styles.card} onPress={card.action} activeOpacity={0.8}>
              <View style={styles.iconCircle}><Text style={styles.iconText}>{card.icon}</Text></View>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardValue}>{card.value}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.meetingPanel}>
          <Text style={styles.sectionTitle}>Meeting</Text>
          {dashboard.openMeetingId ? (
            <TouchableOpacity style={styles.primaryButton} onPress={currentMeeting}>
              <Text style={styles.primaryButtonText}>Current Meeting</Text>
              <Text style={styles.buttonSubtext}>Resume meeting #{currentMeetingNumber ?? 'open'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.primaryButton} onPress={startMeeting}>
              <Text style={styles.primaryButtonText}>Start New Meeting</Text>
              <Text style={styles.buttonSubtext}>Register and continue with a new meeting</Text>
            </TouchableOpacity>
          )}

          {dashboard.lastClosedMeetingId && (
            <TouchableOpacity style={styles.secondaryButton} onPress={previousSummary}>
              <Text style={styles.secondaryButtonText}>
                Read Previous Meeting Summary{lastMeetingNumber ? ` #${lastMeetingNumber}` : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.activityContainer}>
          <Text style={styles.sectionTitle}>Database Status</Text>
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{loading ? 'Updating database totals…' : 'Home totals are linked to the database.'}</Text>
            <Text style={styles.statusText}>Loan fund: {money(dashboard.currency, dashboard.loanFund)}</Text>
            <Text style={styles.statusText}>Insurance: {money(dashboard.currency, dashboard.insuranceFund)}</Text>
            <Text style={styles.statusText}>Fines: {money(dashboard.currency, dashboard.fines)}</Text>
          </View>
        </View>

        <View style={styles.navigationSection}>
          <Text style={styles.sectionTitle}>Group Management</Text>
          <TouchableOpacity style={styles.actionButton} onPress={openAddMembers}><Text style={styles.actionButtonText}>Add Members</Text></TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => navigateWithGroup('HistoricalRecords')}><Text style={styles.actionButtonText}>Enter Historical Passbook Records</Text></TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => navigateWithGroup('ShareOutCalculation')}><Text style={styles.actionButtonText}>Share-out Calculation Preview</Text></TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => navigateWithGroup('MemberCollection')}><Text style={styles.actionButtonText}>Member Collection</Text></TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => navigateWithGroup('Expenditure')}><Text style={styles.actionButtonText}>Expenditure</Text></TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={groupPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.groupPickerCard}>
            <Text style={styles.groupPickerTitle}>Switch group</Text>
            <Text style={styles.groupPickerDescription}>
              Choose a registered active group. The dashboard and next screens will use only that group’s data.
            </Text>

            {availableGroups.length === 0 ? (
              <Text style={styles.noGroupsText}>No active registered groups were found.</Text>
            ) : (
              <ScrollView style={styles.groupPickerList} keyboardShouldPersistTaps="handled">
                {availableGroups.map((group) => {
                  const selected = group.id === activeGroup?.id;
                  return (
                    <TouchableOpacity
                      key={group.id}
                      style={[styles.groupOption, selected && styles.groupOptionSelected]}
                      onPress={() => void switchToGroup(group)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.groupOptionText}>
                        <Text style={styles.groupOptionNumber}>KYA {group.group_number}</Text>
                        <Text style={styles.groupOptionName}>{group.group_name}</Text>
                        <Text style={styles.groupOptionLocation}>{group.district}, {group.country}</Text>
                      </View>
                      <Text style={styles.groupOptionStatus}>{selected ? 'CURRENT' : 'SELECT'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.cancelPickerButton}
              onPress={() => setGroupPickerVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelPickerText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  headerInfo: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  logoText: { fontSize: 26, fontWeight: '800', color: '#16a34a' },
  titleContainer: { marginLeft: 12 },
  appName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  tagline: { marginTop: 2, fontSize: 12, color: '#fff' },
  headerButtons: { flexDirection: 'row', marginTop: 12, gap: 8 },
  headerButton: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  headerButtonText: { color: '#16a34a', fontSize: 13, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 32 },
  groupSwitcherRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 },
  groupTitleArea: { flex: 1 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: '#166534' },
  groupSubtitle: { fontSize: 12, color: '#64748b', marginTop: 4 },
  switchGroupButton: { backgroundColor: '#dcfce7', borderColor: '#86efac', borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10 },
  switchGroupButtonText: { color: '#166534', fontWeight: '800', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', padding: 20 },
  groupPickerCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 18, maxHeight: '85%' },
  groupPickerTitle: { color: '#14532d', fontSize: 21, fontWeight: '800' },
  groupPickerDescription: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 12 },
  groupPickerList: { flexGrow: 0, flexShrink: 1 },
  groupOption: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 11, padding: 12, marginTop: 8, backgroundColor: '#ffffff' },
  groupOptionSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  groupOptionText: { flex: 1, paddingRight: 8 },
  groupOptionNumber: { color: '#16a34a', fontSize: 12, fontWeight: '800' },
  groupOptionName: { color: '#111827', fontSize: 15, fontWeight: '700', marginTop: 2 },
  groupOptionLocation: { color: '#64748b', fontSize: 11, marginTop: 3 },
  groupOptionStatus: { color: '#15803d', fontSize: 10, fontWeight: '800' },
  noGroupsText: { color: '#b45309', backgroundColor: '#fffbeb', borderRadius: 9, padding: 12, marginTop: 8 },
  cancelPickerButton: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 9, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  cancelPickerText: { color: '#334155', fontWeight: '700' },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { width: '48%', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  iconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  iconText: { fontSize: 17, fontWeight: '800', color: '#16a34a' },
  cardTitle: { fontSize: 13, color: '#374151' },
  cardValue: { marginTop: 4, fontSize: 17, fontWeight: '700', color: '#111827' },
  meetingPanel: { marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 10 },
  primaryButton: { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  buttonSubtext: { color: '#dcfce7', fontSize: 12, textAlign: 'center', marginTop: 4 },
  secondaryButton: { borderWidth: 1, borderColor: '#16a34a', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16, marginBottom: 10 },
  secondaryButtonText: { color: '#16a34a', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  activityContainer: { marginTop: 12 },
  statusBox: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14 },
  statusText: { fontSize: 13, color: '#374151', marginBottom: 5 },
  navigationSection: { marginTop: 22 },
  actionButton: { backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 },
  actionButtonText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
