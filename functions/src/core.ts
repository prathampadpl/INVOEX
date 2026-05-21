/**
 * INVOEX v2.0 — Core Serverless Functions (PRD-specified)
 * =========================================================
 * Strict architecture: NO Express, NO persistent servers.
 * Uses Firebase Cloud Functions v2 APIs throughout.
 *
 * Functions implemented:
 *   1. runExtractionPipeline  — Firestore onCreate trigger (3-layer OCR cascade)
 *   2. cashfreeWebhookHandler — HTTPS endpoint (Cashfree subscription webhooks)
 *   3. deleteExpiredFiles     — Pub/Sub scheduled cron (30-day file lifecycle)
 *   4. getCorrectionStats     — onCall callable (admin analytics dashboard)
 */

import { onDocumentCreated }   from 'firebase-functions/v2/firestore';
import { onRequest }            from 'firebase-functions/v2/https';
import { onSchedule }           from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError }   from 'firebase-functions/v2/https';
import * as crypto              from 'crypto';
import { FieldValue }           from 'firebase-admin/firestore';

import { db, auth, bucket }     from './utils/firebaseAdmin';
import { runPipeline }          from './pipeline/router';

// ─── Constants ───────────────────────────────────────────────────────────────

const INVOICE_QUOTA = 500;          // Free-tier monthly invoice limit
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// 1. runExtractionPipeline — Firestore onCreate Trigger
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Triggers when a new invoice document is created in:
 *   organizations/{orgId}/invoices/{invoiceId}
 *
 * Flow:
 *   a) Quota guard: reject if user >= 500 invoices (free tier)
 *   b) Load raw file buffer from Firebase Storage
 *   c) Run the 3-layer cascading OCR pipeline
 *   d) Write extractedData + confidenceScores + layerUsed back to Firestore
 */
export const runExtractionPipeline = onDocumentCreated(
  {
    document:      'organizations/{orgId}/invoices/{invoiceId}',
    region:        'us-central1',
    timeoutSeconds: 540,
    memory:        '2GiB',
    secrets:       ['GEMINI_API_KEY'],
  },
  async (event) => {
    const { orgId, invoiceId } = event.params;
    const snap = event.data;

    if (!snap) {
      console.warn(`[Pipeline] No snapshot data for ${invoiceId}`);
      return;
    }

    const invoice = snap.data();
    const invoiceRef = snap.ref;

    // ── a) Quota guard via Firestore Transaction ─────────────────────────────
    const uploadedBy: string = invoice.uploadedBy || '';
    if (uploadedBy) {
      const userRef = db.doc(`users/${uploadedBy}`);
      try {
        await db.runTransaction(async (txn) => {
          const userDoc = await txn.get(userRef);
          const current = (userDoc.data()?.invoiceCount as number) || 0;

          if (current >= INVOICE_QUOTA) {
            throw new Error(`QUOTA_EXCEEDED:${uploadedBy}`);
          }

          // Atomically increment count
          txn.update(userRef, { invoiceCount: FieldValue.increment(1) });
        });
      } catch (err: any) {
        if (err.message?.startsWith('QUOTA_EXCEEDED')) {
          console.warn(`[Pipeline] Quota exceeded for user ${uploadedBy}. Aborting.`);
          await invoiceRef.update({
            status:       'Failed',
            errorDetails: 'Monthly invoice quota (500) reached. Please upgrade your plan.',
            updatedAt:    Date.now(),
          });
          return;
        }
        throw err; // Rethrow unexpected errors
      }
    }

    // Mark as extracting
    await invoiceRef.update({ status: 'Extracting', updatedAt: Date.now() });

    // ── b) Load file buffer from Firebase Storage ────────────────────────────
    // FIX: read both 'mimetype' and 'fileType' fields (UploadBatch writes 'fileType',
    //      but the field was previously expected as 'mimetype')
    const storagePath:  string = invoice.storagePath || '';
    const mimetype:     string = invoice.mimetype || invoice.fileType || 'application/pdf';
    const originalname: string = invoice.fileName  || 'invoice';

    if (!storagePath) {
      await invoiceRef.update({
        status:       'Failed',
        errorDetails: 'Missing storagePath — file could not be loaded for extraction.',
        updatedAt:    Date.now(),
      });
      return;
    }

    let buffer: Buffer;
    try {
      const [fileContents] = await bucket.file(storagePath).download();
      buffer = fileContents as Buffer;
    } catch (dlErr) {
      console.error(`[Pipeline] Failed to download ${storagePath}:`, dlErr);
      await invoiceRef.update({
        status:       'Failed',
        errorDetails: 'Could not retrieve uploaded file from storage.',
        updatedAt:    Date.now(),
      });
      return;
    }

    // ── c) 3-Layer Cascading OCR Pipeline ───────────────────────────────────
    // FIX: Use runPipeline() instead of duplicating the logic here.
    // runPipeline handles handwriting detection, Layer 1/2/3 cascade, and
    // preserves OCR context correctly at every fallback step.
    let pipelineResult: Awaited<ReturnType<typeof runPipeline>>;
    try {
      pipelineResult = await runPipeline({
        buffer,
        mimetype,
        originalname,
        orgId,
        uid: invoice.uploadedBy || '',
      });
    } catch (pipelineErr) {
      console.error('[Pipeline] Extraction error:', pipelineErr);
      await invoiceRef.update({
        status:       'Failed',
        errorDetails: 'OCR extraction pipeline failed. Please retry or enter data manually.',
        updatedAt:    Date.now(),
      });
      return;
    }

    const { invoices: extractedData, extractionLayer } = pipelineResult;

    // ── d) Write results back to Firestore ───────────────────────────────────
    // Take the first extracted invoice (batch PDFs handled in layer3_gemini)
    const primaryInvoice  = extractedData[0] || {};
    const confidenceScores = primaryInvoice.confidenceScores || {};
    const allScores = Object.values(confidenceScores) as number[];
    const overallConfidence = allScores.length
      ? Math.round(allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length)
      : 0;

    // Build clean update payload — no undefined values
    const updatePayload: Record<string, any> = {
      status:         'Ready for Review',
      extractedData:  primaryInvoice,
      confidenceScores,
      overallConfidence,
      layerUsed:      extractionLayer,
      extractionLayer,
      modelVariant:   primaryInvoice.modelVariant || extractionLayer,
      updatedAt:      Date.now(),

      // FIX: preserve storagePath and fileUrl so serveFile can generate signed URLs
      storagePath:    invoice.storagePath || '',
      fileUrl:        invoice.fileUrl || `/api/files/${(invoice.storagePath || '').split('/').pop()}`,

      // Top-level fields for querying/display
      vendorName:     primaryInvoice.vendorName     || '',
      vendorGSTIN:    primaryInvoice.vendorGSTIN    || '',
      vendorAddress:  primaryInvoice.vendorAddress  || '',
      buyerName:      primaryInvoice.buyerName      || '',
      buyerGSTIN:     primaryInvoice.buyerGSTIN     || '',
      buyerAddress:   primaryInvoice.buyerAddress   || '',
      invoiceNumber:  primaryInvoice.invoiceNumber  || '',
      invoiceDate:    primaryInvoice.invoiceDate    || '',
      paymentTerms:   primaryInvoice.paymentTerms   || '',
      dueDate:        primaryInvoice.dueDate        || '',
      taxableAmount:  primaryInvoice.taxableAmount  || 0,
      cgst:           primaryInvoice.cgst           || 0,
      sgst:           primaryInvoice.sgst           || 0,
      igst:           primaryInvoice.igst           || 0,
      grandTotal:     primaryInvoice.grandTotal     || 0,
      gstRate:        primaryInvoice.gstRate        || 0,
      roundOff:       primaryInvoice.roundOff       || 0,
      advancePaid:    primaryInvoice.advancePaid    || 0,
      balanceDue:     primaryInvoice.balanceDue     || 0,
      paymentMode:    primaryInvoice.paymentMode    || '',
      lineItems:      primaryInvoice.lineItems      || [],
      doubtfulFields: primaryInvoice.doubtfulFields || [],
      validationErrors: primaryInvoice.validationErrors || [],
    };

    // If multi-invoice batch, store additional invoices separately
    if (extractedData.length > 1) {
      const batch = db.batch();
      for (let i = 1; i < extractedData.length; i++) {
        const siblingRef = db.collection(`organizations/${orgId}/invoices`).doc();
        const sibling    = extractedData[i];
        batch.set(siblingRef, {
          ...updatePayload,
          ...sibling,
          status:         'Ready for Review',
          extractionLayer,
          layerUsed:      extractionLayer,
          uploadedBy:     invoice.uploadedBy,
          uploadedAt:     invoice.uploadedAt,
          orgId,
          batchParent:    invoiceId,
        });
      }
      await batch.commit();
      console.log(`[Pipeline] Wrote ${extractedData.length - 1} additional split invoices`);
    }

    await invoiceRef.update(updatePayload);
    console.log(`[Pipeline] ✅ Invoice ${invoiceId} extracted via ${extractionLayer} (confidence: ${overallConfidence}%)`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. cashfreeWebhookHandler — HTTPS Webhook
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Handles Cashfree subscription webhook events.
 *
 * Security:  HMAC-SHA256 signature verification on raw request body
 * Events:
 *   SUBSCRIPTION_STATUS_CHANGED (→ ACTIVE) → activate subscription, reset quota
 *   SUBSCRIPTION_PAYMENT_SUCCESS            → same as above
 *   SUBSCRIPTION_PAYMENT_FAILED             → mark past_due
 */
export const cashfreeWebhookHandler = onRequest(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // ── Signature Verification (HMAC-SHA256) ────────────────────────────────
    const secret    = process.env.CASHFREE_SECRET || '';
    const sigHeader = req.headers['x-webhook-signature'] as string | undefined;

    if (!sigHeader || !secret) {
      console.warn('[Cashfree] Missing signature header or CASHFREE_SECRET env var');
      res.status(401).json({ error: 'Unauthorized — missing signature' });
      return;
    }

    // Cashfree sends the raw body; Cloud Functions v2 provides it as req.rawBody
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) {
      res.status(400).json({ error: 'Missing raw body' });
      return;
    }

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    // Constant-time comparison to prevent timing attacks
    const sigBuffer      = Buffer.from(sigHeader,   'base64');
    const expectedBuffer = Buffer.from(expectedSig, 'base64');

    const signaturesMatch =
      sigBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(sigBuffer, expectedBuffer);

    if (!signaturesMatch) {
      console.warn('[Cashfree] Invalid webhook signature — rejecting');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // ── Parse event ─────────────────────────────────────────────────────────
    const event     = req.body as Record<string, any>;
    const eventType = event?.type as string | undefined;
    const data      = event?.data as Record<string, any> | undefined;

    console.log(`[Cashfree] Received event: ${eventType}`);

    // Extract org/user identifier — Cashfree passes customer_id we set at checkout
    const customerId: string =
      data?.subscription?.customer_details?.customer_id ||
      data?.customer_details?.customer_id || '';

    if (!customerId) {
      console.warn('[Cashfree] No customer_id in webhook payload');
      res.status(200).json({ received: true }); // Still 200 to prevent retries
      return;
    }

    // Find user by customerId field in Firestore
    const userSnap = await db.collection('users')
      .where('cashfreeCustomerId', '==', customerId)
      .limit(1)
      .get();

    if (userSnap.empty) {
      console.warn(`[Cashfree] No user found for customerId: ${customerId}`);
      res.status(200).json({ received: true });
      return;
    }

    const userRef  = userSnap.docs[0].ref;
    const newStatus = data?.subscription?.status as string | undefined;

    // ── Handle events ────────────────────────────────────────────────────────
    try {
      switch (eventType) {
        case 'SUBSCRIPTION_STATUS_CHANGED': {
          if (newStatus === 'ACTIVE') {
            await userRef.update({
              subscriptionStatus: 'active',
              invoiceCount:       0,          // Reset quota on new billing cycle
              subscriptionId:     data?.subscription?.subscription_id || '',
              planId:             data?.subscription?.plan_id         || '',
              subscriptionStart:  Date.now(),
              updatedAt:          Date.now(),
            });
            console.log(`[Cashfree] Subscription ACTIVATED for ${customerId}`);
          } else if (newStatus === 'CANCELLED' || newStatus === 'EXPIRED') {
            await userRef.update({
              subscriptionStatus: 'cancelled',
              updatedAt:          Date.now(),
            });
            console.log(`[Cashfree] Subscription ${newStatus} for ${customerId}`);
          }
          break;
        }

        case 'SUBSCRIPTION_PAYMENT_SUCCESS': {
          await userRef.update({
            subscriptionStatus: 'active',
            invoiceCount:       0,            // Reset quota on successful payment
            lastPaymentAt:      Date.now(),
            lastPaymentAmount:  data?.payment?.payment_amount || 0,
            updatedAt:          Date.now(),
          });
          console.log(`[Cashfree] Payment SUCCESS for ${customerId} — quota reset`);
          break;
        }

        case 'SUBSCRIPTION_PAYMENT_FAILED': {
          // Mark past_due but DO NOT delete data or revoke access immediately
          await userRef.update({
            subscriptionStatus: 'past_due',
            lastFailedPaymentAt: Date.now(),
            updatedAt:           Date.now(),
          });
          console.log(`[Cashfree] Payment FAILED for ${customerId} — status: past_due`);
          break;
        }

        default:
          console.log(`[Cashfree] Unhandled event type: ${eventType} — ignoring`);
      }
    } catch (dbErr) {
      console.error('[Cashfree] Firestore update failed:', dbErr);
      // Still return 200 to prevent Cashfree from endlessly retrying
    }

    // Acknowledge immediately — Cashfree expects 200 within 5s
    res.status(200).json({ received: true });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. deleteExpiredFiles — Pub/Sub Scheduled Cron (Every 24 hours)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Runs globally once every 24 hours (2:00 AM IST).
 * Deletes raw invoice image/PDF files from Firebase Storage that are older
 * than 30 days. Extracted Firestore data is never deleted.
 *
 * Multi-tenant safe: queries fileMetadata collection (not org-scoped) since
 * files from all orgs must be cleaned globally.
 */
export const deleteExpiredFiles = onSchedule(
  {
    schedule:       '0 2 * * *',     // 02:00 AM IST daily (timeZone set below)
    timeZone:       'Asia/Kolkata',
    region:         'us-central1',
    timeoutSeconds: 540,
    memory:         '512MiB',
  },
  async () => {
    const cutoff      = Date.now() - THIRTY_DAYS_MS;
    let deletedFiles  = 0;
    let skippedFiles  = 0;
    let errorCount    = 0;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    console.log(`[Cleanup] Starting 30-day file purge. Cutoff: ${new Date(cutoff).toISOString()}`);

    // Process in pages of 200 to stay within memory limits
    while (true) {
      let query = db.collection('fileMetadata')
        .where('createdAt', '<', cutoff)
        .orderBy('createdAt')
        .limit(200);

      if (cursor) {
        query = query.startAfter(cursor);
      }

      const snap = await query.get();
      if (snap.empty) break;

      console.log(`[Cleanup] Processing batch of ${snap.size} expired file records`);

      const deletionBatch = db.batch();

      for (const fileDoc of snap.docs) {
        const data        = fileDoc.data();
        const storagePath = data.storagePath as string | undefined;

        if (storagePath) {
          try {
            const file      = bucket.file(storagePath);
            const [exists]  = await file.exists();
            if (exists) {
              await file.delete();
              deletedFiles++;
            } else {
              skippedFiles++;
            }
          } catch (storageErr) {
            console.error(`[Cleanup] Failed to delete ${storagePath}:`, storageErr);
            errorCount++;
            continue; // Don't delete Firestore metadata if Storage delete failed
          }
        }

        // Remove the Firestore fileMetadata record (keeps extracted invoice data)
        deletionBatch.delete(fileDoc.ref);
      }

      await deletionBatch.commit();
      cursor = snap.docs[snap.docs.length - 1];

      // Stop if we've reached the last page
      if (snap.size < 200) break;
    }

    console.log(
      `[Cleanup] ✅ Complete. Deleted: ${deletedFiles} | ` +
      `Skipped (already gone): ${skippedFiles} | Errors: ${errorCount}`
    );
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. getCorrectionStats — onCall Callable (Admin Analytics)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Callable function for the Admin Analytics Dashboard.
 * Aggregates corrections_log data and returns:
 *   - mostCorrectedField:   the field_name corrected most frequently
 *   - avgOccurrenceCount:   average occurrence_count across all corrections
 *   - layerWithMostErrors:  which extractionLayer generates most corrections
 *   - fieldBreakdown:       top-10 fields with correction counts
 *   - layerBreakdown:       correction count by layer
 *   - totalCorrections:     total correction events
 */
export const getCorrectionStats = onCall(
  {
    region:        'us-central1',
    timeoutSeconds: 60,
    memory:        '512MiB',
  },
  async (request) => {
    // ── Auth guard: only authenticated users ─────────────────────────────────
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated to call this function.');
    }

    const uid = request.auth.uid;

    // ── Org lookup ───────────────────────────────────────────────────────────
    const userDoc = await db.doc(`users/${uid}`).get();
    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'User document not found.');
    }

    const orgId = userDoc.data()?.lastOrgId as string | undefined;
    if (!orgId) {
      throw new HttpsError('failed-precondition', 'No organisation found for this user.');
    }

    // ── Admin/owner role guard ───────────────────────────────────────────────
    const memberDoc = await db.doc(`organizations/${orgId}/members/${uid}`).get();
    const role      = memberDoc.data()?.role as string | undefined;
    if (!memberDoc.exists || !['owner', 'admin'].includes(role || '')) {
      throw new HttpsError('permission-denied', 'Only admins and owners can access correction stats.');
    }

    // ── Query corrections_log ────────────────────────────────────────────────
    const corrSnap = await db
      .collection(`organizations/${orgId}/corrections_log`)
      .orderBy('occurrence_count', 'desc')
      .limit(1000)                          // Safety cap for very active orgs
      .get();

    if (corrSnap.empty) {
      return {
        mostCorrectedField:  null,
        avgOccurrenceCount:  0,
        layerWithMostErrors: null,
        fieldBreakdown:      [],
        layerBreakdown:      {},
        totalCorrections:    0,
      };
    }

    // ── Aggregate ────────────────────────────────────────────────────────────
    const fieldCounts:  Record<string, number>  = {};
    const layerCounts:  Record<string, number>  = {};
    let totalOccurrences = 0;
    let totalDocs        = 0;

    corrSnap.forEach((doc) => {
      const d               = doc.data();
      const field: string   = d.field_name        || 'unknown';
      const layer: string   = d.layer_used        || d.layerUsed || 'unknown';
      const count: number   = typeof d.occurrence_count === 'number' ? d.occurrence_count : 1;

      fieldCounts[field]  = (fieldCounts[field]  || 0) + count;
      layerCounts[layer]  = (layerCounts[layer]  || 0) + count;
      totalOccurrences   += count;
      totalDocs++;
    });

    // Sort field breakdown descending by correction count
    const fieldBreakdown = Object.entries(fieldCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([field, count]) => ({ field, count }));

    // Most corrected field
    const mostCorrectedField = fieldBreakdown[0]?.field ?? null;

    // Layer with most corrections
    const layerWithMostErrors = Object.entries(layerCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

    const avgOccurrenceCount = totalDocs > 0
      ? Math.round((totalOccurrences / totalDocs) * 100) / 100
      : 0;

    console.log(
      `[CorrectionStats] orgId=${orgId} | docs=${totalDocs} | ` +
      `mostCorrectedField=${mostCorrectedField} | topLayer=${layerWithMostErrors}`
    );

    return {
      mostCorrectedField,
      avgOccurrenceCount,
      layerWithMostErrors,
      fieldBreakdown,
      layerBreakdown: layerCounts,
      totalCorrections: totalOccurrences,
    };
  }
);
