"""Unit tests for the Phoenix span query helper in claimit_observability.

The helper lives in the shared package but the test lives here because
the assistant-agent is its first consumer — keeping the test alongside
the caller makes Mode B's behaviour easier to trace from a failing test.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest
from claimit_observability import phoenix_client
from claimit_observability.phoenix_client import (
    QueryResult,
    query_claim_spans,
)

_CLAIM_ID = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _reset_phoenix_client_cache() -> Any:
    """Each test re-derives the module-level client from env vars; without
    this fixture a test that sets PHOENIX_BASE_URL would leak its client
    into the next test even after monkeypatch tears the env vars down."""
    phoenix_client._reset_client_for_tests()
    yield
    phoenix_client._reset_client_for_tests()


def _install_fake_client(monkeypatch: pytest.MonkeyPatch, fake_get_spans: AsyncMock) -> None:
    """Patch AsyncClient so its `.spans.get_spans` is our fake."""
    monkeypatch.setenv("PHOENIX_API_KEY", "test-key")
    monkeypatch.setenv("PHOENIX_BASE_URL", "https://phoenix.example.com")

    class _FakeSpans:
        get_spans = fake_get_spans

    class _FakeAsyncClient:
        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            self.spans = _FakeSpans()

    monkeypatch.setattr(phoenix_client, "AsyncClient", _FakeAsyncClient)


async def test_query_claim_spans_returns_unavailable_when_api_key_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PHOENIX_API_KEY", raising=False)
    monkeypatch.setenv("PHOENIX_BASE_URL", "https://phoenix.example.com")

    result = await query_claim_spans(_CLAIM_ID)

    assert result == QueryResult(status="unavailable", spans=[])


async def test_query_claim_spans_returns_unavailable_when_base_url_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PHOENIX_API_KEY", "test-key")
    monkeypatch.delenv("PHOENIX_BASE_URL", raising=False)

    result = await query_claim_spans(_CLAIM_ID)

    assert result.status == "unavailable"
    assert result.spans == []


async def test_query_claim_spans_returns_pending_when_no_spans(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Phoenix's BatchSpanProcessor exports on a 5s schedule by default,
    so a user opening Mode B seconds after claim creation will hit this
    state. The caller turns "pending" into a graceful "trace not ready
    yet" message — must not be conflated with an outage."""
    fake = AsyncMock(return_value=[])
    _install_fake_client(monkeypatch, fake)

    result = await query_claim_spans(_CLAIM_ID)

    assert result.status == "pending"
    assert result.spans == []
    fake.assert_awaited_once()


async def test_query_claim_spans_respects_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _slow(*_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
        # Sleep much longer than the requested timeout; asyncio.wait_for
        # must cancel and return "timeout" rather than letting the call
        # block past the 2s demo budget.
        await asyncio.sleep(5)
        return []

    fake = AsyncMock(side_effect=_slow)
    _install_fake_client(monkeypatch, fake)

    result = await query_claim_spans(_CLAIM_ID, timeout=0.05)

    assert result.status == "timeout"
    assert result.spans == []


async def test_query_claim_spans_returns_ok_with_parsed_spans(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_spans: list[dict[str, Any]] = [
        {
            "name": "validator.validate",
            "start_time": "2026-05-22T12:00:00+00:00",
            "end_time": "2026-05-22T12:00:00.150000+00:00",
            "status_code": "OK",
            "attributes": {
                "claim.id": _CLAIM_ID,
                "draft.version": 1,
                "validator.issue_count": 2,
            },
        },
    ]
    fake = AsyncMock(return_value=fake_spans)
    _install_fake_client(monkeypatch, fake)

    result = await query_claim_spans(_CLAIM_ID)

    assert result.status == "ok"
    assert len(result.spans) == 1
    span = result.spans[0]
    assert span.name == "validator.validate"
    assert span.status_code == "OK"
    assert span.attributes["draft.version"] == 1
    assert span.start_time is not None
    assert span.end_time is not None


async def test_query_claim_spans_parses_stringified_list_attributes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """claim-agent stringifies `failed_dimensions` and `issue_types` via
    `str(some_list)` because OTel attribute values can't be containers
    (see self_evaluate.py:174, validator.py:96). The helper must round-
    trip them back to real lists so the aggregator can group cleanly."""
    fake_spans: list[dict[str, Any]] = [
        {
            "name": "validator.validate",
            "start_time": "2026-05-22T12:00:00+00:00",
            "end_time": "2026-05-22T12:00:00.150000+00:00",
            "status_code": "OK",
            "attributes": {
                "validator.issue_types": "['placeholder', 'order_id']",
                "self_eval.failed_dimensions": "['tone', 'accuracy']",
            },
        },
    ]
    fake = AsyncMock(return_value=fake_spans)
    _install_fake_client(monkeypatch, fake)

    result = await query_claim_spans(_CLAIM_ID)

    assert result.status == "ok"
    attrs = result.spans[0].attributes
    assert attrs["validator.issue_types"] == ["placeholder", "order_id"]
    assert attrs["self_eval.failed_dimensions"] == ["tone", "accuracy"]


async def test_query_claim_spans_keeps_raw_string_on_unparseable_attribute(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A malformed stringified list (e.g. truncated mid-export) must
    survive as the raw string — losing the value entirely would erase
    information the LLM could still surface to the user."""
    fake_spans: list[dict[str, Any]] = [
        {
            "name": "validator.validate",
            "start_time": "2026-05-22T12:00:00+00:00",
            "end_time": "2026-05-22T12:00:00.150000+00:00",
            "status_code": "OK",
            "attributes": {
                "validator.issue_types": "['broken",  # unterminated
                "free_form_note": "not a list at all",
            },
        },
    ]
    fake = AsyncMock(return_value=fake_spans)
    _install_fake_client(monkeypatch, fake)

    result = await query_claim_spans(_CLAIM_ID)

    assert result.status == "ok"
    attrs = result.spans[0].attributes
    assert attrs["validator.issue_types"] == "['broken"
    assert attrs["free_form_note"] == "not a list at all"


async def test_query_claim_spans_filters_by_claim_id_attribute(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The whole point of the helper is that the LLM never sees the
    filter — it's set server-side from the closure-bound claim_id. If a
    refactor drops the `attributes={"claim.id": ...}` arg the assistant
    would either return every claim's spans or none, both of which are
    indistinguishable failure modes from a passing happy-path test."""
    fake = AsyncMock(return_value=[])
    _install_fake_client(monkeypatch, fake)

    await query_claim_spans(_CLAIM_ID)

    kwargs = fake.await_args.kwargs
    assert kwargs["attributes"] == {"claim.id": _CLAIM_ID}


async def test_query_claim_spans_uses_phoenix_project_name_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PHOENIX_PROJECT_NAME", "claimit-prod")
    fake = AsyncMock(return_value=[])
    _install_fake_client(monkeypatch, fake)

    await query_claim_spans(_CLAIM_ID)

    assert fake.await_args.kwargs["project_identifier"] == "claimit-prod"


async def test_query_claim_spans_falls_back_to_unavailable_on_unexpected_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = AsyncMock(side_effect=RuntimeError("phoenix is down"))
    _install_fake_client(monkeypatch, fake)

    result = await query_claim_spans(_CLAIM_ID)

    assert result.status == "unavailable"
    assert result.spans == []
