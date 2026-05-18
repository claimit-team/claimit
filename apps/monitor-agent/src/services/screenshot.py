"""Screenshot service - renders adapter-fetched HTML and uploads to GCS.

For each captured screenshot:
1. Playwright headless Chromium loads the HTML via set_content()
2. Pillow overlays a timestamp watermark in the bottom-left corner
3. PNG is uploaded to gs://{EVIDENCE_BUCKET}/evidence/{platform}/{product_id}/{ts}.png
4. A v4 signed URL valid for 30 days is returned

Failures are logged and the function returns None - never raises.

Why local Playwright on already-fetched HTML, not direct navigation: Best Buy,
Target, and most travel sites detect headless Chromium fingerprints and block
direct navigation. But the adapters already get HTML via ScraperAPI; rendering
that HTML locally with set_content() never triggers anti-bot because no network
request is made to the protected origin during render. Cost stays at one
ScraperAPI HTML fetch per price check - the screenshot itself is free.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta
from io import BytesIO
from typing import Any

from google.auth import default as get_default_credentials
from google.auth.transport.requests import Request as AuthRequest
from google.cloud import storage
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

_EVIDENCE_BUCKET = os.environ.get("EVIDENCE_BUCKET", "claimit-evidence-dev")
_SIGNED_URL_EXPIRY_DAYS = 30
_VIEWPORT_WIDTH = 1280
_VIEWPORT_HEIGHT = 800
_RENDER_SETTLE_MS = 1000
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


async def capture(
    html: str,
    platform: str,
    product_id: str,
    url: str | None = None,
) -> str | None:
    """Render adapter-fetched HTML and upload as price evidence.

    Args:
        html: HTML string already retrieved by the adapter (e.g. via ScraperAPI).
            The renderer never navigates to a live origin - it uses set_content().
        platform: Platform identifier (e.g. "best_buy") for the GCS path.
        product_id: SKU/ID for the GCS path.
        url: Original product URL, used only for log context. Never fetched.

    Returns:
        Signed GCS URL valid for 30 days, or None on any failure.
    """
    try:
        captured_at = datetime.now(UTC)
        raw_png = await _take_screenshot(html)
        if not raw_png.startswith(PNG_MAGIC):
            logger.warning(
                "Renderer produced non-PNG output (%d bytes); discarding",
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


async def _take_screenshot(html: str) -> bytes:
    """Render HTML in headless Chromium and return viewport PNG bytes.

    Uses set_content() rather than goto() so the page loads without making
    any network request to the protected origin - anti-bot defenses are
    never triggered.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page(
                viewport={"width": _VIEWPORT_WIDTH, "height": _VIEWPORT_HEIGHT}
            )
            await page.set_content(html, wait_until="domcontentloaded")
            await page.wait_for_timeout(_RENDER_SETTLE_MS)
            return await page.screenshot(type="png", full_page=False)
        finally:
            await browser.close()


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
