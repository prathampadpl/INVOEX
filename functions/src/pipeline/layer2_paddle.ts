export interface Layer2Result {
  passed: boolean;
  ocrText: string;
  overallConfidence: number;
}

/**
 * Layer 2: PaddleOCR (STUB)
 *
 * PaddleOCR excels at structured tables and mixed Asian/Latin layouts.
 * This is currently a stub. To activate:
 *
 * Option A — RapidAPI wrapper:
 *   POST https://paddleocr.p.rapidapi.com/predict/ocr_system
 *   Headers: X-RapidAPI-Key, X-RapidAPI-Host
 *   Body: { "urls": ["data:image/png;base64,..."] }
 *
 * Option B — Cloud Run (self-hosted):
 *   Deploy PaddleOCR as a Cloud Run service and call its REST endpoint.
 *
 * TODO: Integrate one of the above options and replace the stub below.
 */
export async function runLayer2(
  _buffer: Buffer,
  _mimetype: string,
  _ocrThreshold: number
): Promise<Layer2Result> {
  console.log('[Layer2/PaddleOCR] Stub active — falling through to Layer 3');
  return { passed: false, ocrText: '', overallConfidence: 0 };
}
