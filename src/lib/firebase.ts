import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export let app: any = null;
export let db: any = null;
export let auth: any = null;
export let storage: any = null;
export let initError: string | null = null;

try {
  app = initializeApp(firebaseConfig);
  
  const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

  db = databaseId
    ? initializeFirestore(app, { experimentalForceLongPolling: true }, databaseId)
    : initializeFirestore(app, { experimentalForceLongPolling: true });
    
  auth = getAuth(app);
  storage = getStorage(app);
} catch (e: any) {
  console.error("Firebase initialization failed:", e);
  initError = e?.message || String(e);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  
  // Log full details for debugging (will appear in browser console, but not leaked to users via UI strings)
  console.error('[Firestore technical details]:', errInfo, error);
  
  // Throw generic message to be caught by UI handlers (like toasts)
  throw new Error('An unexpected database error occurred. Please try again later.');
}
