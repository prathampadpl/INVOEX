import { GoogleGenAI } from '@google/genai';

// Singleton client — avoids re-instantiation on every warm invocation
let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[Handwriting] GEMINI_API_KEY not set — handwriting detection disabled');
    return null;
  }
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _ai;
}

/**
 * Layer 0: Handwriting Detection
 * Uses a cheap single-turn Gemini Flash call to determine if an image is
 * primarily handwritten. Returns false for PDFs and text files.
 */
export async function detectHandwriting(buffer: Buffer, mimetype: string): Promise<boolean> {
  // PDFs and text docs are treated as non-handwritten by default
  if (mimetype === 'application/pdf' || mimetype === 'text/plain' ||
      mimetype.includes('word')) {
    return false;
  }

  // Only attempt for images
  if (!mimetype.startsWith('image/')) return false;

  const ai = getAI();
  if (!ai) return false; // GEMINI_API_KEY missing — fail gracefully

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              data: buffer.toString('base64'),
              mimeType: mimetype,
            }
          },
          {
            text: 'Is this document primarily handwritten (not typed/printed)? Answer only YES or NO. No other text.'
          }
        ]
      }],
      config: { maxOutputTokens: 10 }
    });

    const answer = (result.text || '').trim().toUpperCase();
    console.log(`[Handwriting] Detection result: ${answer}`);
    return answer.startsWith('YES');
  } catch (e) {
    console.error('[Handwriting] Detection failed, defaulting to false:', e);
    return false;
  }
}
