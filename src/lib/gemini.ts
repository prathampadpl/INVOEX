import { GoogleGenerativeAI } from '@google/generative-ai';

const systemPrompt = `You are an expert AI extraction system for invoices and receipts.
Your task is to analyze the provided image/PDF and extract all relevant billing information into a structured JSON array.
If the document contains multiple distinct invoices (e.g., a 10-page PDF with 5 different invoices), return an array of objects, one for each invoice.
If it is a single invoice, return an array with one object.

Output strictly valid JSON array of objects with these keys:
- vendorName
- vendorAddress
- vendorGSTIN
- buyerName
- buyerAddress
- buyerGSTIN
- invoiceNumber
- invoiceDate (YYYY-MM-DD)
- dueDate (YYYY-MM-DD)
- paymentTerms
- taxableAmount (number)
- cgst (number)
- sgst (number)
- igst (number)
- gstRate (number)
- roundOff (number)
- grandTotal (number)
- advancePaid (number)
- balanceDue (number)
- paymentMode
- lineItems (array of { description, hsnSac, quantity, unitPrice, amount, gstRate, cgst, sgst, igst })

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

async function tryGeminiModel(modelName: string, base64Data: string, mimeType: string, signal: AbortSignal): Promise<{ data: any[], extractedBy: string }> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing in frontend env');
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  
  const part = {
    inlineData: {
      data: base64Data,
      mimeType
    }
  };

  const result = await model.generateContent([systemPrompt, part], { requestOptions: { signal } as any } as any);
  const text = result.response.text();
  
  let cleanedText = text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.replace(/^```json/, '');
    cleanedText = cleanedText.replace(/```$/, '');
  }
  
  const parsed = JSON.parse(cleanedText);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  
  if (arr.length === 0 || !isExtractionUsable(arr[0])) {
    throw new Error('EMPTY_EXTRACTION');
  }
  
  return { data: arr, extractedBy: modelName };
}

async function tryOpenRouterModel(modelName: string, base64Data: string, mimeType: string, signal: AbortSignal): Promise<{ data: any[], extractedBy: string }> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('VITE_OPENROUTER_API_KEY is missing, skipping OpenRouter models');
    throw new Error('OPENROUTER_API_KEY is missing in frontend env');
  }

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
            { type: "text", text: systemPrompt },
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
  
  if (arr.length === 0 || !isExtractionUsable(arr[0])) {
    throw new Error('EMPTY_EXTRACTION');
  }
  
  return { data: arr, extractedBy: `openrouter/${modelName}` };
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
  
  for (const model of modelChain) {
    try {
      console.log(`[Pipeline] Trying ${model.name} for workspace ${workspaceId}`);
      if (model.type === 'gemini') {
        return await tryModelWithTimeout((signal) => tryGeminiModel(model.name, base64Data, mimeType, signal));
      } else {
        return await tryModelWithTimeout((signal) => tryOpenRouterModel(model.name, base64Data, mimeType, signal));
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
