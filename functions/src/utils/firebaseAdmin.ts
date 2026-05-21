import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin SDK once — Cloud Functions provides ADC automatically
if (!getApps().length) {
  initializeApp();
}

export const db = getFirestore();
export const auth = getAuth();
// FIX: Explicit bucket name prevents mismatch with new-style Firebase Storage domains
export const bucket = getStorage().bucket('gen-lang-client-00224039-a9ae1.firebasestorage.app');
