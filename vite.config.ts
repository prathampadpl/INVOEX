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
      projectId: env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "studio-2901235520-386ed",
      appId: env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "1:741422024795:web:fee8a0d5d1ee04f9d8577e",
      apiKey: env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "AIzaSyABVbbCPK9A507FTM-mNVTh7L3v_dUXjck",
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "studio-2901235520-386ed.firebaseapp.com",
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || "studio-2901235520-386ed.firebasestorage.app",
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "741422024795",
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
