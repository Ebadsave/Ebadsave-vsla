import React, { useEffect, useState } from 'react';
import {
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
  const [expandedArticle, setExpandedArticle] = useState<number | null>(
    null,
  );

  const [agreed, setAgreed] = useState(false);
  const [signatureCode, setSignatureCode] = useState('');

  const [groupName, setGroupName] = useState('');
  const [district, setDistrict] = useState('');
  const [country, setCountry] = useState('');

  const [groupNumber, setGroupNumber] = useState<number | null>(
    null,
  );

  const [databaseReady, setDatabaseReady] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState('');

  const signatureValid = signatureCode.trim().length >= 4;

  const toggleArticle = (index: number) => {
    setExpandedArticle(
      expandedArticle === index ? null : index,
    );
  };

  /*
   * Initialize SQLite when this screen opens.
   */
  useEffect(() => {
    let mounted = true;

    const prepareDatabase = async () => {
      try {
        await initializeDatabase();

        if (mounted) {
          setDatabaseReady(true);
        }

        /*
         * If an active group already exists on this device,
         * load the most recently registered active group.
         *
         * This allows the KYA number to remain visible after
         * closing and reopening the app.
         */
        const groups = await getAllGroups();

        const activeGroups = groups.filter(
          (group: GroupRecord) => group.status === 'active',
        );

        if (activeGroups.length > 0 && mounted) {
          const currentGroup =
            activeGroups[activeGroups.length - 1];

          setGroupName(currentGroup.group_name);
          setDistrict(currentGroup.district);
          setCountry(currentGroup.country);
          setGroupNumber(currentGroup.group_number);
        }
      } catch (error) {
        console.error(
          'Database initialization error:',
          error,
        );

        if (mounted) {
          setRegistrationMessage(
            'Unable to initialize the group database.',
          );
        }
      }
    };

    prepareDatabase();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * Register the group only when:
   *
   * 1. Database is ready
   * 2. Group name is entered
   * 3. District is entered
   * 4. Country is entered
   * 5. Agreement is checked
   * 6. Signature code has at least 4 characters
   * 7. A KYA number has not already been assigned
   *
   * Once a number has been registered in SQLite, it is NOT
   * removed when the user unchecks the agreement or changes
   * the signature code.
   *
   * The number can only become available again after the
   * group's recorded activity has been inactive for 3 months.
   */
  useEffect(() => {
    if (!databaseReady) {
      return;
    }

    if (groupNumber !== null) {
      return;
    }

    if (!agreed) {
      return;
    }

    if (!signatureValid) {
      return;
    }

    if (!groupName.trim()) {
      return;
    }

    if (!district.trim()) {
      return;
    }

    if (!country.trim()) {
      return;
    }

    if (registering) {
      return;
    }

    let cancelled = false;

    const createGroup = async () => {
      try {
        setRegistering(true);
        setRegistrationMessage('');

        const group = await registerGroup({
          groupName,
          district,
          country,
        });

        if (cancelled) {
          return;
        }

        setGroupNumber(group.group_number);

        setRegistrationMessage(
          `Group successfully registered as KYA ${group.group_number}.`,
        );
      } catch (error) {
        console.error(
          'Group registration error:',
          error,
        );

        if (!cancelled) {
          setRegistrationMessage(
            'Unable to register the group. Please try again.',
          );
        }
      } finally {
        if (!cancelled) {
          setRegistering(false);
        }
      }
    };

    createGroup();

    return () => {
      cancelled = true;
    };
  }, [
    databaseReady,
    agreed,
    signatureValid,
    groupName,
    district,
    country,
    groupNumber,
    registering,
  ]);

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
          Please review the group constitution. Tap an article to
          expand or collapse it.
        </Text>

        {/* Articles */}
        {articles.map((article, index) => {
          const isExpanded = expandedArticle === index;

          return (
            <View
              key={article.title}
              style={styles.articleCard}
            >
              {/* Article Header - only this part expands/collapses */}
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

              {/* Article Body */}
              {isExpanded && (
                <View style={styles.articleBody}>
                  {index === 0 ? (
                    <>
                      <Text style={styles.articleText}>
                        {article.text}
                      </Text>

                      {/* Group Name */}
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
                        editable={groupNumber === null}
                      />

                      {/* District */}
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
                        editable={groupNumber === null}
                      />

                      {/* Country */}
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
                        editable={groupNumber === null}
                      />

                      {/* Group Number */}
                      <View style={styles.numberBox}>
                        <Text style={styles.numberLabel}>
                          Group Number
                        </Text>

                        {registering ? (
                          <Text style={styles.numberWaiting}>
                            Registering group...
                          </Text>
                        ) : groupNumber !== null ? (
                          <>
                            <Text style={styles.groupNumber}>
                              KYA {groupNumber}
                            </Text>

                            <Text style={styles.permanentText}>
                              This number is permanently recorded
                              for this active group.
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.numberWaiting}>
                            Enter Group Name, District and Country,
                            then check "I have read and agreed" and
                            enter a signature code of at least 4
                            characters.
                          </Text>
                        )}
                      </View>

                      <Text style={styles.rangeText}>
                        Available range: KYA 2010 - KYA 9090
                      </Text>

                      {registrationMessage !== '' && (
                        <Text style={styles.registrationMessage}>
                          {registrationMessage}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.articleText}>
                      {article.text}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Agreement */}
        <TouchableOpacity
          style={styles.agreementRow}
          onPress={() => setAgreed(!agreed)}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.checkbox,
              agreed && styles.checkboxSelected,
            ]}
          >
            {agreed && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </View>

          <Text style={styles.agreementText}>
            I have read and agreed
          </Text>
        </TouchableOpacity>

        {/* Signature Code */}
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
          editable={groupNumber === null}
        />
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

  agreementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 18,
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

  numberBox: {
    marginTop: 18,
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#f0fdf4',
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

  permanentText: {
    color: '#166534',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },

  registrationMessage: {
    color: '#166534',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    fontWeight: '600',
  },

  rangeText: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 8,
  },
});
