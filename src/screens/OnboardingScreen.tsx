import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

type LanguageOption = {
  code: string;
  label: string;
};

type CountryOption = {
  code: string;
  label: string;
  dialCode: string;
};

type PickerType = 'language' | 'country' | null;

const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'lg', label: 'Luganda' },
  { code: 'sw', label: 'Swahili' },
  { code: 'rw', label: 'Kinyarwanda' },
  { code: 'fr', label: 'French' },
];

const COUNTRIES: CountryOption[] = [
  { code: 'UG', label: 'Uganda', dialCode: '+256' },
  { code: 'RW', label: 'Rwanda', dialCode: '+250' },
  { code: 'KE', label: 'Kenya', dialCode: '+254' },
  { code: 'TZ', label: 'Tanzania', dialCode: '+255' },
  { code: 'BI', label: 'Burundi', dialCode: '+257' },
  { code: 'SS', label: 'South Sudan', dialCode: '+211' },
  { code: 'CD', label: 'Democratic Republic of the Congo', dialCode: '+243' },
  { code: 'OTHER', label: 'Other country', dialCode: '' },
];

const PREFERENCES_STORAGE_KEY = 'onboardingPreferences';

export default function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const [language, setLanguage] = useState<LanguageOption>(LANGUAGES[0]);
  const [country, setCountry] = useState<CountryOption>(COUNTRIES[0]);
  const [activePicker, setActivePicker] = useState<PickerType>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const pickerTitle = activePicker === 'language' ? 'Select Language' : 'Select Country';

  const saveAndContinue = async () => {
    if (saving) return;
    setSaving(true);
    setErrorMessage('');

    try {
      const preferences = {
        lang: language.code,
        country: country.code,
      };

      await AsyncStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
      navigation.navigate('Login');
    } catch (error) {
      setErrorMessage('Could not save your preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const selectLanguage = (option: LanguageOption) => {
    setLanguage(option);
    setActivePicker(null);
  };

  const selectCountry = (option: CountryOption) => {
    setCountry(option);
    setActivePicker(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/ebadsave-logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Ebadsave VSLA — Save together, grow together"
          />
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Select Language</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Selected language: ${language.label}. Tap to change.`}
            style={styles.dropdown}
            onPress={() => setActivePicker('language')}
            activeOpacity={0.8}
          >
            <Text style={styles.dropdownValue}>{language.label}</Text>
            <Text style={styles.dropdownArrow}>▼</Text>
          </TouchableOpacity>

          <Text style={[styles.label, styles.countryLabel]}>Select Country</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Selected country: ${country.label}. Tap to change.`}
            style={styles.dropdown}
            onPress={() => setActivePicker('country')}
            activeOpacity={0.8}
          >
            <Text style={styles.dropdownValue} numberOfLines={1}>
              {country.label}{country.dialCode ? ` (${country.dialCode})` : ''}
            </Text>
            <Text style={styles.dropdownArrow}>▼</Text>
          </TouchableOpacity>

          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        </View>

        <View style={styles.bottomArea}>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.getStartedButton, saving && styles.buttonDisabled]}
            onPress={saveAndContinue}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.getStartedText}>{saving ? 'Saving…' : 'Get Started!'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={activePicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActivePicker(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActivePicker(null)}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>{pickerTitle}</Text>
            <ScrollView style={styles.optionsList} keyboardShouldPersistTaps="handled">
              {activePicker === 'language'
                ? LANGUAGES.map((option) => (
                    <TouchableOpacity
                      key={option.code}
                      style={styles.optionRow}
                      onPress={() => selectLanguage(option)}
                    >
                      <Text style={styles.optionText}>{option.label}</Text>
                      {language.code === option.code && <Text style={styles.selectedMark}>✓</Text>}
                    </TouchableOpacity>
                  ))
                : COUNTRIES.map((option) => (
                    <TouchableOpacity
                      key={option.code}
                      style={styles.optionRow}
                      onPress={() => selectCountry(option)}
                    >
                      <Text style={styles.optionText}>
                        {option.label}{option.dialCode ? ` (${option.dialCode})` : ''}
                      </Text>
                      {country.code === option.code && <Text style={styles.selectedMark}>✓</Text>}
                    </TouchableOpacity>
                  ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setActivePicker(null)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 24,
  },
  logoContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 42,
  },
  logo: {
    width: 220,
    height: 220,
    alignSelf: 'center',
  },
  form: {
    width: '100%',
  },
  label: {
    color: '#34495E',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  countryLabel: {
    marginTop: 28,
  },
  dropdown: {
    minHeight: 58,
    width: '100%',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#D9E2E7',
    borderRadius: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownValue: {
    flex: 1,
    color: '#34495E',
    fontSize: 17,
    fontWeight: '500',
    marginRight: 12,
  },
  dropdownArrow: {
    color: '#34495E',
    fontSize: 14,
    marginLeft: 8,
  },
  bottomArea: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: 44,
  },
  getStartedButton: {
    width: '100%',
    minHeight: 58,
    backgroundColor: '#6FCFC0',
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 5,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  getStartedText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: '#B42318',
    fontSize: 13,
    marginTop: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  modalCard: {
    maxHeight: '82%',
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 12,
    elevation: 8,
  },
  modalTitle: {
    color: '#34495E',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  optionsList: {
    flexGrow: 0,
  },
  optionRow: {
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  optionText: {
    flex: 1,
    color: '#34495E',
    fontSize: 16,
    marginRight: 12,
  },
  selectedMark: {
    color: '#16a34a',
    fontSize: 19,
    fontWeight: '800',
  },
  cancelButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  cancelText: {
    color: '#34495E',
    fontSize: 16,
    fontWeight: '700',
  },
});
