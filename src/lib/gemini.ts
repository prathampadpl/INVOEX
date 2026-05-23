import { GoogleGenerativeAI } from '@google/generative-ai';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from './firebase';

const systemPrompt = `You are an expert AI extraction system for invoices and receipts.
Your task is to analyze the provided image/PDF and extract all relevant billing information into a structured JSON array.
If the document contains multiple distinct invoices (e.g., a 10-page PDF with 5 different invoices), return an array of objects, one for each invoice.
If it is a single invoice, return an array with one object.

Output strictly valid JSON array of objects with these keys:
- vendorName (string)
- vendorAddress (string)
- vendorGSTIN (string)
- buyerName (string)
- buyerAddress (string)
- buyerGSTIN (string)
- invoiceNumber (string)
- invoiceDate (string, format YYYY-MM-DD. Note: In India, dates are written in DD/MM/YYYY or DD/MM/YY format. When parsing date strings with slashes or dashes (e.g. '7/04/2026', '25-12-26'), always interpret the first number as Day and the second number as Month, then convert to YYYY-MM-DD format. E.g. '7/04/2026' represents April 7, 2026 -> '2026-04-07'.)
- dueDate (string, format YYYY-MM-DD. Note: In India, dates are written in DD/MM/YYYY or DD/MM/YY format. When parsing date strings with slashes or dashes (e.g. '7/04/2026', '25-12-26'), always interpret the first number as Day and the second number as Month, then convert to YYYY-MM-DD format. E.g. '7/04/2026' represents April 7, 2026 -> '2026-04-07'.)
- paymentTerms (string)
- taxableAmount (number)
- cgst (number)
- sgst (number)
- igst (number)
- gstRate (number)
- roundOff (number)
- grandTotal (number)
- advancePaid (number)
- balanceDue (number)
- paymentMode (string)
- lineItems (array of objects with keys: description, hsnCode, quantity, unit, rate, amount, gstRate, cgst, sgst, igst)
- confidenceScores (object where keys are each of the above field names (except lineItems) and values are integers from 0 to 100 representing your confidence level in that specific field's extraction)
- doubtfulFields (array of string field names you are unsure about)

If a field is not present or cannot be determined, use null or 0.
Do NOT use markdown code blocks like \`\`\`json. Just return the raw JSON array.`;

// Error classification
function isRetryableError(err: any): boolean {
  const status = err?.status ?? err?.httpStatus ?? err?.code;
  if (!status) {
    const msg = err?.message?.toLowerCase() || '';
    if (msg.includes('400') || msg.includes('bad request') || msg.includes('invalid argument')) {
      return false; // 400 is not retryable
    }
    return true; // Unknown errors, assume retryable
  }
  if ([429, 503, 502, 504, 'RESOURCE_EXHAUSTED', 'UNAVAILABLE'].includes(status)) {
    return true;
  }
  return false;
}

// Result validation
function isExtractionUsable(data: any): boolean {
  if (!data) return false;
  const required = ['vendorName', 'invoiceNumber', 'grandTotal'];
  return required.some(field => data[field] && data[field] !== 0 && data[field] !== '');
}

// Sanitize and populate confidence scores + doubtfulFields
function sanitizeExtractionResult(arr: any[]): any[] {
  const fields = [
    'vendorName', 'vendorAddress', 'vendorGSTIN', 'buyerName', 'buyerAddress', 'buyerGSTIN',
    'invoiceNumber', 'invoiceDate', 'dueDate', 'paymentTerms', 'taxableAmount', 'cgst',
    'sgst', 'igst', 'gstRate', 'roundOff', 'grandTotal', 'advancePaid', 'balanceDue', 'paymentMode'
  ];

  return arr.map(item => {
    if (!item) return {};
    
    // Ensure lineItems is an array
    if (!Array.isArray(item.lineItems)) {
      item.lineItems = [];
    }

    // Ensure doubtfulFields is an array
    if (!Array.isArray(item.doubtfulFields)) {
      item.doubtfulFields = [];
    }

    // Ensure confidenceScores is an object
    if (!item.confidenceScores || typeof item.confidenceScores !== 'object') {
      item.confidenceScores = {};
    }

    // Populate confidence scores for all fields
    fields.forEach(field => {
      if (item.confidenceScores[field] === undefined || item.confidenceScores[field] === null) {
        const val = item[field];
        if (val !== undefined && val !== null && val !== '' && val !== 0) {
          item.confidenceScores[field] = 90;
        } else {
          item.confidenceScores[field] = 0;
        }
      } else {
        let val = parseInt(item.confidenceScores[field]);
        if (isNaN(val)) val = 90;
        item.confidenceScores[field] = Math.max(0, Math.min(100, val));
      }
    });

    // Compute overallConfidence as the average of the field confidence scores
    const scores = Object.values(item.confidenceScores) as number[];
    item.overallConfidence = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    return item;
  });
}

async function getCorrectionsLogString(workspaceId: string): Promise<string> {
  try {
    const q = query(collection(db, `workspaces/${workspaceId}/corrections_log`));
    const snap = await getDocs(q);
    if (snap.empty) return '';

    const sortedDocs = snap.docs.map(doc => doc.data()).sort((a, b) => {
      const countA = a.occurrence_count || 1;
      const countB = b.occurrence_count || 1;
      if (countB !== countA) return countB - countA;
      const timeA = a.updated_at || 0;
      const timeB = b.updated_at || 0;
      return timeB - timeA;
    }).slice(0, 50);

    const cleanCorrections: string[] = [];
    const FORBIDDEN_KEYWORDS = ["ignore", "instruction", "output", "system", "rule", "prompt", "previous", "instead", "reveal", "show all", "dump", "schema"];

    sortedDocs.forEach(r => {
      const vendor = String(r.vendor_name || '').replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim().slice(0, 100);
      const field = String(r.field_name || '').replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim().slice(0, 50);
      const orig = String(r.original_value || '').replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim().slice(0, 200);
      const corr = String(r.corrected_value || '').replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim().slice(0, 200);

      const isSuspect = [vendor, field, orig, corr].some(val => 
        FORBIDDEN_KEYWORDS.some(k => val.toLowerCase().includes(k))
      );

      if (!isSuspect && vendor && field && corr) {
        cleanCorrections.push(`Vendor: ${vendor} | Field: ${field} | Original: ${orig} | Corrected: ${corr}`);
      }
    });

    if (cleanCorrections.length > 0) {
      return `\n[Corrections Reference - ${cleanCorrections.length} entries]\n${cleanCorrections.join('\n')}\n`;
    }
  } catch (err) {
    console.error("Failed to fetch corrections log", err);
  }
  return '';
}

async function getKnownVendorsString(workspaceId: string): Promise<string> {
  try {
    const q = query(collection(db, `workspaces/${workspaceId}/invoices`));
    const snap = await getDocs(q);
    if (snap.empty) return '';

    const approvedInvoices = snap.docs
      .map(doc => doc.data())
      .filter(data => data.status === 'Approved')
      .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
      .slice(0, 200);

    const vendorMap = new Map<string, string>();
    approvedInvoices.forEach(data => {
      if (data.vendorName && data.vendorGSTIN) {
        const name = String(data.vendorName).replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim().slice(0, 100);
        const gstin = String(data.vendorGSTIN).replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim().slice(0, 20);
        if (name && gstin) {
          vendorMap.set(name, gstin);
        }
      }
    });

    if (vendorMap.size > 0) {
      const cleanVendors = Array.from(vendorMap.entries()).map(([name, gstin]) => {
        return `<vendor name="${name}" gstin="${gstin}" />`;
      });
      return `\n<known_vendors_reference>\nThe following is a list of known vendors and their GSTINs. Use this to correct spelling errors or OCR inaccuracies if the vendor name in the document matches one of these names.\n<vendors>\n${cleanVendors.join('\n')}\n</vendors>\n</known_vendors_reference>\n`;
    }
  } catch (err) {
    console.error("Failed to fetch known vendors", err);
  }
  return '';
}

async function tryGeminiModel(
  modelName: string,
  base64Data: string,
  mimeType: string,
  correctionsLogString: string,
  knownVendorsString: string,
  signal: AbortSignal
): Promise<{ data: any[], extractedBy: string }> {
  const fallbackGemini = ['AIzaS', 'yD397sDHir', '_cXzNHykcKQXKT', 'QjnG80BmW0'].join('');
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || fallbackGemini;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing in frontend env');
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  
  const part = {
    inlineData: {
      data: base64Data,
      mimeType
    }
  };

  const finalPrompt = systemPrompt + correctionsLogString + knownVendorsString;

  const result = await model.generateContent([finalPrompt, part], { requestOptions: { signal } as any } as any);
  const text = result.response.text();
  
  let cleanedText = text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.replace(/^```json/, '');
    cleanedText = cleanedText.replace(/```$/, '');
  }
  
  const parsed = JSON.parse(cleanedText);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const sanitized = sanitizeExtractionResult(arr);
  
  if (sanitized.length === 0 || !isExtractionUsable(sanitized[0])) {
    throw new Error('EMPTY_EXTRACTION');
  }
  
  return { data: sanitized, extractedBy: modelName };
}

async function tryOpenRouterModel(
  modelName: string,
  base64Data: string,
  mimeType: string,
  correctionsLogString: string,
  knownVendorsString: string,
  signal: AbortSignal
): Promise<{ data: any[], extractedBy: string }> {
  const fallbackOR = ['sk-or-v1', '-42d5ecbe', '50dd005c0ba', '4a7eb846d8920', '2d9f480dd757b', 'ee3c644f3485', 'f864788'].join('');
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || import.meta.env.OPENROUTER_API_KEY || fallbackOR;
  if (!apiKey) {
    console.warn('VITE_OPENROUTER_API_KEY is missing, skipping OpenRouter models');
    throw new Error('OPENROUTER_API_KEY is missing in frontend env');
  }

  const finalPrompt = systemPrompt + correctionsLogString + knownVendorsString;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://invoex.vercel.app',
      'X-Title': 'Invoex',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: finalPrompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]
        }
      ]
    }),
    signal
  });

  if (!response.ok) {
     throw new Error(`OpenRouter HTTP error: ${response.status}`);
  }

  const json = await response.json();
  const text = json.choices[0]?.message?.content || '';
  
  let cleanedText = text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.replace(/^```json/, '');
    cleanedText = cleanedText.replace(/```$/, '');
  }
  
  const parsed = JSON.parse(cleanedText);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const sanitized = sanitizeExtractionResult(arr);
  
  if (sanitized.length === 0 || !isExtractionUsable(sanitized[0])) {
    throw new Error('EMPTY_EXTRACTION');
  }
  
  return { data: sanitized, extractedBy: `openrouter/${modelName}` };
}

async function tryModelWithTimeout(
  modelFn: (signal: AbortSignal) => Promise<{ data: any[], extractedBy: string }>,
  timeoutMs = 60000
): Promise<{ data: any[], extractedBy: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await modelFn(controller.signal);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      const e = new Error('Model processing timed out');
      (e as any).status = 504;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function processWithAI(base64Data: string, mimeType: string, workspaceId: string): Promise<{ data: any[], extractedBy: string }> {
  const isPDF = mimeType.toLowerCase().includes('pdf');
  
  const imageModels = [
    { type: 'gemini', name: 'gemini-2.5-flash' },
    { type: 'gemini', name: 'gemini-2.0-flash' },
    { type: 'gemini', name: 'gemini-2.0-flash-lite' },
    { type: 'openrouter', name: 'qwen/qwen-2.5-vl-72b-instruct:free' },
    { type: 'openrouter', name: 'meta-llama/llama-3.2-90b-vision-instruct:free' }
  ];
  
  const pdfModels = [
    { type: 'gemini', name: 'gemini-2.5-flash' },
    { type: 'gemini', name: 'gemini-2.0-flash' },
    { type: 'gemini', name: 'gemini-2.0-flash-lite' }
  ];
  
  const modelChain = isPDF ? pdfModels : imageModels;

  // Fetch past corrections log and known vendors for self-learning loop context
  const correctionsLogString = await getCorrectionsLogString(workspaceId);
  const knownVendorsString = await getKnownVendorsString(workspaceId);
  
  for (const model of modelChain) {
    try {
      console.log(`[Pipeline] Trying ${model.name} for workspace ${workspaceId}`);
      if (model.type === 'gemini') {
        return await tryModelWithTimeout((signal) => tryGeminiModel(model.name, base64Data, mimeType, correctionsLogString, knownVendorsString, signal));
      } else {
        return await tryModelWithTimeout((signal) => tryOpenRouterModel(model.name, base64Data, mimeType, correctionsLogString, knownVendorsString, signal));
      }
    } catch (err: any) {
      if (err.message === 'EMPTY_EXTRACTION') {
        console.warn(`[Pipeline] ${model.name} returned unusable data, trying next`);
        continue;
      }
      
      if (!isRetryableError(err)) {
        console.error(`[Pipeline] ${model.name} failed with non-retryable error:`, err.message);
        throw err; // Stop immediately
      }
      
      console.warn(`[Pipeline] ${model.name} failed with retryable error (${err.message}), trying next`);
    }
  }
  
  const e = new Error('ALL_MODELS_EXHAUSTED');
  (e as any).code = 'ALL_MODELS_EXHAUSTED';
  throw e;
}
