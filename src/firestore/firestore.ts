import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
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

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
