const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'firebase-applet-config.json');

if (!process.env.VITE_FIREBASE_API_KEY) {
  throw new Error('VITE_FIREBASE_API_KEY is missing');
}

if (!fs.existsSync(configPath)) {
  console.log('firebase-applet-config.json not found. Generating from environment variables...');
  const config = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
    appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
    apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('Generated firebase-applet-config.json successfully.');
} else {
  console.log('firebase-applet-config.json already exists.');
}
