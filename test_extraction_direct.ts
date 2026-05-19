import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

// Load .env
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY is not defined in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const filesToTest = [
  {
    name: "softwareketan Developers (Invoice 58)",
    path: "C:\\Users\\prath\\.gemini\\antigravity\\brain\\c538ab16-e5c8-4a90-923f-dd246004d561\\media__1779189946761.png",
    mimeType: "image/png"
  },
  {
    name: "Bisk Farm Tidbit (Bill of Supply 2)",
    path: "C:\\Users\\prath\\.gemini\\antigravity\\brain\\c538ab16-e5c8-4a90-923f-dd246004d561\\media__1779189946774.png",
    mimeType: "image/png"
  },
  {
    name: "MARG FMCG DISTRIBUTOR (Bill 397)",
    path: "C:\\Users\\prath\\.gemini\\antigravity\\brain\\c538ab16-e5c8-4a90-923f-dd246004d561\\media__1779189947235.png",
    mimeType: "image/png"
  },
  {
    name: "SUNRISE ENTERPRISE (Inv-5)",
    path: "C:\\Users\\prath\\.gemini\\antigravity\\brain\\c538ab16-e5c8-4a90-923f-dd246004d561\\media__1779189947397.png",
    mimeType: "image/png"
  }
];

const prompt = `You are INVOEX, a SaaS specialized in extracting Indian GST invoice data.
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
- buyerName (string)
- buyerGSTIN (string)
- invoiceNumber (string)
- invoiceDate (string, format YYYY-MM-DD)
- taxableAmount (number)
- cgst (number)
- sgst (number)
- igst (number)
- grandTotal (number)
- roundOff (number)
- gstRate (number)
- lineItems: Array of objects with description, hsnCode, quantity, unit, rate, amount. Apply strict mapping.
- pages: ARRAY of numbers (1-indexed pages where invoice appears).
- discount (number)
- discountType (string)
- advancePaid (number)
- balanceDue (number)
- paymentMode (string)
- confidenceScore (number between 0 and 100)
- doubtfulFields (array of string field names you are unsure about)

Return ONLY a valid JSON ARRAY.`;

async function testExtraction() {
  console.log("Starting INVOEX Multimodal Extraction Pipeline Test...");
  
  for (const file of filesToTest) {
    console.log(`\n========================================`);
    console.log(`Processing: ${file.name}`);
    console.log(`Path: ${file.path}`);
    
    if (!fs.existsSync(file.path)) {
      console.error(`Error: File not found at ${file.path}`);
      continue;
    }
    
    const fileBuffer = fs.readFileSync(file.path);
    const base64Data = fileBuffer.toString("base64");
    
    let success = false;
    const models = ["gemini-2.5-flash", "gemini-2.5-pro"];
    
    for (const modelName of models) {
      try {
        console.log(`Sending to Gemini (${modelName})...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: file.mimeType
                  }
                },
                { text: prompt }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                   vendorName: { type: Type.STRING },
                   vendorGSTIN: { type: Type.STRING },
                   buyerName: { type: Type.STRING },
                   buyerGSTIN: { type: Type.STRING },
                   invoiceNumber: { type: Type.STRING },
                   invoiceDate: { type: Type.STRING },
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
                   pages: {
                     type: Type.ARRAY,
                     items: { type: Type.INTEGER }
                   },
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
                            amount: { type: Type.NUMBER }
                         }
                       }
                    },
                   confidenceScore: { type: Type.NUMBER },
                   doubtfulFields: {
                     type: Type.ARRAY,
                     items: { type: Type.STRING }
                   }
                }
              }
            }
          }
        });
        
        const jsonText = response.text;
        if (!jsonText) {
          console.error("Error: Empty response text from Gemini");
          continue;
        }
        
        const parsed = JSON.parse(jsonText);
        console.log(`\n🎉 Extraction Successful using ${modelName}! Result:`);
        console.log(JSON.stringify(parsed, null, 2));
        
        // Save to file
        const resultFilePath = `C:\\Users\\prath\\.gemini\\antigravity\\brain\\c538ab16-e5c8-4a90-923f-dd246004d561\\scratch\\extracted_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        fs.writeFileSync(resultFilePath, JSON.stringify(parsed, null, 2));
        console.log(`Saved results to: ${resultFilePath}`);
        
        success = true;
        break; // Exit models loop on success
        
      } catch (err: any) {
        console.warn(`[WARNING] Model ${modelName} failed/unavailable: ${err.message || JSON.stringify(err)}`);
        // Add a delay before trying the next model
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    if (!success) {
      console.error(`❌ Extraction failed for ${file.name} across all fallback models.`);
    }
  }
}

testExtraction();
