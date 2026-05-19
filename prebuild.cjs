const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'firebase-applet-config.json');

if (!fs.existsSync(configPath)) {
  console.log('firebase-applet-config.json not found. Generating from environment variables...');
  const config = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "gen-lang-client-00224039-a9ae1",
    appId: process.env.VITE_FIREBASE_APP_ID || "",
    apiKey: process.env.VITE_FIREBASE_API_KEY || "",
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || `${process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-00224039-a9ae1"}.firebaseapp.com`,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || `${process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-00224039-a9ae1"}.firebasestorage.app`,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || "(default)"
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('Generated firebase-applet-config.json successfully.');
} else {
  console.log('firebase-applet-config.json already exists.');
}
