import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  approveRemoteMemberRegistration,
  getPendingMemberRegistrations,
  rejectRemoteMemberRegistration,
  type PendingMemberRegistration,
} from '../services/cloudflareApi';

export default function AdminPendingRegistrationsScreen() {
  const [items, setItems] = useState<PendingMemberRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [rejectionId, setRejectionId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const applications = await getPendingMemberRegistrations();
      setItems(applications);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/_/g, ' ')
          : 'Could not load pending applications.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = (item: PendingMemberRegistration) => {
    Alert.alert(
      'Approve membership',
      `Approve ${item.fullName} for ${item.groupNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => {
            void confirmApproval(item);
          },
        },
      ],
    );
  };

  const confirmApproval = async (item: PendingMemberRegistration) => {
    setWorkingId(item.applicationId);

    try {
      const result = await approveRemoteMemberRegistration(
        item.applicationId,
      );

      Alert.alert(
        'Member approved',
        `Registration approved successfully.\n\nMember number: ${result.memberNumber}`,
      );

      await load();
    } catch (e) {
      Alert.alert(
        'Approval failed',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setWorkingId(null);
    }
  };

  const reject = async () => {
    if (!rejectionId) return;

    if (reason.trim().length < 3) {
      Alert.alert(
        'Reason required',
        'Enter a reason of at least three characters.',
      );
      return;
    }

    const id = rejectionId;

    setWorkingId(id);

    try {
      await rejectRemoteMemberRegistration(id, reason.trim());

      setRejectionId(null);
      setReason('');

      Alert.alert(
        'Application rejected',
        'The applicant registration has been rejected.',
      );

      await load();
    } catch (e) {
      Alert.alert(
        'Rejection failed',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>
        Pending Member Applications
      </Text>

      <Text style={styles.subtitle}>
        Review applications submitted by people wishing to join
        your VSLA group. Approval is required before membership
        becomes active.
      </Text>

      <TouchableOpacity
        style={styles.refresh}
        disabled={loading || workingId !== null}
        onPress={() => void load()}
      >
        <Text style={styles.refreshText}>
          Refresh applications
        </Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator
          color="#16a34a"
          size="large"
        />
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>

          <TouchableOpacity
            style={styles.refresh}
            onPress={() => void load()}
          >
            <Text style={styles.refreshText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>
          There are no pending applications.
        </Text>
      ) : (
        items.map(item => (
          <View
            key={item.applicationId}
            style={styles.card}
          >
            <Text style={styles.name}>
              {item.fullName}
            </Text>

            <Text style={styles.meta}>
              {item.groupNumber} · {item.gender} · {item.age} years
            </Text>

            <Text style={styles.detail}>
              Cell: {item.cell}
            </Text>

            <Text style={styles.detail}>
              District: {item.district}
            </Text>

            {item.phone ? (
              <Text style={styles.detail}>
                Phone: {item.phone}
              </Text>
            ) : null}

            {item.nextOfKin ? (
              <Text style={styles.detail}>
                Next of kin: {item.nextOfKin}
              </Text>
            ) : null}

            <Text style={styles.date}>
              Submitted: {item.createdAt}
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity
                disabled={workingId !== null}
                style={styles.approve}
                onPress={() => approve(item)}
              >
                <Text style={styles.actionText}>
                  {workingId === item.applicationId
                    ? 'Please wait...'
                    : 'Approve'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={workingId !== null}
                style={styles.reject}
                onPress={() => {
                  setRejectionId(item.applicationId);
                  setReason('');
                }}
              >
                <Text style={styles.actionText}>
                  Reject
                </Text>
              </TouchableOpacity>
            </View>

            {rejectionId === item.applicationId ? (
              <View style={styles.rejectBox}>
                <Text style={styles.label}>
                  Reason for rejection
                </Text>

                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Enter rejection reason"
                  style={styles.input}
                  multiline
                />

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.reject}
                    disabled={workingId !== null}
                    onPress={() => void reject()}
                  >
                    <Text style={styles.actionText}>
                      Confirm rejection
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cancel}
                    onPress={() => {
                      setRejectionId(null);
                      setReason('');
                    }}
                  >
                    <Text style={styles.cancelText}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    gap: 14,
    backgroundColor: '#f7faf7',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#166534',
  },
  subtitle: {
    color: '#475569',
    lineHeight: 21,
  },
  refresh: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 8,
    padding: 10,
  },
  refreshText: {
    color: '#166534',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 12,
    gap: 7,
    elevation: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: '#14532d',
  },
  meta: {
    color: '#475569',
    fontWeight: '600',
  },
  detail: {
    color: '#334155',
  },
  date: {
    color: '#64748b',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  approve: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#16a34a',
  },
  reject: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#b91c1c',
  },
  actionText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  rejectBox: {
    gap: 8,
    marginTop: 10,
  },
  label: {
    color: '#14532d',
    fontWeight: '700',
  },
  input: {
    minHeight: 65,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#ffffff',
    textAlignVertical: 'top',
  },
  cancel: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#64748b',
  },
  cancelText: {
    color: '#334155',
    fontWeight: '700',
  },
  errorBox: {
    gap: 10,
  },
  error: {
    color: '#b91c1c',
  },
  empty: {
    color: '#64748b',
    padding: 15,
  },
});
