import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { canManageHistoricalEntries, getMembersByGroupId, createHistoricalMigrationImport, getHistoricalMigrationImports, getHistoricalMigrationDrafts, createHistoricalMigrationDraft, updateHistoricalMigrationDraft, deleteHistoricalMigrationDraft, setHistoricalMigrationDraftsAwaitingVerification, type HistoricalMigrationImport, type HistoricalMigrationDraft, type HistoricalMigrationCategory, type HistoricalMigrationEvidenceType } from '../database/database';

type Props = {
  route: { params: { groupId: number; executiveMemberId: number } };
  navigation: { goBack: () => void };
};
type Member = { id: number; full_name: string; member_number: string };
const categories: { value: HistoricalMigrationCategory; label: string }[] = [
  { value: 'savings', label: 'Savings' }, { value: 'loan_issued', label: 'Loan issued' },
  { value: 'loan_repayment', label: 'Loan repayment' }, { value: 'previous_loan_balance', label: 'Previous loan balance' },
  { value: 'insurance', label: 'Insurance' }, { value: 'fine', label: 'Fine' },
  { value: 'group_income', label: 'Group income' }, { value: 'group_expense', label: 'Group expenditure' }, { value: 'other', label: 'Other' },
];
const evidenceTypes: { value: HistoricalMigrationEvidenceType; label: string }[] = [
  { value: 'manual', label: 'Manual ledger entry' }, { value: 'pdf', label: 'PDF' }, { value: 'image', label: 'Scanned image' }, { value: 'audio', label: 'Voice recording' }, { value: 'video', label: 'Ledger video' },
];
const statusLabel: Record<string,string> = { pending_review:'Pending review', processing:'Processing', needs_correction:'Needs correction', awaiting_verification:'Awaiting verification', approved:'Approved', rejected:'Rejected' };
const needsMember = (category: HistoricalMigrationCategory) => ['savings','loan_issued','loan_repayment','previous_loan_balance','fine'].includes(category);

export default function HistoricalMigrationScreen({ route, navigation }: Props) {
  const { groupId, executiveMemberId } = route.params;
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [canManage,setCanManage] = useState(false);
  const [imports,setImports] = useState<HistoricalMigrationImport[]>([]);
  const [members,setMembers] = useState<Member[]>([]);
  const [selectedImport,setSelectedImport] = useState<HistoricalMigrationImport|null>(null);
  const [drafts,setDrafts] = useState<HistoricalMigrationDraft[]>([]);
  const [evidenceType,setEvidenceType] = useState<HistoricalMigrationEvidenceType>('manual');
  const [evidenceName,setEvidenceName] = useState('');
  const [evidenceUri,setEvidenceUri] = useState('');
  const [reference,setReference] = useState('');
  const [notes,setNotes] = useState('');
  const [category,setCategory] = useState<HistoricalMigrationCategory>('savings');
  const [memberId,setMemberId] = useState<number|null>(null);
  const [date,setDate] = useState('');
  const [amount,setAmount] = useState('');
  const [description,setDescription] = useState('');
  const [opening,setOpening] = useState(false);
  const [editing,setEditing] = useState<HistoricalMigrationDraft|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedImports,loadedMembers,adminAllowed] = await Promise.all([getHistoricalMigrationImports(groupId),getMembersByGroupId(groupId),canManageHistoricalEntries(groupId,executiveMemberId)]);
      setCanManage(adminAllowed);
      setImports(loadedImports);
      setMembers((loadedMembers as Member[]).slice().sort((a,b)=>a.full_name.localeCompare(b.full_name)));
      if (selectedImport) {
        const fresh = loadedImports.find(i=>i.id===selectedImport.id) || null;
        setSelectedImport(fresh);
        setDrafts(fresh ? await getHistoricalMigrationDrafts(fresh.id,groupId) : []);
      }
    } catch(e) { Alert.alert('Could not load migration register', e instanceof Error ? e.message : 'Please try again.'); }
    finally { setLoading(false); }
  },[groupId,executiveMemberId,selectedImport?.id]);
  useFocusEffect(useCallback(()=>{ void load(); },[load]));

  const openImport = async (item: HistoricalMigrationImport) => {
    setSelectedImport(item); setEditing(null);
    try { setDrafts(await getHistoricalMigrationDrafts(item.id,groupId)); }
    catch(e) { Alert.alert('Could not load drafts',e instanceof Error?e.message:'Please try again.'); }
  };
  const resetDraft = () => { setEditing(null); setCategory('savings'); setMemberId(null); setDate(''); setAmount(''); setDescription(''); setOpening(false); };
  const saveImport = async () => {
    if (!canManage) { Alert.alert('Administrator access required','Only an authorised group administrator can register historical evidence.'); return; }
    if (!evidenceName.trim()) { Alert.alert('Evidence name required','Enter a short name for the ledger book, page, recording or document.'); return; }
    setSaving(true);
    try {
      const id = await createHistoricalMigrationImport({ group_id:groupId,evidence_type:evidenceType,evidence_name:evidenceName.trim(),evidence_uri:evidenceUri.trim(),source_reference:reference.trim(),notes:notes.trim(),created_by_member_id:executiveMemberId });
      setEvidenceName(''); setEvidenceUri(''); setReference(''); setNotes('');
      await load();
      const item = (await getHistoricalMigrationImports(groupId)).find(i=>i.id===id);
      if (item) await openImport(item);
      Alert.alert('Evidence registered','The evidence is saved as a pending import. No financial balance has changed.');
    } catch(e) { Alert.alert('Could not register evidence',e instanceof Error?e.message:'Please try again.'); }
    finally { setSaving(false); }
  };
  const saveDraft = async () => {
    if (!canManage) { Alert.alert('Administrator access required','Only an authorised group administrator can prepare historical drafts.'); return; }
    if (!selectedImport) return;
    const iso = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(new Date(`${iso}T12:00:00.000Z`).getTime()) || new Date(`${iso}T12:00:00.000Z`).toISOString().slice(0,10)!==iso) { Alert.alert('Check original date','Use YYYY-MM-DD, for example 2021-04-17.'); return; }
    const value = Number(amount.replace(/,/g,''));
    if (!Number.isFinite(value)||value<0) { Alert.alert('Check amount','Enter a valid amount in UGX.'); return; }
    if (needsMember(category)&&!memberId) { Alert.alert('Select member','This transaction category requires a member.'); return; }
    setSaving(true);
    try {
      const payload = { import_id:selectedImport.id,group_id:groupId,member_id:needsMember(category)?memberId:null,category,transaction_date:iso,amount:value,is_opening_balance:opening,description:description.trim(),source_reference:selectedImport.source_reference || '' };
      if (editing) await updateHistoricalMigrationDraft({...payload,id:editing.id});
      else await createHistoricalMigrationDraft(payload);
      setDrafts(await getHistoricalMigrationDrafts(selectedImport.id,groupId)); resetDraft();
      Alert.alert('Draft saved','This entry remains a draft and has not changed financial balances.');
    } catch(e) { Alert.alert('Could not save draft',e instanceof Error?e.message:'Please try again.'); }
    finally { setSaving(false); }
  };
  const submitForVerification = async () => {
    if (!canManage) { Alert.alert('Administrator access required','Only an authorised group administrator can submit drafts.'); return; }
    if (!selectedImport) return;
    Alert.alert('Submit for verification?','The drafts will be marked as awaiting verification. They will not be posted to savings, loans or group funds.',[
      {text:'Cancel',style:'cancel'}, {text:'Submit',onPress:async()=>{try{await setHistoricalMigrationDraftsAwaitingVerification(selectedImport.id,groupId); await load(); const fresh=(await getHistoricalMigrationImports(groupId)).find(i=>i.id===selectedImport.id); if(fresh) await openImport(fresh); Alert.alert('Submitted','The import is awaiting the next verification and approval stage.');}catch(e){Alert.alert('Could not submit',e instanceof Error?e.message:'Please try again.');}}}
    ]);
  };
  const editDraft = (draft: HistoricalMigrationDraft) => { setEditing(draft);setCategory(draft.category);setMemberId(draft.member_id);setDate(draft.transaction_date);setAmount(String(draft.amount));setDescription(draft.description);setOpening(!!draft.is_opening_balance); };
  const removeDraft = (draft: HistoricalMigrationDraft) => Alert.alert('Remove draft?','This only removes the unposted draft, not the original evidence.',[{text:'Cancel',style:'cancel'},{text:'Remove',style:'destructive',onPress:async()=>{try{await deleteHistoricalMigrationDraft(draft.id,draft.import_id,groupId);setDrafts(await getHistoricalMigrationDrafts(draft.import_id,groupId));if(editing?.id===draft.id)resetDraft();}catch(e){Alert.alert('Could not remove',e instanceof Error?e.message:'Please try again.');}}}]);

  if (loading && imports.length===0) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#16a34a"/><Text style={styles.help}>Loading historical imports…</Text></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <TouchableOpacity onPress={()=>navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹ Back to Historical Records</Text></TouchableOpacity>
    <View style={styles.header}><Text style={styles.kicker}>EBADSAVE VSLA • STEP 2</Text><Text style={styles.title}>Historical Ledger Import Register</Text><Text style={styles.sub}>Register ledger evidence and prepare draft transactions. Nothing here changes financial balances.</Text></View>
    {!canManage&&<View style={styles.notice}><Text style={styles.noticeText}>View only: an authorised group administrator must register evidence and prepare drafts.</Text></View>}
    <Text style={styles.heading}>1. Register evidence</Text>
    <View style={styles.card}>
      <Text style={styles.label}>Evidence source</Text><View style={styles.chips}>{evidenceTypes.map(x=><TouchableOpacity key={x.value} onPress={()=>setEvidenceType(x.value)} style={[styles.chip,evidenceType===x.value&&styles.chipOn]}><Text style={[styles.chipText,evidenceType===x.value&&styles.chipTextOn]}>{x.label}</Text></TouchableOpacity>)}</View>
      <Text style={styles.label}>Evidence name *</Text><TextInput value={evidenceName} onChangeText={setEvidenceName} style={styles.input} placeholder="e.g. Savings ledger 2021, page 14"/>
      <Text style={styles.label}>Evidence file location / URI (optional)</Text><TextInput value={evidenceUri} onChangeText={setEvidenceUri} style={styles.input} placeholder="Paste the saved file path or URI" autoCapitalize="none"/>
      <Text style={styles.label}>Ledger page / reference</Text><TextInput value={reference} onChangeText={setReference} style={styles.input} placeholder="Book name, page number or recording reference"/>
      <Text style={styles.label}>Notes</Text><TextInput value={notes} onChangeText={setNotes} style={[styles.input,styles.multiline]} multiline placeholder="Context about this evidence"/>
      <TouchableOpacity disabled={saving||!canManage} onPress={()=>void saveImport()} style={[styles.primary,saving&&styles.disabled]}><Text style={styles.primaryText}>{saving?'Saving…':'Register evidence'}</Text></TouchableOpacity>
    </View>
    <Text style={styles.heading}>2. Evidence register ({imports.length})</Text>
    {imports.length===0?<View style={styles.card}><Text style={styles.empty}>No historical evidence registered yet.</Text></View>:imports.map(item=><TouchableOpacity key={item.id} onPress={()=>void openImport(item)} style={[styles.importCard,selectedImport?.id===item.id&&styles.selected]}>
      <Text style={styles.importTitle}>{item.evidence_name||`Import #${item.id}`}</Text><Text style={styles.meta}>{item.evidence_type.toUpperCase()} • {item.draft_count||0} draft(s) • {new Date(item.created_at).toLocaleDateString()}</Text><Text style={styles.status}>{statusLabel[item.status]||item.status}</Text>{!!item.source_reference&&<Text style={styles.meta}>Reference: {item.source_reference}</Text>}
    </TouchableOpacity>)}
    {selectedImport&&<>
      <Text style={styles.heading}>3. Draft transactions — {selectedImport.evidence_name}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Transaction category</Text><View style={styles.chips}>{categories.map(x=><TouchableOpacity key={x.value} onPress={()=>{setCategory(x.value);if(!needsMember(x.value))setMemberId(null);}} style={[styles.chip,category===x.value&&styles.chipOn]}><Text style={[styles.chipText,category===x.value&&styles.chipTextOn]}>{x.label}</Text></TouchableOpacity>)}</View>
        {needsMember(category)&&<><Text style={styles.label}>Member</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{members.map(m=><TouchableOpacity key={m.id} onPress={()=>setMemberId(m.id)} style={[styles.memberChip,memberId===m.id&&styles.chipOn]}><Text style={[styles.chipText,memberId===m.id&&styles.chipTextOn]}>{m.full_name} ({m.member_number})</Text></TouchableOpacity>)}</ScrollView></>}
        <Text style={styles.label}>Original transaction date (YYYY-MM-DD)</Text><TextInput value={date} onChangeText={setDate} style={styles.input} placeholder="2021-04-17" keyboardType="numbers-and-punctuation"/>
        <Text style={styles.label}>Amount (UGX)</Text><TextInput value={amount} onChangeText={setAmount} style={styles.input} placeholder="0" keyboardType="decimal-pad"/>
        <TouchableOpacity onPress={()=>setOpening(v=>!v)} style={styles.checkRow}><Text style={styles.checkbox}>{opening?'☑':'☐'}</Text><Text style={styles.chipText}>This is an opening balance, not a new transaction</Text></TouchableOpacity>
        <Text style={styles.label}>Description / ledger details</Text><TextInput value={description} onChangeText={setDescription} style={[styles.input,styles.multiline]} multiline placeholder="Enter exactly what the ledger shows"/>
        <TouchableOpacity disabled={saving||!canManage} onPress={()=>void saveDraft()} style={[styles.primary,saving&&styles.disabled]}><Text style={styles.primaryText}>{editing?'Update draft':'Add transaction draft'}</Text></TouchableOpacity>
        {!!editing&&<TouchableOpacity onPress={resetDraft} style={styles.secondary}><Text style={styles.secondaryText}>Cancel editing</Text></TouchableOpacity>}
      </View>
      {drafts.map(d=><View key={d.id} style={styles.draftCard}><Text style={styles.importTitle}>{categories.find(c=>c.value===d.category)?.label||d.category} • UGX {Number(d.amount).toLocaleString()}</Text><Text style={styles.meta}>{d.transaction_date} • {d.member_name||'Group transaction'} {d.member_number?`(${d.member_number})`:''}</Text>{d.is_opening_balance===1&&<Text style={styles.opening}>Opening balance — not a new transaction</Text>}{!!d.description&&<Text style={styles.meta}>{d.description}</Text>}<View style={styles.row}><TouchableOpacity disabled={!canManage} onPress={()=>editDraft(d)} style={[styles.smallButton,!canManage&&styles.disabled]}><Text style={styles.smallText}>Edit</Text></TouchableOpacity><TouchableOpacity disabled={!canManage} onPress={()=>removeDraft(d)} style={[styles.smallButton,styles.delete,!canManage&&styles.disabled]}><Text style={[styles.smallText,{color:'#b91c1c'}]}>Remove draft</Text></TouchableOpacity></View></View>)}
      <TouchableOpacity disabled={!canManage||drafts.length===0||['approved','rejected','awaiting_verification'].includes(selectedImport.status)} onPress={()=>void submitForVerification()} style={[styles.primary, (drafts.length===0||['approved','rejected','awaiting_verification'].includes(selectedImport.status))&&styles.disabled]}><Text style={styles.primaryText}>Submit drafts for verification</Text></TouchableOpacity>
      <Text style={styles.help}>Submission only changes workflow status. Financial posting and administrator approval are reserved for Step 3.</Text>
    </>}
  </ScrollView></SafeAreaView>;
}

const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#f3f6f4'},center:{flex:1,alignItems:'center',justifyContent:'center'},content:{padding:14,paddingBottom:40},back:{paddingVertical:10},backText:{color:'#166534',fontWeight:'900'},header:{backgroundColor:'#14532d',borderRadius:16,padding:17,marginBottom:16},kicker:{color:'#bbf7d0',fontSize:11,fontWeight:'900'},title:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:7},sub:{color:'#f0fdf4',fontSize:13,lineHeight:19,marginTop:8},heading:{fontSize:17,fontWeight:'900',color:'#111827',marginTop:14,marginBottom:9},card:{backgroundColor:'#fff',borderRadius:14,padding:13,borderWidth:1,borderColor:'#dbe4dc',marginBottom:10},label:{fontSize:13,fontWeight:'800',color:'#334155',marginTop:11,marginBottom:6},input:{minHeight:46,borderWidth:1,borderColor:'#cbd5e1',borderRadius:10,paddingHorizontal:11,color:'#111827',fontSize:15,backgroundColor:'#fff'},multiline:{minHeight:72,textAlignVertical:'top',paddingTop:10},chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{borderWidth:1,borderColor:'#cbd5e1',borderRadius:18,paddingHorizontal:10,paddingVertical:9,backgroundColor:'#f8fafc'},chipOn:{backgroundColor:'#166534',borderColor:'#166534'},chipText:{fontSize:12,color:'#334155',fontWeight:'800'},chipTextOn:{color:'#fff'},memberChip:{borderWidth:1,borderColor:'#cbd5e1',borderRadius:12,padding:9,marginRight:7,marginBottom:3,backgroundColor:'#f8fafc'},primary:{minHeight:49,backgroundColor:'#16a34a',borderRadius:11,alignItems:'center',justifyContent:'center',marginTop:14,paddingHorizontal:12},primaryText:{color:'#fff',fontSize:15,fontWeight:'900'},secondary:{padding:12,alignItems:'center'},secondaryText:{color:'#475569',fontWeight:'800'},disabled:{opacity:.45},notice:{backgroundColor:'#fef3c7',borderColor:'#f59e0b',borderWidth:1,borderRadius:10,padding:11},noticeText:{color:'#92400e',fontSize:12,fontWeight:'800'},importCard:{backgroundColor:'#fff',borderRadius:12,borderWidth:1,borderColor:'#dbe4dc',padding:13,marginBottom:8},selected:{borderColor:'#16a34a',borderWidth:2},importTitle:{fontSize:14,fontWeight:'900',color:'#111827'},meta:{fontSize:12,color:'#64748b',marginTop:4,lineHeight:17},status:{alignSelf:'flex-start',marginTop:7,backgroundColor:'#fef3c7',color:'#92400e',fontSize:11,fontWeight:'900',paddingHorizontal:8,paddingVertical:4,borderRadius:7,overflow:'hidden'},empty:{color:'#64748b',fontSize:13},checkRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:13},checkbox:{fontSize:22,color:'#166534'},draftCard:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dbe4dc',borderRadius:12,padding:12,marginBottom:8},opening:{color:'#92400e',fontWeight:'900',fontSize:12,marginTop:5},row:{flexDirection:'row',gap:8,marginTop:10},smallButton:{flex:1,backgroundColor:'#dbeafe',padding:10,borderRadius:8,alignItems:'center'},smallText:{color:'#1d4ed8',fontWeight:'900'},delete:{backgroundColor:'#fee2e2'},help:{fontSize:12,color:'#64748b',lineHeight:17,marginTop:8}});
