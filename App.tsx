import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
import ConstitutionScreen from './src/screens/ConstitutionScreen';
import SetupRulesScreen from './src/screens/SetupRulesScreen';

export type RootStackParamList = {
  Home: undefined;
  Constitution: undefined;
  SetupRules: {
    groupId: number;
  };

  AddMembers: undefined;
  NewMeeting: undefined;
  Savings: undefined;
  LoanDisbursement: undefined;
  FinesInsurance: undefined;
  Loans: undefined;
};

const Stack =
  createNativeStackNavigator<RootStackParamList>();

function PlaceholderScreen({
  route,
  navigation,
}: any) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#f9fafb',
        padding: 20,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 24,
          fontWeight: '700',
          color: '#166534',
          textAlign: 'center',
          marginBottom: 20,
        }}
      >
        {route.name}
      </Text>

      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{
          backgroundColor: '#16a34a',
          paddingVertical: 15,
          borderRadius: 10,
        }}
      >
        <Text
          style={{
            color: '#ffffff',
            textAlign: 'center',
            fontSize: 16,
            fontWeight: '700',
          }}
        >
          Back to Home
        </Text>
      </TouchableOpacity>
    </View>
  );
}

import {
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

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
        >
          {(props) => (
            <PlaceholderScreen {...props} />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="NewMeeting"
        >
          {(props) => (
            <PlaceholderScreen {...props} />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="Savings"
        >
          {(props) => (
            <PlaceholderScreen {...props} />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="LoanDisbursement"
        >
          {(props) => (
            <PlaceholderScreen {...props} />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="FinesInsurance"
        >
          {(props) => (
            <PlaceholderScreen {...props} />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="Loans"
        >
          {(props) => (
            <PlaceholderScreen {...props} />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
