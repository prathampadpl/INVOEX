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
  projectId:        'gen-lang-client-00224039-a9ae1',
  appId:            '1:480987045009:web:4476832e5b3856514e3330',
  apiKey:           'AIzaSyAJimW_Ys2uKl0XU1kW5PA-WbQf6nQ5Ghg',
  authDomain:       'gen-lang-client-00224039-a9ae1.firebaseapp.com',
  storageBucket:    'gen-lang-client-00224039-a9ae1.firebasestorage.app',
  messagingSenderId:'480987045009',
  firestoreDatabaseId: '(default)',
};

// Always overwrite so stale values never persist across deployments
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Generated firebase-applet-config.json successfully.');
