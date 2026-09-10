import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type HomeScreenProps = {
  navigation: any;
};

const summaryCards = [
  {
    title: 'Total Savings',
    value: 'UGX 0',
    icon: 'S',
    iconBackground: '#dcfce7',
    iconColor: '#16a34a',
  },
  {
    title: 'Loans Out',
    value: 'UGX 0',
    icon: 'L',
    iconBackground: '#ffedd5',
    iconColor: '#f97316',
  },
  {
    title: 'Members',
    value: '0',
    icon: 'M',
    iconBackground: '#dbeafe',
    iconColor: '#2563eb',
  },
  {
    title: 'Fund Balance',
    value: 'UGX 0',
    icon: 'F',
    iconBackground: '#dcfce7',
    iconColor: '#166534',
  },
  {
    title: 'Insurance fund',
    value: 'UGX 0',
    icon: 'I',
    iconBackground: '#fee2e2',
    iconColor: '#dc2626',
  },
  {
    title: 'Fines fund',
    value: 'UGX 0',
    icon: 'N',
    iconBackground: '#ffffff',
    iconColor: '#374151',
  },
];

export default function HomeScreen({
  navigation,
}: HomeScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      {/* Green Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>E</Text>
          </View>

          <View style={styles.titleContainer}>
            <Text style={styles.appName}>Ebadsave VSLA</Text>

            <Text style={styles.tagline}>
              save together,grow together
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.constitutionButton}
          onPress={() => navigation.navigate('Constitution')}
          activeOpacity={0.8}
        >
          <Text style={styles.constitutionText}>
            Constitution
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Summary Cards */}
        <View style={styles.cardsGrid}>
          {summaryCards.map((card) => (
            <View key={card.title} style={styles.card}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: card.iconBackground,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.iconText,
                    { color: card.iconColor },
                  ]}
                >
                  {card.icon}
                </Text>
              </View>

              <Text style={styles.cardTitle}>
                {card.title}
              </Text>

              <Text style={styles.cardValue}>
                {card.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Recent Activity */}
        <View style={styles.activityContainer}>
          <Text style={styles.sectionTitle}>
            Recent Activity
          </Text>

          <View style={styles.emptyActivity}>
            <Text style={styles.emptyIcon}>—</Text>

            <Text style={styles.emptyText}>
              No transactions yet
            </Text>
          </View>
        </View>

        {/* New Meeting */}
        <TouchableOpacity
          style={styles.meetingButton}
          activeOpacity={0.8}
        >
          <Text style={styles.meetingButtonText}>
            New Meeting
          </Text>
        </TouchableOpacity>
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
    justifyContent: 'space-between',
  },

  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  logo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  logoText: {
    color: '#16a34a',
    fontSize: 26,
    fontWeight: '900',
  },

  titleContainer: {
    flex: 1,
  },

  appName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },

  tagline: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 2,
  },

  constitutionButton: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    marginLeft: 8,
  },

  constitutionText: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '800',
  },

  content: {
    padding: 16,
    paddingBottom: 30,
  },

  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  card: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 14,
    elevation: 2,
  },

  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  iconText: {
    fontSize: 18,
    fontWeight: '900',
  },

  cardTitle: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '600',
  },

  cardValue: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },

  activityContainer: {
    marginTop: 5,
  },

  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },

  emptyActivity: {
    height: 125,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIcon: {
    color: '#9ca3af',
    fontSize: 28,
    fontWeight: '300',
    marginBottom: 6,
  },

  emptyText: {
    color: '#6b7280',
    fontSize: 14,
  },

  meetingButton: {
    width: '100%',
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },

  meetingButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
