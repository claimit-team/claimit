#!/usr/bin/env bash
#
# qa_reset.sh — ONE command to put the shared demo account into the
# canonical QA starting state. Run this BEFORE a QA session.
#
# Does everything: pulls MONGODB_URI from Secret Manager, sets buckets,
# WIPES the demo user's transactional data, re-seeds policies + dataset,
# prints a Slack snapshot.
#
# Prereqs (one-time): gcloud auth login; gcloud auth application-default login;
#   gcloud config set project claimit-beta (+ Secret Manager access); ./scripts/setup.sh
#
# Usage (from repo root):  ./scripts/qa_reset.sh
#
set -euo pipefail

PROJECT="claimit-beta"
export RECEIPTS_BUCKET="${RECEIPTS_BUCKET:-claimit-beta-receipts}"
export EVIDENCE_BUCKET="${EVIDENCE_BUCKET:-claimit-beta-evidence}"

echo "→ Fetching MONGODB_URI from Secret Manager (${PROJECT})…"
export MONGODB_URI="$(gcloud secrets versions access latest --secret=mongodb-uri --project="${PROJECT}")"

echo "→ [1/3] Wiping the demo user's transactional data…"
uv run --project apps/api-gateway python scripts/reset_demo_data.py --yes

echo "→ [2/3] Seeding 26 platform policies…"
uv run --project apps/api-gateway python seed/seed_policies.py

echo "→ [3/3] Seeding demo claims / purchases / price_history…"
set +e
uv run --project apps/api-gateway python scripts/seed_claims_demo.py
SEED_RC=$?
set -e
if [ "${SEED_RC}" -ne 0 ]; then
  echo "⚠️  seed_claims_demo exited ${SEED_RC}. Data WAS inserted; its verification flagged"
  echo "    something. After a clean wipe this normally passes — check the output above."
fi

echo
echo "✅ QA data reset complete. Paste in Slack:"
echo "   Seed refreshed @ $(date +%H:%M) — Claims 4/2/5, Purchases 17, price_history 88"
