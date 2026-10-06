import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';

import {
  getGroupById,
  getMembersByGroupId,
  getOpenMeeting,
  isMeetingRollCallComplete,
} from '../database/database';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'GroupManagement'
>;

export default function GroupManagementScreen({
  route,
  navigation,
}: Props) {
  const { groupId, executiveMemberId } = route.params;

  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [groupNumber, setGroupNumber] = useState('');
  const [openMeeting, setOpenMeeting] = useState<any | null>(null);
  const [memberCount, setMemberCount] = useState(0);

  const loadManagementState = useCallback(async () => {
    try {
      setLoading(true);

      const group = await getGroupById(groupId);

      if (group) {
        setGroupName(group.group_name || '');
        setGroupNumber(
          group.group_number !== undefined
            ? `KYA ${group.group_number}`
            : '',
        );
      }

      const members = await getMembersByGroupId(groupId);

      setMemberCount(
        Array.isArray(members)
          ? members.length
          : 0,
      );

      const currentMeeting =
        await getOpenMeeting(groupId);

      setOpenMeeting(currentMeeting);
    } catch (error) {
      console.error(
        'Failed to load group management:',
        error,
      );

      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Unable to load group management.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      loadManagementState();
    }, [loadManagementState]),
  );

  const handleAddMembers = () => {
    navigation.navigate('AddMembers', {
      groupId,
    });
  };

  const handleNewMeeting = () => {
    if (openMeeting) {
      Alert.alert(
        'Meeting Already Open',
        'This group already has a meeting in progress. Use Current Meeting * to continue it.',
      );
      return;
    }

    navigation.navigate('NewMeeting', {
      groupId,
      executiveMemberId,
    });
  };

  const handleCurrentMeeting = async () => {
    if (!openMeeting) {
      return;
    }

    try {
      const rollCallComplete =
        await isMeetingRollCallComplete(
          openMeeting.id,
        );

      if (!rollCallComplete) {
        navigation.navigate(
          'MeetingRollCall',
          {
            groupId,
            meetingId: openMeeting.id,
            executiveMemberId,
          },
        );

        return;
      }

      navigation.navigate(
        'FinancialTransactions',
        {
          groupId,
          meetingId: openMeeting.id,
        },
      );
    } catch (error) {
      console.error(
        'Failed to resume meeting:',
        error,
      );

      Alert.alert(
        'Unable to Continue Meeting',
        error instanceof Error
          ? error.message
          : 'The current meeting could not be opened.',
      );
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color="#16a34a"
          />

          <Text style={styles.loadingText}>
            Loading group management...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>
            Group Management
          </Text>

          <Text style={styles.groupName}>
            {groupName || 'Ebadsave VSLA Group'}
          </Text>

          {groupNumber ? (
            <Text style={styles.groupNumber}>
              {groupNumber}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>
            Registered Members
          </Text>

          <Text style={styles.infoValue}>
            {memberCount}
          </Text>
        </View>

        {openMeeting ? (
          <TouchableOpacity
            style={styles.currentMeetingCard}
            onPress={handleCurrentMeeting}
            activeOpacity={0.85}
          >
            <View style={styles.currentMeetingHeader}>
              <Text style={styles.currentMeetingTitle}>
                Current Meeting *
              </Text>

              <View style={styles.openBadge}>
                <Text style={styles.openBadgeText}>
                  OPEN
                </Text>
              </View>
            </View>

            <Text style={styles.currentMeetingNumber}>
              Meeting #
              {openMeeting.meeting_number ??
                openMeeting.id}
            </Text>

            <Text style={styles.currentMeetingDate}>
              {openMeeting.meeting_date}
            </Text>

            <Text style={styles.currentMeetingDescription}>
              Continue the current meeting, record
              transactions, or close the meeting.
            </Text>

            <View style={styles.continueButton}>
              <Text style={styles.continueButtonText}>
                Continue Meeting
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.menuButton}
          onPress={handleAddMembers}
          activeOpacity={0.85}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>
              +
            </Text>
          </View>

          <View style={styles.menuTextArea}>
            <Text style={styles.menuTitle}>
              Add Members
            </Text>

            <Text style={styles.menuDescription}>
              Register members and manage executive
              roles.
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.menuButton,
            openMeeting &&
              styles.disabledMenuButton,
          ]}
          onPress={handleNewMeeting}
          activeOpacity={0.85}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>
              +
            </Text>
          </View>

          <View style={styles.menuTextArea}>
            <Text style={styles.menuTitle}>
              New Meeting
            </Text>

            <Text style={styles.menuDescription}>
              Review the previous meeting before
              starting a new one.
            </Text>
          </View>

          <Text style={styles.arrow}>
            ›
          </Text>
        </TouchableOpacity>

        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>
            Meeting Rules
          </Text>

          <Text style={styles.rule}>
            • Only one meeting can be open at a time.
          </Text>

          <Text style={styles.rule}>
            • An open meeting can be paused and
            continued later.
          </Text>

          <Text style={styles.rule}>
            • The previous meeting must be approved
            before a new meeting starts.
          </Text>

          <Text style={styles.rule}>
            • Once a new meeting starts, the previous
            meeting is locked.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.backButtonText}>
            Back
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

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 12,
    color: '#374151',
    fontSize: 15,
  },

  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },

  headerInfo: {
    alignItems: 'flex-start',
  },

  headerTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },

  groupName: {
    marginTop: 5,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  groupNumber: {
    marginTop: 3,
    color: '#dcfce7',
    fontSize: 13,
    fontWeight: '700',
  },

  content: {
    padding: 18,
  },

  infoCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 15,
    marginBottom: 14,
    backgroundColor: '#ffffff',
  },

  infoLabel: {
    color: '#6b7280',
    fontSize: 13,
  },

  infoValue: {
    marginTop: 4,
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
  },

  currentMeetingCard: {
    borderWidth: 2,
    borderColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    backgroundColor: '#f0fdf4',
  },

  currentMeetingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  currentMeetingTitle: {
    color: '#15803d',
    fontSize: 18,
    fontWeight: '800',
  },

  openBadge: {
    backgroundColor: '#16a34a',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  openBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },

  currentMeetingNumber: {
    marginTop: 12,
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
  },

  currentMeetingDate: {
    marginTop: 4,
    color: '#6b7280',
    fontSize: 13,
  },

  currentMeetingDescription: {
    marginTop: 10,
    color: '#374151',
    fontSize: 14,
    lineHeight: 20,
  },

  continueButton: {
    marginTop: 15,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },

  continueButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },

  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },

  disabledMenuButton: {
    opacity: 0.55,
  },

  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
  },

  iconText: {
    color: '#16a34a',
    fontSize: 25,
    fontWeight: '700',
  },

  menuTextArea: {
    flex: 1,
    marginLeft: 12,
  },

  menuTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
  },

  menuDescription: {
    marginTop: 3,
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 18,
  },

  arrow: {
    marginLeft: 8,
    color: '#16a34a',
    fontSize: 30,
    fontWeight: '400',
  },

  rulesCard: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    padding: 15,
  },

  rulesTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },

  rule: {
    color: '#4b5563',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 3,
  },

  backButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: 'center',
  },

  backButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
});
