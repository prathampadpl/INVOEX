import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { processWithAI } from '../utils/gemini';
import { applyRules } from '../utils/applyRules';

const db = getFirestore();

export const extractInvoice = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '2GiB',
    secrets: ['GEMINI_API_KEY'],
  },
  async (request) => {
    const fileUrl = request.data.fileUrl;

    if (!fileUrl || typeof fileUrl !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing fileUrl');
    }

    const urlObj = new URL(fileUrl);
    const pathParts = decodeURIComponent(urlObj.pathname).split('/');
    const workspaceIdIndex = pathParts.indexOf('workspaces');
    if (workspaceIdIndex === -1) {
      throw new HttpsError('invalid-argument', 'Invalid workspace in fileUrl');
    }
    const workspaceId = pathParts[workspaceIdIndex + 1];

    try {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get('content-type') || 'application/pdf';

      // Send to AI Pipeline
      const { data: extractedDataList, extractedBy } = await processWithAI(buffer, contentType, workspaceId);

      // Fetch custom rules for workspace
      const rulesSnap = await db.collection(`workspaces/${workspaceId}/rules`).get();
      const rules = rulesSnap.docs.map(doc => doc.data());

      // Apply rules to all extracted invoices
      const processedList = extractedDataList.map((invoice: any) => applyRules(invoice || {}, rules));

      return {
        success: true,
        extractedDataList: processedList,
        extractedBy
      };

    } catch (err: any) {
      console.error('[Pipeline] Extraction failed:', err);
      if (err.code === 'ALL_MODELS_EXHAUSTED' || err.message === 'ALL_MODELS_EXHAUSTED') {
        throw new HttpsError('resource-exhausted', 'All AI models exhausted. Please try again later.');
      } else {
        throw new HttpsError('internal', err.message || 'Pipeline failed during processing.');
      }
    }
  }
);
