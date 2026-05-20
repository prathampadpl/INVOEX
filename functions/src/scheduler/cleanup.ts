import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, bucket } from '../utils/firebaseAdmin';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Daily Cleanup Scheduled Function (2am IST = 20:30 UTC)
 * Deletes invoice files from Firebase Storage that are older than 30 days.
 * The Firestore extracted data is preserved permanently.
 */
export const dailyCleanup = onSchedule(
  {
    schedule: '30 20 * * *', // 02:00 IST daily
    timeZone: 'Asia/Kolkata',
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    console.log('[Cleanup] Starting 30-day file cleanup...');

    const cutoff = Date.now() - THIRTY_DAYS_MS;
    let deletedCount = 0;
    let errorCount = 0;

    try {
      // Query all fileMetadata docs older than 30 days
      const oldFilesSnap = await db.collection('fileMetadata')
        .where('createdAt', '<', cutoff)
        .limit(500) // process in batches of 500
        .get();

      console.log(`[Cleanup] Found ${oldFilesSnap.size} files older than 30 days`);

      const batch = db.batch();

      for (const fileDoc of oldFilesSnap.docs) {
        const data = fileDoc.data();
        const storagePath = data.storagePath;

        if (storagePath) {
          try {
            const file = bucket.file(storagePath);
            const [exists] = await file.exists();
            if (exists) {
              await file.delete();
              console.log(`[Cleanup] Deleted storage file: ${storagePath}`);
            }
            deletedCount++;
          } catch (e) {
            console.error(`[Cleanup] Failed to delete storage file ${storagePath}:`, e);
            errorCount++;
          }
        }

        // Delete the fileMetadata Firestore doc (Firestore extracted data is kept)
        batch.delete(fileDoc.ref);
      }

      await batch.commit();
      console.log(`[Cleanup] Complete. Deleted: ${deletedCount}, Errors: ${errorCount}`);
    } catch (err) {
      console.error('[Cleanup] Fatal error:', err);
    }
  }
);
