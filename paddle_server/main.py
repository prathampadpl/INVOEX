"""
INVOEX v2.0 — PaddleOCR v5 Cloud Run Service
==============================================
Built from the official PaddleOCR-main ZIP (PaddlePaddle/PaddleOCR).
Uses PP-OCRv5 pipeline with PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec
for English/Hindi Indian GST invoices.

Architecture:
  Firebase Cloud Function (Node.js) → HTTP POST /ocr
    → PaddleOCR Cloud Run (Python 3.11)
        → paddleocr.PaddleOCR(lang='en', ocr_version='PP-OCRv5')
        → returns { data: [{transcription, score, box}], overall_confidence }

Endpoints:
  GET  /health  — Cloud Run liveness probe
  POST /ocr     — base64 image → OCR blocks + confidence
"""

from __future__ import annotations

import base64
import io
import logging
import os
import time
import tempfile
from typing import Any

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel

# ── PaddleOCR v5 ─────────────────────────────────────────────────────────────
from paddleocr import PaddleOCR

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("invoex-paddle")

# ── Singleton OCR engine (warm on first request, then cached) ─────────────────
_OCR_ENGINE: PaddleOCR | None = None

def get_engine() -> PaddleOCR:
    """
    Lazy-initialise PP-OCRv5 with settings tuned for Indian GST invoices:
      - lang='en'            : English text (GST invoices are primarily English)
      - ocr_version='PP-OCRv5': Latest model — PP-OCRv5_server_det + en_PP-OCRv5_mobile_rec
      - use_textline_orientation=True: Auto-correct rotated/skewed invoice scans
      - use_doc_orientation_classify=True: Correct 90°/180° rotated documents
      - text_det_thresh=0.3  : Lower threshold catches dense invoice tables
    """
    global _OCR_ENGINE
    if _OCR_ENGINE is None:
        log.info("🚀 Initialising PP-OCRv5 engine… (first request, ~20-40s)")
        t0 = time.perf_counter()
        _OCR_ENGINE = PaddleOCR(
            lang="en",
            ocr_version="PP-OCRv5",
            use_doc_orientation_classify=True,   # Handle upside-down / rotated scans
            use_doc_unwarping=False,             # Disabled — adds 3s latency, GST invoices are mostly flat
            use_textline_orientation=True,       # Handle rotated text lines
            text_det_thresh=0.3,                 # Catch more text in dense table layouts
            text_det_box_thresh=0.5,
            text_rec_score_thresh=0.0,           # Return all detections, we'll filter by score
        )
        elapsed = time.perf_counter() - t0
        log.info(f"✅ PP-OCRv5 ready in {elapsed:.1f}s")
    return _OCR_ENGINE

# ── FastAPI ───────────────────────────────────────────────────────────────────
app = FastAPI(
    title="INVOEX PaddleOCR Service",
    version="2.0.0",
    description="PP-OCRv5 microservice for INVOEX v2.0 (Firebase Layer 2)",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Models ────────────────────────────────────────────────────────────────────
class OcrRequest(BaseModel):
    """
    Accepts two modes (matches layer2_paddle.ts):
      • images: list[str]  — raw base64 strings (no data URI prefix)
      • url:    str        — data URI  "data:image/png;base64,..."
    """
    images: list[str] | None = None
    url:    str | None        = None

class OcrBlock(BaseModel):
    transcription: str
    score:         float
    box:           list[list[float]] | None = None

class OcrResponse(BaseModel):
    success:            bool
    data:               list[OcrBlock]
    overall_confidence: float
    processing_ms:      int
    engine:             str = "PP-OCRv5"

# ── Helpers ───────────────────────────────────────────────────────────────────
def b64_to_numpy(b64: str) -> np.ndarray:
    """Decode base64 image (with or without data URI prefix) → numpy RGB array."""
    if "," in b64:
        b64 = b64.split(",", 1)[1]               # strip "data:image/png;base64," prefix
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")

    # Upscale low-res scans — PP-OCRv5 works best at >= 1000px wide
    w, h = img.size
    if w < 1000:
        scale = 1000 / w
        img   = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        log.info(f"Upscaled {w}x{h} → {img.size}")

    return np.array(img)


def parse_v5_results(results: list[Any]) -> list[dict]:
    """
    Parse PP-OCRv5 predict() output.

    PP-OCRv5 returns a list of OCRResult objects per image.
    Each result has `.rec_texts`, `.rec_scores`, `.rec_polys` attributes.
    We iterate over all images and flatten into a list of blocks.
    """
    blocks: list[dict] = []

    for result in results:
        # PP-OCRv5 result object — access via attribute or dict interface
        try:
            texts  = result.rec_texts  if hasattr(result, 'rec_texts')  else []
            scores = result.rec_scores if hasattr(result, 'rec_scores') else []
            polys  = result.rec_polys  if hasattr(result, 'rec_polys')  else []
        except Exception:
            # Fallback: try dict-style access used in some paddlex versions
            try:
                texts  = result.get('rec_texts', [])  or []
                scores = result.get('rec_scores', []) or []
                polys  = result.get('rec_polys', [])  or []
            except Exception:
                continue

        for i, (text, score) in enumerate(zip(texts, scores)):
            if not text or not text.strip():
                continue
            poly = polys[i].tolist() if i < len(polys) and hasattr(polys[i], 'tolist') else None
            blocks.append({
                "transcription": text.strip(),
                "score":         float(score),
                "box":           poly,
            })

    return blocks

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    """Cloud Run liveness + readiness probe."""
    return {
        "status":  "ok",
        "engine":  "PP-OCRv5",
        "version": "2.0.0",
    }

@app.post("/ocr", response_model=OcrResponse)
async def ocr_endpoint(body: OcrRequest):
    """
    Run PP-OCRv5 on a base64 image.
    Returns a list of text blocks with confidence scores.
    """
    t0 = time.perf_counter()

    # Resolve input
    b64: str | None = None
    if body.images and len(body.images) > 0:
        b64 = body.images[0]
    elif body.url:
        b64 = body.url
    else:
        raise HTTPException(status_code=400, detail="Provide 'images' or 'url'.")

    # Decode image
    try:
        img_array = b64_to_numpy(b64)
    except Exception as e:
        log.error(f"Image decode error: {e}")
        raise HTTPException(status_code=422, detail=f"Cannot decode image: {e}")

    # Write to temp file — PaddleOCR v5 predict() accepts file paths reliably
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            Image.fromarray(img_array).save(tmp.name)
            tmp_path = tmp.name

        engine  = get_engine()
        results = engine.predict(tmp_path)           # PP-OCRv5 new API

    except Exception as e:
        log.error(f"OCR engine error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR engine error: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    # Parse results
    blocks        = parse_v5_results(results)
    scores        = [b["score"] for b in blocks]
    overall_conf  = (sum(scores) / len(scores)) * 100 if scores else 0.0
    ms            = int((time.perf_counter() - t0) * 1000)

    log.info(f"OCR done — {len(blocks)} blocks | conf={overall_conf:.1f}% | {ms}ms")

    return OcrResponse(
        success=True,
        data=[OcrBlock(**b) for b in blocks],
        overall_confidence=round(overall_conf, 2),
        processing_ms=ms,
    )

@app.exception_handler(Exception)
async def global_handler(_: Request, exc: Exception):
    log.error(f"Unhandled: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})

# ── Entry ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    log.info(f"INVOEX PaddleOCR Service on :{port}")
    uvicorn.run(app, host="0.0.0.0", port=port, workers=1)
