import React, { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { getFinancialSummary } from '../database/database';

type Props = {
  route?: {
    params?: {
      groupId?: number;
    };
  };
};

export default function SavingsScreen({ route }: Props) {
  const groupId = route?.params?.groupId;
  const [totalSavings, setTotalSavings] = useState(0);

  useEffect(() => {
    let mounted = true;

    const loadSavings = async () => {
      if (!groupId) return;

      try {
        const summary = await getFinancialSummary(groupId);

        if (mounted) {
          setTotalSavings(summary.savings ?? 0);
        }
      } catch (error) {
        console.error('Failed to load savings:', error);
      }
    };

    loadSavings();

    return () => {
      mounted = false;
    };
  }, [groupId]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Savings</Text>

        <Text style={styles.amount}>
          UGX {totalSavings.toLocaleString()}
        </Text>

        <Text style={styles.subtitle}>
          Total group savings
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#16a34a',
  },
  amount: {
    marginTop: 20,
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
  },
});
