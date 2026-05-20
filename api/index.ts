// Vercel Serverless Function entry point
// Imports the compiled Express app from server.ts (built to dist/server.cjs)

let app: any;

try {
  // server.ts is compiled to dist/server.cjs by the build step
  // Use require() for CJS compatibility — top-level await is not reliable in all Vercel runtimes
  const module = require('../dist/server.cjs');
  app = module.default || module;
} catch (err: any) {
  console.error("Vercel startup crash:", err);
  const express = require('express');
  const fallbackApp = express();
  fallbackApp.use(express.json());
  fallbackApp.all('*', (req: any, res: any) => {
    res.status(500).json({
      error: "Vercel serverless function crashed on startup",
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  });
  app = fallbackApp;
}

export default app;
