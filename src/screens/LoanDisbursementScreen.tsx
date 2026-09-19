import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function LoanDisbursementScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Loan Disbursement</Text>
        <Text style={styles.subtitle}>
          Loan disbursement functions will be added here.
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
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
  },
});
