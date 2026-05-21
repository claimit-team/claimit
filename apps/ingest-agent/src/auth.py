"""Pub/Sub push authentication (ticket 4.15).

Pub/Sub-side IAM (run.invoker grant on the pubsub-pusher service account)
already gates *what* can reach this endpoint at the Cloud Run platform layer.
The OIDC verification here is a second, application-layer check that the
caller is the specific service account we expect, defending against:
- A misconfigured run.invoker grant accidentally allowing a wider set of
  callers than intended.
- A future split where some non-Pub/Sub caller hits the same URL.

Bypass via PUBSUB_AUTH_DISABLED=1 is only intended for tests and local
development. In Cloud Run we never set that env var, so production calls
always go through full verification.

The token's `aud` claim is set by Pub/Sub to the configured push endpoint
URL — we derive the same URL from `request.url` at runtime so the
audience check works without baking the service URL into Terraform (which
would create a self-reference cycle through the env_vars block).
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

# Service account configured as the OIDC identity on the gmail-inbound
# push subscription (infra/terraform/subscriptions.tf). Verification
# rejects tokens minted by any other SA.
_EXPECTED_SA_EMAIL_ENV: Final = "PUBSUB_PUSHER_SA_EMAIL"
_DEFAULT_PUSHER_SA: Final = "pubsub-pusher"  # account_id; project-suffix appended below
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
    """The token's `aud` is whatever URL Pub/Sub was configured to push to.

    We reconstruct that from the incoming request, but with one critical
    twist for Cloud Run: the load balancer terminates TLS and forwards
    plain HTTP to the container, so `request.url.scheme` is "http" even
    when the public-facing call was https. Pub/Sub minted the token
    against the https push_endpoint, so we'd get a wrong-audience 401
    if we trusted the in-container scheme.

    `X-Forwarded-Proto` is the documented way Cloud Run (and any sane
    HTTPS-terminating proxy) tells us what the original scheme was.
    When it's present we substitute it onto request.url; when it's
    absent we fall back to request.url as-is, which is correct for
    local dev (uvicorn directly serving HTTP or HTTPS) and unit tests
    that build a synthetic ASGI scope.

    Query string is stripped defensively — Pub/Sub never adds one to
    the push endpoint, but a future routing tweak shouldn't be able
    to silently invalidate every token.

    The header is normalized before use: trimmed, lowercased, and only
    accepted if it ends up "http" or "https". An RFC 7239-style chain
    ("https, http" when multiple proxies fronted the request) takes the
    leftmost token — that's what the original client sent. Garbage
    values (whitespace, mixed case, "ftp", empty after splitting) fall
    through to the no-header branch so we get the in-container scheme
    rather than a junk audience that would 401 every push.
    """
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
    """Validate the Pub/Sub OIDC token on an inbound push request.

    Raises 401 on any verification failure. Returns None on success.

    Bypassed when PUBSUB_AUTH_DISABLED=1 (tests + local dev only — the
    Cloud Run module never sets this env var).
    """
    if os.environ.get(_DISABLE_ENV) == "1":
        return

    token = _extract_bearer_token(request)
    expected_audience = _expected_audience(request)
    expected_email = _expected_pusher_email()

    try:
        # id_token.verify_oauth2_token is sync and does blocking I/O
        # (it fetches Google's signing certs the first time it's called
        # and on every cache-miss). Running it inline would block the
        # ASGI event loop. run_in_threadpool offloads to Starlette's
        # default thread pool so other in-flight requests keep flowing.
        claims = await run_in_threadpool(
            id_token.verify_oauth2_token,
            token,
            GoogleAuthRequest(),
            audience=expected_audience,
        )
    except ValueError as err:
        # google-auth raises ValueError for every verification failure
        # (signature, expiration, audience, issuer).
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
        # google-auth verifies the signature & expiration for us; the
        # `email_verified` claim is a separate Google guarantee that the
        # `email` field reflects the actual SA identity. Without it the
        # email check above is meaningless.
        _log.warning("Pub/Sub OIDC token has email_verified=false; email=%s", actual_email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OIDC token email not verified",
        )
