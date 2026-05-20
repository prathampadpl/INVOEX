#!/usr/bin/env bash
# =============================================================================
# INVOEX v2.0 — PaddleOCR Cloud Run Deploy Script
# =============================================================================
# Deploys the PP-OCRv5 service to Google Cloud Run and wires it into
# the Firebase Cloud Function Layer 2 via PADDLE_CLOUD_RUN_URL secret.
#
# Prerequisites:
#   1. gcloud CLI installed and authenticated: gcloud auth login
#   2. Docker installed (for local build) — OR use Cloud Build (recommended)
#   3. Your GCP project set: gcloud config set project YOUR_PROJECT_ID
#
# Usage:
#   cd paddle_server
#   chmod +x deploy.sh
#   ./deploy.sh
# =============================================================================

set -euo pipefail

# ── Config — Edit these ───────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
REGION="${CLOUD_RUN_REGION:-asia-south1}"     # Mumbai — closest to Indian users
SERVICE_NAME="invoex-paddle-ocr"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " INVOEX PaddleOCR — Cloud Run Deployment"
echo " Project : ${PROJECT_ID}"
echo " Region  : ${REGION}"
echo " Service : ${SERVICE_NAME}"
echo " Image   : ${IMAGE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 0: Ensure required GCP APIs are enabled ──────────────────────────────
echo ""
echo "[1/5] Enabling required GCP APIs…"
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    secretmanager.googleapis.com \
    --project="${PROJECT_ID}"

# ── Step 1: Copy PaddleOCR source into build context ─────────────────────────
echo ""
echo "[2/5] Preparing PaddleOCR source for Docker build…"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${SCRIPT_DIR}/_src/PaddleOCR-main"

if [ ! -d "${SRC_DIR}" ]; then
    echo "❌  ERROR: ${SRC_DIR} not found."
    echo "    Please extract PaddleOCR-main.zip into paddle_server/_src/ first:"
    echo "    unzip ~/Downloads/PaddleOCR-main.zip -d paddle_server/_src/"
    exit 1
fi

# Copy into build context (Dockerfile expects ./PaddleOCR-main/)
cp -r "${SRC_DIR}" "${SCRIPT_DIR}/PaddleOCR-main"
echo "    ✓ PaddleOCR source copied to build context"

# ── Step 2: Build image via Cloud Build (faster, no local Docker needed) ──────
echo ""
echo "[3/5] Building Docker image via Cloud Build (may take 5-10 min for first build)…"
gcloud builds submit "${SCRIPT_DIR}" \
    --tag="${IMAGE}" \
    --project="${PROJECT_ID}" \
    --timeout=1800 \
    --machine-type=E2_HIGHCPU_8

# Cleanup copied source
rm -rf "${SCRIPT_DIR}/PaddleOCR-main"
echo "    ✓ Image built and pushed: ${IMAGE}"

# ── Step 3: Deploy to Cloud Run ───────────────────────────────────────────────
echo ""
echo "[4/5] Deploying to Cloud Run…"
gcloud run deploy "${SERVICE_NAME}" \
    --image="${IMAGE}" \
    --region="${REGION}" \
    --platform=managed \
    --allow-unauthenticated \
    --memory=4Gi \
    --cpu=2 \
    --concurrency=1 \
    --min-instances=0 \
    --max-instances=3 \
    --timeout=120s \
    --port=8080 \
    --set-env-vars="PORT=8080" \
    --project="${PROJECT_ID}"

# ── Step 4: Get service URL and wire into Firebase Functions ─────────────────
echo ""
echo "[5/5] Wiring Cloud Run URL into Firebase Functions secret…"
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format="value(status.url)")

echo "    ✓ Cloud Run service URL: ${SERVICE_URL}"

# Store as Firebase Functions secret
firebase functions:secrets:set PADDLE_CLOUD_RUN_URL --data-file=- <<< "${SERVICE_URL}"
echo "    ✓ PADDLE_CLOUD_RUN_URL secret set in Firebase"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✅  PaddleOCR Layer 2 is LIVE"
echo ""
echo "   Cloud Run URL : ${SERVICE_URL}"
echo "   Health check  : curl ${SERVICE_URL}/health"
echo ""
echo "   Next: firebase deploy --only functions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
