"""HTTP client for the ingest-agent synchronous extract endpoint.

The write-after-confirm upload flow uploads the receipt blob to GCS and
then calls ingest-agent's `POST /internal/extract` to get structured
fields back synchronously — nothing is persisted until the user
confirms. Mirrors the OIDC service-to-service pattern in
`mode_b_client.py` (token cache + `id_token.fetch_id_token`), but the
call is a single non-streaming POST.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

import google.auth.transport.requests
import httpx
from google.oauth2 import id_token

logger = logging.getLogger(__name__)

_TOKEN_LIFETIME_SECONDS = 3600
_REFRESH_CUSHION_SECONDS = 300

# Extractor timeout in ingest-agent is 30s (EXTRACTOR_TIMEOUT_SECONDS);
# give the synchronous call headroom for the GCS read + network on top.
_EXTRACT_TIMEOUT_SECONDS = 45.0

_token_lock = threading.Lock()
_cached_token: str | None = None
_token_expiry: float = 0.0


class IngestExtractError(Exception):
    """Raised when the ingest extract call fails.

    `rejected` is True when the extractor could not read the receipt
    (HTTP 422) — the caller surfaces this as "fill in the details
    manually" (extraction=null) rather than a hard error. Any other
    failure (502 extractor_failed, network, 5xx) is treated the same way
    by the upload route, but the flag lets callers distinguish if needed.
    """

    def __init__(self, message: str, *, code: str, rejected: bool) -> None:
        self.code = code
        self.rejected = rejected
        super().__init__(message)


def _ingest_agent_url() -> str:
    url = os.environ.get("INGEST_AGENT_URL", "").strip().rstrip("/")
    if not url:
        raise ValueError("Ingest agent URL not configured")
    return url


def _is_local(url: str) -> bool:
    return url.startswith("http://localhost") or url.startswith("http://127.0.0.1")


def _get_id_token(audience: str) -> str:
    global _cached_token, _token_expiry
    now = time.monotonic()
    with _token_lock:
        if _cached_token and now < _token_expiry:
            return _cached_token
        request = google.auth.transport.requests.Request()
        _cached_token = id_token.fetch_id_token(request, audience)
        _token_expiry = now + _TOKEN_LIFETIME_SECONDS - _REFRESH_CUSHION_SECONDS
        return _cached_token


async def extract_receipt(
    *,
    user_id: str,
    storage_url: str,
    content_type: str | None,
) -> dict[str, Any]:
    """Call ingest-agent `/internal/extract` and return the extraction dict.

    Returns the `extraction` payload (extracted fields + computed status +
    extraction_confidence) the upload route hands to the browser.

    Raises:
        IngestExtractError: on 422 (extractor rejected the receipt;
            `rejected=True`), 502 (extractor failed), any other non-200,
            or a transport error. The upload route maps all of these to
            `extraction=null` so the FE opens the manual-fill form.
    """
    base_url = _ingest_agent_url()
    headers: dict[str, str] = {}
    # Local dev (uvicorn on localhost) runs the agent with
    # INTERNAL_AUTH_DISABLED=1 and `fetch_id_token` cannot mint a token
    # for a non-Google audience — skip the Authorization header.
    if not _is_local(base_url):
        headers["Authorization"] = f"Bearer {_get_id_token(base_url)}"

    payload = {
        "user_id": user_id,
        "storage_url": storage_url,
        "content_type": content_type,
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(_EXTRACT_TIMEOUT_SECONDS, connect=10.0)
        ) as client:
            response = await client.post(
                f"{base_url}/internal/extract",
                json=payload,
                headers=headers,
            )
    except httpx.HTTPError as err:
        logger.warning("Ingest extract transport error: %s", err)
        raise IngestExtractError(
            f"extract transport error: {err}", code="transport_error", rejected=False
        ) from err

    if response.status_code == 200:
        body = response.json()
        extraction = body.get("extraction")
        if not isinstance(extraction, dict):
            raise IngestExtractError(
                "extract returned no extraction payload",
                code="malformed_response",
                rejected=False,
            )
        return extraction

    rejected = response.status_code == 422
    code = _error_code(response)
    logger.warning(
        "Ingest extract returned %s (code=%s)",
        response.status_code,
        code,
    )
    raise IngestExtractError(
        f"extract failed with status {response.status_code}",
        code=code,
        rejected=rejected,
    )


def _error_code(response: httpx.Response) -> str:
    """Best-effort code from the ingest error body (`{"detail": {"code": ...}}`)."""
    try:
        detail = response.json().get("detail")
    except ValueError:
        return "unknown"
    if isinstance(detail, dict):
        return str(detail.get("code", "unknown"))
    return "unknown"
