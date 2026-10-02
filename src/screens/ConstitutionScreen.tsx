import React, { useEffect, useState } from 'react';
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
  initializeDatabase,
  registerGroup,
  getAllGroups,
  deleteGroup,
  undoDeleteGroup,
  type GroupRecord,
} from '../database/database';

type ConstitutionScreenProps = {
  navigation: any;
};

const articles = [
  {
    title: 'Article 1: Name and Purpose',
    text: 'This group shall operate as Ebadsave VSLA. Its purpose is to encourage members to save together, grow together, access appropriate financial services, support one another, and improve the financial wellbeing of members.',
  },
  {
    title: 'Article 2: Membership',
    text: 'Membership shall be open to eligible persons who accept this constitution, follow group rules, contribute regularly, attend meetings, and participate in group activities.',
  },
  {
    title: 'Article 3: Contributions',
    text: 'Members shall make regular savings contributions according to the amount and schedule approved by the group. All contributions shall be properly recorded.',
  },
  {
    title: 'Article 4: Loans',
    text: 'Members may apply for loans subject to group approval and the availability of funds. The default maximum loan amount shall be three times the member savings, unless the group approves another limit through an amendment.',
  },
  {
    title: 'Article 5: Meetings and Attendance',
    text: 'Members shall attend scheduled meetings on time and participate in group activities. Members who are absent or late without an acceptable reason may be subject to penalties approved by the group.',
  },
  {
    title: 'Article 6: Leadership',
    text: 'The group shall have a Chair, Vice Chair, Secretary, Treasurer, two Money Counters, three Key Keepers, and a Supervisor. Leaders shall perform their duties honestly and in the interests of the group.',
  },
  {
    title: 'Article 7: Welfare, and Insurance Fund',
    text: 'The group may maintain welfare and insurance funds to support members during qualifying emergencies, approved welfare needs, and other circumstances agreed upon by members.',
  },
  {
    title: 'Article 8: Penalties and Fines',
    text: 'Members who fail to follow approved group rules may be required to pay penalties or fines. All fines shall be recorded and allocated to the group fines fund.',
  },
  {
    title: 'Article 9: Sharing and Dissolution',
    text: 'Savings, profits, and other group funds shall be shared according to approved group rules. If the group is dissolved, all outstanding obligations shall first be settled before the remaining funds are distributed.',
  },
  {
    title: 'Article 10: Amendments',
    text: 'This constitution may be amended when members approve proposed changes according to the agreed voting procedure. Approved amendments shall be recorded as part of the group constitution.',
  },
  {
    title: 'Article 11: Executive expire period',
    text: 'The executive committee shall serve for the period agreed by the members. At the end of the approved period, elections or approved replacements shall take place according to group rules.',
  },
  {
    title: 'Article 12: Interest percentage and period of loan',
    text: 'The group shall determine the applicable loan interest percentage and repayment period. These terms shall be approved by members and recorded in the group rules before loans are issued.',
  },
];

export default function ConstitutionScreen({
  navigation,
}: ConstitutionScreenProps) {
  const [expandedArticle, setExpandedArticle] = useState<number | null>(0);

  const [agreed, setAgreed] = useState(false);
  const [signatureCode, setSignatureCode] = useState('');

  const [groupName, setGroupName] = useState('');
  const [district, setDistrict] = useState('');
  const [country, setCountry] = useState('');

  const [groupNumber, setGroupNumber] = useState<number | null>(null);
  const [currentGroupId, setCurrentGroupId] = useState<number | null>(null);

  const [databaseReady, setDatabaseReady] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState('');

  const [registeredGroups, setRegisteredGroups] =
    useState<GroupRecord[]>([]);

  const [isRegisteringNewGroup, setIsRegisteringNewGroup] = useState(false);
  const [isTestGroup, setIsTestGroup] = useState(false);

  const signatureValid = signatureCode.trim().length >= 4;

  const toggleArticle = (index: number) => {
    setExpandedArticle(expandedArticle === index ? null : index);
  };

  useEffect(() => {
    let mounted = true;

    const prepareDatabase = async () => {
      try {
        await initializeDatabase();

        if (!mounted) return;

        setDatabaseReady(true);

        const groups = await getAllGroups();

        if (!mounted) return;

        setRegisteredGroups(groups);

        const activeGroups = groups.filter(
          (group) => group.status === 'active',
        );

        if (activeGroups.length > 0) {
          const currentGroup =
            activeGroups[activeGroups.length - 1];

          setGroupName(currentGroup.group_name);
          setDistrict(currentGroup.district);
          setCountry(currentGroup.country);
          setGroupNumber(currentGroup.group_number);
          setCurrentGroupId(currentGroup.id);
          setIsRegisteringNewGroup(false);
        }
      } catch (error) {
        console.error('Database initialization error:', error);

        if (mounted) {
          setRegistrationMessage(
            error instanceof Error
              ? error.message
              : 'Unable to initialize the group database.',
          );
        }
      }
    };

    prepareDatabase();

    return () => {
      mounted = false;
    };
  }, []);

  const startNewGroupRegistration = (testGroup = false) => {
    setGroupNumber(null);
    setCurrentGroupId(null);
    setGroupName('');
    setDistrict('');
    setCountry('');
    setSignatureCode('');
    setAgreed(false);
    setRegistrationMessage('');
    setIsTestGroup(testGroup);
    setIsRegisteringNewGroup(true);
    setExpandedArticle(0);
  };

  const handleRegisterGroup = async () => {
    if (!databaseReady) {
      setRegistrationMessage('Database is not ready yet.');
      return;
    }

    if (registering) return;

    if (!isRegisteringNewGroup) {
      setRegistrationMessage(
        'Tap Register New Group first.',
      );
      return;
    }

    if (!groupName.trim()) {
      setRegistrationMessage('Group name is required.');
      return;
    }

    if (!district.trim()) {
      setRegistrationMessage('District is required.');
      return;
    }

    if (!country.trim()) {
      setRegistrationMessage('Country is required.');
      return;
    }

    if (!agreed) {
      setRegistrationMessage(
        'Please check "I have read and agreed".',
      );
      return;
    }

    if (!signatureValid) {
      setRegistrationMessage(
        'Signature code must contain at least 4 characters.',
      );
      return;
    }

    try {
      setRegistering(true);
      setRegistrationMessage('');

      const group = await registerGroup({
        groupName,
        district,
        country,
        isTestGroup,
      });

      setGroupNumber(group.group_number);
      setCurrentGroupId(group.id);

      const updatedGroups = await getAllGroups();
      setRegisteredGroups(updatedGroups);
      setIsRegisteringNewGroup(false);

      setRegistrationMessage(
        `${isTestGroup ? 'Test group' : 'Group'} successfully registered as KYA ${group.group_number}.`,
      );
    } catch (error) {
      console.error('Group registration error:', error);

      setRegistrationMessage(
        error instanceof Error
          ? error.message
          : 'Unable to register the group. Please try again.',
      );
    } finally {
      setRegistering(false);
    }
  };

  const handleDeleteGroup = (group: GroupRecord) => {
    Alert.alert(
      'Delete group',
      `Delete KYA ${group.group_number} - ${group.group_name}? The group record will be kept as deleted. Production KYA numbers are not immediately reused.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGroup(group.id);

              const updatedGroups = await getAllGroups();
              setRegisteredGroups(updatedGroups);

              if (currentGroupId === group.id) {
                setCurrentGroupId(null);
                setGroupNumber(null);
                setGroupName('');
                setDistrict('');
                setCountry('');
                setIsRegisteringNewGroup(false);
              }

              setRegistrationMessage(
                `KYA ${group.group_number} was deleted.`,
              );
            } catch (error) {
              setRegistrationMessage(
                error instanceof Error
                  ? error.message
                  : 'Unable to delete the group.',
              );
            }
          },
        },
      ],
    );
  };

  const handleUndoDelete = async (group: GroupRecord) => {
    try {
      const restored = await undoDeleteGroup(group.id);
      const updatedGroups = await getAllGroups();

      setRegisteredGroups(updatedGroups);
      setGroupNumber(restored.group_number);
      setCurrentGroupId(restored.id);
      setGroupName(restored.group_name);
      setDistrict(restored.district);
      setCountry(restored.country);
      setIsRegisteringNewGroup(false);
      setRegistrationMessage(
        `KYA ${restored.group_number} has been restored.`,
      );
    } catch (error) {
      setRegistrationMessage(
        error instanceof Error
          ? error.message
          : 'Unable to restore the group.',
      );
    }
  };

  const enterGroup = (groupId: number) => {
    navigation.navigate('Home', { groupId });
  };

  const selectExistingGroup = (group: GroupRecord) => {
    if (group.status !== 'active') return;

    setGroupName(group.group_name);
    setDistrict(group.district);
    setCountry(group.country);
    setGroupNumber(group.group_number);
    setCurrentGroupId(group.id);
    setSignatureCode('');
    setAgreed(false);
    setRegistrationMessage('');
    setIsRegisteringNewGroup(false);
    setExpandedArticle(0);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Group Constitution
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Please review the group constitution. Article 1 contains
          group registration. Articles 2–12 contain the constitution.
        </Text>

        {articles.map((article, index) => {
          const isExpanded = expandedArticle === index;

          return (
            <View
              key={article.title}
              style={styles.articleCard}
            >
              <TouchableOpacity
                style={styles.articleHeader}
                onPress={() => toggleArticle(index)}
                activeOpacity={0.8}
              >
                <Text style={styles.articleTitle}>
                  {article.title}
                </Text>

                <View style={styles.expandCircle}>
                  <Text style={styles.expandText}>
                    {isExpanded ? '−' : '+'}
                  </Text>
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.articleBody}>
                  <Text style={styles.articleText}>
                    {article.text}
                  </Text>

                  {index === 0 && (
                    <>
                      <View style={styles.registrationTopBox}>
                        <Text style={styles.registrationTitle}>
                          Register Group
                        </Text>

                        <Text style={styles.registrationHelp}>
                          Production groups receive KYA 2010–KYA
                          9090 sequentially. Test groups use only
                          KYA 2000–KYA 2009.
                        </Text>

                        {!isRegisteringNewGroup &&
                          groupNumber !== null && (
                            <View style={styles.registeredBox}>
                              <Text style={styles.numberLabel}>
                                Current Group
                              </Text>
                              <Text style={styles.groupNumber}>
                                KYA {groupNumber}
                              </Text>

                              <TouchableOpacity
                                style={styles.enterButton}
                                onPress={() => {
                                  if (currentGroupId !== null) {
                                    enterGroup(currentGroupId);
                                  }
                                }}
                              >
                                <Text style={styles.enterButtonText}>
                                  Enter Group
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}

                        <TouchableOpacity
                          style={styles.newGroupButton}
                          onPress={() =>
                            startNewGroupRegistration(false)
                          }
                        >
                          <Text style={styles.newGroupButtonText}>
                            + Register New Group
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.testGroupButton}
                          onPress={() =>
                            startNewGroupRegistration(true)
                          }
                        >
                          <Text style={styles.testGroupButtonText}>
                            Register Test Group
                          </Text>
                        </TouchableOpacity>

                        {isRegisteringNewGroup && (
                          <>
                            <Text style={styles.modeText}>
                              {isTestGroup
                                ? 'TEST MODE: KYA 2000–KYA 2009'
                                : 'PRODUCTION MODE: KYA 2010–KYA 9090'}
                            </Text>

                            <Text style={styles.inputLabel}>
                              Group Name
                            </Text>

                            <TextInput
                              style={styles.input}
                              value={groupName}
                              onChangeText={setGroupName}
                              placeholder="Enter group name"
                              placeholderTextColor="#9ca3af"
                              autoCorrect={false}
                              autoCapitalize="words"
                            />

                            <Text style={styles.inputLabel}>
                              District
                            </Text>

                            <TextInput
                              style={styles.input}
                              value={district}
                              onChangeText={setDistrict}
                              placeholder="Enter district"
                              placeholderTextColor="#9ca3af"
                              autoCorrect={false}
                              autoCapitalize="words"
                            />

                            <Text style={styles.inputLabel}>
                              Country
                            </Text>

                            <TextInput
                              style={styles.input}
                              value={country}
                              onChangeText={setCountry}
                              placeholder="Enter country"
                              placeholderTextColor="#9ca3af"
                              autoCorrect={false}
                              autoCapitalize="words"
                            />

                            <View style={styles.numberBox}>
                              <Text style={styles.numberLabel}>
                                Group Number
                              </Text>

                              {registering ? (
                                <Text style={styles.numberWaiting}>
                                  Registering group...
                                </Text>
                              ) : (
                                <Text style={styles.numberWaiting}>
                                  Number will be assigned when you
                                  press Register Group.
                                </Text>
                              )}
                            </View>

                            <TouchableOpacity
                              style={styles.agreementRow}
                              onPress={() => setAgreed(!agreed)}
                            >
                              <View
                                style={[
                                  styles.checkbox,
                                  agreed &&
                                    styles.checkboxSelected,
                                ]}
                              >
                                {agreed && (
                                  <Text style={styles.checkmark}>
                                    ✓
                                  </Text>
                                )}
                              </View>

                              <Text style={styles.agreementText}>
                                I have read and agreed
                              </Text>
                            </TouchableOpacity>

                            <Text style={styles.inputLabel}>
                              Signature Code
                            </Text>

                            <TextInput
                              style={styles.input}
                              value={signatureCode}
                              onChangeText={setSignatureCode}
                              placeholder="Enter signature code"
                              placeholderTextColor="#9ca3af"
                              autoCapitalize="characters"
                              autoCorrect={false}
                            />

                            <TouchableOpacity
                              style={[
                                styles.registerButton,
                                registering &&
                                  styles.disabledButton,
                              ]}
                              onPress={handleRegisterGroup}
                              disabled={registering}
                            >
                              <Text
                                style={
                                  styles.registerButtonText
                                }
                              >
                                {registering
                                  ? 'Registering...'
                                  : isTestGroup
                                    ? 'Register Test Group'
                                    : 'Register Group'}
                              </Text>
                            </TouchableOpacity>

                            {registrationMessage !== '' && (
                              <Text
                                style={
                                  styles.registrationMessage
                                }
                              >
                                {registrationMessage}
                              </Text>
                            )}
                          </>
                        )}
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {registeredGroups.length > 0 && (
          <View style={styles.groupsSection}>
            <Text style={styles.sectionTitle}>
              Registered Groups
            </Text>

            {registeredGroups.map((group) => (
              <View
                key={group.id}
                style={[
                  styles.groupRow,
                  group.status === 'active'
                    ? styles.activeGroupRow
                    : group.status === 'deleted'
                      ? styles.deletedGroupRow
                      : styles.dormantGroupRow,
                ]}
              >
                <TouchableOpacity
                  style={styles.groupRowInfo}
                  onPress={() => selectExistingGroup(group)}
                  disabled={group.status !== 'active'}
                >
                  <Text style={styles.savedGroupNumber}>
                    KYA {group.group_number}
                  </Text>

                  <Text style={styles.savedGroupName}>
                    {group.group_name}
                  </Text>

                  <Text style={styles.savedGroupLocation}>
                    {group.district}, {group.country}
                  </Text>
                </TouchableOpacity>

                <View style={styles.groupActions}>
                  <Text
                    style={[
                      styles.statusText,
                      group.status === 'active'
                        ? styles.activeStatus
                        : group.status === 'deleted'
                          ? styles.deletedStatus
                          : styles.dormantStatus,
                    ]}
                  >
                    {group.status}
                  </Text>

                  {group.status === 'active' && (
                    <TouchableOpacity
                      style={styles.smallActionButton}
                      onPress={() => enterGroup(group.id)}
                    >
                      <Text style={styles.smallActionText}>
                        Enter
                      </Text>
                    </TouchableOpacity>
                  )}

                  {group.status === 'active' && (
                    <TouchableOpacity
                      style={styles.smallDeleteButton}
                      onPress={() => handleDeleteGroup(group)}
                    >
                      <Text style={styles.smallDeleteText}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  )}

                  {group.status === 'deleted' && (
                    <TouchableOpacity
                      style={styles.smallActionButton}
                      onPress={() => handleUndoDelete(group)}
                    >
                      <Text style={styles.smallActionText}>
                        Undo
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    height: 64,
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '300',
    lineHeight: 42,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  intro: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  articleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
    overflow: 'hidden',
  },
  articleHeader: {
    minHeight: 58,
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  articleTitle: {
    flex: 1,
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
    paddingRight: 10,
  },
  expandCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandText: {
    color: '#16a34a',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 24,
  },
  articleBody: {
    borderTopWidth: 1,
    borderTopColor: '#f0fdf4',
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  articleText: {
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 21,
  },
  registrationTopBox: {
    marginTop: 15,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  registrationTitle: {
    color: '#166534',
    fontSize: 18,
    fontWeight: '900',
  },
  registrationHelp: {
    color: '#4b5563',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
    marginBottom: 10,
  },
  registeredBox: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 10,
  },
  inputLabel: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 7,
  },
  input: {
    height: 50,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: 15,
  },
  modeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 10,
  },
  numberBox: {
    marginTop: 18,
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  numberLabel: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 5,
  },
  groupNumber: {
    color: '#16a34a',
    fontSize: 25,
    fontWeight: '900',
  },
  numberWaiting: {
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 19,
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#16a34a',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxSelected: {
    backgroundColor: '#16a34a',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  agreementText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  newGroupButton: {
    height: 48,
    backgroundColor: '#16a34a',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  newGroupButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  testGroupButton: {
    height: 46,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  testGroupButtonText: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '800',
  },
  registerButton: {
    height: 50,
    backgroundColor: '#15803d',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  registerButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  enterButton: {
    height: 44,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  enterButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  registrationMessage: {
    color: '#166534',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    fontWeight: '600',
  },
  groupsSection: {
    marginTop: 12,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  groupRow: {
    minHeight: 78,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeGroupRow: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  dormantGroupRow: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
  },
  deletedGroupRow: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  groupRowInfo: {
    flex: 1,
    paddingRight: 8,
  },
  savedGroupNumber: {
    color: '#16a34a',
    fontSize: 16,
    fontWeight: '900',
  },
  savedGroupName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  savedGroupLocation: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  groupActions: {
    alignItems: 'flex-end',
    gap: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  activeStatus: {
    color: '#16a34a',
  },
  dormantStatus: {
    color: '#6b7280',
  },
  deletedStatus: {
    color: '#c2410c',
  },
  smallActionButton: {
    minWidth: 58,
    height: 30,
    paddingHorizontal: 10,
    backgroundColor: '#16a34a',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallActionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  smallDeleteButton: {
    minWidth: 58,
    height: 30,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallDeleteText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '800',
  },
});
