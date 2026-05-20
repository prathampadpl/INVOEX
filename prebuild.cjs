const fs = require('fs');
const path = require('path');

// Load .env file for local development (Vercel injects vars automatically)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const configPath = path.join(__dirname, 'firebase-applet-config.json');

// Firebase client config: these values are public identifiers (not secrets).
// Security is enforced by Firestore rules and Firebase Auth, not by keeping these hidden.
// Override via VITE_FIREBASE_* env vars in Vercel / production environments.
const config = {
  projectId:        process.env.VITE_FIREBASE_PROJECT_ID       || process.env.FIREBASE_PROJECT_ID       || 'studio-2901235520-386ed',
  appId:            process.env.VITE_FIREBASE_APP_ID           || process.env.FIREBASE_APP_ID           || '1:741422024795:web:fee8a0d5d1ee04f9d8577e',
  apiKey:           process.env.VITE_FIREBASE_API_KEY          || process.env.FIREBASE_API_KEY          || 'AIzaSyABVbbCPK9A507FTM-mNVTh7L3v_dUXjck',
  authDomain:       process.env.VITE_FIREBASE_AUTH_DOMAIN      || process.env.FIREBASE_AUTH_DOMAIN      || 'studio-2901235520-386ed.firebaseapp.com',
  storageBucket:    process.env.VITE_FIREBASE_STORAGE_BUCKET   || process.env.FIREBASE_STORAGE_BUCKET   || 'studio-2901235520-386ed.firebasestorage.app',
  messagingSenderId:process.env.VITE_FIREBASE_MESSAGING_SENDER_ID                                       || '741422024795',
  firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID  || process.env.FIREBASE_DATABASE_ID      || '(default)',
};

// Always overwrite so stale values never persist across deployments
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Generated firebase-applet-config.json successfully.');
