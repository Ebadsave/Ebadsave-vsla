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
  createHistoricalMigrationImport,
  getHistoricalMigrationImports,
  getHistoricalMigrationDrafts,
  createHistoricalMigrationDraft,
  updateHistoricalMigrationDraft,
  deleteHistoricalMigrationDraft,
  setHistoricalMigrationDraftsAwaitingVerification,
  approveHistoricalMigrationImport,
  returnHistoricalMigrationImportForCorrection,
  getHistoricalMigrationReconciliation,
  getHistoricalMigrationClosureStatus,
  closeHistoricalMigration,
  type HistoricalMigrationReconciliation,
  type HistoricalMigrationImport,
  type HistoricalMigrationDraft,
  type HistoricalMigrationCategory,
  type HistoricalMigrationEvidenceType,
  type HistoricalMigrationClosureStatus,
} from '../database/database';

type Props = {
  route: {
    params: {
      groupId: number;
      executiveMemberId: number;
    };
  };
  navigation: {
    goBack: () => void;
  };
};

type Member = {
  id: number;
  full_name: string;
  member_number: string;
};

const categories: {
  value: HistoricalMigrationCategory;
  label: string;
}[] = [
  { value: 'savings', label: '💰 Savings' },
  { value: 'previous_loan_balance', label: '📋 Previous loan' },
  { value: 'fine', label: '⚠️ Fines' },
  { value: 'insurance', label: '🛡️ Insurance' },
  { value: 'loan_issued', label: '🤝 Loans given' },
  { value: 'loan_repayment', label: '💵 Loan payments' },
  { value: 'group_income', label: 'Other money received' },
  { value: 'group_expense', label: 'Money spent' },
  { value: 'other', label: 'External loan / other' },
];

const evidenceTypes: {
  value: HistoricalMigrationEvidenceType;
  label: string;
}[] = [
  { value: 'manual', label: 'Paper book' },
  { value: 'pdf', label: 'PDF file' },
  { value: 'image', label: 'Photo' },
  { value: 'audio', label: 'Voice recording' },
  { value: 'video', label: 'Video' },
];

const statusLabel: Record<string, string> = {
  pending_review: 'Waiting to be checked',
  processing: 'Being entered',
  needs_correction: 'Needs correction',
  awaiting_verification: 'Waiting for checking',
  approved: 'Approved and saved',
  rejected: 'Not approved',
};

const needsMember = (category: HistoricalMigrationCategory) =>
  [
    'savings',
    'loan_issued',
    'loan_repayment',
    'previous_loan_balance',
    'fine',
    'insurance',
  ].includes(category);

const categoryLabel = (value: HistoricalMigrationCategory) =>
  categories.find(item => item.value === value)?.label ||
  value.replace(/_/g, ' ');

export default function HistoricalMigrationScreen({
  route,
  navigation,
}: Props) {
  const { groupId, executiveMemberId } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(true);

  const [imports, setImports] = useState<HistoricalMigrationImport[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedImport, setSelectedImport] =
    useState<HistoricalMigrationImport | null>(null);
  const [drafts, setDrafts] = useState<HistoricalMigrationDraft[]>([]);

  const [evidenceType, setEvidenceType] =
    useState<HistoricalMigrationEvidenceType>('manual');
  const [evidenceName, setEvidenceName] = useState('');
  const [evidenceUri, setEvidenceUri] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const [category, setCategory] =
    useState<HistoricalMigrationCategory>('savings');
  const [memberId, setMemberId] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [opening, setOpening] = useState(false);
  const [editing, setEditing] =
    useState<HistoricalMigrationDraft | null>(null);

  const [memberConfirmations, setMemberConfirmations] =
    useState<Record<number, string>>({});
  const [evidenceReviewed, setEvidenceReviewed] = useState(false);
  const [amountsReviewed, setAmountsReviewed] = useState(false);

  const [showReconciliation, setShowReconciliation] = useState(false);
  const [reconciliation, setReconciliation] =
    useState<HistoricalMigrationReconciliation | null>(null);
  const [reconciliationLoading, setReconciliationLoading] =
    useState(false);

  const [closureStatus, setClosureStatus] =
    useState<HistoricalMigrationClosureStatus | null>(null);
  const [closureCash, setClosureCash] = useState('0');
  const [closureInsurance, setClosureInsurance] = useState('0');
  const [closureFines, setClosureFines] = useState('0');
  const [closureLoans, setClosureLoans] = useState('0');
  const [closureNotes, setClosureNotes] = useState('');

  const [closureChecks, setClosureChecks] = useState({
    paper: false,
    members: false,
    funds: false,
    unresolved: false,
    rejected: false,
    backup: false,
  });

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [loadedImports, loadedMembers, loadedClosure] =
        await Promise.all([
          getHistoricalMigrationImports(groupId),
          getMembersByGroupId(groupId),
          getHistoricalMigrationClosureStatus(groupId),
        ]);

      setClosureStatus(loadedClosure);
      setCanManage(!loadedClosure.closed);
      setImports(loadedImports);

      setMembers(
        (loadedMembers as Member[])
          .slice()
          .sort((a, b) => a.full_name.localeCompare(b.full_name)),
      );

      if (selectedImport) {
        const fresh =
          loadedImports.find(item => item.id === selectedImport.id) || null;

        setSelectedImport(fresh);
        setDrafts(
          fresh ? await getHistoricalMigrationDrafts(fresh.id, groupId) : [],
        );
      }
    } catch (e) {
      Alert.alert(
        'Could not load old records',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, selectedImport?.id]);

  const loadReconciliation = async () => {
    setReconciliationLoading(true);

    try {
      setReconciliation(
        await getHistoricalMigrationReconciliation(groupId),
      );
    } catch (e) {
      Alert.alert(
        'Could not prepare report',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setReconciliationLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openImport = async (item: HistoricalMigrationImport) => {
    setSelectedImport(item);
    setEditing(null);
    setMemberConfirmations({});
    setEvidenceReviewed(false);
    setAmountsReviewed(false);

    try {
      setDrafts(await getHistoricalMigrationDrafts(item.id, groupId));
    } catch (e) {
      Alert.alert(
        'Could not open records',
        e instanceof Error ? e.message : 'Please try again.',
      );
    }
  };

  const enterMigrationRecords = async () => {
    if (closureStatus?.closed) {
      Alert.alert(
        'Records already closed',
        'This group has finished entering its old records.',
      );
      return;
    }

    setSaving(true);

    try {
      const latestImports = await getHistoricalMigrationImports(groupId);
      setImports(latestImports);

      if (latestImports.length === 0) {
        setSelectedImport(null);
        setDrafts([]);
        Alert.alert(
          'Add the old book first',
          'First register the paper book, photo or other record in Step 1.',
        );
        return;
      }

      const target =
        latestImports.find(item => item.id === selectedImport?.id) ||
        latestImports[0];

      await openImport(target);
    } catch (e) {
      Alert.alert(
        'Could not open records',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const resetDraft = () => {
    setEditing(null);
    setCategory('savings');
    setMemberId(null);
    setDate('');
    setAmount('');
    setDescription('');
    setOpening(false);
  };

  const saveImport = async () => {
    if (closureStatus?.closed) {
      Alert.alert('Records closed', 'Old-record entry has already been closed.');
      return;
    }

    if (!evidenceName.trim()) {
      Alert.alert(
        'Enter the book name',
        'For example: Savings book 2021 or Loan book, page 4.',
      );
      return;
    }

    setSaving(true);

    try {
      const id = await createHistoricalMigrationImport({
        group_id: groupId,
        evidence_type: evidenceType,
        evidence_name: evidenceName.trim(),
        evidence_uri: evidenceUri.trim(),
        source_reference: reference.trim(),
        notes: notes.trim(),
        created_by_member_id: executiveMemberId,
      });

      setEvidenceName('');
      setEvidenceUri('');
      setReference('');
      setNotes('');

      const latestImports = await getHistoricalMigrationImports(groupId);
      setImports(latestImports);

      const item = latestImports.find(i => i.id === id);

      if (item) {
        await openImport(item);
      }

      await load();

      Alert.alert(
        'Saved',
        'The old book or record has been saved. No group money has changed.',
      );
    } catch (e) {
      Alert.alert(
        'Could not save',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!selectedImport) {
      Alert.alert(
        'Choose an old book',
        'Open an old book or record before adding entries.',
      );
      return;
    }

    if (closureStatus?.closed) {
      Alert.alert('Records closed', 'Old-record entry has already been closed.');
      return;
    }

    const iso = date.trim();

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
      !Number.isFinite(new Date(`${iso}T12:00:00.000Z`).getTime()) ||
      new Date(`${iso}T12:00:00.000Z`).toISOString().slice(0, 10) !== iso
    ) {
      Alert.alert(
        'Check the date',
        'Enter the date as YYYY-MM-DD. Example: 2021-04-17.',
      );
      return;
    }

    const value = Number(amount.replace(/,/g, ''));

    if (!Number.isFinite(value) || value < 0) {
      Alert.alert('Check the amount', 'Enter a correct amount in UGX.');
      return;
    }

    if (needsMember(category) && !memberId) {
      Alert.alert(
        'Choose a member',
        'Choose the member whose name is in the old book.',
      );
      return;
    }

    setSaving(true);

    try {
      const payload = {
        import_id: selectedImport.id,
        group_id: groupId,
        member_id: needsMember(category) ? memberId : null,
        category,
        transaction_date: iso,
        amount: value,
        is_opening_balance: opening,
        description: description.trim(),
        source_reference: selectedImport.source_reference || '',
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
        await getHistoricalMigrationDrafts(selectedImport.id, groupId),
      );

      resetDraft();

      Alert.alert(
        'Entry saved',
        'This entry is waiting to be checked. It has not changed group money.',
      );
    } catch (e) {
      Alert.alert(
        'Could not save entry',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const submitForVerification = async () => {
    if (!selectedImport) return;

    Alert.alert(
      'Send entries for checking?',
      'The entries will be sent for checking. They will not be added to group records until approved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSaving(true);
            try {
              await setHistoricalMigrationDraftsAwaitingVerification(
                selectedImport.id,
                groupId,
              );

              const refreshed = await getHistoricalMigrationImports(groupId);
              setImports(refreshed);

              const fresh = refreshed.find(i => i.id === selectedImport.id);
              if (fresh) await openImport(fresh);

              Alert.alert('Sent', 'The entries are now waiting to be checked.');
            } catch (e) {
              Alert.alert(
                'Could not send entries',
                e instanceof Error ? e.message : 'Please try again.',
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const returnSelectedImportForCorrection = () => {
    if (!selectedImport) return;

    Alert.alert(
      'Return these entries?',
      'The entries will go back for correction. No money will be added or removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Return',
          onPress: async () => {
            setSaving(true);
            try {
              await returnHistoricalMigrationImportForCorrection(
                groupId,
                selectedImport.id,
                executiveMemberId,
              );

              const refreshed = await getHistoricalMigrationImports(groupId);
              setImports(refreshed);

              const fresh = refreshed.find(i => i.id === selectedImport.id);
              if (fresh) await openImport(fresh);

              Alert.alert('Returned', 'You can now correct the entries.');
            } catch (e) {
              Alert.alert(
                'Could not return entries',
                e instanceof Error ? e.message : 'Please try again.',
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const approveSelectedImport = async () => {
    if (!selectedImport) return;

    if (selectedImport.status !== 'awaiting_verification') {
      Alert.alert('Not ready', 'Send the entries for checking first.');
      return;
    }

    if (!evidenceReviewed || !amountsReviewed) {
      Alert.alert(
        'Check the two boxes',
        'Confirm that you checked the old book and all names, dates and amounts.',
      );
      return;
    }

    Alert.alert(
      'Approve and save these entries?',
      'Only approve after checking the old book and member numbers carefully. Once approved, these entries will be added to the group records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve and save',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const result = await approveHistoricalMigrationImport({
                group_id: groupId,
                import_id: selectedImport.id,
                approver_member_id: executiveMemberId,
                confirmed_member_numbers: memberConfirmations,
                evidence_reviewed: evidenceReviewed,
                amounts_reviewed: amountsReviewed,
              });

              setEvidenceReviewed(false);
              setAmountsReviewed(false);
              setMemberConfirmations({});

              const refreshed = await getHistoricalMigrationImports(groupId);
              setImports(refreshed);

              const fresh = refreshed.find(i => i.id === selectedImport.id);
              if (fresh) await openImport(fresh);

              Alert.alert(
                'Entries approved',
                `${result.approved_drafts} entries approved. ${result.posted_transactions} transactions saved, ${result.saved_opening_balances} opening savings balances saved, and ${result.saved_loan_snapshots} old loan balances saved.`,
              );
            } catch (e) {
              Alert.alert(
                'Approval stopped',
                e instanceof Error
                  ? e.message
                  : 'No changes were saved. Check the entries and try again.',
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const editDraft = (draft: HistoricalMigrationDraft) => {
    setEditing(draft);
    setCategory(draft.category);
    setMemberId(draft.member_id);
    setDate(draft.transaction_date);
    setAmount(String(draft.amount));
    setDescription(draft.description);
    setOpening(!!draft.is_opening_balance);
  };

  const removeDraft = (draft: HistoricalMigrationDraft) => {
    Alert.alert(
      'Remove this entry?',
      'Only the entry being prepared will be removed. The old book will remain saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await deleteHistoricalMigrationDraft(
                draft.id,
                draft.import_id,
                groupId,
              );

              setDrafts(
                await getHistoricalMigrationDrafts(draft.import_id, groupId),
              );

              if (editing?.id === draft.id) resetDraft();
            } catch (e) {
              Alert.alert(
                'Could not remove entry',
                e instanceof Error ? e.message : 'Please try again.',
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const finalizeHistoricalMigration = () => {
    if (!closureStatus || closureStatus.closed) return;

    const amounts = [
      closureCash,
      closureInsurance,
      closureFines,
      closureLoans,
    ].map(v => Number(v.replace(/,/g, '')));

    if (amounts.some(v => !Number.isFinite(v) || v < 0)) {
      Alert.alert(
        'Check the amounts',
        'Enter correct amounts for all four group balances.',
      );
      return;
    }

    if (closureNotes.trim().length < 12) {
      Alert.alert(
        'Add a note',
        'Write a short note about the final checking. Use at least 12 characters.',
      );
      return;
    }

    if (!Object.values(closureChecks).every(Boolean)) {
      Alert.alert('Finish the checklist', 'Tick all six boxes after each check.');
      return;
    }

    Alert.alert(
      'Finish entering old records?',
      'This will close the old-record entry process. Approved records will remain saved. Normal group meetings and new transactions can continue.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finish',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await closeHistoricalMigration({
                group_id: groupId,
                signed_off_by_member_id: executiveMemberId,
                verified_group_cash: amounts[0],
                verified_insurance_fund: amounts[1],
                verified_fines_fund: amounts[2],
                verified_outstanding_loans: amounts[3],
                paper_ledgers_reviewed: closureChecks.paper,
                member_balances_reviewed: closureChecks.members,
                group_funds_reconciled: closureChecks.funds,
                unresolved_items_resolved: closureChecks.unresolved,
                rejected_items_reviewed: closureChecks.rejected,
                final_backup_completed: closureChecks.backup,
                closure_notes: closureNotes.trim(),
              });

              const refreshed =
                await getHistoricalMigrationClosureStatus(groupId);

              setClosureStatus(refreshed);
              setCanManage(false);

              Alert.alert(
                'Finished',
                'Old records have been closed and saved. The group can continue using Ebadsave for normal meetings and new transactions.',
              );
            } catch (e) {
              Alert.alert(
                'Could not finish',
                e instanceof Error ? e.message : 'Please check and try again.',
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  if (loading && imports.length === 0) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.help}>Loading old records…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.kicker}>EBADSAVE VSLA</Text>
          <Text style={styles.title}>Enter Old Group Records</Text>
          <Text style={styles.sub}>
            Follow the four steps below to enter records from your old books.
          </Text>
        </View>

        {closureStatus?.closed && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Old-record entry has been closed for this group.
            </Text>
          </View>
        )}

        <View style={styles.stepCard}>
          <Text style={styles.stepNumber}>STEP 1</Text>
          <Text style={styles.stepTitle}>Register old group books</Text>
          <Text style={styles.help}>
            Save the book, page, photo or recording where the old information is written.
          </Text>

          <Text style={styles.label}>What are you using?</Text>
          <View style={styles.chips}>
            {evidenceTypes.map(item => (
              <TouchableOpacity
                key={item.value}
                disabled={saving || !!closureStatus?.closed}
                onPress={() => setEvidenceType(item.value)}
                style={[
                  styles.chip,
                  evidenceType === item.value && styles.chipOn,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    evidenceType === item.value && styles.chipTextOn,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Name of the book or record *</Text>
          <TextInput
            value={evidenceName}
            onChangeText={setEvidenceName}
            style={styles.input}
            placeholder="Example: Savings book 2021"
            editable={!saving && !closureStatus?.closed}
          />

          <Text style={styles.label}>Saved file location (optional)</Text>
          <TextInput
            value={evidenceUri}
            onChangeText={setEvidenceUri}
            style={styles.input}
            placeholder="File location, if available"
            autoCapitalize="none"
            editable={!saving && !closureStatus?.closed}
          />

          <Text style={styles.label}>Book page number (optional)</Text>
          <TextInput
            value={reference}
            onChangeText={setReference}
            style={styles.input}
            placeholder="Example: Page 14"
            editable={!saving && !closureStatus?.closed}
          />

          <Text style={styles.label}>Extra information (optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            style={[styles.input, styles.multiline]}
            multiline
            placeholder="Write any helpful information"
            editable={!saving && !closureStatus?.closed}
          />

          <TouchableOpacity
            disabled={saving || !!closureStatus?.closed}
            onPress={() => void saveImport()}
            style={[styles.primary, (saving || closureStatus?.closed) && styles.disabled]}
          >
            <Text style={styles.primaryText}>
              {saving ? 'Saving…' : 'SAVE BOOK / RECORD'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.heading}>Saved books and records ({imports.length})</Text>

        {imports.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>No old books or records have been saved yet.</Text>
          </View>
        ) : (
          imports.map(item => (
            <TouchableOpacity
              key={item.id}
              onPress={() => void openImport(item)}
              style={[
                styles.importCard,
                selectedImport?.id === item.id && styles.selected,
              ]}
            >
              <Text style={styles.importTitle}>
                {item.evidence_name || `Record #${item.id}`}
              </Text>
              <Text style={styles.meta}>
                {item.evidence_type.toUpperCase()} • {item.draft_count || 0} entries •{' '}
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
              <Text style={styles.status}>
                {statusLabel[item.status] || item.status}
              </Text>
              {!!item.source_reference && (
                <Text style={styles.meta}>Page: {item.source_reference}</Text>
              )}
            </TouchableOpacity>
          ))
        )}

        <View style={styles.stepCard}>
          <Text style={styles.stepNumber}>STEP 2</Text>
          <Text style={styles.stepTitle}>Enter old money records</Text>
          <Text style={styles.help}>
            Open a saved book, choose the record type and member, then enter the date and amount.
          </Text>

          <TouchableOpacity
            disabled={saving || !!closureStatus?.closed}
            onPress={() => void enterMigrationRecords()}
            style={[
              styles.enterRecordsButton,
              (saving || closureStatus?.closed) && styles.disabled,
            ]}
          >
            <Text style={styles.enterRecordsButtonText}>
              {saving ? 'OPENING…' : 'ENTER OLD RECORDS'}
            </Text>
          </TouchableOpacity>

          {selectedImport && (
            <>
              <View style={styles.selectedBook}>
                <Text style={styles.selectedBookTitle}>Book being used</Text>
                <Text style={styles.selectedBookName}>
                  {selectedImport.evidence_name}
                </Text>
              </View>

              <Text style={styles.label}>Choose the kind of record</Text>
              <View style={styles.categoryGrid}>
                {categories.map(item => (
                  <TouchableOpacity
                    key={item.value}
                    disabled={
                      saving ||
                      !!closureStatus?.closed ||
                      ['approved', 'awaiting_verification'].includes(
                        selectedImport.status,
                      )
                    }
                    onPress={() => {
                      setCategory(item.value);
                      if (!needsMember(item.value)) setMemberId(null);
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

              {needsMember(category) && (
                <>
                  <Text style={styles.label}>Choose the member</Text>
                  {members.length === 0 ? (
                    <Text style={styles.empty}>No members found in this group.</Text>
                  ) : (
                    <View style={styles.memberList}>
                      {members.map(member => (
                        <TouchableOpacity
                          key={member.id}
                          disabled={
                            saving ||
                            !!closureStatus?.closed ||
                            ['approved', 'awaiting_verification'].includes(
                              selectedImport.status,
                            )
                          }
                          onPress={() => setMemberId(member.id)}
                          style={[
                            styles.memberButton,
                            memberId === member.id && styles.memberButtonOn,
                          ]}
                        >
                          <Text
                            style={[
                              styles.memberButtonText,
                              memberId === member.id && styles.chipTextOn,
                            ]}
                          >
                            {memberId === member.id ? '✓ ' : ''}
                            {member.full_name}
                          </Text>
                          <Text
                            style={[
                              styles.memberNumber,
                              memberId === member.id && styles.memberNumberOn,
                            ]}
                          >
                            {member.member_number}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              <Text style={styles.label}>Date written in the old book</Text>
              <TextInput
                value={date}
                onChangeText={setDate}
                style={styles.input}
                placeholder="YYYY-MM-DD  Example: 2021-04-17"
                keyboardType="numbers-and-punctuation"
                editable={
                  !saving &&
                  !closureStatus?.closed &&
                  !['approved', 'awaiting_verification'].includes(selectedImport.status)
                }
              />

              <Text style={styles.label}>Amount in UGX</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                style={styles.input}
                placeholder="Enter amount"
                keyboardType="decimal-pad"
                editable={
                  !saving &&
                  !closureStatus?.closed &&
                  !['approved', 'awaiting_verification'].includes(selectedImport.status)
                }
              />

              <TouchableOpacity
                disabled={
                  saving ||
                  !!closureStatus?.closed ||
                  ['approved', 'awaiting_verification'].includes(selectedImport.status)
                }
                onPress={() => setOpening(value => !value)}
                style={styles.checkRow}
              >
                <Text style={styles.checkbox}>{opening ? '☑' : '☐'}</Text>
                <Text style={styles.chipText}>
                  This is the amount the member already had
                </Text>
              </TouchableOpacity>

              <Text style={styles.label}>Extra details (optional)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                style={[styles.input, styles.multiline]}
                multiline
                placeholder="Enter any other details from the old book"
                editable={
                  !saving &&
                  !closureStatus?.closed &&
                  !['approved', 'awaiting_verification'].includes(selectedImport.status)
                }
              />

              <TouchableOpacity
                disabled={
                  saving ||
                  !!closureStatus?.closed ||
                  ['approved', 'awaiting_verification'].includes(selectedImport.status)
                }
                onPress={() => void saveDraft()}
                style={[
                  styles.primary,
                  (
                    saving ||
                    closureStatus?.closed ||
                    ['approved', 'awaiting_verification'].includes(selectedImport.status)
                  ) && styles.disabled,
                ]}
              >
                <Text style={styles.primaryText}>
                  {saving ? 'SAVING…' : editing ? 'SAVE CHANGES' : 'SAVE OLD RECORD'}
                </Text>
              </TouchableOpacity>

              {!!editing && (
                <TouchableOpacity onPress={resetDraft} style={styles.secondary}>
                  <Text style={styles.secondaryText}>Cancel changes</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.heading}>Entries added ({drafts.length})</Text>

              {drafts.length === 0 ? (
                <Text style={styles.empty}>No entries added to this book yet.</Text>
              ) : (
                drafts.map(draft => (
                  <View key={draft.id} style={styles.draftCard}>
                    <Text style={styles.importTitle}>
                      {categoryLabel(draft.category)} • UGX{' '}
                      {Number(draft.amount).toLocaleString()}
                    </Text>
                    <Text style={styles.meta}>
                      {draft.transaction_date} • {draft.member_name || 'Group record'}
                      {draft.member_number ? ` (${draft.member_number})` : ''}
                    </Text>
                    {draft.is_opening_balance === 1 && (
                      <Text style={styles.opening}>Old balance already held</Text>
                    )}
                    {!!draft.description && (
                      <Text style={styles.meta}>{draft.description}</Text>
                    )}
                    {!['approved', 'awaiting_verification'].includes(selectedImport.status) && (
                      <View style={styles.row}>
                        <TouchableOpacity
                          disabled={saving || !!closureStatus?.closed}
                          onPress={() => editDraft(draft)}
                          style={styles.smallButton}
                        >
                          <Text style={styles.smallText}>Change</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          disabled={saving || !!closureStatus?.closed}
                          onPress={() => removeDraft(draft)}
                          style={[styles.smallButton, styles.delete]}
                        >
                          <Text style={[styles.smallText, styles.deleteText]}>
                            Remove
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}

              {selectedImport.status === 'awaiting_verification' && (
                <View style={styles.approvalCard}>
                  <Text style={styles.approvalTitle}>Check the entries</Text>
                  <Text style={styles.help}>
                    Compare every member name and number with the group member list. Check the old book, dates and amounts.
                  </Text>

                  {drafts
                    .filter(draft => needsMember(draft.category))
                    .map(draft => (
                      <View key={`verify-${draft.id}`} style={styles.verifyRow}>
                        <Text style={styles.verifyTitle}>
                          {draft.member_name || 'Member not selected'} •{' '}
                          {categoryLabel(draft.category)}
                        </Text>
                        <Text style={styles.meta}>
                          Entry #{draft.id} • UGX {Number(draft.amount).toLocaleString()} •{' '}
                          {draft.transaction_date}
                        </Text>
                        <Text style={styles.label}>
                          Enter this member's number to confirm
                        </Text>
                        <TextInput
                          value={memberConfirmations[draft.id] || ''}
                          onChangeText={value =>
                            setMemberConfirmations(old => ({
                              ...old,
                              [draft.id]: value,
                            }))
                          }
                          style={styles.input}
                          autoCapitalize="characters"
                          placeholder="Member number"
                        />
                      </View>
                    ))}

                  <TouchableOpacity
                    onPress={() => setEvidenceReviewed(value => !value)}
                    style={styles.checkRow}
                  >
                    <Text style={styles.checkbox}>{evidenceReviewed ? '☑' : '☐'}</Text>
                    <Text style={styles.chipText}>I checked the old book or record.</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setAmountsReviewed(value => !value)}
                    style={styles.checkRow}
                  >
                    <Text style={styles.checkbox}>{amountsReviewed ? '☑' : '☐'}</Text>
                    <Text style={styles.chipText}>
                      I checked all names, dates and amounts.
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.validationNotice}>
                    <Text style={styles.validationText}>
                      Entries with wrong dates, wrong member numbers or missing information will not be approved.
                    </Text>
                  </View>

                  <TouchableOpacity
                    disabled={saving}
                    onPress={returnSelectedImportForCorrection}
                    style={styles.secondary}
                  >
                    <Text style={styles.secondaryText}>Return entries for correction</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={saving || !evidenceReviewed || !amountsReviewed}
                    onPress={() => void approveSelectedImport()}
                    style={[
                      styles.primary,
                      (saving || !evidenceReviewed || !amountsReviewed) && styles.disabled,
                    ]}
                  >
                    <Text style={styles.primaryText}>
                      {saving ? 'SAVING…' : 'APPROVE AND SAVE ENTRIES'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {selectedImport.status === 'approved' && (
                <View style={styles.approvalCard}>
                  <Text style={styles.approvalTitle}>✓ Entries approved and saved</Text>
                  <Text style={styles.help}>
                    These entries are saved and cannot be changed here.
                  </Text>
                </View>
              )}

              <TouchableOpacity
                disabled={
                  saving ||
                  drafts.length === 0 ||
                  ['approved', 'rejected', 'awaiting_verification'].includes(
                    selectedImport.status,
                  )
                }
                onPress={() => void submitForVerification()}
                style={[
                  styles.primary,
                  (
                    saving ||
                    drafts.length === 0 ||
                    ['approved', 'rejected', 'awaiting_verification'].includes(
                      selectedImport.status,
                    )
                  ) && styles.disabled,
                ]}
              >
                <Text style={styles.primaryText}>SEND ENTRIES FOR CHECKING</Text>
              </TouchableOpacity>

              <Text style={styles.help}>
                Entries are not added to group records until they have been checked and approved.
              </Text>
            </>
          )}
        </View>

        <View style={styles.stepCard}>
          <Text style={styles.stepNumber}>STEP 3</Text>
          <Text style={styles.stepTitle}>Check all the records</Text>
          <Text style={styles.help}>
            Compare the saved and approved entries with the original books.
          </Text>

          <TouchableOpacity
            style={styles.primary}
            disabled={reconciliationLoading}
            onPress={() => {
              setShowReconciliation(value => !value);
              if (!showReconciliation || !reconciliation) {
                void loadReconciliation();
              }
            }}
          >
            <Text style={styles.primaryText}>
              {reconciliationLoading
                ? 'PREPARING REPORT…'
                : showReconciliation
                  ? 'HIDE REPORT'
                  : 'OPEN CHECKING REPORT'}
            </Text>
          </TouchableOpacity>
        </View>

        {showReconciliation && (
          <View style={styles.card}>
            <View style={styles.reportHeaderRow}>
              <Text style={styles.approvalTitle}>Group records report</Text>
              <TouchableOpacity
                onPress={() => void loadReconciliation()}
                disabled={reconciliationLoading}
              >
                <Text style={styles.reportRefresh}>Refresh</Text>
              </TouchableOpacity>
            </View>

            {reconciliationLoading && !reconciliation ? (
              <ActivityIndicator size="small" color="#16a34a" />
            ) : reconciliation ? (
              <>
                <Text style={styles.reportSection}>Old books and records</Text>
                <View style={styles.reportGrid}>
                  <Metric label="All books" value={reconciliation.imports.total} />
                  <Metric label="Approved" value={reconciliation.imports.approved} />
                  <Metric
                    label="Waiting"
                    value={reconciliation.imports.awaiting_verification}
                  />
                  <Metric
                    label="Still being checked"
                    value={reconciliation.imports.pending_or_correction}
                  />
                  <Metric label="Not approved" value={reconciliation.imports.rejected} />
                </View>

                <Text style={styles.reportSection}>Entries</Text>
                <View style={styles.reportGrid}>
                  <Metric label="All entries" value={reconciliation.drafts.total} />
                  <Metric label="Approved" value={reconciliation.drafts.approved} />
                  <Metric label="Not approved yet" value={reconciliation.drafts.unapproved} />
                </View>

                <Text style={styles.reportNote}>
                  Total approved amount: UGX{' '}
                  {reconciliation.drafts.approved_value.toLocaleString()}
                </Text>

                <Text style={styles.reportSection}>Entries by type</Text>
                {reconciliation.categories.length === 0 ? (
                  <Text style={styles.empty}>No entries have been added.</Text>
                ) : (
                  reconciliation.categories.map(row => (
                    <View key={row.category} style={styles.reportCategoryRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.importTitle}>
                          {categoryLabel(row.category as HistoricalMigrationCategory)}
                        </Text>
                        <Text style={styles.meta}>
                          {row.approved_count} approved out of {row.total_count}
                        </Text>
                        {row.opening_savings_amount > 0 && (
                          <Text style={styles.reportNote}>
                            Old savings: UGX {row.opening_savings_amount.toLocaleString()}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.reportAmount}>
                        {row.category === 'previous_loan_balance' ? 'Old balance: ' : 'UGX '}
                        {row.approved_amount.toLocaleString()}
                      </Text>
                    </View>
                  ))
                )}

                <Text style={styles.reportSection}>Recently approved entries</Text>
                {reconciliation.recent_approvals.length === 0 ? (
                  <Text style={styles.empty}>No entries have been approved yet.</Text>
                ) : (
                  reconciliation.recent_approvals.map(row => (
                    <View key={row.draft_id} style={styles.reportAuditRow}>
                      <Text style={styles.importTitle}>
                        Entry #{row.draft_id} •{' '}
                        {categoryLabel(row.category as HistoricalMigrationCategory)}
                      </Text>
                      <Text style={styles.meta}>
                        {row.transaction_date} • {row.member_name}
                        {row.member_number ? ` (${row.member_number})` : ''}
                      </Text>
                      <Text style={styles.meta}>
                        UGX {row.amount.toLocaleString()} • Checked by {row.approver_name}
                      </Text>
                      <Text style={styles.meta}>
                        Book: {row.source_reference || 'Not given'} • {row.approved_at}
                      </Text>
                    </View>
                  ))
                )}

                <View style={styles.reportWarning}>
                  <Text style={styles.reportWarningText}>
                    Compare these figures with the old books and the actual money held by the group. This report does not prove that the cash or loans are correct.
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        )}

        <View style={styles.finalCard}>
          <Text style={styles.finalKicker}>STEP 4</Text>
          <Text style={styles.finalTitle}>Finish and open the digital records</Text>
          <Text style={styles.help}>
            Complete the final checks before the group starts using its digital records.
          </Text>

          {closureStatus?.closed && closureStatus.closure ? (
            <View style={styles.closedPanel}>
              <Text style={styles.closedTitle}>✓ OLD RECORDS CLOSED</Text>
              <Text style={styles.meta}>
                Finished by {closureStatus.closure.signed_off_by_name} (
                {closureStatus.closure.signed_off_by_number})
              </Text>
              <Text style={styles.meta}>
                Date: {closureStatus.closure.closure_date}
              </Text>
              <Text style={styles.closedFoot}>
                The old records are saved. The group can continue using Ebadsave for normal meetings and new transactions.
              </Text>
            </View>
          ) : (
            <>
              {closureStatus && (
                <View style={styles.reportGrid}>
                  <Metric label="Group members" value={closureStatus.active_member_count} />
                  <Metric label="Approved books" value={closureStatus.approved_imports} />
                  <Metric label="Approved entries" value={closureStatus.approved_drafts} />
                  <Metric label="Books still waiting" value={closureStatus.unresolved_imports} />
                  <Metric label="Entries not approved" value={closureStatus.unapproved_drafts} />
                  <Metric label="Not approved" value={closureStatus.rejected_imports} />
                </View>
              )}

              <Text style={styles.label}>Check the group's money (UGX)</Text>
              <Text style={styles.label}>Cash held by the group</Text>
              <TextInput
                value={closureCash}
                onChangeText={setClosureCash}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="0"
              />
              <Text style={styles.label}>Insurance money</Text>
              <TextInput
                value={closureInsurance}
                onChangeText={setClosureInsurance}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="0"
              />
              <Text style={styles.label}>Fines money</Text>
              <TextInput
                value={closureFines}
                onChangeText={setClosureFines}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="0"
              />
              <Text style={styles.label}>Money members still owe</Text>
              <TextInput
                value={closureLoans}
                onChangeText={setClosureLoans}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="0"
              />

              <Text style={styles.label}>Final checks</Text>
              {([
                ['paper', 'I checked the old books against the entries.'],
                ['members', 'I checked every member’s savings and loan balance.'],
                ['funds', 'I checked the group cash, insurance and fines money.'],
                ['unresolved', 'All books and entries have been checked.'],
                ['rejected', 'I checked every entry that was not approved.'],
                ['backup', 'A new group backup has been made.'],
              ] as const).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  onPress={() =>
                    setClosureChecks(old => ({ ...old, [key]: !old[key] }))
                  }
                  style={styles.checkRow}
                >
                  <Text style={styles.checkbox}>
                    {closureChecks[key] ? '☑' : '☐'}
                  </Text>
                  <Text style={styles.chipText}>{label}</Text>
                </TouchableOpacity>
              ))}

              <Text style={styles.label}>Final note *</Text>
              <TextInput
                value={closureNotes}
                onChangeText={setClosureNotes}
                style={[styles.input, styles.multiline]}
                multiline
                placeholder="Write what was checked and agreed by the group."
              />

              {closureStatus &&
                (
                  closureStatus.unresolved_imports > 0 ||
                  closureStatus.unapproved_drafts > 0 ||
                  closureStatus.approved_drafts === 0
                ) && (
                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>
                      Not ready yet. Finish checking all books and entries, and approve at least one entry before closing.
                    </Text>
                  </View>
                )}

              <TouchableOpacity
                disabled={
                  saving ||
                  !closureStatus ||
                  closureStatus.closed ||
                  closureStatus.unresolved_imports > 0 ||
                  closureStatus.unapproved_drafts > 0 ||
                  closureStatus.approved_drafts === 0 ||
                  !Object.values(closureChecks).every(Boolean)
                }
                onPress={finalizeHistoricalMigration}
                style={[
                  styles.primary,
                  (
                    saving ||
                    !closureStatus ||
                    closureStatus.closed ||
                    closureStatus.unresolved_imports > 0 ||
                    closureStatus.unapproved_drafts > 0 ||
                    closureStatus.approved_drafts === 0 ||
                    !Object.values(closureChecks).every(Boolean)
                  ) && styles.disabled,
                ]}
              >
                <Text style={styles.primaryText}>
                  {saving ? 'FINISHING…' : 'FINISH AND CLOSE OLD RECORDS'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View style={styles.reportMetric}>
      <Text style={styles.reportValue}>{value}</Text>
      <Text style={styles.reportLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f6f4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 13, paddingBottom: 38 },
  back: { paddingVertical: 10 },
  backText: { color: '#166534', fontWeight: '200', fontSize: 14 },
  header: {
    backgroundColor: '#14532d',
    borderRadius: 16,
    padding: 17,
    marginBottom: 16,
  },
  kicker: { color: '#bbf7d0', fontSize: 11, fontWeight: '400' },
  title: { color: '#fff', fontSize: 21, fontWeight: '400', marginTop: 7 },
  sub: { color: '#f0fdf4', fontSize: 13, lineHeight: 19, marginTop: 8 },
  stepCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#dbe4dc',
    marginBottom: 13,
  },
  stepNumber: { color: '#16a34a', fontSize: 12, fontWeight: '400' },
  stepTitle: { color: '#14532d', fontSize: 18, fontWeight: '400', marginTop: 4 },
  heading: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111827',
    marginTop: 13,
    marginBottom: 9,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#dbe4dc',
    marginBottom: 11,
  },
  notice: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 10,
    padding: 11,
    marginBottom: 10,
  },
  noticeText: { color: '#92400e', fontSize: 12, fontWeight: '200', lineHeight: 17 },
  label: {
    fontSize: 13,
    fontWeight: '600',
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
    fontSize: 14,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 75, textAlignVertical: 'top', paddingTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
  },
  chipOn: { backgroundColor: '#166534', borderColor: '#166534' },
  chipText: { fontSize: 13, color: '#334155', fontWeight: '200', flexShrink: 1 },
  chipTextOn: { color: '#fff' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
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
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  memberList: { gap: 7 },
  memberButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 11,
    backgroundColor: '#f8fafc',
  },
  memberButtonOn: { backgroundColor: '#166534', borderColor: '#166534' },
  memberButtonText: { fontSize: 14, color: '#334155', fontWeight: '300' },
  memberNumber: { fontSize: 11, color: '#64748b', marginTop: 3 },
  memberNumberOn: { color: '#dcfce7' },
  selectedBook: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
    borderWidth: 1,
    borderRadius: 9,
    padding: 10,
    marginTop: 10,
  },
  selectedBookTitle: { color: '#166534', fontSize: 11, fontWeight: '300' },
  selectedBookName: { color: '#14532d', fontSize: 14, fontWeight: '300', marginTop: 3 },
  primary: {
    minHeight: 49,
    backgroundColor: '#16a34a',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
  },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '400', textAlign: 'center' },
  secondary: { padding: 12, alignItems: 'center' },
  secondaryText: { color: '#475569', fontWeight: '300', fontSize: 13 },
  disabled: { opacity: 0.35 },
  importCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe4dc',
    padding: 12,
    marginBottom: 8,
  },
  selected: { borderColor: '#16a34a', borderWidth: 2 },
  importTitle: { fontSize: 13, fontWeight: '400', color: '#111827' },
  meta: { fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 17 },
  status: {
    alignSelf: 'flex-start',
    marginTop: 7,
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 11,
    fontWeight: '400',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    overflow: 'hidden',
  },
  empty: { color: '#64748b', fontSize: 13, lineHeight: 18 },
  enterRecordsButton: {
    minHeight: 40,
    backgroundColor: '#14532d',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#16a34a',
  },
  enterRecordsButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '300',
    textAlign: 'center',
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  checkbox: { fontSize: 21, color: '#166534' },
  draftCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe4dc',
    borderRadius: 10,
    padding: 11,
    marginTop: 8,
  },
  opening: { color: '#92400e', fontWeight: '300', fontSize: 11, marginTop: 5 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallButton: {
    flex: 1,
    backgroundColor: '#dbeafe',
    padding: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  delete: { backgroundColor: '#fee2e2' },
  smallText: { color: '#1d4ed8', fontWeight: '200' },
  deleteText: { color: '#b91c1c' },
  help: { fontSize: 12, color: '#64748b', lineHeight: 18, marginTop: 7 },
  approvalCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 11,
    padding: 11,
    marginTop: 12,
    marginBottom: 10,
  },
  approvalTitle: { fontSize: 15, fontWeight: '200', color: '#14532d', marginBottom: 6 },
  verifyRow: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 9,
    padding: 10,
    marginTop: 9,
  },
  verifyTitle: { fontSize: 13, fontWeight: '300', color: '#14532d' },
  validationNotice: { backgroundColor: '#ecfdf5', borderRadius: 8, padding: 10, marginTop: 10 },
  validationText: { fontSize: 12, color: '#166534', lineHeight: 17 },
  reportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reportRefresh: { color: '#166534', fontWeight: '300', padding: 8 },
  reportSection: {
    fontSize: 14,
    fontWeight: '300',
    color: '#14532d',
    marginTop: 17,
    marginBottom: 8,
  },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  reportMetric: {
    minWidth: '20%',
    flexGrow: 1,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  reportValue: { fontSize: 18, fontWeight: '300', color: '#14532d' },
  reportLabel: { fontSize: 11, color: '#475569', fontWeight: '300', marginTop: 3 },
  reportNote: { fontSize: 12, color: '#64748b', lineHeight: 17, marginTop: 7 },
  reportCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 9,
  },
  reportAmount: { fontSize: 12, fontWeight: '300', color: '#14532d' },
  reportAuditRow: {
    borderLeftWidth: 3,
    borderLeftColor: '#16a34a',
    paddingLeft: 9,
    paddingVertical: 8,
    marginTop: 7,
    backgroundColor: '#f8fafc',
  },
  reportWarning: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 13,
  },
  reportWarningText: { fontSize: 12, color: '#9a3412', lineHeight: 17 },
  finalCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: '#93c5fd',
    marginBottom: 12,
  },
  finalKicker: { color: '#1d4ed8', fontSize: 12, fontWeight: '300' },
  finalTitle: { color: '#1e3a8a', fontSize: 17, fontWeight: '300', marginTop: 4 },
  closedPanel: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
    borderWidth: 1,
    borderRadius: 10,
    padding: 11,
    marginTop: 10,
  },
  closedTitle: { fontSize: 13, fontWeight: '300', color: '#166534', marginBottom: 7 },
  closedFoot: { fontSize: 10, color: '#166534', lineHeight: 17, marginTop: 9 },
});
