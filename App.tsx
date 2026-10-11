import React from 'react';
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

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="PreAppAuthorization"
        screenOptions={{
          headerShown: false,
        }}
      >
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
