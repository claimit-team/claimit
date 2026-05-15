#!/usr/bin/env bash
#
# verify_health.sh — probe /health on every Cloud Run agent service.
#
# Invoked by .github/workflows/deploy-prod.yml as the final gate. The job
# passes GCP_REGION via env; the project is already set on the gcloud config
# by setup-gcloud@v2 (project_id input), so the bare `gcloud run services
# describe` call below picks the right project automatically.
#
set -euo pipefail

echo "=== Verifying Cloud Run service health ==="

REGION="${GCP_REGION:-us-east1}"
AGENTS=(ingest-agent monitor-agent claim-agent assistant-agent sync-worker)
FAILED=()

for agent in "${AGENTS[@]}"; do
  SERVICE_NAME="claimit-${agent}"
  echo ""
  echo ">>> Checking ${SERVICE_NAME}..."

  URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --region="${REGION}" \
    --format='value(status.url)' 2>/dev/null || echo "")

  if [ -z "${URL}" ]; then
    echo "  ✗ Could not retrieve URL"
    FAILED+=("${SERVICE_NAME}")
    continue
  fi

  echo "  URL: ${URL}"

  HEALTH_URL="${URL}/health"
  HTTP_CODE=$(curl -s -o /tmp/health-response.txt -w "%{http_code}" \
    -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=${URL})" \
    "${HEALTH_URL}" || echo "000")

  if [ "${HTTP_CODE}" = "200" ]; then
    RESPONSE=$(cat /tmp/health-response.txt)
    echo "  ✓ ${HTTP_CODE}: ${RESPONSE}"
  else
    echo "  ✗ ${HTTP_CODE} (expected 200)"
    cat /tmp/health-response.txt 2>/dev/null || true
    FAILED+=("${SERVICE_NAME}")
  fi
done

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "=== All ${#AGENTS[@]} services healthy ✓ ==="
  exit 0
else
  echo "=== Failed: ${FAILED[*]} ==="
  exit 1
fi
