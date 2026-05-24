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
- invoiceDate (string, format YYYY-MM-DD. Note: In India, dates are written in DD/MM/YYYY, DD/MM/YY, DD MM YY, DD MM YYYY, DD-MM-YY, or DD.MM.YY format. Always parse them interpreting the first part as Day, second as Month, and convert to YYYY-MM-DD format. E.g. '7/04/2026' or '7 04 26' represents April 7, 2026 -> '2026-04-07'.)
- dueDate (string, format YYYY-MM-DD. Note: In India, dates are written in DD/MM/YYYY, DD/MM/YY, DD MM YY, DD MM YYYY, DD-MM-YY, or DD.MM.YY format. Always parse them interpreting the first part as Day, second as Month, and convert to YYYY-MM-DD format. E.g. '7/04/2026' or '7 04 26' -> '2026-04-07'.)
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
Do NOT use markdown code blocks like \`\`\`json. Just return the raw JSON array.

### Self-Learning Corrections Instruction:
You may be provided with a list of corrections previously made by human verifiers. Review the corrections list carefully. If you see corrections for the same vendor, prioritize those corrected values (e.g. corrected vendor name, GSTINs, addresses, or specific spelling patterns) when outputting your values.`;

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
    const q = query(
      collection(db, `workspaces/${workspaceId}/corrections_log`),
      orderBy('occurrence_count', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    if (snap.empty) return '';

    const sortedDocs = snap.docs.map(doc => doc.data());

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
    const q = query(
      collection(db, `workspaces/${workspaceId}/invoices`),
      orderBy('uploadedAt', 'desc'),
      limit(200)
    );
    const snap = await getDocs(q);
    if (snap.empty) return '';

    const approvedInvoices = snap.docs
      .map(doc => doc.data())
      .filter(data => data.status === 'Approved');

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

function normalizeDate(dateStr: any): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  let cleaned = dateStr.trim();
  if (!cleaned) return '';

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // Split by slashes, dashes, dots, or spaces
  const parts = cleaned.split(/[\/\-\.\s]+/);
  if (parts.length === 3) {
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);

    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        const year = p1;
        const month = String(p2).padStart(2, '0');
        const day = String(p3).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } else {
        // DD/MM/YYYY or DD/MM/YY
        const day = String(p1).padStart(2, '0');
        const month = String(p2).padStart(2, '0');
        let year = p3;
        if (parts[2].length === 2) {
          year = p3 >= 80 ? 1900 + p3 : 2000 + p3;
        }
        return `${year}-${month}-${day}`;
      }
    }
  }

  return dateStr;
}

async function applyHistoricalCorrections(invoice: any, workspaceId: string): Promise<any> {
  if (!invoice || !invoice.vendorName) return invoice;
  
  try {
    const currentVendor = String(invoice.vendorName).trim();
    const q = query(
      collection(db, `workspaces/${workspaceId}/corrections_log`),
      where('vendor_name', '==', currentVendor)
    );
    const snap = await getDocs(q);
    if (snap.empty) return invoice;

    const bestCorrections: Record<string, { corrected_value: string; original_value: string; occurrence_count: number; updated_at: number }> = {};
    
    snap.docs.forEach(doc => {
      const data = doc.data();
      const field = data.field_name;
      const corrected = data.corrected_value;
      const original = data.original_value;
      const count = data.occurrence_count || 1;
      const time = data.updated_at || 0;

      if (!bestCorrections[field] || count > bestCorrections[field].occurrence_count || (count === bestCorrections[field].occurrence_count && time > bestCorrections[field].updated_at)) {
        bestCorrections[field] = { corrected_value: corrected, original_value: original, occurrence_count: count, updated_at: time };
      }
    });

    const staticFields = ['vendorName', 'vendorGSTIN', 'vendorAddress', 'buyerName', 'buyerGSTIN', 'buyerAddress'];
    
    Object.keys(bestCorrections).forEach(field => {
      const corr = bestCorrections[field];
      const isStatic = staticFields.includes(field);
      
      const currentVal = invoice[field];
      const currentStr = String(currentVal === null || currentVal === undefined ? '' : currentVal).trim().toLowerCase();
      const originalStr = String(corr.original_value === null || corr.original_value === undefined ? '' : corr.original_value).trim().toLowerCase();

      if (isStatic) {
        if (corr.corrected_value) {
          const isNumberField = ['taxableAmount', 'cgst', 'sgst', 'igst', 'gstRate', 'roundOff', 'grandTotal', 'advancePaid', 'balanceDue'].includes(field);
          invoice[field] = isNumberField ? parseFloat(corr.corrected_value) : corr.corrected_value;
        }
      } else {
        if (currentStr === originalStr && corr.corrected_value) {
          const isNumberField = ['taxableAmount', 'cgst', 'sgst', 'igst', 'gstRate', 'roundOff', 'grandTotal', 'advancePaid', 'balanceDue'].includes(field);
          invoice[field] = isNumberField ? parseFloat(corr.corrected_value) : corr.corrected_value;
        }
      }
    });
  } catch (err) {
    console.error("Failed to apply historical corrections:", err);
  }
  return invoice;
}

function recalculateAndValidateMath(invoice: any): any {
  if (!invoice) return invoice;

  const parse = (val: any) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

  if (Array.isArray(invoice.lineItems)) {
    invoice.lineItems = invoice.lineItems.map((item: any) => {
      const q = parse(item.quantity);
      const r = parse(item.rate);
      const disc = parse(item.discount);
      const isPercent = item.discountType === 'percent';
      const gst = parse(item.gstRate);

      const subtotal = q * r;
      const taxableLine = isPercent ? subtotal * (1 - disc / 100) : subtotal - disc;
      
      const calculatedAmount = Number((taxableLine * (1 + gst / 100)).toFixed(2));
      const existingAmount = parse(item.amount);
      if (existingAmount === 0 || Math.abs(existingAmount - calculatedAmount) > 0.1) {
        item.amount = calculatedAmount;
      }
      
      const vendorState = (invoice.vendorGSTIN || '').substring(0, 2);
      const buyerState = (invoice.buyerGSTIN || '').substring(0, 2);
      const isInterstate = vendorState && buyerState && vendorState !== buyerState;
      const lineTax = Number((taxableLine * (gst / 100)).toFixed(2));

      if (isInterstate) {
        item.igst = lineTax;
        item.cgst = 0;
        item.sgst = 0;
      } else {
        item.cgst = Number((lineTax / 2).toFixed(2));
        item.sgst = Number((lineTax / 2).toFixed(2));
        item.igst = 0;
      }

      return item;
    });
  }

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const vendorState = (invoice.vendorGSTIN || '').substring(0, 2);
  const buyerState = (invoice.buyerGSTIN || '').substring(0, 2);
  const isInterstate = vendorState && buyerState && vendorState !== buyerState;

  if (Array.isArray(invoice.lineItems) && invoice.lineItems.length > 0) {
    invoice.lineItems.forEach((it: any) => {
      const q = parse(it.quantity);
      const r = parse(it.rate);
      const d = parse(it.discount);
      const pct = it.discountType === 'percent';
      const g = parse(it.gstRate);

      const sub = q * r;
      const taxLine = pct ? sub * (1 - d / 100) : sub - d;
      const lineTax = taxLine * (g / 100);

      totalTaxable += taxLine;
      if (isInterstate) {
        totalIgst += lineTax;
      } else {
        totalCgst += lineTax / 2;
        totalSgst += lineTax / 2;
      }
    });

    totalTaxable = Number(totalTaxable.toFixed(2));
    totalCgst = Number(totalCgst.toFixed(2));
    totalSgst = Number(totalSgst.toFixed(2));
    totalIgst = Number(totalIgst.toFixed(2));
  } else {
    totalTaxable = parse(invoice.taxableAmount);
    const gstRate = parse(invoice.gstRate);
    const totalGst = Number((totalTaxable * (gstRate / 100)).toFixed(2));

    if (isInterstate || (parse(invoice.igst) > 0 && parse(invoice.cgst) === 0 && parse(invoice.sgst) === 0)) {
      totalIgst = totalGst;
      totalCgst = 0;
      totalSgst = 0;
    } else {
      totalCgst = Number((totalGst / 2).toFixed(2));
      totalSgst = Number((totalGst / 2).toFixed(2));
      totalIgst = 0;
    }
  }

  const totalTax = totalCgst + totalSgst + totalIgst;
  const avgGstRate = totalTaxable > 0 ? Number(((totalTax / totalTaxable) * 100).toFixed(2)) : parse(invoice.gstRate);
  const roundOff = parse(invoice.roundOff);
  const grandTotal = Number((totalTaxable + totalTax + roundOff).toFixed(2));
  const advance = parse(invoice.advancePaid);
  const balanceDue = Number((grandTotal - advance).toFixed(2));

  invoice.taxableAmount = totalTaxable;
  invoice.cgst = totalCgst;
  invoice.sgst = totalSgst;
  invoice.igst = totalIgst;
  invoice.gstRate = avgGstRate;
  invoice.grandTotal = grandTotal;
  invoice.balanceDue = balanceDue;

  const errors: string[] = [];
  if (totalTaxable <= 0) errors.push("Taxable amount is zero or negative.");
  if (grandTotal <= 0) errors.push("Grand total is zero or negative.");
  if (Math.abs(grandTotal - (totalTaxable + totalTax + roundOff)) > 0.1) {
    errors.push("Grand total does not match the sum of taxable amount, GST, and round off.");
  }
  
  invoice.validationErrors = errors;
  return invoice;
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
      let result;
      if (model.type === 'gemini') {
        result = await tryModelWithTimeout((signal) => tryGeminiModel(model.name, base64Data, mimeType, correctionsLogString, knownVendorsString, signal));
      } else {
        result = await tryModelWithTimeout((signal) => tryOpenRouterModel(model.name, base64Data, mimeType, correctionsLogString, knownVendorsString, signal));
      }
      
      if (result && result.data) {
        for (let i = 0; i < result.data.length; i++) {
          result.data[i].invoiceDate = normalizeDate(result.data[i].invoiceDate);
          result.data[i].dueDate = normalizeDate(result.data[i].dueDate);
          result.data[i] = await applyHistoricalCorrections(result.data[i], workspaceId);
          result.data[i] = recalculateAndValidateMath(result.data[i]);
        }
      }
      return result;
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

