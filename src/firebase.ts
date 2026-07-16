import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCl_frFBuiwUsOS5R8CiSPFmVcosboSJ0Y',
  authDomain: 'farm-management-1.firebaseapp.com',
  projectId: 'farm-management-1',
  storageBucket: 'farm-management-1.firebasestorage.app',
  messagingSenderId: '376610563269',
  appId: '1:376610563269:web:8861e1f918bec844debcac',
  measurementId: 'G-VTTKMKN23B',
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
