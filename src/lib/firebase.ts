import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyC2po-oBYxK_0G8lBIOHjOcbX2tZinr6ok",
  authDomain: "expiry-tracker-11a34.firebaseapp.com",
  projectId: "expiry-tracker-11a34",
  storageBucket: "expiry-tracker-11a34.firebasestorage.app",
  messagingSenderId: "848759895634",
  appId: "1:848759895634:web:8b448c875945c7f268918b",
  measurementId: "G-615CNV00NJ"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
