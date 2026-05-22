"""Internal service-to-service OIDC auth (ticket 5.9).

Cloud Run `roles/run.invoker` gates which principals can reach this
service at the platform layer. Application-layer verification ensures
the caller is specifically the api-gateway service account.

Bypass via INTERNAL_AUTH_DISABLED=1 is for tests and local dev only.
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

_EXPECTED_SA_EMAIL_ENV: Final = "GATEWAY_SA_EMAIL"
_DEFAULT_GATEWAY_SA: Final = "claimit-api-gateway"
_DISABLE_ENV: Final = "INTERNAL_AUTH_DISABLED"


def _expected_gateway_email() -> str:
    explicit = os.environ.get(_EXPECTED_SA_EMAIL_ENV, "").strip()
    if explicit:
        return explicit
    project = os.environ.get("GCP_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project:
        raise RuntimeError(
            f"Cannot resolve expected gateway SA email: set {_EXPECTED_SA_EMAIL_ENV} "
            "or GCP_PROJECT_ID."
        )
    return f"{_DEFAULT_GATEWAY_SA}@{project}.iam.gserviceaccount.com"


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


async def verify_gateway_oidc(request: Request) -> None:
    """Validate the api-gateway OIDC token on an internal request."""
    if os.environ.get(_DISABLE_ENV) == "1":
        return

    token = _extract_bearer_token(request)
    expected_audience = _expected_audience(request)
    expected_email = _expected_gateway_email()

    try:
        claims = await run_in_threadpool(
            id_token.verify_oauth2_token,
            token,
            GoogleAuthRequest(),
            audience=expected_audience,
        )
    except ValueError as err:
        _log.warning("Gateway OIDC verification failed: %s", err)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid OIDC token",
        ) from err

    actual_email = claims.get("email", "")
    if actual_email != expected_email:
        _log.warning(
            "Gateway OIDC token from unexpected SA: got=%s expected=%s",
            actual_email,
            expected_email,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OIDC token from unexpected service account",
        )

    if not claims.get("email_verified", False):
        _log.warning("Gateway OIDC token has email_verified=false; email=%s", actual_email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OIDC token email not verified",
        )
