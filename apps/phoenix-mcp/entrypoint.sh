#!/usr/bin/env bash
# Phoenix MCP stdio->Streamable-HTTP bridge entrypoint.
#
# Wraps the stdio-only `@arizeai/phoenix-mcp` with `supergateway` so Vertex AI
# Agent Engine + Cloud Run agents can reach it over HTTP (they have no Node.js
# to spawn it over stdio). Both packages are installed locally in /app (see
# Dockerfile), so the `npx` calls resolve from ./node_modules without any
# network fetch at container start.
#
# Secrets/config come from the environment (mounted by Cloud Run):
#   PHOENIX_BASE_URL  — Phoenix Cloud query host (the MCP --baseUrl), plain env
#   PHOENIX_API_KEY   — from Secret Manager; read here, never baked into the image
#   PORT              — injected by Cloud Run (defaults to 8080)
set -euo pipefail

: "${PHOENIX_BASE_URL:?PHOENIX_BASE_URL is required}"
: "${PHOENIX_API_KEY:?PHOENIX_API_KEY is required}"
PORT="${PORT:-8080}"

# `exec` so supergateway becomes PID 1 and receives Cloud Run's SIGTERM directly.
exec npx supergateway \
  --stdio "npx @arizeai/phoenix-mcp --baseUrl ${PHOENIX_BASE_URL} --apiKey ${PHOENIX_API_KEY}" \
  --outputTransport streamableHttp \
  --port "${PORT}" \
  --streamableHttpPath /mcp \
  --healthEndpoint /healthz
