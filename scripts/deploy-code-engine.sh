#!/usr/bin/env bash
# ==============================================================================
# Partner Growth Copilot - IBM Cloud Code Engine Automated Deployment Script
# ==============================================================================
set -e

APP_NAME="partner-growth-copilot"
PROJECT_NAME="partner-growth-project"
REGION="us-south"

echo "=================================================="
echo "🚀 Deploying ${APP_NAME} to IBM Cloud Code Engine"
echo "=================================================="

# 1. Target region and Code Engine project
echo "[1/4] Targeting region ${REGION} and Code Engine project ${PROJECT_NAME}..."
ibmcloud target -r ${REGION} || true
ibmcloud ce project select --name ${PROJECT_NAME} || ibmcloud ce project create --name ${PROJECT_NAME}

# 2. Deploy or update application directly from local source
echo "[2/4] Building and deploying application from source..."
ibmcloud ce application create --name ${APP_NAME} \
  --build-source . \
  --port 3000 \
  --min-scale 1 \
  --max-scale 5 \
  --env PORT=3000 \
  --env PGC_API_KEY="${PGC_API_KEY}" \
  --env WATSONX_SERVICE_URL="${WATSONX_SERVICE_URL}" \
  --env WATSONX_PROJECT_ID="${WATSONX_PROJECT_ID}" \
  --env WATSONX_MODEL_ID="${WATSONX_MODEL_ID}" \
  --env WATSONX_VERSION="${WATSONX_VERSION}" \
  --env WATSONX_API_KEY="${WATSONX_API_KEY}" \
  || ibmcloud ce application update --name ${APP_NAME} \
  --build-source . \
  --env PORT=3000 \
  --env PGC_API_KEY="${PGC_API_KEY}" \
  --env WATSONX_SERVICE_URL="${WATSONX_SERVICE_URL}" \
  --env WATSONX_PROJECT_ID="${WATSONX_PROJECT_ID}" \
  --env WATSONX_MODEL_ID="${WATSONX_MODEL_ID}" \
  --env WATSONX_VERSION="${WATSONX_VERSION}" \
  --env WATSONX_API_KEY="${WATSONX_API_KEY}"

# 3. Retrieve public HTTPS URL
echo "[3/4] Fetching public application URL..."
APP_URL=$(ibmcloud ce application get --name ${APP_NAME} --output json | grep -o 'https://[^"]*codeengine.appdomain.cloud' | head -n 1)

echo "=================================================="
echo "✅ Deployment complete!"
echo "Public HTTPS Endpoint: ${APP_URL}/generate-proposal"
echo "=================================================="
