# INVOEX v2.0 — PaddleOCR Cloud Run Service
# ==========================================
# Built from PaddlePaddle/PaddleOCR (PP-OCRv5)
#
# Base: python:3.11-slim (smaller than paddlepaddle/paddle official image)
# Model download happens at FIRST REQUEST (lazy init) — cached in /tmp
# For production: pre-bake models at build time (see comments below)

FROM python:3.11-slim

# System deps required by PaddlePaddle + OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgl1 \
        libgomp1 \
        libsm6 \
        libxext6 \
        libxrender-dev \
        wget \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install Python dependencies ───────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy the PaddleOCR source (from your ZIP) ─────────────────────────────────
COPY PaddleOCR-main/ ./PaddleOCR-main/
RUN pip install --no-cache-dir -e ./PaddleOCR-main/

# ── Copy application server ───────────────────────────────────────────────────
COPY main.py .

# ── Pre-warm: download PP-OCRv5 models at build time ─────────────────────────
# This bakes model weights into the image layer so cold starts are instant.
# Remove this block if you want smaller images and lazy model downloads instead.
RUN python -c "\
from paddleocr import PaddleOCR; \
print('Pre-warming PP-OCRv5 models…'); \
p = PaddleOCR(lang='en', ocr_version='PP-OCRv5', use_doc_orientation_classify=True, use_textline_orientation=True); \
print('Models cached ✓'); \
"

# Cloud Run injects PORT env var
ENV PORT=8080

EXPOSE 8080

# Use 1 worker — PaddleOCR is not thread-safe, use gevent or process-per-container
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--timeout-keep-alive", "120"]
