# syntax=docker/dockerfile:1.7
# Build context: repo root.
#   docker build -f apps/monitor-agent/Dockerfile --build-arg APP_NAME=monitor-agent .
#
# monitor-agent runs Playwright for price-drop scraping fallback, so this
# Dockerfile additionally downloads Chromium + its apt system deps. Cloud Run
# memory limit should be raised to 2Gi for this service (set in terraform).
#
# Kept separate from apps/Dockerfile.agent because of the Playwright install.
# The builder + runtime scaffolding (uv copy, env vars, user creation, CMD)
# mirrors apps/Dockerfile.agent — keep the two in sync when bumping python, uv,
# or the runtime entrypoint.

ARG APP_NAME=monitor-agent

# ---------- builder ----------
FROM python:3.12-slim AS builder
ARG APP_NAME

COPY --from=ghcr.io/astral-sh/uv:0.11.14 /uv /usr/local/bin/uv

ENV UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

COPY apps/${APP_NAME}/pyproject.toml apps/${APP_NAME}/uv.lock ./
COPY packages/shared/observability /packages/shared/observability
COPY packages/shared/mcp /packages/shared/mcp
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/${APP_NAME}/src ./src
RUN uv sync --frozen --no-dev

# ---------- runtime ----------
FROM python:3.12-slim

RUN groupadd --system app && \
    useradd --system --gid app --home /app --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=builder --chown=app:app /app /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright

# Install Chromium + its apt system libraries. Runs as root (required for apt),
# then ownership is handed back to the app user.
RUN python -m playwright install --with-deps chromium && \
    chown -R app:app /app/.cache && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

USER app
EXPOSE 8080

CMD exec uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8080}
