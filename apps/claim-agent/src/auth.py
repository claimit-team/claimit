"""Pub/Sub push authentication for claim-agent internal endpoints.

Mirrors ingest-agent/src/auth.py — Pub/Sub mints OIDC tokens for the
configured push endpoint; we verify audience + pubsub-pusher SA email.
"""

from __future__ import annotations

import logging
import os
from typing import Final

from fastapi import HTTPException, Request, status
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token
from starlette.concurrency import run_in_threadpool

_log = logging.getLogger(__name__)

_EXPECTED_SA_EMAIL_ENV: Final = "PUBSUB_PUSHER_SA_EMAIL"
_DEFAULT_PUSHER_SA: Final = "pubsub-pusher"
_DISABLE_ENV: Final = "PUBSUB_AUTH_DISABLED"


def _expected_pusher_email() -> str:
    explicit = os.environ.get(_EXPECTED_SA_EMAIL_ENV, "").strip()
    if explicit:
        return explicit
    project = os.environ.get("GCP_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError(
            f"Cannot resolve expected pusher SA email: set {_EXPECTED_SA_EMAIL_ENV} "
            "or GCP_PROJECT_ID."
        )
    return f"{_DEFAULT_PUSHER_SA}@{project}.iam.gserviceaccount.com"


def _expected_audience(request: Request) -> str:
    forwarded_proto_raw = request.headers.get("x-forwarded-proto", "")
    forwarded_proto = forwarded_proto_raw.split(",", 1)[0].strip().lower()
    if forwarded_proto not in {"http", "https"}:
        forwarded_proto = ""
    url = (
        request.url.replace(scheme=forwarded_proto, query="")
        if forwarded_proto
        else request.url.replace(query="")
    )
    return str(url)


def _extract_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing Authorization header",
        )
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="malformed Authorization header",
        )
    return token


async def verify_pubsub_oidc(request: Request) -> None:
    """Validate the Pub/Sub OIDC token on an inbound push request."""
    if os.environ.get(_DISABLE_ENV) == "1":
        return

    token = _extract_bearer_token(request)
    expected_audience = _expected_audience(request)
    expected_email = _expected_pusher_email()

    try:
        claims = await run_in_threadpool(
            id_token.verify_oauth2_token,
            token,
            GoogleAuthRequest(),
            audience=expected_audience,
        )
    except ValueError as err:
        _log.warning("Pub/Sub OIDC verification failed: %s", err)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid OIDC token",
        ) from err

    actual_email = claims.get("email", "")
    if actual_email != expected_email:
        _log.warning(
            "Pub/Sub OIDC token from unexpected SA: got=%s expected=%s",
            actual_email,
            expected_email,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OIDC token from unexpected service account",
        )

    if not claims.get("email_verified", False):
        _log.warning("Pub/Sub OIDC token has email_verified=false; email=%s", actual_email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OIDC token email not verified",
        )
