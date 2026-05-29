import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const dailyCleanup = onSchedule(
  {
    schedule: '0 0 * * *',
    region: 'us-east1',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    console.log(`[Cleanup] Starting plan-aware file purge.`);

    const workspacesSnap = await db.collection('workspaces').get();
    
    let deletedCount = 0;
    const bucket = getStorage().bucket();

    for (const wsDoc of workspacesSnap.docs) {
      const workspaceId = wsDoc.id;
      const workspaceData = wsDoc.data();
      let retentionMs = THIRTY_DAYS_MS; // default to 30 days

      if (workspaceData.ownerId) {
        const ownerSnap = await db.collection('users').doc(workspaceData.ownerId).get();
        if (ownerSnap.exists) {
          const plan = ownerSnap.data()?.plan || 'free';
          if (plan === 'pro') {
            retentionMs = ONE_YEAR_MS;
          } else if (plan === 'enterprise') {
            continue; // Infinite retention
          }
        }
      }

      const cutoff = Date.now() - retentionMs;
      
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
