import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
import ConstitutionScreen from './src/screens/ConstitutionScreen';
import SetupRulesScreen from './src/screens/SetupRulesScreen';

import AddMembersScreen from './src/screens/AddMembersScreen';
import NewMeetingScreen from './src/screens/NewMeetingScreen';
import SavingsScreen from './src/screens/SavingsScreen';
import LoanDisbursementScreen from './src/screens/LoanDisbursementScreen';
import FinesScreen from './src/screens/FinesScreen';
import InsuranceScreen from './src/screens/InsuranceScreen';
import ExternalFundsScreen from './src/screens/ExternalFundsScreen';
import LoanRepaymentScreen from './src/screens/RepaymentScreen';
import LoansScreen from './src/screens/LoansScreen';
import MiscellaneousExpenseScreen from './src/screens/MiscellaneousExpenseScreen';
import ExpenditureScreen from './src/screens/ExpenditureScreen';

export type RootStackParamList = {
  Home: undefined;

  Constitution: undefined;

  SetupRules: {
    groupId: number;
  };

  AddMembers: {
    groupId: number;
  };

  NewMeeting: {
    groupId: number;
    executiveMemberId: number;
  };

  Savings: {
    groupId: number;
    executiveMemberId: number;
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
    executiveMemberId: number;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
        />

        <Stack.Screen
          name="Constitution"
          component={ConstitutionScreen}
        />

        <Stack.Screen
          name="SetupRules"
          component={SetupRulesScreen}
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
          component={RepaymentScreen}
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
