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
  getMembersByGroupId,
  GroupRecord,
  MemberRecord,
} from '../database/database';

type HomeScreenProps = {
  navigation: any;
};

const summaryCards = [
  {
    title: 'Total Savings',
    value: 'UGX 0',
    icon: 'S',
    iconBackground: '#dcfce7',
    iconColor: '#16a34a',
  },
  {
    title: 'Loans Out',
    value: 'UGX 0',
    icon: 'L',
    iconBackground: '#ffedd5',
    iconColor: '#f97316',
  },
  {
    title: 'Members',
    value: '0',
    icon: 'M',
    iconBackground: '#dbeafe',
    iconColor: '#2563eb',
  },
  {
    title: 'Fund Balance',
    value: 'UGX 0',
    icon: 'F',
    iconBackground: '#dcfce7',
    iconColor: '#166534',
  },
  {
    title: 'Insurance fund',
    value: 'UGX 0',
    icon: 'I',
    iconBackground: '#fee2e2',
    iconColor: '#dc2626',
  },
  {
    title: 'Fines fund',
    value: 'UGX 0',
    icon: 'N',
    iconBackground: '#ffffff',
    iconColor: '#374151',
  },
];

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const [activeGroup, setActiveGroup] = useState<GroupRecord | null>(null);
  const [executiveMemberId, setExecutiveMemberId] = useState<number | null>(
    null,
  );

  const loadActiveGroup = useCallback(async () => {
    try {
      const groups = await getAllGroups();

      const activeGroups = groups.filter(
        (group) => group.status.toLowerCase() === 'active',
      );

      if (activeGroups.length === 0) {
        setActiveGroup(null);
        setExecutiveMemberId(null);
        return;
      }

      const group = activeGroups[0];

      setActiveGroup(group);

      const members = await getMembersByGroupId(group.id);

      const executive = members.find(
        (member: MemberRecord) =>
          member.role?.toLowerCase() === 'executive',
      );

      setExecutiveMemberId(executive ? executive.id : null);
    } catch (error) {
      console.error('Failed to load active group:', error);

      setActiveGroup(null);
      setExecutiveMemberId(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadActiveGroup();
    }, [loadActiveGroup]),
  );

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
        'Please assign an executive member before using this function.',
      );
      return false;
    }

    return true;
  };

  const handleSetupRules = () => {
    if (!requireGroup()) {
      return;
    }

    navigation.navigate('SetupRules', {
      groupId: activeGroup!.id,
    });
  };

  const handleAddMembers = () => {
    if (!requireGroup()) {
      return;
    }

    navigation.navigate('AddMembers', {
      groupId: activeGroup!.id,
    });
  };

  const handleNewMeeting = () => {
    if (!requireExecutive()) {
      return;
    }

    navigation.navigate('NewMeeting', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  const handleSavings = () => {
    if (!requireExecutive()) {
      return;
    }

    navigation.navigate('Savings', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  const handleLoanDisbursement = () => {
    if (!requireExecutive()) {
      return;
    }

    navigation.navigate('LoanDisbursement', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  const handleFines = () => {
    if (!requireExecutive()) {
      return;
    }

    navigation.navigate('Fines', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  const handleInsurance = () => {
    if (!requireExecutive()) {
      return;
    }

    navigation.navigate('Insurance', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  const handleExternalFunds = () => {
    if (!requireExecutive()) {
      return;
    }

    navigation.navigate('ExternalFunds', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  const handleRepayment = () => {
    if (!requireExecutive()) {
      return;
    }

    navigation.navigate('Repayment', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  const handleLoans = () => {
    if (!requireExecutive()) {
      return;
    }

    navigation.navigate('Loans', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  const handleMiscellaneousExpense = () => {
    if (!requireExecutive()) {
      return;
    }

    navigation.navigate('MiscellaneousExpense', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

  const handleExpenditure = () => {
    if (!requireExecutive()) {
      return;
    }

    navigation.navigate('Expenditure', {
      groupId: activeGroup!.id,
      executiveMemberId: executiveMemberId!,
    });
  };

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
            activeOpacity={0.8}
          >
            <Text style={styles.headerButtonText}>Constitution</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleSetupRules}
            activeOpacity={0.8}
          >
            <Text style={styles.headerButtonText}>Setup Rules</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.cardsGrid}>
          {summaryCards.map((card) => (
            <View key={card.title} style={styles.card}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: card.iconBackground,
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

              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardValue}>{card.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.activityContainer}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>

          <View style={styles.emptyActivity}>
            <Text style={styles.emptyIcon}>—</Text>
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        </View>

        <View style={styles.navigationSection}>
          <Text style={styles.sectionTitle}>Group Management</Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleAddMembers}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>Add Members</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleNewMeeting}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>New Meeting</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.navigationSection}>
          <Text style={styles.sectionTitle}>Financial Actions</Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSavings}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>Savings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleLoanDisbursement}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>Loan Disbursement</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleFines}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>Fines</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleInsurance}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>Insurance</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleExternalFunds}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>External Funds</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleRepayment}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>Loan Repayment</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleLoans}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>Loans</Text>
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
            <Text style={styles.actionButtonText}>Expenditure</Text>
          </TouchableOpacity>
        </View>
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
    paddingBottom: 32,
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

  activityContainer: {
    marginTop: 8,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },

  emptyActivity: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIcon: {
    fontSize: 24,
    color: '#9ca3af',
  },

  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
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
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
