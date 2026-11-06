import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getAllGroups, buildRemotePassbookSyncPayload, type GroupRecord } from '../database/database';
import { cloudflareRequest, CloudflareApiError } from '../services/cloudflareApi';
import { CLOUDFLARE_ENDPOINTS, CLOUDFLARE_STORAGE_KEYS } from '../config/cloudflare';

type SyncResponse = { ok?: boolean; membersSynced?: number; error?: string; missingMemberNumbers?: string[] };

export default function CloudflarePassbookSyncScreen() {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('Select the local group whose records should be published to its matching Cloudflare group.');

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getAllGroups();
      setGroups(rows);
      if (rows.length === 1) setSelectedGroup(rows[0]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load local groups.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadGroups(); }, [loadGroups]);

  const runSync = async () => {
    if (!selectedGroup || syncing) return;
    setSyncing(true);
    setStatus('Checking administrator session and preparing a read-only snapshot…');
    try {
      const remoteGroupId = await SecureStore.getItemAsync(CLOUDFLARE_STORAGE_KEYS.groupId);
      const expectedGroupId = `kya-${selectedGroup.group_number}`;
      if (!remoteGroupId) throw new Error('No Cloudflare administrator session is saved on this phone. Sign in as the group administrator first.');
      if (remoteGroupId !== expectedGroupId) {
        throw new Error(`Group mismatch. This phone is signed in to Cloudflare group “${remoteGroupId}”, but the selected local group is KYA ${selectedGroup.group_number}. No records were uploaded.`);
      }

      const snapshot = await buildRemotePassbookSyncPayload(selectedGroup.id);
      if (!snapshot.members.length) throw new Error('There are no active members to synchronise.');
      setStatus(`Uploading ${snapshot.members.length} member passbook snapshots…`);
      const result = await cloudflareRequest<SyncResponse>(CLOUDFLARE_ENDPOINTS.syncPassbook, {
        method: 'POST', authenticated: true,
        body: { groupSummary: snapshot.groupSummary, members: snapshot.members },
      });
      if (result.ok !== true) throw new Error(result.error || 'Cloudflare did not confirm the synchronisation.');
      setStatus(`Synchronisation completed. ${result.membersSynced ?? snapshot.members.length} member passbooks were updated on Cloudflare.`);
      Alert.alert('Synchronisation complete', `${result.membersSynced ?? snapshot.members.length} member passbooks were uploaded. The local SQLite ledger was not changed.`);
    } catch (error) {
      let message = error instanceof Error ? error.message : 'Synchronisation failed.';
      if (error instanceof CloudflareApiError && error.status === 409 && error.message === 'member_auth_account_missing') {
        message = 'One or more members do not yet have Cloudflare authentication accounts. No passbook upload was started. Each member must first complete secure account/PIN registration.';
      } else if (error instanceof CloudflareApiError && error.status === 403) {
        message = 'Cloudflare rejected this operation. Only an authenticated group administrator can synchronise passbooks.';
      }
      setStatus(message);
      Alert.alert('Synchronisation not completed', message);
    } finally { setSyncing(false); }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Remote Passbook Synchronisation</Text>
      <Text style={styles.subtitle}>Upload a snapshot of existing SQLite financial records to the matching Cloudflare group. This does not edit or delete the local ledger.</Text>
      {loading ? <ActivityIndicator size="large" color="#16a34a" /> : groups.length === 0 ? <Text style={styles.note}>No local groups were found on this phone.</Text> : (
        <View style={styles.card}>
          <Text style={styles.label}>Select local group</Text>
          {groups.map((group) => (
            <TouchableOpacity key={group.id} style={[styles.group, selectedGroup?.id === group.id && styles.groupSelected]} onPress={() => setSelectedGroup(group)}>
              <Text style={styles.groupText}>KYA {group.group_number} — {group.group_name}</Text>
              <Text style={styles.small}>{group.status}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.label}>Synchronisation status</Text>
        <Text style={styles.status}>{status}</Text>
      </View>
      <TouchableOpacity disabled={!selectedGroup || syncing || loading} onPress={() => void runSync()} style={[styles.button, (!selectedGroup || syncing || loading) && styles.disabled]}>
        {syncing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Synchronise passbooks</Text>}
      </TouchableOpacity>
      <Text style={styles.warning}>Security: the Worker checks administrator permissions and each member's Cloudflare account. Members without authentication accounts must complete PIN registration before their passbooks can be synchronised.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#f7faf7', gap: 16 },
  title: { fontSize: 23, fontWeight: '800', color: '#166534' },
  subtitle: { fontSize: 14, color: '#475569', lineHeight: 21 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10, elevation: 1 },
  label: { fontSize: 16, fontWeight: '700', color: '#14532d' },
  group: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 9, padding: 12 },
  groupSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  groupText: { color: '#1f2937', fontWeight: '700' },
  small: { color: '#64748b', fontSize: 12, marginTop: 3 },
  status: { color: '#334155', lineHeight: 21 },
  note: { color: '#64748b' },
  button: { backgroundColor: '#16a34a', borderRadius: 10, padding: 16, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  warning: { color: '#92400e', backgroundColor: '#fffbeb', borderRadius: 9, padding: 12, lineHeight: 19, fontSize: 12 },
});
