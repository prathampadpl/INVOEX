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
    
    // SSRF Mitigation: Only allow fetching from Firebase Storage
    if (urlObj.hostname !== 'firebasestorage.googleapis.com') {
      throw new HttpsError('invalid-argument', 'Invalid file URL domain.');
    }

    const pathParts = decodeURIComponent(urlObj.pathname).split('/');
    const workspaceIdIndex = pathParts.indexOf('workspaces');
    if (workspaceIdIndex === -1) {
      throw new HttpsError('invalid-argument', 'Invalid workspace in fileUrl');
    }
    const workspaceId = pathParts[workspaceIdIndex + 1];

    // IDOR Mitigation: Check workspace membership
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const memberDoc = await db.collection('workspaces').doc(workspaceId).collection('members').doc(request.auth.uid).get();
    if (!memberDoc.exists) {
      throw new HttpsError('permission-denied', 'User is not a member of this workspace.');
    }

    // Rate Limiting Mitigation
    const rateLimitRef = db.collection('rate_limits').doc(request.auth.uid);
    const rateLimitDoc = await rateLimitRef.get();
    const now = Date.now();
    if (rateLimitDoc.exists) {
      const lastRequest = rateLimitDoc.data()?.lastRequest || 0;
      if (now - lastRequest < 5000) { // 5 second cooldown
        throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Please wait a few seconds before trying again.');
      }
    }
    await rateLimitRef.set({ lastRequest: now }, { merge: true });

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
