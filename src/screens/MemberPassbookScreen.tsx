import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, SafeAreaView, ScrollView,
  StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import {
  CloudflareApiError, getMyRemotePassbook, signOutCloudflareSession,
  type RemoteMemberPassbook, type RemotePassbookTransaction,
} from '../services/cloudflareApi';

type Props = { navigation: any };

function money(amount: number) {
  const value = Number.isFinite(amount) ? amount : 0;
  return `UGX ${value.toLocaleString('en-UG', { maximumFractionDigits: 2 })}`;
}
function dateLabel(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  return value.slice(0, 10);
}
function transactionLabel(item: RemotePassbookTransaction) {
  return item.description?.trim() || item.transactionType.replace(/_/g, ' ');
}

export default function MemberPassbookScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const horizontalPadding = width < 360 ? 12 : width < 600 ? 16 : 24;
  const [data, setData] = useState<RemoteMemberPassbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const result = await getMyRemotePassbook();
      setData(result);
    } catch (error) {
      if (error instanceof CloudflareApiError && error.status === 401) {
        setData(null);
        Alert.alert('Session expired', 'Please sign in again to access your remote passbook.');
        navigation.replace('MemberPassbookLogin');
      } else {
        Alert.alert('Passbook unavailable', error instanceof Error ? error.message : 'Could not load your remote passbook.');
        if (!refresh) setData(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  useEffect(() => { void load(); }, [load]);

  const signOut = async () => {
    try {
      await signOutCloudflareSession();
    } catch {
      // The local token is cleared by signOutCloudflareSession even if the network is unavailable.
    }
    navigation.replace('MemberPassbookLogin');
  };

  if (loading && !data) {
    return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#16a34a" /><Text style={styles.loadingText}>Loading your remote passbook…</Text></SafeAreaView>;
  }
  if (!data) {
    return <SafeAreaView style={styles.center}>
      <Text style={styles.errorTitle}>Remote passbook could not be loaded</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={() => void load()}><Text style={styles.primaryText}>Try again</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => void signOut()}><Text style={styles.backText}>Sign out</Text></TouchableOpacity>
    </SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#16a34a" />}>
        <View style={[styles.header, { paddingHorizontal: horizontalPadding, paddingTop: compact ? 16 : 22, paddingBottom: compact ? 18 : 25 }]}>
          <View style={styles.headerTop}>
            <Text style={styles.brand}>Ebadsave VSLA</Text>
            <TouchableOpacity onPress={() => void signOut()}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity>
          </View>
          <Text style={styles.tagline}>My remote personal passbook</Text>
          <Text adjustsFontSizeToFit numberOfLines={2} minimumFontScale={0.72} style={[styles.memberName, compact && styles.memberNameCompact]}>{data.memberName}</Text>
          <Text style={styles.memberMeta}>Member No. {data.memberNumber}</Text>
        </View>

        <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>My financial records</Text>
        <View style={[styles.amountCard, compact && styles.compactCard]}>
          <Text style={styles.cardLabel}>My Total Savings</Text>
          <Text style={[styles.cardValue, { color: '#166534' }]}>{money(data.totalSavingsUgx)}</Text>
        </View>
        <View style={[styles.amountCard, compact && styles.compactCard]}>
          <Text style={styles.cardLabel}>My Unpaid Loan Balance</Text>
          <Text style={[styles.cardValue, { color: '#b91c1c' }]}>{money(data.loanBalanceUgx)}</Text>
        </View>

        <View style={[styles.datesCard, compact && styles.compactCard]}>
          <Text style={styles.sectionTitleInside}>My loan due date</Text>
          <View style={styles.dateRow}><Text style={styles.dateLabel}>Loan due date</Text><Text style={styles.dateValue}>{dateLabel(data.loanDueDate)}</Text></View>
        </View>

        <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>My transaction history</Text>
        <View style={styles.historyCard}>
          {data.transactions.length === 0 ? <Text style={styles.empty}>No remote transactions have been synced yet.</Text> : data.transactions.map((item, index) => (
            <View key={`${item.transactionId}-${index}`} style={[styles.transaction, index > 0 && styles.transactionBorder]}>
              <View style={styles.transactionText}>
                <Text style={styles.transactionTitle}>{transactionLabel(item)}</Text>
                <Text style={styles.transactionDate}>{dateLabel(item.transactionDate)}</Text>
              </View>
              <Text style={styles.transactionAmount}>{money(item.amountUgx)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.footerNote}>This passbook is retrieved from Ebadsave Cloudflare. Pull down to refresh. Only figures currently supplied by the remote passbook service are displayed.</Text>
        <Text style={styles.updated}>Last updated: {dateLabel(data.updatedAt)}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' }, content: { paddingBottom: 20, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: '#475569', marginTop: 12 }, errorTitle: { color: '#0f172a', fontSize: 19, fontWeight: '800', marginBottom: 18, textAlign: 'center' },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 22, paddingTop: 22, paddingBottom: 25, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { color: '#fff', fontSize: 21, fontWeight: '900' }, signOut: { color: '#fff', fontWeight: '800', textDecorationLine: 'underline' },
  tagline: { color: '#dcfce7', marginTop: 4, fontSize: 13 }, memberName: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 14, flexShrink: 1 }, memberNameCompact: { fontSize: 18, marginTop: 10 }, memberMeta: { color: '#f0fdf4', marginTop: 5, fontSize: 13 },
  sectionTitle: { color: '#0f172a', fontSize: 17, fontWeight: '900', marginTop: 18, marginBottom: 8 }, sectionTitleCompact: { fontSize: 15, marginTop: 14, marginBottom: 6 },
  amountCard: { backgroundColor: '#fff', marginBottom: 7, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: '#e2e8f0' }, cardLabel: { color: '#64748b', fontSize: 12, fontWeight: '700' }, cardValue: { fontSize: 19, fontWeight: '900', marginTop: 6 },
  datesCard: { backgroundColor: '#fff', marginTop: 7, paddingHorizontal: 12, paddingBottom: 8, borderRadius: 15, borderWidth: 1, borderColor: '#e2e8f0' }, sectionTitleInside: { color: '#0f172a', fontSize: 14, fontWeight: '900', marginTop: 16, marginBottom: 10 }, dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, gap: 8 }, dateLabel: { color: '#64748b', fontSize: 12, flexShrink: 1 }, dateValue: { color: '#0f172a', fontSize: 12, fontWeight: '800' },
  historyCard: { backgroundColor: '#fff', borderRadius: 15, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14 }, transaction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, gap: 8 }, transactionBorder: { borderTopWidth: 1, borderTopColor: '#e2e8f0' }, transactionText: { flex: 1 }, transactionTitle: { color: '#0f172a', fontSize: 12, fontWeight: '800' }, transactionDate: { color: '#64748b', fontSize: 11, marginTop: 4 }, transactionAmount: { color: '#166534', fontWeight: '900', fontSize: 12 }, empty: { color: '#64748b', textAlign: 'center', paddingVertical: 22 },
  footerNote: { color: '#64748b', textAlign: 'center', fontSize: 10, marginHorizontal: 8, marginTop: 18, lineHeight: 16 }, updated: { color: '#94a3b8', textAlign: 'center', fontSize: 10, marginTop: 7 },
  compactCard: { padding: 10, marginBottom: 6 }, primaryButton: { backgroundColor: '#16a34a', paddingVertical: 13, paddingHorizontal: 28, borderRadius: 12, marginBottom: 18 }, primaryText: { color: '#fff', fontWeight: '800' }, backText: { color: '#166534', fontWeight: '700' },
});
