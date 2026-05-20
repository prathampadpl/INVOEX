import { GoogleGenAI, Type } from '@google/genai';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureString, parseNum } from '../utils/validation';

export type GeminiModel = 'gemini-2.0-flash' | 'gemini-2.5-flash' | 'gemini-2.5-pro';

export interface Layer3Result {
  passed: boolean;
  invoices: any[];
  usedModel: string;
}

const EXTRACTION_PROMPT = `You are INVOEX, a SaaS specialized in extracting Indian GST invoice data.
Please analyze this invoice document entirely using your multimodal vision capabilities.
IMPORTANT: The document may contain MULTIPLE PAGES and MULTIPLE INDEPENDENT BILLS.
1. Document types vary wildly. Some are formal "Tax Invoices", "Retail Invoices", or handwritten slips. Others are "e-Way Bills" or "Delivery Challans". DO NOT FAIL. ADAPT TO EVERY LAYOUT.
2. If it is an "e-Way Bill" or something similar that has Supplier/Recipient and Taxable value details, EXTRACT IT just like an invoice!
3. If there are multiple independent bills or e-way bills, extract EACH one separately into the JSON array.
4. FOR HANDWRITTEN, BLURRY, OR MESSY BILLS:
   - Use context to deduce words.
   - Ignore extraneous pen marks.
   - GSTINs usually follow: 2 digits + 5 letters + 4 digits + 1 letter + 1 number + Z + 1 char. EXTRACT THE GSTIN EXACTLY AS IT APPEARS.
5. MATH VALIDATION IS CRITICAL TO FIX BLURRY NUMBERS/OCR ERRORS:
   - Calculate (Quantity * Rate) to verify Line Amount.
   - Verify Taxable Amount + CGST + SGST + IGST (or +/- RoundOff) = Grand Total.
   - Use math to correct blurry digits.

Extract the following fields for EACH document (Invoice/E-way Bill) found:
- vendorName (string)
- vendorGSTIN (string)
- vendorAddress (string: full vendor address)
- buyerName (string)
- buyerGSTIN (string)
- buyerAddress (string: full buyer address)
- invoiceNumber (string)
- invoiceDate (string, format YYYY-MM-DD)
- paymentTerms (string: e.g. "Net 30", "Immediate", "COD")
- dueDate (string, format YYYY-MM-DD, or empty if not found)
- taxableAmount (number)
- cgst (number)
- sgst (number)
- igst (number)
- grandTotal (number)
- roundOff (number)
- gstRate (number)
- lineItems: Array of objects with description, hsnCode, quantity, unit, rate, discount, discountType, amount
- pages: ARRAY of numbers (1-indexed pages where invoice appears)
- discount (number)
- discountType (string: "percent", "flat", or "none")
- advancePaid (number)
- balanceDue (number)
- paymentMode (string)
- confidenceScores (object: map of field name to confidence 0-100, e.g. {"vendorName": 95, "invoiceNumber": 72})
- doubtfulFields (array of string field names you are unsure about)

ADVANCE PAYMENT / PARTIAL PAYMENT RULES:
7. Look for a "Payment History", "Advance Received", or similar section.
8. Extract the TOTAL of all advance/partial payments made as advancePaid.
9. Calculate or extract balanceDue = grandTotal - advancePaid.
10. Extract payment mode as paymentMode (e.g., "Cash", "UPI", "Cheque"). If multiple modes, join them.

Return ONLY a valid JSON ARRAY. If a single invoice spans multiple pages, it MUST be ONE object with all pages listed in the pages field.`;

/** Build the Gemini response schema with confidenceScores as OBJECT */
function getResponseSchema() {
  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        vendorName: { type: Type.STRING },
        vendorGSTIN: { type: Type.STRING },
        vendorAddress: { type: Type.STRING },
        buyerName: { type: Type.STRING },
        buyerGSTIN: { type: Type.STRING },
        buyerAddress: { type: Type.STRING },
        invoiceNumber: { type: Type.STRING },
        invoiceDate: { type: Type.STRING },
        paymentTerms: { type: Type.STRING },
        dueDate: { type: Type.STRING },
        taxableAmount: { type: Type.NUMBER },
        cgst: { type: Type.NUMBER },
        sgst: { type: Type.NUMBER },
        igst: { type: Type.NUMBER },
        grandTotal: { type: Type.NUMBER },
        roundOff: { type: Type.NUMBER },
        gstRate: { type: Type.NUMBER },
        advancePaid: { type: Type.NUMBER },
        balanceDue: { type: Type.NUMBER },
        paymentMode: { type: Type.STRING },
        pages: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        lineItems: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              hsnCode: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              unit: { type: Type.STRING },
              rate: { type: Type.NUMBER },
              discount: { type: Type.NUMBER },
              discountType: { type: Type.STRING },
              amount: { type: Type.NUMBER },
            },
          },
        },
        confidenceScores: { type: Type.OBJECT },
        doubtfulFields: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
  };
}

/** Parse and clean AI JSON response */
function parseAiResponse(text: string): any[] {
  let cleaned = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) cleaned = jsonMatch[1];
  cleaned = cleaned.trim();
  try {
    const p = JSON.parse(cleaned);
    return Array.isArray(p) ? p : [p];
  } catch (e) {
    console.error('[Layer3] JSON parse error:', e, text.slice(0, 200));
    return [];
  }
}

/** Sanitize all fields on a parsed invoice object */
function sanitizeInvoice(inv: any, modelVariant: string): any {
  const validationErrors: string[] = [];

  inv.vendorName = ensureString(inv.vendorName, 199);
  inv.vendorGSTIN = ensureString(inv.vendorGSTIN, 99);
  inv.vendorAddress = ensureString(inv.vendorAddress, 499);
  inv.buyerName = ensureString(inv.buyerName, 199);
  inv.buyerGSTIN = ensureString(inv.buyerGSTIN, 99);
  inv.buyerAddress = ensureString(inv.buyerAddress, 499);
  inv.invoiceNumber = ensureString(inv.invoiceNumber, 99);
  inv.invoiceDate = ensureString(inv.invoiceDate, 99);
  inv.paymentTerms = ensureString(inv.paymentTerms, 199);
  inv.dueDate = ensureString(inv.dueDate, 99);
  inv.paymentMode = ensureString(inv.paymentMode, 199);

  inv.taxableAmount = parseNum(inv.taxableAmount);
  inv.cgst = parseNum(inv.cgst);
  inv.sgst = parseNum(inv.sgst);
  inv.igst = parseNum(inv.igst);
  inv.roundOff = parseNum(inv.roundOff);
  inv.grandTotal = parseNum(inv.grandTotal);
  inv.advancePaid = parseNum(inv.advancePaid);
  inv.balanceDue = parseNum(inv.balanceDue);
  inv.gstRate = parseNum(inv.gstRate);

  // Validate confidenceScores is a proper map
  if (!inv.confidenceScores || typeof inv.confidenceScores !== 'object' || Array.isArray(inv.confidenceScores)) {
    inv.confidenceScores = {};
  }

  const TOLERANCE = 1.0;
  if (inv.advancePaid > 0 && Math.abs((inv.grandTotal - inv.advancePaid) - inv.balanceDue) > TOLERANCE) {
    validationErrors.push('Balance Due mismatch: Grand Total - Advance ≠ Balance Due');
  }
  if (inv.advancePaid > inv.grandTotal + TOLERANCE) {
    validationErrors.push('Advance Paid exceeds Grand Total');
  }

  if (inv.lineItems && Array.isArray(inv.lineItems)) {
    inv.lineItems = inv.lineItems.map((item: any) => {
      if (!item || typeof item !== 'object') return { description: 'Unknown Item', quantity: 1, rate: 0, amount: 0 };
      return {
        description: ensureString(item.description, 199).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown Item',
        hsnCode: ensureString(item.hsnCode, 99),
        unit: ensureString(item.unit, 99),
        quantity: parseNum(item.quantity),
        rate: parseNum(item.rate),
        discount: parseNum(item.discount),
        discountType: ensureString(item.discountType, 49) || 'none',
        amount: parseNum(item.amount),
      };
    });
  } else {
    inv.lineItems = [];
  }

  inv.validationErrors = validationErrors;
  inv.modelVariant = modelVariant;
  return inv;
}

/**
 * Layer 3: Gemini extraction (Flash or Pro)
 * Handles both single images and large multi-page PDFs (chunked processing).
 */
export async function runLayer3(params: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  ocrText: string;
  model: GeminiModel;
  correctionsLogString: string;
  knownVendorsString: string;
  threshold: number;
}): Promise<Layer3Result> {
  const { buffer, mimetype, originalname, ocrText, model, correctionsLogString, knownVendorsString, threshold } = params;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });

  // Build full prompt with context
  let fullPrompt = EXTRACTION_PROMPT;
  if (ocrText) fullPrompt += `\n\nLAYER 1 RAW OCR TEXT (For Cross-Reference):\n${ocrText}\n`;
  if (correctionsLogString) fullPrompt += `\n\n${correctionsLogString}\n`;
  if (knownVendorsString) fullPrompt += `\n\n${knownVendorsString}\n`;

  const isTextDocument = mimetype === 'text/plain' || originalname.toLowerCase().endsWith('.txt') ||
    mimetype.includes('word') || originalname.toLowerCase().endsWith('.docx');

  // Build parts array — use File Upload API for large files/PDFs
  let partsArray: any[] = [];
  let fileUriForGemini: string | null = null;

  if (!isTextDocument && (buffer.length > 2 * 1024 * 1024 || mimetype === 'application/pdf')) {
    const tempPath = path.join(os.tmpdir(), `gemini_${Date.now()}_${path.basename(originalname).replace(/[^a-zA-Z0-9.-]/g, '_')}`);
    try {
      fs.writeFileSync(tempPath, buffer);
      const uploadResult = await (ai.files as any).upload({ file: tempPath, mimeType: mimetype });
      fileUriForGemini = uploadResult.uri;
    } catch (e) {
      console.warn('[Layer3] File upload failed, falling back to base64:', e);
    } finally {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    }
  }

  if (isTextDocument) {
    partsArray = [{ text: `DOCUMENT TEXT:\n${buffer.toString('utf8')}` }, { text: fullPrompt }];
  } else if (fileUriForGemini) {
    partsArray = [{ fileData: { fileUri: fileUriForGemini, mimeType: mimetype } }, { text: fullPrompt }];
  } else {
    partsArray = [{ inlineData: { data: buffer.toString('base64'), mimeType: mimetype } }, { text: fullPrompt }];
  }

  const getPayload = (m: string) => ({
    model: m,
    contents: [{ role: 'user', parts: partsArray }],
    config: { responseMimeType: 'application/json', responseSchema: getResponseSchema() },
  });

  // Retry cascade across model variants on quota/unavailability
  const modelHierarchy: GeminiModel[] = Array.from(new Set([model, 'gemini-2.5-flash', 'gemini-2.0-flash'])) as GeminiModel[];
  let response: any = null;
  let usedModel = model;
  let lastError: any = null;

  for (const currentModel of modelHierarchy) {
    const maxAttempts = currentModel === model ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[Layer3] Attempting extraction with ${currentModel} (attempt ${attempt})`);
        response = await ai.models.generateContent(getPayload(currentModel));
        usedModel = currentModel;
        break;
      } catch (err: any) {
        lastError = err;
        const errStr = JSON.stringify(err, Object.getOwnPropertyNames(err));
        const isQuota = errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('429') || errStr.includes('Quota');
        const isUnavail = errStr.includes('503') || errStr.includes('UNAVAILABLE');
        const isNotFound = errStr.includes('404') || errStr.includes('NOT_FOUND');

        if (isQuota || isNotFound) { break; } // next model
        if (isUnavail && attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
        } else {
          break;
        }
      }
    }
    if (response) break;
  }

  if (!response) throw lastError || new Error('All Gemini models failed');

  const jsonText = response.text;
  if (!jsonText) throw new Error('Empty Gemini response');

  // Handle large PDFs with chunked processing
  let parsed: any[] = [];

  if (mimetype === 'application/pdf') {
    try {
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const totalPages = pdfDoc.getPageCount();

      if (totalPages > 5) {
        console.log(`[Layer3] Large PDF (${totalPages} pages) — chunked processing`);
        const chunkSize = 12;
        const chunkedResults: any[] = [];

        for (let start = 0; start < totalPages; start += chunkSize) {
          const end = Math.min(start + chunkSize, totalPages);
          let chunkTempPath = '';
          try {
            const chunkPdf = await PDFDocument.create();
            const indices = Array.from({ length: end - start }, (_, i) => start + i);
            const copiedPages = await chunkPdf.copyPages(pdfDoc, indices);
            copiedPages.forEach(p => chunkPdf.addPage(p));
            const chunkBuffer = Buffer.from(await chunkPdf.save({ useObjectStreams: false }));

            chunkTempPath = path.join(os.tmpdir(), `chunk_${Date.now()}_${start}.pdf`);
            fs.writeFileSync(chunkTempPath, chunkBuffer);

            const uploadResult = await (ai.files as any).upload({ file: chunkTempPath, mimeType: 'application/pdf' });
            const chunkUri = uploadResult.uri;

            const chunkPayload = {
              ...getPayload(usedModel),
              contents: [{
                role: 'user',
                parts: [
                  { fileData: { fileUri: chunkUri, mimeType: 'application/pdf' } },
                  { text: fullPrompt + `\n\nIMPORTANT: Processing pages ${start + 1} to ${end}. The first page of this chunk is absolute page ${start + 1}.` }
                ]
              }]
            };

            const chunkRes = await ai.models.generateContent(chunkPayload);
            chunkedResults.push(...parseAiResponse(chunkRes.text || ''));
          } catch (e) {
            console.error(`[Layer3] Chunk ${start + 1}-${end} failed:`, e);
          } finally {
            try { if (chunkTempPath && fs.existsSync(chunkTempPath)) fs.unlinkSync(chunkTempPath); } catch {}
          }
        }

        parsed = chunkedResults.length > 0 ? chunkedResults : parseAiResponse(jsonText);
      } else {
        parsed = parseAiResponse(jsonText);
      }
    } catch {
      parsed = parseAiResponse(jsonText);
    }
  } else {
    parsed = parseAiResponse(jsonText);
  }

  if (!parsed.length) parsed = parseAiResponse(jsonText);

  // Sanitize all parsed invoices
  const sanitized = parsed.map(inv => sanitizeInvoice(inv, usedModel));

  // Compute overall confidence from the confidenceScores map
  const computeOverallConf = (inv: any): number => {
    const scores = Object.values(inv.confidenceScores || {}) as number[];
    return scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
  };

  const avgConf = sanitized.length
    ? sanitized.reduce((sum, inv) => sum + computeOverallConf(inv), 0) / sanitized.length
    : 0;

  return {
    passed: avgConf >= threshold,
    invoices: sanitized,
    usedModel,
  };
}
