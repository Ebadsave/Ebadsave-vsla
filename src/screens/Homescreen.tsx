import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';

type HomeScreenProps = {
  navigation: any;
};

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const cards = [
    {
      title: 'Total Savings',
      value: 'UGX 0',
      icon: '💰',
      iconColor: '#16a34a',
    },
    {
      title: 'Loans Out',
      value: 'UGX 0',
      icon: '💳',
      iconColor: '#f97316',
    },
    {
      title: 'Members',
      value: '0',
      icon: '👥',
      iconColor: '#2563eb',
    },
    {
      title: 'Fund Balance',
      value: 'UGX 0',
      icon: '🏦',
      iconColor: '#166534',
    },
    {
      title: 'Insurance fund',
      value: 'UGX 0',
      icon: '🛡️',
      iconColor: '#dc2626',
    },
    {
      title: 'Fines fund',
      value: 'UGX 0',
      icon: '📋',
      iconColor: '#ffffff',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>E</Text>
          </View>

          <View>
            <Text style={styles.appName}>Ebadsave VSLA</Text>
            <Text style={styles.subtitle}>
              save together,grow together
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.constitutionButton}
          onPress={() => navigation.navigate('Constitution')}
        >
          <Text style={styles.constitutionButtonText}>Constitution</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Cards */}
        <View style={styles.cardsGrid}>
          {cards.map((card) => (
            <View key={card.title} style={styles.card}>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: card.iconColor },
                ]}
              >
                <Text style={styles.icon}>{card.icon}</Text>
              </View>

              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardValue}>{card.value}</Text>
            </View>
          ))}
        </View>

        {/* Recent Activity */}
        <View style={styles.activitySection}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>

          <View style={styles.emptyActivity}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        </View>

        {/* New Meeting */}
        <TouchableOpacity style={styles.meetingButton}>
          <Text style={styles.meetingButtonText}>New Meeting</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerLeft: {
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
    marginRight: 12,
  },

  logoText: {
    color: '#16a34a',
    fontSize: 26,
    fontWeight: '800',
  },

  appName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },

  subtitle: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 2,
  },

  constitutionButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },

  constitutionButtonText: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '700',
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
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
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

  icon: {
    fontSize: 20,
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

  activitySection: {
    marginTop: 8,
  },

  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },

  emptyActivity: {
    minHeight: 130,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },

  emptyIcon: {
    fontSize: 28,
    marginBottom: 8,
  },

  emptyText: {
    color: '#6b7280',
    fontSize: 14,
  },

  meetingButton: {
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
