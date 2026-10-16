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
import type { RootStackParamList } from '../../App';

import {
  getVSLASetupRules,
  updateVSLASetupRules,
  VSLASetupRuleUpdates,
} from '../database/database';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'SetupRules'
>;

function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getFirstMonday(year: number, monthIndex: number): Date {
  const firstDay = new Date(year, monthIndex, 1);
  const offset = (8 - firstDay.getDay()) % 7;
  return new Date(year, monthIndex, 1 + offset);
}

function getNextFirstMonday(fromDate: Date): Date {
  const first = getFirstMonday(fromDate.getFullYear(), fromDate.getMonth());
  const today = toLocalDateString(fromDate);
  if (toLocalDateString(first) >= today) return first;
  return getFirstMonday(fromDate.getFullYear(), fromDate.getMonth() + 1);
}

function formatCalendarMonth(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const MEETING_ORDINALS = ['first', 'second', 'third', 'fourth', 'last'] as const;
const MEETING_WEEKDAYS = [
  { key: 'sunday', label: 'Sunday', day: 0 },
  { key: 'monday', label: 'Monday', day: 1 },
  { key: 'tuesday', label: 'Tuesday', day: 2 },
  { key: 'wednesday', label: 'Wednesday', day: 3 },
  { key: 'thursday', label: 'Thursday', day: 4 },
  { key: 'friday', label: 'Friday', day: 5 },
  { key: 'saturday', label: 'Saturday', day: 6 },
] as const;

function isMatchingMeetingRule(date: Date, rule: string): boolean {
  const match = rule.match(/^(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (!match) return false;
  const weekday = MEETING_WEEKDAYS.find((item) => item.key === match[2])?.day;
  if (weekday === undefined || date.getDay() !== weekday) return false;
  if (match[1] === 'last') return date.getDate() + 7 > new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const ordinal = Math.floor((date.getDate() - 1) / 7) + 1;
  return ordinal === MEETING_ORDINALS.indexOf(match[1] as typeof MEETING_ORDINALS[number]) + 1;
}

function matchesMeetingSchedule(date: Date, rawRule: string): boolean {
  const rule = rawRule || 'weekly';
  const weekly = rule.match(/^weekly_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (weekly || rule === 'weekly') {
    const dayName = weekly?.[1] ?? 'monday';
    return date.getDay() === (MEETING_WEEKDAYS.find((item) => item.key === dayName)?.day ?? 1);
  }

  const twiceDates = rule.match(/^twice_dates_(\d{1,2})_(\d{1,2})$/);
  if (twiceDates || rule === 'biweekly') {
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const configuredDays = twiceDates ? [Number(twiceDates[1]), Number(twiceDates[2])] : [5, 20];
    return configuredDays.some((day) => Math.min(day, daysInMonth) === date.getDate());
  }

  const twiceRules = rule.match(/^twice_rules_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (twiceRules) {
    return isMatchingMeetingRule(date, `${twiceRules[1]}_${twiceRules[2]}`) || isMatchingMeetingRule(date, `${twiceRules[3]}_${twiceRules[4]}`);
  }

  const monthlyDate = rule.match(/^monthly_date_(\d{1,2})$/);
  if (monthlyDate || rule === 'monthly') {
    const requestedDay = monthlyDate ? Number(monthlyDate[1]) : 15;
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return date.getDate() === Math.min(requestedDay, lastDay);
  }

  const monthlyRule = rule.match(/^monthly_rule_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (monthlyRule) return isMatchingMeetingRule(date, `${monthlyRule[1]}_${monthlyRule[2]}`);
  if (/^(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(rule)) {
    return isMatchingMeetingRule(date, rule);
  }
  return false;
}

function getUpcomingMeetingDates(rawRule: string, fromDate: Date, count = 3): Date[] {
  const dates: Date[] = [];
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  for (let offset = 0; offset < 370 && dates.length < count; offset += 1) {
    const candidate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    if (matchesMeetingSchedule(candidate, rawRule)) dates.push(candidate);
  }
  return dates;
}

function formatMeetingDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

const DEFAULT_RULES: VSLASetupRuleUpdates = {
shareValue: 1000,
minimumSharesPerMeeting: 1,
maximumSharesPerMeeting: 5,
maximumLoanMultiple: 3,
loanInterestPercentage: 5,
loanInterestMethod: 'declining',
loanRepaymentAmountMode: 'flexible',
loanRepaymentPeriodMode: 'flexible',
loanInterestCalculator: 'standard',
loanInterestPeriod: 'per month',
maximumLoanRepaymentPeriod: 12,
socialFundContribution: 0,
absenceFine: 0,
lateFine: 0,
nonSavingFine: 0,
nonLoanRepaymentFine: 0,
nonInsuranceContribution: 0,
allowSocialFundForLoans: false,
allowExternalFundForLoans: false,
allowFinesForLoans: true,
meetingFrequency: 'weekly',
meetingStartDate: toLocalDateString(getNextFirstMonday(new Date())),
cycleDurationMonths: 12,
leadershipTermMonths: 12,
shareOutEnabled: true,
shareOutMethodology: 'savings_based',
};

export default function SetupRulesScreen({
navigation,
route,
}: Props) {
const { groupId } = route.params;

const [rules, setRules] =
useState<VSLASetupRuleUpdates>(DEFAULT_RULES);

const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
});


const [expandedInterestExample, setExpandedInterestExample] = useState<'declining' | 'fixed' | null>(null);
const scheduleValue = rules.meetingFrequency ?? 'weekly';
const scheduleMode = scheduleValue.startsWith('weekly_') ? 'weekly'
  : scheduleValue.startsWith('twice_') || scheduleValue === 'biweekly' ? 'twice'
  : scheduleValue.startsWith('monthly_') || scheduleValue === 'monthly' ? 'monthly' : 'weekly';
const weeklyDayValue = scheduleValue.match(/^weekly_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/)?.[1] ?? 'monday';
const twiceDatesMatch = scheduleValue.match(/^twice_dates_(\d{1,2})_(\d{1,2})$/);
const twiceFirstDate = Number(twiceDatesMatch?.[1] ?? 5);
const twiceSecondDate = Number(twiceDatesMatch?.[2] ?? 20);
const twiceRulesMatch = scheduleValue.match(/^twice_rules_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
const monthlyDateMatch = scheduleValue.match(/^monthly_date_(\d{1,2})$/);
const monthlyDateValue = Number(monthlyDateMatch?.[1] ?? 15);
const monthlyRuleMatch = scheduleValue.match(/^monthly_rule_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
const ORDINAL_OPTIONS = ['first', 'second', 'third', 'fourth', 'last'] as const;


useEffect(() => {
loadRules();
}, [groupId]);

async function loadRules() {
try {
setLoading(true);

const current = await getVSLASetupRules(groupId);  

  if (!current) {
    const initialDate = toLocalDateString(getNextFirstMonday(new Date()));
    setRules({ ...DEFAULT_RULES, meetingStartDate: initialDate });
    const initial = new Date(`${initialDate}T00:00:00`);
    setCalendarMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    return;
  }

  const storedMeetingDate = current.meeting_start_date ?? toLocalDateString(getNextFirstMonday(new Date()));
  const storedInterestCalculator = current.loan_interest_calculator === 'standard' ? 'standard' : 'common_vsla';
  const storedInterestMethod = current.loan_interest_method ?? 'fixed';
  const storedInterestPeriod = current.loan_interest_period ?? 'per month';
  // Older records may have used the legacy fixed/common-VSLA calculator. Convert
  // the effective saved behaviour to the new One-time / Monthly selector.
  const selectedInterestPeriod = storedInterestPeriod === 'per loan' ||
    (storedInterestCalculator === 'standard' && storedInterestMethod === 'fixed')
    ? 'per loan'
    : 'per month';
  const selectedInterestMethod = selectedInterestPeriod === 'per loan'
    ? 'flat'
    : storedInterestCalculator === 'common_vsla'
      ? 'declining'
      : storedInterestMethod === 'declining' ? 'declining' : 'flat';
  const storedDateObject = new Date(`${storedMeetingDate}T00:00:00`);
  if (!Number.isNaN(storedDateObject.getTime())) {
    setCalendarMonth(new Date(storedDateObject.getFullYear(), storedDateObject.getMonth(), 1));
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
    loanInterestMethod: selectedInterestMethod,
    // These setup choices were removed; new loans use flexible repayments.
    loanRepaymentAmountMode: 'flexible',
    loanRepaymentPeriodMode: 'flexible',
    loanInterestCalculator: 'standard',
    loanInterestPeriod: selectedInterestPeriod,  
    maximumLoanRepaymentPeriod:  
      current.maximum_loan_repayment_period,  
    socialFundContribution:  
      current.social_fund_contribution,  
    absenceFine: current.absence_fine,  
    lateFine: current.late_fine,  
    nonSavingFine:  
      current.non_saving_fine,  
    nonLoanRepaymentFine: current.non_loan_repayment_fine,
    nonInsuranceContribution: current.non_insurance_contribution,
    allowSocialFundForLoans: Boolean(current.allow_social_fund_for_loans),
    allowExternalFundForLoans: Boolean(current.allow_external_fund_for_loans),
    allowFinesForLoans: Number(current.allow_fines_for_loans ?? 1) === 1,
    meetingFrequency: current.meeting_frequency,
    meetingStartDate: storedMeetingDate,
    cycleDurationMonths:  
      current.cycle_duration_months,  
    leadershipTermMonths:  
      current.leadership_term_months,  
    shareOutEnabled:  
      Boolean(current.share_out_enabled),  
    shareOutMethodology: current.share_out_methodology === 'share_based' ? 'share_based' : 'savings_based',
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

async function saveRules(continueToNext = false) {
if (
Number(rules.shareValue) <= 0 ||
Number(rules.minimumSharesPerMeeting) <= 0 ||
Number(rules.maximumSharesPerMeeting) <= 0 ||
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
  Alert.alert('Invalid Shares', 'Minimum shares cannot be greater than maximum shares.');
  return;
}

const savedMeetingRule = rules.meetingFrequency ?? 'weekly';
const validMeetingRule =
  /^weekly_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(savedMeetingRule) ||
  /^twice_dates_\d{1,2}_\d{1,2}$/.test(savedMeetingRule) ||
  /^twice_rules_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(savedMeetingRule) ||
  /^monthly_date_\d{1,2}$/.test(savedMeetingRule) ||
  /^monthly_rule_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(savedMeetingRule) ||
  ['weekly', 'biweekly', 'monthly'].includes(savedMeetingRule) ||
  /^(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(savedMeetingRule);
if (!validMeetingRule) {
  Alert.alert('Invalid Meeting Schedule', 'Choose a valid weekly, twice-a-month, or monthly schedule.');
  return;
}
const datesMatch = savedMeetingRule.match(/^twice_dates_(\d{1,2})_(\d{1,2})$/);
const monthlyDayMatch = savedMeetingRule.match(/^monthly_date_(\d{1,2})$/);
const dayValues = datesMatch ? [Number(datesMatch[1]), Number(datesMatch[2])] : monthlyDayMatch ? [Number(monthlyDayMatch[1])] : [];
if (dayValues.some((day) => !Number.isInteger(day) || day < 1 || day > 31) || (dayValues.length === 2 && dayValues[0] === dayValues[1])) {
  Alert.alert('Invalid Meeting Dates', 'Choose valid dates between 1 and 31, and make the two meeting dates different.');
  return;
}

try {  
  setSaving(true);  

  // Maximum loan multiple is no longer editable on this screen. Omit it from
  // the update so a hidden legacy value cannot block saving or be overwritten.
  const ruleUpdates: VSLASetupRuleUpdates = { ...rules };
  delete ruleUpdates.maximumLoanMultiple;

  await updateVSLASetupRules(groupId, {  
    ...ruleUpdates,  
    shareValue: Number(rules.shareValue),  
    minimumSharesPerMeeting:  
      Number(rules.minimumSharesPerMeeting),  
    maximumSharesPerMeeting:  
      Number(rules.maximumSharesPerMeeting),  
    loanInterestPercentage:  
      Number(rules.loanInterestPercentage),  
    loanRepaymentAmountMode: 'flexible',
    loanRepaymentPeriodMode: 'flexible',
    loanInterestCalculator: 'standard',
    loanInterestMethod: rules.loanInterestPeriod === 'per loan' ? 'flat' : (rules.loanInterestMethod === 'declining' ? 'declining' : 'flat'),
    loanInterestPeriod: rules.loanInterestPeriod === 'per loan' ? 'per loan' : 'per month',
    maximumLoanRepaymentPeriod:  
      Number(rules.maximumLoanRepaymentPeriod),  
    socialFundContribution:  
      Number(rules.socialFundContribution),  
    absenceFine: Number(rules.absenceFine),  
    lateFine: Number(rules.lateFine),  
    nonSavingFine:  
      Number(rules.nonSavingFine),  
    nonLoanRepaymentFine: Number(rules.nonLoanRepaymentFine),
    nonInsuranceContribution: Number(rules.nonInsuranceContribution),
    allowSocialFundForLoans: Boolean(rules.allowSocialFundForLoans),
    allowExternalFundForLoans: Boolean(rules.allowExternalFundForLoans),
    allowFinesForLoans: Boolean(rules.allowFinesForLoans),
    cycleDurationMonths:  
      Number(rules.cycleDurationMonths),  
    leadershipTermMonths:  
      Number(rules.leadershipTermMonths),  
    shareOutEnabled:  
      Boolean(rules.shareOutEnabled),  
    shareOutMethodology: rules.shareOutMethodology === 'share_based' ? 'share_based' : 'savings_based',
  });  

  await loadRules();  

  if (continueToNext) {
    navigation.navigate('Home');
  } else {
    Alert.alert(  
      'Saved',  
      'Setup rules updated successfully.',  
    );
  }  
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
    <Text style={styles.label}>Interest method · Step 1/2</Text>
    <Text style={styles.description}>How frequently is interest applied?</Text>
    <View style={styles.interestMethodList}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected: rules.loanInterestPeriod === 'per loan' }}
        style={[styles.interestMethodCard, rules.loanInterestPeriod === 'per loan' && styles.interestMethodCardSelected]}
        onPress={() => {
          updateRule('loanInterestPeriod', 'per loan');
          updateRule('loanInterestCalculator', 'standard');
          setExpandedInterestExample(null);
        }}
        disabled={saving}
      >
        <Text style={[styles.interestMethodTitle, rules.loanInterestPeriod === 'per loan' && styles.interestMethodTitleSelected]}>
          One-time interest {rules.loanInterestPeriod === 'per loan' ? '✓ SELECTED' : ''}
        </Text>
        <Text style={[styles.interestMethodDescription, rules.loanInterestPeriod === 'per loan' && styles.interestMethodTextSelected]}>
          Interest is applied only one time for this loan.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected: rules.loanInterestPeriod !== 'per loan' }}
        style={[styles.interestMethodCard, rules.loanInterestPeriod !== 'per loan' && styles.interestMethodCardSelected]}
        onPress={() => {
          updateRule('loanInterestPeriod', 'per month');
          updateRule('loanInterestCalculator', 'standard');
          setExpandedInterestExample(null);
        }}
        disabled={saving}
      >
        <Text style={[styles.interestMethodTitle, rules.loanInterestPeriod !== 'per loan' && styles.interestMethodTitleSelected]}>
          Monthly interest {rules.loanInterestPeriod !== 'per loan' ? '✓ SELECTED' : ''}
        </Text>
        <Text style={[styles.interestMethodDescription, rules.loanInterestPeriod !== 'per loan' && styles.interestMethodTextSelected]}>
          Interest is applied each month while the loan remains outstanding.
        </Text>
      </TouchableOpacity>
    </View>

    {rules.loanInterestPeriod !== 'per loan' && (
      <>
        <Text style={styles.label}>Step 2/2 · Choose the monthly interest method</Text>
        <View style={styles.interestMethodList}>
          <View style={[
            styles.interestMethodCard,
            rules.loanInterestMethod === 'declining' && styles.interestMethodCardSelected,
          ]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: rules.loanInterestMethod === 'declining' }}
              onPress={() => {
                updateRule('loanInterestMethod', 'declining');
                updateRule('loanInterestCalculator', 'standard');
              }}
              disabled={saving}
            >
              <Text style={[styles.interestMethodTitle, rules.loanInterestMethod === 'declining' && styles.interestMethodTitleSelected]}>
                Monthly interest (declining) {rules.loanInterestMethod === 'declining' ? '✓ SELECTED' : ''}
              </Text>
              <Text style={[styles.interestMethodDescription, rules.loanInterestMethod === 'declining' && styles.interestMethodTextSelected]}>
                Interest is calculated each month on the remaining balance owed.
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setExpandedInterestExample(expandedInterestExample === 'declining' ? null : 'declining')}
              disabled={saving}
            >
              <Text style={styles.exampleFootnote}>
                {expandedInterestExample === 'declining' ? 'Hide example ▲' : 'Tap to show example ▼'}
              </Text>
            </TouchableOpacity>
            {expandedInterestExample === 'declining' && (
              <Text style={styles.interestMethodExample}>
                Day 1: UGX 10,000 + 3% = UGX 10,300.{'\n'}
                Day 6: Flexible repayment of UGX 1,000 → balance UGX 9,300.{'\n'}
                Day 30: Repay UGX 2,000 → balance UGX 7,300; add 3% interest (UGX 219) = UGX 7,519.
              </Text>
            )}
          </View>

          <View style={[
            styles.interestMethodCard,
            rules.loanInterestMethod !== 'declining' && styles.interestMethodCardSelected,
          ]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: rules.loanInterestMethod !== 'declining' }}
              onPress={() => {
                updateRule('loanInterestMethod', 'flat');
                updateRule('loanInterestCalculator', 'standard');
              }}
              disabled={saving}
            >
              <Text style={[styles.interestMethodTitle, rules.loanInterestMethod !== 'declining' && styles.interestMethodTitleSelected]}>
                Monthly interest (fixed) {rules.loanInterestMethod !== 'declining' ? '✓ SELECTED' : ''}
              </Text>
              <Text style={[styles.interestMethodDescription, rules.loanInterestMethod !== 'declining' && styles.interestMethodTextSelected]}>
                Interest is calculated each month on the original principal, so the charge remains the same each month.
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setExpandedInterestExample(expandedInterestExample === 'fixed' ? null : 'fixed')}
              disabled={saving}
            >
              <Text style={styles.exampleFootnote}>
                {expandedInterestExample === 'fixed' ? 'Hide example ▲' : 'Tap to show example ▼'}
              </Text>
            </TouchableOpacity>
            {expandedInterestExample === 'fixed' && (
              <Text style={styles.interestMethodExample}>
                Day 1: UGX 10,000 + 3% = UGX 10,300.{'\n'}
                Day 6: Repayment of UGX 1,000 → balance UGX 9,300.{'\n'}
                Day 30: Repayment of UGX 2,000 → balance UGX 7,300; add the same fixed monthly interest of UGX 300 = UGX 7,600.
              </Text>
            )}
          </View>
        </View>
      </>
    )}

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

    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.label}>Use Social Fund for Loans</Text>
        <Text style={styles.description}>
          Off by default. When enabled, Social Fund collections may increase the available Loan Fund.
        </Text>
      </View>
      <Switch
        value={Boolean(rules.allowSocialFundForLoans)}
        onValueChange={(value) => updateRule('allowSocialFundForLoans', value)}
        trackColor={{ false: '#d1d5db', true: '#86efac' }}
        thumbColor="#16a34a"
      />
    </View>

    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.label}>Use External Funds for Loans</Text>
        <Text style={styles.description}>
          Off by default. When enabled, eligible external collections may increase the available Loan Fund.
        </Text>
      </View>
      <Switch
        value={Boolean(rules.allowExternalFundForLoans)}
        onValueChange={(value) => updateRule('allowExternalFundForLoans', value)}
        trackColor={{ false: '#d1d5db', true: '#86efac' }}
        thumbColor="#16a34a"
      />
    </View>

    <Text style={styles.label}>Fine Collection Allocation (Members' Agreement)</Text>
    <Text style={styles.description}>
      Record the decision agreed by group members. This applies to all fine types: absence, lateness, non-saving, non-loan repayment, and non-insurance contribution.
    </Text>
    <View style={styles.methodOptions}>
      <TouchableOpacity
        style={[styles.methodOption, Boolean(rules.allowFinesForLoans) && styles.methodOptionActive]}
        onPress={() => updateRule('allowFinesForLoans', true)}
      >
        <Text style={[styles.methodOptionTitle, Boolean(rules.allowFinesForLoans) && styles.methodOptionTitleActive]}>
          Add collected fines to Loan Fund
        </Text>
        <Text style={[styles.methodOptionDescription, Boolean(rules.allowFinesForLoans) && styles.methodOptionTitleActive]}>
          Paid fines increase the money available for lending.
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.methodOption, !Boolean(rules.allowFinesForLoans) && styles.methodOptionActive]}
        onPress={() => updateRule('allowFinesForLoans', false)}
      >
        <Text style={[styles.methodOptionTitle, !Boolean(rules.allowFinesForLoans) && styles.methodOptionTitleActive]}>
          Keep fines separate
        </Text>
        <Text style={[styles.methodOptionDescription, !Boolean(rules.allowFinesForLoans) && styles.methodOptionTitleActive]}>
          Paid fines remain in the separate Fines Fund and do not finance loans.
        </Text>
      </TouchableOpacity>
    </View>

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

    <Text style={styles.label}>Non-Loan-Repayment Fine</Text>
    <TextInput
      style={styles.input}
      value={String(rules.nonLoanRepaymentFine)}
      onChangeText={(value) => updateRule('nonLoanRepaymentFine', Number(value) || 0)}
      keyboardType="decimal-pad"
      placeholder="0"
    />

    <Text style={styles.label}>Non-Insurance Contribution Fine</Text>
    <TextInput
      style={styles.input}
      value={String(rules.nonInsuranceContribution)}
      onChangeText={(value) => updateRule('nonInsuranceContribution', Number(value) || 0)}
      keyboardType="decimal-pad"
      placeholder="0"
    />
  </View>  

  <View style={styles.card}>  
    <Text style={styles.sectionTitle}>  
      Meeting & Cycle Rules  
    </Text>  

    <Text style={styles.label}>Meeting Frequency</Text>
    <Text style={styles.description}>Choose how often this VSLA group meets.</Text>
    <View style={styles.optionRow}>
      {(['weekly', 'twice', 'monthly'] as const).map((mode) => (
        <TouchableOpacity key={mode} style={[styles.optionButton, scheduleMode === mode && styles.optionButtonActive]} onPress={() => {
          if (mode === 'weekly') updateRule('meetingFrequency', `weekly_${weeklyDayValue}`);
          else if (mode === 'twice') updateRule('meetingFrequency', `twice_dates_${twiceFirstDate}_${twiceSecondDate}`);
          else updateRule('meetingFrequency', `monthly_date_${monthlyDateValue}`);
        }} disabled={saving}>
          <Text style={[styles.optionText, scheduleMode === mode && styles.optionTextActive]}>{mode === 'twice' ? 'Twice a month' : mode[0].toUpperCase() + mode.slice(1)}</Text>
        </TouchableOpacity>
      ))}
    </View>

    {scheduleMode === 'weekly' && <>
      <Text style={styles.label}>Weekly meeting day</Text>
      <View style={styles.optionRow}>
        {MEETING_WEEKDAYS.map((weekday) => <TouchableOpacity key={weekday.key} style={[styles.optionButton, weeklyDayValue === weekday.key && styles.optionButtonActive]} onPress={() => updateRule('meetingFrequency', `weekly_${weekday.key}`)} disabled={saving}>
          <Text style={[styles.optionText, weeklyDayValue === weekday.key && styles.optionTextActive]}>{weekday.label}</Text>
        </TouchableOpacity>)}
      </View>
      <Text style={styles.description}>The meeting repeats every week on the selected day.</Text>
    </>}

    {scheduleMode === 'twice' && <>
      <Text style={styles.label}>Twice-a-month schedule type</Text>
      <View style={styles.optionRow}>
        <TouchableOpacity style={[styles.optionButton, !scheduleValue.startsWith('twice_rules_') && styles.optionButtonActive]} onPress={() => updateRule('meetingFrequency', `twice_dates_${twiceFirstDate}_${twiceSecondDate}`)} disabled={saving}><Text style={[styles.optionText, !scheduleValue.startsWith('twice_rules_') && styles.optionTextActive]}>Dates of month</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.optionButton, scheduleValue.startsWith('twice_rules_') && styles.optionButtonActive]} onPress={() => updateRule('meetingFrequency', 'twice_rules_first_tuesday_third_saturday')} disabled={saving}><Text style={[styles.optionText, scheduleValue.startsWith('twice_rules_') && styles.optionTextActive]}>Weekday occurrences</Text></TouchableOpacity>
      </View>
      {!scheduleValue.startsWith('twice_rules_') ? <>
        <Text style={styles.label}>First meeting date (1–31)</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={String(twiceFirstDate)} onChangeText={(v) => updateRule('meetingFrequency', `twice_dates_${v.replace(/\\D/g, '').slice(0,2) || '5'}_${twiceSecondDate}`)} placeholder="5" editable={!saving}/>
        <Text style={styles.label}>Second meeting date (1–31)</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={String(twiceSecondDate)} onChangeText={(v) => updateRule('meetingFrequency', `twice_dates_${twiceFirstDate}_${v.replace(/\\D/g, '').slice(0,2) || '20'}`)} placeholder="20" editable={!saving}/>
        <Text style={styles.description}>Example: 5 and 20. Dates that do not exist in a shorter month will fall on that month's last day.</Text>
      </> : <>
        {([1, 2] as const).map((which) => {
          const m = scheduleValue.match(/^twice_rules_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
          const ordinal = m?.[which === 1 ? 1 : 3] ?? (which === 1 ? 'first' : 'third');
          const day = m?.[which === 1 ? 2 : 4] ?? (which === 1 ? 'tuesday' : 'saturday');
          return <View key={which}>
            <Text style={styles.label}>{which === 1 ? 'First meeting' : 'Second meeting'} — occurrence</Text>
            <View style={styles.optionRow}>{ORDINAL_OPTIONS.map((o) => <TouchableOpacity key={o} style={[styles.optionButton, ordinal === o && styles.optionButtonActive]} onPress={() => {
              const x = scheduleValue.match(/^twice_rules_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
              updateRule('meetingFrequency', `twice_rules_${which === 1 ? o : x?.[1] ?? 'first'}_${x?.[2] ?? 'tuesday'}_${which === 2 ? o : x?.[3] ?? 'third'}_${x?.[4] ?? 'saturday'}`);
            }} disabled={saving}><Text style={[styles.optionText, ordinal === o && styles.optionTextActive]}>{o}</Text></TouchableOpacity>)}</View>
            <Text style={styles.label}>{which === 1 ? 'First meeting' : 'Second meeting'} — weekday</Text>
            <View style={styles.optionRow}>{MEETING_WEEKDAYS.map((d) => <TouchableOpacity key={d.key} style={[styles.optionButton, day === d.key && styles.optionButtonActive]} onPress={() => {
              const x = scheduleValue.match(/^twice_rules_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
              updateRule('meetingFrequency', `twice_rules_${x?.[1] ?? 'first'}_${which === 1 ? d.key : x?.[2] ?? 'tuesday'}_${x?.[3] ?? 'third'}_${which === 2 ? d.key : x?.[4] ?? 'saturday'}`);
            }} disabled={saving}><Text style={[styles.optionText, day === d.key && styles.optionTextActive]}>{d.label}</Text></TouchableOpacity>)}</View>
          </View>;
        })}
      </>}
    </>}

    {scheduleMode === 'monthly' && <>
      <Text style={styles.label}>Monthly schedule type</Text>
      <View style={styles.optionRow}>
        <TouchableOpacity style={[styles.optionButton, !scheduleValue.startsWith('monthly_rule_') && styles.optionButtonActive]} onPress={() => updateRule('meetingFrequency', `monthly_date_${monthlyDateValue}`)} disabled={saving}><Text style={[styles.optionText, !scheduleValue.startsWith('monthly_rule_') && styles.optionTextActive]}>Date of month</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.optionButton, scheduleValue.startsWith('monthly_rule_') && styles.optionButtonActive]} onPress={() => updateRule('meetingFrequency', `monthly_rule_${monthlyRuleMatch?.[1] ?? 'last'}_${monthlyRuleMatch?.[2] ?? 'saturday'}`)} disabled={saving}><Text style={[styles.optionText, scheduleValue.startsWith('monthly_rule_') && styles.optionTextActive]}>Weekday occurrence</Text></TouchableOpacity>
      </View>
      {!scheduleValue.startsWith('monthly_rule_') ? <>
        <Text style={styles.label}>Day of month (1–31)</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={String(monthlyDateValue)} onChangeText={(v) => updateRule('meetingFrequency', `monthly_date_${v.replace(/\\D/g, '').slice(0,2) || '15'}`)} placeholder="15" editable={!saving}/>
        <Text style={styles.description}>If the chosen date does not exist in a shorter month, the meeting falls on that month's last day.</Text>
      </> : <>
        <Text style={styles.label}>Weekday occurrence</Text>
        <View style={styles.optionRow}>{ORDINAL_OPTIONS.map((o) => <TouchableOpacity key={o} style={[styles.optionButton, monthlyRuleMatch?.[1] === o && styles.optionButtonActive]} onPress={() => updateRule('meetingFrequency', `monthly_rule_${o}_${monthlyRuleMatch?.[2] ?? 'saturday'}`)} disabled={saving}><Text style={[styles.optionText, monthlyRuleMatch?.[1] === o && styles.optionTextActive]}>{o}</Text></TouchableOpacity>)}</View>
        <View style={styles.optionRow}>{MEETING_WEEKDAYS.map((d) => <TouchableOpacity key={d.key} style={[styles.optionButton, monthlyRuleMatch?.[2] === d.key && styles.optionButtonActive]} onPress={() => updateRule('meetingFrequency', `monthly_rule_${monthlyRuleMatch?.[1] ?? 'last'}_${d.key}`)} disabled={saving}><Text style={[styles.optionText, monthlyRuleMatch?.[2] === d.key && styles.optionButtonActive && styles.optionTextActive]}>{d.label}</Text></TouchableOpacity>)}</View>
      </>}
    </>}
    <View style={styles.schedulePreview}>
      <Text style={styles.schedulePreviewTitle}>Upcoming scheduled meetings</Text>
      {getUpcomingMeetingDates(scheduleValue, new Date(), 3).map((date, index) => (
        <Text key={`${toLocalDateString(date)}-${index}`} style={styles.schedulePreviewDate}>
          {index + 1}. {formatMeetingDate(date)}
        </Text>
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

    <Text style={styles.label}>Share-Out Methodology</Text>
    <Text style={styles.description}>Choose how the member's savings portion is estimated. This estimate does not include group profits or approved deductions.</Text>
    <View style={styles.methodOptions}>
      <TouchableOpacity
        style={[styles.methodOption, rules.shareOutMethodology === 'savings_based' && styles.methodOptionActive]}
        onPress={() => updateRule('shareOutMethodology', 'savings_based')}
        disabled={saving}
      >
        <Text style={[styles.methodOptionTitle, rules.shareOutMethodology === 'savings_based' && styles.methodOptionTitleActive]}>Savings-based</Text>
        <Text style={[styles.methodOptionDescription, rules.shareOutMethodology === 'savings_based' && styles.methodOptionTitleActive]}>Uses the member's recorded savings as the principal estimate.</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.methodOption, rules.shareOutMethodology === 'share_based' && styles.methodOptionActive]}
        onPress={() => updateRule('shareOutMethodology', 'share_based')}
        disabled={saving}
      >
        <Text style={[styles.methodOptionTitle, rules.shareOutMethodology === 'share_based' && styles.methodOptionTitleActive]}>Share-based</Text>
        <Text style={[styles.methodOptionDescription, rules.shareOutMethodology === 'share_based' && styles.methodOptionTitleActive]}>Uses whole shares estimated from the configured share value.</Text>
      </TouchableOpacity>
    </View>

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

  <View style={styles.navigationButtons}>
    <TouchableOpacity
      style={[styles.navigationButton, styles.backButton]}
      onPress={() => navigation.goBack()}
      disabled={saving}
    >
      <Text style={styles.backButtonText}>Back</Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[styles.navigationButton, styles.nextButton, saving && styles.saveButtonDisabled]}
      onPress={() => saveRules(true)}
      disabled={saving}
    >
      {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.nextButtonText}>Next</Text>}
    </TouchableOpacity>
  </View>  
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

interestMethodList: {
  gap: 10,
  marginTop: 8,
  marginBottom: 8,
},
interestMethodCard: {
  borderWidth: 1,
  borderColor: '#d1d5db',
  borderRadius: 12,
  padding: 13,
  backgroundColor: '#ffffff',
},
interestMethodCardSelected: {
  borderColor: '#16a34a',
  borderWidth: 2,
  backgroundColor: '#f0fdf4',
},
interestMethodTitle: {
  color: '#111827',
  fontSize: 15,
  fontWeight: '800',
  marginBottom: 6,
},
interestMethodTitleSelected: {
  color: '#166534',
},
interestMethodDescription: {
  color: '#4b5563',
  fontSize: 13,
  lineHeight: 19,
},
interestMethodExample: {
  color: '#166534',
  backgroundColor: '#dcfce7',
  padding: 9,
  borderRadius: 8,
  marginTop: 9,
  fontSize: 13,
  fontWeight: '700',
  lineHeight: 19,
},
interestMethodTextSelected: {
  color: '#14532d',
},
exampleFootnote: {
  color: '#6b7280',
  fontSize: 12,
  lineHeight: 17,
  marginBottom: 12,
},

calendarCard: {
  borderWidth: 1,
  borderColor: '#bbf7d0',
  borderRadius: 12,
  padding: 12,
  marginBottom: 16,
  backgroundColor: '#f0fdf4',
},
calendarTitle: {
  color: '#166534',
  fontSize: 15,
  fontWeight: '800',
  marginBottom: 6,
},
calendarHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 10,
  marginBottom: 8,
},
calendarArrow: {
  width: 36,
  height: 36,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 18,
  backgroundColor: '#dcfce7',
},
calendarArrowText: {
  color: '#166534',
  fontSize: 24,
  fontWeight: '700',
},
calendarMonth: {
  color: '#14532d',
  fontSize: 15,
  fontWeight: '800',
},
calendarGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
},
calendarCell: {
  width: '14.2857%',
  minHeight: 38,
  alignItems: 'center',
  justifyContent: 'center',
},
calendarWeekday: {
  color: '#166534',
  fontSize: 12,
  fontWeight: '800',
},
calendarDay: {
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'transparent',
  marginVertical: 1,
},
calendarDaySelected: {
  backgroundColor: '#16a34a',
  borderColor: '#15803d',
},
calendarDayDisabled: {
  backgroundColor: '#f3f4f6',
},
calendarDayText: {
  color: '#111827',
  fontSize: 13,
  fontWeight: '600',
},
calendarDayTextSelected: {
  color: '#ffffff',
  fontWeight: '800',
},
calendarDayTextDisabled: {
  color: '#9ca3af',
},
calendarSelection: {
  color: '#166534',
  fontSize: 12,
  fontWeight: '700',
  marginTop: 10,
},

schedulePreview: {
  backgroundColor: '#f0fdf4',
  borderColor: '#bbf7d0',
  borderWidth: 1,
  borderRadius: 10,
  padding: 12,
  marginTop: 4,
  marginBottom: 18,
},
schedulePreviewTitle: {
  color: '#166534',
  fontSize: 14,
  fontWeight: '700',
  marginBottom: 8,
},
schedulePreviewDate: {
  color: '#1f2937',
  fontSize: 13,
  marginBottom: 5,
},
schedulePreviewNote: {
  color: '#4b5563',
  fontSize: 12,
  lineHeight: 17,
  marginTop: 5,
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

navigationButtons: {
  flexDirection: 'row',
  gap: 12,
  marginTop: 20,
},
navigationButton: {
  flex: 1,
  minHeight: 50,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 16,
},
backButton: {
  backgroundColor: '#ffffff',
  borderWidth: 1,
  borderColor: '#16a34a',
},
nextButton: {
  backgroundColor: '#16a34a',
},
backButtonText: {
  color: '#166534',
  fontSize: 16,
  fontWeight: '700',
},
nextButtonText: {
  color: '#ffffff',
  fontSize: 16,
  fontWeight: '700',
},
methodOptions: {
  gap: 10,
  marginBottom: 18,
},
methodOption: {
  borderWidth: 1,
  borderColor: '#d1d5db',
  borderRadius: 10,
  padding: 14,
  backgroundColor: '#ffffff',
},
methodOptionActive: {
  borderColor: '#16a34a',
  backgroundColor: '#f0fdf4',
},
methodOptionTitle: {
  color: '#111827',
  fontSize: 15,
  fontWeight: '700',
  marginBottom: 4,
},
methodOptionTitleActive: {
  color: '#166534',
},
methodOptionDescription: {
  color: '#4b5563',
  fontSize: 13,
  lineHeight: 18,
},
saveButtonText: {
color: '#ffffff',
fontSize: 16,
fontWeight: '700',
},
});
