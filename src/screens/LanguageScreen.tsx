import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  changeAppLanguage,
  supportedLanguages,
  AppLanguage,
} from '../translations/i18n';

import i18n from '../translations/i18n';

const languageFlags: Record<AppLanguage, string> = {
  en: '🇬🇧',
  nyn: '🌍',
  lg: '🌍',
  sw: '🇺🇬',
  fr: '🇫🇷',
  rw: '🇷🇼',
};

export default function LanguageScreen({
  navigation,
}: {
  navigation: any;
}) {
  const [selectedLanguage, setSelectedLanguage] =
    useState<AppLanguage>(
      (i18n.language as AppLanguage) || 'en',
    );

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const currentLanguage = supportedLanguages.find(
      (language) => language.code === i18n.language,
    );

    if (currentLanguage) {
      setSelectedLanguage(currentLanguage.code);
    }
  }, []);

  async function selectLanguage(language: AppLanguage) {
    if (saving || language === selectedLanguage) {
      return;
    }

    // Highlight the selected language immediately.
    const previousLanguage = selectedLanguage;
    setSelectedLanguage(language);
    setSaving(true);

    try {
      await changeAppLanguage(language);

      Alert.alert(
        'Language saved',
        `${
          supportedLanguages.find(
            (item) => item.code === language,
          )?.name
        } selected successfully.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error) {
      // Restore the previous selection if saving fails.
      setSelectedLanguage(previousLanguage);

      Alert.alert(
        'Could not save language',
        'Please check your storage setup and try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Ebadsave VSLA</Text>
        <Text style={styles.subtitle}>
          Save together, grow together
        </Text>
      </View>

      <Text style={styles.heading}>Choose Your Language</Text>

      <Text style={styles.description}>
        Tap a language to select it.
      </Text>

      {supportedLanguages.map((language) => {
        const isSelected =
          selectedLanguage === language.code;

        return (
          <Pressable
            key={language.code}
            style={({ pressed }) => [
              styles.languageCard,
              isSelected && styles.selectedCard,
              pressed && styles.pressedCard,
            ]}
            onPress={() => selectLanguage(language.code)}
            disabled={saving}
            accessibilityRole="radio"
            accessibilityState={{
              selected: isSelected,
              disabled: saving,
            }}
          >
            <Text style={styles.flag}>
              {languageFlags[language.code]}
            </Text>

            <Text
              style={[
                styles.languageName,
                isSelected && styles.selectedName,
              ]}
            >
              {language.name}
            </Text>

            <View
              style={[
                styles.radio,
                isSelected && styles.radioSelected,
              ]}
            >
              {isSelected && <View style={styles.radioDot} />}
            </View>
          </Pressable>
        );
      })}

      {saving && (
        <View style={styles.savingRow}>
          <ActivityIndicator color="#16a34a" size="small" />
          <Text style={styles.savingText}>
            Saving language...
          </Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.backButton,
          pressed && styles.pressedCard,
        ]}
        onPress={() => navigation.goBack()}
        disabled={saving}
      >
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    backgroundColor: '#16a34a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 28,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: '#ffffff',
    fontSize: 13,
    marginTop: 6,
  },
  heading: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  description: {
    color: '#64748b',
    fontSize: 14,
    marginBottom: 20,
  },
  languageCard: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 15,
    marginBottom: 12,
  },
  selectedCard: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  pressedCard: {
    opacity: 0.75,
  },
  flag: {
    fontSize: 25,
    marginRight: 14,
  },
  languageName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  selectedName: {
    color: '#166534',
    fontWeight: '800',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#16a34a',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#16a34a',
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  savingText: {
    marginLeft: 8,
    color: '#166534',
    fontSize: 13,
  },
  backButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  backText: {
    color: '#166534',
    fontSize: 16,
    fontWeight: '700',
  },
});
