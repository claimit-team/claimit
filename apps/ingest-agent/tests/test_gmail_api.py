"""Tests for src/gmail_api.py — history.list + messages.get HTTP wrappers.

Both functions follow the same shape: build URL + headers, GET via
httpx.AsyncClient, branch on status code, return JSON or raise
typed errors. Tests mock at the httpx.AsyncClient boundary so the
URL / params / headers / status-code branches can all be exercised
without network access.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src import gmail_api
from src.gmail_api import (
    GmailApiError,
    GmailAuthError,
    history_list,
    messages_get,
)


def _fake_response(*, status_code: int, json_body: dict | None = None, text: str = ""):
    """Build a MagicMock that quacks like httpx.Response for the wrappers'
    branch logic (status_code, json(), text)."""
    response = MagicMock()
    response.status_code = status_code
    response.json = MagicMock(return_value=json_body if json_body is not None else {})
    response.text = text
    return response


def _patched_client(get_return: MagicMock):
    """Patch httpx.AsyncClient so the wrapper's `async with ...as client`
    yields a mock whose .get returns the supplied response."""
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=get_return)
    cm = patch.object(gmail_api.httpx, "AsyncClient")
    return cm, mock_client


# ---------------------------------------------------------------------------
# history_list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_history_list_happy_path_returns_json() -> None:
    """200 OK → returns the JSON body. Verifies the URL, header, and
    query params we send."""
    payload = {
        "historyId": "12347",
        "history": [
            {"id": "12346", "messagesAdded": [{"message": {"id": "abc"}}]},
        ],
    }
    response = _fake_response(status_code=200, json_body=payload)
    cm, mock_client = _patched_client(response)
    with cm as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        result = await history_list("fake-token", "12340")

    assert result == payload
    call = mock_client.get.await_args
    assert call.args[0] == "https://gmail.googleapis.com/gmail/v1/users/me/history"
    assert call.kwargs["headers"] == {"Authorization": "Bearer fake-token"}
    assert call.kwargs["params"]["startHistoryId"] == "12340"
    # `historyTypes` is passed as a list so httpx encodes it as the
    # repeated query params Gmail's REST API actually requires
    # (?historyTypes=messageAdded&historyTypes=labelAdded). A
    # comma-joined string would be treated as a literal value by
    # Gmail and silently never match the intended types.
    assert call.kwargs["params"]["historyTypes"] == ["messageAdded"]


@pytest.mark.asyncio
async def test_history_list_multiple_history_types_passes_list_not_comma_joined() -> None:
    """Multi-element history_types must be a list (httpx encodes it as
    repeated query params). A comma-joined string would be treated by
    Gmail as a literal value and silently never match. This test pins
    the wire encoding so a future refactor doesn't regress to the
    pre-CodeRabbit comma-join shape."""
    response = _fake_response(status_code=200, json_body={"history": []})
    cm, mock_client = _patched_client(response)
    with cm as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        await history_list("fake-token", "12340", history_types=("messageAdded", "labelAdded"))

    params = mock_client.get.await_args.kwargs["params"]
    assert params["historyTypes"] == ["messageAdded", "labelAdded"]


@pytest.mark.asyncio
async def test_history_list_empty_history_types_raises_value_error() -> None:
    """`history_types[0]` would IndexError under the old comma-join
    logic. The new path raises ValueError explicitly — a defensive
    sharp-edge guard for a public-ish API surface."""
    with pytest.raises(ValueError, match="non-empty"):
        await history_list("fake-token", "12340", history_types=())


@pytest.mark.asyncio
async def test_history_list_pagination_passes_page_token() -> None:
    """A non-None page_token is encoded as `pageToken` in the query."""
    response = _fake_response(status_code=200, json_body={"history": []})
    cm, mock_client = _patched_client(response)
    with cm as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        await history_list("fake-token", "12340", page_token="opaque-token")

    assert mock_client.get.await_args.kwargs["params"]["pageToken"] == "opaque-token"


@pytest.mark.asyncio
async def test_history_list_401_raises_gmail_auth_error() -> None:
    """401 → GmailAuthError so the caller can branch on token-mint retry."""
    response = _fake_response(
        status_code=401,
        json_body={"error": {"code": 401, "message": "Invalid Credentials"}},
    )
    cm, mock_client = _patched_client(response)
    with cm as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        with pytest.raises(GmailAuthError) as exc:
            await history_list("expired-token", "12340")
    assert "Invalid Credentials" in str(exc.value)


@pytest.mark.asyncio
async def test_history_list_4xx_raises_gmail_api_error_with_status() -> None:
    """403 (or any non-401 4xx) → GmailApiError with status_code preserved."""
    response = _fake_response(
        status_code=403,
        json_body={"error": {"code": 403, "message": "Insufficient permission"}},
    )
    cm, mock_client = _patched_client(response)
    with cm as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        with pytest.raises(GmailApiError) as exc:
            await history_list("fake-token", "12340")
    assert exc.value.status_code == 403
    assert "Insufficient permission" in exc.value.message


@pytest.mark.asyncio
async def test_history_list_5xx_raises_gmail_api_error() -> None:
    """5xx is also GmailApiError — the caller decides retry posture, not
    this wrapper."""
    response = _fake_response(status_code=503, text="backend unavailable")
    cm, mock_client = _patched_client(response)
    with cm as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        with pytest.raises(GmailApiError) as exc:
            await history_list("fake-token", "12340")
    assert exc.value.status_code == 503


# ---------------------------------------------------------------------------
# messages_get
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_messages_get_happy_path_returns_json() -> None:
    """200 → returns the message JSON. URL includes message_id and
    `format=full` query param."""
    payload = {
        "id": "msg-abc",
        "snippet": "Your order",
        "payload": {"headers": [{"name": "From", "value": "x"}]},
    }
    response = _fake_response(status_code=200, json_body=payload)
    cm, mock_client = _patched_client(response)
    with cm as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        result = await messages_get("fake-token", "msg-abc")

    assert result == payload
    call = mock_client.get.await_args
    assert call.args[0] == ("https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-abc")
    assert call.kwargs["headers"] == {"Authorization": "Bearer fake-token"}
    assert call.kwargs["params"] == {"format": "full"}


@pytest.mark.asyncio
async def test_messages_get_401_raises_gmail_auth_error() -> None:
    response = _fake_response(
        status_code=401,
        json_body={"error": {"message": "Token expired"}},
    )
    cm, mock_client = _patched_client(response)
    with cm as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        with pytest.raises(GmailAuthError):
            await messages_get("expired-token", "msg-abc")


@pytest.mark.asyncio
async def test_messages_get_4xx_raises_gmail_api_error() -> None:
    """404 (message deleted between history.list and messages.get) →
    GmailApiError. Caller treats as per-message skip."""
    response = _fake_response(
        status_code=404,
        json_body={"error": {"message": "Not Found"}},
    )
    cm, mock_client = _patched_client(response)
    with cm as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        with pytest.raises(GmailApiError) as exc:
            await messages_get("fake-token", "missing-id")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_messages_get_5xx_raises_gmail_api_error() -> None:
    response = _fake_response(status_code=500, text="internal error")
    cm, mock_client = _patched_client(response)
    with cm as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        with pytest.raises(GmailApiError) as exc:
            await messages_get("fake-token", "msg-abc")
    assert exc.value.status_code == 500


@pytest.mark.asyncio
async def test_error_message_falls_back_to_response_text() -> None:
    """When Gmail returns a non-JSON error body (rare — LB 502 etc.),
    `_extract_error_message` falls back to the raw text (capped)."""
    response = _fake_response(
        status_code=502,
        text="<html><body>Bad Gateway</body></html>",
    )
    # Make .json() raise to simulate a non-JSON body.
    response.json = MagicMock(side_effect=ValueError("not json"))
    cm, mock_client = _patched_client(response)
    with cm as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        with pytest.raises(GmailApiError) as exc:
            await messages_get("fake-token", "msg-abc")
    assert "Bad Gateway" in exc.value.message
