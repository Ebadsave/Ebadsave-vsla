import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../../App';
import {
  getGroupById,
  getOpenMeeting,
  getLastConcludedMeeting,,
  startNewMeeting,
  closeMeeting,
} from '../database/database';

type Props = NativeStackScreenProps<RootStackParamList, 'NewMeeting'>;

type PreviousMeeting = {
  id: number;
  meeting_number?: number;
  meeting_date: string;
  closed_at: string | null;
  status: string;
  loan_fund?: number;
  insurance_fund?: number;
};

export default function NewMeetingScreen({ route, navigation }: Props) {
  const { groupId, executiveMemberId } = route.params;

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [previousMeeting, setPreviousMeeting] =
    useState<PreviousMeeting | null>(null);
  const [openMeeting, setOpenMeeting] = useState<any | null>(null);

  const loadMeetingState = useCallback(async () => {
    try {
      setLoading(true);

      const group = await getGroupById(groupId);
      if (group) {
        setGroupName(group.group_name);
      }

      const currentOpenMeeting = await getOpenMeeting(groupId);
      setOpenMeeting(currentOpenMeeting);

      const previous = await getLastConcludedMeeting(groupId);
      setPreviousMeeting(previous as PreviousMeeting | null);
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Unable to load meeting information.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadMeetingState();
  }, [loadMeetingState]);

  const handleStartMeeting = async () => {
    if (openMeeting) {
      Alert.alert(
        'Meeting Already Open',
        'A meeting is already in progress for this group.',
      );
      return;
    }

    try {
      setStarting(true);

      await startNewMeeting(groupId, executiveMemberId);

      Alert.alert(
        'Meeting Started',
        'The new group meeting has been opened successfully.',
      );

      await loadMeetingState();
    } catch (error) {
      Alert.alert(
        'Unable to Start Meeting',
        error instanceof Error
          ? error.message
          : 'The meeting could not be started.',
      );
    } finally {
      setStarting(false);
    }
  };

  const handleCloseMeeting = async () => {
    if (!openMeeting) {
      return;
    }

    Alert.alert(
      'Close Meeting',
      'Are you sure you want to close this meeting? The end-of-meeting process will begin.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Close Meeting',
          style: 'destructive',
          onPress: async () => {
            try {
              setClosing(true);

              await closeMeeting(openMeeting.id, executiveMemberId);

              Alert.alert(
                'Meeting Closed',
                'The meeting has been concluded and recorded.',
              );

              await loadMeetingState();
            } catch (error) {
              Alert.alert(
                'Unable to Close Meeting',
                error instanceof Error
                  ? error.message
                  : 'The meeting could not be closed.',
              );
            } finally {
              setClosing(false);
            }
          },
        },
      ],
    );
  };

  const formatAmount = (value: number | undefined) => {
    return `UGX ${(value ?? 0).toLocaleString()}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#16a34a" />
          <Text style={styles.loadingText}>Loading meeting information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>New Meeting</Text>
          <Text style={styles.groupName}>
            {groupName || 'Ebadsave VSLA Group'}
          </Text>
        </View>

        {openMeeting ? (
          <View style={styles.openMeetingCard}>
            <Text style={styles.openLabel}>MEETING IN PROGRESS</Text>

            <Text style={styles.openTitle}>
              Meeting #{openMeeting.meeting_number ?? openMeeting.id}
            </Text>

            <Text style={styles.openDate}>
              {openMeeting.meeting_date}
            </Text>

            <View style={styles.statusBox}>
              <Text style={styles.statusText}>OPEN</Text>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleCloseMeeting}
              disabled={closing}
            >
              {closing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.closeButtonText}>Close Meeting</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.lockText}>
              No second meeting can be started while this meeting is open.
            </Text>
          </View>
        ) : (
          <>
            {previousMeeting ? (
              <View style={styles.previousSection}>
                <View style={styles.previousHeader}>
                  <Text style={styles.previousTitle}>
                    Previous Concluded Meeting
                  </Text>

                  <View style={styles.redBadge}>
                    <Text style={styles.redBadgeText}>REVIEW</Text>
                  </View>
                </View>

                <View style={styles.previousCard}>
                  <Text style={styles.meetingNumber}>
                    Meeting #
                    {previousMeeting.meeting_number ??
                      previousMeeting.id}
                  </Text>

                  <Text style={styles.dateText}>
                    {previousMeeting.meeting_date}
                  </Text>

                  <Text style={styles.summaryHeading}>
                    Previous Meeting Summary
                  </Text>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Loan Fund</Text>
                    <Text style={styles.summaryValue}>
                      {formatAmount(previousMeeting.loan_fund)}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>
                      Insurance Fund
                    </Text>
                    <Text style={styles.summaryValue}>
                      {formatAmount(previousMeeting.insurance_fund)}
                    </Text>
                  </View>

                  <View style={styles.optionsRow}>
                    <TouchableOpacity
                      style={styles.readOnlyButton}
                      onPress={() =>
                        Alert.alert(
                          'Read Only',
                          'The previous meeting is available for viewing only.',
                        )
                      }
                    >
                      <Text style={styles.readOnlyText}>Read Only</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() =>
                        Alert.alert(
                          'Read & Edit',
                          'The latest concluded meeting can be reviewed and corrected before the new meeting begins.',
                        )
                      }
                    >
                      <Text style={styles.editButtonText}>
                        Read & Edit
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.auditText}>
                    Only the latest concluded meeting is eligible for
                    editing. Once the new meeting starts, editing is
                    locked.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.firstMeetingCard}>
                <Text style={styles.firstMeetingTitle}>
                  First Group Meeting
                </Text>

                <Text style={styles.firstMeetingText}>
                  No previous concluded meeting was found. This will be
                  the first meeting for this group.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.startButton}
              onPress={handleStartMeeting}
              disabled={starting}
            >
              {starting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.startButtonText}>
                  Start New Meeting
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.authorizationText}>
              App opening authorization has already been completed.
              No additional passcode authorization is required here.
            </Text>
          </>
        )}

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Back</Text>
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

  content: {
    padding: 20,
    paddingBottom: 40,
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
    marginBottom: 22,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#16a34a',
  },

  groupName: {
    marginTop: 5,
    fontSize: 16,
    color: '#374151',
  },

  previousSection: {
    marginBottom: 20,
  },

  previousHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  previousTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111827',
  },

  redBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },

  redBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },

  previousCard: {
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fffafa',
  },

  meetingNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },

  dateText: {
    marginTop: 4,
    color: '#6b7280',
    fontSize: 14,
  },

  summaryHeading: {
    marginTop: 20,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },

  summaryLabel: {
    color: '#374151',
    fontSize: 15,
  },

  summaryValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },

  optionsRow: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 10,
  },

  readOnlyButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },

  readOnlyText: {
    color: '#16a34a',
    fontWeight: '700',
  },

  editButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },

  editButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },

  auditText: {
    marginTop: 14,
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 19,
  },

  firstMeetingCard: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
  },

  firstMeetingTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111827',
  },

  firstMeetingText: {
    marginTop: 8,
    color: '#4b5563',
    fontSize: 15,
    lineHeight: 21,
  },

  openMeetingCard: {
    borderWidth: 2,
    borderColor: '#16a34a',
    borderRadius: 12,
    padding: 18,
  },

  openLabel: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '800',
  },

  openTitle: {
    marginTop: 8,
    fontSize: 23,
    fontWeight: '700',
    color: '#111827',
  },

  openDate: {
    marginTop: 5,
    color: '#6b7280',
  },

  statusBox: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },

  statusText: {
    color: '#15803d',
    fontWeight: '800',
    fontSize: 12,
  },

  closeButton: {
    marginTop: 22,
    backgroundColor: '#dc2626',
    borderRadius: 9,
    paddingVertical: 14,
    alignItems: 'center',
  },

  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },

  lockText: {
    marginTop: 12,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 13,
  },

  startButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },

  startButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },

  authorizationText: {
    marginTop: 12,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 18,
  },

  backButton: {
    marginTop: 20,
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
