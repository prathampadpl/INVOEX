/**
 * INVOEX v2.0 — extract HTTP Handler (FIXED)
 * ============================================
 * FIX #8: extract handler now does ONLY:
 *   1. Auth verification
 *   2. Multipart file parsing
 *   3. File type validation
 *   4. Upload to Firebase Storage
 *   5. Create Firestore doc (status: 'Extracting')
 *   6. Return { invoiceId, orgId } immediately
 *
 * The Firestore onCreate trigger (runExtractionPipeline in core.ts)
 * then fires and runs the actual 3-layer OCR pipeline.
 * This eliminates the double-pipeline execution bug.
 *
 * FIX #9: cors: true added
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as path from 'path';
import * as crypto from 'crypto';
import { auth, db, bucket } from '../utils/firebaseAdmin';
import { checkOrgMembership } from '../utils/validation';
import Busboy from 'busboy';

export const extract = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,   // Reduced: just upload + Firestore write, no pipeline
    memory: '512MiB',
    cors: true,
    invoker: 'public',
  },
  async (req, res) => {
    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Verify Firebase Auth token
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
    if (!token) { res.status(401).json({ error: 'Unauthorized. Missing token.' }); return; }

    let user: any;
    try {
      user = await auth.verifyIdToken(token);
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Parse multipart form data
    const parseMultipart = (): Promise<{ file: Buffer; mimetype: string; originalname: string; orgId: string }> => {
      return new Promise((resolve, reject) => {
        const bb = Busboy({
          headers: req.headers,
          limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per PRD §3.1
        });

        let fileBuffer: Buffer | null = null;
        let fileMimetype = '';
        let fileOriginalname = '';
        let orgId = '';
        const chunks: Buffer[] = [];

        bb.on('field', (name, value) => {
          if (name === 'orgId') orgId = value;
        });

        bb.on('file', (_fieldname, stream, info) => {
          fileMimetype = info.mimeType;
          fileOriginalname = info.filename;
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
          stream.on('limit', () => reject(new Error('FILE_TOO_LARGE')));
        });

        bb.on('finish', () => {
          if (!fileBuffer || !orgId) {
            reject(new Error(fileBuffer ? 'Missing orgId' : 'No file uploaded'));
          } else {
            resolve({ file: fileBuffer, mimetype: fileMimetype, originalname: fileOriginalname, orgId });
          }
        });

        bb.on('error', reject);

        if (Buffer.isBuffer((req as any).rawBody)) {
          bb.write((req as any).rawBody);
          bb.end();
        } else {
          (req as any).pipe(bb);
        }
      });
    };

    let fileData: { file: Buffer; mimetype: string; originalname: string; orgId: string };
    try {
      fileData = await parseMultipart();
    } catch (err: any) {
      const msg = err.message === 'FILE_TOO_LARGE' ? 'File exceeds 10MB limit' :
        err.message || 'Failed to parse upload';
      res.status(400).json({ error: msg });
      return;
    }

    const { file: buffer, mimetype, originalname, orgId } = fileData;

    // Verify org membership
    const isMember = await checkOrgMembership(user.uid, orgId);
    if (!isMember) {
      res.status(403).json({ error: 'Unauthorized org access' });
      return;
    }

    // Validate file type via magic bytes
    let isValidType = false;
    try {
      const fileTypeModule = await import('file-type');
      const fromBuffer = (fileTypeModule as any).fromBuffer || (fileTypeModule.default as any)?.fromBuffer;
      const detected = fromBuffer ? await fromBuffer(buffer) : null;
      const ext = path.extname(originalname).toLowerCase();

      if (ext === '.txt') {
        isValidType = true;
      } else if (ext === '.docx') {
        isValidType = !!(detected && (detected.mime === 'application/zip' || detected.mime.includes('wordprocessing')));
      } else {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
        isValidType = !!(detected && allowed.includes(detected.mime));
      }
    } catch (e) {
      console.warn('[Extract] file-type check failed:', e);
      isValidType = true; // allow if check fails gracefully
    }

    if (!isValidType) {
      res.status(400).json({ error: 'Unsupported file format. Only PDF, images (JPG/PNG/WEBP/HEIC), TXT, and DOCX allowed.' });
      return;
    }

    // Upload to Firebase Storage
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = path.extname(originalname).toLowerCase() || '.bin';
    const storedFilename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    const storagePath = `invoices/${orgId}/${storedFilename}`;

    try {
      const fileRef = bucket.file(storagePath);
      await fileRef.save(buffer, {
        metadata: {
          contentType: mimetype,
          metadata: { orgId, uploadedBy: user.uid, originalName: originalname }
        }
      });
    } catch (storageErr) {
      console.error('[Extract] Storage upload failed:', storageErr);
      res.status(500).json({ error: 'File storage failed' });
      return;
    }

    // Create the Firestore invoice doc — this triggers runExtractionPipeline
    const invoiceRef = db.collection(`organizations/${orgId}/invoices`).doc();
    const invoiceId = invoiceRef.id;

    await invoiceRef.set({
      orgId,
      status: 'Extracting',
      fileName: originalname,
      fileType: mimetype,
      mimetype,                   // for runExtractionPipeline to use
      storagePath,                // key field for the pipeline trigger
      fileUrl: `/api/files/${storedFilename}`,
      fileHash,
      uploadedBy: user.uid,
      uploadedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Store file metadata for signed URL generation
    await db.doc(`fileMetadata/${storedFilename}`).set({
      orgId,
      uploadedBy: user.uid,
      originalName: originalname,
      storagePath,
      fileHash,
      createdAt: Date.now(),
    });

    console.log(`[Extract] Created invoice ${invoiceId}, pipeline triggered by Firestore onCreate.`);

    // Return the invoice ID — frontend polls Firestore for status updates
    res.json({
      invoiceId,
      orgId,
      status: 'Extracting',
      fileName: originalname,
      fileUrl: `/api/files/${storedFilename}`,
      message: 'File uploaded. AI extraction in progress...',
    });
  }
);
