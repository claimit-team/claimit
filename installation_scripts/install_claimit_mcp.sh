#!/bin/bash
set -euo pipefail

# install_claimit_mcp.sh — pip-installs workspace-local wheels into the
# Reasoning Engine container's .venv during Agent Engine build.
#
# Wheels handled here:
#   - claimit_mcp           (shared MCP toolset factories — still used by
#                            ingest/monitor/claim agents)
#   - claimit_mongodb_models (ticket 5.10 Plan B — assistant_agent now
#                             talks to MongoDB directly via this package
#                             instead of going through the MCP HTTP path)
#
# Both wheels are installed --no-deps; declared dependencies (motor,
# pydantic, httpx, google-auth, google-adk, mcp) must be present via
# ADK_REQUIREMENTS in scripts/deploy_agents.py.

install_wheel_into_venv() {
    local pkg_label="$1"
    local wheel_glob="$2"
    local wheel
    wheel=$(find . -name "$wheel_glob" 2>/dev/null | head -1)
    if [ -z "$wheel" ]; then
        echo "ERROR: $pkg_label wheel not found in extracted extra_packages (glob: $wheel_glob)" >&2
        echo "Searched from: $(pwd)" >&2
        find . -name '*.whl' 2>/dev/null >&2 || true
        return 1
    fi

    if [ -f .venv/bin/pip ]; then
        echo "Installing $pkg_label into .venv from: $wheel"
        .venv/bin/pip install --no-deps "$wheel"
        if [ -d .venv ]; then
            chown -R "$(stat -c '%U:%G' .venv)" .venv/lib/python3.12/site-packages/ 2>/dev/null || true
        fi
    elif command -v poetry &>/dev/null; then
        echo "Installing $pkg_label via poetry run pip from: $wheel"
        poetry run pip install --no-deps "$wheel"
        if [ -d .venv ]; then
            chown -R "$(stat -c '%U:%G' .venv)" .venv/lib/python3.12/site-packages/ 2>/dev/null || true
        fi
    else
        echo "WARNING: no .venv/bin/pip or poetry found, falling back to system pip" >&2
        echo "Installing $pkg_label from: $wheel"
        pip install --no-deps "$wheel"
        if [ -d .venv ]; then
            chown -R "$(stat -c '%U:%G' .venv)" .venv/lib/python3.12/site-packages/ 2>/dev/null || true
        fi
    fi
    echo "$pkg_label installation complete"
}

# claimit_mcp is required for ingest/monitor/claim agents to import the
# shared toolset factory at unpickle time. assistant_agent no longer
# imports from it (ticket 5.10 Plan B), but the wheel is shared across
# the deploy batch so we always install it.
install_wheel_into_venv "claimit_mcp" "claimit_mcp-*-py3-none-any.whl"

# claimit_mongodb_models is required by assistant_agent's direct MongoDB
# path. Missing-wheel is non-fatal for now (the other three agents do
# not import it) so a deploy that forgot to build the wheel still gets
# ingest/monitor/claim up — but assistant_agent will fail at unpickle
# with ModuleNotFoundError, which is the louder signal we want.
if find . -name 'claimit_mongodb_models-*-py3-none-any.whl' 2>/dev/null | grep -q .; then
    install_wheel_into_venv "claimit_mongodb_models" "claimit_mongodb_models-*-py3-none-any.whl"
else
    echo "WARNING: claimit_mongodb_models wheel not in extra_packages — assistant_agent will fail to load" >&2
fi
