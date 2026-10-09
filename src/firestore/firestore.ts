import { initializeApp, getApp, getApps } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import {
  getReactNativePersistence,
} from 'firebase/auth/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDrk67oB4evnXQZzaIrUDtVAnztwnMOI8c',
  authDomain: 'onesandfourhole.firebaseapp.com',
  projectId: 'onesandfourhole',
  storageBucket: 'onesandfourhole.firebasestorage.app',
  messagingSenderId: '664954049701',
  appId: '1:664954049701:web:6d806bfbf2cf3fba59a94c',
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

let auth: Auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // Reuse Auth if it was already initialized.
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };
