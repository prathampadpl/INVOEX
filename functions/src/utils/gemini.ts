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

export async function processWithGemini(buffer: Buffer, mimeType: string, workspaceId: string): Promise<any[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Using gemini-2.5-flash as it handles massive contexts natively, eliminating the need for manual chunking.
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const part = {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType
    }
  };

  console.log(`[Gemini] Sending file to Gemini 2.5 Flash for workspace ${workspaceId}`);
  
  const result = await model.generateContent([systemPrompt, part]);
  const text = result.response.text();

  let cleanedText = text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.replace(/^```json/, '');
    cleanedText = cleanedText.replace(/```$/, '');
  }

  const parsed = JSON.parse(cleanedText);
  return Array.isArray(parsed) ? parsed : [parsed];
}
