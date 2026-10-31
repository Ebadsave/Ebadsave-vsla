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
import * as FileSystem from 'expo-file-system';

import { RootStackParamList } from '../../App';
import {
  getGroupById,
  getOpenMeeting,
  getLastConcludedMeeting,
  getMeetingSummary,
  getMeetingTransactionSummary,
  startNewMeeting,
  closeMeeting,
  approveMeetingSummary,
  getMeetingCashReconciliation,
  applyMeetingDayLoanInterest,
} from '../database/database';
import { exportDatabaseBackup } from '../database/backup';

type Props = NativeStackScreenProps<RootStackParamList, 'NewMeeting'>;

type PreviousMeeting = {
  id: number;
  meeting_number?: number;
  meeting_date: string;
  closed_at: string | null;
  status: string;
  loan_fund?: number;
  insurance_fund?: number;
  total_collected?: number;
  meeting_savings?: number;
  meeting_fines?: number;
  other_loan_fund_collections?: number;
  loan_disbursement?: number;
  summary_approved?: number;
  previous_meeting_reviewed?: number;
  previous_meeting_editable?: number;
};

export default function NewMeetingScreen({ route, navigation }: Props) {
  const { groupId, executiveMemberId } = route.params;

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [openingRollCall, setOpeningRollCall] = useState(false);
  const [approving, setApproving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [backupReceipt, setBackupReceipt] = useState<{
    meetingId: number;
    createdAt: string;
    filePath: string;
    fileName: string;
    fileSize: number;
  } | null>(null);
  const backupCompleted = backupReceipt !== null;
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
      setBackupReceipt((current) => current && current.meetingId === Number(currentOpenMeeting?.id) ? current : null);

      const previous = await getLastConcludedMeeting(groupId);
      if (previous) {
        const [closedSummary, transactionSummary] = await Promise.all([
          getMeetingSummary(previous.id),
          getMeetingTransactionSummary(previous.id),
        ]);
        setPreviousMeeting({
          ...(previous as PreviousMeeting),
          loan_fund: closedSummary?.loan_fund ?? 0,
          insurance_fund: closedSummary?.insurance_fund ?? transactionSummary.insuranceFund,
          total_collected: transactionSummary.totalCollected,
          meeting_savings: transactionSummary.savings,
          meeting_fines: transactionSummary.fines,
          other_loan_fund_collections: Math.max(
            0,
            transactionSummary.loanFundCollections - transactionSummary.savings - transactionSummary.fines,
          ),
          loan_disbursement: transactionSummary.loanDisbursement,
        });
      } else {
        setPreviousMeeting(null);
      }
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

  const openRollCallForMeeting = async (meeting: any) => {
    if (!meeting?.id) {
      throw new Error('The open meeting could not be identified. Refresh the meeting screen and try again.');
    }
    setOpenMeeting(meeting);
    setBackupReceipt((current) => current && current.meetingId === Number(meeting.id) ? current : null);

    // Run once per meeting before roll call; the database uses a unique
    // (group, member, meeting) key so reopening the meeting cannot duplicate charges.
    try {
      const interestResult = await applyMeetingDayLoanInterest(groupId, Number(meeting.id));
      if (interestResult.chargedMembers > 0) {
        Alert.alert('Meeting Interest Recorded', interestResult.message);
      } else if (interestResult.skippedByPeriod) {
        Alert.alert('Meeting Interest Paused', interestResult.message);
      }
    } catch (interestError) {
      // A calculation problem must be visible but must not leave a newly opened meeting stranded.
      Alert.alert(
        'Meeting Interest Not Applied',
        interestError instanceof Error
          ? `${interestError.message} The meeting can continue; review interest before closing.`
          : 'Meeting interest could not be applied. The meeting can continue; review interest before closing.',
      );
    }

    navigation.navigate('MeetingRollCall', {
      groupId,
      meetingId: Number(meeting.id),
      executiveMemberId,
    });
  };

  const handleOpenExistingMeeting = async () => {
    try {
      setOpeningRollCall(true);
      // Re-read SQLite on every tap. The screen can have stale state after
      // returning from Roll Call or if the meeting was created previously.
      const current = await getOpenMeeting(groupId);
      if (!current) {
        await loadMeetingState();
        Alert.alert('No Open Meeting', 'No open meeting was found. Use Start First Meeting to create it.');
        return;
      }
      await openRollCallForMeeting(current);
    } catch (error) {
      Alert.alert('Unable to Open Meeting', error instanceof Error ? error.message : 'Roll Call could not be opened.');
    } finally {
      setOpeningRollCall(false);
    }
  };

  const handleStartMeeting = async () => {
    if (starting || openingRollCall) return;

    try {
      setStarting(true);

      // Avoid the apparent "stuck" state when a previous tap already created
      // Meeting #1 but the screen state has not refreshed yet.
      const alreadyOpen = await getOpenMeeting(groupId);
      if (alreadyOpen) {
        await openRollCallForMeeting(alreadyOpen);
        return;
      }

      const latestPrevious = await getLastConcludedMeeting(groupId);
      if (latestPrevious && latestPrevious.summary_approved !== 1) {
        await loadMeetingState();
        Alert.alert(
          'Previous Meeting Not Approved',
          'Approve the previous meeting summary before starting a new meeting.',
        );
        return;
      }

      const meetingId = await startNewMeeting(groupId, executiveMemberId);

      // Confirm using the database, not a local boolean. If the immediate
      // read races with the insert, retry once after refreshing the state.
      let createdMeeting = await getOpenMeeting(groupId);
      if (!createdMeeting || Number(createdMeeting.id) !== Number(meetingId)) {
        await loadMeetingState();
        createdMeeting = await getOpenMeeting(groupId);
      }
      if (!createdMeeting || Number(createdMeeting.id) !== Number(meetingId)) {
        throw new Error('Meeting creation could not be confirmed in the database. Refresh and try again; do not create another meeting until checking the current meeting list.');
      }

      setOpenMeeting(createdMeeting);
      setBackupReceipt(null);
      setCashInBox('');
      setCashCheck(null);
      await openRollCallForMeeting(createdMeeting);
    } catch (error) {
      Alert.alert(
        'Unable to Start Meeting',
        error instanceof Error ? error.message : 'The meeting could not be started.',
      );
      await loadMeetingState();
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
    if (!openMeeting) {
      Alert.alert('No Open Meeting', 'Open a meeting before creating its closing backup.');
      return;
    }

    try {
      setClosing(true);
      setBackupReceipt(null);
      setCashCheck(null);

      // This exporter writes a file and reads it back to verify it. A success
      // flag alone is not accepted as proof that a backup file exists.
      const result = await exportDatabaseBackup();
      if (!result.success || !result.filePath || !result.fileName) {
        throw new Error(result.error || result.message || 'The backup could not be verified.');
      }

      const info = await FileSystem.getInfoAsync(result.filePath);
      if (!info.exists || !('size' in info) || Number(info.size) <= 0) {
        throw new Error('The backup file is missing or empty. The meeting cannot be closed.');
      }

      const contents = await FileSystem.readAsStringAsync(result.filePath, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsed = JSON.parse(contents) as {
        version?: number;
        created_at?: string;
        tables?: Record<string, unknown>;
      };
      const meetings = parsed.tables?.group_meetings;
      if (
        parsed.version !== 1 ||
        typeof parsed.created_at !== 'string' ||
        !Array.isArray(meetings) ||
        !meetings.some((item: any) => Number(item?.id) === Number(openMeeting.id) && item?.status === 'open')
      ) {
        throw new Error('The saved backup could not be verified for this open meeting. No closing receipt was recorded.');
      }

      const receipt = {
        meetingId: Number(openMeeting.id),
        createdAt: new Date().toISOString(),
        filePath: result.filePath,
        fileName: result.fileName,
        fileSize: Number(info.size),
      };
      setBackupReceipt(receipt);
      Alert.alert(
        'Backup Verified',
        `A verified backup file has been saved for Meeting #${openMeeting.meeting_number ?? openMeeting.id}. You can now enter the cash in the box.`,
      );
    } catch (error) {
      setBackupReceipt(null);
      Alert.alert('Backup Failed', error instanceof Error ? error.message : 'The database backup could not be created and verified.');
    } finally {
      setClosing(false);
    }
  };

  const verifyBackupReceiptBeforeClose = async () => {
    if (!openMeeting || !backupReceipt || backupReceipt.meetingId !== Number(openMeeting.id)) {
      throw new Error('A verified backup receipt for this meeting is required before closing.');
    }
    const info = await FileSystem.getInfoAsync(backupReceipt.filePath);
    if (!info.exists || !('size' in info) || Number(info.size) <= 0 || Number(info.size) !== backupReceipt.fileSize) {
      throw new Error('The verified backup file is missing or has changed. Create a new backup before closing the meeting.');
    }
    const contents = await FileSystem.readAsStringAsync(backupReceipt.filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(contents) as { version?: number; created_at?: string; tables?: Record<string, unknown> };
    const meetings = parsed.tables?.group_meetings;
    if (
      parsed.version !== 1 ||
      typeof parsed.created_at !== 'string' ||
      !Array.isArray(meetings) ||
      !meetings.some((item: any) => Number(item?.id) === Number(openMeeting.id) && item?.status === 'open')
    ) {
      throw new Error('The backup file no longer verifies for this meeting. Create a new backup before closing.');
    }
    return JSON.stringify({
      ...backupReceipt,
      verified: true,
      meetingId: Number(openMeeting.id),
      verifiedAtClose: new Date().toISOString(),
    });
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
    if (!backupCompleted || !backupReceipt) {
      Alert.alert('Backup Required', 'Create and verify a backup file for this meeting before ending it.');
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
            const verifiedReceipt = await verifyBackupReceiptBeforeClose();
            await closeMeeting(openMeeting.id, executiveMemberId, amount, true, verifiedReceipt);
            Alert.alert('Meeting Closed', 'The meeting has been concluded and recorded.');
            setBackupReceipt(null);
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

            <TouchableOpacity
              style={styles.startButton}
              onPress={() => void handleOpenExistingMeeting()}
              disabled={openingRollCall || starting}
            >
              {openingRollCall ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.startButtonText}>Open Meeting / Continue Roll Call</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => navigation.navigate('CloseMeeting', { groupId, executiveMemberId, meetingId: Number(openMeeting.id) })}
            >
              <Text style={styles.closeButtonText}>Close Meeting</Text>
            </TouchableOpacity>

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
                    <Text style={styles.summaryLabel}>Total Amount Collected</Text>
                    <Text style={styles.summaryValue}>
                      {formatAmount(previousMeeting.total_collected)}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Savings Collected</Text>
                    <Text style={styles.summaryValue}>
                      {formatAmount(previousMeeting.meeting_savings)}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Fines Collected</Text>
                    <Text style={styles.summaryValue}>
                      {formatAmount(previousMeeting.meeting_fines)}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Other Loan Fund Collections</Text>
                    <Text style={styles.summaryValue}>
                      {formatAmount(previousMeeting.other_loan_fund_collections)}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Loan Disbursements</Text>
                    <Text style={styles.summaryValue}>
                      {formatAmount(previousMeeting.loan_disbursement)}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Closing Loan Fund</Text>
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
