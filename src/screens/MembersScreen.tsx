
import React, { useCallback, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  getAllGroups,
  getMembersByGroupId,
  registerMember,
  GroupRecord,
  MemberRecord,
} from '../database/database';

import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';


const MEMBER_SCREEN_TEXT = {
  en: {
    title: 'Members', subtitle: 'Register and manage group members', selectGroup: 'Select Group',
    noActiveGroup: 'No active group', registerGroupFirst: 'Please register a group before registering members.',
    openConstitution: 'Open Constitution', currentGroup: 'CURRENT GROUP', member: 'member', members: 'members',
    registerNewMember: '+ Register New Member', registerMember: 'Register New Member', fullName: 'Full Name *',
    enterFullName: 'Enter member full name', gender: 'Gender *', male: 'Male', female: 'Female', age: 'Age *',
    enterAge: 'Enter age', phone: 'Phone', optionalPhone: 'Optional phone number', cell: 'Cell *', enterCell: 'Enter cell',
    district: 'District *', enterDistrict: 'Enter district', cancel: 'Cancel', registering: 'Registering...',
    registeredMembers: 'Registered Members', noMembersYet: 'No members yet', registerFirst: 'Register the first member of this group.',
    error: 'Error', unableGroups: 'Unable to load groups.', unableMembers: 'Unable to load members.',
    noGroupSelected: 'No Group Selected', selectGroupFirst: 'Please select a group first.', required: 'Required',
    nameRequired: 'Member name is required.', genderRequired: 'Gender is required.', invalidAge: 'Invalid Age',
    validAge: 'Please enter a valid age.', cellRequired: 'Cell is required.', districtRequired: 'District is required.',
    memberRegistered: 'Member Registered', registeredSuccessfully: 'has been registered successfully.', memberNumber: 'Member Number:',
    registrationFailed: 'Registration Failed', couldNotRegister: 'The member could not be registered.', years: 'years',
  },
  nyn: {
    title: 'Abanyamuryango', subtitle: 'Wandika kandi ucunge abanyamuryango b’ekibiina', selectGroup: 'Hitamu ekibiina',
    noActiveGroup: 'Tihariho kibiina ekikora', registerGroupFirst: 'Banza wandikise ekibiina otandike kwandika abanyamuryango.',
    openConstitution: 'Guraho amateeka g’ekibiina', currentGroup: 'EKIBIINA EKIRIMO', member: 'omunyamuryango', members: 'abanyamuryango',
    registerNewMember: '+ Wandiika omunyamuryango omuhya', registerMember: 'Wandiika omunyamuryango omuhya', fullName: 'Amabara goona *',
    enterFullName: 'Yingiza amabara goona g’omunyamuryango', gender: 'Ekikazi/ekishaija *', male: 'Ekishaija', female: 'Ekikazi', age: 'Emyaka *',
    enterAge: 'Yingiza emyaka', phone: 'Esimu', optionalPhone: 'Namba y’esimu (si ya bujurizi)', cell: 'Cell *', enterCell: 'Yingiza cell',
    district: 'Disiturikiti *', enterDistrict: 'Yingiza disiturikiti', cancel: 'Rekera', registering: 'Nikirikwandikwa...',
    registeredMembers: 'Abanyamuryango abamaze kwandikwa', noMembersYet: 'Tihariho banyamuryango', registerFirst: 'Wandiika omunyamuryango w’okubanza w’ekibiina eki.',
    error: 'Ensobi', unableGroups: 'Tihasobokire kutwara ebibiina.', unableMembers: 'Tihasobokire kutwara abanyamuryango.',
    noGroupSelected: 'Tihariho kibiina kihairweho', selectGroupFirst: 'Banza uhitemu ekibiina.', required: 'Nikyetaagisa',
    nameRequired: 'Amabara g’omunyamuryango nigyetagisa.', genderRequired: 'Ekikazi/ekishaija nikyetaagisa.', invalidAge: 'Emyaka etariyo',
    validAge: 'Yingiza emyaka ehikire.', cellRequired: 'Cell neyetaagisa.', districtRequired: 'Disiturikiti neyetaagisa.',
    memberRegistered: 'Omunyamuryango ayandikirwe', registeredSuccessfully: 'ayandikirwe gye.', memberNumber: 'Namba y’omunyamuryango:',
    registrationFailed: 'Okukwandiika tikusobokire', couldNotRegister: 'Omunyamuryango tarikubaasa kwandikwa.', years: 'emyaka',
  },
  lg: {
    title: 'Abammemba', subtitle: 'Wandiisa era ofuge abammemba b’ekibiina', selectGroup: 'Londa ekibiina',
    noActiveGroup: 'Tewali kibiina kikola', registerGroupFirst: 'Sooka owandiise ekibiina nga tonnawandiisa bammemba.',
    openConstitution: 'Ggulawo amateeka g’ekibiina', currentGroup: 'EKIBIINA EKIRIWO', member: 'mmemba', members: 'bammemba',
    registerNewMember: '+ Wandiisa Mmemba Omupya', registerMember: 'Wandiisa Mmemba Omupya', fullName: 'Amannya Gonna *',
    enterFullName: 'Yingiza amannya gonna ag’omummemba', gender: 'Ekikula *', male: 'Musajja', female: 'Mukazi', age: 'Emyaka *',
    enterAge: 'Yingiza emyaka', phone: 'Essimu', optionalPhone: 'Namba y’essimu (si ya buwaze)', cell: 'Cell *', enterCell: 'Yingiza cell',
    district: 'Disitulikiti *', enterDistrict: 'Yingiza disitulikiti', cancel: 'Sazaamu', registering: 'Awandiisibwa...',
    registeredMembers: 'Bammemba Abawandiisiddwa', noMembersYet: 'Tewali bammemba', registerFirst: 'Wandiisa mmemba asoose mu kibiina kino.',
    error: 'Ensobi', unableGroups: 'Tekisobose kutikka bibiina.', unableMembers: 'Tekisobose kutikka bammemba.',
    noGroupSelected: 'Tewali kibiina kirondeddwa', selectGroupFirst: 'Sooka olonde ekibiina.', required: 'Kyetaagisa',
    nameRequired: 'Amannya g’omummemba geetaagisa.', genderRequired: 'Ekikula kyetaagisa.', invalidAge: 'Emyaka si mituufu',
    validAge: 'Yingiza emyaka emituufu.', cellRequired: 'Cell yeetaagisa.', districtRequired: 'Disitulikiti yeetaagisa.',
    memberRegistered: 'Mmemba Awandiisiddwa', registeredSuccessfully: 'awandiisiddwa bulungi.', memberNumber: 'Namba y’omummemba:',
    registrationFailed: 'Okwewandiisa Kugaanye', couldNotRegister: 'Ommemba tasobola kuwandiisibwa.', years: 'emyaka',
  },
  sw: {
    title: 'Wanachama', subtitle: 'Sajili na usimamie wanachama wa kikundi', selectGroup: 'Chagua Kikundi',
    noActiveGroup: 'Hakuna kikundi kinachotumika', registerGroupFirst: 'Tafadhali sajili kikundi kabla ya kusajili wanachama.',
    openConstitution: 'Fungua Katiba', currentGroup: 'KIKUNDI CHA SASA', member: 'mwanachama', members: 'wanachama',
    registerNewMember: '+ Sajili Mwanachama Mpya', registerMember: 'Sajili Mwanachama Mpya', fullName: 'Majina Kamili *',
    enterFullName: 'Ingiza majina kamili ya mwanachama', gender: 'Jinsia *', male: 'Mwanaume', female: 'Mwanamke', age: 'Umri *',
    enterAge: 'Ingiza umri', phone: 'Simu', optionalPhone: 'Namba ya simu (si lazima)', cell: 'Seli *', enterCell: 'Ingiza seli',
    district: 'Wilaya *', enterDistrict: 'Ingiza wilaya', cancel: 'Ghairi', registering: 'Inasajili...',
    registeredMembers: 'Wanachama Waliosajiliwa', noMembersYet: 'Bado hakuna wanachama', registerFirst: 'Sajili mwanachama wa kwanza wa kikundi hiki.',
    error: 'Hitilafu', unableGroups: 'Imeshindwa kupakia vikundi.', unableMembers: 'Imeshindwa kupakia wanachama.',
    noGroupSelected: 'Hakuna Kikundi Kilichochaguliwa', selectGroupFirst: 'Tafadhali chagua kikundi kwanza.', required: 'Inahitajika',
    nameRequired: 'Jina la mwanachama linahitajika.', genderRequired: 'Jinsia inahitajika.', invalidAge: 'Umri Si Sahihi',
    validAge: 'Tafadhali ingiza umri sahihi.', cellRequired: 'Seli inahitajika.', districtRequired: 'Wilaya inahitajika.',
    memberRegistered: 'Mwanachama Amesajiliwa', registeredSuccessfully: 'amesajiliwa kwa mafanikio.', memberNumber: 'Namba ya Mwanachama:',
    registrationFailed: 'Usajili Umeshindwa', couldNotRegister: 'Mwanachama hakuweza kusajiliwa.', years: 'miaka',
  },
  fr: {
    title: 'Membres', subtitle: 'Inscrire et gérer les membres du groupe', selectGroup: 'Choisir un groupe',
    noActiveGroup: 'Aucun groupe actif', registerGroupFirst: 'Veuillez inscrire un groupe avant d’inscrire des membres.',
    openConstitution: 'Ouvrir la constitution', currentGroup: 'GROUPE ACTUEL', member: 'membre', members: 'membres',
    registerNewMember: '+ Inscrire un nouveau membre', registerMember: 'Inscrire un nouveau membre', fullName: 'Nom complet *',
    enterFullName: 'Saisir le nom complet du membre', gender: 'Sexe *', male: 'Homme', female: 'Femme', age: 'Âge *',
    enterAge: 'Saisir l’âge', phone: 'Téléphone', optionalPhone: 'Numéro de téléphone (facultatif)', cell: 'Cellule *', enterCell: 'Saisir la cellule',
    district: 'District *', enterDistrict: 'Saisir le district', cancel: 'Annuler', registering: 'Inscription...',
    registeredMembers: 'Membres inscrits', noMembersYet: 'Aucun membre pour le moment', registerFirst: 'Inscrivez le premier membre de ce groupe.',
    error: 'Erreur', unableGroups: 'Impossible de charger les groupes.', unableMembers: 'Impossible de charger les membres.',
    noGroupSelected: 'Aucun groupe sélectionné', selectGroupFirst: 'Veuillez d’abord choisir un groupe.', required: 'Obligatoire',
    nameRequired: 'Le nom du membre est obligatoire.', genderRequired: 'Le sexe est obligatoire.', invalidAge: 'Âge invalide',
    validAge: 'Veuillez saisir un âge valide.', cellRequired: 'La cellule est obligatoire.', districtRequired: 'Le district est obligatoire.',
    memberRegistered: 'Membre inscrit', registeredSuccessfully: 'a été inscrit avec succès.', memberNumber: 'Numéro du membre :',
    registrationFailed: 'Échec de l’inscription', couldNotRegister: 'Le membre n’a pas pu être inscrit.', years: 'ans',
  },
  rw: {
    title: 'Abanyamuryango', subtitle: 'Andika kandi ucunge abanyamuryango b’itsinda', selectGroup: 'Hitamo itsinda',
    noActiveGroup: 'Nta tsinda rikora', registerGroupFirst: 'Banza wandikishe itsinda mbere yo kwandika abanyamuryango.',
    openConstitution: 'Fungura amategeko y’itsinda', currentGroup: 'ITSINDA RIHARI', member: 'umunyamuryango', members: 'abanyamuryango',
    registerNewMember: '+ Andika umunyamuryango mushya', registerMember: 'Andika umunyamuryango mushya', fullName: 'Amazina yose *',
    enterFullName: 'Andika amazina yose y’umunyamuryango', gender: 'Igitsina *', male: 'Gabo', female: 'Gore', age: 'Imyaka *',
    enterAge: 'Andika imyaka', phone: 'Telefoni', optionalPhone: 'Nimero ya telefoni (si ngombwa)', cell: 'Akagari *', enterCell: 'Andika akagari',
    district: 'Akarere *', enterDistrict: 'Andika akarere', cancel: 'Hagarika', registering: 'Birandikwa...',
    registeredMembers: 'Abanyamuryango banditswe', noMembersYet: 'Nta banyamuryango baraboneka', registerFirst: 'Andika umunyamuryango wa mbere w’iri tsinda.',
    error: 'Ikosa', unableGroups: 'Ntibishobotse gufungura amatsinda.', unableMembers: 'Ntibishobotse gufungura abanyamuryango.',
    noGroupSelected: 'Nta tsinda ryatoranyijwe', selectGroupFirst: 'Banza uhitemo itsinda.', required: 'Birakenewe',
    nameRequired: 'Amazina y’umunyamuryango arakenewe.', genderRequired: 'Igitsina kirakenewe.', invalidAge: 'Imyaka si yo',
    validAge: 'Andika imyaka nyayo.', cellRequired: 'Akagari karakenewe.', districtRequired: 'Akarere karakenewe.',
    memberRegistered: 'Umunyamuryango yanditswe', registeredSuccessfully: 'yanditswe neza.', memberNumber: 'Nimero y’umunyamuryango:',
    registrationFailed: 'Kwiyandikisha byanze', couldNotRegister: 'Umunyamuryango ntiyashoboye kwandikwa.', years: 'imyaka',
  },
} as const;

type MembersScreenProps = {
  navigation: any;
};

export default function MembersScreen({
  navigation,
}: MembersScreenProps) {
  const { i18n } = useTranslation();
  const languageCode = i18n.language.split('-')[0] as keyof typeof MEMBER_SCREEN_TEXT;
  const words = MEMBER_SCREEN_TEXT[languageCode] ?? MEMBER_SCREEN_TEXT.en;

  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroup, setSelectedGroup] =
    useState<GroupRecord | null>(null);

  const [members, setMembers] =
    useState<MemberRecord[]>([]);

  const [showRegisterForm, setShowRegisterForm] =
    useState(false);

  const [memberName, setMemberName] =
    useState('');

  const [gender, setGender] =
    useState('');

  const [age, setAge] =
    useState('');

  const [phone, setPhone] =
    useState('');

  const [cell, setCell] =
    useState('');

  const [district, setDistrict] =
    useState('');

  const [saving, setSaving] =
    useState(false);

  const loadGroups = useCallback(async () => {
    try {
      const allGroups = await getAllGroups();

      const activeGroups = allGroups.filter(
        (group) =>
          group.status.toLowerCase() === 'active',
      );

      setGroups(activeGroups);

      if (selectedGroup) {
        const refreshedGroup =
          activeGroups.find(
            (group) =>
              group.id === selectedGroup.id,
          );

        if (refreshedGroup) {
          setSelectedGroup(refreshedGroup);

          const groupMembers =
            await getMembersByGroupId(
              refreshedGroup.id,
            );

          setMembers(groupMembers);
        } else {
          setSelectedGroup(null);
          setMembers([]);
        }
      } else if (activeGroups.length === 1) {
        setSelectedGroup(activeGroups[0]);

        const groupMembers =
          await getMembersByGroupId(
            activeGroups[0].id,
          );

        setMembers(groupMembers);
      }
    } catch (error) {
      console.error(
        'Failed to load groups:',
        error,
      );

      Alert.alert(
        words.error,
        words.unableGroups,
      );
    }
  }, [selectedGroup, words]);

  useFocusEffect(
    useCallback(() => {
      loadGroups();
    }, [loadGroups]),
  );

  const selectGroup = async (
    group: GroupRecord,
  ) => {
    try {
      setSelectedGroup(group);

      const groupMembers =
        await getMembersByGroupId(group.id);

      setMembers(groupMembers);
      setShowRegisterForm(false);
    } catch (error) {
      console.error(
        'Failed to load members:',
        error,
      );

      Alert.alert(
        words.error,
        words.unableMembers,
      );
    }
  };

  const clearForm = () => {
    setMemberName('');
    setGender('');
    setAge('');
    setPhone('');
    setCell('');
    setDistrict('');
  };

  const handleRegisterMember = async () => {
    if (!selectedGroup) {
      Alert.alert(
        words.noGroupSelected,
        words.selectGroupFirst,
      );
      return;
    }

    const cleanName = memberName.trim();
    const cleanGender = gender.trim();
    const cleanAge = age.trim();
    const cleanPhone = phone.trim();
    const cleanCell = cell.trim();
    const cleanDistrict = district.trim();

    if (!cleanName) {
      Alert.alert(
        words.required,
        words.nameRequired,
      );
      return;
    }

    if (!cleanGender) {
      Alert.alert(
        words.required,
        words.genderRequired,
      );
      return;
    }

    const numericAge = Number(cleanAge);

    if (
      !cleanAge ||
      !Number.isInteger(numericAge) ||
      numericAge <= 0
    ) {
      Alert.alert(
        words.invalidAge,
        words.validAge,
      );
      return;
    }

    if (!cleanCell) {
      Alert.alert(
        words.required,
        words.cellRequired,
      );
      return;
    }

    if (!cleanDistrict) {
      Alert.alert(
        words.required,
        words.districtRequired,
      );
      return;
    }

    try {
      setSaving(true);

      // registerMember returns the new member ID
      const newMemberId = await registerMember(
        selectedGroup.id,
        cleanName,
        cleanGender,
        numericAge,
        cleanPhone,
        cleanCell,
        cleanDistrict,
        null,
      );

      // Reload the complete member list
      const updatedMembers =
        await getMembersByGroupId(
          selectedGroup.id,
        );

      setMembers(updatedMembers);

      // Find the actual MemberRecord using the returned ID
      const newMember = updatedMembers.find(
        (member) => member.id === newMemberId,
      );

      clearForm();
      setShowRegisterForm(false);

      if (newMember) {
        Alert.alert(
          words.memberRegistered,
          `${newMember.full_name} ${words.registeredSuccessfully}\n\n${words.memberNumber} ${newMember.member_number}`,
        );
      } else {
        Alert.alert(
          words.memberRegistered,
          `${cleanName} ${words.registeredSuccessfully}`,
        );
      }
    } catch (error) {
      console.error(
        'Failed to register member:',
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : words.couldNotRegister;

      Alert.alert(
        words.registrationFailed,
        message,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>
            {words.title}
          </Text>

          <Text style={styles.headerSubtitle}>
            {words.subtitle}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Group Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {words.selectGroup}
          </Text>

          {groups.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {words.noActiveGroup}
              </Text>

              <Text style={styles.emptyText}>
                {words.registerGroupFirst}
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() =>
                  navigation.navigate(
                    'Constitution',
                  )
                }
              >
                <Text
                  style={styles.secondaryButtonText}
                >
                  {words.openConstitution}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            groups.map((group) => {
              const selected =
                selectedGroup?.id === group.id;

              return (
                <TouchableOpacity
                  key={group.id}
                  style={[
                    styles.groupCard,
                    selected &&
                      styles.selectedGroupCard,
                  ]}
                  onPress={() =>
                    selectGroup(group)
                  }
                  activeOpacity={0.8}
                >
                  <View style={styles.groupNumberBox}>
                    <Text
                      style={
                        styles.groupNumberText
                      }
                    >
                      KYA {group.group_number}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.groupDetails
                    }
                  >
                    <Text
                      style={styles.groupName}
                    >
                      {group.group_name}
                    </Text>

                    <Text
                      style={styles.groupLocation}
                    >
                      {group.district},{' '}
                      {group.country}
                    </Text>
                  </View>

                  {selected && (
                    <Text
                      style={styles.checkMark}
                    >
                      ✓
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Selected Group */}
        {selectedGroup && (
          <>
            <View style={styles.selectedGroupBanner}>
              <Text
                style={styles.selectedGroupLabel}
              >
                {words.currentGroup}
              </Text>

              <Text
                style={styles.selectedGroupNumber}
              >
                KYA {selectedGroup.group_number}
              </Text>

              <Text
                style={styles.selectedGroupName}
              >
                {selectedGroup.group_name}
              </Text>

              <Text
                style={styles.memberCount}
              >
                {members.length} {members.length === 1 ? words.member : words.members}
              </Text>
            </View>

            {/* Register Button */}
            {!showRegisterForm && (
              <TouchableOpacity
                style={styles.registerButton}
                onPress={() =>
                  setShowRegisterForm(true)
                }
                activeOpacity={0.8}
              >
                <Text
                  style={styles.registerButtonText}
                >
                  {words.registerNewMember}
                </Text>
              </TouchableOpacity>
            )}

            {/* Registration Form */}
            {showRegisterForm && (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>
                  {words.registerMember}
                </Text>

                <Text style={styles.inputLabel}>
                  {words.fullName}
                </Text>

                <TextInput
                  style={styles.input}
                  value={memberName}
                  onChangeText={setMemberName}
                  placeholder={words.enterFullName}
                  placeholderTextColor="#9ca3af"
                />

                <Text style={styles.inputLabel}>
                  {words.gender}
                </Text>

                <View style={styles.genderRow}>
                  {['Male', 'Female'].map(
                    (item) => (
                      <TouchableOpacity
                        key={item}
                        style={[
                          styles.genderButton,
                          gender === item &&
                            styles.genderButtonSelected,
                        ]}
                        onPress={() =>
                          setGender(item)
                        }
                      >
                        <Text
                          style={[
                            styles.genderButtonText,
                            gender === item &&
                              styles.genderButtonTextSelected,
                          ]}
                        >
                          {item === 'Male' ? words.male : words.female}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>

                <Text style={styles.inputLabel}>
                  {words.age}
                </Text>

                <TextInput
                  style={styles.input}
                  value={age}
                  onChangeText={setAge}
                  placeholder={words.enterAge}
                  placeholderTextColor="#9ca3af"
                  keyboardType="number-pad"
                />

                <Text style={styles.inputLabel}>
                  {words.phone}
                </Text>

                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={words.optionalPhone}
                  placeholderTextColor="#9ca3af"
                  keyboardType="phone-pad"
                />

                <Text style={styles.inputLabel}>
                  {words.cell}
                </Text>

                <TextInput
                  style={styles.input}
                  value={cell}
                  onChangeText={setCell}
                  placeholder={words.enterCell}
                  placeholderTextColor="#9ca3af"
                />

                <Text style={styles.inputLabel}>
                  {words.district}
                </Text>

                <TextInput
                  style={styles.input}
                  value={district}
                  onChangeText={setDistrict}
                  placeholder={words.enterDistrict}
                  placeholderTextColor="#9ca3af"
                />

                <View style={styles.formButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      clearForm();
                      setShowRegisterForm(false);
                    }}
                    disabled={saving}
                  >
                    <Text
                      style={styles.cancelButtonText}
                    >
                      {words.cancel}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      saving &&
                        styles.disabledButton,
                    ]}
                    onPress={
                      handleRegisterMember
                    }
                    disabled={saving}
                  >
                    <Text
                      style={styles.saveButtonText}
                    >
                      {saving
                        ? words.registering
                        : words.registerMember}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Members List */}
            <View style={styles.membersSection}>
              <Text style={styles.sectionTitle}>
                {words.registeredMembers}
              </Text>

              {members.length === 0 ? (
                <View style={styles.emptyMembers}>
                  <Text
                    style={styles.emptyMembersTitle}
                  >
                    {words.noMembersYet}
                  </Text>

                  <Text
                    style={styles.emptyMembersText}
                  >
                    {words.registerFirst}
                  </Text>
                </View>
              ) : (
                members.map((member) => (
                  <View
                    key={member.id}
                    style={styles.memberCard}
                  >
                    <View
                      style={styles.memberAvatar}
                    >
                      <Text
                        style={
                          styles.memberAvatarText
                        }
                      >
                        {member.full_name
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View
                      style={styles.memberInfo}
                    >
                      <Text
                        style={styles.memberName}
                      >
                        {member.full_name}
                      </Text>

                      <Text
                        style={styles.memberNumber}
                      >
                        {member.member_number}
                      </Text>

                      <Text
                        style={styles.memberDetails}
                      >
                        {member.gender}
                        {' • '}
                        {member.age} {words.years}
                      </Text>

                      {member.phone && (
                        <Text
                          style={
                            styles.memberPhone
                          }
                        >
                          {member.phone}
                        </Text>
                      )}
                    </View>

                    <View
                      style={styles.statusBadge}
                    >
                      <Text
                        style={
                          styles.statusText
                        }
                      >
                        {member.status}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 15,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  backText: {
    color: '#16a34a',
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '400',
  },

  headerTitleContainer: {
    flex: 1,
  },

  headerTitle: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '800',
  },

  headerSubtitle: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 2,
  },

  content: {
    padding: 16,
    paddingBottom: 35,
  },

  section: {
    marginBottom: 18,
  },

  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },

  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    elevation: 2,
  },

  selectedGroupCard: {
    borderColor: '#16a34a',
    borderWidth: 2,
  },

  groupNumberBox: {
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginRight: 10,
  },

  groupNumberText: {
    color: '#15803d',
    fontSize: 12,
    fontWeight: '800',
  },

  groupDetails: {
    flex: 1,
  },

  groupName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },

  groupLocation: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 3,
  },

  checkMark: {
    color: '#16a34a',
    fontSize: 22,
    fontWeight: '900',
    marginLeft: 8,
  },

  selectedGroupBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
  },

  selectedGroupLabel: {
    color: '#15803d',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  selectedGroupNumber: {
    color: '#16a34a',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 3,
  },

  selectedGroupName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },

  memberCount: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 5,
  },

  registerButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 18,
  },

  registerButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  formCard: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
  },

  formTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 15,
  },

  inputLabel: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 10,
  },

  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#111827',
    fontSize: 15,
  },

  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },

  genderButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
  },

  genderButtonSelected: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
  },

  genderButtonText: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '700',
  },

  genderButtonTextSelected: {
    color: '#15803d',
  },

  formButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },

  cancelButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: 'center',
  },

  cancelButtonText: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '800',
  },

  saveButton: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 9,
    paddingVertical: 13,
    alignItems: 'center',
  },

  disabledButton: {
    opacity: 0.6,
  },

  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },

  emptyBox: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },

  emptyTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },

  emptyText: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 5,
    lineHeight: 19,
  },

  secondaryButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 9,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginTop: 14,
  },

  secondaryButtonText: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '800',
  },

  membersSection: {
    marginTop: 3,
  },

  emptyMembers: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 20,
    alignItems: 'center',
  },

  emptyMembersTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },

  emptyMembersText: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 4,
  },

  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
  },

  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  memberAvatarText: {
    color: '#15803d',
    fontSize: 18,
    fontWeight: '900',
  },

  memberInfo: {
    flex: 1,
  },

  memberName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },

  memberNumber: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },

  memberDetails: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 3,
  },

  memberPhone: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },

  statusBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginLeft: 6,
  },

  statusText: {
    color: '#15803d',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
