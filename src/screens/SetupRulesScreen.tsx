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
  getSetupRules,
  updateSetupRules,
  GroupSetupRules,
} from '../database/database';

type Props = {
  groupId: number;
  executiveMemberId: number;
};

export default function SetupRulesScreen({
  groupId,
  executiveMemberId,
}: Props) {
  const [rules, setRules] = useState<GroupSetupRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [passcode, setPasscode] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    loadRules();
  }, [groupId]);

  async function loadRules() {
    try {
      setLoading(true);
      const data = await getSetupRules(groupId);
      setRules(data);
    } catch (error) {
      Alert.alert(
        'Error',
        'Unable to load Setup Rules.',
      );
    } finally {
      setLoading(false);
    }
  }

  function updateRule<K extends keyof GroupSetupRules>(
    key: K,
    value: GroupSetupRules[K],
  ) {
    setRules((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  }

  async function saveChanges() {
    if (!rules) return;

    if (passcode.length !== 4) {
      Alert.alert(
        'Passcode Required',
        'Enter your 4-character executive passcode.',
      );
      return;
    }

    if (!reason.trim()) {
      Alert.alert(
        'Reason Required',
        'Enter a reason for changing the Setup Rules.',
      );
      return;
    }

    if (
      rules.loanCapMultiplier < 2 ||
      rules.loanCapMultiplier > 100 ||
      !Number.isInteger(rules.loanCapMultiplier)
    ) {
      Alert.alert(
        'Invalid Multiplier',
        'Loan multiplier must be a whole number from 2 to 100.',
      );
      return;
    }

    if (rules.loanInterestPercentage < 0) {
      Alert.alert(
        'Invalid Interest',
        'Interest percentage cannot be negative.',
      );
      return;
    }

    if (rules.loanGracePeriodDays < 0) {
      Alert.alert(
        'Invalid Grace Period',
        'Grace period cannot be negative.',
      );
      return;
    }

    if (rules.loanRepaymentPeriodDays <= 0) {
      Alert.alert(
        'Invalid Repayment Period',
        'Repayment period must be greater than zero.',
      );
      return;
    }

    if (rules.loanRequiredCommitteeApprovals < 0) {
      Alert.alert(
        'Invalid Approvals',
        'Committee approvals cannot be negative.',
      );
      return;
    }

    if (rules.insuranceContributionAmount < 0) {
      Alert.alert(
        'Invalid Insurance',
        'Insurance contribution cannot be negative.',
      );
      return;
    }

    try {
      setSaving(true);

      await updateSetupRules(
        groupId,
        executiveMemberId,
        passcode,
        rules,
        undefined,
        reason.trim(),
      );

      setPasscode('');
      setReason('');

      await loadRules();

      Alert.alert(
        'Saved',
        'Setup Rules have been saved successfully.',
      );
    } catch (error: any) {
      Alert.alert(
        'Unable to Save',
        error?.message || 'The Setup Rules could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.loadingText}>
          Loading Setup Rules...
        </Text>
      </View>
    );
  }

  if (!rules) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          Setup Rules could not be loaded.
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadRules}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
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
        <Text style={styles.subtitle}>
          Rules for this VSLA group
        </Text>
      </View>

      {/* SAVINGS */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Savings Rules</Text>

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.label}>Use Savings</Text>
            <Text style={styles.description}>
              Members' savings can be used when determining loan limits.
            </Text>
          </View>

          <Switch
            value={rules.usesSavings}
            onValueChange={(value) =>
              updateRule('usesSavings', value)
            }
            trackColor={{
              false: '#d1d5db',
              true: '#86efac',
            }}
            thumbColor={
              rules.usesSavings ? '#16a34a' : '#f4f4f5'
            }
          />
        </View>

        {rules.usesSavings && (
          <View style={styles.field}>
            <Text style={styles.label}>
              Maximum Loan Multiplier
            </Text>

            <TextInput
              style={styles.input}
              value={String(rules.loanCapMultiplier)}
              onChangeText={(text) => {
                const value = Number(text);
                if (!Number.isNaN(value)) {
                  updateRule('loanCapMultiplier', value);
                }
              }}
              keyboardType="numeric"
              placeholder="2 - 100"
            />

            <Text style={styles.description}>
              Example: 3 means a member may qualify for up to
              3× their savings.
            </Text>
          </View>
        )}
      </View>

      {/* LOAN RULES */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Loan Rules</Text>

        <View style={styles.field}>
          <Text style={styles.label}>
            Interest Percentage
          </Text>

          <TextInput
            style={styles.input}
            value={String(rules.loanInterestPercentage)}
            onChangeText={(text) => {
              const value = Number(text);
              if (!Number.isNaN(value)) {
                updateRule(
                  'loanInterestPercentage',
                  value,
                );
              }
            }}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Interest Method</Text>

          <View style={styles.optionRow}>
            {(['fixed', 'flat', 'declining'] as const).map(
              (method) => (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.option,
                    rules.loanInterestMethod === method &&
                      styles.optionSelected,
                  ]}
                  onPress={() =>
                    updateRule(
                      'loanInterestMethod',
                      method,
                    )
                  }
                >
                  <Text
                    style={[
                      styles.optionText,
                      rules.loanInterestMethod === method &&
                        styles.optionTextSelected,
                    ]}
                  >
                    {method.charAt(0).toUpperCase() +
                      method.slice(1)}
                  </Text>
                </TouchableOpacity>
              ),
            )}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            Grace Period (Days)
          </Text>

          <TextInput
            style={styles.input}
            value={String(rules.loanGracePeriodDays)}
            onChangeText={(text) => {
              const value = Number(text);
              if (!Number.isNaN(value)) {
                updateRule(
                  'loanGracePeriodDays',
                  value,
                );
              }
            }}
            keyboardType="numeric"
            placeholder="0"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            Repayment Period (Days)
          </Text>

          <TextInput
            style={styles.input}
            value={String(
              rules.loanRepaymentPeriodDays,
            )}
            onChangeText={(text) => {
              const value = Number(text);
              if (!Number.isNaN(value)) {
                updateRule(
                  'loanRepaymentPeriodDays',
                  value,
                );
              }
            }}
            keyboardType="numeric"
            placeholder="90"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            Required Committee Approvals
          </Text>

          <TextInput
            style={styles.input}
            value={String(
              rules.loanRequiredCommitteeApprovals,
            )}
            onChangeText={(text) => {
              const value = Number(text);
              if (!Number.isNaN(value)) {
                updateRule(
                  'loanRequiredCommitteeApprovals',
                  value,
                );
              }
            }}
            keyboardType="numeric"
            placeholder="1"
          />
        </View>
      </View>

      {/* FUND RULES */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Fund Rules</Text>

        <View style={styles.switchRow}>
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
            thumbColor={
              rules.insuranceEnabled
                ? '#16a34a'
                : '#f4f4f5'
            }
          />
        </View>

        {rules.insuranceEnabled && (
          <View style={styles.field}>
            <Text style={styles.label}>
              Insurance Contribution Amount
            </Text>

            <TextInput
              style={styles.input}
              value={String(
                rules.insuranceContributionAmount,
              )}
              onChangeText={(text) => {
                const value = Number(text);
                if (!Number.isNaN(value)) {
                  updateRule(
                    'insuranceContributionAmount',
                    value,
                  );
                }
              }}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </View>
        )}

        <View style={styles.switchRow}>
          <Text style={styles.label}>Fines Fund</Text>
          <Switch
            value={rules.finesEnabled}
            onValueChange={(value) =>
              updateRule('finesEnabled', value)
            }
            trackColor={{
              false: '#d1d5db',
              true: '#86efac',
            }}
            thumbColor={
              rules.finesEnabled
                ? '#16a34a'
                : '#f4f4f5'
            }
          />
        </View>

        <View style={styles.switchRow}>
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
            thumbColor={
              rules.socialFundEnabled
                ? '#16a34a'
                : '#f4f4f5'
            }
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.label}>External Fund</Text>
          <Switch
            value={rules.externalFundEnabled}
            onValueChange={(value) =>
              updateRule(
                'externalFundEnabled',
                value,
              )
            }
            trackColor={{
              false: '#d1d5db',
              true: '#86efac',
            }}
            thumbColor={
              rules.externalFundEnabled
                ? '#16a34a'
                : '#f4f4f5'
            }
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.label}>Expenditure Fund</Text>
          <Switch
            value={rules.expenditureFundEnabled}
            onValueChange={(value) =>
              updateRule(
                'expenditureFundEnabled',
                value,
              )
            }
            trackColor={{
              false: '#d1d5db',
              true: '#86efef'
            }}
            thumbColor={
              rules.expenditureFundEnabled
                ? '#16a34a'
                : '#f4f4f5'
            }
          />
        </View>
      </View>

      {/* AUTHORIZATION */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Executive Authorization
        </Text>

        <Text style={styles.description}>
          An executive must authorize changes to the
          group's Setup Rules.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>
            Executive Passcode
          </Text>

          <TextInput
            style={styles.input}
            value={passcode}
            onChangeText={setPasscode}
            maxLength={4}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="4 characters"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            Reason for Change
          </Text>

          <TextInput
            style={[
              styles.input,
              styles.reasonInput,
            ]}
            value={reason}
            onChangeText={setReason}
            multiline
            placeholder="Enter the reason for changing these rules"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.saveButton,
          saving && styles.saveButtonDisabled,
        ]}
        onPress={saveChanges}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.saveText}>
            Save Setup Rules
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7f5',
  },

  content: {
    padding: 16,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f5f7f5',
  },

  loadingText: {
    marginTop: 10,
    fontSize: 15,
    color: '#4b5563',
  },

  errorText: {
    fontSize: 16,
    color: '#dc2626',
    textAlign: 'center',
  },

  retryButton: {
    marginTop: 16,
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },

  retryText: {
    color: '#ffffff',
    fontWeight: '700',
  },

  header: {
    marginBottom: 16,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#166534',
  },

  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#6b7280',
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#166534',
    marginBottom: 14,
  },

  field: {
    marginTop: 14,
  },

  label: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    flex: 1,
  },

  description: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: '#6b7280',
  },

  input: {
    marginTop: 7,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
  },

  reasonInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },

  switchRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 8,
  },

  switchText: {
    flex: 1,
    paddingRight: 10,
  },

  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 8,
  },

  option: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },

  optionSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },

  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },

  optionTextSelected: {
    color: '#ffffff',
  },

  saveButton: {
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },

  saveButtonDisabled: {
    opacity: 0.65,
  },

  saveText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },

  bottomSpace: {
    height: 30,
  },
});
