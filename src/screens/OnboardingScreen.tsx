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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { changeAppLanguage } from '../translations/i18n';

type LanguageCode = 'en' | 'nyn' | 'lg' | 'sw' | 'fr' | 'rw';

type LanguageOption = {
  code: LanguageCode;
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
  { code: 'nyn', label: 'Runyankore' },
  { code: 'lg', label: 'Luganda' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'fr', label: 'Français' },
  { code: 'rw', label: 'Kinyarwanda' },
];

const COUNTRIES: CountryOption[] = [
  { code: "UG", label: "Uganda", dialCode: "+256" },
  { code: "AF", label: "Afghanistan", dialCode: "+93" },
  { code: "AL", label: "Albania", dialCode: "+355" },
  { code: "DZ", label: "Algeria", dialCode: "+213" },
  { code: "AS", label: "American Samoa", dialCode: "+1684" },
  { code: "AD", label: "Andorra", dialCode: "+376" },
  { code: "AO", label: "Angola", dialCode: "+244" },
  { code: "AI", label: "Anguilla", dialCode: "+1264" },
  { code: "AQ", label: "Antarctica", dialCode: "" },
  { code: "AG", label: "Antigua & Barbuda", dialCode: "+1268" },
  { code: "AR", label: "Argentina", dialCode: "+54" },
  { code: "AM", label: "Armenia", dialCode: "+374" },
  { code: "AW", label: "Aruba", dialCode: "+297" },
  { code: "AU", label: "Australia", dialCode: "+61" },
  { code: "AT", label: "Austria", dialCode: "+43" },
  { code: "AZ", label: "Azerbaijan", dialCode: "+994" },
  { code: "BS", label: "Bahamas", dialCode: "+1242" },
  { code: "BH", label: "Bahrain", dialCode: "+973" },
  { code: "BD", label: "Bangladesh", dialCode: "+880" },
  { code: "BB", label: "Barbados", dialCode: "+1246" },
  { code: "BY", label: "Belarus", dialCode: "+375" },
  { code: "BE", label: "Belgium", dialCode: "+32" },
  { code: "BZ", label: "Belize", dialCode: "+501" },
  { code: "BJ", label: "Benin", dialCode: "+229" },
  { code: "BM", label: "Bermuda", dialCode: "+1441" },
  { code: "BT", label: "Bhutan", dialCode: "+975" },
  { code: "BO", label: "Bolivia", dialCode: "+591" },
  { code: "BA", label: "Bosnia & Herzegovina", dialCode: "+387" },
  { code: "BW", label: "Botswana", dialCode: "+267" },
  { code: "BV", label: "Bouvet Island", dialCode: "" },
  { code: "BR", label: "Brazil", dialCode: "+55" },
  { code: "IO", label: "British Indian Ocean Territory", dialCode: "+246" },
  { code: "VG", label: "British Virgin Islands", dialCode: "+1284" },
  { code: "BN", label: "Brunei", dialCode: "+673" },
  { code: "BG", label: "Bulgaria", dialCode: "+359" },
  { code: "BF", label: "Burkina Faso", dialCode: "+226" },
  { code: "BI", label: "Burundi", dialCode: "+257" },
  { code: "KH", label: "Cambodia", dialCode: "+855" },
  { code: "CM", label: "Cameroon", dialCode: "+237" },
  { code: "CA", label: "Canada", dialCode: "+1" },
  { code: "CV", label: "Cape Verde", dialCode: "+238" },
  { code: "BQ", label: "Caribbean Netherlands", dialCode: "+599" },
  { code: "KY", label: "Cayman Islands", dialCode: "+1345" },
  { code: "CF", label: "Central African Republic", dialCode: "+236" },
  { code: "TD", label: "Chad", dialCode: "+235" },
  { code: "CL", label: "Chile", dialCode: "+56" },
  { code: "CN", label: "China", dialCode: "+86" },
  { code: "CX", label: "Christmas Island", dialCode: "+61" },
  { code: "CC", label: "Cocos (Keeling) Islands", dialCode: "+61" },
  { code: "CO", label: "Colombia", dialCode: "+57" },
  { code: "KM", label: "Comoros", dialCode: "+269" },
  { code: "CG", label: "Congo - Brazzaville", dialCode: "+242" },
  { code: "CD", label: "Congo - Kinshasa", dialCode: "+243" },
  { code: "CK", label: "Cook Islands", dialCode: "+682" },
  { code: "CR", label: "Costa Rica", dialCode: "+506" },
  { code: "HR", label: "Croatia", dialCode: "+385" },
  { code: "CU", label: "Cuba", dialCode: "+53" },
  { code: "CW", label: "Curaçao", dialCode: "+599" },
  { code: "CY", label: "Cyprus", dialCode: "+357" },
  { code: "CZ", label: "Czechia", dialCode: "+420" },
  { code: "CI", label: "Côte d’Ivoire", dialCode: "+225" },
  { code: "DK", label: "Denmark", dialCode: "+45" },
  { code: "DJ", label: "Djibouti", dialCode: "+253" },
  { code: "DM", label: "Dominica", dialCode: "+1767" },
  { code: "DO", label: "Dominican Republic", dialCode: "+1809" },
  { code: "EC", label: "Ecuador", dialCode: "+593" },
  { code: "EG", label: "Egypt", dialCode: "+20" },
  { code: "SV", label: "El Salvador", dialCode: "+503" },
  { code: "GQ", label: "Equatorial Guinea", dialCode: "+240" },
  { code: "ER", label: "Eritrea", dialCode: "+291" },
  { code: "EE", label: "Estonia", dialCode: "+372" },
  { code: "SZ", label: "Eswatini", dialCode: "+268" },
  { code: "ET", label: "Ethiopia", dialCode: "+251" },
  { code: "FK", label: "Falkland Islands", dialCode: "+500" },
  { code: "FO", label: "Faroe Islands", dialCode: "+298" },
  { code: "FJ", label: "Fiji", dialCode: "+679" },
  { code: "FI", label: "Finland", dialCode: "+358" },
  { code: "FR", label: "France", dialCode: "+33" },
  { code: "GF", label: "French Guiana", dialCode: "+594" },
  { code: "PF", label: "French Polynesia", dialCode: "+689" },
  { code: "TF", label: "French Southern Territories", dialCode: "" },
  { code: "GA", label: "Gabon", dialCode: "+241" },
  { code: "GM", label: "Gambia", dialCode: "+220" },
  { code: "GE", label: "Georgia", dialCode: "+995" },
  { code: "DE", label: "Germany", dialCode: "+49" },
  { code: "GH", label: "Ghana", dialCode: "+233" },
  { code: "GI", label: "Gibraltar", dialCode: "+350" },
  { code: "GR", label: "Greece", dialCode: "+30" },
  { code: "GL", label: "Greenland", dialCode: "+299" },
  { code: "GD", label: "Grenada", dialCode: "+1473" },
  { code: "GP", label: "Guadeloupe", dialCode: "+590" },
  { code: "GU", label: "Guam", dialCode: "+1671" },
  { code: "GT", label: "Guatemala", dialCode: "+502" },
  { code: "GG", label: "Guernsey", dialCode: "+44" },
  { code: "GN", label: "Guinea", dialCode: "+224" },
  { code: "GW", label: "Guinea-Bissau", dialCode: "+245" },
  { code: "GY", label: "Guyana", dialCode: "+592" },
  { code: "HT", label: "Haiti", dialCode: "+509" },
  { code: "HM", label: "Heard & McDonald Islands", dialCode: "" },
  { code: "HN", label: "Honduras", dialCode: "+504" },
  { code: "HK", label: "Hong Kong SAR China", dialCode: "+852" },
  { code: "HU", label: "Hungary", dialCode: "+36" },
  { code: "IS", label: "Iceland", dialCode: "+354" },
  { code: "IN", label: "India", dialCode: "+91" },
  { code: "ID", label: "Indonesia", dialCode: "+62" },
  { code: "IR", label: "Iran", dialCode: "+98" },
  { code: "IQ", label: "Iraq", dialCode: "+964" },
  { code: "IE", label: "Ireland", dialCode: "+353" },
  { code: "IM", label: "Isle of Man", dialCode: "+44" },
  { code: "IL", label: "Israel", dialCode: "+972" },
  { code: "IT", label: "Italy", dialCode: "+39" },
  { code: "JM", label: "Jamaica", dialCode: "+1876" },
  { code: "JP", label: "Japan", dialCode: "+81" },
  { code: "JE", label: "Jersey", dialCode: "+44" },
  { code: "JO", label: "Jordan", dialCode: "+962" },
  { code: "KZ", label: "Kazakhstan", dialCode: "+76" },
  { code: "KE", label: "Kenya", dialCode: "+254" },
  { code: "KI", label: "Kiribati", dialCode: "+686" },
  { code: "XK", label: "Kosovo", dialCode: "+383" },
  { code: "KW", label: "Kuwait", dialCode: "+965" },
  { code: "KG", label: "Kyrgyzstan", dialCode: "+996" },
  { code: "LA", label: "Laos", dialCode: "+856" },
  { code: "LV", label: "Latvia", dialCode: "+371" },
  { code: "LB", label: "Lebanon", dialCode: "+961" },
  { code: "LS", label: "Lesotho", dialCode: "+266" },
  { code: "LR", label: "Liberia", dialCode: "+231" },
  { code: "LY", label: "Libya", dialCode: "+218" },
  { code: "LI", label: "Liechtenstein", dialCode: "+423" },
  { code: "LT", label: "Lithuania", dialCode: "+370" },
  { code: "LU", label: "Luxembourg", dialCode: "+352" },
  { code: "MO", label: "Macao SAR China", dialCode: "+853" },
  { code: "MG", label: "Madagascar", dialCode: "+261" },
  { code: "MW", label: "Malawi", dialCode: "+265" },
  { code: "MY", label: "Malaysia", dialCode: "+60" },
  { code: "MV", label: "Maldives", dialCode: "+960" },
  { code: "ML", label: "Mali", dialCode: "+223" },
  { code: "MT", label: "Malta", dialCode: "+356" },
  { code: "MH", label: "Marshall Islands", dialCode: "+692" },
  { code: "MQ", label: "Martinique", dialCode: "+596" },
  { code: "MR", label: "Mauritania", dialCode: "+222" },
  { code: "MU", label: "Mauritius", dialCode: "+230" },
  { code: "YT", label: "Mayotte", dialCode: "+262" },
  { code: "MX", label: "Mexico", dialCode: "+52" },
  { code: "FM", label: "Micronesia", dialCode: "+691" },
  { code: "MD", label: "Moldova", dialCode: "+373" },
  { code: "MC", label: "Monaco", dialCode: "+377" },
  { code: "MN", label: "Mongolia", dialCode: "+976" },
  { code: "ME", label: "Montenegro", dialCode: "+382" },
  { code: "MS", label: "Montserrat", dialCode: "+1664" },
  { code: "MA", label: "Morocco", dialCode: "+212" },
  { code: "MZ", label: "Mozambique", dialCode: "+258" },
  { code: "MM", label: "Myanmar (Burma)", dialCode: "+95" },
  { code: "NA", label: "Namibia", dialCode: "+264" },
  { code: "NR", label: "Nauru", dialCode: "+674" },
  { code: "NP", label: "Nepal", dialCode: "+977" },
  { code: "NL", label: "Netherlands", dialCode: "+31" },
  { code: "NC", label: "New Caledonia", dialCode: "+687" },
  { code: "NZ", label: "New Zealand", dialCode: "+64" },
  { code: "NI", label: "Nicaragua", dialCode: "+505" },
  { code: "NE", label: "Niger", dialCode: "+227" },
  { code: "NG", label: "Nigeria", dialCode: "+234" },
  { code: "NU", label: "Niue", dialCode: "+683" },
  { code: "NF", label: "Norfolk Island", dialCode: "+672" },
  { code: "KP", label: "North Korea", dialCode: "+850" },
  { code: "MK", label: "North Macedonia", dialCode: "+389" },
  { code: "MP", label: "Northern Mariana Islands", dialCode: "+1670" },
  { code: "NO", label: "Norway", dialCode: "+47" },
  { code: "OM", label: "Oman", dialCode: "+968" },
  { code: "PK", label: "Pakistan", dialCode: "+92" },
  { code: "PW", label: "Palau", dialCode: "+680" },
  { code: "PS", label: "Palestinian Territories", dialCode: "+970" },
  { code: "PA", label: "Panama", dialCode: "+507" },
  { code: "PG", label: "Papua New Guinea", dialCode: "+675" },
  { code: "PY", label: "Paraguay", dialCode: "+595" },
  { code: "PE", label: "Peru", dialCode: "+51" },
  { code: "PH", label: "Philippines", dialCode: "+63" },
  { code: "PN", label: "Pitcairn Islands", dialCode: "+64" },
  { code: "PL", label: "Poland", dialCode: "+48" },
  { code: "PT", label: "Portugal", dialCode: "+351" },
  { code: "PR", label: "Puerto Rico", dialCode: "+1787" },
  { code: "QA", label: "Qatar", dialCode: "+974" },
  { code: "RO", label: "Romania", dialCode: "+40" },
  { code: "RU", label: "Russia", dialCode: "+7" },
  { code: "RW", label: "Rwanda", dialCode: "+250" },
  { code: "RE", label: "Réunion", dialCode: "+262" },
  { code: "WS", label: "Samoa", dialCode: "+685" },
  { code: "SM", label: "San Marino", dialCode: "+378" },
  { code: "SA", label: "Saudi Arabia", dialCode: "+966" },
  { code: "SN", label: "Senegal", dialCode: "+221" },
  { code: "RS", label: "Serbia", dialCode: "+381" },
  { code: "SC", label: "Seychelles", dialCode: "+248" },
  { code: "SL", label: "Sierra Leone", dialCode: "+232" },
  { code: "SG", label: "Singapore", dialCode: "+65" },
  { code: "SX", label: "Sint Maarten", dialCode: "+1721" },
  { code: "SK", label: "Slovakia", dialCode: "+421" },
  { code: "SI", label: "Slovenia", dialCode: "+386" },
  { code: "SB", label: "Solomon Islands", dialCode: "+677" },
  { code: "SO", label: "Somalia", dialCode: "+252" },
  { code: "ZA", label: "South Africa", dialCode: "+27" },
  { code: "GS", label: "South Georgia & South Sandwich Islands", dialCode: "+500" },
  { code: "KR", label: "South Korea", dialCode: "+82" },
  { code: "SS", label: "South Sudan", dialCode: "+211" },
  { code: "ES", label: "Spain", dialCode: "+34" },
  { code: "LK", label: "Sri Lanka", dialCode: "+94" },
  { code: "BL", label: "St. Barthélemy", dialCode: "+590" },
  { code: "SH", label: "St. Helena", dialCode: "+290" },
  { code: "KN", label: "St. Kitts & Nevis", dialCode: "+1869" },
  { code: "LC", label: "St. Lucia", dialCode: "+1758" },
  { code: "MF", label: "St. Martin", dialCode: "+590" },
  { code: "PM", label: "St. Pierre & Miquelon", dialCode: "+508" },
  { code: "VC", label: "St. Vincent & Grenadines", dialCode: "+1784" },
  { code: "SD", label: "Sudan", dialCode: "+249" },
  { code: "SR", label: "Suriname", dialCode: "+597" },
  { code: "SJ", label: "Svalbard & Jan Mayen", dialCode: "+4779" },
  { code: "SE", label: "Sweden", dialCode: "+46" },
  { code: "CH", label: "Switzerland", dialCode: "+41" },
  { code: "SY", label: "Syria", dialCode: "+963" },
  { code: "ST", label: "São Tomé & Príncipe", dialCode: "+239" },
  { code: "TW", label: "Taiwan", dialCode: "+886" },
  { code: "TJ", label: "Tajikistan", dialCode: "+992" },
  { code: "TZ", label: "Tanzania", dialCode: "+255" },
  { code: "TH", label: "Thailand", dialCode: "+66" },
  { code: "TL", label: "Timor-Leste", dialCode: "+670" },
  { code: "TG", label: "Togo", dialCode: "+228" },
  { code: "TK", label: "Tokelau", dialCode: "+690" },
  { code: "TO", label: "Tonga", dialCode: "+676" },
  { code: "TT", label: "Trinidad & Tobago", dialCode: "+1868" },
  { code: "TN", label: "Tunisia", dialCode: "+216" },
  { code: "TM", label: "Turkmenistan", dialCode: "+993" },
  { code: "TC", label: "Turks & Caicos Islands", dialCode: "+1649" },
  { code: "TV", label: "Tuvalu", dialCode: "+688" },
  { code: "TR", label: "Türkiye", dialCode: "+90" },
  { code: "UM", label: "U.S. Outlying Islands", dialCode: "+1" },
  { code: "VI", label: "U.S. Virgin Islands", dialCode: "+1340" },
  { code: "UA", label: "Ukraine", dialCode: "+380" },
  { code: "AE", label: "United Arab Emirates", dialCode: "+971" },
  { code: "GB", label: "United Kingdom", dialCode: "+44" },
  { code: "US", label: "United States", dialCode: "+1" },
  { code: "UY", label: "Uruguay", dialCode: "+598" },
  { code: "UZ", label: "Uzbekistan", dialCode: "+998" },
  { code: "VU", label: "Vanuatu", dialCode: "+678" },
  { code: "VA", label: "Vatican City", dialCode: "+39" },
  { code: "VE", label: "Venezuela", dialCode: "+58" },
  { code: "VN", label: "Vietnam", dialCode: "+84" },
  { code: "WF", label: "Wallis & Futuna", dialCode: "+681" },
  { code: "EH", label: "Western Sahara", dialCode: "+212" },
  { code: "YE", label: "Yemen", dialCode: "+967" },
  { code: "ZM", label: "Zambia", dialCode: "+260" },
  { code: "ZW", label: "Zimbabwe", dialCode: "+263" },
  { code: "AX", label: "Åland Islands", dialCode: "+358" },
];
const PREFERENCES_STORAGE_KEY = 'onboardingPreferences';

export default function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const [language, setLanguage] = useState<LanguageOption>(LANGUAGES[0]);
  const [country, setCountry] = useState<CountryOption>(COUNTRIES.find((option) => option.code === 'UG') ?? COUNTRIES[0]);
  const [activePicker, setActivePicker] = useState<PickerType>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const pickerTitle = activePicker === 'language' ? 'Select Language' : 'Select Country';
  const normalizedSearch = pickerSearch.trim().toLowerCase();
  const filteredLanguages = LANGUAGES.filter((option) =>
    `${option.label} ${option.code}`.toLowerCase().includes(normalizedSearch),
  );
  const filteredCountries = COUNTRIES.filter((option) =>
    `${option.label} ${option.code} ${option.dialCode}`.toLowerCase().includes(normalizedSearch),
  );

  const saveAndContinue = async () => {
    if (saving) return;
    setSaving(true);
    setErrorMessage('');

    try {
      const preferences = {
        lang: language.code,
        country: country.code,
        countryName: country.label,
        dialCode: country.dialCode,
      };

      // Step 1: Save the country and language preferences.
      try {
        await AsyncStorage.setItem(
          PREFERENCES_STORAGE_KEY,
          JSON.stringify(preferences),
        );
      } catch (error) {
        console.error('[Onboarding] AsyncStorage.setItem failed:', error);
        setErrorMessage('Could not save your country and language preferences. Please try again.');
        return;
      }

      // Step 2: Change the selected app language.
      try {
        await changeAppLanguage(language.code);
      } catch (error) {
        console.error('[Onboarding] changeAppLanguage failed:', error);
        setErrorMessage('Preferences were saved, but changing the language failed. Please try again.');
        return;
      }

      // Step 3: Continue only after both operations succeed.
      navigation.navigate('Welcome');
    } catch (error) {
      console.error('[Onboarding] Unexpected Get Started error:', error);
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const selectLanguage = (option: LanguageOption) => {
    setLanguage(option);
    setPickerSearch('');
    setActivePicker(null);
  };

  const selectCountry = (option: CountryOption) => {
    setCountry(option);
    setPickerSearch('');
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
          <Text style={styles.label}>A. Choose Country</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Selected country: ${country.label}. Tap to change country.`}
            style={styles.dropdown}
            onPress={() => { setPickerSearch(''); setActivePicker('country'); }}
            activeOpacity={0.8}
          >
            <Text style={styles.dropdownValue} numberOfLines={1}>
              {country.label}{country.dialCode ? ` (${country.dialCode})` : ''}
            </Text>
            <Text style={styles.dropdownArrow}>▾</Text>
          </TouchableOpacity>

          <Text style={[styles.label, styles.countryLabel]}>B. Choose Language</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Selected language: ${language.label}. Tap to change language.`}
            style={styles.dropdown}
            onPress={() => { setPickerSearch(''); setActivePicker('language'); }}
            activeOpacity={0.8}
          >
            <Text style={styles.dropdownValue}>{language.label}</Text>
            <Text style={styles.dropdownArrow}>▾</Text>
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
        onRequestClose={() => { setPickerSearch(''); setActivePicker(null); }}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => { setPickerSearch(''); setActivePicker(null); }}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>{pickerTitle}</Text>
            <TextInput
              value={pickerSearch}
              onChangeText={setPickerSearch}
              style={styles.modalSearch}
              placeholder={activePicker === 'language' ? 'Search the 6 supported languages' : 'Search countries worldwide'}
              placeholderTextColor="#7B8794"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel={activePicker === 'language' ? 'Search languages' : 'Search countries'}
            />
            <ScrollView style={styles.optionsList} keyboardShouldPersistTaps="handled">
              {activePicker === 'language'
                ? filteredLanguages.map((option) => (
                    <TouchableOpacity
                      key={option.code}
                      style={styles.optionRow}
                      onPress={() => selectLanguage(option)}
                    >
                      <Text style={styles.optionText}>{option.label}</Text>
                      {language.code === option.code && <Text style={styles.selectedMark}>✓</Text>}
                    </TouchableOpacity>
                  ))
                : filteredCountries.map((option) => (
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
              {(activePicker === 'language' ? filteredLanguages.length : filteredCountries.length) === 0 && (
                <Text style={styles.noResultsText}>No matches found. Try another search.</Text>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => { setPickerSearch(''); setActivePicker(null); }}
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
    fontSize: 12,
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
  modalSearch: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#D9E2E7',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#34495E',
    fontSize: 16,
    marginBottom: 8,
  },
  optionsList: {
    flexGrow: 0,
  },
  noResultsText: {
    color: '#6B7280',
    fontSize: 14,
    paddingVertical: 18,
    textAlign: 'center',
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
