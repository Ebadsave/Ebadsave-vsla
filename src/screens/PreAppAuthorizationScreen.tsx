import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import i18n from '../translations/i18n';
import {
  authorizeMemberForAppAccess,
  createAppAccessSession,
  getAllGroups,
  getMembersByGroupId,
  type AppAccessProgress,
  type GroupRecord,
  type MemberRecord,
} from '../database/database';
import {
  BACK4APP_APPLICATION_ID,
  BACK4APP_JAVASCRIPT_KEY,
  BACK4APP_SERVER_URL,
} from '../config/back4appConfig';

/**
 * Calls a Back4App Cloud Code function through the Parse REST API.
 * This avoids requiring the separate `parse` npm package in the app.
 */
async function runBack4AppCloudFunction<T>(
  functionName: string,
  params: Record<string, unknown>,
): Promise<T> {
  const baseUrl = BACK4APP_SERVER_URL.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/functions/${functionName}`, {
    method: 'POST',
    headers: {
      'X-Parse-Application-Id': BACK4APP_APPLICATION_ID,
      'X-Parse-Javascript-Key': BACK4APP_JAVASCRIPT_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const payload = await response.json().catch(() => ({} as any));

  if (!response.ok || payload?.error) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : payload?.error?.message ??
          payload?.message ??
          `Back4App request failed (${response.status})`;
    throw new Error(message);
  }

  return (payload && Object.prototype.hasOwnProperty.call(payload, 'result')
    ? payload.result
    : payload) as T;
}

type Props = NativeStackScreenProps<RootStackParamList, 'PreAppAuthorization'>;
type RequiredRole = 'executive' | 'ordinary';

const EXECUTIVE_POSTS = [
  'chairperson',
  'vice chair',
  'vice-chair',
  'vice chairperson',
  'secretary',
  'treasurer',
  'money counter',
  'money counters',
  'key keeper',
  'key keepers',
];

function isExecutive(member: MemberRecord): boolean {
  if (Number(member.is_super_user ?? 0) === 1) return true;
  const role = (member.role ?? '').trim().toLowerCase();
  if (role === 'executive' || role === 'admin') return true;
  if (EXECUTIVE_POSTS.includes(role)) return true;
  return (member.assigned_roles ?? '')
    .split(',')
    .some((item) => EXECUTIVE_POSTS.includes(item.trim().toLowerCase()));
}

const STEPS: { role: RequiredRole }[] = [
  { role: 'executive' },
  { role: 'executive' },
  { role: 'ordinary' },
];

const AUTH_TEXT = {
  en: { loading: 'Loading registered groups…', tagline: 'Three-member authorization', selectGroup: 'Select your registered group', instructions: 'Two different executive members and one ordinary member must authorize access. On this phone, their passcodes are checked against the registered local records. The group recovery credential is only for cloud recovery on a replacement phone.', noGroups: 'No active registered groups were found on this device.', selectedGroup: 'SELECTED GROUP', change: 'Change', stepExecutive1: 'Executive member 1 of 2', stepExecutive2: 'Executive member 2 of 2', stepOrdinary: 'Ordinary member 1 of 1', executiveRole: 'Executive', ordinaryRole: 'Ordinary member', progress: (total: number, exec: number, ordinary: number) => `${total} of 3 members authorized · ${exec}/2 executives · ${ordinary}/1 ordinary member`, chooseMember: 'Choose an active member with a registered phone number. Each member can authorize only once.', noEligibleExecutive: 'No eligible executive members with registered phone numbers are available for this step. Register or activate an eligible member, then select the group again.', noEligibleOrdinary: 'No eligible ordinary members with registered phone numbers are available for this step. Register or activate an eligible member, then select the group again.', passcodeFor: (name: string) => `Passcode for ${name}`, passcodePlaceholder: 'Enter 4-character passcode', verify: 'Verify passcode', allAuthorized: 'All three required members have authorized this group.', footer: 'Your saved group and member records are not deleted by this authorization step.', chooseMemberTitle: 'Choose a member', chooseMemberMessage: 'Select the member who is authorizing this step.', invalidPasscode: 'Invalid passcode', invalidPasscodeMessage: 'Enter the member’s exact four-character passcode.', authSuccess: 'Authorization successful', authSuccessMessage: 'Three different members have authorized this group. Ebadsave VSLA will now open.', continue: 'Continue', authFailed: 'Authorization failed', loadFailed: 'Unable to load groups', selectFailed: 'Could not select group', unexpected: 'An unexpected error occurred. Please try again.', serverVerifying: 'Verifying identities on server…', serverFailed: 'Server verification failed', recoveryLabel: 'Group recovery credential (optional on this phone)', recoveryPlaceholder: 'Enter group recovery code only for cloud recovery', recoveryHint: 'Leave this blank when using the phone that already has your group data. Enter the group recovery credential only when recovering the group on a lost, replaced, or changed phone. Three member passcodes are still required.' },
  nyn: { loading: 'Abagwiire ebibiina ebihandiikire…', tagline: 'Okukiriza kw’abantu bashatu', selectGroup: 'Toorana ekibiina kyawe ekihandiikire', instructions: 'Abakuru b’ekibiina babiri abatari bamwe hamwe n’omunyamuryango owa bulijjo omu bashemereire kukiriza okutaaha.', noGroups: 'Tihariho bibiina ebikora ebihandiikire aha simu egi.', selectedGroup: 'EKIBIINA EKITOORANIIWE', change: 'Hindura', stepExecutive1: 'Omukuru w’ekibiina 1 aha 2', stepExecutive2: 'Omukuru w’ekibiina 2 aha 2', stepOrdinary: 'Omunyamuryango owa bulijjo 1 aha 1', executiveRole: 'Omukuru', ordinaryRole: 'Omunyamuryango owa bulijjo', progress: (total: number, exec: number, ordinary: number) => `${total} aha banyamuryango 3 bakiziire · abakuru ${exec}/2 · owa bulijjo ${ordinary}/1`, chooseMember: 'Toorana omunyamuryango akora kandi aine namba ya simu ehairwe. Buri munyamuryango naikiriza rimwe ryonka.', noEligibleExecutive: 'Tihariho mukuru w’ekibiina oshemeire aine namba ya simu aha mutendera ogu. Handiika nari korera omunyamuryango, reero otore ekibiina bundi.', noEligibleOrdinary: 'Tihariho muny amuryango owa bulijjo oshemeire aine namba ya simu aha mutendera ogu. Handiika nari korera omunyamuryango, reero otore ekibiina bundi.', passcodeFor: (name: string) => 'Koodi ya ' + name, passcodePlaceholder: 'Taamu koodi y’ennukuta 4', verify: 'Kakasa koodi', allAuthorized: 'Abanyamuryango bashatu bashemereire bakiziire ekibiina eki.', footer: 'Ebi ebihandiikire by’ekibiina n’abanyamuryango tibirikusibwa omutendera ogu.', chooseMemberTitle: 'Toorana omunyamuryango', chooseMemberMessage: 'Toorana omunyamuryango orikwikiriza omutendera ogu.', invalidPasscode: 'Koodi egwire', invalidPasscodeMessage: 'Taamu koodi y’omunyamuryango nk’oku eri, ennukuta 4.', authSuccess: 'Okukiriza kwahwa gye', authSuccessMessage: 'Abanyamuryango bashatu abatari bamwe bakiziire ekibiina eki. Ebadsave VSLA n’eyija kwoha.', continue: 'Gyenda omumaisho', authFailed: 'Okukiriza tikwahwe gye', loadFailed: 'Tihasobokire kutunga ebibiina', selectFailed: 'Tihasobokire kutoorana ekibiina', unexpected: 'Ekintu kitashemereire kibaireho. Yongera ogezemu.', serverVerifying: 'Niturimo kukakasa aha server…', serverFailed: 'Okukakasa aha server tikwahwe gye', recoveryLabel: 'Koodi y’okugarura ekibiina (tekyetaagisa aha simu egi)', recoveryPlaceholder: 'Taamu koodi y’ekibiina ku kugyagarura kuri cloud', recoveryHint: 'Siga omwanya ogu guburimo ku simu eine ebihandiiko by’ekibiina. Taamu koodi yokugarura ekibiina ku simu eya haza, ekyatsimburwa oba eyahindurwa. Koodi za banyamuryango bashatu zikyaheebwa.' },
  lg: { loading: 'Okutikka ebibiina ebiri muwandiise…', tagline: 'Okukkiriza kw’ab members abasatu', selectGroup: 'Londa ekibiina kyo ekiwandiisiddwa', instructions: 'Abakulembeze babiri ab’enjawulo n’om member omu owa bulijjo balina okukkiriza okuyingira.', noGroups: 'Tewali bibiina bikola ebiri muwandiise ku kyuma kino.', selectedGroup: 'EKIBIINA EKILONDIDDWA', change: 'Kyusa', stepExecutive1: 'Omukulembeze 1 ku 2', stepExecutive2: 'Omukulembeze 2 ku 2', stepOrdinary: 'Omukulembeze', executiveRole: 'Omukulembeze', ordinaryRole: 'Om member owa bulijjo', progress: (total: number, exec: number, ordinary: number) => `${total} ku members 3 bakkirizza · abakulembeze ${exec}/2 · owa bulijjo ${ordinary}/1`, chooseMember: 'Londa om member akola alina ennamba ya ssimu ewandiisiddwa. Buli member akkiriza omulundi gumu gwokka.', noEligibleExecutive: 'Tewali mukulembeze atuukiridde alina ennamba ya ssimu ku mutendera guno. Wandiisa oba kozesa om member atuukiridde, olonde ekibiina nate.', noEligibleOrdinary: 'Tewali member wa bulijjo atuukiridde alina ennamba ya ssimu ku mutendera guno. Wandiisa oba kozesa om member atuukiridde, olonde ekibiina nate.', passcodeFor: (name: string) => `Koodi ya ${name}`, passcodePlaceholder: 'Yingiza koodi ya nnukuta 4', verify: 'Kakasa koodi', allAuthorized: 'Ab members bonna abasatu beetaagisa bakkirizza ekibiina kino.', footer: 'Ebiwandiiko by’ekibiina n’ab members byo tebisuulibwaawo mu mutendera guno.', chooseMemberTitle: 'Londa om member', chooseMemberMessage: 'Londa om member akkiriza omutendera guno.', invalidPasscode: 'Koodi si ntuufu', invalidPasscodeMessage: 'Yingiza koodi y’om member entuufu ey’ennukuta nnya.', authSuccess: 'Okukkiriza kuwedde bulungi', authSuccessMessage: 'Ab members abasatu ab’enjawulo bakkirizza ekibiina kino. Ebadsave VSLA ejja kugguka kati.', continue: 'Weyongereyo', authFailed: 'Okukkiriza kulemye', loadFailed: 'Tekisobose kutikka bibiina', selectFailed: 'Tekisobose kulonda kibiina', unexpected: 'Waliwo ekikyamu. Ddamu ogezeeko.', serverVerifying: 'Tukakasa identities ku server…', serverFailed: 'Okukakasa ku server kulemye', recoveryLabel: 'Koodi y’okuzzaawo ekibiina (tekyetaagisa ku ssimu eno)', recoveryPlaceholder: 'Yingiza koodi ya cloud recovery yokka', recoveryHint: 'Leka nga temuli kintu nga okozesa ssimu erina data y’ekibiina. Yingiza recovery credential ng’ozzaawo ekibiina ku ssimu empya oba ekyusiddwa. Passcodes z’ab members abasatu zikyetaagisa.' },
  sw: { loading: 'Inapakia vikundi vilivyosajiliwa…', tagline: 'Uidhinishaji wa wanachama watatu', selectGroup: 'Chagua kikundi chako kilichosajiliwa', instructions: 'Viongozi wawili tofauti na mwanachama mmoja wa kawaida lazima waidhinishe ufikiaji. Uthibitisho unafanyika kwenye server.', noGroups: 'Hakuna vikundi hai vilivyosajiliwa vilivyopatikana kwenye kifaa hiki.', selectedGroup: 'KIKUNDI KILICHOCHAGULIWA', change: 'Badilisha', stepExecutive1: 'Kiongozi wa 1 kati ya 2', stepExecutive2: 'Kiongozi wa 2 kati ya 2', stepOrdinary: 'Mwanachama wa kawaida 1 kati ya 1', executiveRole: 'Kiongozi', ordinaryRole: 'Mwanachama wa kawaida', progress: (total: number, exec: number, ordinary: number) => `Wanachama ${total} kati ya 3 wameidhinisha · viongozi ${exec}/2 · mwanachama wa kawaida ${ordinary}/1`, chooseMember: 'Chagua mwanachama hai mwenye nambari ya simu iliyosajiliwa. Kila mwanachama anaweza kuidhinisha mara moja tu.', noEligibleExecutive: 'Hakuna kiongozi anayestahili mwenye nambari ya simu iliyosajiliwa kwa hatua hii. Sajili au washa mwanachama anayestahili, kisha chagua kikundi tena.', noEligibleOrdinary: 'Hakuna mwanachama wa kawaida anayestahili mwenye nambari ya simu iliyosajiliwa kwa hatua hii. Sajili au washa mwanachama anayestahili, kisha chagua kikundi tena.', passcodeFor: (name: string) => `Nenosiri la ${name}`, passcodePlaceholder: 'Ingiza nenosiri la herufi 4', verify: 'Thibitisha nenosiri', allAuthorized: 'Wanachama wote watatu wanaohitajika wameidhinisha kikundi hiki.', footer: 'Rekodi zako zilizohifadhiwa za kikundi na wanachama hazifutwi katika hatua hii ya uidhinishaji.', chooseMemberTitle: 'Chagua mwanachama', chooseMemberMessage: 'Chagua mwanachama anayeidhinisha hatua hii.', invalidPasscode: 'Nenosiri si sahihi', invalidPasscodeMessage: 'Ingiza nenosiri halisi la mwanachama lenye herufi nne.', authSuccess: 'Uidhinishaji umefanikiwa', authSuccessMessage: 'Wanachama watatu tofauti wameidhinisha kikundi hiki. Ebadsave VSLA itafunguka sasa.', continue: 'Endelea', authFailed: 'Uidhinishaji umeshindwa', loadFailed: 'Imeshindwa kupakia vikundi', selectFailed: 'Imeshindwa kuchagua kikundi', unexpected: 'Hitilafu isiyotarajiwa imetokea. Tafadhali jaribu tena.', serverVerifying: 'Inathibitisha vitambulisho kwenye server…', serverFailed: 'Uthibitishaji wa server umeshindwa', recoveryLabel: 'Msimbo wa kurejesha kikundi (si lazima kwenye simu hii)', recoveryPlaceholder: 'Ingiza msimbo kwa urejeshaji wa cloud tu', recoveryHint: 'Acha sehemu hii tupu unapotumia simu ambayo tayari ina data ya kikundi. Ingiza msimbo wa urejeshaji tu ikiwa unarejesha kikundi kwenye simu iliyopotea, iliyobadilishwa au mpya. Nenosiri za wanachama watatu bado zinahitajika.' },
  fr: { loading: 'Chargement des groupes enregistrés…', tagline: 'Autorisation par trois membres', selectGroup: 'Sélectionnez votre groupe enregistré', instructions: 'Deux responsables différents et un membre ordinaire doivent autoriser l’accès. Vérification sur serveur.', noGroups: 'Aucun groupe actif enregistré n’a été trouvé sur cet appareil.', selectedGroup: 'GROUPE SÉLECTIONNÉ', change: 'Changer', stepExecutive1: 'Responsable 1 sur 2', stepExecutive2: 'Responsable 2 sur 2', stepOrdinary: 'Membre ordinaire 1 sur 1', executiveRole: 'Responsable', ordinaryRole: 'Membre ordinaire', progress: (total: number, exec: number, ordinary: number) => `${total} membre(s) sur 3 ont autorisé · responsables ${exec}/2 · membre ordinaire ${ordinary}/1`, chooseMember: 'Choisissez un membre actif avec un numéro de téléphone enregistré. Chaque membre ne peut autoriser qu’une seule fois.', noEligibleExecutive: 'Aucun responsable admissible avec un numéro enregistré n’est disponible pour cette étape. Enregistrez ou activez un responsable admissible, puis sélectionnez à nouveau le groupe.', noEligibleOrdinary: 'Aucun membre ordinaire admissible avec un numéro enregistré n’est disponible pour cette étape. Enregistrez ou activez un membre admissible, puis sélectionnez à nouveau le groupe.', passcodeFor: (name: string) => `Code de ${name}`, passcodePlaceholder: 'Saisissez le code de 4 caractères', verify: 'Vérifier le code', allAuthorized: 'Les trois membres requis ont autorisé ce groupe.', footer: 'Les données enregistrées du groupe et des membres ne sont pas supprimées à cette étape.', chooseMemberTitle: 'Choisir un membre', chooseMemberMessage: 'Sélectionnez le membre qui autorise cette étape.', invalidPasscode: 'Code invalide', invalidPasscodeMessage: 'Saisissez le code exact de quatre caractères du membre.', authSuccess: 'Autorisation réussie', authSuccessMessage: 'Trois membres différents ont autorisé ce groupe. Ebadsave VSLA va maintenant s’ouvrir.', continue: 'Continuer', authFailed: 'Échec de l’autorisation', loadFailed: 'Impossible de charger les groupes', selectFailed: 'Impossible de sélectionner le groupe', unexpected: 'Une erreur inattendue est survenue. Veuillez réessayer.', serverVerifying: 'Vérification des identités sur le serveur…', serverFailed: 'Échec de la vérification serveur', recoveryLabel: 'Code de récupération du groupe (facultatif sur ce téléphone)', recoveryPlaceholder: 'Code uniquement pour la récupération cloud', recoveryHint: 'Laissez ce champ vide sur le téléphone qui contient déjà les données du groupe. Saisissez le code uniquement pour récupérer le groupe sur un téléphone perdu, remplacé ou changé. Les codes des trois membres restent nécessaires.' },
  rw: { loading: 'Turimo gufungura amatsinda yanditswe…', tagline: 'Kwemeza n’abanyamuryango batatu', selectGroup: 'Hitamo itsinda ryawe ryanditswe', instructions: 'Abayobozi babiri batandukanye n’umunyamuryango umwe usanzwe bagomba kwemeza kwinjira. Kwemeza bikorwa kuri server.', noGroups: 'Nta matsinda akora yanditswe yabonetse kuri iki gikoresho.', selectedGroup: 'ITSINDA RYATORANYIJWE', change: 'Hindura', stepExecutive1: 'Umuyobozi wa 1 kuri 2', stepExecutive2: 'Umuyobozi wa 2 kuri 2', stepOrdinary: 'Umunyamuryango usanzwe 1 kuri 1', executiveRole: 'Umuyobozi', ordinaryRole: 'Umunyamuryango usanzwe', progress: (total: number, exec: number, ordinary: number) => `Abanyamuryango ${total} kuri 3 baremeje · abayobozi ${exec}/2 · usanzwe ${ordinary}/1`, chooseMember: 'Hitamo umunyamuryango ukora ufite nimero ya telefoni yanditswe. Buri munyamuryango yemerewe kwemeza rimwe gusa.', noEligibleExecutive: 'Nta muyobozi wujuje ibisabwa ufite nimero ya telefoni yanditswe kuri iyi ntambwe. Andikisha cyangwa ufungure umuyobozi wujuje ibisabwa, hanyuma wongere uhitemo itsinda.', noEligibleOrdinary: 'Nta munyamuryango usanzwe wujuje ibisabwa ufite nimero ya telefoni yanditswe kuri iyi ntambwe. Andikisha cyangwa ufungure umunyamuryango wujuje ibisabwa, hanyuma wongere uhitemo itsinda.', passcodeFor: (name: string) => `Kode ya ${name}`, passcodePlaceholder: 'Andika kode y’inyuguti 4', verify: 'Emeza kode', allAuthorized: 'Abanyamuryango batatu basabwa bemeje iri tsinda.', footer: 'Amakuru y’itsinda n’abanyamuryango yabitswe ntasibwa muri iyi ntambwe.', chooseMemberTitle: 'Hitamo umunyamuryango', chooseMemberMessage: 'Hitamo umunyamuryango wemeza iyi ntambwe.', invalidPasscode: 'Kode si yo', invalidPasscodeMessage: 'Andika kode nyayo y’inyuguti enye y’umunyamuryango.', authSuccess: 'Kwemeza byagenze neza', authSuccessMessage: 'Abanyamuryango batatu batandukanye bemeje iri tsinda. Ebadsave VSLA irafunguka ubu.', continue: 'Komeza', authFailed: 'Kwemeza byanze', loadFailed: 'Ntibishobotse gufungura amatsinda', selectFailed: 'Ntibishobotse guhitamo itsinda', unexpected: 'Habaye ikibazo kitari cyitezwe. Ongera ugerageze.', serverVerifying: 'Turimo kwemeza indangamuntu kuri server…', serverFailed: 'Kwemeza kuri server byanze', recoveryLabel: 'Kode yo kugarura itsinda (ntikenewe kuri iyi telefone)', recoveryPlaceholder: 'Andika kode yo kugarura kuri cloud gusa', recoveryHint: 'Siga aha ubusa kuri telefone isanzwe ifite amakuru y’itsinda. Andika kode igihe ugarura itsinda kuri telefone yatakaye, yasimbuwe cyangwa yahinduwe. Kode z’abanyamuryango batatu ziracyakenewe.' },
} as const;

function getAuthText() {
  const code = i18n.language.split('-')[0] as keyof typeof AUTH_TEXT;
  return AUTH_TEXT[code] ?? AUTH_TEXT.en;
}

export default function PreAppAuthorizationScreen({ navigation }: Props) {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupRecord | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedMember, setSelectedMember] = useState<MemberRecord | null>(null);
  const [passcode, setPasscode] = useState('');
  const [authorizedMemberIds, setAuthorizedMemberIds] = useState<number[]>([]);
  const [authorizedDetails, setAuthorizedDetails] = useState<{ memberNumber: string; passcode: string; id: number }[]>([]);
  const [progress, setProgress] = useState<AppAccessProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [recoveryCredential, setRecoveryCredential] = useState('');
  const [serverVerifying, setServerVerifying] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const registeredGroups = await getAllGroups();
        if (mounted) {
          setGroups(registeredGroups.filter((group) => group.status === 'active'));
        }
      } catch (error) {
        Alert.alert(getAuthText().loadFailed, getErrorMessage(error));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const currentStep = STEPS[stepIndex];

  const eligibleMembers = useMemo(() => {
    if (!currentStep) return [];
    return members.filter((member) => {
      if (member.status !== 'active') return false;
      if (!member.phone || !member.phone.trim()) return false;
      if (authorizedMemberIds.includes(member.id)) return false;
      return currentStep.role === 'executive'
        ? isExecutive(member)
        : !isExecutive(member);
    });
  }, [members, currentStep, authorizedMemberIds]);

  async function chooseGroup(group: GroupRecord) {
    setWorking(true);
    try {
      const [groupMembers, newSessionId] = await Promise.all([
        getMembersByGroupId(group.id),
        createAppAccessSession(group.id),
      ]);
      setSelectedGroup(group);
      setMembers(groupMembers);
      setSessionId(newSessionId);
      setStepIndex(0);
      setSelectedMember(null);
      setPasscode('');
      setAuthorizedMemberIds([]);
      setAuthorizedDetails([]);
      setProgress({
        sessionId: newSessionId,
        groupId: group.id,
        executiveCount: 0,
        ordinaryCount: 0,
        totalCount: 0,
        authorized: false,
      });
    } catch (error) {
      Alert.alert(getAuthText().selectFailed, getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  function changeGroup() {
    setSelectedGroup(null);
    setMembers([]);
    setSessionId(null);
    setSelectedMember(null);
    setPasscode('');
    setAuthorizedMemberIds([]);
    setAuthorizedDetails([]);
    setStepIndex(0);
    setProgress(null);
  }

  async function submitPasscode() {
    if (!selectedGroup || sessionId === null || !selectedMember) {
      Alert.alert(getAuthText().chooseMemberTitle, getAuthText().chooseMemberMessage);
      return;
    }
    if (!/^[A-Za-z1-9./$-]{4}$/.test(passcode)) {
      Alert.alert(getAuthText().invalidPasscode, getAuthText().invalidPasscodeMessage);
      return;
    }
    const suppliedRecoveryCredential = recoveryCredential.trim();
    if (suppliedRecoveryCredential.length > 0 && suppliedRecoveryCredential.length < 3) {
      Alert.alert(
        getAuthText().serverFailed,
        'A recovery credential must contain at least 3 characters. If you are using the phone that already has the group data, leave this field completely empty.',
      );
      return;
    }

    const authorizedGroupId = selectedGroup.id;
    setWorking(true);
    try {
      // 1. Local SQLite check (keeps offline UX)
      const nextProgress = await authorizeMemberForAppAccess(
        sessionId,
        selectedMember.id,
        passcode,
      );
      const nextAuthorizedIds = [...authorizedMemberIds, selectedMember.id];
      const nextDetails = [...authorizedDetails, { memberNumber: selectedMember.member_number, passcode: passcode, id: selectedMember.id }];
      setAuthorizedMemberIds(nextAuthorizedIds);
      setAuthorizedDetails(nextDetails);
      setProgress(nextProgress);
      setPasscode('');
      setSelectedMember(null);

      if (nextProgress.authorized) {
        const credential = recoveryCredential.trim();

        // Existing-phone flow: all three members have already been verified
        // against this phone's registered SQLite records. A cloud recovery
        // credential is only needed when the user explicitly runs the
        // cloud restore/recovery verification flow on a replacement phone.
        if (!credential) {
          try {
            await AsyncStorage.setItem(
              '@ebadsave/activeGroupId',
              String(authorizedGroupId),
            );
            // Do not leave a stale server-verification result from a prior group.
            await AsyncStorage.removeItem('@ebadsave/serverVerified');
          } catch (storageError) {
            console.warn(
              'Could not persist the authorized group selection:',
              storageError,
            );
          }

          Alert.alert(
            getAuthText().authSuccess,
            `${getAuthText().authSuccessMessage}\n\nThis phone already has the registered group data, so the group recovery credential was not required.`,
            [{
              text: getAuthText().continue,
              onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Home' }] }),
            }],
            { cancelable: false },
          );
          return;
        }

        // If a credential is supplied, use the existing server verification path.
        setServerVerifying(true);
        try {
          const serverResult = await runBack4AppCloudFunction<{
            verified?: boolean;
            verifiedMembers: Array<{ fullName?: string }>;
          }>('verifyThreeMembersAndRestore', {
            groupNumber: selectedGroup.group_number,
            recoveryCredential: credential,
            authorizations: nextDetails.map((d) => ({
              memberNumber: d.memberNumber,
              passcode: d.passcode,
            })),
          });

          if (!serverResult?.verified) {
            throw new Error('Server did not verify identities');
          }

          try {
            await AsyncStorage.setItem('@ebadsave/activeGroupId', String(authorizedGroupId));
            await AsyncStorage.setItem('@ebadsave/serverVerified', JSON.stringify(serverResult.verifiedMembers));
          } catch (storageError) {
            console.warn('Could not persist the authorized group selection:', storageError);
          }

          Alert.alert(
            getAuthText().authSuccess,
            `${getAuthText().authSuccessMessage}\n\nServer verified: ${serverResult.verifiedMembers.map((m: any) => m.fullName).join(', ')}`,
            [{
              text: getAuthText().continue,
              onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Home' }] }),
            }],
            { cancelable: false },
          );
          return;
        } catch (serverError: any) {
          // Keep the server-verified path strict when a recovery credential was supplied.
          Alert.alert(
            getAuthText().serverFailed,
            getErrorMessage(serverError) + '\n\nServer verification failed. Please check the recovery credential and your connection, then try again.',
          );
          setAuthorizedMemberIds([]);
          setAuthorizedDetails([]);
          setStepIndex(0);
          setProgress({ sessionId, groupId: selectedGroup.id, executiveCount: 0, ordinaryCount: 0, totalCount: 0, authorized: false });
          return;
        } finally {
          setServerVerifying(false);
        }
      }

      setStepIndex((previous) => previous + 1);
    } catch (error) {
      Alert.alert(getAuthText().authFailed, getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.loadingText}>{getAuthText().loading}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.brand}>Ebadsave VSLA</Text>
        <Text style={styles.tagline}>{getAuthText().tagline}</Text>
      </View>

      {!selectedGroup ? (
        <View style={styles.card}>
          <Text style={styles.title}>{getAuthText().selectGroup}</Text>
          <Text style={styles.description}>
            {getAuthText().instructions}
          </Text>
          {groups.length === 0 ? (
            <>
              <Text style={styles.emptyText}>
                No groups are stored on this phone yet. Your cloud backup may still be available.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.restoreCloudButton, pressed && styles.pressed]}
                onPress={() => navigation.navigate('BackupRestore')}
                disabled={working}
              >
                <Text style={styles.restoreCloudButtonText}>RESTORE GROUP FROM CLOUD</Text>
              </Pressable>
              <Text style={styles.restoreHint}>
                Restore your group first, then return here for three-member authorization.
              </Text>
            </>
          ) : groups.map((group) => (
            <Pressable
              key={group.id}
              style={({ pressed }) => [styles.groupButton, pressed && styles.pressed]}
              onPress={() => void chooseGroup(group)}
              disabled={working}
            >
              <Text style={styles.groupNumber}>KYA {group.group_number}</Text>
              <Text style={styles.groupName}>{group.group_name}</Text>
              <Text style={styles.groupLocation}>{group.district}, {group.country}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.groupSummary}>
            <View style={styles.groupSummaryText}>
              <Text style={styles.smallLabel}>{getAuthText().selectedGroup}</Text>
              <Text style={styles.title}>{selectedGroup.group_name}</Text>
              <Text style={styles.groupLocation}>KYA {selectedGroup.group_number} · {selectedGroup.district}, {selectedGroup.country}</Text>
            </View>
            <Pressable onPress={changeGroup} disabled={working} style={styles.changeButton}>
              <Text style={styles.changeButtonText}>{getAuthText().change}</Text>
            </Pressable>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((progress?.totalCount ?? 0) / 3) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {getAuthText().progress(progress?.totalCount ?? 0, progress?.executiveCount ?? 0, progress?.ordinaryCount ?? 0)}
          </Text>

          <View style={styles.recoveryPanel}>
            <Text style={styles.passcodeLabel}>{getAuthText().recoveryLabel}</Text>
            <TextInput
              value={recoveryCredential}
              onChangeText={setRecoveryCredential}
              placeholder={getAuthText().recoveryPlaceholder}
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.passcodeInput}
              editable={!working}
            />
            <Text style={styles.restoreHint}>
              {getAuthText().recoveryHint}
            </Text>
          </View>

          {currentStep ? (
            <>
              <Text style={styles.stepTitle}>{stepIndex === 0 ? getAuthText().stepExecutive1 : stepIndex === 1 ? getAuthText().stepExecutive2 : getAuthText().stepOrdinary}</Text>
              <Text style={styles.description}>
                {getAuthText().chooseMember}
              </Text>

              {eligibleMembers.length === 0 ? (
                <Text style={styles.emptyText}>
                  {currentStep.role === 'executive' ? getAuthText().noEligibleExecutive : getAuthText().noEligibleOrdinary}
                </Text>
              ) : eligibleMembers.map((member) => (
                <Pressable
                  key={member.id}
                  style={({ pressed }) => [
                    styles.memberButton,
                    selectedMember?.id === member.id && styles.memberButtonSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    setSelectedMember(member);
                    setPasscode('');
                  }}
                  disabled={working}
                >
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>{member.full_name.trim().charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.memberTextWrap}>
                    <Text style={styles.memberName}>{member.full_name}</Text>
                    <Text style={styles.memberMeta}>{member.member_number} · {member.role || (isExecutive(member) ? getAuthText().executiveRole : getAuthText().ordinaryRole)}</Text>
                  </View>
                  <Text style={styles.radioMark}>{selectedMember?.id === member.id ? '●' : '○'}</Text>
                </Pressable>
              ))}

              {selectedMember && (
                <View style={styles.passcodePanel}>
                  <Text style={styles.passcodeLabel}>{getAuthText().passcodeFor(selectedMember.full_name)}</Text>
                  <TextInput
                    value={passcode}
                    onChangeText={(value) => setPasscode(value.slice(0, 4))}
                    placeholder={getAuthText().passcodePlaceholder}
                    placeholderTextColor="#64748b"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={4}
                    style={styles.passcodeInput}
                    editable={!working}
                    returnKeyType="done"
                    onSubmitEditing={() => void submitPasscode()}
                  />
                </View>
              )}
            </>
          ) : (
            <Text style={styles.successText}>{getAuthText().allAuthorized}</Text>
          )}

          {/* Always-visible Next action: validates the selected member and PIN,
              then advances to the next authorization step. */}
          {currentStep && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next: verify selected member passcode"
              onPress={() => void submitPasscode()}
              disabled={working || serverVerifying}
              style={({ pressed }) => [
                styles.primaryButton,
                (working || serverVerifying) && styles.disabledButton,
                pressed && !working && styles.pressed,
              ]}
            >
              {working || serverVerifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {getAuthText().verify} & Continue
                </Text>
              )}
            </Pressable>
          )}
        </View>
      )}
      <Text style={styles.footer}>{getAuthText().footer}</Text>
    </ScrollView>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Parse errors have message in error.message
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as any).message);
  }
  return 'An unexpected error occurred. Please try again.';
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f0fdf4', padding: 20, paddingBottom: 36 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0fdf4' },
  loadingText: { marginTop: 12, color: '#166534', fontSize: 15 },
  header: { alignItems: 'center', marginBottom: 22 },
  brand: { color: '#166534', fontSize: 28, fontWeight: '800' },
  tagline: { color: '#475569', fontSize: 14, marginTop: 5 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#dcfce7', elevation: 2 },
  title: { color: '#14532d', fontSize: 20, fontWeight: '800' },
  description: { color: '#475569', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  groupButton: { borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 12, padding: 14, marginTop: 10, backgroundColor: '#f8fff9' },
  groupNumber: { color: '#16a34a', fontSize: 13, fontWeight: '800' },
  groupName: { color: '#14532d', fontSize: 17, fontWeight: '700', marginTop: 3 },
  groupLocation: { color: '#64748b', fontSize: 12, marginTop: 4 },
  emptyText: { color: '#b45309', backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, lineHeight: 20, marginTop: 10 },
  groupSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  groupSummaryText: { flex: 1, paddingRight: 10 },
  smallLabel: { color: '#16a34a', fontWeight: '800', fontSize: 11, marginBottom: 5 },
  changeButton: { borderWidth: 1, borderColor: '#16a34a', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  changeButtonText: { color: '#15803d', fontWeight: '700' },
  progressTrack: { height: 7, borderRadius: 6, backgroundColor: '#dcfce7', overflow: 'hidden', marginTop: 2 },
  progressFill: { height: '100%', backgroundColor: '#16a34a' },
  progressText: { color: '#475569', fontSize: 12, marginTop: 7, marginBottom: 20, lineHeight: 18 },
  stepTitle: { color: '#14532d', fontSize: 18, fontWeight: '800' },
  memberButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 11, marginTop: 8, backgroundColor: '#fff' },
  memberButtonSelected: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  memberAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  memberAvatarText: { color: '#166534', fontWeight: '800', fontSize: 16 },
  memberTextWrap: { flex: 1 },
  memberName: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  memberMeta: { color: '#64748b', fontSize: 11, marginTop: 3 },
  radioMark: { color: '#16a34a', fontSize: 19, marginLeft: 8 },
  passcodePanel: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 13, marginTop: 16 },
  recoveryPanel: { backgroundColor: '#fffbeb', borderRadius: 12, padding: 13, marginBottom: 16, borderWidth: 1, borderColor: '#fde68a' },
  passcodeLabel: { color: '#334155', fontWeight: '700', marginBottom: 8 },
  passcodeInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#0f172a', backgroundColor: '#fff', fontSize: 16, letterSpacing: 1 },
  primaryButton: { minHeight: 48, borderRadius: 10, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', marginTop: 12, padding: 12 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  disabledButton: { opacity: 0.45 },
  successText: { color: '#166534', backgroundColor: '#dcfce7', borderRadius: 10, padding: 13, fontWeight: '700' },
  restoreCloudButton: { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center', marginTop: 16 },
  restoreCloudButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },
  restoreHint: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 10, textAlign: 'center' },
  footer: { textAlign: 'center', color: '#64748b', fontSize: 11, lineHeight: 16, marginTop: 18, paddingHorizontal: 12 },
  pressed: { opacity: 0.8 },
});
