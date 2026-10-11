import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import {
  authorizeMemberForAppAccess,
  createAppAccessSession,
  getAllGroups,
  getMembersByGroupId,
  type AppAccessProgress,
  type GroupRecord,
  type MemberRecord,
} from '../database/database';

type Props = NativeStackScreenProps<RootStackParamList, 'PreAppAuthorization'>;
type RequiredRole = 'executive' | 'ordinary';

const EXECUTIVE_POSTS = [
  'chairperson',
  'vice chair',
  'vice-chair',
  'vice chairperson',
  'secretary',
  'treasurer',
  'money counter',
  'money counters',
  'key keeper',
  'key keepers',
];

function isExecutive(member: MemberRecord): boolean {
  if (Number(member.is_super_user ?? 0) === 1) return true;

  const role = (member.role ?? '').trim().toLowerCase();
  if (role === 'executive' || role === 'admin') return true;
  if (EXECUTIVE_POSTS.includes(role)) return true;

  return (member.assigned_roles ?? '')
    .split(',')
    .some((item) => EXECUTIVE_POSTS.includes(item.trim().toLowerCase()));
}

const STEPS: { role: RequiredRole; label: string }[] = [
  { role: 'executive', label: 'Executive member 1 of 2' },
  { role: 'executive', label: 'Executive member 2 of 2' },
  { role: 'ordinary', label: 'Ordinary member 1 of 1' },
];

export default function PreAppAuthorizationScreen({ navigation }: Props) {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupRecord | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedMember, setSelectedMember] = useState<MemberRecord | null>(null);
  const [passcode, setPasscode] = useState('');
  const [authorizedMemberIds, setAuthorizedMemberIds] = useState<number[]>([]);
  const [progress, setProgress] = useState<AppAccessProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const registeredGroups = await getAllGroups();
        if (mounted) {
          setGroups(registeredGroups.filter((group) => group.status === 'active'));
        }
      } catch (error) {
        Alert.alert('Unable to load groups', getErrorMessage(error));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const currentStep = STEPS[stepIndex];

  const eligibleMembers = useMemo(() => {
    if (!currentStep) return [];
    return members.filter((member) => {
      if (member.status !== 'active') return false;
      if (!member.phone || !member.phone.trim()) return false;
      if (authorizedMemberIds.includes(member.id)) return false;
      return currentStep.role === 'executive'
        ? isExecutive(member)
        : !isExecutive(member);
    });
  }, [members, currentStep, authorizedMemberIds]);

  async function chooseGroup(group: GroupRecord) {
    setWorking(true);
    try {
      const [groupMembers, newSessionId] = await Promise.all([
        getMembersByGroupId(group.id),
        createAppAccessSession(group.id),
      ]);
      setSelectedGroup(group);
      setMembers(groupMembers);
      setSessionId(newSessionId);
      setStepIndex(0);
      setSelectedMember(null);
      setPasscode('');
      setAuthorizedMemberIds([]);
      setProgress({
        sessionId: newSessionId,
        groupId: group.id,
        executiveCount: 0,
        ordinaryCount: 0,
        totalCount: 0,
        authorized: false,
      });
    } catch (error) {
      Alert.alert('Could not select group', getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  function changeGroup() {
    setSelectedGroup(null);
    setMembers([]);
    setSessionId(null);
    setSelectedMember(null);
    setPasscode('');
    setAuthorizedMemberIds([]);
    setStepIndex(0);
    setProgress(null);
  }

  async function submitPasscode() {
    if (!selectedGroup || sessionId === null || !selectedMember) {
      Alert.alert('Choose a member', 'Select the member who is authorizing this step.');
      return;
    }
    if (!/^[A-Za-z1-9./$-]{4}$/.test(passcode)) {
      Alert.alert('Invalid passcode', 'Enter the member’s exact four-character passcode.');
      return;
    }

    setWorking(true);
    try {
      const nextProgress = await authorizeMemberForAppAccess(
        sessionId,
        selectedMember.id,
        passcode,
      );
      const nextAuthorizedIds = [...authorizedMemberIds, selectedMember.id];
      setAuthorizedMemberIds(nextAuthorizedIds);
      setProgress(nextProgress);
      setPasscode('');
      setSelectedMember(null);

      if (nextProgress.authorized) {
        Alert.alert(
          'Authorization successful',
          'Three different members have authorized this group. Ebadsave VSLA will now open.',
          [{
            text: 'Continue',
            onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Home' }] }),
          }],
          { cancelable: false },
        );
        return;
      }

      setStepIndex((previous) => previous + 1);
    } catch (error) {
      Alert.alert('Authorization failed', getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.loadingText}>Loading registered groups…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.brand}>Ebadsave VSLA</Text>
        <Text style={styles.tagline}>Three-member authorization</Text>
      </View>

      {!selectedGroup ? (
        <View style={styles.card}>
          <Text style={styles.title}>Select your registered group</Text>
          <Text style={styles.description}>
            Two different executive members and one ordinary member must authorize access.
          </Text>
          {groups.length === 0 ? (
            <Text style={styles.emptyText}>No active registered groups were found on this device.</Text>
          ) : groups.map((group) => (
            <Pressable
              key={group.id}
              style={({ pressed }) => [styles.groupButton, pressed && styles.pressed]}
              onPress={() => void chooseGroup(group)}
              disabled={working}
            >
              <Text style={styles.groupNumber}>KYA {group.group_number}</Text>
              <Text style={styles.groupName}>{group.group_name}</Text>
              <Text style={styles.groupLocation}>{group.district}, {group.country}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.groupSummary}>
            <View style={styles.groupSummaryText}>
              <Text style={styles.smallLabel}>SELECTED GROUP</Text>
              <Text style={styles.title}>{selectedGroup.group_name}</Text>
              <Text style={styles.groupLocation}>KYA {selectedGroup.group_number} · {selectedGroup.district}, {selectedGroup.country}</Text>
            </View>
            <Pressable onPress={changeGroup} disabled={working} style={styles.changeButton}>
              <Text style={styles.changeButtonText}>Change</Text>
            </Pressable>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((progress?.totalCount ?? 0) / 3) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {progress?.totalCount ?? 0} of 3 members authorized · {progress?.executiveCount ?? 0}/2 executives · {progress?.ordinaryCount ?? 0}/1 ordinary member
          </Text>

          {currentStep ? (
            <>
              <Text style={styles.stepTitle}>{currentStep.label}</Text>
              <Text style={styles.description}>
                Choose an active member with a registered phone number. Each member can authorize only once.
              </Text>

              {eligibleMembers.length === 0 ? (
                <Text style={styles.emptyText}>
                  No eligible {currentStep.role} members with registered phone numbers are available for this step. Register or activate an eligible member, then select the group again.
                </Text>
              ) : eligibleMembers.map((member) => (
                <Pressable
                  key={member.id}
                  style={({ pressed }) => [
                    styles.memberButton,
                    selectedMember?.id === member.id && styles.memberButtonSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    setSelectedMember(member);
                    setPasscode('');
                  }}
                  disabled={working}
                >
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>{member.full_name.trim().charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.memberTextWrap}>
                    <Text style={styles.memberName}>{member.full_name}</Text>
                    <Text style={styles.memberMeta}>{member.member_number} · {member.role || (isExecutive(member) ? 'Executive' : 'Ordinary member')}</Text>
                  </View>
                  <Text style={styles.radioMark}>{selectedMember?.id === member.id ? '●' : '○'}</Text>
                </Pressable>
              ))}

              {selectedMember && (
                <View style={styles.passcodePanel}>
                  <Text style={styles.passcodeLabel}>Passcode for {selectedMember.full_name}</Text>
                  <TextInput
                    value={passcode}
                    onChangeText={(value) => setPasscode(value.slice(0, 4))}
                    placeholder="Enter 4-character passcode"
                    placeholderTextColor="#64748b"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={4}
                    style={styles.passcodeInput}
                    editable={!working}
                    returnKeyType="done"
                    onSubmitEditing={() => void submitPasscode()}
                  />
                  <Pressable
                    onPress={() => void submitPasscode()}
                    disabled={working || passcode.length !== 4}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      (working || passcode.length !== 4) && styles.disabledButton,
                      pressed && !working && styles.pressed,
                    ]}
                  >
                    {working ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Verify passcode</Text>}
                  </Pressable>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.successText}>All three required members have authorized this group.</Text>
          )}
        </View>
      )}
      <Text style={styles.footer}>Your saved group and member records are not deleted by this authorization step.</Text>
    </ScrollView>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.';
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f0fdf4', padding: 20, justifyContent: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0fdf4' },
  loadingText: { marginTop: 12, color: '#166534', fontSize: 15 },
  header: { alignItems: 'center', marginBottom: 22 },
  brand: { color: '#166534', fontSize: 28, fontWeight: '800' },
  tagline: { color: '#475569', fontSize: 14, marginTop: 5 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#dcfce7', elevation: 2 },
  title: { color: '#14532d', fontSize: 20, fontWeight: '800' },
  description: { color: '#475569', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  groupButton: { borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 12, padding: 14, marginTop: 10, backgroundColor: '#f8fff9' },
  groupNumber: { color: '#16a34a', fontSize: 13, fontWeight: '800' },
  groupName: { color: '#14532d', fontSize: 17, fontWeight: '700', marginTop: 3 },
  groupLocation: { color: '#64748b', fontSize: 12, marginTop: 4 },
  emptyText: { color: '#b45309', backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, lineHeight: 20, marginTop: 10 },
  groupSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  groupSummaryText: { flex: 1, paddingRight: 10 },
  smallLabel: { color: '#16a34a', fontWeight: '800', fontSize: 11, marginBottom: 5 },
  changeButton: { borderWidth: 1, borderColor: '#16a34a', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  changeButtonText: { color: '#15803d', fontWeight: '700' },
  progressTrack: { height: 7, borderRadius: 6, backgroundColor: '#dcfce7', overflow: 'hidden', marginTop: 2 },
  progressFill: { height: '100%', backgroundColor: '#16a34a' },
  progressText: { color: '#475569', fontSize: 12, marginTop: 7, marginBottom: 20, lineHeight: 18 },
  stepTitle: { color: '#14532d', fontSize: 18, fontWeight: '800' },
  memberButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 11, marginTop: 8, backgroundColor: '#fff' },
  memberButtonSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  memberAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  memberAvatarText: { color: '#166534', fontWeight: '800', fontSize: 16 },
  memberTextWrap: { flex: 1 },
  memberName: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  memberMeta: { color: '#64748b', fontSize: 11, marginTop: 3 },
  radioMark: { color: '#16a34a', fontSize: 19, marginLeft: 8 },
  passcodePanel: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 13, marginTop: 16 },
  passcodeLabel: { color: '#334155', fontWeight: '700', marginBottom: 8 },
  passcodeInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#0f172a', backgroundColor: '#fff', fontSize: 18, letterSpacing: 5 },
  primaryButton: { minHeight: 48, borderRadius: 10, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', marginTop: 12, padding: 12 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  disabledButton: { opacity: 0.45 },
  successText: { color: '#166534', backgroundColor: '#dcfce7', borderRadius: 10, padding: 13, fontWeight: '700' },
  footer: { textAlign: 'center', color: '#64748b', fontSize: 11, lineHeight: 16, marginTop: 18, paddingHorizontal: 12 },
  pressed: { opacity: 0.8 },
});
