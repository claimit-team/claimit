"""Unit tests for screenshot service - all I/O mocked.

After the Option-A rewrite (ticket 4.12 rev 2), the service uses ScraperAPI's
screenshot endpoint instead of direct Playwright. Tests mock requests.get,
storage.Client, PIL, and google.auth - no real network/browser/GCS calls.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


def _build_requests_mock() -> MagicMock:
    """Mock requests.get to return a fake-PNG Response (real PNG magic prefix)."""
    response = MagicMock()
    response.status_code = 200
    # Use real PNG magic prefix so capture()'s PNG_MAGIC validation passes
    response.content = b"\x89PNG\r\n\x1a\nfake_png_bytes"
    return MagicMock(return_value=response)


def _build_gcs_mock() -> tuple[MagicMock, MagicMock, MagicMock]:
    blob = MagicMock()
    blob.upload_from_string = MagicMock()
    blob.generate_signed_url = MagicMock(return_value="https://storage.googleapis.com/signed/foo")

    bucket = MagicMock()
    bucket.blob = MagicMock(return_value=blob)

    client = MagicMock()
    client.bucket = MagicMock(return_value=bucket)

    client_cls = MagicMock(return_value=client)
    return client_cls, bucket, blob


def _build_pillow_mock() -> tuple[MagicMock, MagicMock, MagicMock]:
    img = MagicMock()
    img.size = (1280, 800)
    img.width = 1280
    img.height = 800
    img.convert = MagicMock(return_value=img)
    img.save = MagicMock()

    image = MagicMock()
    image.open = MagicMock(return_value=img)
    image.new = MagicMock(return_value=img)
    image.alpha_composite = MagicMock(return_value=img)

    draw = MagicMock()
    image_draw = MagicMock()
    image_draw.Draw = MagicMock(return_value=draw)

    return image, image_draw, draw


def _build_auth_mock() -> MagicMock:
    creds = MagicMock()
    creds.valid = True
    creds.service_account_email = "monitor-agent@claimit-beta.iam.gserviceaccount.com"
    creds.token = "fake-access-token"
    return MagicMock(return_value=(creds, "claimit-beta"))


@pytest.fixture
def screenshot_mocks(monkeypatch: pytest.MonkeyPatch):
    """Patch every external dependency in src.services.screenshot."""
    monkeypatch.setenv("SCRAPERAPI_KEY", "test-key")

    # Reset module-level api-key cache between tests
    import src.services.screenshot as screenshot_module

    monkeypatch.setattr(screenshot_module, "_api_key_cache", None)

    requests_get = _build_requests_mock()
    client_cls, bucket, blob = _build_gcs_mock()
    image, image_draw, draw = _build_pillow_mock()
    auth = _build_auth_mock()

    patches = [
        patch("src.services.screenshot.requests.get", requests_get),
        patch("src.services.screenshot.storage.Client", client_cls),
        patch("src.services.screenshot.Image", image),
        patch("src.services.screenshot.ImageDraw", image_draw),
        patch("src.services.screenshot.get_default_credentials", auth),
    ]
    for p in patches:
        p.start()
    yield {
        "requests_get": requests_get,
        "client_cls": client_cls,
        "bucket": bucket,
        "blob": blob,
        "image": image,
        "image_draw": image_draw,
        "draw": draw,
        "auth": auth,
    }
    for p in patches:
        p.stop()


@pytest.mark.asyncio
async def test_capture_returns_signed_url(screenshot_mocks: dict) -> None:
    """Happy path: capture returns the signed URL string."""
    from src.services.screenshot import capture

    result = await capture(
        url="https://www.bestbuy.com/site/foo/12345.p",
        platform="best_buy",
        product_id="12345",
    )

    assert result == "https://storage.googleapis.com/signed/foo"
    # ScraperAPI called with required premium params
    call = screenshot_mocks["requests_get"].call_args
    params = call.kwargs["params"]
    assert params["screenshot"] == "true"
    assert params["premium"] == "true"
    assert params["country_code"] == "us"
    assert params["url"] == "https://www.bestbuy.com/site/foo/12345.p"


@pytest.mark.asyncio
async def test_capture_adds_timestamp_overlay(screenshot_mocks: dict) -> None:
    """Timestamp watermark is drawn with 'Captured:' text via ImageDraw."""
    from src.services.screenshot import capture

    await capture(
        url="https://www.bestbuy.com/site/foo/12345.p",
        platform="best_buy",
        product_id="12345",
    )

    text_calls = screenshot_mocks["draw"].text.call_args_list
    assert text_calls, "Expected at least one ImageDraw.text() call"

    found_captured = any("Captured:" in str(call) for call in text_calls)
    assert found_captured, f"No 'Captured:' text found in {text_calls}"


@pytest.mark.asyncio
async def test_capture_uploads_correct_path(screenshot_mocks: dict) -> None:
    """Blob name follows evidence/{platform}/{product_id}/{timestamp}.png."""
    from src.services.screenshot import capture

    await capture(
        url="https://www.bestbuy.com/site/foo/12345.p",
        platform="best_buy",
        product_id="12345",
    )

    blob_call = screenshot_mocks["bucket"].blob.call_args
    blob_path = blob_call[0][0]
    assert blob_path.startswith("evidence/best_buy/12345/"), blob_path
    assert blob_path.endswith(".png"), blob_path


@pytest.mark.asyncio
async def test_capture_returns_none_on_failure(screenshot_mocks: dict) -> None:
    """On ScraperAPI failure, return None without raising."""
    screenshot_mocks["requests_get"].side_effect = RuntimeError("boom")

    from src.services.screenshot import capture

    result = await capture(
        url="https://www.bestbuy.com/site/foo/12345.p",
        platform="best_buy",
        product_id="12345",
    )

    assert result is None


@pytest.mark.asyncio
async def test_capture_returns_none_on_invalid_png(screenshot_mocks: dict) -> None:
    """ScraperAPI 200 with non-PNG bytes - service returns None, not garbage."""
    screenshot_mocks["requests_get"].return_value.content = b"not a png"

    from src.services.screenshot import capture

    result = await capture(
        url="https://www.bestbuy.com/site/foo/12345.p",
        platform="best_buy",
        product_id="12345",
    )

    assert result is None
    # And nothing was uploaded
    screenshot_mocks["blob"].upload_from_string.assert_not_called()


@pytest.mark.asyncio
async def test_capture_with_wait_selector(screenshot_mocks: dict) -> None:
    """wait_selector is accepted (back-compat) but no longer affects the call."""
    from src.services.screenshot import capture

    result = await capture(
        url="https://www.bestbuy.com/site/foo/12345.p",
        platform="best_buy",
        product_id="12345",
        wait_selector='[data-testid="price-block-customer-price"]',
    )

    # Function still succeeds when wait_selector is passed
    assert result == "https://storage.googleapis.com/signed/foo"
    # And nothing wait-selector-specific was sent to ScraperAPI
    params = screenshot_mocks["requests_get"].call_args.kwargs["params"]
    assert "wait_selector" not in params
    assert "wait_for" not in params
