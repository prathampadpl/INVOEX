import { onRequest } from 'firebase-functions/v2/https';
import { auth, bucket, db } from '../utils/firebaseAdmin';
import { checkOrgMembership } from '../utils/validation';

/**
 * GET /api/files/:filename
 * Generates a short-lived Firebase Storage signed URL for the requested file.
 * Validates org membership before granting access.
 */
export const serveFile = onRequest(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB' },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Verify Firebase Auth token
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
    if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }

    let user: any;
    try {
      user = await auth.verifyIdToken(token);
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Extract filename from URL path (last segment)
    const urlParts = req.path.split('/').filter(Boolean);
    const filename = urlParts[urlParts.length - 1];

    if (!filename || filename === '.' || filename === '..') {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }

    try {
      // Look up file metadata to verify ownership
      const metaDoc = await db.doc(`fileMetadata/${filename}`).get();
      if (!metaDoc.exists) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const meta = metaDoc.data()!;
      if (!meta.orgId) {
        res.status(403).json({ error: 'Invalid file metadata' });
        return;
      }

      // Verify org membership
      const isMember = await checkOrgMembership(user.uid, meta.orgId);
      if (!isMember) {
        console.warn(`[Auth] User ${user.uid} attempted to access ${filename} without org membership`);
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Generate a 1-hour signed URL from Firebase Storage
      const storagePath = meta.storagePath || `invoices/${meta.orgId}/${filename}`;
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        res.status(404).json({ error: 'File not found in storage' });
        return;
      }

      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
        responseDisposition: `attachment; filename="${meta.originalName || filename}"`,
      });

      // Redirect to signed URL
      res.redirect(302, signedUrl);
    } catch (err) {
      console.error('[FileServe] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);
