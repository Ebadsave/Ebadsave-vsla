import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import {
  applyMeetingDayLoanInterest,
  closeMeeting,
  getGroupById,
  getMeetingCashReconciliation,
  getOpenMeeting,
} from '../database/database';
import { exportDatabaseBackup } from './backup/backup';

type Props = NativeStackScreenProps<RootStackParamList, 'CloseMeeting'>;

type BackupReceipt = {
  meetingId: number;
  createdAt: string;
  filePath: string;
  fileName: string;
  fileSize: number;
};

type CashCheck = {
  expectedCash: number;
  difference: number;
  balanced: boolean;
};

const money = (value: number) => `UGX ${Number(value || 0).toLocaleString()}`;

export default function CloseMeetingScreen({ route, navigation }: Props) {
  const { groupId, executiveMemberId, meetingId } = route.params;
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('Ebadsave VSLA Group');
  const [meeting, setMeeting] = useState<any | null>(null);
  const [step, setStep] = useState(0);
  const [cashInBox, setCashInBox] = useState('');
  const [cashCheck, setCashCheck] = useState<CashCheck | null>(null);
  const [backupReceipt, setBackupReceipt] = useState<BackupReceipt | null>(null);
  const [checkingCash, setCheckingCash] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [group, openMeeting] = await Promise.all([
        getGroupById(groupId),
        getOpenMeeting(groupId),
      ]);
      if (group?.group_name) setGroupName(group.group_name);
      if (!openMeeting || Number(openMeeting.id) !== Number(meetingId)) {
        setMeeting(null);
        throw new Error('This meeting is not currently open. Return to the meeting page and refresh it.');
      }
      setMeeting(openMeeting);
    } catch (error) {
      Alert.alert('Close Meeting', error instanceof Error ? error.message : 'Unable to load the open meeting.');
    } finally {
      setLoading(false);
    }
  }, [groupId, meetingId]);

  useEffect(() => { void load(); }, [load]);

  const handleCheckCash = async () => {
    const cleaned = cashInBox.replace(/,/g, '').trim();
    const amount = Number(cleaned);
    if (!cleaned || !Number.isFinite(amount) || amount < 0) {
      Alert.alert('Cash Required', 'Enter the actual amount of cash in the box.');
      return;
    }
    try {
      setCheckingCash(true);
      // Check/apply eligible monthly interest after members have made this
      // meeting's repayments and before the verified closing backup is created.
      // Database uniqueness makes repeat cash checks safe for the same meeting.
      const interestResult = await applyMeetingDayLoanInterest(groupId, meetingId);
      const result = await getMeetingCashReconciliation(meetingId, amount);
      setCashCheck({ expectedCash: result.expectedCash, difference: result.difference, balanced: result.balanced });
      setBackupReceipt(null);
      if (result.balanced) {
        const interestMessage = interestResult.chargedMembers > 0
          ? ` Monthly interest was recorded for ${interestResult.chargedMembers} member(s), total ${money(interestResult.totalInterest)}.`
          : '';
        Alert.alert('Cash Verified', `Cash matches the expected amount. Continue to create the meeting backup.${interestMessage}`);
      } else {
        Alert.alert('Cash Does Not Balance', `Expected ${money(result.expectedCash)} but counted ${money(amount)}. Correct the difference before continuing.`);
      }
    } catch (error) {
      setCashCheck(null);
      Alert.alert('Unable to Check Cash', error instanceof Error ? error.message : 'Cash reconciliation could not be calculated.');
    } finally {
      setCheckingCash(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!cashCheck?.balanced) {
      Alert.alert('Check Cash First', 'Cash must balance before a closing backup can be created.');
      return;
    }
    try {
      setCreatingBackup(true);
      setBackupReceipt(null);
      const result = await exportDatabaseBackup();
      if (!result.success || !result.filePath || !result.fileName) {
        throw new Error(result.error || result.message || 'A verified backup could not be created.');
      }
      const info = await FileSystem.getInfoAsync(result.filePath);
      if (!info.exists || !('size' in info) || Number(info.size) <= 0) {
        throw new Error('The backup file is missing or empty. The meeting remains open.');
      }
      const contents = await FileSystem.readAsStringAsync(result.filePath, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = JSON.parse(contents) as { version?: number; created_at?: string; tables?: Record<string, unknown> };
      const backedUpMeetings = parsed.tables?.group_meetings;
      if (
        parsed.version !== 1 ||
        typeof parsed.created_at !== 'string' ||
        !Array.isArray(backedUpMeetings) ||
        !backedUpMeetings.some((row: any) => Number(row?.id) === Number(meetingId) && row?.status === 'open')
      ) {
        throw new Error('The backup does not contain this meeting in its open state. The meeting remains open.');
      }
      setBackupReceipt({
        meetingId,
        createdAt: parsed.created_at,
        filePath: result.filePath,
        fileName: result.fileName,
        fileSize: Number(info.size),
      });
      Alert.alert('Backup Verified', 'The saved backup has been read and verified. You may continue to close the meeting.');
    } catch (error) {
      setBackupReceipt(null);
      Alert.alert('Backup Failed', error instanceof Error ? error.message : 'The backup could not be verified.');
    } finally {
      setCreatingBackup(false);
    }
  };

  const verifyBackupBeforeClose = async () => {
    if (!backupReceipt || Number(backupReceipt.meetingId) !== Number(meetingId)) {
      throw new Error('A verified backup for this meeting is required.');
    }
    const info = await FileSystem.getInfoAsync(backupReceipt.filePath);
    if (!info.exists || !('size' in info) || Number(info.size) <= 0 || Number(info.size) !== backupReceipt.fileSize) {
      throw new Error('The backup file is missing or has changed. Create a new backup before closing.');
    }
    const contents = await FileSystem.readAsStringAsync(backupReceipt.filePath, { encoding: FileSystem.EncodingType.UTF8 });
    const parsed = JSON.parse(contents) as { version?: number; created_at?: string; tables?: Record<string, unknown> };
    const meetings = parsed.tables?.group_meetings;
    if (parsed.version !== 1 || !Array.isArray(meetings) || !meetings.some((row: any) => Number(row?.id) === Number(meetingId) && row?.status === 'open')) {
      throw new Error('The backup no longer verifies for this open meeting. Create a new backup.');
    }
    return JSON.stringify({ ...backupReceipt, verified: true, verifiedAtClose: new Date().toISOString() });
  };

  const handleCloseMeeting = () => {
    if (!meeting || !cashCheck?.balanced || !backupReceipt) {
      Alert.alert('Closing Requirements', 'Cash must balance and a verified backup must exist before closing.');
      return;
    }
    Alert.alert('Close Meeting', 'Cash has been checked and the backup verified. Close this meeting now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close Meeting',
        style: 'destructive',
        onPress: async () => {
          try {
            setClosing(true);
            // Reconcile again immediately before close, in case any value changed.
            const cashAmount = Number(cashInBox.replace(/,/g, '').trim());
            const latestCashCheck = await getMeetingCashReconciliation(meetingId, cashAmount);
            if (!latestCashCheck.balanced) throw new Error('Cash no longer balances. Recheck the cash before closing.');
            const receipt = await verifyBackupBeforeClose();
            await closeMeeting(meetingId, executiveMemberId, cashAmount, true, receipt);
            Alert.alert('Meeting Closed', 'The meeting has been closed successfully. Existing-group onboarding is now locked and cannot be reopened to add opening savings.', [
              { text: 'OK', onPress: () => navigation.navigate('Home') },
            ]);
          } catch (error) {
            Alert.alert('Unable to Close Meeting', error instanceof Error ? error.message : 'The meeting could not be closed.');
          } finally {
            setClosing(false);
          }
        },
      },
    ]);
  };

  const goNext = () => {
    if (step === 0) {
      if (!cashCheck?.balanced) {
        Alert.alert('Cash Check Required', 'Check and balance the cash before moving to backup.');
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!backupReceipt) {
        Alert.alert('Backup Required', 'Create and verify the backup before moving to final closure.');
        return;
      }
      setStep(2);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color="#16a34a" /><Text style={styles.muted}>Loading meeting details...</Text></View></SafeAreaView>;
  }

  if (!meeting) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.title}>No Open Meeting</Text><TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}><Text style={styles.secondaryText}>Back</Text></TouchableOpacity></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Close Meeting</Text>
          <Text style={styles.subtitle}>{groupName}</Text>
          <Text style={styles.subtitle}>Meeting #{meeting.meeting_number ?? meeting.id}</Text>
        </View>
        <View style={styles.stepBar}><Text style={[styles.stepText, step === 0 && styles.activeStep]}>1. Cash</Text><Text style={[styles.stepText, step === 1 && styles.activeStep]}>2. Backup</Text><Text style={[styles.stepText, step === 2 && styles.activeStep]}>3. Close</Text></View>

        {step === 0 && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Step 1 — Check Cash in the Box</Text>
          <Text style={styles.body}>Count the actual cash physically available and enter the amount below. The app compares it with expected cash from recorded transactions.</Text>
          <Text style={styles.label}>Actual cash in box (UGX)</Text>
          <TextInput value={cashInBox} onChangeText={(value) => { setCashInBox(value); setCashCheck(null); setBackupReceipt(null); }} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#9ca3af" style={styles.input} />
          <TouchableOpacity style={styles.primaryButton} onPress={() => void handleCheckCash()} disabled={checkingCash}>
            {checkingCash ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Check Cash</Text>}
          </TouchableOpacity>
          {cashCheck && <View style={cashCheck.balanced ? styles.goodBox : styles.badBox}>
            <Text style={styles.resultTitle}>{cashCheck.balanced ? '✓ CASH BALANCES' : '✗ CASH DOES NOT BALANCE'}</Text>
            <Text style={styles.body}>Expected: {money(cashCheck.expectedCash)}</Text>
            <Text style={styles.body}>Difference: {money(Math.abs(cashCheck.difference))}</Text>
          </View>}
        </View>}

        {step === 1 && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Step 2 — Create and Verify Backup</Text>
          <Text style={styles.body}>This step is available only after the cash check passes. The backup must exist, be readable, and contain this meeting in its open state.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => void handleCreateBackup()} disabled={creatingBackup || !cashCheck?.balanced}>
            {creatingBackup ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{backupReceipt ? 'Create New Verified Backup' : 'Create and Verify Backup'}</Text>}
          </TouchableOpacity>
          {backupReceipt && <View style={styles.goodBox}><Text style={styles.resultTitle}>✓ BACKUP VERIFIED</Text><Text style={styles.body}>{backupReceipt.fileName}</Text><Text style={styles.body}>Size: {backupReceipt.fileSize.toLocaleString()} bytes</Text></View>}
        </View>}

        {step === 2 && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Step 3 — Close Meeting</Text>
          <Text style={styles.body}>The app will recheck cash and verify the backup again immediately before closing. If either check fails, the meeting stays open.</Text>
          <View style={styles.goodBox}><Text style={styles.resultTitle}>✓ Cash balanced</Text><Text style={styles.body}>✓ Backup verified</Text></View>
          <TouchableOpacity style={[styles.primaryButton, closing && styles.disabled]} onPress={handleCloseMeeting} disabled={closing}>
            {closing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Close Meeting</Text>}
          </TouchableOpacity>
        </View>}

        <View style={styles.footerButtons}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => step === 0 ? navigation.goBack() : setStep((current) => current - 1)} disabled={closing}><Text style={styles.secondaryText}>Back</Text></TouchableOpacity>
          {step < 2 && <TouchableOpacity style={[styles.primaryButton, styles.nextButton, ((step === 0 && !cashCheck?.balanced) || (step === 1 && !backupReceipt)) && styles.disabled]} onPress={goNext} disabled={(step === 0 && !cashCheck?.balanced) || (step === 1 && !backupReceipt)}><Text style={styles.primaryText}>Next</Text></TouchableOpacity>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7f5' },
  content: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { backgroundColor: '#16a34a', borderRadius: 14, padding: 18, marginBottom: 14 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#fff', marginTop: 5, opacity: 0.92 },
  stepBar: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 14 },
  stepText: { color: '#6b7280', fontWeight: '700', fontSize: 12 },
  activeStep: { color: '#16a34a' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, elevation: 2 },
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  body: { color: '#4b5563', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  label: { color: '#374151', fontWeight: '700', marginTop: 8, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 13, fontSize: 18, color: '#111827' },
  primaryButton: { backgroundColor: '#16a34a', borderRadius: 10, minHeight: 48, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryButton: { borderColor: '#16a34a', borderWidth: 1.5, borderRadius: 10, minHeight: 48, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  secondaryText: { color: '#166534', fontWeight: '800' },
  footerButtons: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  nextButton: { flex: 1 },
  disabled: { opacity: 0.45 },
  goodBox: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginTop: 12 },
  badBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: 12, marginTop: 12 },
  resultTitle: { color: '#166534', fontWeight: '900', marginBottom: 6 },
  muted: { color: '#6b7280', marginTop: 10 },
});
