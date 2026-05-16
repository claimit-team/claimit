#!/bin/bash
set -euo pipefail

WHEEL=$(find . -name 'claimit_mcp-*-py3-none-any.whl' 2>/dev/null | head -1)
if [ -z "$WHEEL" ]; then
    echo "ERROR: claimit_mcp wheel not found in extracted extra_packages" >&2
    echo "Searched from: $(pwd)" >&2
    find . -name '*.whl' 2>/dev/null >&2 || true
    exit 1
fi

echo "Installing claimit_mcp from: $WHEEL"
pip install --no-deps "$WHEEL"
echo "claimit_mcp installation complete"
