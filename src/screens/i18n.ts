import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './en';
import nyn from './nyn';
import lg from './lg';
import sw from './sw';
import fr from './fr';
import rw from './rw';

const LANGUAGE_STORAGE_KEY = '@ebadsave_vsla_language';

export const supportedLanguages = [
  { code: 'en', name: 'English' },
  { code: 'nyn', name: 'Runyankore' },
  { code: 'lg', name: 'Luganda' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'fr', name: 'Français' },
  { code: 'rw', name: 'Kinyarwanda' },
] as const;

export type AppLanguage =
  (typeof supportedLanguages)[number]['code'];

const resources = {
  en: { translation: en },
  nyn: { translation: nyn },
  lg: { translation: lg },
  sw: { translation: sw },
  fr: { translation: fr },
  rw: { translation: rw },
};

export async function initializeI18n(): Promise<void> {
  let initialLanguage: AppLanguage = 'en';

  try {
    const savedLanguage = await AsyncStorage.getItem(
      LANGUAGE_STORAGE_KEY,
    );

    if (
      savedLanguage &&
      supportedLanguages.some(
        (language) => language.code === savedLanguage,
      )
    ) {
      initialLanguage = savedLanguage as AppLanguage;
    }
  } catch (error) {
    console.warn('Could not load saved language:', error);
  }

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources,
      lng: initialLanguage,
      fallbackLng: 'en',
      supportedLngs: ['en', 'nyn', 'lg', 'sw', 'fr', 'rw'],
      interpolation: {
        escapeValue: false,
      },
    });
  } else {
    await i18n.changeLanguage(initialLanguage);
  }
}

export async function changeAppLanguage(
  language: AppLanguage,
): Promise<void> {
  await i18n.changeLanguage(language);

  try {
    await AsyncStorage.setItem(
      LANGUAGE_STORAGE_KEY,
      language,
    );
  } catch (error) {
    console.warn('Could not save selected language:', error);
    throw error;
  }
}

export default i18n;
