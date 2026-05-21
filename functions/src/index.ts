import { onRequest } from "firebase-functions/v2/https";
/**
 * INVOEX v2.0 — Firebase Cloud Functions
 * Senior Serverless Architecture — No Express, No persistent servers.
 *
 * Four functions:
 *   1. runExtractionPipeline  — Firestore onCreate trigger
 *   2. cashfreeWebhookHandler — HTTPS webhook (Cashfree payments)
 *   3. deleteExpiredFiles     — Pub/Sub scheduled cron (every 24h)
 *   4. getCorrectionStats     — Callable (admin analytics)
 */

// ─── Re-exports: existing HTTP handlers ─────────────────────────────────────
export { extract }    from './handlers/extract';
export { onboarding } from './handlers/onboarding';
export { serveFile }  from './handlers/fileServe';

// ─── Four PRD-specified functions ────────────────────────────────────────────
export {
  runExtractionPipeline as invoiceProcessorV3,
  cashfreeWebhookHandler,
  deleteExpiredFiles,
  getCorrectionStats,
} from './core';
export const testTrigger = onRequest({ region: "us-central1", timeoutSeconds: 120 }, async (req, res) => {
  const { runPipeline } = require("./pipeline/router");
  res.send("Pipeline imported successfully.");
});  