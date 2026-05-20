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

const config = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || '(default)',
};

const required = ['projectId', 'appId', 'apiKey', 'authDomain', 'storageBucket', 'messagingSenderId'];
for (const key of required) {
  if (!config[key]) {
    throw new Error(
      `[prebuild] Missing required Firebase config: ${key}. ` +
      `Ensure VITE_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()} is set in your environment variables or .env file.`
    );
  }
}

// Always overwrite so stale values never persist across deployments
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Generated firebase-applet-config.json successfully.');
