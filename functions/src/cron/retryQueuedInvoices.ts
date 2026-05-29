import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { processWithAI } from '../utils/gemini';
import { applyRules } from '../utils/applyRules';

const db = getFirestore();

export const retryQueuedInvoices = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'us-east1',
    timeoutSeconds: 540,
    memory: '2GiB',
    secrets: ['GEMINI_API_KEY', 'OPENROUTER_API_KEY'],
  },
  async (event) => {
    console.log('[RetryCron] Starting retry cycle');
    const now = Date.now();
    const batchSize = 5;

    // --- Phase 1: Rescue Stuck Invoices ---
    const stuckCutoff = now - (15 * 60 * 1000); // 15 minutes ago
    const stuckSnap = await db.collectionGroup('invoices')
      .where('status', '==', 'Extracting')
      .where('createdAt', '<', stuckCutoff)
      .get();

    for (const doc of stuckSnap.docs) {
      console.log(`[RetryCron] Rescuing stuck invoice: ${doc.id}`);
      await doc.ref.update({
        status: 'Queued',
        queuedAt: now,
        retryCount: 0,
        lastError: 'Function timed out or crashed during extraction',
        updatedAt: now
      });
    }

    // --- Phase 2: Process Queued Invoices ---
    const queuedSnap = await db.collectionGroup('invoices')
      .where('status', '==', 'Queued')
      .where('retryCount', '<', 5)
      .limit(batchSize)
      .get();

    console.log(`[RetryCron] Found ${queuedSnap.docs.length} queued invoices to process`);

    for (const doc of queuedSnap.docs) {
      const data = doc.data();
      const invoiceRef = doc.ref;
      const workspaceId = doc.ref.parent.parent?.id;
      
      if (!workspaceId || !data.storagePath) {
        await invoiceRef.update({ status: 'Failed', lastError: 'Missing workspaceId or storagePath' });
        continue;
      }

      console.log(`[RetryCron] Processing ${doc.id} (Attempt ${data.retryCount + 1}/5)`);

      try {
        await invoiceRef.update({ status: 'Extracting', updatedAt: Date.now() });

        const bucketName = data.fileUrl ? new URL(data.fileUrl).pathname.split('/')[2] : undefined;
        let bucket = getStorage().bucket(bucketName);
        if (!bucketName) bucket = getStorage().bucket(); // Fallback to default
        
        const [buffer] = await bucket.file(data.storagePath).download();
        
        const { data: extractedDataList, extractedBy } = await processWithAI(buffer, data.fileType || 'application/pdf', workspaceId);

        const primaryInvoice = extractedDataList[0] || {};
        
        // Fetch rules
        const rulesSnap = await db.collection(`workspaces/${workspaceId}/rules`).get();
        const rules = rulesSnap.docs.map(d => d.data());
        
        // Apply rules
        const processedInvoice = applyRules(primaryInvoice, rules);

        const updatePayload = {
          status: 'Ready for Review',
          extractedBy,
          vendorName: processedInvoice.vendorName || '',
          vendorAddress: processedInvoice.vendorAddress || '',
          vendorGSTIN: processedInvoice.vendorGSTIN || '',
          buyerName: processedInvoice.buyerName || '',
          buyerAddress: processedInvoice.buyerAddress || '',
          buyerGSTIN: processedInvoice.buyerGSTIN || '',
          invoiceNumber: processedInvoice.invoiceNumber || '',
          invoiceDate: processedInvoice.invoiceDate || '',
          dueDate: processedInvoice.dueDate || '',
          paymentTerms: processedInvoice.paymentTerms || '',
          taxableAmount: processedInvoice.taxableAmount || 0,
          cgst: processedInvoice.cgst || 0,
          sgst: processedInvoice.sgst || 0,
          igst: processedInvoice.igst || 0,
          gstRate: processedInvoice.gstRate || 0,
          roundOff: processedInvoice.roundOff || 0,
          grandTotal: processedInvoice.grandTotal || 0,
          advancePaid: processedInvoice.advancePaid || 0,
          balanceDue: processedInvoice.balanceDue || 0,
          paymentMode: processedInvoice.paymentMode || '',
          lineItems: processedInvoice.lineItems || [],
          confidenceScores: processedInvoice.confidenceScores || {},
          overallConfidence: processedInvoice.overallConfidence || 0,
          updatedAt: Date.now()
        };

        await invoiceRef.update(updatePayload);
        console.log(`[RetryCron] Successfully processed ${doc.id}`);

      } catch (err: any) {
        console.error(`[RetryCron] Failed to process ${doc.id}:`, err);
        const nextRetryCount = (data.retryCount || 0) + 1;
        
        if (err.code === 'ALL_MODELS_EXHAUSTED' || err.message === 'ALL_MODELS_EXHAUSTED') {
          if (nextRetryCount >= 5) {
            await invoiceRef.update({
              status: 'Failed',
              errorDetails: 'Failed after 5 retries. All models exhausted.',
              updatedAt: Date.now()
            });
          } else {
            await invoiceRef.update({
              status: 'Queued',
              retryCount: nextRetryCount,
              lastError: 'All AI models exhausted',
              updatedAt: Date.now()
            });
          }
        } else {
          await invoiceRef.update({
            status: 'Failed',
            errorDetails: err.message || 'Pipeline failed during processing.',
            updatedAt: Date.now()
          });
        }
      }
    }
    
    console.log('[RetryCron] Cycle complete');
  }
);
