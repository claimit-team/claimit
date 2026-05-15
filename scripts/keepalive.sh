#!/usr/bin/env bash
#
# keepalive.sh — pings frontend + 4 Cloud Run agent /health endpoints to prevent cold starts.
#
# Invoked by .github/workflows/keepalive.yml every 5 minutes (08:00-22:00 UTC).
# Per ticket 1.25: no assertions — just send the requests. Logs are visible in Actions tab.
# Per master doc §10 Risk #11: cold-start mitigation for demo URL stability.
#
# Cloud Run services use IAM-authenticated invocations (no --allow-unauthenticated).
# Each curl includes an OIDC identity token scoped to the service URL.
#
set -uo pipefail

REGION="${GCP_REGION:-us-east1}"
FRONTEND_URL="${FRONTEND_URL:-https://claimitai.vercel.app}"
AGENTS=(ingest-agent monitor-agent claim-agent assistant-agent)

echo "=== Keepalive ping $(date -u +'%Y-%m-%d %H:%M:%S UTC') ==="

# Ping frontend (public, no auth needed)
echo ""
echo ">>> Frontend: ${FRONTEND_URL}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 5 \
  "${FRONTEND_URL}" || echo "000")
echo "  HTTP ${HTTP_CODE}"

# Ping each agent /health (Cloud Run IAM-authenticated)
for agent in "${AGENTS[@]}"; do
  SERVICE_NAME="claimit-${agent}"
  echo ""
  echo ">>> Agent: ${SERVICE_NAME}"

  URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --region="${REGION}" \
    --format='value(status.url)' 2>/dev/null || echo "")

  if [ -z "${URL}" ]; then
    echo "  ✗ Could not retrieve URL"
    continue
  fi

  HEALTH_URL="${URL}/health"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 5 \
    -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences="${URL}")" \
    "${HEALTH_URL}" || echo "000")
  echo "  ${HEALTH_URL}: HTTP ${HTTP_CODE}"
done

echo ""
echo "=== Keepalive ping complete ==="

# Always exit 0 per ticket "No assertions — pings only"
exit 0
