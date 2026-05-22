import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { processWithGemini } from '../utils/gemini';

const db = getFirestore();

export const onInvoiceUpload = onObjectFinalized(
  {
    region: 'us-east1',
    timeoutSeconds: 540,
    memory: '2GiB',
    secrets: ['GEMINI_API_KEY'],
  },
  async (event) => {
    const fileBucket = event.data.bucket;
    const filePath = event.data.name; // workspaces/{workspaceId}/uploads/{uploadId}
    const contentType = event.data.contentType;

    // Only process files in the correct path
    if (!filePath.startsWith('workspaces/') || !filePath.includes('/uploads/')) {
      console.log('Skipping non-upload file:', filePath);
      return;
    }

    const pathParts = filePath.split('/');
    const workspaceId = pathParts[1];
    // Path is workspaces/{workspaceId}/users/{userId}/uploads/{uploadId}
    const uploadId = pathParts[5];

    console.log(`[Pipeline] Processing upload ${uploadId} for workspace ${workspaceId}`);

    const invoiceRef = db.doc(`workspaces/${workspaceId}/invoices/${uploadId}`);

    try {
      // Step 1: Initialize the invoice document
      await invoiceRef.set({
        status: 'Extracting',
        storagePath: filePath,
        fileUrl: `https://firebasestorage.googleapis.com/v0/b/${fileBucket}/o/${encodeURIComponent(filePath)}?alt=media`,
        updatedAt: Date.now(),
        createdAt: Date.now(),
      }, { merge: true });

      const bucket = getStorage().bucket(fileBucket);
      const [buffer] = await bucket.file(filePath).download();

      // Step 2: Send to Gemini
      const extractedDataList = await processWithGemini(buffer, contentType || 'application/pdf', workspaceId);

      // Bug 1 Fix: Explicitly map the output to avoid data loss on split invoices
      const primaryInvoice = extractedDataList[0] || {};
      
      const updatePayload = {
        status: 'Ready for Review',
        vendorName: primaryInvoice.vendorName || '',
        vendorAddress: primaryInvoice.vendorAddress || '',
        vendorGSTIN: primaryInvoice.vendorGSTIN || '',
        buyerName: primaryInvoice.buyerName || '',
        buyerAddress: primaryInvoice.buyerAddress || '',
        buyerGSTIN: primaryInvoice.buyerGSTIN || '',
        invoiceNumber: primaryInvoice.invoiceNumber || '',
        invoiceDate: primaryInvoice.invoiceDate || '',
        dueDate: primaryInvoice.dueDate || '',
        paymentTerms: primaryInvoice.paymentTerms || '',
        taxableAmount: primaryInvoice.taxableAmount || 0,
        cgst: primaryInvoice.cgst || 0,
        sgst: primaryInvoice.sgst || 0,
        igst: primaryInvoice.igst || 0,
        gstRate: primaryInvoice.gstRate || 0,
        roundOff: primaryInvoice.roundOff || 0,
        grandTotal: primaryInvoice.grandTotal || 0,
        advancePaid: primaryInvoice.advancePaid || 0,
        balanceDue: primaryInvoice.balanceDue || 0,
        paymentMode: primaryInvoice.paymentMode || '',
        lineItems: primaryInvoice.lineItems || [],
        confidenceScores: primaryInvoice.confidenceScores || {},
        overallConfidence: primaryInvoice.overallConfidence || 0,
        doubtfulFields: primaryInvoice.doubtfulFields || [],
        validationErrors: primaryInvoice.validationErrors || [],
        updatedAt: Date.now()
      };

      // Step 3: Save Primary Invoice
      await invoiceRef.update(updatePayload);
      console.log(`[Pipeline] Saved primary invoice ${uploadId}`);

      // Step 4: Handle split invoices
      if (extractedDataList.length > 1) {
        const batch = db.batch();
        for (let i = 1; i < extractedDataList.length; i++) {
          const siblingRef = db.collection(`workspaces/${workspaceId}/invoices`).doc();
          const sibling = extractedDataList[i];
          batch.set(siblingRef, {
            // Bug 1 & 2 Fix: Explicitly copy storagePath and fileUrl for split invoices!
            storagePath: filePath,
            fileUrl: `https://firebasestorage.googleapis.com/v0/b/${fileBucket}/o/${encodeURIComponent(filePath)}?alt=media`,
            batchParent: uploadId,
            status: 'Ready for Review',
            createdAt: Date.now(),
            vendorName: sibling.vendorName || '',
            vendorAddress: sibling.vendorAddress || '',
            vendorGSTIN: sibling.vendorGSTIN || '',
            buyerName: sibling.buyerName || '',
            buyerAddress: sibling.buyerAddress || '',
            buyerGSTIN: sibling.buyerGSTIN || '',
            invoiceNumber: sibling.invoiceNumber || '',
            invoiceDate: sibling.invoiceDate || '',
            dueDate: sibling.dueDate || '',
            paymentTerms: sibling.paymentTerms || '',
            taxableAmount: sibling.taxableAmount || 0,
            cgst: sibling.cgst || 0,
            sgst: sibling.sgst || 0,
            igst: sibling.igst || 0,
            gstRate: sibling.gstRate || 0,
            roundOff: sibling.roundOff || 0,
            grandTotal: sibling.grandTotal || 0,
            advancePaid: sibling.advancePaid || 0,
            balanceDue: sibling.balanceDue || 0,
            paymentMode: sibling.paymentMode || '',
            lineItems: sibling.lineItems || [],
            confidenceScores: sibling.confidenceScores || {},
            overallConfidence: sibling.overallConfidence || 0,
            doubtfulFields: sibling.doubtfulFields || [],
            validationErrors: sibling.validationErrors || [],
            updatedAt: Date.now()
          });
        }
        await batch.commit();
        console.log(`[Pipeline] Saved ${extractedDataList.length - 1} split invoices`);
      }

    } catch (err: any) {
      console.error('[Pipeline] Extraction failed:', err);
      await invoiceRef.update({
        status: 'Failed',
        errorDetails: err.message || 'Pipeline failed during processing.',
        updatedAt: Date.now()
      });
    }
  }
);
