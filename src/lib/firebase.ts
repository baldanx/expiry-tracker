import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyC2po-oBYxK_0G8lBIOHjOcbX2tZinr6ok",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "expiry-tracker-11a34.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "expiry-tracker-11a34",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "expiry-tracker-11a34.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "848759895634",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:848759895634:web:8b448c875945c7f268918b",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-615CNV00NJ"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
