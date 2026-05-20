import Tesseract from 'tesseract.js';

export interface Layer1Result {
  passed: boolean;
  ocrText: string;
  overallConfidence: number;
}

/**
 * Layer 1: Tesseract OCR
 * Preprocesses images with sharp and runs Tesseract OCR.
 * Returns whether the OCR confidence meets the threshold, and the raw OCR text
 * for use as context in the Gemini Layer 3 call.
 *
 * Note: For PDFs, Tesseract cannot directly read the format, so we skip and
 * return passed:false to cascade to Layer 3.
 */
export async function runLayer1(
  buffer: Buffer,
  mimetype: string,
  ocrThreshold: number
): Promise<Layer1Result> {

  // Only run Tesseract on images
  if (!mimetype.startsWith('image/')) {
    return { passed: false, ocrText: '', overallConfidence: 0 };
  }

  try {
    // Dynamically import sharp to avoid startup cost
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(buffer).metadata();
    const isLowRes = metadata.width && metadata.width < 1500;

    // Build preprocessing pipeline optimised for Tesseract
    let pipeline = sharp(buffer);
    if (isLowRes) {
      pipeline = pipeline.resize({
        width: metadata.width ? Math.min(metadata.width * 2, 3000) : 2500,
        kernel: 'lanczos3',
      });
    }

    const processedBuffer = await pipeline
      .grayscale()
      .normalize()
      .clahe({ width: 30, height: 30, maxSlope: 4 })
      .linear(1.1, -10)
      .sharpen({ sigma: 1, m1: 2, m2: 20 })
      .median(3)
      .threshold(140)
      .toBuffer();

    // Run Tesseract with word-level confidence data
    const { data } = await Tesseract.recognize(processedBuffer, 'eng+hin', {
      logger: () => {}, // suppress verbose logs
    });

    const ocrText = data.text || '';

    // Compute overall confidence from word-level scores
    const pageData = data as any;
    const words = Array.isArray(pageData.words) ? pageData.words : [];
    const confScores = words
      .filter((w: any) => typeof w.text === 'string' && w.text.trim().length > 0)
      .map((w: any) => typeof w.confidence === 'number' ? w.confidence : 0);

    const overallConfidence = confScores.length
      ? confScores.reduce((a: number, b: number) => a + b, 0) / confScores.length
      : 0;

    console.log(`[Layer1/Tesseract] Overall confidence: ${overallConfidence.toFixed(1)}% (threshold: ${ocrThreshold}%)`);

    return {
      passed: overallConfidence >= ocrThreshold,
      ocrText,
      overallConfidence,
    };
  } catch (e) {
    console.error('[Layer1/Tesseract] OCR failed:', e);
    return { passed: false, ocrText: '', overallConfidence: 0 };
  }
}
