"""Screenshot service - captures price-drop evidence and uploads to GCS.

For each captured screenshot:
1. ScraperAPI fetches a PNG of the rendered page (screenshot=true + premium=true)
2. Pillow overlays a timestamp watermark in the bottom-left corner
3. PNG is uploaded to gs://{EVIDENCE_BUCKET}/evidence/{platform}/{product_id}/{ts}.png
4. A v4 signed URL valid for 30 days is returned

Failures are logged and the function returns None - never raises.

Why ScraperAPI instead of direct headless Chromium: Best Buy, Target, and most
travel sites detect headless Chromium fingerprints and either reset connections
(ERR_HTTP2_PROTOCOL_ERROR) or block the price-hydration XHRs that we need to
see. ScraperAPI's premium proxy pool handles the anti-bot bypass for us; we
just receive PNG bytes back.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta
from io import BytesIO
from typing import Any

import requests
from google.auth import default as get_default_credentials
from google.auth.transport.requests import Request as AuthRequest
from google.cloud import secretmanager, storage
from PIL import Image, ImageDraw

logger = logging.getLogger(__name__)

SCRAPERAPI_ENDPOINT = "https://api.scraperapi.com/"
_EVIDENCE_BUCKET = os.environ.get("EVIDENCE_BUCKET", "claimit-evidence-dev")
_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "claimit-beta")
_SIGNED_URL_EXPIRY_DAYS = 30
_SCRAPERAPI_TIMEOUT_S = 120
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

_api_key_cache: str | None = None


def _get_api_key() -> str:
    """Load ScraperAPI key from env var (override) or GCP Secret Manager.

    Mirrors the per-adapter cache pattern but at module level.
    """
    global _api_key_cache
    if _api_key_cache is None:
        env_key = os.environ.get("SCRAPERAPI_KEY")
        if env_key:
            _api_key_cache = env_key
        else:
            client = secretmanager.SecretManagerServiceClient()
            secret_path = f"projects/{_PROJECT_ID}/secrets/scraperapi-key/versions/latest"
            response = client.access_secret_version(name=secret_path)
            _api_key_cache = response.payload.data.decode("utf-8")
    return _api_key_cache


async def capture(
    url: str,
    platform: str,
    product_id: str,
    wait_selector: str | None = None,
) -> str | None:
    """Capture a screenshot of a product page and upload to GCS as evidence.

    Args:
        url: The product page URL to screenshot.
        platform: Platform identifier (e.g. "best_buy") for the storage path.
        product_id: SKU/ID for the storage path.
        wait_selector: Accepted for backward compatibility; not used by the
            ScraperAPI screenshot endpoint, which has its own render-wait logic.

    Returns:
        Signed GCS URL valid for 30 days, or None on any failure.
    """
    try:
        captured_at = datetime.now(UTC)
        raw_png = await _take_screenshot(url, wait_selector)
        if not raw_png.startswith(PNG_MAGIC):
            logger.warning(
                "ScraperAPI returned non-PNG content (%d bytes); discarding",
                len(raw_png),
            )
            return None
        watermarked = await asyncio.to_thread(_add_timestamp_watermark, raw_png, captured_at)
        blob_path = _build_blob_path(platform, product_id, captured_at)
        return await asyncio.to_thread(_upload_and_sign, watermarked, blob_path)
    except Exception:
        logger.exception(
            "Screenshot capture failed for %s/%s url=%s",
            platform,
            product_id,
            url,
        )
        return None


async def _take_screenshot(url: str, wait_selector: str | None = None) -> bytes:
    """Fetch a PNG of the rendered page via ScraperAPI's screenshot endpoint.

    wait_selector is preserved on the signature but ignored; ScraperAPI does
    not accept a CSS-selector readiness signal. It uses internal render-wait
    timing controlled server-side.
    """
    params = {
        "api_key": _get_api_key(),
        "url": url,
        "screenshot": "true",
        "render": "true",
        "premium": "true",
        "country_code": "us",
    }
    response = await asyncio.to_thread(
        requests.get,
        SCRAPERAPI_ENDPOINT,
        params=params,
        timeout=_SCRAPERAPI_TIMEOUT_S,
    )
    if response.status_code != 200:
        # Avoid leaking api_key in error messages
        raise RuntimeError(f"ScraperAPI screenshot failed: HTTP {response.status_code}")
    return response.content


def _add_timestamp_watermark(png_bytes: bytes, captured_at: datetime) -> bytes:
    """Overlay a semi-transparent black bar with white timestamp in bottom-left."""
    base = Image.open(BytesIO(png_bytes)).convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    label = f"Captured: {captured_at.strftime('%Y-%m-%dT%H:%M:%SZ')} | ClaimIt Evidence"

    char_w = 7
    text_w = len(label) * char_w
    text_h = 16
    padding = 8

    x0 = padding
    y0 = base.height - text_h - padding * 2
    x1 = x0 + text_w + padding * 2
    y1 = base.height - padding

    draw.rectangle([(x0, y0), (x1, y1)], fill=(0, 0, 0, 180))
    draw.text((x0 + padding, y0 + padding), label, fill=(255, 255, 255, 255))

    composite = Image.alpha_composite(base, overlay)
    out = BytesIO()
    composite.convert("RGB").save(out, format="PNG")
    return out.getvalue()


def _build_blob_path(platform: str, product_id: str, captured_at: datetime) -> str:
    """Return GCS blob path: evidence/{platform}/{product_id}/{ISO timestamp}.png"""
    ts = captured_at.strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    return f"evidence/{platform}/{product_id}/{ts}.png"


def _upload_and_sign(png_bytes: bytes, blob_path: str) -> str:
    """Upload bytes to GCS and return a v4 signed URL valid for 30 days."""
    client = storage.Client()
    bucket = client.bucket(_EVIDENCE_BUCKET)
    blob = bucket.blob(blob_path)
    blob.upload_from_string(png_bytes, content_type="image/png")

    credentials, _ = get_default_credentials()
    if not credentials.valid:
        credentials.refresh(AuthRequest())
    sa_email = getattr(credentials, "service_account_email", None)
    access_token = getattr(credentials, "token", None)

    sign_kwargs: dict[str, Any] = {
        "version": "v4",
        "expiration": timedelta(days=_SIGNED_URL_EXPIRY_DAYS),
        "method": "GET",
    }
    if sa_email and access_token:
        sign_kwargs["service_account_email"] = sa_email
        sign_kwargs["access_token"] = access_token

    return blob.generate_signed_url(**sign_kwargs)
