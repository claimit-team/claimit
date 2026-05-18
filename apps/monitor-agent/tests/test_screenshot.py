"""Unit tests for screenshot service - all I/O mocked.

The service renders adapter-fetched HTML locally via Playwright. Tests mock
_take_screenshot directly (avoids needing the heavyweight async-playwright
mock chain), plus storage.Client, PIL, and google.auth.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

_FAKE_PNG = b"\x89PNG\r\n\x1a\nfake_png_bytes"
_SAMPLE_HTML = "<html><body><div data-testid='price'>$278.00</div></body></html>"


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
def screenshot_mocks():
    """Patch external dependencies in src.services.screenshot."""
    take_screenshot = AsyncMock(return_value=_FAKE_PNG)
    client_cls, bucket, blob = _build_gcs_mock()
    image, image_draw, draw = _build_pillow_mock()
    auth = _build_auth_mock()

    patches = [
        patch("src.services.screenshot._take_screenshot", take_screenshot),
        patch("src.services.screenshot.storage.Client", client_cls),
        patch("src.services.screenshot.Image", image),
        patch("src.services.screenshot.ImageDraw", image_draw),
        patch("src.services.screenshot.get_default_credentials", auth),
    ]
    for p in patches:
        p.start()
    yield {
        "take_screenshot": take_screenshot,
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
        html=_SAMPLE_HTML,
        platform="best_buy",
        product_id="12345",
        url="https://www.bestbuy.com/site/foo/12345.p",
    )

    assert result == "https://storage.googleapis.com/signed/foo"
    # Verify the renderer was called with the HTML we passed
    screenshot_mocks["take_screenshot"].assert_called_once_with(_SAMPLE_HTML)


@pytest.mark.asyncio
async def test_capture_adds_timestamp_overlay(screenshot_mocks: dict) -> None:
    """Timestamp watermark is drawn with 'Captured:' text via ImageDraw."""
    from src.services.screenshot import capture

    await capture(
        html=_SAMPLE_HTML,
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
        html=_SAMPLE_HTML,
        platform="best_buy",
        product_id="12345",
    )

    blob_call = screenshot_mocks["bucket"].blob.call_args
    blob_path = blob_call[0][0]
    assert blob_path.startswith("evidence/best_buy/12345/"), blob_path
    assert blob_path.endswith(".png"), blob_path


@pytest.mark.asyncio
async def test_capture_returns_none_on_failure(screenshot_mocks: dict) -> None:
    """On renderer failure, return None without raising."""
    screenshot_mocks["take_screenshot"].side_effect = RuntimeError("boom")

    from src.services.screenshot import capture

    result = await capture(
        html=_SAMPLE_HTML,
        platform="best_buy",
        product_id="12345",
    )

    assert result is None


@pytest.mark.asyncio
async def test_capture_returns_none_on_invalid_png(screenshot_mocks: dict) -> None:
    """Renderer returned non-PNG bytes - service returns None, not garbage."""
    screenshot_mocks["take_screenshot"].return_value = b"not a png"

    from src.services.screenshot import capture

    result = await capture(
        html=_SAMPLE_HTML,
        platform="best_buy",
        product_id="12345",
    )

    assert result is None
    screenshot_mocks["blob"].upload_from_string.assert_not_called()


@pytest.mark.asyncio
async def test_capture_works_without_url(screenshot_mocks: dict) -> None:
    """The url parameter is optional (used only for logging)."""
    from src.services.screenshot import capture

    result = await capture(
        html=_SAMPLE_HTML,
        platform="best_buy",
        product_id="12345",
        # no url passed
    )

    assert result == "https://storage.googleapis.com/signed/foo"
