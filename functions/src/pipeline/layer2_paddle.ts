/**
 * INVOEX v2.0 — Embedded PaddleOCR Engine (Layer 2)
 * ===================================================
 * Runs PaddleOCR PP-OCRv5 models ENTIRELY inside the Firebase Cloud Function.
 * NO external services. NO Cloud Run. NO RapidAPI. Pure ONNX inference in Node.js.
 *
 * Architecture:
 *   Buffer → [Det Model (ONNX)] → text boxes → [Rec Model (ONNX)] → text + scores
 *
 * Models auto-downloaded from PaddlePaddle CDN on first cold start and cached
 * in /tmp (Cloud Functions ephemeral filesystem, persists across warm invocations).
 *
 * Models used (PP-OCRv5 mobile — optimised for speed):
 *   Detection : PP-OCRv5_mobile_det  (~4.5 MB ONNX)
 *   Recognition: en_PP-OCRv5_mobile_rec (~12 MB ONNX)
 *
 * Pre-processing and post-processing logic is ported directly from the
 * official PaddleOCR JS SDK source:
 *   PaddleOCR-main/paddleocr-js/packages/core/src/models/det.ts
 *   PaddleOCR-main/paddleocr-js/packages/core/src/models/rec.ts
 */

import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

// ── Model URLs (PaddlePaddle official CDN) ────────────────────────────────────
const MODEL_BASE = 'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0b2';

const MODEL_URLS: Record<string, string> = {
  det: `${MODEL_BASE}/PP-OCRv5_mobile_det_infer.tar`,
  rec: `${MODEL_BASE}/en_PP-OCRv5_mobile_rec_infer.tar`,
};

// Alternative direct ONNX model URLs (HuggingFace mirror — faster)
const ONNX_URLS: Record<string, string> = {
  det: 'https://huggingface.co/paddlepaddle/PaddleOCR/resolve/main/PP-OCRv5_mobile_det.onnx',
  rec: 'https://huggingface.co/paddlepaddle/PaddleOCR/resolve/main/en_PP-OCRv5_mobile_rec.onnx',
};

// Character set for English recognition (PP-OCRv5 en dict)
const EN_CHAR_LIST_URL = 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/en_dict.txt';

// Local cache directory (Cloud Functions /tmp persists across warm invocations)
const CACHE_DIR = '/tmp/invoex_paddle_models';

// ── Pre-processing constants (from PaddleOCR JS SDK det.ts) ──────────────────
const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD  = [0.229, 0.224, 0.225];
const DET_LIMIT_SIDE = 960;
const DET_THRESH = 0.3;
const DET_BOX_THRESH = 0.5;
const DET_UNCLIP_RATIO = 1.5;

// ── Inference session cache (warm across invocations) ────────────────────────
let detSession: ort.InferenceSession | null = null;
let recSession: ort.InferenceSession | null = null;
let charList: string[] = [];
let modelsReady = false;

// ── HTTP download helper ──────────────────────────────────────────────────────
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;

    const request = client.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(response.headers.location!, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });

    request.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });

    request.setTimeout(120_000, () => {
      request.destroy();
      reject(new Error(`Timeout downloading ${url}`));
    });
  });
}

async function downloadText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    let data = '';
    client.get(url, (res) => {
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Model loader (downloads once, caches in /tmp) ────────────────────────────
async function ensureModelsLoaded(): Promise<void> {
  if (modelsReady) return;

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const detPath = path.join(CACHE_DIR, 'det.onnx');
  const recPath = path.join(CACHE_DIR, 'rec.onnx');
  const charPath = path.join(CACHE_DIR, 'en_dict.txt');

  console.log('[PaddleOCR] Checking cached models in', CACHE_DIR);

  // Download detection model if not cached
  if (!fs.existsSync(detPath)) {
    console.log('[PaddleOCR] Downloading det model (~4.5MB)...');
    await downloadFile(ONNX_URLS.det, detPath);
    console.log('[PaddleOCR] Det model cached.');
  }

  // Download recognition model if not cached
  if (!fs.existsSync(recPath)) {
    console.log('[PaddleOCR] Downloading rec model (~12MB)...');
    await downloadFile(ONNX_URLS.rec, recPath);
    console.log('[PaddleOCR] Rec model cached.');
  }

  // Download character list if not cached
  if (!fs.existsSync(charPath)) {
    console.log('[PaddleOCR] Downloading character list...');
    const chars = await downloadText(EN_CHAR_LIST_URL);
    fs.writeFileSync(charPath, chars);
  }

  // Load character list
  const charContent = fs.readFileSync(charPath, 'utf-8');
  charList = ['blank', ...charContent.split('\n').filter(c => c.trim()), ' '];

  // Create ONNX inference sessions
  const sessionOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    enableCpuMemArena: true,
  };

  console.log('[PaddleOCR] Loading ONNX sessions...');
  [detSession, recSession] = await Promise.all([
    ort.InferenceSession.create(detPath, sessionOptions),
    ort.InferenceSession.create(recPath, sessionOptions),
  ]);

  modelsReady = true;
  console.log('[PaddleOCR] ✅ Models loaded and ready.');
}

// ── Image pre-processing ──────────────────────────────────────────────────────
interface PreparedImage {
  tensor:  ort.Tensor;
  origW:   number;
  origH:   number;
  scaledW: number;
  scaledH: number;
}

async function preprocessForDet(buffer: Buffer): Promise<PreparedImage> {
  const meta = await sharp(buffer).metadata();
  let origW = meta.width  || 640;
  let origH = meta.height || 640;

  // Scale so longest side <= DET_LIMIT_SIDE, and divisible by 32
  let scale = 1.0;
  if (Math.max(origW, origH) > DET_LIMIT_SIDE) {
    scale = DET_LIMIT_SIDE / Math.max(origW, origH);
  }
  let scaledW = Math.round(origW * scale / 32) * 32;
  let scaledH = Math.round(origH * scale / 32) * 32;
  if (scaledW < 32) scaledW = 32;
  if (scaledH < 32) scaledH = 32;

  // Get raw RGB pixels
  const { data } = await sharp(buffer)
    .resize(scaledW, scaledH, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Build CHW float32 tensor with ImageNet normalisation
  const float32 = new Float32Array(3 * scaledH * scaledW);
  const channelSize = scaledH * scaledW;

  for (let i = 0; i < channelSize; i++) {
    const r = data[i * 3]     / 255;
    const g = data[i * 3 + 1] / 255;
    const b = data[i * 3 + 2] / 255;
    float32[0 * channelSize + i] = (r - DET_MEAN[0]) / DET_STD[0];
    float32[1 * channelSize + i] = (g - DET_MEAN[1]) / DET_STD[1];
    float32[2 * channelSize + i] = (b - DET_MEAN[2]) / DET_STD[2];
  }

  return {
    tensor:  new ort.Tensor('float32', float32, [1, 3, scaledH, scaledW]),
    origW,
    origH,
    scaledW,
    scaledH,
  };
}

// ── Detection post-processing ─────────────────────────────────────────────────
interface BBox { x1: number; y1: number; x2: number; y2: number }

function extractBoxes(probMap: Float32Array, mapH: number, mapW: number, origW: number, origH: number): BBox[] {
  const scaleX = origW / mapW;
  const scaleY = origH / mapH;
  const boxes: BBox[] = [];

  // Simple threshold + connected components bounding box extraction
  const visited = new Uint8Array(mapH * mapW);

  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const idx = y * mapW + x;
      if (visited[idx] || probMap[idx] < DET_THRESH) continue;

      // BFS flood fill to find connected component
      const queue: number[] = [idx];
      visited[idx] = 1;
      let minX = x, maxX = x, minY = y, maxY = y;
      let sumConf = 0, count = 0;

      while (queue.length > 0) {
        const cur = queue.pop()!;
        const cy = Math.floor(cur / mapW);
        const cx = cur % mapW;
        sumConf += probMap[cur];
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          cur - 1, cur + 1, cur - mapW, cur + mapW,
        ];
        for (const n of neighbors) {
          if (n < 0 || n >= mapH * mapW) continue;
          const ny = Math.floor(n / mapW);
          const nx = n % mapW;
          if (Math.abs(ny - cy) + Math.abs(nx - cx) > 1) continue;
          if (visited[n] || probMap[n] < DET_THRESH) continue;
          visited[n] = 1;
          queue.push(n);
        }
      }

      const avgConf = sumConf / count;
      if (avgConf < DET_BOX_THRESH) continue;
      if (maxX - minX < 2 || maxY - minY < 2) continue;

      // Apply unclip ratio (expand box slightly)
      const area = (maxX - minX) * (maxY - minY);
      const perim = 2 * ((maxX - minX) + (maxY - minY));
      const expand = area * DET_UNCLIP_RATIO / perim;

      boxes.push({
        x1: Math.max(0, Math.round((minX - expand) * scaleX)),
        y1: Math.max(0, Math.round((minY - expand) * scaleY)),
        x2: Math.min(origW - 1, Math.round((maxX + expand) * scaleX)),
        y2: Math.min(origH - 1, Math.round((maxY + expand) * scaleY)),
      });
    }
  }

  // Sort top-to-bottom, left-to-right (reading order)
  return boxes.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
}

// ── Recognition pre-processing ────────────────────────────────────────────────
const REC_IMG_H = 48;
const REC_IMG_W = 320;
const REC_MEAN  = 0.5;
const REC_STD   = 0.5;

async function preprocessForRec(cropBuf: Buffer): Promise<ort.Tensor> {
  const { data } = await sharp(cropBuf)
    .resize(REC_IMG_W, REC_IMG_H, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const float32 = new Float32Array(1 * REC_IMG_H * REC_IMG_W);
  for (let i = 0; i < REC_IMG_H * REC_IMG_W; i++) {
    float32[i] = (data[i] / 255 - REC_MEAN) / REC_STD;
  }

  return new ort.Tensor('float32', float32, [1, 1, REC_IMG_H, REC_IMG_W]);
}

// ── CTC Greedy Decoder ────────────────────────────────────────────────────────
function ctcDecode(logits: Float32Array, numSteps: number, numChars: number): { text: string; score: number } {
  const chars: string[] = [];
  const scores: number[] = [];
  let prevIdx = -1;

  for (let t = 0; t < numSteps; t++) {
    // Argmax over character dimension
    let maxVal = -Infinity;
    let maxIdx = 0;
    for (let c = 0; c < numChars; c++) {
      const v = logits[t * numChars + c];
      if (v > maxVal) { maxVal = v; maxIdx = c; }
    }

    // Convert logit to probability via softmax approximation
    const prob = Math.exp(maxVal) / (Math.exp(maxVal) + 1);

    if (maxIdx !== 0 && maxIdx !== prevIdx) {  // 0 = blank token
      const ch = charList[maxIdx] || '';
      if (ch && ch !== '\n') {
        chars.push(ch);
        scores.push(prob);
      }
    }
    prevIdx = maxIdx;
  }

  const text = chars.join('');
  const score = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  return { text, score };
}

// ── Public Layer 2 Result interface (matches existing layer2_paddle.ts) ───────
export interface Layer2Result {
  passed:            boolean;
  ocrText:           string;
  overallConfidence: number;
}

// ── Main OCR Function ─────────────────────────────────────────────────────────
export async function runLayer2(
  buffer:       Buffer,
  mimetype:     string,
  ocrThreshold: number,
): Promise<Layer2Result> {

  // Only process images — PDFs not supported by embedded engine
  if (!mimetype.startsWith('image/')) {
    console.log('[PaddleOCR-Embedded] Non-image type, skipping.');
    return { passed: false, ocrText: '', overallConfidence: 0 };
  }

  const t0 = Date.now();

  try {
    await ensureModelsLoaded();

    if (!detSession || !recSession) {
      throw new Error('ONNX sessions not initialised.');
    }

    // ── Step 1: Text Detection ─────────────────────────────────────────────
    console.log('[PaddleOCR-Embedded] Running detection...');
    const prep = await preprocessForDet(buffer);
    const detFeeds = { x: prep.tensor };
    const detResults = await detSession.run(detFeeds);

    // Output tensor name: first output key
    const detOutputKey = Object.keys(detResults)[0];
    const probData = detResults[detOutputKey].data as Float32Array;
    const [, , mapH, mapW] = detResults[detOutputKey].dims as number[];

    const boxes = extractBoxes(probData, mapH, mapW, prep.origW, prep.origH);
    console.log(`[PaddleOCR-Embedded] Detected ${boxes.length} text regions.`);

    if (boxes.length === 0) {
      return { passed: false, ocrText: '', overallConfidence: 0 };
    }

    // ── Step 2: Text Recognition per crop ─────────────────────────────────
    console.log('[PaddleOCR-Embedded] Running recognition...');
    const textLines: string[] = [];
    const allScores: number[] = [];

    for (const box of boxes) {
      try {
        // Crop the text region from original image
        const cropW = Math.max(1, box.x2 - box.x1);
        const cropH = Math.max(1, box.y2 - box.y1);

        const cropBuf = await sharp(buffer)
          .extract({ left: box.x1, top: box.y1, width: cropW, height: cropH })
          .toBuffer();

        const recTensor = await preprocessForRec(cropBuf);
        const recFeeds = { x: recTensor };
        const recResults = await recSession.run(recFeeds);

        // Get CTC output logits
        const recKey = Object.keys(recResults)[0];
        const logits  = recResults[recKey].data as Float32Array;
        const dims     = recResults[recKey].dims as number[];
        const numSteps = dims[1];
        const numChars = dims[2];

        const { text, score } = ctcDecode(logits, numSteps, numChars);

        if (text.trim()) {
          textLines.push(text.trim());
          allScores.push(score);
        }
      } catch (cropErr) {
        console.warn('[PaddleOCR-Embedded] Crop recognition failed, skipping box:', cropErr);
      }
    }

    // ── Step 3: Aggregate results ──────────────────────────────────────────
    const ocrText = textLines.join('\n');
    const overallConfidence = allScores.length > 0
      ? Math.min(100, Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length * 100))
      : 0;

    const elapsed = Date.now() - t0;
    console.log(
      `[PaddleOCR-Embedded] ✅ Done in ${elapsed}ms | ` +
      `${textLines.length} lines | confidence: ${overallConfidence}%`
    );

    return {
      passed: overallConfidence >= ocrThreshold,
      ocrText,
      overallConfidence,
    };

  } catch (err: any) {
    console.error('[PaddleOCR-Embedded] OCR failed:', err?.message || err);
    return { passed: false, ocrText: '', overallConfidence: 0 };
  }
}
