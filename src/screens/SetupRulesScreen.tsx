import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  getVSLASetupRules,
  updateVSLASetupRules,
  VSLASetupRuleUpdates,
} from '../database/database';

type Props = {
  groupId: number;
  executiveMemberId: number;
};

const DEFAULT_RULES: VSLASetupRuleUpdates = {
  usesSavings: true,
  loanCapMultiplier: 3,
  loanInterestPercentage: 0,
  loanInterestMethod: 'flat',
  loanGracePeriodDays: 0,
  loanRepaymentPeriodDays: 90,
  loanRequiredCommitteeApprovals: 1,
  insuranceEnabled: true,
  insuranceContributionAmount: 0,
  finesEnabled: true,
  socialFundEnabled: true,
  externalFundEnabled: true,
  expenditureFundEnabled: true,
};

export default function SetupRulesScreen({
  groupId,
  executiveMemberId,
}: Props) {
  const [rules, setRules] = useState<VSLASetupRuleUpdates>(DEFAULT_RULES);
  const [passcode, setPasscode] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRules();
  }, [groupId]);

  async function loadRules() {
    try {
      setLoading(true);

      const current = await getVSLASetupRules(groupId);

      setRules({
        usesSavings: current.usesSavings,
        loanCapMultiplier: current.loanCapMultiplier,
        loanInterestPercentage: current.loanInterestPercentage,
        loanInterestMethod: current.loanInterestMethod,
        loanGracePeriodDays: current.loanGracePeriodDays,
        loanRepaymentPeriodDays: current.loanRepaymentPeriodDays,
        loanRequiredCommitteeApprovals:
          current.loanRequiredCommitteeApprovals,
        insuranceEnabled: current.insuranceEnabled,
        insuranceContributionAmount:
          current.insuranceContributionAmount,
        finesEnabled: current.finesEnabled,
        socialFundEnabled: current.socialFundEnabled,
        externalFundEnabled: current.externalFundEnabled,
        expenditureFundEnabled: current.expenditureFundEnabled,
      });
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Failed to load setup rules.',
      );
    } finally {
      setLoading(false);
    }
  }

  function updateRule<K extends keyof VSLASetupRuleUpdates>(
    key: K,
    value: VSLASetupRuleUpdates[K],
  ) {
    setRules((current: VSLASetupRuleUpdates) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveRules() {
    if (passcode.trim().length < 4) {
      Alert.alert('Passcode Required', 'Enter an executive passcode of at least 4 characters.');
      return;
    }

    if (!reason.trim()) {
      Alert.alert('Reason Required', 'Enter a reason for changing the setup rules.');
      return;
    }

    const multiplier = Number(rules.loanCapMultiplier);
    const interest = Number(rules.loanInterestPercentage);
    const grace = Number(rules.loanGracePeriodDays);
    const repayment = Number(rules.loanRepaymentPeriodDays);
    const approvals = Number(rules.loanRequiredCommitteeApprovals);
    const insuranceAmount = Number(rules.insuranceContributionAmount);

    if (!Number.isInteger(multiplier) || multiplier < 2 || multiplier > 100) {
      Alert.alert('Invalid Loan Multiplier', 'Loan multiplier must be an integer from 2 to 100.');
      return;
    }

    if (!Number.isFinite(interest) || interest < 0) {
      Alert.alert('Invalid Interest', 'Interest percentage cannot be negative.');
      return;
    }

    if (!Number.isInteger(grace) || grace < 0) {
      Alert.alert('Invalid Grace Period', 'Grace period must be 0 or more days.');
      return;
    }

    if (!Number.isInteger(repayment) || repayment <= 0) {
      Alert.alert('Invalid Repayment Period', 'Repayment period must be greater than 0 days.');
      return;
    }

    if (!Number.isInteger(approvals) || approvals < 0) {
      Alert.alert('Invalid Approvals', 'Committee approvals must be 0 or more.');
      return;
    }

    if (!Number.isFinite(insuranceAmount) || insuranceAmount < 0) {
      Alert.alert(
        'Invalid Insurance Contribution',
        'Insurance contribution cannot be negative.',
      );
      return;
    }

    try {
      setSaving(true);

      await updateVSLASetupRules(
        groupId,
        executiveMemberId,
        passcode,
        {
          ...rules,
          loanCapMultiplier: multiplier,
          loanInterestPercentage: interest,
          loanGracePeriodDays: grace,
          loanRepaymentPeriodDays: repayment,
          loanRequiredCommitteeApprovals: approvals,
          insuranceContributionAmount: insuranceAmount,
        },
        undefined,
        reason.trim(),
      );

      setPasscode('');
      setReason('');

      await loadRules();

      Alert.alert('Saved', 'Setup rules updated successfully.');
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Failed to update setup rules.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.loadingText}>Loading setup rules...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Setup Rules</Text>
        <Text style={styles.subtitle}>Rules for this VSLA group</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Savings Rules</Text>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Use Savings</Text>
            <Text style={styles.description}>
              Members use savings when calculating loan limits.
            </Text>
          </View>

          <Switch
            value={rules.usesSavings}
            onValueChange={(value) => updateRule('usesSavings', value)}
            trackColor={{
              false: '#d1d5db',
              true: '#86efac',
            }}
            thumbColor="#16a34a"
          />
        </View>

        <Text style={styles.label}>Loan Cap Multiplier</Text>
        <TextInput
          style={styles.input}
          value={String(rules.loanCapMultiplier)}
          onChangeText={(value) =>
            updateRule('loanCapMultiplier', Number(value) || 0)
          }
          keyboardType="numeric"
          placeholder="3"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Loan Rules</Text>

        <Text style={styles.label}>Interest Percentage</Text>
        <TextInput
          style={styles.input}
          value={String(rules.loanInterestPercentage)}
          onChangeText={(value) =>
            updateRule('loanInterestPercentage', Number(value) || 0)
          }
          keyboardType="decimal-pad"
          placeholder="0"
        />

        <Text style={styles.label}>Interest Method</Text>

        <View style={styles.methodRow}>
          {(['fixed', 'flat', 'declining'] as const).map((method) => (
            <TouchableOpacity
              key={method}
              style={[
                styles.methodButton,
                rules.loanInterestMethod === method &&
                  styles.methodButtonActive,
              ]}
              onPress={() => updateRule('loanInterestMethod', method)}
            >
              <Text
                style={[
                  styles.methodText,
                  rules.loanInterestMethod === method &&
                    styles.methodTextActive,
                ]}
              >
                {method.charAt(0).toUpperCase() + method.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Grace Period (Days)</Text>
        <TextInput
          style={styles.input}
          value={String(rules.loanGracePeriodDays)}
          onChangeText={(value) =>
            updateRule('loanGracePeriodDays', Number(value) || 0)
          }
          keyboardType="numeric"
          placeholder="0"
        />

        <Text style={styles.label}>Repayment Period (Days)</Text>
        <TextInput
          style={styles.input}
          value={String(rules.loanRepaymentPeriodDays)}
          onChangeText={(value) =>
            updateRule('loanRepaymentPeriodDays', Number(value) || 0)
          }
          keyboardType="numeric"
          placeholder="90"
        />

        <Text style={styles.label}>Required Committee Approvals</Text>
        <TextInput
          style={styles.input}
          value={String(rules.loanRequiredCommitteeApprovals)}
          onChangeText={(value) =>
            updateRule(
              'loanRequiredCommitteeApprovals',
              Number(value) || 0,
            )
          }
          keyboardType="numeric"
          placeholder="1"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Fund Rules</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Insurance Fund</Text>
          <Switch
            value={rules.insuranceEnabled}
            onValueChange={(value) =>
              updateRule('insuranceEnabled', value)
            }
            trackColor={{
              false: '#d1d5db',
              true: '#86efac',
            }}
            thumbColor="#16a34a"
          />
        </View>

        <Text style={styles.label}>Insurance Contribution</Text>
        <TextInput
          style={styles.input}
          value={String(rules.insuranceContributionAmount)}
          onChangeText={(value) =>
            updateRule(
              'insuranceContributionAmount',
              Number(value) || 0,
            )
          }
          keyboardType="decimal-pad"
          placeholder="0"
        />

        <View style={styles.row}>
          <Text style={styles.label}>Fines Fund</Text>
          <Switch
            value={rules.finesEnabled}
            onValueChange={(value) => updateRule('finesEnabled', value)}
            trackColor={{
              false: '#d1d5db',
              true: '#86efac',
            }}
            thumbColor="#16a34a"
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Social Fund</Text>
          <Switch
            value={rules.socialFundEnabled}
            onValueChange={(value) =>
              updateRule('socialFundEnabled', value)
            }
            trackColor={{
              false: '#d1d5db',
              true: '#86efac',
            }}
            thumbColor="#16a34a"
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>External Fund</Text>
          <Switch
            value={rules.externalFundEnabled}
            onValueChange={(value) =>
              updateRule('externalFundEnabled', value)
            }
            trackColor={{
              false: '#d1d5db',
              true: '#86efac',
            }}
            thumbColor="#16a34a"
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Expenditure Fund</Text>
          <Switch
            value={rules.expenditureFundEnabled}
            onValueChange={(value) =>
              updateRule('expenditureFundEnabled', value)
            }
            trackColor={{
              false: '#d1d5db',
              true: '#86efac',
            }}
            thumbColor="#16a34a"
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Executive Authorization</Text>

        <Text style={styles.label}>Executive Passcode</Text>
        <TextInput
          style={styles.input}
          value={passcode}
          onChangeText={setPasscode}
          secureTextEntry
          maxLength={100}
          placeholder="Enter passcode"
        />

        <Text style={styles.label}>Reason for Change</Text>
        <TextInput
          style={[styles.input, styles.reasonInput]}
          value={reason}
          onChangeText={setReason}
          multiline
          placeholder="Enter reason"
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={saveRules}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.saveButtonText}>Save Setup Rules</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 10,
    color: '#4b5563',
  },
  header: {
    backgroundColor: '#16a34a',
    padding: 20,
    borderRadius: 14,
    marginBottom: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#dcfce7',
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
  },
  sectionTitle: {
    color: '#166534',
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  label: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 7,
  },
  description: {
    color: '#6b7280',
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
    marginBottom: 14,
  },
  reasonInput: {
    minHeight: 90,
  },
  methodRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  methodButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  methodButtonActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  methodText: {
    color: '#374151',
    fontWeight: '600',
  },
  methodTextActive: {
    color: '#ffffff',
  },
  saveButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
