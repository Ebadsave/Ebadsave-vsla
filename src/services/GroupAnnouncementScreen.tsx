import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { sendGroupAnnouncement, type SmsRunResult } from '../services/meetingSms';
import { getRecentSmsHistory, type SmsHistoryRow } from '../services/smsSender';

type Props = {
  route: { params: { groupId: number } };
  navigation: { goBack: () => void };
};

const MAX_LENGTH = 300;

const reason = (code: string | null) => ({
  E_NO_SIGNAL: 'no signal',
  E_RADIO_OFF: 'phone radio is off',
  E_BAD_NUMBER: 'wrong number',
  E_NO_PERMISSION: 'SMS permission not allowed',
  E_NO_MODULE: 'SMS module missing in this build',
  E_TIMEOUT: 'no confirmation',
} as Record<string, string>)[code ?? ''] ?? 'could not send';

export default function GroupAnnouncementScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ sent: number; failed: number; noPhone: number } | null>(null);
  const [failedRows, setFailedRows] = useState<SmsHistoryRow[]>([]);
  const [batch, setBatch] = useState<{ id: number; text: string } | null>(null);

  const run = useCallback(async (message: string, batchId?: number) => {
    try {
      setSending(true);
      setProgress({ done: 0, total: 0 });
      const result: SmsRunResult = await sendGroupAnnouncement({
        groupId,
        text: message,
        batchId,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const history = await getRecentSmsHistory(500);
      setFailedRows(history.filter((r) => r.status === 'failed' && r.id.startsWith(`announce-${result.batchId}-`)));
      setBatch({ id: result.batchId as number, text: message });
      setReport((prev) => ({
        // On a retry, add the newly sent members to the earlier total.
        sent: (batchId && prev ? prev.sent : 0) + result.sent,
        failed: result.failed,
        noPhone: result.noPhone,
      }));
      if (!batchId) setText('');
    } catch (error) {
      Alert.alert('Send SMS', error instanceof Error ? error.message : 'Could not send the SMS.');
    } finally {
      setSending(false);
      setProgress(null);
    }
  }, [groupId]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Send SMS</Text>
          <Text style={styles.subtitle}>Goes to every member with a phone number, from your own SIM. No internet needed.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Message ({text.length}/{MAX_LENGTH})</Text>
          <TextInput
            value={text}
            onChangeText={(v) => setText(v.slice(0, MAX_LENGTH))}
            multiline
            editable={!sending}
            placeholder="Meeting tomorrow at 5pm"
            placeholderTextColor="#9ca3af"
            style={[styles.input, styles.multiline]}
          />
          <TouchableOpacity
            style={[styles.primaryButton, (sending || !text.trim()) && styles.disabled]}
            onPress={() => void run(text)}
            disabled={sending || !text.trim()}
          >
            {sending
              ? <View style={styles.row}><ActivityIndicator color="#fff" /><Text style={styles.primaryText}>  Sending {progress?.done ?? 0}/{progress?.total ?? 0}...</Text></View>
              : <Text style={styles.primaryText}>SEND</Text>}
          </TouchableOpacity>
          <Text style={styles.note}>Your telecom charges your normal SMS rate. SMS credit is for tracking only and never blocks sending.</Text>
        </View>

        {report && (
          <View style={styles.card}>
            <Text style={styles.label}>Report</Text>
            <Text style={styles.report}>Sent: {report.sent}   Failed: {report.failed}</Text>
            {report.noPhone > 0 && <Text style={styles.note}>{report.noPhone} member(s) have no valid phone number.</Text>}
            {failedRows.map((r) => (
              <Text key={r.id} style={styles.failed}>✗ {r.member_name || r.phone} — {reason(r.error)}</Text>
            ))}
            {report.failed > 0 && batch && (
              <TouchableOpacity style={[styles.secondaryButton, sending && styles.disabled]} onPress={() => void run(batch.text, batch.id)} disabled={sending}>
                <Text style={styles.secondaryText}>Retry failed</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()} disabled={sending}>
          <Text style={styles.secondaryText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f7f5' },
  content: { padding: 16, paddingBottom: 36 },
  header: { backgroundColor: '#16a34a', borderRadius: 14, padding: 18, marginBottom: 14 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#fff', marginTop: 5, opacity: 0.92 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, elevation: 2 },
  label: { color: '#374151', fontWeight: '700', marginBottom: 7 },
  report: { color: '#166534', fontSize: 20, fontWeight: '900', marginBottom: 8 },
  failed: { color: '#b91c1c', fontSize: 13, marginTop: 3 },
  note: { color: '#6b7280', fontSize: 12, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 13, fontSize: 16, color: '#111827' },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  primaryButton: { backgroundColor: '#16a34a', borderRadius: 10, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryButton: { borderColor: '#16a34a', borderWidth: 1.5, borderRadius: 10, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { color: '#166534', fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
