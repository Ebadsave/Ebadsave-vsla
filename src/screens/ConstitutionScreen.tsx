import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  TextInput,
} from 'react-native';

type ConstitutionScreenProps = {
  navigation: any;
};

const articles = [
  {
    title: 'Article 1: Name and Purpose',
    text: 'This group shall operate as Ebadsave VSLA. Its purpose is to encourage members to save together, access loans, support one another and improve the financial wellbeing of members.',
  },
  {
    title: 'Article 2: Membership',
    text: 'Membership shall be open to eligible persons who accept the group constitution, contribute regularly and participate in group activities.',
  },
  {
    title: 'Article 3: Contributions',
    text: 'Members shall make savings contributions according to the agreed group contribution amount and schedule.',
  },
  {
    title: 'Article 4: Loans',
    text: 'Members may apply for loans subject to group approval. The maximum loan shall default to three times the member savings, unless the group constitution is amended.',
  },
  {
    title: 'Article 5: Meetings and Attendance',
    text: 'Members shall attend scheduled meetings on time and participate in group activities. Absence may attract penalties according to the agreed rules.',
  },
  {
    title: 'Article 6: Leadership',
    text: 'The group shall have a Chair, Vice Chair, Secretary, Treasurer, two Money Counters, three Key Keepers and a Supervisor.',
  },
  {
    title: 'Article 7: Welfare, and Insurance Fund',
    text: 'The group may maintain welfare and insurance funds to support members during qualifying emergencies and other approved circumstances.',
  },
  {
    title: 'Article 8: Penalties and Fines',
    text: 'Members who fail to follow approved group rules may be required to pay penalties or fines as agreed by the group.',
  },
  {
    title: 'Article 9: Sharing and Dissolution',
    text: 'Savings, profits and other group funds shall be shared according to approved group rules. Dissolution shall follow a decision of the members and proper settlement of obligations.',
  },
  {
    title: 'Article 10: Amendments',
    text: 'This constitution may be amended when members approve the proposed changes according to the agreed voting procedure.',
  },
  {
    title: 'Article 11: Executive expire period',
    text: 'The executive committee shall serve for the period agreed by members. At the end of the period, elections or approved replacements shall take place.',
  },
  {
    title: 'Article 12: Interest percentage and period of loan',
    text: 'The group shall determine the applicable loan interest percentage and loan repayment period. These terms shall be approved by members and recorded in the group rules.',
  },
];

export default function ConstitutionScreen({
  navigation,
}: ConstitutionScreenProps) {
  const [expandedArticle, setExpandedArticle] = useState<number | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [signatureCode, setSignatureCode] = useState('');

  const toggleArticle = (index: number) => {
    setExpandedArticle(
      expandedArticle === index ? null : index
    );
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

        <Text style={styles.headerTitle}>Group Constitution</Text>

        <View style={styles.headerSpace} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {articles.map((article, index) => {
          const expanded = expandedArticle === index;

          return (
            <TouchableOpacity
              key={article.title}
              style={styles.articleCard}
              onPress={() => toggleArticle(index)}
              activeOpacity={0.8}
            >
              <View style={styles.articleHeader}>
                <Text style={styles.articleTitle}>
                  {article.title}
                </Text>

                <Text style={styles.expandIcon}>
                  {expanded ? '−' : '+'}
                </Text>
              </View>

              {expanded && (
                <Text style={styles.articleText}>
                  {article.text}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Agreement */}
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => setAgreed(!agreed)}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.checkbox,
              agreed && styles.checkboxChecked,
            ]}
          >
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>

          <Text style={styles.agreementText}>
            I have read and agreed
          </Text>
        </TouchableOpacity>

        {/* Signature Code */}
        <Text style={styles.inputLabel}>Signature Code</Text>

        <TextInput
          value={signatureCode}
          onChangeText={setSignatureCode}
          placeholder="Enter signature code"
          placeholderTextColor="#9ca3af"
          style={styles.input}
          autoCapitalize="characters"
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
    paddingHorizontal: 12,
  },

  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backText: {
    color: '#ffffff',
    fontSize: 38,
    lineHeight: 40,
    fontWeight: '300',
  },

  headerTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '800',
  },

  headerSpace: {
    width: 42,
  },

  content: {
    padding: 16,
    paddingBottom: 40,
  },

  articleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  articleHeader: {
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

  expandIcon: {
    color: '#16a34a',
    fontSize: 24,
    fontWeight: '700',
  },

  articleText: {
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },

  checkboxRow: {
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
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#ffffff',
  },

  checkboxChecked: {
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
    marginBottom: 7,
  },

  input: {
    height: 48,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: 15,
  },
});
