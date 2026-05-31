#!/usr/bin/env bash
#
# run_migrations.sh — idempotent index creation for MongoDB + Elasticsearch.
#
# Invoked by .github/workflows/deploy-prod.yml after Cloud Run deployment.
# Run from the repo root. Both Python scripts are direct-path-invoked (their
# packages have no uv.lock and the wheel rename does not match the directory
# layout, so `python -m` would not resolve). Dependencies are installed into
# an ephemeral venv per call via `uv run --no-project --with`, mirroring the
# `[project.dependencies]` declared in each package's pyproject.toml.
#
set -euo pipefail

echo "=== Running migrations ==="

: "${MONGODB_URI:?MONGODB_URI is required}"
: "${ELASTIC_URL:?ELASTIC_URL is required}"
: "${ELASTIC_API_KEY:?ELASTIC_API_KEY is required}"

echo ""
echo ">>> MongoDB: creating indexes"
uv run \
  --no-project \
  --python "3.12" \
  --with "motor>=3.6.0" \
  python packages/shared/mongodb/claimit_mongodb_models/create_indexes.py

echo ""
echo ">>> Elastic: creating indices"
if uv run \
  --no-project \
  --python "3.12" \
  --with "elasticsearch[async]>=8.0.0" \
  python packages/shared/elastic/elastic/create_indices.py; then
  echo ">>> Elastic indices created"
else
  echo ""
  echo "::warning::Elastic index creation failed; continuing."
  echo "::warning::The assistant's policy search uses Elastic Agent Builder MCP over the"
  echo "::warning::policies-fulltext index — if that index is missing, search_policies_fulltext"
  echo "::warning::returns no results at runtime. Investigate rather than ignore."
  echo ""
fi

echo ""
echo "=== Migrations completed ==="
