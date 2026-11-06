import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  getPendingMemberRegistrations,
  approveRemoteMemberRegistration,
  rejectRemoteMemberRegistration,
  PendingMemberRegistration,
} from '../services/cloudflareApi';

export default function AdminPendingRegistrationsScreen() {
  const [applications, setApplications] = useState<
    PendingMemberRegistration[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    try {
      const records = await getPendingMemberRegistrations();
      setApplications(records);
    } catch (error) {
      Alert.alert(
        'Unable to load applications',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const refresh = () => {
    setRefreshing(true);
    void loadApplications();
  };

  const approve = (application: PendingMemberRegistration) => {
    Alert.alert(
      'Approve membership?',
      `Approve ${application.fullName} for group ${application.groupNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => {
            void processApproval(application);
          },
        },
      ],
    );
  };

  const processApproval = async (
    application: PendingMemberRegistration,
  ) => {
    setProcessingId(application.applicationId);

    try {
      const result = await approveRemoteMemberRegistration(
        application.applicationId,
      );

      Alert.alert(
        'Registration approved',
        `${application.fullName} has been approved.\nMember number: ${result.memberNumber}`,
      );

      await loadApplications();
    } catch (error) {
      Alert.alert(
        'Approval failed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  const reject = (application: PendingMemberRegistration) => {
    Alert.prompt?.(
      'Reject registration',
      `Enter the reason for rejecting ${application.fullName}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: (reason?: string) => {
            if (!reason?.trim()) {
              Alert.alert(
                'Reason required',
                'Enter a reason before rejecting this application.',
              );
              return;
            }

            void processRejection(application, reason.trim());
          },
        },
      ],
      'plain-text',
    );
  };

  const processRejection = async (
    application: PendingMemberRegistration,
    reason: string,
  ) => {
    setProcessingId(application.applicationId);

    try {
      await rejectRemoteMemberRegistration(
        application.applicationId,
        reason,
      );

      Alert.alert(
        'Registration rejected',
        `${application.fullName}'s application was rejected.`,
      );

      await loadApplications();
    } catch (error) {
      Alert.alert(
        'Rejection failed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  const renderApplication = ({
    item,
  }: {
    item: PendingMemberRegistration;
  }) => {
    const processing = processingId === item.applicationId;

    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.name}>{item.fullName}</Text>

          <Text style={styles.status}>PENDING</Text>
        </View>

        <Detail label="Group" value={item.groupNumber} />
        <Detail label="Gender" value={item.gender} />
        <Detail label="Age" value={String(item.age)} />
        <Detail label="Phone" value={item.phone || 'Not provided'} />
        <Detail
          label="Next of kin"
          value={item.nextOfKin || 'Not provided'}
        />
        <Detail label="Cell" value={item.cell} />
        <Detail label="District" value={item.district} />

        <Text style={styles.date}>
          Applied: {item.createdAt}
        </Text>

        {processing ? (
          <ActivityIndicator
            color="#16a34a"
            style={styles.loader}
          />
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.approveButton}
              onPress={() => approve(item)}
            >
              <Text style={styles.buttonText}>Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => reject(item)}
            >
              <Text style={styles.buttonText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.securityNote}>
          The applicant's PIN is never displayed here.
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <
