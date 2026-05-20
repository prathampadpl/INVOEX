/**
 * Layer 2: PaddleOCR via RapidAPI
 * ================================
 * PaddleOCR excels at:
 *   - Structured table layouts (GST invoices with item grids)
 *   - Mixed Hindi/English text (bilingual Indian invoices)
 *   - Rotated or skewed scans
 *
 * Activation: Set the RAPIDAPI_KEY environment variable via Firebase Secrets:
 *   firebase functions:secrets:set RAPIDAPI_KEY
 *
 * RapidAPI endpoint used:
 *   https://rapidapi.com/apitier/api/ocr-extract-text  (OCR Extract Text)
 *   OR any PaddleOCR-backed endpoint on RapidAPI.
 *
 * If RAPIDAPI_KEY is absent, the layer gracefully stubs out (falls through
 * to Layer 3) — zero disruption to the existing cascade.
 *
 * Alternative — Self-hosted Cloud Run:
 *   Deploy PaddleOCR as a Cloud Run service and replace RAPIDAPI_HOST/endpoint
 *   below with your Cloud Run URL. No other code changes needed.
 */

/* ─── Integration Instructions ─────────────────────────────────────────────
 *
 * OPTION A — RapidAPI (fastest, no infra):
 *   1. Sign up at https://rapidapi.com/
 *   2. Subscribe to "OCR Extract Text" or "PaddleOCR" API
 *   3. Run: firebase functions:secrets:set RAPIDAPI_KEY
 *      (paste the X-RapidAPI-Key value when prompted)
 *   4. Set RAPIDAPI_HOST below to match your chosen API's host header
 *   5. Deploy: firebase deploy --only functions
 *
 * OPTION B — Cloud Run (self-hosted, production-grade):
 *   1. Build the PaddleOCR Docker image (see ZIP instructions below)
 *   2. Deploy to Cloud Run: gcloud run deploy paddle-ocr --image ...
 *   3. Set PADDLE_CLOUD_RUN_URL env var to your Cloud Run service URL
 *   4. The code below will auto-detect and use Cloud Run if URL is set
 *
 * OPTION C — Local ZIP integration (user's PaddleOCR ZIP):
 *   If you have a PaddleOCR ZIP with a local HTTP wrapper:
 *   1. Extract the ZIP to functions/paddle/
 *   2. Expose a local HTTP endpoint at port 8868 (standard PaddleOCR port)
 *   3. For Cloud Functions: deploy the paddle service to Cloud Run first,
 *      then set PADDLE_CLOUD_RUN_URL to the Cloud Run URL
 * ─────────────────────────────────────────────────────────────────────────── */

const RAPIDAPI_HOST    = 'ocr-extract-text.p.rapidapi.com';  // ← Update to your API host
const RAPIDAPI_ENDPOINT = `https://${RAPIDAPI_HOST}/ocr`;

/** Confidence score returned when PaddleOCR is unavailable */
const STUB_CONFIDENCE  = 0;

export interface Layer2Result {
  passed:           boolean;
  ocrText:          string;
  overallConfidence: number;
}

/**
 * Parse the text blocks returned by PaddleOCR / RapidAPI OCR
 * and compute an overall confidence score.
 *
 * Response format (RapidAPI OCR Extract Text):
 *   { results: [{ text: string, confidence: number }] }
 *
 * Response format (PaddleOCR HTTP server):
 *   { data: [{ transcription: string, score: number }] }
 */
function parseOcrResponse(body: any): { text: string; confidence: number } {
  // RapidAPI "OCR Extract Text" format
  if (Array.isArray(body?.results)) {
    const blocks = body.results as Array<{ text: string; confidence: number }>;
    const texts  = blocks.map(b => b.text || '').filter(Boolean);
    const confs  = blocks.map(b => typeof b.confidence === 'number' ? b.confidence * 100 : 0);
    return {
      text:       texts.join('\n'),
      confidence: confs.length
        ? confs.reduce((a: number, b: number) => a + b, 0) / confs.length
        : 0,
    };
  }

  // PaddleOCR HTTP server format (self-hosted / Cloud Run)
  if (Array.isArray(body?.data)) {
    const blocks = body.data as Array<{ transcription: string; score: number }>;
    const texts  = blocks.map(b => b.transcription || '').filter(Boolean);
    const confs  = blocks.map(b => typeof b.score === 'number' ? b.score * 100 : 0);
    return {
      text:       texts.join('\n'),
      confidence: confs.length
        ? confs.reduce((a: number, b: number) => a + b, 0) / confs.length
        : 0,
    };
  }

  // Generic fallback — try to extract any "text" field
  if (typeof body?.text === 'string') {
    return { text: body.text, confidence: 60 }; // Conservative confidence
  }

  return { text: '', confidence: 0 };
}

/**
 * Layer 2: PaddleOCR
 * Calls either:
 *   1. Self-hosted Cloud Run (PADDLE_CLOUD_RUN_URL env var), or
 *   2. RapidAPI wrapper (RAPIDAPI_KEY env var)
 *
 * Falls through gracefully if neither is configured.
 */
export async function runLayer2(
  buffer:         Buffer,
  mimetype:       string,
  ocrThreshold:   number,
): Promise<Layer2Result> {

  // Only images — PDFs not supported by most PaddleOCR REST endpoints
  if (!mimetype.startsWith('image/')) {
    console.log('[Layer2/PaddleOCR] Non-image type — skipping');
    return { passed: false, ocrText: '', overallConfidence: STUB_CONFIDENCE };
  }

  const rapidApiKey    = process.env.RAPIDAPI_KEY        || '';
  const cloudRunUrl    = process.env.PADDLE_CLOUD_RUN_URL || '';

  // ── No credentials configured — stub through gracefully ──────────────────
  if (!rapidApiKey && !cloudRunUrl) {
    console.log('[Layer2/PaddleOCR] No RAPIDAPI_KEY or PADDLE_CLOUD_RUN_URL set — falling through to Layer 3');
    return { passed: false, ocrText: '', overallConfidence: STUB_CONFIDENCE };
  }

  // ── Convert image buffer to base64 data URI ───────────────────────────────
  const base64Image = buffer.toString('base64');
  const dataUri     = `data:${mimetype};base64,${base64Image}`;

  let responseBody: any;

  try {
    if (cloudRunUrl) {
      // ── Option B: Self-hosted Cloud Run / local PaddleOCR HTTP server ─────
      console.log('[Layer2/PaddleOCR] Calling Cloud Run endpoint…');
      const response = await fetch(cloudRunUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ images: [base64Image] }),
        signal:  AbortSignal.timeout(25_000),
      });

      if (!response.ok) {
        console.warn(`[Layer2/PaddleOCR] Cloud Run returned ${response.status}`);
        return { passed: false, ocrText: '', overallConfidence: 0 };
      }

      responseBody = await response.json();

    } else {
      // ── Option A: RapidAPI ─────────────────────────────────────────────────
      console.log('[Layer2/PaddleOCR] Calling RapidAPI OCR endpoint…');
      const response = await fetch(RAPIDAPI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type':    'application/json',
          'X-RapidAPI-Key':  rapidApiKey,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
        body:   JSON.stringify({ url: dataUri }),
        signal: AbortSignal.timeout(25_000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.warn(`[Layer2/PaddleOCR] RapidAPI returned ${response.status}: ${errText.slice(0, 200)}`);
        return { passed: false, ocrText: '', overallConfidence: 0 };
      }

      responseBody = await response.json();
    }

    // ── Parse & evaluate confidence ───────────────────────────────────────
    const { text, confidence } = parseOcrResponse(responseBody);
    const overallConfidence    = Math.min(100, Math.max(0, confidence));

    console.log(`[Layer2/PaddleOCR] Confidence: ${overallConfidence.toFixed(1)}% (threshold: ${ocrThreshold}%)`);

    return {
      passed:            overallConfidence >= ocrThreshold,
      ocrText:           text,
      overallConfidence,
    };

  } catch (err: any) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    console.error(`[Layer2/PaddleOCR] ${isTimeout ? 'Timeout' : 'Request failed'}:`, err?.message || err);
    return { passed: false, ocrText: '', overallConfidence: 0 };
  }
}
