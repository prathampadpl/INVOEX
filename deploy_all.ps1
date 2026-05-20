# INVOEX v2.0 — Complete Cloud Deployment Script (PowerShell)
# ============================================================
# Deploys PaddleOCR to Cloud Run AND Firebase Functions to production.
# Run from: C:\Users\prath\.gemini\antigravity\scratch\invoex
# Usage: .\deploy_all.ps1

$ErrorActionPreference = "Stop"

# ── Config ────────────────────────────────────────────────────────────────────
$PROJECT_ID   = "gen-lang-client-00224039-a9ae1"
$REGION       = "asia-south1"          # Mumbai — closest to Indian users
$SERVICE_NAME = "invoex-paddle-ocr"
$IMAGE        = "gcr.io/$PROJECT_ID/$SERVICE_NAME`:latest"
$PADDLE_SRC   = "C:\Users\prath\Downloads\PaddleOCR-main.zip"
$BUILD_CTX    = "paddle_server"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " INVOEX v2.0 — Full Cloud Deployment" -ForegroundColor Cyan
Write-Host " Project : $PROJECT_ID" -ForegroundColor Cyan
Write-Host " Region  : $REGION" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ── Step 1: Set GCP project ───────────────────────────────────────────────────
Write-Host "`n[1/7] Setting GCP project..." -ForegroundColor Yellow
gcloud config set project $PROJECT_ID
Write-Host "      OK" -ForegroundColor Green

# ── Step 2: Enable required APIs ─────────────────────────────────────────────
Write-Host "`n[2/7] Enabling GCP APIs..." -ForegroundColor Yellow
gcloud services enable `
    cloudbuild.googleapis.com `
    run.googleapis.com `
    containerregistry.googleapis.com `
    secretmanager.googleapis.com `
    --project=$PROJECT_ID
Write-Host "      OK" -ForegroundColor Green

# ── Step 3: Prepare PaddleOCR source in Docker build context ─────────────────
Write-Host "`n[3/7] Preparing PaddleOCR source for Docker build..." -ForegroundColor Yellow

$destSrc = "$BUILD_CTX\PaddleOCR-main"
if (Test-Path $destSrc) { Remove-Item $destSrc -Recurse -Force }

if (Test-Path "$BUILD_CTX\_src\PaddleOCR-main") {
    Copy-Item "$BUILD_CTX\_src\PaddleOCR-main" $destSrc -Recurse
    Write-Host "      Copied from extracted _src/" -ForegroundColor Green
} elseif (Test-Path $PADDLE_SRC) {
    Write-Host "      Extracting from ZIP..." -ForegroundColor Gray
    Expand-Archive -Path $PADDLE_SRC -DestinationPath "$BUILD_CTX\_src" -Force
    Copy-Item "$BUILD_CTX\_src\PaddleOCR-main" $destSrc -Recurse
    Write-Host "      Extracted and copied" -ForegroundColor Green
} else {
    Write-Host "ERROR: PaddleOCR source not found. Expected: $PADDLE_SRC" -ForegroundColor Red
    exit 1
}

# ── Step 4: Build Docker image via Cloud Build ────────────────────────────────
Write-Host "`n[4/7] Building Docker image via Cloud Build (5-10 min)..." -ForegroundColor Yellow
Write-Host "      Image: $IMAGE" -ForegroundColor Gray
gcloud builds submit $BUILD_CTX `
    --tag=$IMAGE `
    --project=$PROJECT_ID `
    --timeout=1800 `
    --machine-type=E2_HIGHCPU_8

# Cleanup source from build context
Remove-Item $destSrc -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "      Build complete" -ForegroundColor Green

# ── Step 5: Deploy to Cloud Run ───────────────────────────────────────────────
Write-Host "`n[5/7] Deploying to Cloud Run ($REGION)..." -ForegroundColor Yellow
gcloud run deploy $SERVICE_NAME `
    --image=$IMAGE `
    --region=$REGION `
    --platform=managed `
    --allow-unauthenticated `
    --memory=4Gi `
    --cpu=2 `
    --concurrency=1 `
    --min-instances=0 `
    --max-instances=3 `
    --timeout=120s `
    --port=8080 `
    --set-env-vars="PORT=8080" `
    --project=$PROJECT_ID

# Get the deployed URL
$SERVICE_URL = gcloud run services describe $SERVICE_NAME `
    --region=$REGION `
    --project=$PROJECT_ID `
    --format="value(status.url)"

Write-Host "      Cloud Run URL: $SERVICE_URL" -ForegroundColor Green

# ── Step 6: Wire URL into Firebase Functions secrets ─────────────────────────
Write-Host "`n[6/7] Setting Firebase secrets..." -ForegroundColor Yellow
Write-Host "      Setting PADDLE_CLOUD_RUN_URL..."
$SERVICE_URL | firebase functions:secrets:set PADDLE_CLOUD_RUN_URL --data-file=-

Write-Host ""
Write-Host "      Now set GEMINI_API_KEY (paste your key when prompted):"
firebase functions:secrets:set GEMINI_API_KEY

Write-Host ""
Write-Host "      Now set CASHFREE_CLIENT_SECRET (paste your key when prompted):"
firebase functions:secrets:set CASHFREE_CLIENT_SECRET

Write-Host "      All secrets set" -ForegroundColor Green

# ── Step 7: Build frontend + deploy everything ────────────────────────────────
Write-Host "`n[7/7] Building frontend and deploying all Firebase services..." -ForegroundColor Yellow
npm run build
firebase deploy

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " INVOEX v2.0 IS LIVE" -ForegroundColor Green
Write-Host ""
Write-Host " PaddleOCR Layer 2 : $SERVICE_URL" -ForegroundColor White
Write-Host " Health check      : $SERVICE_URL/health" -ForegroundColor White
Write-Host ""
Write-Host " Firebase Hosting  : https://$PROJECT_ID.web.app" -ForegroundColor White
Write-Host ""
Write-Host " Cashfree webhook  : copy the cashfreeWebhookHandler URL" -ForegroundColor White
Write-Host "                     from the deploy output above and paste" -ForegroundColor White
Write-Host "                     it into Cashfree Dashboard > Webhooks" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Green
