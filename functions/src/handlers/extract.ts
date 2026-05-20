import { onRequest } from 'firebase-functions/v2/https';
import * as path from 'path';
import * as crypto from 'crypto';
import { auth, db, bucket } from '../utils/firebaseAdmin';
import { checkOrgMembership } from '../utils/validation';
import { runPipeline } from '../pipeline/router';
import Busboy from 'busboy';

/**
 * POST /api/extract
 * Accepts multipart file upload, runs the 3-layer OCR pipeline,
 * stores the file in Firebase Storage, and returns extracted invoice data.
 *
 * Replaces the Express /api/extract route in server.ts.
 */
export const extract = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 540, // max timeout for Pro model + large PDFs
    memory: '2GiB',
    invoker: 'public',
  },
  async (req, res) => {
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

    // Parse multipart form data with busboy
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

        // Cloud Functions v2 gives us req as a raw IncomingMessage
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
      res.status(400).json({ error: 'Unsupported or invalid file format. Only PDF, images (JPG/PNG/WEBP/HEIC), TXT, and DOCX are allowed.' });
      return;
    }

    // Deduplicate by file hash
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Upload to Firebase Storage
    const ext = path.extname(originalname).toLowerCase() || '.bin';
    const storedFilename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    const storagePath = `invoices/${orgId}/${storedFilename}`;

    try {
      const fileRef = bucket.file(storagePath);
      await fileRef.save(buffer, {
        metadata: { contentType: mimetype, metadata: { orgId, uploadedBy: user.uid, originalName: originalname } }
      });

      // Store file metadata in Firestore
      await db.doc(`fileMetadata/${storedFilename}`).set({
        orgId,
        uploadedBy: user.uid,
        originalName: originalname,
        storagePath,
        fileHash,
        createdAt: Date.now(),
      });
    } catch (storageErr) {
      console.error('[Extract] Storage upload failed:', storageErr);
      res.status(500).json({ error: 'File storage failed' });
      return;
    }

    // Run the 3-layer pipeline
    let pipelineResult;
    try {
      pipelineResult = await runPipeline({
        buffer,
        mimetype,
        originalname,
        orgId,
        uid: user.uid,
      });
    } catch (pipelineErr) {
      console.error('[Extract] Pipeline error:', pipelineErr);
      res.status(500).json({ error: 'Extraction pipeline failed' });
      return;
    }

    const { invoices, extractionLayer, usedModel } = pipelineResult;

    // Enrich each invoice with metadata
    const enriched = invoices.map((inv: any) => ({
      ...inv,
      orgId,
      uploadedBy: user.uid,
      uploadedAt: Date.now(),
      extractionLayer,
      modelVariant: usedModel, // backward compat
      fileUrl: `/api/files/${storedFilename}`,
      fileName: originalname,
      status: (inv.validationErrors?.length > 0) ? 'Ready for Review' : 'Approved',
    }));

    res.json(enriched);
  }
);
