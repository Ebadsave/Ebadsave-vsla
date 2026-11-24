import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import {
  getMembersByGroupId,
  getHistoricalMigrationImports,
  getHistoricalMigrationDrafts,
  createHistoricalMigrationImport,
  createHistoricalMigrationDraft,
  updateHistoricalMigrationDraft,
  deleteHistoricalMigrationDraft,
  getVSLASetupRules,
  type HistoricalMigrationImport,
  type HistoricalMigrationDraft,
  type HistoricalMigrationCategory,
} from '../database/database';

type Props = {
  route: {
    params: {
      groupId: number;
      executiveMemberId: number;
      bookName?: string;
      groupName?: string;
    };
  };
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params: any) => void;
  };
};

type Member = {
  id: number;
  full_name: string;
  member_number: string;
};

// ONLY 7 BUTTONS
const categories: {
  value: HistoricalMigrationCategory;
  label: string;
}[] = [
  { value: 'savings', label: '💰 Savings' },
  { value: 'previous_loan_balance', label: '📋 Previous Loan' },
  { value: 'fine', label: '⚠️ Fines' },
  { value: 'insurance', label: '🛡️ Insurance' },
  { value: 'group_income', label: 'Other money received' },
  { value: 'group_expense', label: 'Money spent' },
  { value: 'other', label: 'External loan / other' },
];

// Convert amount to a number safely.
// Commas, spaces and UGX text are ignored.
const parseAmount = (value: string): number => {
  const cleaned = value.replace(/[,\s]/g, '').replace(/UGX/gi, '');

  if (!cleaned.trim()) return NaN;

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : NaN;
};

const formatDDMMYYYY = (iso: string) => {
  if (!iso || iso.length < 10) return iso;

  const [y, m, d] = iso.slice(0, 10).split('-');

  return `${d}-${m}-${y}`;
};

const toISO = (v: string) => {
  const [d, m, y] = v.trim().split('-');

  return `${y}-${m}-${d}`;
};

const isValidDDMMYYYY = (v: string) => {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(v)) return false;

  const iso = toISO(v);
  const dt = new Date(`${iso}T12:00:00.000Z`);

  return (
    Number.isFinite(dt.getTime()) &&
    dt.toISOString().slice(0, 10) === iso
  );
};

// Default the historical loan due date from the group's configured maximum
// repayment period. Month-end dates are clamped to the last day of the target month.
const addMonthsToISODate = (iso: string, months: number): string => {
  const [year, month, day] = iso.split('-').map(Number);
  const firstOfTargetMonth = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const lastDay = new Date(Date.UTC(
    firstOfTargetMonth.getUTCFullYear(),
    firstOfTargetMonth.getUTCMonth() + 1,
    0,
    12,
  )).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${firstOfTargetMonth.getUTCFullYear()}-${String(firstOfTargetMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
};

const autoDueDateFromIssueDate = (issueDate: string, months: number): string => {
  if (!isValidDDMMYYYY(issueDate)) return '';
  return formatDDMMYYYY(addMonthsToISODate(toISO(issueDate), months));
};

// OVERDUE - due date < today and amount > 0
const isOverdue = (isoDate: string, amount: number) => {
  if (!isoDate || amount <= 0) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return new Date(`${isoDate.slice(0, 10)}T00:00:00`) < today;
};

const isImportOpen = (imp: HistoricalMigrationImport | null) => {
  if (!imp) return false;

  return [
    'pending_review',
    'processing',
    'needs_correction',
  ].includes(imp.status);
};

export default function HistoricalMigrationScreen({
  route,
  navigation,
}: Props) {
  const {
    groupId,
    executiveMemberId,
    bookName,
    groupName,
  } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [imports, setImports] = useState<HistoricalMigrationImport[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [selectedImport, setSelectedImport] =
    useState<HistoricalMigrationImport | null>(null);

  const [drafts, setDrafts] = useState<HistoricalMigrationDraft[]>([]);

  const [selectedMemberView, setSelectedMemberView] =
    useState<Member | null>(null);

  const [category, setCategory] =
    useState<HistoricalMigrationCategory>('savings');

  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const [editing, setEditing] =
    useState<HistoricalMigrationDraft | null>(null);

  const [prevLoanAmount, setPrevLoanAmount] = useState('');
  const [prevLoanDate, setPrevLoanDate] = useState('');

  const [currentLoanAmount, setCurrentLoanAmount] = useState('');
  const [currentLoanDate, setCurrentLoanDate] = useState('');

  const [dueDate, setDueDate] = useState('');
  const [maximumLoanRepaymentMonths, setMaximumLoanRepaymentMonths] = useState(12);

  // Calculate amount paid automatically.
  // Previous Loan Amount already includes interest.
  const amountPaid = (() => {
    const p = parseAmount(prevLoanAmount);
    const c = parseAmount(currentLoanAmount);

    if (!Number.isFinite(p) || !Number.isFinite(c)) return 0;

    return Math.max(0, p - c);
  })();

  const ensureOpenImport = useCallback(
    async (
      bookTitle: string
    ): Promise<HistoricalMigrationImport | null> => {
      const all = await getHistoricalMigrationImports(groupId);

      setImports(all);

      const openOne = all.find(i => isImportOpen(i));

      if (openOne) {
        setSelectedImport(openOne);

        setDrafts(
          await getHistoricalMigrationDrafts(openOne.id, groupId)
        );

        return openOne;
      }

      const newId = await createHistoricalMigrationImport({
        group_id: groupId,
        evidence_type: 'manual',
        evidence_name: bookTitle,
        evidence_uri: '',
        source_reference: '',
        notes: 'Auto-created - old import was closed',
        created_by_member_id: executiveMemberId,
      });

      const refreshed = await getHistoricalMigrationImports(groupId);

      setImports(refreshed);

      const created = refreshed.find(i => i.id === newId) || null;

      setSelectedImport(created);

      setDrafts(
        created
          ? await getHistoricalMigrationDrafts(created.id, groupId)
          : []
      );

      return created;
    },
    [groupId, executiveMemberId]
  );

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const loadedMembers = await getMembersByGroupId(groupId);

      setMembers(
        (loadedMembers as Member[])
          .slice()
          .sort((a, b) =>
            a.full_name.localeCompare(b.full_name)
          )
      );

      const setupRules = await getVSLASetupRules(groupId);
      setMaximumLoanRepaymentMonths(
        Math.max(1, Number(setupRules?.maximum_loan_repayment_period ?? 12))
      );

      const bookTitle = bookName || groupName || 'Old Book';

      await ensureOpenImport(bookTitle);
    } catch (e) {
      Alert.alert(
        'Could not load',
        e instanceof Error ? e.message : 'Try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, bookName, groupName, ensureOpenImport]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const resetForm = () => {
    setEditing(null);

    setDate('');
    setAmount('');
    setDescription('');

    setPrevLoanAmount('');
    setPrevLoanDate('');

    setCurrentLoanAmount('');
    setCurrentLoanDate('');

    setDueDate('');
  };

  const saveRecord = async () => {
    if (!selectedMemberView) return;

    const bookTitle = bookName || groupName || 'Old Book';

    let imp = selectedImport;

    if (!isImportOpen(imp)) {
      imp = await ensureOpenImport(bookTitle);
    }

    if (!imp) {
      Alert.alert(
        'Could not save',
        'No open book found. Try again.'
      );
      return;
    }

    // =========================================
    // PREVIOUS LOAN - AMOUNT INCLUDING INTEREST
    // =========================================

    if (category === 'previous_loan_balance') {
      if (!isValidDDMMYYYY(prevLoanDate)) {
        Alert.alert(
          'Check date',
          'Enter Previous Loan date as DD-MM-YYYY. Example: 17-04-2021.'
        );
        return;
      }

      if (!isValidDDMMYYYY(currentLoanDate)) {
        Alert.alert(
          'Check date',
          'Enter Current Loan date as DD-MM-YYYY.'
        );
        return;
      }

      if (!isValidDDMMYYYY(dueDate)) {
        Alert.alert(
          'Due date unavailable',
          'Enter a valid loan issue date first so Ebadsave can calculate the due date from the group setup rules.'
        );
        return;
      }

      const prev = parseAmount(prevLoanAmount);
      const curr = parseAmount(currentLoanAmount);

      // Original loan INCLUDING interest must be greater than zero.
      if (!Number.isFinite(prev) || prev <= 0) {
        Alert.alert(
          'Invalid Previous Loan',
          'Enter a valid original loan amount INCLUDING interest. The amount must be greater than zero.'
        );
        return;
      }

      // Current outstanding balance may be zero.
      if (!Number.isFinite(curr) || curr < 0) {
        Alert.alert(
          'Invalid Current Loan',
          'Enter a valid outstanding loan balance. Enter 0 if the loan is fully paid.'
        );
        return;
      }

      if (curr > prev) {
        Alert.alert(
          'Check amounts',
          'Current Loan cannot exceed the Previous Loan amount INCLUDING interest.'
        );
        return;
      }

      // No additional interest is calculated or added.
      // The entered previous loan amount is already inclusive of interest.
      const paid = prev - curr;

      setSaving(true);

      try {
        const dueISO = toISO(dueDate);
        const issueISO = toISO(prevLoanDate);
        const balanceISO = toISO(currentLoanDate);

        await createHistoricalMigrationDraft({
          import_id: imp.id,
          group_id: groupId,
          member_id: selectedMemberView.id,
          category: 'previous_loan_balance',
          transaction_date: toISO(prevLoanDate),
          amount: prev,
          is_opening_balance: false,
          loan_issued_plus_interest: prev,
          loan_issued_date: issueISO,
          loan_due_date: dueISO,
          loan_balance_date: balanceISO,
          description:
            `Previous Loan Taken (TOTAL INCLUDING INTEREST): UGX ${prev}. ` +
            `Current / Balance Loan: UGX ${curr}. ` +
            `Amount Paid: UGX ${paid}. ` +
            `Due: ${dueDate || currentLoanDate}. ` +
            `${description.trim()}`,
          source_reference: imp.source_reference || '',
        });

        await createHistoricalMigrationDraft({
          import_id: imp.id,
          group_id: groupId,
          member_id: selectedMemberView.id,
          category: 'loan_issued',
          transaction_date: balanceISO,
          amount: curr,
          is_opening_balance: false,
          description:
            `Current / Balance Loan: UGX ${curr}. ` +
            `Original Previous Loan INCLUDING INTEREST: UGX ${prev}. ` +
            `Amount Paid: UGX ${paid}. ` +
            `Due: ${dueDate || currentLoanDate}.`,
          source_reference: imp.source_reference || '',
        });

        setDrafts(
          await getHistoricalMigrationDrafts(imp.id, groupId)
        );

        resetForm();

        Alert.alert(
          'Saved',
          'Previous Loan and Current Loan saved successfully. The original loan amount was recorded INCLUDING interest.'
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Try again.';

        if (msg.includes('not open')) {
          await ensureOpenImport(bookTitle);

          Alert.alert(
            'Try again',
            'Book was closed. A new open book is ready. Tap SAVE again.'
          );
        } else {
          Alert.alert('Could not save', msg);
        }
      } finally {
        setSaving(false);
      }

      return;
    }

    // =========================================
    // OTHER HISTORICAL RECORDS
    // =========================================

    if (!isValidDDMMYYYY(date)) {
      Alert.alert(
        'Check date',
        'Enter date as DD-MM-YYYY. Example: 17-04-2021.'
      );
      return;
    }

    const value = parseAmount(amount);

    if (!Number.isFinite(value) || value < 0) {
      Alert.alert(
        'Check amount',
        'Enter correct amount in UGX.'
      );
      return;
    }

    setSaving(true);

    try {
      const payload = {
        import_id: imp.id,
        group_id: groupId,
        member_id: selectedMemberView.id,
        category,
        transaction_date: toISO(date),
        amount: value,
        is_opening_balance: false,
        description: description.trim(),
        source_reference: imp.source_reference || '',
      };

      if (editing) {
        await updateHistoricalMigrationDraft({
          ...payload,
          id: editing.id,
        });
      } else {
        await createHistoricalMigrationDraft(payload);
      }

      setDrafts(
        await getHistoricalMigrationDrafts(imp.id, groupId)
      );

      resetForm();

      Alert.alert('Saved', 'Record saved.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Try again.';

      if (msg.includes('not open')) {
        await ensureOpenImport(bookTitle);

        Alert.alert(
          'Try again',
          'Book was closed. A new open book is ready. Tap SAVE again.'
        );
      } else {
        Alert.alert('Could not save', msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const editDraft = (draft: HistoricalMigrationDraft) => {
    setEditing(draft);

    setCategory(
      draft.category === 'loan_issued'
        ? 'previous_loan_balance'
        : draft.category
    );

    setDate(formatDDMMYYYY(draft.transaction_date));
    setAmount(String(draft.amount));
    setDescription(draft.description);
  };

  const removeDraft = (draft: HistoricalMigrationDraft) => {
    Alert.alert('Remove?', 'Remove this entry?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteHistoricalMigrationDraft(
              draft.id,
              draft.import_id,
              groupId
            );

            if (selectedImport) {
              setDrafts(
                await getHistoricalMigrationDrafts(
                  selectedImport.id,
                  groupId
                )
              );
            }
          } catch (e) {
            Alert.alert(
              'Could not remove',
              e instanceof Error ? e.message : 'Try again.'
            );
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.help}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const visibleDrafts = selectedMemberView
    ? drafts.filter(d => d.member_id === selectedMemberView.id)
    : [];

  const prevDrafts = visibleDrafts.filter(
    d => d.category === 'previous_loan_balance'
  );

  const currDrafts = visibleDrafts.filter(
    d => d.category === 'loan_issued'
  );

  const totalPrev = prevDrafts.reduce(
    (s, d) => s + Number(d.amount),
    0
  );

  const totalCurr = currDrafts.reduce(
    (s, d) => s + Number(d.amount),
    0
  );

  const totalPaid = Math.max(0, totalPrev - totalCurr);

  const displayBookName =
    bookName ||
    selectedImport?.evidence_name ||
    groupName ||
    'Old Book';

  const importOpen = isImportOpen(selectedImport);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.back}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() =>
            navigation.navigate('HistoricalMigrationReview', {
              groupId,
              executiveMemberId,
              bookName: displayBookName,
              adminPin: '1234',
            })
          }
          style={[
            styles.primary,
            { backgroundColor: '#1d4ed8' },
          ]}
        >
          <Text style={styles.primaryText}>
            CHECK ALL MEMBERS - REVIEW PAGE
          </Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.kicker}>EBADSAVE VSLA</Text>
          <Text style={styles.title}>{displayBookName}</Text>
          <Text style={styles.sub}>
            Enter old records. Then finish.
          </Text>
        </View>

        {!importOpen && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Old book was closed. A new open book is ready.
              You can save again.
            </Text>
          </View>
        )}

        <View style={styles.stepCard}>
          <Text style={styles.stepNumber}>STEP 1</Text>

          <Text style={styles.stepTitle}>
            Enter old money records
          </Text>

          <Text style={styles.help}>
            Tap a member, enter his records.
          </Text>

          {!selectedMemberView && (
            <>
              <Text style={styles.label}>
                Choose the member
              </Text>

              {members.map(m => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => {
                    setSelectedMemberView(m);
                    resetForm();
                  }}
                  style={styles.memberRow}
                >
                  <View style={styles.avatar}>
                    <Text>👤</Text>
                  </View>

                  <Text style={styles.memberName}>
                    {m.full_name}
                  </Text>

                  <Text style={styles.arrow}>›</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {selectedMemberView && (
            <>
              <TouchableOpacity
                onPress={() => {
                  setSelectedMemberView(null);
                  resetForm();
                }}
                style={styles.backRow}
              >
                <Text style={styles.backText}>
                  ‹ Back to members
                </Text>
              </TouchableOpacity>

              <View style={styles.memberDetailHeader}>
                <View style={styles.avatarLarge}>
                  <Text>👤</Text>
                </View>

                <Text style={styles.groupTitle}>
                  {selectedMemberView.full_name}
                </Text>

                <Text style={styles.groupCode}>
                  {selectedMemberView.member_number}
                </Text>
              </View>

              <Text style={styles.label}>
                Choose the kind of record
              </Text>

              <View style={styles.categoryGrid}>
                {categories.map(item => (
                  <TouchableOpacity
                    key={item.value}
                    onPress={() => {
                      setCategory(item.value);
                      resetForm();
                    }}
                    style={[
                      styles.categoryButton,
                      category === item.value && styles.chipOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryButtonText,
                        category === item.value && styles.chipTextOn,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {category === 'previous_loan_balance' && (
                <>
                  <Text style={styles.sectionTitle}>
                    Previous Loan Taken
                  </Text>

                  <Text style={styles.help}>
                    IMPORTANT: Enter the full original loan amount
                    INCLUDING ALL INTEREST. The amount entered here
                    is treated as the final total. Ebadsave will NOT
                    add interest again.
                  </Text>

                  <Text style={styles.label}>
                    Previous Loan Amount (UGX) - INCLUDING INTEREST
                  </Text>

                  <TextInput
                    value={prevLoanAmount}
                    onChangeText={setPrevLoanAmount}
                    style={styles.input}
                    placeholder="Enter total loan including interest"
                    keyboardType="decimal-pad"
                  />

                  <Text style={styles.label}>
                    Date when loan was issued (DD-MM-YYYY)
                  </Text>

                  <TextInput
                    value={prevLoanDate}
                    onChangeText={value => {
                      setPrevLoanDate(value);
                      setDueDate(autoDueDateFromIssueDate(value, maximumLoanRepaymentMonths));
                    }}
                    style={styles.input}
                    placeholder="DD-MM-YYYY Example: 17-04-2021"
                    keyboardType="numbers-and-punctuation"
                  />

                  <Text style={styles.sectionTitle}>
                    Current Loan / Balance Loan
                  </Text>

                  <Text style={styles.help}>
                    Money the member is still owing right now.
                  </Text>

                  <Text style={styles.label}>
                    Current Loan Amount (UGX)
                  </Text>

                  <TextInput
                    value={currentLoanAmount}
                    onChangeText={setCurrentLoanAmount}
                    style={styles.input}
                    placeholder="Enter outstanding balance"
                    keyboardType="decimal-pad"
                  />

                  <Text style={styles.label}>
                    Date (DD-MM-YYYY)
                  </Text>

                  <TextInput
                    value={currentLoanDate}
                    onChangeText={setCurrentLoanDate}
                    style={styles.input}
                    placeholder="DD-MM-YYYY"
                    keyboardType="numbers-and-punctuation"
                  />

                  <Text style={styles.label}>
                    Automatically Calculated Due Date
                  </Text>

                  <TextInput
                    value={dueDate}
                    editable={false}
                    style={[styles.input, styles.autoDateInput]}
                    placeholder="Enter loan issue date to calculate due date"
                  />

                  <Text style={styles.help}>
                    Calculated automatically from the loan issue date using the group's maximum repayment period ({maximumLoanRepaymentMonths} months). An outstanding balance after this date is marked OVERDUE in red.
                  </Text>

                  <Text style={styles.label}>
                    Amount Paid - Auto, do not edit
                  </Text>

                  <View style={styles.autoBox}>
                    <Text style={styles.autoText}>
                      UGX {amountPaid.toLocaleString()}
                    </Text>

                    <Text style={styles.help}>
                      Total loan INCLUDING interest minus current
                      outstanding balance.
                    </Text>
                  </View>
                </>
              )}

              {category !== 'previous_loan_balance' && (
                <>
                  <Text style={styles.label}>
                    Date written in the old book (DD-MM-YYYY)
                  </Text>

                  <TextInput
                    value={date}
                    onChangeText={setDate}
                    style={styles.input}
                    placeholder="DD-MM-YYYY Example: 17-04-2021"
                    keyboardType="numbers-and-punctuation"
                  />

                  <Text style={styles.label}>
                    Amount in UGX
                  </Text>

                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    style={styles.input}
                    placeholder="Enter amount"
                    keyboardType="decimal-pad"
                  />
                </>
              )}

              <Text style={styles.label}>
                Extra details (optional)
              </Text>

              <TextInput
                value={description}
                onChangeText={setDescription}
                style={[styles.input, styles.multiline]}
                multiline
                placeholder="Enter any other details"
              />

              <TouchableOpacity
                disabled={saving}
                onPress={() => void saveRecord()}
                style={[
                  styles.primary,
                  saving && styles.disabled,
                ]}
              >
                <Text style={styles.primaryText}>
                  {saving ? 'SAVING…' : 'SAVE OLD RECORD'}
                </Text>
              </TouchableOpacity>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>
                  Summary for {selectedMemberView.full_name}
                </Text>

                <View style={styles.detailRow}>
                  <Text style={styles.rowLabel}>
                    Previous Loan
                  </Text>

                  <Text style={styles.rowValue}>
                    UGX {totalPrev.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.rowLabel}>
                    Current Loan / Balance
                  </Text>

                  <Text style={styles.rowValue}>
                    UGX {totalCurr.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.rowLabel}>
                    Amount Paid
                  </Text>

                  <Text style={styles.rowValue}>
                    UGX {totalPaid.toLocaleString()}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.rowLabel}>
                    All Records
                  </Text>

                  <Text style={styles.rowValue}>
                    {visibleDrafts.length}
                  </Text>
                </View>
              </View>

              <Text style={styles.heading}>
                Records for this member ({visibleDrafts.length})
              </Text>

              {visibleDrafts.map(draft => {
                const savedLoanDueDate =
                  prevDrafts.find(item => item.loan_due_date)?.loan_due_date || '';
                const overdue =
                  draft.category === 'loan_issued' &&
                  isOverdue(savedLoanDueDate, totalCurr);

                return (
                  <View
                    key={draft.id}
                    style={[
                      styles.draftCard,
                      overdue && styles.overdueCard,
                    ]}
                  >
                    <View style={styles.detailRow}>
                      <Text style={styles.importTitle}>
                        {draft.category === 'previous_loan_balance'
                          ? 'Previous Loan'
                          : draft.category === 'loan_issued'
                            ? 'Current Loan'
                            : draft.category}{' '}
                        • UGX {Number(draft.amount).toLocaleString()}
                      </Text>

                      {overdue && (
                        <Text style={styles.overdueText}>
                          OVERDUE
                        </Text>
                      )}
                    </View>

                    <Text style={styles.meta}>
                      {formatDDMMYYYY(draft.transaction_date)}
                    </Text>

                    {draft.category === 'loan_issued' && !!savedLoanDueDate && (
                      <Text style={styles.meta}>
                        Due date: {formatDDMMYYYY(savedLoanDueDate)}
                      </Text>
                    )}

                    {overdue && (
                      <Text style={styles.overdueText}>
                        Due date passed - still owing
                      </Text>
                    )}

                    {!!draft.description && (
                      <Text style={styles.meta}>
                        {draft.description}
                      </Text>
                    )}

                    <View style={styles.row}>
                      <TouchableOpacity
                        onPress={() => editDraft(draft)}
                        style={styles.smallButton}
                      >
                        <Text style={styles.smallText}>
                          Change
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => removeDraft(draft)}
                        style={[
                          styles.smallButton,
                          styles.delete,
                        ]}
                      >
                        <Text
                          style={[
                            styles.smallText,
                            styles.deleteText,
                          ]}
                        >
                          Remove
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    'Finished',
                    `All records for ${selectedMemberView.full_name} are saved.`
                  );

                  setSelectedMemberView(null);
                }}
                style={[
                  styles.primary,
                  { backgroundColor: '#14532d' },
                ]}
              >
                <Text style={styles.primaryText}>
                  FINISH - DONE FOR THIS MEMBER
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f3f6f4',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 13,
    paddingBottom: 38,
  },
  back: {
    paddingVertical: 10,
  },
  backText: {
    color: '#166534',
    fontWeight: '500',
    fontSize: 12,
  },
  backRow: {
    marginTop: 12,
    paddingVertical: 6,
  },
  header: {
    backgroundColor: '#14532d',
    borderRadius: 16,
    padding: 17,
    marginBottom: 16,
  },
  kicker: {
    color: '#bbf7d0',
    fontSize: 10,
    fontWeight: '500',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 22,
    marginTop: 7,
  },
  sub: {
    color: '#f0fdf4',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
  },
  stepCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#dbe4dc',
    marginBottom: 13,
  },
  stepNumber: {
    color: '#16a34a',
    fontSize: 10,
    fontWeight: '500',
  },
  stepTitle: {
    color: '#14532d',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14532d',
    marginTop: 16,
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 13,
    marginBottom: 9,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
    marginTop: 12,
    marginBottom: 7,
  },
  input: {
    minHeight: 30,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 11,
    color: '#111827',
    fontSize: 12,
    backgroundColor: '#fff',
  },
  multiline: {
    minHeight: 75,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  chipOn: {
    backgroundColor: '#166534',
    borderColor: '#166534',
  },
  chipTextOn: {
    color: '#fff',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  categoryButton: {
    width: '30%',
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 10,
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
  },
  categoryButtonText: {
    color: '#14532d',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  memberName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
    marginLeft: 10,
  },
  memberDetailHeader: {
    marginTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  arrow: {
    fontSize: 18,
    color: '#111827',
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 22,
    color: '#111827',
  },
  groupCode: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
  },
  rowValue: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
  },
  autoBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 10,
    padding: 11,
  },
  autoDateInput: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
    color: '#14532d',
    fontWeight: '700',
  },
  autoText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#14532d',
  },
  summaryCard: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 10,
    padding: 11,
    marginTop: 14,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e3a8a',
  },
  primary: {
    minHeight: 49,
    backgroundColor: '#16a34a',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
  },
  primaryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
  importTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
  },
  meta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 14,
  },
  help: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 14,
    marginTop: 7,
  },
  draftCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe4dc',
    borderRadius: 10,
    padding: 11,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  smallButton: {
    flex: 1,
    backgroundColor: '#dbeafe',
    padding: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  delete: {
    backgroundColor: '#fee2e2',
  },
  smallText: {
    color: '#1d4ed8',
    fontWeight: '500',
    fontSize: 12,
  },
  deleteText: {
    color: '#b91c1c',
  },
  notice: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 10,
    padding: 11,
    marginBottom: 10,
  },
  noticeText: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 14,
  },
  overdueText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  overdueCard: {
    borderColor: '#dc2626',
    borderWidth: 1,
    backgroundColor: '#fef2f2',
  },
});
