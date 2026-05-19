const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'firebase-applet-config.json');

if (!fs.existsSync(configPath)) {
  console.log('firebase-applet-config.json not found. Generating from environment variables...');
  const config = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "studio-2901235520-386ed",
    appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "1:741422024795:web:fee8a0d5d1ee04f9d8577e",
    apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "AIzaSyABVbbCPK9A507FTM-mNVTh7L3v_dUXjck",
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || "studio-2901235520-386ed.firebaseapp.com",
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || "studio-2901235520-386ed.firebasestorage.app",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "741422024795",
    firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || "(default)"
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('Generated firebase-applet-config.json successfully.');
} else {
  console.log('firebase-applet-config.json already exists.');
}
