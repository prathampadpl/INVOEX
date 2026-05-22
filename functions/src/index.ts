import { initializeApp } from 'firebase-admin/app';
initializeApp();

// Export the storage trigger
export { onInvoiceUpload } from './triggers/onInvoiceUpload';

// Export the cashfree webhook
export { cashfreeWebhookHandler } from './http/cashfreeWebhook';

// Export the cron job
export { dailyCleanup } from './cron/dailyCleanup';
