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

const MIN_GROUP_NUMBER = 2010;
const MAX_GROUP_NUMBER = 9090;

const usedGroupNumbers = new Set<number>();

function generateUniqueGroupNumber(): number {
  const availableNumbers: number[] = [];

  for (
    let number = MIN_GROUP_NUMBER;
    number <= MAX_GROUP_NUMBER;
    number++
  ) {
    if (!usedGroupNumbers.has(number)) {
      availableNumbers.push(number);
    }
  }

  if (availableNumbers.length === 0) {
    throw new Error('No group numbers are available.');
  }

  const randomIndex = Math.floor(
    Math.random() * availableNumbers.length,
  );

  const selectedNumber = availableNumbers[randomIndex];

  usedGroupNumbers.add(selectedNumber);

  return selectedNumber;
}

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

  const signatureValid = signatureCode.trim().length >= 4;

  const toggleArticle = (index: number) => {
    setExpandedArticle(
      expandedArticle === index ? null : index,
    );
  };

  useEffect(() => {
    if (agreed && signatureValid && groupNumber === null) {
      setGroupNumber(generateUniqueGroupNumber());
    }

    if ((!agreed || !signatureValid) && groupNumber !== null) {
      usedGroupNumbers.delete(groupNumber);
      setGroupNumber(null);
    }
  }, [agreed, signatureValid, groupNumber]);

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

        <Text style={styles.headerTitle}>Group Constitution</Text>

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
                        editable={true}
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
                        editable={true}
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
                        editable={true}
                      />

                      {/* Group Number */}
                      <View style={styles.numberBox}>
                        <Text style={styles.numberLabel}>
                          Group Number
                        </Text>

                        {groupNumber !== null ? (
                          <Text style={styles.groupNumber}>
                            KYA {groupNumber}
                          </Text>
                        ) : (
                          <Text style={styles.numberWaiting}>
                            Check "I have read and agreed" and enter
                            a signature code of at least 4 characters.
                          </Text>
                        )}
                      </View>

                      <Text style={styles.rangeText}>
                        Available range: KYA 2010 - KYA 9090
                      </Text>
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
          editable={true}
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

  rangeText: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 8,
  },
});
