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
  share_value: 1000,
  minimum_shares_per_meeting: 1,
  maximum_shares_per_meeting: 5,
  maximum_loan_multiple: 3,
  loan_interest_percentage: 5,
  loan_interest_period: 'per month',
  maximum_loan_repayment_period: 12,
  social_fund_contribution: 0,
  absence_fine: 0,
  late_fine: 0,
  non_saving_fine: 0,
  meeting_frequency: 'weekly',
  cycle_duration_months: 12,
  leadership_term_months: 12,
  share_out_enabled: true,
};

export default function SetupRulesScreen({
  groupId,
}: Props) {
  const [rules, setRules] =
    useState<VSLASetupRuleUpdates>(DEFAULT_RULES);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRules();
  }, [groupId]);

  async function loadRules() {
    try {
      setLoading(true);

      const current = await getVSLASetupRules(groupId);

      if (!current) {
        setRules(DEFAULT_RULES);
        return;
      }

      setRules({
        share_value: current.share_value,
        minimum_shares_per_meeting:
          current.minimum_shares_per_meeting,
        maximum_shares_per_meeting:
          current.maximum_shares_per_meeting,
        maximum_loan_multiple:
          current.maximum_loan_multiple,
        loan_interest_percentage:
          current.loan_interest_percentage,
        loan_interest_period:
          current.loan_interest_period,
        maximum_loan_repayment_period:
          current.maximum_loan_repayment_period,
        social_fund_contribution:
          current.social_fund_contribution,
        absence_fine: current.absence_fine,
        late_fine: current.late_fine,
        non_saving_fine:
          current.non_saving_fine,
        meeting_frequency:
          current.meeting_frequency,
        cycle_duration_months:
          current.cycle_duration_months,
        leadership_term_months:
          current.leadership_term_months,
        share_out_enabled:
          current.share_out_enabled,
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
    if (
      Number(rules.share_value) <= 0 ||
      Number(rules.minimum_shares_per_meeting) <= 0 ||
      Number(rules.maximum_shares_per_meeting) <= 0 ||
      Number(rules.maximum_loan_multiple) <= 0 ||
      Number(rules.loan_interest_percentage) < 0 ||
      Number(rules.maximum_loan_repayment_period) <= 0 ||
      Number(rules.cycle_duration_months) <= 0 ||
      Number(rules.leadership_term_months) <= 0
    ) {
      Alert.alert(
        'Invalid Rules',
        'Please enter valid positive values for the required fields.',
      );
      return;
    }

    if (
      Number(rules.minimum_shares_per_meeting) >
      Number(rules.maximum_shares_per_meeting)
    ) {
      Alert.alert(
        'Invalid Shares',
        'Minimum shares cannot be greater than maximum shares.',
      );
      return;
    }

    try {
      setSaving(true);

      await updateVSLASetupRules(groupId, {
        ...rules,
        share_value: Number(rules.share_value),
        minimum_shares_per_meeting:
          Number(rules.minimum_shares_per_meeting),
        maximum_shares_per_meeting:
          Number(rules.maximum_shares_per_meeting),
        maximum_loan_multiple:
          Number(rules.maximum_loan_multiple),
        loan_interest_percentage:
          Number(rules.loan_interest_percentage),
        maximum_loan_repayment_period:
          Number(rules.maximum_loan_repayment_period),
        social_fund_contribution:
          Number(rules.social_fund_contribution),
        absence_fine: Number(rules.absence_fine),
        late_fine: Number(rules.late_fine),
        non_saving_fine:
          Number(rules.non_saving_fine),
        cycle_duration_months:
          Number(rules.cycle_duration_months),
        leadership_term_months:
          Number(rules.leadership_term_months),
      });

      await loadRules();

      Alert.alert(
        'Saved',
        'Setup rules updated successfully.',
      );
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
        <ActivityIndicator
          size="large"
          color="#16a34a"
        />
        <Text style={styles.loadingText}>
          Loading setup rules...
        </Text>
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

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Share Rules
        </Text>

        <Text style={styles.label}>
          Share Value
        </Text>

        <TextInput
          style={styles.input}
          value={String(rules.share_value)}
          onChangeText={(value) =>
            updateRule(
              'share_value',
              Number(value) || 0,
            )
          }
          keyboardType="numeric"
          placeholder="1000"
        />

        <Text style={styles.label}>
          Minimum Shares Per Meeting
        </Text>

        <TextInput
          style={styles.input}
          value={String(
            rules.minimum_shares_per_meeting,
          )}
          onChangeText={(value) =>
            updateRule(
              'minimum_shares_per_meeting',
              Number(value) || 0,
            )
          }
          keyboardType="numeric"
          placeholder="1"
        />

        <Text style={styles.label}>
          Maximum Shares Per Meeting
        </Text>

        <TextInput
          style={styles.input}
          value={String(
            rules.maximum_shares_per_meeting,
          )}
          onChangeText={(value) =>
            updateRule(
              'maximum_shares_per_meeting',
              Number(value) || 0,
            )
          }
          keyboardType="numeric"
          placeholder="5"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Loan Rules
        </Text>

        <Text style={styles.label}>
          Maximum Loan Multiple
        </Text>

        <TextInput
          style={styles.input}
          value={String(
            rules.maximum_loan_multiple,
          )}
          onChangeText={(value) =>
            updateRule(
              'maximum_loan_multiple',
              Number(value) || 0,
            )
          }
          keyboardType="decimal-pad"
          placeholder="3"
        />

        <Text style={styles.label}>
          Loan Interest Percentage
        </Text>

        <TextInput
          style={styles.input}
          value={String(
            rules.loan_interest_percentage,
          )}
          onChangeText={(value) =>
            updateRule(
              'loan_interest_percentage',
              Number(value) || 0,
            )
          }
          keyboardType="decimal-pad"
          placeholder="5"
        />

        <Text style={styles.label}>
          Interest Period
        </Text>

        <View style={styles.optionRow}>
          {[
            'per month',
            'per cycle',
            'per loan',
          ].map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.optionButton,
                rules.loan_interest_period ===
                  period &&
                  styles.optionButtonActive,
              ]}
              onPress={() =>
                updateRule(
                  'loan_interest_period',
                  period,
                )
              }
            >
              <Text
                style={[
                  styles.optionText,
                  rules.loan_interest_period ===
                    period &&
                    styles.optionTextActive,
                ]}
              >
                {period}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>
          Maximum Loan Repayment Period
        </Text>

        <TextInput
          style={styles.input}
          value={String(
            rules.maximum_loan_repayment_period,
          )}
          onChangeText={(value) =>
            updateRule(
              'maximum_loan_repayment_period',
              Number(value) || 0,
            )
          }
          keyboardType="numeric"
          placeholder="12"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Fund Rules
        </Text>

        <Text style={styles.label}>
          Social Fund Contribution
        </Text>

        <TextInput
          style={styles.input}
          value={String(
            rules.social_fund_contribution,
          )}
          onChangeText={(value) =>
            updateRule(
              'social_fund_contribution',
              Number(value) || 0,
            )
          }
          keyboardType="decimal-pad"
          placeholder="0"
        />

        <Text style={styles.label}>
          Absence Fine
        </Text>

        <TextInput
          style={styles.input}
          value={String(rules.absence_fine)}
          onChangeText={(value) =>
            updateRule(
              'absence_fine',
              Number(value) || 0,
            )
          }
          keyboardType="decimal-pad"
          placeholder="0"
        />

        <Text style={styles.label}>
          Late Fine
        </Text>

        <TextInput
          style={styles.input}
          value={String(rules.late_fine)}
          onChangeText={(value) =>
            updateRule(
              'late_fine',
              Number(value) || 0,
            )
          }
          keyboardType="decimal-pad"
          placeholder="0"
        />

        <Text style={styles.label}>
          Non-Saving Fine
        </Text>

        <TextInput
          style={styles.input}
          value={String(
            rules.non_saving_fine,
          )}
          onChangeText={(value) =>
            updateRule(
              'non_saving_fine',
              Number(value) || 0,
            )
          }
          keyboardType="decimal-pad"
          placeholder="0"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Meeting & Cycle Rules
        </Text>

        <Text style={styles.label}>
          Meeting Frequency
        </Text>

        <View style={styles.optionRow}>
          {[
            'weekly',
            'biweekly',
            'monthly',
          ].map((frequency) => (
            <TouchableOpacity
              key={frequency}
              style={[
                styles.optionButton,
                rules.meeting_frequency ===
                  frequency &&
                  styles.optionButtonActive,
              ]}
              onPress={() =>
                updateRule(
                  'meeting_frequency',
                  frequency,
                )
              }
            >
              <Text
                style={[
                  styles.optionText,
                  rules.meeting_frequency ===
                    frequency &&
                    styles.optionTextActive,
                ]}
              >
                {frequency}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>
          Cycle Duration (Months)
        </Text>

        <TextInput
          style={styles.input}
          value={String(
            rules.cycle_duration_months,
          )}
          onChangeText={(value) =>
            updateRule(
              'cycle_duration_months',
              Number(value) || 0,
            )
          }
          keyboardType="numeric"
          placeholder="12"
        />

        <Text style={styles.label}>
          Leadership Term (Months)
        </Text>

        <TextInput
          style={styles.input}
          value={String(
            rules.leadership_term_months,
          )}
          onChangeText={(value) =>
            updateRule(
              'leadership_term_months',
              Number(value) || 0,
            )
          }
          keyboardType="numeric"
          placeholder="12"
        />

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>
              Share-Out Enabled
            </Text>

            <Text style={styles.description}>
              Allow the group to perform share-out.
            </Text>
          </View>

          <Switch
            value={rules.share_out_enabled}
            onValueChange={(value) =>
              updateRule(
                'share_out_enabled',
                value,
              )
            }
            trackColor={{
              false: '#d1d5db',
              true: '#86efac',
            }}
            thumbColor="#16a34a"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.saveButton,
          saving && styles.saveButtonDisabled,
        ]}
        onPress={saveRules}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.saveButtonText}>
            Save Setup Rules
          </Text>
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

  optionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },

  optionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },

  optionButtonActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },

  optionText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 12,
  },

  optionTextActive: {
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
