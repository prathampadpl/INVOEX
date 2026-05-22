import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const dailyCleanup = onSchedule(
  {
    schedule: '0 2 * * *', // 02:00 AM daily
    timeZone: 'Asia/Kolkata',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    console.log(`[Cleanup] Starting 30-day file purge. Cutoff: ${new Date(cutoff).toISOString()}`);

    const workspacesSnap = await db.collection('workspaces').get();
    
    let deletedCount = 0;
    const bucket = getStorage().bucket();

    for (const wsDoc of workspacesSnap.docs) {
      const workspaceId = wsDoc.id;
      const invoicesSnap = await db.collection(`workspaces/${workspaceId}/invoices`)
        .where('createdAt', '<', cutoff)
        .get();

      for (const invoiceDoc of invoicesSnap.docs) {
        const data = invoiceDoc.data();
        if (data.storagePath) {
          try {
            const file = bucket.file(data.storagePath);
            const [exists] = await file.exists();
            if (exists) {
              await file.delete();
              deletedCount++;
            }
          } catch (err) {
            console.error(`[Cleanup] Failed to delete ${data.storagePath}:`, err);
          }
          // Remove the storagePath to signify it has been cleaned up, but keep extraction data
          await invoiceDoc.ref.update({ storagePath: null, fileUrl: null });
        }
      }
    }

    console.log(`[Cleanup] Complete. Deleted ${deletedCount} files.`);
  }
);
