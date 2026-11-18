#!/usr/bin/env bash
# Deploys to Cloud Run from source (Cloud Build builds the Dockerfile).
# Usage: PROJECT_ID=my-project ./deploy.sh
# Prerequisites: gcloud auth login; billing enabled; a secret named gemini-api-key (optional — without it the app runs in offline mode).
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-misconception-detective}"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

SECRET_FLAGS=()
if gcloud secrets describe gemini-api-key >/dev/null 2>&1; then
  SECRET_FLAGS=(--set-secrets "GEMINI_API_KEY=gemini-api-key:latest")
fi

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 512Mi --cpu 1 \
  --min-instances 0 --max-instances 3 \
  --concurrency 80 --timeout 30 \
  --set-env-vars "GEMINI_MODEL=${GEMINI_MODEL:-gemini-2.5-flash}" \
  "${SECRET_FLAGS[@]}"

gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)'
