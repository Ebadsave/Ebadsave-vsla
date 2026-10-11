import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import PreAppAuthorizationScreen from './src/screens/PreAppAuthorizationScreen';
import HomeScreen from './src/screens/HomeScreen';
import ConstitutionScreen from './src/screens/ConstitutionScreen';
import SetupRulesScreen from './src/screens/SetupRulesScreen';
import GroupManagementScreen from './src/screens/GroupManagementScreen';
import AddMembersScreen from './src/screens/AddMembersScreen';
import NewMeetingScreen from './src/screens/NewMeetingScreen';
import RollCallScreen from './src/screens/RollCallScreen';
import FinancialTransactionsScreen from './src/screens/FinancialTransactionsScreen';
import SavingsScreen from './src/screens/SavingsScreen';
import LoanDisbursementScreen from './src/screens/LoanDisbursementScreen';
import FinesScreen from './src/screens/FinesScreen';
import InsuranceScreen from './src/screens/InsuranceScreen';
import ExternalFundsScreen from './src/screens/ExternalFundsScreen';
import LoanRepaymentScreen from './src/screens/LoanRepaymentScreen';
import LoansScreen from './src/screens/LoansScreen';
import MiscellaneousExpenseScreen from './src/screens/MiscellaneousExpenseScreen';
import ExpenditureScreen from './src/screens/ExpenditureScreen';
import BackupRestoreScreen from './src/screens/BackupRestoreScreen';

export type RootStackParamList = {
  Welcome: undefined;
  PreAppAuthorization: undefined;
  Home: undefined;
  Constitution: undefined;
  BackupRestore: undefined;

  SetupRules: {
    groupId: number;
  };

  GroupManagement: {
    groupId: number;
    executiveMemberId: number;
  };

  AddMembers: {
    groupId: number;
  };

  NewMeeting: {
    groupId: number;
    executiveMemberId: number;
  };

  MeetingRollCall: {
    groupId: number;
    meetingId: number;
    executiveMemberId: number;
  };

  FinancialTransactions: {
    groupId: number;
    meetingId: number;
  };

  Savings: {
    groupId: number;
    executiveMemberId: number;
    meetingId: number;
  };

  LoanDisbursement: {
    groupId: number;
    executiveMemberId: number;
  };

  Fines: {
    groupId: number;
    executiveMemberId: number;
  };

  Insurance: {
    groupId: number;
    executiveMemberId: number;
  };

  ExternalFunds: {
    groupId: number;
    executiveMemberId: number;
  };

  Repayment: {
    groupId: number;
    executiveMemberId: number;
  };

  Loans: {
    groupId: number;
    executiveMemberId: number;
  };

  MiscellaneousExpense: {
    groupId: number;
    executiveMemberId: number;
  };

  Expenditure: {
    groupId: number;
    meetingId: number;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function WelcomeScreen({ navigation }: { navigation: any }) {
  return (
    <View style={welcomeStyles.container}>
      <View style={welcomeStyles.header}>
        <Text style={welcomeStyles.title}>Ebadsave VSLA</Text>
        <Text style={welcomeStyles.subtitle}>Save together, grow together</Text>
      </View>

      <Text style={welcomeStyles.heading}>Welcome</Text>
      <Text style={welcomeStyles.instruction}>Choose how you want to continue.</Text>

      <Pressable style={welcomeStyles.primaryButton} onPress={() => navigation.navigate('PreAppAuthorization')}>
        <Text style={welcomeStyles.primaryText}>1. Group login</Text>
      </Pressable>
      <Pressable style={welcomeStyles.primaryButton} onPress={() => navigation.navigate('Constitution')}>
        <Text style={welcomeStyles.primaryText}>2. Create new group</Text>
      </Pressable>
      <Pressable style={welcomeStyles.secondaryButton} onPress={() => Alert.alert(
        'Personal account',
        'Personal account creation is not connected in this project yet. Your group data and existing login rules have not been changed.'
      )}>
        <Text style={welcomeStyles.secondaryText}>3. Create personal account</Text>
      </Pressable>
      <Pressable style={welcomeStyles.secondaryButton} onPress={() => Alert.alert(
        'Personal login',
        'Personal login is not connected in this project yet. We need to define and connect its authentication flow before it can safely sign you in.'
      )}>
        <Text style={welcomeStyles.secondaryText}>4. Personal login</Text>
      </Pressable>

      <Text style={welcomeStyles.note}>Group login continues to require the group's pre-app authorization.</Text>
    </View>
  );
}

const welcomeStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 36 },
  title: { color: '#16a34a', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#475569', fontSize: 14, marginTop: 6 },
  heading: { color: '#0f172a', fontSize: 24, fontWeight: '700', marginBottom: 8 },
  instruction: { color: '#475569', fontSize: 15, marginBottom: 22 },
  primaryButton: { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 17, paddingHorizontal: 16, marginBottom: 13 },
  primaryText: { color: '#ffffff', textAlign: 'center', fontSize: 16, fontWeight: '700' },
  secondaryButton: { backgroundColor: '#ffffff', borderColor: '#16a34a', borderWidth: 1.5, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16, marginBottom: 13 },
  secondaryText: { color: '#166534', textAlign: 'center', fontSize: 16, fontWeight: '700' },
  note: { color: '#64748b', textAlign: 'center', fontSize: 12, marginTop: 12, lineHeight: 18 },
});

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Welcome"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} />

        <Stack.Screen
          name="PreAppAuthorization"
          component={PreAppAuthorizationScreen}
        />

        <Stack.Screen
          name="Home"
          component={HomeScreen}
        />

        <Stack.Screen
          name="Constitution"
          component={ConstitutionScreen}
        />

        <Stack.Screen
          name="BackupRestore"
          component={BackupRestoreScreen}
        />

        <Stack.Screen
          name="SetupRules"
          component={SetupRulesScreen}
        />

        <Stack.Screen
          name="GroupManagement"
          component={GroupManagementScreen}
        />

        <Stack.Screen
          name="AddMembers"
          component={AddMembersScreen}
        />

        <Stack.Screen
          name="NewMeeting"
          component={NewMeetingScreen}
        />

        <Stack.Screen
          name="MeetingRollCall"
          component={RollCallScreen}
        />

        <Stack.Screen
          name="FinancialTransactions"
          component={FinancialTransactionsScreen}
        />

        <Stack.Screen
          name="Savings"
          component={SavingsScreen}
        />

        <Stack.Screen
          name="LoanDisbursement"
          component={LoanDisbursementScreen}
        />

        <Stack.Screen
          name="Fines"
          component={FinesScreen}
        />

        <Stack.Screen
          name="Insurance"
          component={InsuranceScreen}
        />

        <Stack.Screen
          name="ExternalFunds"
          component={ExternalFundsScreen}
        />

        <Stack.Screen
          name="Repayment"
          component={LoanRepaymentScreen}
        />

        <Stack.Screen
          name="Loans"
          component={LoansScreen}
        />

        <Stack.Screen
          name="MiscellaneousExpense"
          component={MiscellaneousExpenseScreen}
        />

        <Stack.Screen
          name="Expenditure"
          component={ExpenditureScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
  }
