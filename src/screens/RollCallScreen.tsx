import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

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
  getMeetingRollCall,
  isMeetingRollCallComplete,
  recordMeetingAttendance,
  type MeetingAttendanceRecord,
} from '../database/database';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'MeetingRollCall'
>;

type AttendanceStatus =
  | 'present'
  | 'late'
  | 'absent';

export default function RollCallScreen({
  route,
  navigation,
}: Props) {
  const {
    groupId,
    meetingId,
    executiveMemberId,
  } = route.params;

  const [members, setMembers] =
    useState<MeetingAttendanceRecord[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [savingMemberId, setSavingMemberId] =
    useState<number | null>(null);

  const [continuing, setContinuing] =
    useState(false);

  const loadRollCall = useCallback(async () => {
    try {
      setLoading(true);

      const records =
        await getMeetingRollCall(meetingId);

      setMembers(records);
    } catch (error) {
      Alert.alert(
        'Unable to Load Roll Call',
        error instanceof Error
          ? error.message
          : 'The roll call could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    loadRollCall();
  }, [loadRollCall]);

  const markAttendance = async (
    memberId: number,
    status: AttendanceStatus,
  ) => {
    try {
      setSavingMemberId(memberId);

      await recordMeetingAttendance(
        meetingId,
        memberId,
        status,
        executiveMemberId,
      );

      setMembers((current) =>
        current.map((member) =>
          member.member_id === memberId
            ? {
                ...member,
                attendance_status: status,
                marked_by: executiveMemberId,
              }
            : member,
        ),
      );
    } catch (error) {
      Alert.alert(
        'Unable to Save Attendance',
        error instanceof Error
          ? error.message
          : 'Attendance could not be recorded.',
      );
    } finally {
      setSavingMemberId(null);
    }
  };

  const handleContinue = async () => {
    try {
      setContinuing(true);

      const complete =
        await isMeetingRollCallComplete(meetingId);

      if (!complete) {
        Alert.alert(
          'Roll Call Incomplete',
          'Every active member must be marked Present, Late, or Absent before continuing.',
        );
        return;
      }

      navigation.navigate('FinancialTransactions', {
  groupId,
  meetingId,
});
    } catch (error) {
      Alert.alert(
        'Unable to Continue',
        error instanceof Error
          ? error.message
          : 'The meeting could not continue.',
      );
    } finally {
      setContinuing(false);
    }
  };

  const completedCount = members.filter(
    (member) =>
      member.attendance_status === 'present' ||
      member.attendance_status === 'late' ||
      member.attendance_status === 'absent',
  ).length;

  const pendingCount =
    members.length - completedCount;

  const rollCallComplete =
    members.length > 0 &&
    pendingCount === 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color="#16a34a"
          />

          <Text style={styles.loadingText}>
            Loading Roll Call...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>
            Roll Call
          </Text>

          <Text style={styles.subtitle}>
            Meeting #{meetingId}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              Members
            </Text>

            <Text style={styles.infoValue}>
              {members.length}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>
              Marked
            </Text>

            <Text style={styles.infoValue}>
              {completedCount} / {members.length}
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width:
                    members.length > 0
                      ? `${(completedCount / members.length) * 100}%`
                      : '0%',
                },
              ]}
            />
          </View>

          <Text
            style={
              rollCallComplete
                ? styles.completeText
                : styles.pendingText
            }
          >
            {rollCallComplete
              ? '✓ Roll call complete'
              : `${pendingCount} member${
                  pendingCount === 1 ? '' : 's'
                } still pending`}
          </Text>
        </View>

        {members.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No active members
            </Text>

            <Text style={styles.emptyText}>
              There are no active members available
              for this meeting roll call.
            </Text>
          </View>
        ) : (
          members.map((member) => {
            const saving =
              savingMemberId === member.member_id;

            const status =
              member.attendance_status;

            return (
              <View
                key={member.member_id}
                style={styles.memberCard}
              >
                <View style={styles.memberHeader}>
                  <View
                    style={styles.memberIdentity}
                  >
                    <Text
                      style={styles.memberName}
                    >
                      {member.full_name}
                    </Text>

                    <Text
                      style={styles.memberNumber}
                    >
                      {member.member_number}
                    </Text>
                  </View>

                  {status !== 'pending' && (
                    <View
                      style={[
                        styles.statusBadge,
                        status === 'present' &&
                          styles.presentBadge,
                        status === 'late' &&
                          styles.lateBadge,
                        status === 'absent' &&
                          styles.absentBadge,
                      ]}
                    >
                      <Text
                        style={
                          styles.statusBadgeText
                        }
                      >
                        {status.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.presentButton,
                      status === 'present' &&
                        styles.selectedPresentButton,
                    ]}
                    onPress={() =>
                      markAttendance(
                        member.member_id,
                        'present',
                      )
                    }
                    disabled={saving}
                  >
                    {saving &&
                    status !== 'present' ? (
                      <ActivityIndicator
                        color="#ffffff"
                        size="small"
                      />
                    ) : (
                      <Text
                        style={styles.actionText}
                      >
                        Present
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.lateButton,
                      status === 'late' &&
                        styles.selectedLateButton,
                    ]}
                    onPress={() =>
                      markAttendance(
                        member.member_id,
                        'late',
                      )
                    }
                    disabled={saving}
                  >
                    {saving &&
                    status !== 'late' ? (
                      <ActivityIndicator
                        color="#ffffff"
                        size="small"
                      />
                    ) : (
                      <Text
                        style={styles.actionText}
                      >
                        Late
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.absentButton,
                      status === 'absent' &&
                        styles.selectedAbsentButton,
                    ]}
                    onPress={() =>
                      markAttendance(
                        member.member_id,
                        'absent',
                      )
                    }
                    disabled={saving}
                  >
                    {saving &&
                    status !== 'absent' ? (
                      <ActivityIndicator
                        color="#ffffff"
                        size="small"
                      />
                    ) : (
                      <Text
                        style={styles.actionText}
                      >
                        Absent
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                {saving && (
                  <Text style={styles.savingText}>
                    Saving...
                  </Text>
                )}
              </View>
            );
          })
        )}

        <TouchableOpacity
          style={[
            styles.continueButton,
            (!rollCallComplete ||
              continuing) &&
              styles.disabledContinueButton,
          ]}
          onPress={handleContinue}
          disabled={
            !rollCallComplete || continuing
          }
        >
          {continuing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text
              style={styles.continueButtonText}
            >
              Continue to Savings
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={continuing}
        >
          <Text style={styles.backButtonText}>
            Back
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
    marginBottom: 18,
  },

  title: {
    fontSize: 29,
    fontWeight: '800',
    color: '#16a34a',
  },

  subtitle: {
    marginTop: 5,
    color: '#6b7280',
    fontSize: 15,
  },

  infoCard: {
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },

  infoLabel: {
    color: '#374151',
    fontSize: 15,
  },

  infoValue: {
    color: '#15803d',
    fontSize: 15,
    fontWeight: '800',
  },

  progressTrack: {
    height: 9,
    backgroundColor: '#dcfce7',
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 10,
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#16a34a',
    borderRadius: 99,
  },

  completeText: {
    marginTop: 10,
    color: '#15803d',
    fontWeight: '800',
    textAlign: 'center',
  },

  pendingText: {
    marginTop: 10,
    color: '#92400e',
    fontWeight: '700',
    textAlign: 'center',
  },

  memberCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },

  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  memberIdentity: {
    flex: 1,
    paddingRight: 10,
  },

  memberName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },

  memberNumber: {
    marginTop: 3,
    fontSize: 13,
    color: '#6b7280',
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },

  presentBadge: {
    backgroundColor: '#16a34a',
  },

  lateBadge: {
    backgroundColor: '#d97706',
  },

  absentBadge: {
    backgroundColor: '#dc2626',
  },

  statusBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 13,
  },

  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  presentButton: {
    backgroundColor: '#16a34a',
  },

  lateButton: {
    backgroundColor: '#d97706',
  },

  absentButton: {
    backgroundColor: '#dc2626',
  },

  selectedPresentButton: {
    borderWidth: 3,
    borderColor: '#14532d',
  },

  selectedLateButton: {
    borderWidth: 3,
    borderColor: '#78350f',
  },

  selectedAbsentButton: {
    borderWidth: 3,
    borderColor: '#7f1d1d',
  },

  actionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },

  savingText: {
    marginTop: 7,
    textAlign: 'right',
    color: '#6b7280',
    fontSize: 12,
  },

  emptyCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  emptyText: {
    marginTop: 7,
    color: '#6b7280',
    lineHeight: 20,
  },

  continueButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },

  disabledContinueButton: {
    backgroundColor: '#9ca3af',
  },

  continueButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },

  backButton: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '700',
  },
});
