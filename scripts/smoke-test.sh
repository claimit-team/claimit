#!/usr/bin/env bash
#
# smoke-test.sh — health probe for ClaimIt prod services.
#
# Invoked by .github/workflows/smoke-test.yml every 6 hours (and via
# workflow_dispatch). Unlike scripts/keepalive.sh (which always exits
# 0), this script ASSERTS on each response: non-200 is a failure.
# All failures are collected (no fail-fast) so a single bad service
# doesn't mask others; the failed-service list is written to
# $GITHUB_OUTPUT for the Slack alert step.
#
# Exit codes:
#   0 — every probe returned HTTP 200
#   1 — at least one probe was non-200 after retries (or service URL/token unobtainable)
#
set -uo pipefail

REGION="${GCP_REGION:-us-east1}"
FRONTEND_URL="${FRONTEND_URL:-https://claimitai.vercel.app}"
AGENTS=(ingest-agent monitor-agent claim-agent assistant-agent sync-worker api-gateway)

# Each probe is retried up to 3 times, 3s apart, before counting as
# failed. Cloud Run cold starts can take 5-10s on first hit; this
# window absorbs that so we don't page on a cold container.
MAX_ATTEMPTS=3
RETRY_DELAY=3

FAILED=()

probe() {
  # $1 = label (for summary + Slack output)
  # $2 = url
  # $3 = optional auth header line (e.g. "Authorization: Bearer <token>")
  local label="$1"
  local url="$2"
  local auth_header="${3:-}"
  local attempt
  local code="000"

  for attempt in $(seq 1 "${MAX_ATTEMPTS}"); do
    if [ -n "${auth_header}" ]; then
      code=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 10 \
        -H "${auth_header}" \
        "${url}" || echo "000")
    else
      code=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 10 \
        "${url}" || echo "000")
    fi

    if [ "${code}" = "200" ]; then
      echo "  ${label}: PASS (HTTP ${code}, attempt ${attempt}/${MAX_ATTEMPTS})"
      return 0
    fi

    echo "  ${label}: attempt ${attempt}/${MAX_ATTEMPTS} -> HTTP ${code}"
    if [ "${attempt}" -lt "${MAX_ATTEMPTS}" ]; then
      sleep "${RETRY_DELAY}"
    fi
  done

  echo "  ${label}: FAIL (last HTTP ${code})"
  FAILED+=("${label}")
  return 1
}

echo "=== Smoke test $(date -u +'%Y-%m-%d %H:%M:%S UTC') ==="

# Frontend (public, no auth needed)
echo ""
echo ">>> Frontend: ${FRONTEND_URL}"
probe "frontend" "${FRONTEND_URL}/" "" || true

# Each agent /health (Cloud Run IAM-authenticated)
for agent in "${AGENTS[@]}"; do
  SERVICE_NAME="claimit-${agent}"
  echo ""
  echo ">>> Agent: ${SERVICE_NAME}"

  URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --region="${REGION}" \
    --format='value(status.url)' 2>/dev/null || echo "")

  if [ -z "${URL}" ]; then
    echo "  ${SERVICE_NAME}: FAIL (could not retrieve service URL)"
    FAILED+=("${SERVICE_NAME}")
    continue
  fi

  TOKEN=$(gcloud auth print-identity-token --audiences="${URL}" 2>/dev/null || echo "")
  if [ -z "${TOKEN}" ]; then
    echo "  ${SERVICE_NAME}: FAIL (could not mint OIDC identity token)"
    FAILED+=("${SERVICE_NAME}")
    continue
  fi

  probe "${SERVICE_NAME}" "${URL}/health" "Authorization: Bearer ${TOKEN}" || true
done

echo ""
echo "=== Smoke test complete ==="

if [ "${#FAILED[@]}" -gt 0 ]; then
  failed_csv=$(IFS=,; echo "${FAILED[*]}")
  echo "FAILED services: ${failed_csv}"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "failed=${failed_csv}" >> "${GITHUB_OUTPUT}"
  fi
  exit 1
fi

echo "All ${#AGENTS[@]} agents + frontend healthy."
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "failed=" >> "${GITHUB_OUTPUT}"
fi
exit 0
