import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  TextInput,
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
  getLastConcludedMeeting,
  startNewMeeting,
  closeMeeting,
  approveMeetingSummary,
  createDatabaseBackup,
  getMeetingCashReconciliation,
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
  summary_approved?: number;
  previous_meeting_reviewed?: number;
  previous_meeting_editable?: number;
};

export default function NewMeetingScreen({ route, navigation }: Props) {
  const { groupId, executiveMemberId } = route.params;

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [backupCompleted, setBackupCompleted] = useState(false);
  const [backupCreatedAt, setBackupCreatedAt] = useState('');
  const [cashInBox, setCashInBox] = useState('');
  const [cashCheck, setCashCheck] = useState<{ expectedCash: number; difference: number; balanced: boolean } | null>(null);
  const [checkingCash, setCheckingCash] = useState(false);

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

    // A first meeting has no previous meeting and can start immediately.
    if (
      previousMeeting &&
      previousMeeting.summary_approved !== 1
    ) {
      Alert.alert(
        'Previous Meeting Not Approved',
        'Approve the previous meeting summary before starting a new meeting.',
      );
      return;
    }

    try {
      setStarting(true);

      await startNewMeeting(groupId, executiveMemberId);

      Alert.alert(
        'Meeting Started',
        'The new group meeting has been opened. Roll call will begin first.',
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

  const handleApprovePreviousMeeting = () => {
    if (!previousMeeting) {
      return;
    }

    if (previousMeeting.summary_approved === 1) {
      Alert.alert(
        'Already Approved',
        'The previous meeting summary has already been approved.',
      );
      return;
    }

    Alert.alert(
      'Approve Previous Meeting',
      `Approve Meeting #${
        previousMeeting.meeting_number ?? previousMeeting.id
      } summary? After the new meeting starts, this meeting will be locked from editing.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              setApproving(true);

              await approveMeetingSummary(
                previousMeeting.id,
                executiveMemberId,
              );

              Alert.alert(
                'Previous Meeting Approved',
                'The previous meeting summary has been approved. You can now start the new meeting.',
              );

              await loadMeetingState();
            } catch (error) {
              Alert.alert(
                'Unable to Approve',
                error instanceof Error
                  ? error.message
                  : 'The previous meeting summary could not be approved.',
              );
            } finally {
              setApproving(false);
            }
          },
        },
      ],
    );
  };

  const handleCreateBackup = async () => {
    try {
      setClosing(true);
      await createDatabaseBackup();
      const createdAt = new Date().toISOString();
      setBackupCreatedAt(createdAt);
      setBackupCompleted(true);
      Alert.alert('Backup Complete', 'The database backup was created successfully. You can now enter the cash in the box.');
    } catch (error) {
      setBackupCompleted(false);
      setBackupCreatedAt('');
      Alert.alert('Backup Failed', error instanceof Error ? error.message : 'The database backup could not be created.');
    } finally {
      setClosing(false);
    }
  };

  const handleCheckCash = async () => {
    const amount = Number(cashInBox);
    if (!cashInBox.trim() || !Number.isFinite(amount) || amount < 0) {
      Alert.alert('Cash Required', 'Enter the actual amount of cash in the box.');
      return;
    }
    try {
      setCheckingCash(true);
      const result = await getMeetingCashReconciliation(openMeeting!.id, amount);
      setCashCheck({ expectedCash: result.expectedCash, difference: result.difference, balanced: result.balanced });
      if (!result.balanced) {
        Alert.alert('Cash Does Not Balance', `Expected UGX ${result.expectedCash.toLocaleString()} but counted UGX ${amount.toLocaleString()}.`);
      }
    } catch (error) {
      setCashCheck(null);
      Alert.alert('Unable to Check Cash', error instanceof Error ? error.message : 'Cash reconciliation could not be calculated.');
    } finally {
      setCheckingCash(false);
    }
  };

  const handleCloseMeeting = async () => {
    if (!openMeeting) return;
    if (!backupCompleted || !backupCreatedAt) {
      Alert.alert('Backup Required', 'Create a successful database backup before ending the meeting.');
      return;
    }
    const amount = Number(cashInBox);
    if (!cashInBox.trim() || !Number.isFinite(amount) || amount < 0) {
      Alert.alert('Cash Required', 'Enter and check the actual cash in the box before ending the meeting.');
      return;
    }
    if (!cashCheck?.balanced) {
      Alert.alert('Cash Must Balance', 'The expected cash and actual cash must match before the meeting can end.');
      return;
    }

    Alert.alert('End Meeting', 'The backup is complete and cash balances. End this meeting now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Meeting',
        style: 'destructive',
        onPress: async () => {
          try {
            setClosing(true);
            await closeMeeting(openMeeting.id, executiveMemberId, amount, true, backupCreatedAt);
            Alert.alert('Meeting Closed', 'The meeting has been concluded and recorded.');
            setBackupCompleted(false);
            setBackupCreatedAt('');
            setCashInBox('');
            setCashCheck(null);
            await loadMeetingState();
          } catch (error) {
            Alert.alert('Unable to Close Meeting', error instanceof Error ? error.message : 'The meeting could not be closed.');
          } finally {
            setClosing(false);
          }
        },
      },
    ]);
  };

  const formatAmount = (value: number | undefined) => {
    return `UGX ${(value ?? 0).toLocaleString()}`;
  };

  const previousApproved =
    !previousMeeting || previousMeeting.summary_approved === 1;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#16a34a" />
          <Text style={styles.loadingText}>
            Loading meeting information...
          </Text>
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

            <View style={styles.closeWorkflowCard}>
              <Text style={styles.workflowTitle}>Close Meeting Checklist</Text>
              <Text style={styles.workflowStep}>1. Backup database</Text>
              <Text style={styles.workflowStatus}>{backupCompleted ? '✓ Backup completed' : 'Backup required'}</Text>
              {!backupCompleted && (
                <TouchableOpacity style={styles.closeButton} onPress={() => void handleCreateBackup()} disabled={closing}>
                  {closing ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.closeButtonText}>Create Backup</Text>}
                </TouchableOpacity>
              )}

              <Text style={styles.workflowStep}>2. Count cash in box</Text>
              <TextInput
                value={cashInBox}
                onChangeText={(value) => { setCashInBox(value); setCashCheck(null); }}
                keyboardType="decimal-pad"
                placeholder="Enter actual cash in box"
                placeholderTextColor="#9ca3af"
                style={styles.cashInput}
                editable={backupCompleted}
              />
              <TouchableOpacity style={[styles.checkCashButton, !backupCompleted && styles.disabledCloseButton]} onPress={() => void handleCheckCash()} disabled={!backupCompleted || checkingCash}>
                {checkingCash ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.closeButtonText}>Check Cash</Text>}
              </TouchableOpacity>

              {cashCheck && (
                <View style={cashCheck.balanced ? styles.cashBalancedBox : styles.cashMismatchBox}>
                  <Text style={styles.workflowStatus}>{cashCheck.balanced ? '✓ CASH BALANCES' : '✗ CASH DOES NOT BALANCE'}</Text>
                  <Text style={styles.cashDetail}>Expected: UGX {cashCheck.expectedCash.toLocaleString()}</Text>
                  <Text style={styles.cashDetail}>Difference: UGX {Math.abs(cashCheck.difference).toLocaleString()}</Text>
                </View>
              )}

              <Text style={styles.workflowStep}>3. End meeting</Text>
              <TouchableOpacity style={[styles.closeButton, (!backupCompleted || !cashCheck?.balanced || closing) && styles.disabledCloseButton]} onPress={() => void handleCloseMeeting()} disabled={!backupCompleted || !cashCheck?.balanced || closing}>
                {closing ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.closeButtonText}>End Meeting</Text>}
              </TouchableOpacity>
            </View>

            <Text style={styles.lockText}>
              The meeting cannot end until a backup succeeds and the cash in the box exactly matches the calculated expected cash.
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

                  <View
                    style={
                      previousApproved
                        ? styles.greenBadge
                        : styles.redBadge
                    }
                  >
                    <Text style={styles.badgeText}>
                      {previousApproved ? 'APPROVED' : 'REVIEW'}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.previousCard,
                    previousApproved && styles.approvedCard,
                  ]}
                >
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

                  {!previousApproved ? (
                    <>
                      <TouchableOpacity
                        style={styles.approveButton}
                        onPress={handleApprovePreviousMeeting}
                        disabled={approving}
                      >
                        {approving ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <Text style={styles.approveButtonText}>
                            Approve Previous Meeting
                          </Text>
                        )}
                      </TouchableOpacity>

                      <Text style={styles.approvalHint}>
                        Approval is required before the next meeting can
                        start.
                      </Text>
                    </>
                  ) : (
                    <View style={styles.approvedBox}>
                      <Text style={styles.approvedText}>
                        ✓ Previous meeting summary approved
                      </Text>
                    </View>
                  )}

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
                      disabled={previousApproved}
                    >
                      <Text
                        style={[
                          styles.editButtonText,
                          previousApproved && styles.disabledEditText,
                        ]}
                      >
                        Read & Edit
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.auditText}>
                    The latest concluded meeting can be reviewed before
                    starting the next meeting. Once the new meeting starts,
                    editing is locked.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.firstMeetingCard}>
                <Text style={styles.firstMeetingTitle}>
                  First Group Meeting
                </Text>

                <Text style={styles.firstMeetingText}>
                  No previous concluded meeting was found. This is the
                  first meeting for this group.
                </Text>

                <View style={styles.firstReadyBox}>
                  <Text style={styles.firstReadyText}>
                    ✓ Ready to start
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.startButton,
                !previousApproved && styles.disabledStartButton,
              ]}
              onPress={handleStartMeeting}
              disabled={starting || !previousApproved}
            >
              {starting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.startButtonText}>
                  {previousMeeting
                    ? 'Start New Meeting'
                    : 'Start First Meeting'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.authorizationText}>
              The meeting starts with Roll Call. App opening authorization
              has already been completed; no additional passcode
              authorization is required here.
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
    flex: 1,
  },
  redBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  greenBadge: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  badgeText: {
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
  approvedCard: {
    borderColor: '#16a34a',
    backgroundColor: '#f7fff9',
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
  approveButton: {
    marginTop: 18,
    backgroundColor: '#16a34a',
    borderRadius: 9,
    paddingVertical: 14,
    alignItems: 'center',
  },
  approveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  approvalHint: {
    marginTop: 9,
    textAlign: 'center',
    color: '#b91c1c',
    fontSize: 13,
  },
  approvedBox: {
    marginTop: 18,
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  approvedText: {
    color: '#15803d',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
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
  disabledEditText: {
    color: '#d1d5db',
  },
  auditText: {
    marginTop: 14,
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 19,
  },
  firstMeetingCard: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
    backgroundColor: '#f7fff9',
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
  firstReadyBox: {
    marginTop: 15,
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingVertical: 10,
  },
  firstReadyText: {
    textAlign: 'center',
    color: '#15803d',
    fontWeight: '700',
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
  closeWorkflowCard: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#d1d5db' },
  workflowTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 10 },
  workflowStep: { fontSize: 14, fontWeight: '700', color: '#374151', marginTop: 10, marginBottom: 6 },
  workflowStatus: { fontSize: 13, fontWeight: '800', color: '#166534', marginBottom: 8 },
  cashInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, backgroundColor: '#ffffff', minHeight: 50, paddingHorizontal: 14, fontSize: 18, color: '#111827' },
  checkCashButton: { backgroundColor: '#166534', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  disabledCloseButton: { opacity: 0.45 },
  cashBalancedBox: { marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#16a34a' },
  cashMismatchBox: { marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#dc2626' },
  cashDetail: { marginTop: 3, color: '#374151', fontSize: 13 },
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
  disabledStartButton: {
    backgroundColor: '#9ca3af',
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
