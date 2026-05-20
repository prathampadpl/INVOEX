import { detectHandwriting } from './handwriting';
import { runLayer1 } from './layer1_tesseract';
import { runLayer2 } from './layer2_paddle';
import { runLayer3 } from './layer3_gemini';
import { getOrgThresholds, buildCorrectionsContext, buildVendorsContext } from '../utils/validation';

export interface PipelineResult {
  invoices: any[];
  extractionLayer: string; // 'tesseract' | 'paddle' | 'gemini-flash' | 'gemini-pro'
  usedModel: string;
}

/**
 * The Three-Layer Confidence-Based Routing Pipeline
 *
 * Routing logic:
 *  1. Detect handwriting — if handwritten, skip directly to Layer 3 (Gemini)
 *  2. Layer 1 (Tesseract):
 *     - If OCR confidence >= threshold → use Tesseract text as context for Gemini Flash
 *     - Label: 'tesseract'
 *  3. Layer 2 (PaddleOCR stub):
 *     - If confidence >= threshold → use PaddleOCR text as context for Gemini Flash
 *     - Label: 'paddle'
 *  4. Layer 3a (Gemini Flash, threshold: layer3a):
 *     - If extraction confidence >= threshold → accept
 *     - Label: 'gemini-flash'
 *  5. Layer 3b (Gemini Pro, best effort):
 *     - Always accept; used as final fallback
 *     - Label: 'gemini-pro'
 *
 * Note: Even when Layers 1/2 "pass", Gemini is ALWAYS used for final field extraction.
 * The OCR text from Layers 1/2 is provided as context to improve Gemini's accuracy.
 */
export async function runPipeline(params: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  orgId: string;
  uid: string;
}): Promise<PipelineResult> {
  const { buffer, mimetype, originalname, orgId } = params;

  // Load org-level thresholds and context in parallel
  const [thresholds, correctionsCtx, vendorsCtx] = await Promise.all([
    getOrgThresholds(orgId),
    buildCorrectionsContext(orgId),
    buildVendorsContext(orgId),
  ]);

  console.log(`[Pipeline] Thresholds: Layer1=${thresholds.layer1}%, Layer2=${thresholds.layer2}%, Layer3a=${thresholds.layer3a}%`);

  const geminiParams = (model: 'gemini-2.0-flash' | 'gemini-2.5-flash' | 'gemini-2.5-pro', ocrText: string, thr: number) => ({
    buffer,
    mimetype,
    originalname,
    ocrText,
    model,
    correctionsLogString: correctionsCtx,
    knownVendorsString: vendorsCtx,
    threshold: thr,
  });

  // Step 0: Handwriting detection
  const isHandwritten = await detectHandwriting(buffer, mimetype);
  if (isHandwritten) {
    console.log('[Pipeline] Handwriting detected — routing directly to Gemini Flash (Layer 3a)');
    const l3a = await runLayer3(geminiParams('gemini-2.0-flash', '', thresholds.layer3a));
    if (l3a.passed) {
      return { invoices: l3a.invoices, extractionLayer: 'gemini-flash', usedModel: l3a.usedModel };
    }
    console.log('[Pipeline] Layer 3a confidence low — escalating to Gemini Pro (Layer 3b)');
    const l3b = await runLayer3(geminiParams('gemini-2.5-pro', '', 0));
    return { invoices: l3b.invoices, extractionLayer: 'gemini-pro', usedModel: l3b.usedModel };
  }

  // Step 1: Layer 1 — Tesseract
  console.log('[Pipeline] Running Layer 1 (Tesseract)...');
  const l1 = await runLayer1(buffer, mimetype, thresholds.layer1);
  if (l1.passed) {
    console.log(`[Pipeline] Layer 1 passed (${l1.overallConfidence.toFixed(1)}%) — running Gemini Flash with OCR context`);
    const l3 = await runLayer3(geminiParams('gemini-2.0-flash', l1.ocrText, thresholds.layer3a));
    if (l3.passed) {
      return { invoices: l3.invoices, extractionLayer: 'tesseract', usedModel: l3.usedModel };
    }
  } else {
    console.log(`[Pipeline] Layer 1 failed (${l1.overallConfidence.toFixed(1)}%) — trying Layer 2`);
  }

  // Step 2: Layer 2 — PaddleOCR (stub)
  console.log('[Pipeline] Running Layer 2 (PaddleOCR)...');
  const l2 = await runLayer2(buffer, mimetype, thresholds.layer2);
  if (l2.passed) {
    console.log('[Pipeline] Layer 2 passed — running Gemini Flash with PaddleOCR context');
    const l3 = await runLayer3(geminiParams('gemini-2.0-flash', l2.ocrText, thresholds.layer3a));
    if (l3.passed) {
      return { invoices: l3.invoices, extractionLayer: 'paddle', usedModel: l3.usedModel };
    }
  }

  // Step 3: Layer 3a — Gemini Flash
  console.log('[Pipeline] Running Layer 3a (Gemini Flash)...');
  const ocrContext = l1.ocrText || l2.ocrText;
  const l3a = await runLayer3(geminiParams('gemini-2.0-flash', ocrContext, thresholds.layer3a));
  if (l3a.passed) {
    return { invoices: l3a.invoices, extractionLayer: 'gemini-flash', usedModel: l3a.usedModel };
  }

  // Step 4: Layer 3b — Gemini Pro (best effort, always accept)
  console.log('[Pipeline] Running Layer 3b (Gemini Pro — best effort)...');
  const l3b = await runLayer3(geminiParams('gemini-2.5-pro', ocrContext, 0));
  return { invoices: l3b.invoices, extractionLayer: 'gemini-pro', usedModel: l3b.usedModel };
}
