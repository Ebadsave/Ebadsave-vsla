import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function AddMembersScreen() {
  const handleAddMember = () => {
    // Member registration will be connected to the database next.
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Members</Text>

        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddMember}
          activeOpacity={0.8}
        >
          <Text style={styles.plus}>+</Text>
          <Text style={styles.addButtonText}>Add Member</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.emptyTitle}>No members yet</Text>

        <Text style={styles.emptyText}>
          Tap + Add Member to register a member.
        </Text>
      </View>
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
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },

  addButton: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },

  plus: {
    color: '#16a34a',
    fontSize: 22,
    fontWeight: '700',
    marginRight: 5,
  },

  addButtonText: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '700',
  },

  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  emptyTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111827',
  },

  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});
