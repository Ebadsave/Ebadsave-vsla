import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';

import {
  getFinancialAccounts,
  getOpenMeeting,
  recordExternalFund,
} from '../database/database';

type ExternalFundsRouteParams = {
  ExternalFunds: {
    groupId?: number;
    meetingId?: number | null;
    currency?: string;
  };
};

type AccountItem = {
  id: number;
  group_id: number;
  account_type: string;
  balance: number;
  created_at: string;
  updated_at: string;
};

export default function ExternalFundsScreen() {
  const route =
    useRoute<RouteProp<ExternalFundsRouteParams, 'ExternalFunds'>>();

  const params = route.params ?? {};

  const groupId = Number(params.groupId ?? 0);

  const suppliedMeetingId =
    params.meetingId === undefined || params.meetingId === null
      ? null
      : Number(params.meetingId);

  // UGX is only the default. The app can use another country's currency.
  const currency = params.currency?.trim() || 'UGX';

  const [meetingId, setMeetingId] =
    useState<number | null>(suppliedMeetingId);

  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const formatAmount = (value: number) => {
    return `${currency} ${value.toLocaleString()}`;
  };

  const loadData = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let activeMeetingId = suppliedMeetingId;

      if (activeMeetingId === null) {
        const openMeeting = await getOpenMeeting(groupId);
        activeMeetingId = openMeeting?.id ?? null;
      }

      setMeetingId(activeMeetingId);

      const accounts =
        await getFinancialAccounts(groupId);

      const externalFundAccount =
        (accounts as AccountItem[]).find(
          (account) =>
            account.account_type === 'external_fund',
        );

      setBalance(
        externalFundAccount?.balance ?? 0,
      );
    } catch (error) {
      Alert.alert(
        'External Funds',
        error instanceof Error
          ? error.message
          : 'Unable to load External Funds.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, suppliedMeetingId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSave = async () => {
    const numericAmount = Number(
      amount.replace(/,/g, '').trim(),
    );

    if (!groupId) {
      Alert.alert(
        'Group required',
        'No group was selected.',
      );
      return;
    }

    if (!meetingId) {
      Alert.alert(
        'Meeting not started',
        'Start the meeting before recording external funds.',
      );
      return;
    }

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      Alert.alert(
        'Invalid amount',
        'Enter an amount greater than zero.',
      );
      return;
    }

    if (!reason.trim()) {
      Alert.alert(
        'Reason required',
        'Enter the source or reason for the external funds.',
      );
      return;
    }

    setSaving(true);

    try {
      await recordExternalFund(
        groupId,
        numericAmount,
        reason.trim(),
        meetingId,
      );

      setAmount('');
      setReason('');

      await loadData();

      Alert.alert(
        'Saved',
        `${formatAmount(
          numericAmount,
        )} has been added to the External Fund.`,
      );
    } catch (error) {
      Alert.alert(
        'Unable to save',
        error instanceof Error
          ? error.message
          : 'Unable to record the external fund.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>
            External Funds
          </Text>

          <Text style={styles.subtitle}>
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>
          External Funds
        </Text>

        <Text style={styles.subtitle}>
          Record money received from outside the VSLA.
        </Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>
            External Fund Balance
          </Text>

          <Text style={styles.balance}>
            {formatAmount(balance)}
          </Text>
        </View>

        <Text style={styles.label}>
          Amount
        </Text>

        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="Enter amount"
          keyboardType="numeric"
          editable={!saving}
        />

        <Text style={styles.label}>
          Source / Reason
        </Text>

        <TextInput
          style={[
            styles.input,
            styles.reasonInput,
          ]}
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Donation, grant, support"
          multiline
          editable={!saving}
        />

        <TouchableOpacity
          style={[
            styles.button,
            saving && styles.buttonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.buttonText}>
            {saving
              ? 'Saving...'
              : 'Add External Fund'}
          </Text>
        </TouchableOpacity>
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
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#16a34a',
    textAlign: 'center',
  },

  subtitle: {
    marginTop: 10,
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
  },

  balanceCard: {
    marginTop: 24,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },

  balanceLabel: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
  },

  balance: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: '700',
    color: '#16a34a',
    textAlign: 'center',
  },

  label: {
    marginTop: 20,
    marginBottom: 7,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },

  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },

  reasonInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },

  button: {
    marginTop: 25,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
