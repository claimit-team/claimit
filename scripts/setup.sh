#!/usr/bin/env bash
#
# ClaimIt one-time team setup.
# Idempotent — safe to run twice.
#
# Usage:
#   ./scripts/setup.sh                  # Node + pre-commit setup (default)
#   ./scripts/setup.sh --with-python    # Also runs uv sync for all 4 agents (~300MB)
#

set -e

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

WITH_PYTHON=false
if [[ "${1:-}" == "--with-python" ]]; then
  WITH_PYTHON=true
fi

echo ""
echo -e "${BOLD}ClaimIt one-time team setup${NC}"
echo ""

info "Checking Node version..."
if ! command -v node &> /dev/null; then
  error "Node not installed."
  echo ""
  echo "  Install via volta (recommended):"
  echo -e "    ${CYAN}brew install volta${NC}"
  echo -e "    ${CYAN}volta install node@20 pnpm@9${NC}"
  echo ""
  echo "  Or via nvm:"
  echo -e "    ${CYAN}nvm install 20 && nvm use 20${NC}"
  echo ""
  exit 1
fi

NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
if [[ "$NODE_MAJOR" != "20" ]]; then
  warn "Node version is $NODE_VERSION — recommended is 20.x"
  warn "Run: volta install node@20  OR  nvm install 20 && nvm use"
else
  ok "Node $NODE_VERSION"
fi

info "Checking pnpm..."
if ! command -v pnpm &> /dev/null; then
  error "pnpm not installed."
  echo -e "  Install: ${CYAN}volta install pnpm@9${NC}  OR  ${CYAN}corepack enable && corepack prepare pnpm@9 --activate${NC}"
  exit 1
fi
ok "pnpm $(pnpm --version)"

info "Checking uv..."
if ! command -v uv &> /dev/null; then
  error "uv not installed (required for Python agents and pre-commit)."
  echo -e "  Install: ${CYAN}brew install uv${NC}  OR  ${CYAN}curl -LsSf https://astral.sh/uv/install.sh | sh${NC}"
  exit 1
fi
ok "uv $(uv --version | awk '{print $2}')"

info "Ensuring Python 3.12 is available..."
uv python install 3.12 > /dev/null 2>&1 || true
ok "Python 3.12 available via uv"

info "Running pnpm install..."
echo ""
pnpm install
echo ""
ok "Node dependencies installed"

info "Installing pre-commit via uv tool..."
if uv tool install pre-commit > /dev/null 2>&1; then
  ok "pre-commit installed"
else
  uv tool install pre-commit --reinstall > /dev/null 2>&1
  ok "pre-commit refreshed"
fi

info "Installing git hooks..."
pre-commit install > /dev/null 2>&1
ok "git hooks installed (.git/hooks/pre-commit)"

info "Validating pre-commit (running all hooks once)..."
echo ""
if pre-commit run --all-files; then
  echo ""
  ok "Pre-commit validation passed"
else
  echo ""
  warn "Some hooks reported issues (likely auto-fixes applied)."
  warn "Run ${CYAN}git status${NC} to see modified files, ${CYAN}git add . && pre-commit run --all-files${NC} to re-verify."
fi

if $WITH_PYTHON; then
  echo ""
  info "Running uv sync for all 4 Python agents (~300MB total)..."
  for agent in ingest-agent monitor-agent claim-agent assistant-agent; do
    info "  → $agent"
    cd "apps/$agent"
    uv sync --dev > /dev/null 2>&1
    cd ../..
    ok "  $agent ready"
  done
else
  echo ""
  info "${BOLD}Python agent setup skipped${NC} (Node-only setup complete)"
  info "If you need Python: ${CYAN}./scripts/setup.sh --with-python${NC}"
  info "Or per agent: ${CYAN}cd apps/<agent>-agent && uv sync${NC}"
fi

echo ""
echo -e "${GREEN}${BOLD}Setup complete!${NC} 🚀"
echo ""
echo "Next steps:"
echo -e "  Start frontend:        ${CYAN}pnpm --filter web dev${NC}"
echo -e "  Start an agent:        ${CYAN}cd apps/ingest-agent && uv run uvicorn src.main:app --reload --port 8001${NC}"
echo -e "  See all tickets:       Notion ClaimIt Kanban"
echo ""
