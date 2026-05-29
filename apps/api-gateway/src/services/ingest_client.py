"""HTTP client for the ingest-agent synchronous extract endpoint.

The write-after-confirm upload flow uploads the receipt blob to GCS and
then calls ingest-agent's `POST /internal/extract` to get structured
fields back synchronously — nothing is persisted until the user
confirms. Mirrors the OIDC service-to-service pattern in
`mode_b_client.py` (token cache + `id_token.fetch_id_token`), but the
call is a single non-streaming POST.
"""

from __future__ import annotations

import asyncio
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

# One retry on TRANSIENT failures (project rule: retry 5xx / incomplete once
# before escalating). 422 `extractor_rejected_input` is deterministic — a
# second attempt can't help — and the config errors (bucket_mismatch,
# malformed_receipt_url, receipt_blob_missing) point at data/setup problems a
# retry would only mask, so none of those are retried.
_RETRYABLE_CODES = frozenset({"extractor_failed", "transport_error", "malformed_response"})
_MAX_ATTEMPTS = 2

# Budget guard: a single attempt can burn ~30s (the extractor's own timeout)
# and the browser's upload request times out at 60s (web UPLOAD_TIMEOUT_MS).
# A retry's worst case is a fresh _EXTRACT_TIMEOUT_SECONDS (45s) window, so we
# only retry when the FIRST attempt failed FAST — otherwise first-attempt
# elapsed + 45s would blow past the 60s the browser is willing to wait. This
# deliberately does NOT retry slow timeouts (there's no budget for it); it
# rescues genuinely transient fast failures (refused connection, a quick 502,
# a malformed body).
_RETRY_ELAPSED_BUDGET_SECONDS = 15.0

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

    Retries ONCE on a transient failure (`_RETRYABLE_CODES`) when the first
    attempt failed fast enough to leave budget (`_RETRY_ELAPSED_BUDGET_SECONDS`);
    422 rejections and config errors are not retried. The extract endpoint is
    a pure read, so retrying is idempotent.

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
    # for a non-Google audience — skip the Authorization header. Minted
    # once outside the retry loop so a retry doesn't re-do blocking token I/O.
    if not _is_local(base_url):
        # `_get_id_token` does blocking network I/O on a cache miss
        # (fetches Google's metadata/signing endpoint). Offload to a
        # thread so we never stall the event loop mid-request.
        token = await asyncio.to_thread(_get_id_token, base_url)
        headers["Authorization"] = f"Bearer {token}"

    payload = {
        "user_id": user_id,
        "storage_url": storage_url,
        "content_type": content_type,
    }

    for attempt in range(1, _MAX_ATTEMPTS + 1):
        started = time.monotonic()
        try:
            return await _extract_attempt(base_url, payload, headers)
        except IngestExtractError as err:
            elapsed = time.monotonic() - started
            retryable = err.code in _RETRYABLE_CODES and not err.rejected
            if (
                attempt >= _MAX_ATTEMPTS
                or not retryable
                or elapsed >= _RETRY_ELAPSED_BUDGET_SECONDS
            ):
                raise
            logger.warning(
                "Ingest extract attempt %d failed (code=%s, %.1fs) — retrying once",
                attempt,
                err.code,
                elapsed,
            )

    # Unreachable: the final attempt either returns or re-raises above.
    raise AssertionError("extract_receipt retry loop exited without a result")


async def _extract_attempt(
    base_url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
) -> dict[str, Any]:
    """One `POST /internal/extract` round-trip — returns extraction or raises.

    Raises IngestExtractError on transport error, non-200, or a malformed
    200 body. `extract_receipt` owns the retry policy around this.
    """
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
        # A non-JSON 200 (e.g. an HTML error page from a proxy/LB) must NOT
        # escape as a raw ValueError — `upload_receipt` only catches
        # IngestExtractError, so an unguarded decode error would 500 instead
        # of falling back to the manual-fill (extraction=None) path.
        try:
            body = response.json()
        except ValueError as err:
            logger.warning("Ingest extract returned a non-JSON 200 body")
            raise IngestExtractError(
                "extract returned a non-JSON body",
                code="malformed_response",
                rejected=False,
            ) from err
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
