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

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  getVSLASetupRules,
  updateVSLASetupRules,
  VSLASetupRuleUpdates,
} from '../database/database';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'SetupRules'
>;

type Props = NativeStackScreenProps<
  RootStackParamList,
  'SetupRules'
>;

const DEFAULT_RULES: VSLASetupRuleUpdates = {
  shareValue: 1000,
  minimumSharesPerMeeting: 1,
  maximumSharesPerMeeting: 5,
  maximumLoanMultiple: 3,
  loanInterestPercentage: 5,
  loanInterestPeriod: 'per month',
  maximumLoanRepaymentPeriod: 12,
  socialFundContribution: 0,
  absenceFine: 0,
  lateFine: 0,
  nonSavingFine: 0,
  meetingFrequency: 'weekly',
  cycleDurationMonths: 12,
  leadershipTermMonths: 12,
  shareOutEnabled: true,
};

export default function SetupRulesScreen({
  route,
}: Props) {
  const { groupId } = route.params;

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
        shareValue: current.share_value,
        minimumSharesPerMeeting:
          current.minimum_shares_per_meeting,
        maximumSharesPerMeeting:
          current.maximum_shares_per_meeting,
        maximumLoanMultiple:
          current.maximum_loan_multiple,
        loanInterestPercentage:
          current.loan_interest_percentage,
        loanInterestPeriod:
          current.loan_interest_period,
        maximumLoanRepaymentPeriod:
          current.maximum_loan_repayment_period,
        socialFundContribution:
          current.social_fund_contribution,
        absenceFine: current.absence_fine,
        lateFine: current.late_fine,
        nonSavingFine:
          current.non_saving_fine,
        meetingFrequency:
          current.meeting_frequency,
        cycleDurationMonths:
          current.cycle_duration_months,
        leadershipTermMonths:
          current.leadership_term_months,
        shareOutEnabled:
          Boolean(current.share_out_enabled),
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
    setRules((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveRules() {
    if (
      Number(rules.shareValue) <= 0 ||
      Number(rules.minimumSharesPerMeeting) <= 0 ||
      Number(rules.maximumSharesPerMeeting) <= 0 ||
      Number(rules.maximumLoanMultiple) <= 0 ||
      Number(rules.loanInterestPercentage) < 0 ||
      Number(rules.maximumLoanRepaymentPeriod) <= 0 ||
      Number(rules.cycleDurationMonths) <= 0 ||
      Number(rules.leadershipTermMonths) <= 0
    ) {
      Alert.alert(
        'Invalid Rules',
        'Please enter valid positive values for the required fields.',
      );
      return;
    }

    if (
      Number(rules.minimumSharesPerMeeting) >
      Number(rules.maximumSharesPerMeeting)
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
        shareValue: Number(rules.shareValue),
        minimumSharesPerMeeting:
          Number(rules.minimumSharesPerMeeting),
        maximumSharesPerMeeting:
          Number(rules.maximumSharesPerMeeting),
        maximumLoanMultiple:
          Number(rules.maximumLoanMultiple),
        loanInterestPercentage:
          Number(rules.loanInterestPercentage),
        maximumLoanRepaymentPeriod:
          Number(rules.maximumLoanRepaymentPeriod),
        socialFundContribution:
          Number(rules.socialFundContribution),
        absenceFine: Number(rules.absenceFine),
        lateFine: Number(rules.lateFine),
        nonSavingFine:
          Number(rules.nonSavingFine),
        cycleDurationMonths:
          Number(rules.cycleDurationMonths),
        leadershipTermMonths:
          Number(rules.leadershipTermMonths),
        shareOutEnabled:
          Boolean(rules.shareOutEnabled),
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
        <Text style={styles.title}>
          Setup Rules
        </Text>

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
          value={String(rules.shareValue)}
          onChangeText={(value) =>
            updateRule(
              'shareValue',
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
            rules.minimumSharesPerMeeting,
          )}
          onChangeText={(value) =>
            updateRule(
              'minimumSharesPerMeeting',
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
            rules.maximumSharesPerMeeting,
          )}
          onChangeText={(value) =>
            updateRule(
              'maximumSharesPerMeeting',
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
            rules.maximumLoanMultiple,
          )}
          onChangeText={(value) =>
            updateRule(
              'maximumLoanMultiple',
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
            rules.loanInterestPercentage,
          )}
          onChangeText={(value) =>
            updateRule(
              'loanInterestPercentage',
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
                rules.loanInterestPeriod ===
                  period &&
                  styles.optionButtonActive,
              ]}
              onPress={() =>
                updateRule(
                  'loanInterestPeriod',
                  period,
                )
              }
            >
              <Text
                style={[
                  styles.optionText,
                  rules.loanInterestPeriod ===
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
            rules.maximumLoanRepaymentPeriod,
          )}
          onChangeText={(value) =>
            updateRule(
              'maximumLoanRepaymentPeriod',
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
            rules.socialFundContribution,
          )}
          onChangeText={(value) =>
            updateRule(
              'socialFundContribution',
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
          value={String(rules.absenceFine)}
          onChangeText={(value) =>
            updateRule(
              'absenceFine',
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
          value={String(rules.lateFine)}
          onChangeText={(value) =>
            updateRule(
              'lateFine',
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
            rules.nonSavingFine,
          )}
          onChangeText={(value) =>
            updateRule(
              'nonSavingFine',
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
                rules.meetingFrequency ===
                  frequency &&
                  styles.optionButtonActive,
              ]}
              onPress={() =>
                updateRule(
                  'meetingFrequency',
                  frequency,
                )
              }
            >
              <Text
                style={[
                  styles.optionText,
                  rules.meetingFrequency ===
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
            rules.cycleDurationMonths,
          )}
          onChangeText={(value) =>
            updateRule(
              'cycleDurationMonths',
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
            rules.leadershipTermMonths,
          )}
          onChangeText={(value) =>
            updateRule(
              'leadershipTermMonths',
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
            value={Boolean(
              rules.shareOutEnabled,
            )}
            onValueChange={(value) =>
              updateRule(
                'shareOutEnabled',
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
          saving &&
            styles.saveButtonDisabled,
        ]}
        onPress={saveRules}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator
            color="#ffffff"
          />
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
