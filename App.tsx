import React, { useEffect, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { initializeI18n } from './src/translations/i18n';
import LanguageScreen from './src/screens/LanguageScreen';

import PreAppAuthorizationScreen from './src/screens/PreAppAuthorizationScreen';
import HomeScreen from './src/screens/HomeScreen';
import ConstitutionScreen from './src/screens/ConstitutionScreen';
import SetupRulesScreen from './src/screens/SetupRulesScreen';
import GroupManagementScreen from './src/screens/GroupManagementScreen';
import AddMembersScreen from './src/screens/AddMembersScreen';
import NewMeetingScreen from './src/screens/NewMeetingScreen';
import CloseMeetingScreen from './src/screens/CloseMeetingScreen';
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
import { runAutomaticCloudBackup } from './src/screens/backup';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ExistingGroupOnboardingScreen from './src/screens/ExistingGroupOnboardingScreen';

export type RootStackParamList = {
  Onboarding: undefined;
  Welcome: undefined;
  Language: undefined;
  PreAppAuthorization: undefined;
  Home: undefined;
  Constitution: undefined;
  BackupRestore: undefined;
  ExistingGroupOnboarding: { groupId: number };

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

  CloseMeeting: {
    groupId: number;
    executiveMemberId: number;
    meetingId: number;
  };

  MeetingRollCall: {
    groupId: number;
    meetingId: number;
    executiveMemberId: number;
  };

  FinancialTransactions: {
    groupId: number;
    meetingId: number;
    executiveMemberId?: number;
    currency?: string;
  };

  Savings: {
    groupId: number;
    executiveMemberId: number;
    meetingId: number;
  };

  LoanDisbursement: {
    groupId: number;
    meetingId: number;
    executiveMemberId?: number;
    currency?: string;
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

type WelcomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Welcome'
>;

function WelcomeScreen({
  navigation,
}: {
  navigation: WelcomeScreenNavigationProp;
}) {
  const { t } = useTranslation();

  return (
    <View style={welcomeStyles.container}>
      <View style={welcomeStyles.header}>
        <Text style={welcomeStyles.title}>{t('app.name')}</Text>
        <Text style={welcomeStyles.subtitle}>
          {t('app.slogan')}
        </Text>
      </View>

      <Text style={welcomeStyles.heading}>{t('welcome.heading')}</Text>

      <Text style={welcomeStyles.instruction}>
        {t('welcome.instruction')}
      </Text>

      <Pressable
        style={welcomeStyles.primaryButton}
        onPress={() => navigation.navigate('PreAppAuthorization')}
      >
        <Text style={welcomeStyles.primaryText}>{t('welcome.groupLogin')}</Text>
      </Pressable>

      <Pressable
        style={welcomeStyles.primaryButton}
        onPress={() => navigation.navigate('Constitution')}
      >
        <Text style={welcomeStyles.primaryText}>{t('welcome.createGroup')}</Text>
      </Pressable>

      <Pressable
        style={welcomeStyles.secondaryButton}
        onPress={() =>
          Alert.alert(
            t('welcome.personalAccountAlertTitle'),
            t('welcome.personalAccountAlertMessage')
          )
        }
      >
        <Text style={welcomeStyles.secondaryText}>{t('welcome.createPersonalAccount')}</Text>
      </Pressable>

      <Pressable
        style={welcomeStyles.secondaryButton}
        onPress={() =>
          Alert.alert(
            t('welcome.personalLoginAlertTitle'),
            t('welcome.personalLoginAlertMessage')
          )
        }
      >
        <Text style={welcomeStyles.secondaryText}>{t('welcome.personalLogin')}</Text>
      </Pressable>

      <Pressable
        style={welcomeStyles.languageButton}
        onPress={() => navigation.navigate('Language')}
      >
        <Text style={welcomeStyles.languageButtonText}>🌍 {t('language.title')}</Text>
      </Pressable>

      <Text style={welcomeStyles.note}>{t('welcome.authorizationNote')}</Text>
    </View>
  );
}

const welcomeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    color: '#16a34a',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#475569',
    fontSize: 14,
    marginTop: 6,
  },
  heading: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  instruction: {
    color: '#475569',
    fontSize: 15,
    marginBottom: 22,
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 17,
    paddingHorizontal: 16,
    marginBottom: 13,
  },
  primaryText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderColor: '#16a34a',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 13,
  },
  secondaryText: {
    color: '#166534',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  languageButton: {
    backgroundColor: '#166534',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 13,
  },
  languageButtonText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  note: {
    color: '#64748b',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
  },
});

export default function App() {
  const [languageReady, setLanguageReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function prepareLanguage() {
      try {
        await initializeI18n();
      } catch (error) {
        console.error('Language initialization failed:', error);
      } finally {
        if (isMounted) {
          setLanguageReady(true);
        }
      }
    }

    prepareLanguage();

    return () => {
      isMounted = false;
    };
  }, []);

  // Automatic Back4App backup: try after startup, whenever the app returns to
  // the foreground, and periodically while open. The backup service itself
  // checks internet availability and limits successful uploads to one per 6 hours.
  useEffect(() => {
    let disposed = false;
    let startupTimer: ReturnType<typeof setTimeout> | undefined;

    const attemptAutomaticBackup = async () => {
      if (disposed) return;
      try {
        const result = await runAutomaticCloudBackup();
        if (!result.success && !result.skipped) {
          // Do not interrupt members with popups; the periodic/foreground retry
          // will try again when the app is active and internet is available.
          console.warn('Ebadsave automatic cloud backup:', result.error || result.message);
        }
      } catch (error) {
        console.warn('Ebadsave automatic cloud backup failed:', error);
      }
    };

    // Allow the app and local database initialization to settle first.
    startupTimer = setTimeout(() => void attemptAutomaticBackup(), 45_000);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void attemptAutomaticBackup();
      }
    });

    // Expo apps are not guaranteed to run while fully closed/backgrounded.
    const retryTimer = setInterval(() => {
      if (AppState.currentState === 'active') {
        void attemptAutomaticBackup();
      }
    }, 30 * 60 * 1000);

    return () => {
      disposed = true;
      if (startupTimer) clearTimeout(startupTimer);
      clearInterval(retryTimer);
      appStateSubscription.remove();
    };
  }, []);

  if (!languageReady) {
    return (
      <View style={loadingStyles.container}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={loadingStyles.text}>Loading Ebadsave VSLA...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Onboarding"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen
          name="Onboarding"
          component={OnboardingScreen}
        />

        <Stack.Screen
          name="ExistingGroupOnboarding"
          component={ExistingGroupOnboardingScreen}
        />

        <Stack.Screen
          name="Welcome"
          component={WelcomeScreen}
        />

        <Stack.Screen
          name="Language"
          component={LanguageScreen}
        />

        <Stack.Screen
          name="PreAppAuthorization"
          component={PreAppAuthorizationScreen}
        />

        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Constitution" component={ConstitutionScreen} />
        <Stack.Screen name="BackupRestore" component={BackupRestoreScreen} />
        <Stack.Screen name="SetupRules" component={SetupRulesScreen} />
        <Stack.Screen name="GroupManagement" component={GroupManagementScreen} />
        <Stack.Screen name="AddMembers" component={AddMembersScreen} />
        <Stack.Screen name="NewMeeting" component={NewMeetingScreen} />
        <Stack.Screen name="CloseMeeting" component={CloseMeetingScreen} />
        <Stack.Screen name="MeetingRollCall" component={RollCallScreen} />
        <Stack.Screen
          name="FinancialTransactions"
          component={FinancialTransactionsScreen}
        />
        <Stack.Screen name="Savings" component={SavingsScreen} />
        <Stack.Screen
          name="LoanDisbursement"
          component={LoanDisbursementScreen}
        />
        <Stack.Screen name="Fines" component={FinesScreen} />
        <Stack.Screen name="Insurance" component={InsuranceScreen} />
        <Stack.Screen name="ExternalFunds" component={ExternalFundsScreen} />
        <Stack.Screen name="Repayment" component={LoanRepaymentScreen} />
        <Stack.Screen name="Loans" component={LoansScreen} />
        <Stack.Screen
          name="MiscellaneousExpense"
          component={MiscellaneousExpenseScreen}
        />
        <Stack.Screen name="Expenditure" component={ExpenditureScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    marginTop: 12,
    fontSize: 15,
    color: '#166534',
  },
});
