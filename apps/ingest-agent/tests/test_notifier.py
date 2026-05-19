"""Tests for low-confidence confirmation email notifier."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import httpx
import pytest
from src.notifier import (
    ConfirmationEmailError,
    build_confirm_url,
    build_confirmation_email_html,
    maybe_send_confirmation_email,
    send_confirmation_email,
)

PURCHASE_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


@pytest.fixture(autouse=True)
def _frontend_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://app.example.com")


def test_build_confirm_url() -> None:
    assert build_confirm_url(PURCHASE_ID) == (f"https://app.example.com/confirm/{PURCHASE_ID}")


def test_build_confirmation_email_html_includes_summary() -> None:
    html = build_confirmation_email_html(
        product_name="Widget",
        price_paid=24.99,
        platform="best_buy",
        confirm_url="https://app.example.com/confirm/x",
    )
    assert "Widget" in html
    assert "Best Buy" in html
    assert "$24.99" in html
    assert "https://app.example.com/confirm/x" in html


@pytest.mark.asyncio
async def test_send_confirmation_email_via_gmail() -> None:
    mock_http = AsyncMock(spec=httpx.AsyncClient)
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_http.post = AsyncMock(return_value=mock_response)

    with (
        patch("src.notifier._read_refresh_token", return_value="refresh-token"),
        patch("src.notifier.get_gmail_access_token", return_value="access-token"),
    ):
        transport = await send_confirmation_email(
            purchase_id=PURCHASE_ID,
            product_name="Widget",
            price_paid=19.99,
            platform="amazon",
            user_email="user@example.com",
            gmail_refresh_token_ref="projects/p/secrets/s/versions/1",
            gmail_connected_email="gmail@example.com",
            http_client=mock_http,
        )

    assert transport == "gmail"
    mock_http.post.assert_awaited_once()
    call_kwargs = mock_http.post.await_args.kwargs
    assert call_kwargs["headers"]["Authorization"] == "Bearer access-token"


@pytest.mark.asyncio
async def test_send_confirmation_email_falls_back_to_sendgrid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SENDGRID_API_KEY", "sg-test-key")
    monkeypatch.setenv("SENDGRID_FROM_EMAIL", "notify@claimit.ai")

    mock_http = AsyncMock(spec=httpx.AsyncClient)
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_http.post = AsyncMock(return_value=mock_response)

    with patch("src.notifier._read_refresh_token", side_effect=RuntimeError("no gmail")):
        transport = await send_confirmation_email(
            purchase_id=PURCHASE_ID,
            product_name="Widget",
            price_paid=19.99,
            platform="amazon",
            user_email="user@example.com",
            gmail_refresh_token_ref="projects/p/secrets/s/versions/1",
            http_client=mock_http,
        )

    assert transport == "sendgrid"
    assert mock_http.post.await_args.args[0] == "https://api.sendgrid.com/v3/mail/send"


@pytest.mark.asyncio
async def test_maybe_send_confirmation_email_skips_non_pending() -> None:
    result = await maybe_send_confirmation_email(
        {"_id": str(PURCHASE_ID), "status": "monitoring"},
        user_email="user@example.com",
    )
    assert result is None


@pytest.mark.asyncio
async def test_maybe_send_confirmation_email_triggers_for_pending() -> None:
    purchase = {
        "_id": str(PURCHASE_ID),
        "status": "pending_confirmation",
        "product_name": "Widget",
        "price_paid": 10.0,
        "platform": "target",
    }
    with patch(
        "src.notifier.send_confirmation_email",
        new_callable=AsyncMock,
        return_value="gmail",
    ) as mock_send:
        transport = await maybe_send_confirmation_email(
            purchase,
            user_email="user@example.com",
        )
    assert transport == "gmail"
    mock_send.assert_awaited_once()


@pytest.mark.asyncio
async def test_low_confidence_extract_triggers_confirmation_email(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Integration: extract() with pending_confirmation calls notifier."""
    import json

    from src.extractor import EmailForExtraction, extract

    payload = {
        "platform": "best_buy",
        "category": "retail",
        "product_name": "Widget",
        "product_id": "W123",
        "product_url": None,
        "variant": None,
        "fare_class": None,
        "room_type": None,
        "bed_type": None,
        "rate_type": None,
        "price_paid": 24.99,
        "member_price_at_purchase": None,
        "non_member_price_at_purchase": None,
        "purchase_date": "2026-05-04T18:22:31Z",
        "purchase_date_basis": "order_date",
        "order_id": "A123",
        "member_tier_at_purchase": None,
        "extraction_confidence": {
            "platform": 0.94,
            "price": 0.99,
            "overall_min": 0.94,
            "order_id": 0.99,
            "product_name": 0.97,
            "product_id": 0.96,
            "price_paid": 0.98,
            "purchase_date": 0.95,
            "category": 0.98,
        },
    }

    async def fake_run_agent(_email: EmailForExtraction) -> str:
        return json.dumps(payload)

    mock_maybe = AsyncMock(return_value="gmail")
    monkeypatch.setattr("src.extractor._run_extractor_agent", fake_run_agent)
    monkeypatch.setattr("src.extractor.maybe_send_confirmation_email", mock_maybe)

    email = EmailForExtraction(
        user_id="11111111-1111-4111-8111-111111111111",
        sender="orders@example.com",
        subject="Order confirmed",
        body_text="Order #A123",
    )
    result = await extract(
        email,
        user_email="user@example.com",
        gmail_refresh_token_ref="projects/p/secrets/s/versions/1",
    )

    assert result["status"] == "pending_confirmation"
    mock_maybe.assert_awaited_once()
    call_kwargs = mock_maybe.await_args.kwargs
    assert call_kwargs["user_email"] == "user@example.com"


def test_build_confirm_url_requires_frontend_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FRONTEND_BASE_URL", raising=False)
    with pytest.raises(ConfirmationEmailError):
        build_confirm_url(PURCHASE_ID)
