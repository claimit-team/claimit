#!/bin/bash
set -euo pipefail

WHEEL=$(find . -name 'claimit_mcp-*-py3-none-any.whl' 2>/dev/null | head -1)
if [ -z "$WHEEL" ]; then
    echo "ERROR: claimit_mcp wheel not found in extracted extra_packages" >&2
    echo "Searched from: $(pwd)" >&2
    find . -name '*.whl' 2>/dev/null >&2 || true
    exit 1
fi

# Reasoning Engine container uses a .venv — install there so the
# runtime Python (which activates .venv) can find claimit_mcp.
# Step 16 runs as root; Step 19 installs requirements into .venv;
# entrypoint.sh uses .venv Python.  Bare 'pip install' would put
# the package in system site-packages, invisible to .venv.
if [ -f .venv/bin/pip ]; then
    echo "Installing claimit_mcp into .venv from: $WHEEL"
    .venv/bin/pip install --no-deps "$WHEEL"
    # Fix ownership so APP_USER's compileall (Step 20) can write .pyc files
    if [ -d .venv ]; then
        chown -R "$(stat -c '%U:%G' .venv)" .venv/lib/python3.12/site-packages/claimit_mcp* 2>/dev/null || true
    fi
elif command -v poetry &>/dev/null; then
    echo "Installing claimit_mcp via poetry run pip from: $WHEEL"
    poetry run pip install --no-deps "$WHEEL"
    # Fix ownership so APP_USER's compileall (Step 20) can write .pyc files
    if [ -d .venv ]; then
        chown -R "$(stat -c '%U:%G' .venv)" .venv/lib/python3.12/site-packages/claimit_mcp* 2>/dev/null || true
    fi
else
    echo "WARNING: no .venv/bin/pip or poetry found, falling back to system pip" >&2
    echo "Installing claimit_mcp from: $WHEEL"
    pip install --no-deps "$WHEEL"
    # Fix ownership so APP_USER's compileall (Step 20) can write .pyc files
    if [ -d .venv ]; then
        chown -R "$(stat -c '%U:%G' .venv)" .venv/lib/python3.12/site-packages/claimit_mcp* 2>/dev/null || true
    fi
fi
echo "claimit_mcp installation complete"
