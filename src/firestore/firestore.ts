import { initializeApp, getApp, getApps } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
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

const getReactNativePersistence = (
  FirebaseAuth as unknown as {
    getReactNativePersistence: (
      storage: typeof AsyncStorage
    ) => import('firebase/auth').Persistence;
  }
).getReactNativePersistence;

let auth: FirebaseAuth.Auth;

try {
  auth = FirebaseAuth.initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // Reuse Auth if it has already been initialized.
  auth = FirebaseAuth.getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };
