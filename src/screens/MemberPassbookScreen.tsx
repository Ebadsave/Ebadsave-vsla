import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getMemberPassbookDashboardData, type MemberPassbookActivity } from '../database/database';

type Props = { navigation: any; route: { params: { memberId: number; groupId: number; currency?: string } } };
type PassbookData = Awaited<ReturnType<typeof getMemberPassbookDashboardData>>;

function money(amount: number, currency: string) {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${currency} ${value.toLocaleString('en-UG', { maximumFractionDigits: 2 })}`;
}
function dateLabel(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const date = value.slice(0, 10);
  return date;
}
function activityLabel(item: MemberPassbookActivity) {
  const labels: Record<string, string> = {
    savings_contribution: 'Savings deposit',
    loan_issued: 'Loan issued',
    loan_repayment: 'Loan repayment',
    fine: 'Fine charged',
    fine_payment: 'Fine payment',
    insurance_contribution: 'Insurance contribution',
    insurance_benefit: 'Insurance benefit',
  };
  return labels[item.transaction_type] || item.reason || item.transaction_type.replace(/_/g, ' ');
}

export default function MemberPassbookScreen({ navigation, route }: Props) {
  const { memberId, groupId } = route.params;
  const [data, setData] = useState<PassbookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const result = await getMemberPassbookDashboardData(memberId, groupId);
      setData(result);
    } catch (error) {
      Alert.alert('Passbook unavailable', error instanceof Error ? error.message : 'Could not load your passbook.');
      if (!refresh) setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [memberId, groupId]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#16a34a" /><Text style={styles.loadingText}>Loading your passbook…</Text></SafeAreaView>;
  }
  if (!data) {
    return <SafeAreaView style={styles.center}><Text style={styles.errorTitle}>Passbook could not be loaded</Text><TouchableOpacity style={styles.primaryButton} onPress={() => void load()}><Text style={styles.primaryText}>Try again</Text></TouchableOpacity><TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backText}>Sign out</Text></TouchableOpacity></SafeAreaView>;
  }

  const currency = data.currency || route.params.currency || 'UGX';
  const personalCards = [
    { label: 'My Total Savings', value: money(data.personalSavings, currency), color: '#166534' },
    { label: 'My Loan Amount', value: money(data.loanAmount, currency), color: '#9a3412' },
    { label: 'My Unpaid Loan Balance', value: money(data.loanBalance, currency), color: '#b91c1c' },
    { label: 'My Unpaid Fines', value: money(data.personalFines, currency), color: '#b91c1c' },
    { label: 'My Insurance Contributions', value: money(data.insuranceContributions, currency), color: '#1d4ed8' },
  ];
  const groupCards = [
    { label: 'Total Group Savings', value: money(data.groupSavings, currency) },
    { label: 'Group Loan Fund (cash ready to lend)', value: money(data.groupLoanFund, currency) },
    { label: 'Total Group Insurance Balance', value: money(data.groupInsuranceBalance, currency) },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#16a34a" />}>
        <View style={styles.header}>
          <View style={styles.headerTop}><Text style={styles.brand}>Ebadsave VSLA</Text><TouchableOpacity onPress={() => navigation.replace('MemberPassbookLogin')}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity></View>
          <Text style={styles.tagline}>My personal passbook</Text>
          <Text style={styles.memberName}>{data.memberName}</Text>
          <Text style={styles.memberMeta}>Member No. {data.memberNumber}</Text>
          <Text style={styles.memberMeta}>KYA {data.groupNumber} · {data.groupName}</Text>
        </View>

        <Text style={styles.sectionTitle}>My financial records</Text>
        {personalCards.map((card) => <View key={card.label} style={styles.amountCard}><Text style={styles.cardLabel}>{card.label}</Text><Text style={[styles.cardValue, { color: card.color }]}>{card.value}</Text></View>)}

        <View style={styles.datesCard}>
          <Text style={styles.sectionTitleInside}>My loan dates</Text>
          <View style={styles.dateRow}><Text style={styles.dateLabel}>Loan issue date</Text><Text style={styles.dateValue}>{dateLabel(data.loanIssueDate)}</Text></View>
          <View style={styles.divider} />
          <View style={styles.dateRow}><Text style={styles.dateLabel}>Loan due date</Text><Text style={[styles.dateValue, data.loanDueDate && data.loanDueDate.slice(0, 10) < new Date().toISOString().slice(0, 10) && data.loanBalance > 0 ? styles.overdue : null]}>{dateLabel(data.loanDueDate)}</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Group summary</Text>
        {groupCards.map((card) => <View key={card.label} style={styles.groupCard}><Text style={styles.groupLabel}>{card.label}</Text><Text style={styles.groupValue}>{card.value}</Text></View>)}
        <Text style={styles.privacyNote}>Group totals are shared with members. Other members’ personal financial records are not shown here.</Text>

        <Text style={styles.sectionTitle}>My transaction history</Text>
        <View style={styles.historyCard}>
          {data.activity.length === 0 ? <Text style={styles.empty}>No transactions recorded yet.</Text> : data.activity.map((item, index) => (
            <View key={item.id} style={[styles.transaction, index > 0 && styles.transactionBorder]}>
              <View style={styles.transactionText}><Text style={styles.transactionTitle}>{activityLabel(item)}</Text><Text style={styles.transactionDate}>{dateLabel(item.created_at)} · {item.reason}</Text></View>
              <Text style={[styles.transactionAmount, item.amount < 0 ? styles.negative : null]}>{money(item.amount, currency)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.footerNote}>Pull down to refresh. Figures shown here come from this phone’s current database.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' }, content: { paddingBottom: 28 },
  center: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: '#475569', marginTop: 12 }, errorTitle: { color: '#0f172a', fontSize: 19, fontWeight: '800', marginBottom: 18 },
  header: { backgroundColor: '#16a34a', paddingHorizontal: 22, paddingTop: 22, paddingBottom: 25, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { color: '#fff', fontSize: 21, fontWeight: '900' }, signOut: { color: '#fff', fontWeight: '800', textDecorationLine: 'underline' },
  tagline: { color: '#dcfce7', marginTop: 4, fontSize: 13 }, memberName: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 22 }, memberMeta: { color: '#f0fdf4', marginTop: 5, fontSize: 13 },
  sectionTitle: { color: '#0f172a', fontSize: 19, fontWeight: '900', marginHorizontal: 18, marginTop: 24, marginBottom: 11 },
  amountCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 9, padding: 16, borderRadius: 15, borderWidth: 1, borderColor: '#e2e8f0' }, cardLabel: { color: '#64748b', fontSize: 13, fontWeight: '700' }, cardValue: { fontSize: 22, fontWeight: '900', marginTop: 6 },
  datesCard: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 8, paddingHorizontal: 16, paddingBottom: 8, borderRadius: 15, borderWidth: 1, borderColor: '#e2e8f0' }, sectionTitleInside: { color: '#0f172a', fontSize: 16, fontWeight: '900', marginTop: 16, marginBottom: 10 }, dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }, dateLabel: { color: '#64748b', fontSize: 13 }, dateValue: { color: '#0f172a', fontSize: 13, fontWeight: '800' }, overdue: { color: '#dc2626' }, divider: { height: 1, backgroundColor: '#e2e8f0' },
  groupCard: { backgroundColor: '#f0fdf4', marginHorizontal: 16, marginBottom: 9, padding: 16, borderRadius: 15, borderWidth: 1, borderColor: '#bbf7d0' }, groupLabel: { color: '#166534', fontSize: 13, fontWeight: '700' }, groupValue: { color: '#14532d', fontSize: 21, fontWeight: '900', marginTop: 6 }, privacyNote: { marginHorizontal: 20, marginTop: 3, color: '#64748b', fontSize: 11, lineHeight: 16 },
  historyCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 15, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14 }, transaction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, gap: 10 }, transactionBorder: { borderTopWidth: 1, borderTopColor: '#e2e8f0' }, transactionText: { flex: 1 }, transactionTitle: { color: '#0f172a', fontSize: 13, fontWeight: '800' }, transactionDate: { color: '#64748b', fontSize: 11, marginTop: 4 }, transactionAmount: { color: '#166534', fontWeight: '900', fontSize: 13 }, negative: { color: '#b91c1c' }, empty: { color: '#64748b', textAlign: 'center', paddingVertical: 22 }, footerNote: { color: '#94a3b8', textAlign: 'center', fontSize: 11, marginHorizontal: 24, marginTop: 18, lineHeight: 16 },
  primaryButton: { backgroundColor: '#16a34a', paddingVertical: 13, paddingHorizontal: 28, borderRadius: 12, marginBottom: 18 }, primaryText: { color: '#fff', fontWeight: '800' }, backText: { color: '#166534', fontWeight: '700' },
});
