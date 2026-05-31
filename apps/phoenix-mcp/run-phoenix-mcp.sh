#!/usr/bin/env bash
# Launch @arizeai/phoenix-mcp for supergateway's --stdio child.
#
# Kept as a SEPARATE script (rather than inlining the command in the entrypoint's
# `--stdio` argument) for one reason: supergateway echoes its full `--stdio`
# command verbatim to stdout at startup. If the API key is expanded into that
# argument, it lands in Cloud Run logs in plaintext. Pointing --stdio at this
# script means supergateway only logs the script path; the key is read from the
# environment HERE, at exec time, and never appears in any log line.
#
# PHOENIX_BASE_URL / PHOENIX_API_KEY are inherited from supergateway, which
# inherits them from the entrypoint (mounted by Cloud Run from Secret Manager).
set -euo pipefail

exec npx @arizeai/phoenix-mcp --baseUrl "$PHOENIX_BASE_URL" --apiKey "$PHOENIX_API_KEY"
