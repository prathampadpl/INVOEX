import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

import fs from 'fs';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  // The build script should NOT overwrite firebase-applet-config.json.
  // We use the file checked into version control instead.

  return {
    envPrefix: ['VITE_', 'GEMINI_', 'OPENROUTER_'],
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
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
            'react': ['react', 'react-dom', 'react-router-dom'],
            'vendor': ['lucide-react', 'pdf-lib']
          }
        }
      }
    }
  };
});
