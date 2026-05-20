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
  runExtractionPipeline,
  cashfreeWebhookHandler,
  deleteExpiredFiles,
  getCorrectionStats,
} from './core';
