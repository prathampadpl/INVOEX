import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

import fs from 'fs';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  
  // Auto-generate firebase-applet-config.json if not present
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    const config = {
      projectId: env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "gen-lang-client-00224039-a9ae1",
      appId: env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "1:480987045009:web:4476832e5b3856514e3330",
      apiKey: env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "AIzaSyAJimW_Ys2uKl0XU1kW5PA-WbQf6nQ5Ghg",
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "gen-lang-client-00224039-a9ae1.firebaseapp.com",
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || "gen-lang-client-00224039-a9ae1.firebasestorage.app",
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || "480987045009",
      firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || "(default)"
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR === 'true' ? false : { clientPort: 443 },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
