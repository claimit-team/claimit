#!/usr/bin/env bash
#
# Fetch Secret Manager values + assemble static env vars and write a
# <service>/.env.local file ready for local development.
#
# Usage:
#   ./scripts/fetch_env.sh <service> [--force] [--local-backend]
#
# Services:
#   web              Next.js frontend (apps/web/.env.local)
#   api-gateway      apps/api-gateway/.env.local
#   ingest-agent     apps/ingest-agent/.env.local
#   monitor-agent    apps/monitor-agent/.env.local
#   claim-agent      apps/claim-agent/.env.local
#   assistant-agent  apps/assistant-agent/.env.local
#   sync-worker      apps/sync-worker/.env.local
#
# Flags:
#   --force          overwrite an existing .env.local
#   --local-backend  (web only) pin NEXT_PUBLIC_API_BASE_URL to http://localhost:8005
#                    instead of the deployed Cloud Run URL
#
# Prereqs:
#   1. gcloud auth login                    (Secret Manager access)
#   2. gcloud auth application-default login  (ADC for Firebase Admin / Vertex / Pub-Sub)
#   3. gcloud config set project claimit-beta
#
# ⚠️  All targets connect to PROD claimit-beta data — Mongo writes, Anthropic
#    spend, Firebase users, and outbound Gmail sends are real. See README.

set -euo pipefail

# ---------- constants ----------
readonly PROJECT_ID="claimit-beta"
readonly REGION="us-east1"

# Cloud Run URLs (output of `gcloud run services list`).
readonly DEPLOYED_API_GATEWAY_URL="https://claimit-api-gateway-i4zxjn67hq-ue.a.run.app"
readonly DEPLOYED_ASSISTANT_AGENT_URL="https://claimit-assistant-agent-i4zxjn67hq-ue.a.run.app"

# Static infra constants (mirror infra/terraform).
readonly RECEIPTS_BUCKET="claimit-beta-receipts"
readonly EVIDENCE_BUCKET="claimit-beta-evidence"
readonly GMAIL_INBOUND_TOPIC="projects/${PROJECT_ID}/topics/gmail-inbound"
readonly PHOENIX_BASE_URL="https://app.phoenix.arize.com/s/claimitbeta"
readonly PHOENIX_PROJECT_NAME="claimit"
readonly GATEWAY_SA_EMAIL="claimit-api-gateway@${PROJECT_ID}.iam.gserviceaccount.com"
readonly CLAIMIT_BCC_EMAIL="claimitbeta@gmail.com"
# GMAIL_OAUTH_REDIRECT_URI points at the deployed Cloud Run callback — Gmail
# OAuth from a local api-gateway will start but Google redirects back here,
# not to localhost. Documented as a v1 limitation in the README.
readonly GMAIL_OAUTH_REDIRECT_URI="${DEPLOYED_API_GATEWAY_URL}/api/v1/gmail/callback"

# ---------- colors ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}ℹ${NC}  $1"; }
ok()    { echo -e "${GREEN}✓${NC}  $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
error() { echo -e "${RED}✗${NC}  $1" >&2; }

# ---------- arg parsing ----------
SERVICE=""
FORCE=false
LOCAL_BACKEND=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=true; shift ;;
    --local-backend) LOCAL_BACKEND=true; shift ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      error "Unknown flag: $1"
      exit 1
      ;;
    *)
      if [[ -z "$SERVICE" ]]; then
        SERVICE="$1"
      else
        error "Unexpected argument: $1"
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$SERVICE" ]]; then
  error "Service name required."
  echo ""
  echo "Usage: ./scripts/fetch_env.sh <service> [--force] [--local-backend]"
  echo "Services: web api-gateway ingest-agent monitor-agent claim-agent assistant-agent sync-worker"
  exit 1
fi

# ---------- preflight: gcloud + auth ----------
if ! command -v gcloud &>/dev/null; then
  error "gcloud not installed. See https://cloud.google.com/sdk/docs/install"
  exit 1
fi

ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)
if [[ "$ACTIVE_PROJECT" != "$PROJECT_ID" ]]; then
  error "Active gcloud project is '$ACTIVE_PROJECT'; expected '$PROJECT_ID'."
  echo -e "  Fix: ${CYAN}gcloud config set project $PROJECT_ID${NC}"
  exit 1
fi

if ! gcloud auth print-access-token --quiet &>/dev/null; then
  error "Not authenticated with gcloud."
  echo -e "  Fix: ${CYAN}gcloud auth login${NC}"
  exit 1
fi

# For backend services we also need ADC (Firebase Admin SDK / Vertex / Pub-Sub).
case "$SERVICE" in
  api-gateway|ingest-agent|monitor-agent|claim-agent|assistant-agent|sync-worker)
    if ! gcloud auth application-default print-access-token --quiet &>/dev/null; then
      error "Application Default Credentials not set (required for $SERVICE)."
      echo -e "  Fix: ${CYAN}gcloud auth application-default login${NC}"
      exit 1
    fi
    ;;
esac

# ---------- helpers ----------
# Resolve script-relative paths so the script works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Read a Secret Manager secret payload (latest version).
fetch_secret() {
  local secret_id="$1"
  local payload
  if ! payload=$(gcloud secrets versions access latest --secret="$secret_id" --project="$PROJECT_ID" 2>&1); then
    error "Failed to read secret '$secret_id':"
    echo "$payload" >&2
    return 1
  fi
  printf '%s' "$payload"
}

# Write key=value lines to a tmp file, then atomically move to the target.
# Refuses to overwrite the target unless $FORCE is true.
write_env_file() {
  local target="$1"
  shift
  if [[ -e "$target" && "$FORCE" != "true" ]]; then
    error "$target already exists. Pass --force to overwrite."
    return 1
  fi
  local tmp
  tmp=$(mktemp "${target}.XXXXXX")
  # Header + payload
  {
    echo "# Generated by scripts/fetch_env.sh — do not edit by hand."
    echo "# Re-run with --force to refresh from Secret Manager."
    echo "# Source: GCP project $PROJECT_ID"
    echo ""
    printf '%s\n' "$@"
  } > "$tmp"
  mv "$tmp" "$target"
  ok "Wrote $target"
}

# ---------- per-service builders ----------
build_web() {
  local target="$REPO_ROOT/apps/web/.env.local"
  local api_url
  if [[ "$LOCAL_BACKEND" == "true" ]]; then
    api_url="http://localhost:8005"
    info "Pinning NEXT_PUBLIC_API_BASE_URL to local BFF (port 8005)"
  else
    api_url=$(fetch_secret "web-api-base-url")
  fi
  local lines=(
    "NEXT_PUBLIC_FIREBASE_API_KEY=$(fetch_secret web-firebase-api-key)"
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$(fetch_secret web-firebase-auth-domain)"
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$(fetch_secret web-firebase-project-id)"
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$(fetch_secret web-firebase-storage-bucket)"
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$(fetch_secret web-firebase-messaging-sender-id)"
    "NEXT_PUBLIC_FIREBASE_APP_ID=$(fetch_secret web-firebase-app-id)"
    "NEXT_PUBLIC_API_BASE_URL=$api_url"
  )
  write_env_file "$target" "${lines[@]}"
}

build_api_gateway() {
  local target="$REPO_ROOT/apps/api-gateway/.env.local"
  local lines=(
    "# Secret-derived (Secret Manager)"
    "MONGODB_URI=$(fetch_secret mongodb-uri)"
    "ELASTIC_URL=$(fetch_secret elastic-url)"
    "ELASTIC_API_KEY=$(fetch_secret elastic-api-key)"
    "PHOENIX_API_KEY=$(fetch_secret phoenix-api-key)"
    "GMAIL_OAUTH_CLIENT_ID=$(fetch_secret gmail-oauth-client-id)"
    "GMAIL_OAUTH_CLIENT_SECRET=$(fetch_secret gmail-oauth-client-secret)"
    "STATE_JWT_SECRET=$(fetch_secret gmail-oauth-state-jwt-key)"
    "CLAIMIT_INGEST_AGENT_ID=$(fetch_secret claimit-ingest-agent-id)"
    "CLAIMIT_MONITOR_AGENT_ID=$(fetch_secret claimit-monitor-agent-id)"
    "CLAIMIT_CLAIM_AGENT_ID=$(fetch_secret claimit-claim-agent-id)"
    "CLAIMIT_ASSISTANT_AGENT_ID=$(fetch_secret claimit-assistant-agent-id)"
    ""
    "# Static (mirrors infra/terraform/main.tf module \"api_gateway\")"
    "CORS_ALLOWED_ORIGINS=http://localhost:3000"
    "CORS_ALLOWED_ORIGIN_REGEX="
    "FRONTEND_BASE_URL=http://localhost:3000"
    "GCP_PROJECT_ID=$PROJECT_ID"
    "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
    "GOOGLE_CLOUD_LOCATION=$REGION"
    "RECEIPTS_BUCKET=$RECEIPTS_BUCKET"
    "EVIDENCE_BUCKET=$EVIDENCE_BUCKET"
    "GMAIL_INBOUND_TOPIC=$GMAIL_INBOUND_TOPIC"
    "GMAIL_OAUTH_REDIRECT_URI=$GMAIL_OAUTH_REDIRECT_URI"
    "ASSISTANT_AGENT_URL=$DEPLOYED_ASSISTANT_AGENT_URL"
    "PHOENIX_BASE_URL=$PHOENIX_BASE_URL"
    "PHOENIX_PROJECT_NAME=$PHOENIX_PROJECT_NAME"
  )
  write_env_file "$target" "${lines[@]}"
}

build_ingest_agent() {
  local target="$REPO_ROOT/apps/ingest-agent/.env.local"
  local lines=(
    "# Secret-derived"
    "MONGODB_URI=$(fetch_secret mongodb-uri)"
    "SCRAPERAPI_KEY=$(fetch_secret scraperapi-key)"
    "GMAIL_OAUTH_CLIENT_ID=$(fetch_secret gmail-oauth-client-id)"
    "GMAIL_OAUTH_CLIENT_SECRET=$(fetch_secret gmail-oauth-client-secret)"
    "SENDGRID_API_KEY=$(fetch_secret sendgrid-api-key)"
    ""
    "# Static"
    "FRONTEND_BASE_URL=http://localhost:3000"
    "GCP_PROJECT_ID=$PROJECT_ID"
    "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
    "GOOGLE_CLOUD_LOCATION=$REGION"
    "GOOGLE_GENAI_USE_VERTEXAI=true"
    "RECEIPTS_BUCKET=$RECEIPTS_BUCKET"
    "GMAIL_INBOUND_TOPIC=$GMAIL_INBOUND_TOPIC"
    "PHOENIX_BASE_URL=$PHOENIX_BASE_URL"
    "PHOENIX_PROJECT_NAME=$PHOENIX_PROJECT_NAME"
    "# Skip Pub/Sub OIDC verification on localhost (no inbound push tokens)."
    "PUBSUB_AUTH_DISABLED=1"
  )
  write_env_file "$target" "${lines[@]}"
}

build_monitor_agent() {
  local target="$REPO_ROOT/apps/monitor-agent/.env.local"
  local lines=(
    "# Secret-derived"
    "MONGODB_URI=$(fetch_secret mongodb-uri)"
    "KEEPA_API_KEY=$(fetch_secret keepa-api-key)"
    "SCRAPERAPI_KEY=$(fetch_secret scraperapi-key)"
    ""
    "# Static"
    "GCP_PROJECT_ID=$PROJECT_ID"
    "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
    "GOOGLE_CLOUD_LOCATION=$REGION"
    "EVIDENCE_BUCKET=$EVIDENCE_BUCKET"
    "PHOENIX_BASE_URL=$PHOENIX_BASE_URL"
    "PHOENIX_PROJECT_NAME=$PHOENIX_PROJECT_NAME"
    "# Optional: price source mode (default 'mixed'). 'live' / 'seeded' / 'mixed'."
    "# PRICE_SOURCE_MODE=mixed"
    "# PRICE_SOURCE_OVERRIDES="
  )
  write_env_file "$target" "${lines[@]}"
}

build_claim_agent() {
  local target="$REPO_ROOT/apps/claim-agent/.env.local"
  local lines=(
    "# Secret-derived"
    "MONGODB_URI=$(fetch_secret mongodb-uri)"
    "ANTHROPIC_API_KEY=$(fetch_secret anthropic-api-key)"
    "ELASTIC_URL=$(fetch_secret elastic-url)"
    "ELASTIC_API_KEY=$(fetch_secret elastic-api-key)"
    "PHOENIX_API_KEY=$(fetch_secret phoenix-api-key)"
    "GMAIL_OAUTH_CLIENT_ID=$(fetch_secret gmail-oauth-client-id)"
    "GMAIL_OAUTH_CLIENT_SECRET=$(fetch_secret gmail-oauth-client-secret)"
    ""
    "# Static"
    "GCP_PROJECT_ID=$PROJECT_ID"
    "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
    "GOOGLE_CLOUD_LOCATION=$REGION"
    "GOOGLE_GENAI_USE_VERTEXAI=true"
    "PHOENIX_BASE_URL=$PHOENIX_BASE_URL"
    "PHOENIX_PROJECT_NAME=$PHOENIX_PROJECT_NAME"
    "CLAIMIT_BCC_EMAIL=$CLAIMIT_BCC_EMAIL"
    "PUBSUB_AUTH_DISABLED=1"
    "# Optional tuning"
    "# AUTO_SEND_DELAY_SECONDS=300"
    "# AUTO_SEND_BATCH_SIZE=50"
  )
  write_env_file "$target" "${lines[@]}"
}

build_assistant_agent() {
  local target="$REPO_ROOT/apps/assistant-agent/.env.local"
  local lines=(
    "# Secret-derived"
    "MONGODB_URI=$(fetch_secret mongodb-uri)"
    "ANTHROPIC_API_KEY=$(fetch_secret anthropic-api-key)"
    "ELASTIC_URL=$(fetch_secret elastic-url)"
    "ELASTIC_API_KEY=$(fetch_secret elastic-api-key)"
    "PHOENIX_API_KEY=$(fetch_secret phoenix-api-key)"
    ""
    "# Static"
    "GCP_PROJECT_ID=$PROJECT_ID"
    "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
    "GOOGLE_CLOUD_LOCATION=$REGION"
    "GOOGLE_GENAI_USE_VERTEXAI=true"
    "PHOENIX_BASE_URL=$PHOENIX_BASE_URL"
    "PHOENIX_PROJECT_NAME=$PHOENIX_PROJECT_NAME"
    "GATEWAY_SA_EMAIL=$GATEWAY_SA_EMAIL"
    "PUBSUB_AUTH_DISABLED=1"
  )
  write_env_file "$target" "${lines[@]}"
}

build_sync_worker() {
  local target="$REPO_ROOT/apps/sync-worker/.env.local"
  local lines=(
    "# Secret-derived"
    "MONGODB_URI=$(fetch_secret mongodb-uri)"
    "ELASTIC_URL=$(fetch_secret elastic-url)"
    "ELASTIC_API_KEY=$(fetch_secret elastic-api-key)"
    ""
    "# Static"
    "MONGODB_DB=claimit"
    "GCP_PROJECT_ID=$PROJECT_ID"
    "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
  )
  write_env_file "$target" "${lines[@]}"
}

# ---------- dispatch ----------
case "$SERVICE" in
  web)             build_web ;;
  api-gateway)     build_api_gateway ;;
  ingest-agent)    build_ingest_agent ;;
  monitor-agent)   build_monitor_agent ;;
  claim-agent)     build_claim_agent ;;
  assistant-agent) build_assistant_agent ;;
  sync-worker)     build_sync_worker ;;
  *)
    error "Unknown service: $SERVICE"
    echo "Services: web api-gateway ingest-agent monitor-agent claim-agent assistant-agent sync-worker"
    exit 1
    ;;
esac

echo ""
warn "${BOLD}This .env.local connects to PROD claimit-beta data.${NC}"
warn "Mongo writes, Anthropic spend, Firebase users, and outbound Gmail sends are real."
warn "Do not trigger destructive flows (claim send, account changes) unless intentional."
echo ""
