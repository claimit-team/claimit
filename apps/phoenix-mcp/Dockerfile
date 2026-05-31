# syntax=docker/dockerfile:1.7
# Phoenix MCP Cloud Run service: a stdio->Streamable-HTTP bridge.
#
# `@arizeai/phoenix-mcp` is stdio-only and Vertex AI Agent Engine has no Node.js,
# so we host it behind `supergateway` on Cloud Run (mirrors the MongoDB MCP
# Cloud Run service, except that one uses a prebuilt public image while phoenix
# needs this custom bridge image). Build context is the repo root:
#   docker build -f apps/phoenix-mcp/Dockerfile -t .../claimit/phoenix-mcp:<tag> .
#
# Versions are pinned (bump deliberately via build-args) and installed LOCALLY in
# /app so the entrypoint's `npx` calls resolve offline from ./node_modules.

FROM node:22-slim

# Declared so the shared `--build-arg APP_NAME=phoenix-mcp` from deploy-prod.yml
# doesn't warn; unused here (this image is not per-agent-parameterized).
ARG APP_NAME

# Pinned to the latest known-good versions as of 2026-05-31; bump deliberately.
ARG SUPERGATEWAY_VERSION=3.4.3
ARG PHOENIX_MCP_VERSION=4.0.13

WORKDIR /app

# Local (not global) install so `npx supergateway` / `npx @arizeai/phoenix-mcp`
# resolve from /app/node_modules at runtime without contacting the registry.
RUN npm install --omit=dev --save-exact \
      "supergateway@${SUPERGATEWAY_VERSION}" \
      "@arizeai/phoenix-mcp@${PHOENIX_MCP_VERSION}"

COPY apps/phoenix-mcp/entrypoint.sh apps/phoenix-mcp/run-phoenix-mcp.sh /app/
RUN chmod +x /app/entrypoint.sh /app/run-phoenix-mcp.sh && chown -R node:node /app

# Drop privileges — the bridge needs no root at runtime. The official node image
# ships a `node` user with a writable home (/home/node) for the npm cache.
USER node
ENV HOME=/home/node

EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
