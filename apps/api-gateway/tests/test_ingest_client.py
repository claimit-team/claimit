"""Tests for the ingest-agent extract client retry policy.

`extract_receipt` retries ONCE on a transient failure when the first attempt
failed fast enough to leave budget; 422 rejections and slow timeouts are not
retried. These tests drive the loop by stubbing `_extract_attempt` (the single
round-trip) and the module clock, so no real HTTP / OIDC happens.
"""

from __future__ import annotations

import pytest
from src.services import ingest_client
from src.services.ingest_client import IngestExtractError, extract_receipt


@pytest.fixture(autouse=True)
def _local_agent_url(monkeypatch: pytest.MonkeyPatch) -> None:
    # localhost URL → `_is_local` short-circuits token minting (no OIDC).
    monkeypatch.setenv("INGEST_AGENT_URL", "http://localhost:8001")


def _fake_clock(monkeypatch: pytest.MonkeyPatch, values: list[float]) -> None:
    """Make `time.monotonic()` return successive `values` then hold the last.

    `extract_receipt` calls it twice per attempt (start + after the error),
    so supply pairs: [start1, end1, start2, end2, ...].
    """
    seq = iter(values)
    state = {"last": values[-1]}

    def _next() -> float:
        state["last"] = next(seq, state["last"])
        return state["last"]

    monkeypatch.setattr(ingest_client.time, "monotonic", _next)


def _kwargs() -> dict[str, str | None]:
    return {"user_id": "u1", "storage_url": "gs://b/p.pdf", "content_type": "application/pdf"}


async def test_retryable_failure_then_success(monkeypatch: pytest.MonkeyPatch) -> None:
    # Fast first failure (elapsed 1s < 15s budget) → one retry, then success.
    _fake_clock(monkeypatch, [0.0, 1.0, 1.0, 2.0])
    calls = 0

    async def _attempt(*_args: object, **_kwargs: object) -> dict[str, object]:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise IngestExtractError("boom", code="transport_error", rejected=False)
        return {"platform": "amazon"}

    monkeypatch.setattr(ingest_client, "_extract_attempt", _attempt)

    result = await extract_receipt(**_kwargs())

    assert result == {"platform": "amazon"}
    assert calls == 2


async def test_rejected_422_is_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_clock(monkeypatch, [0.0, 1.0])
    calls = 0

    async def _attempt(*_args: object, **_kwargs: object) -> dict[str, object]:
        nonlocal calls
        calls += 1
        raise IngestExtractError("rejected", code="extractor_rejected_input", rejected=True)

    monkeypatch.setattr(ingest_client, "_extract_attempt", _attempt)

    with pytest.raises(IngestExtractError) as exc:
        await extract_receipt(**_kwargs())

    assert exc.value.code == "extractor_rejected_input"
    assert calls == 1


async def test_two_retryable_failures_raise_after_max_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _fake_clock(monkeypatch, [0.0, 1.0, 1.0, 2.0])
    calls = 0

    async def _attempt(*_args: object, **_kwargs: object) -> dict[str, object]:
        nonlocal calls
        calls += 1
        raise IngestExtractError("boom", code="extractor_failed", rejected=False)

    monkeypatch.setattr(ingest_client, "_extract_attempt", _attempt)

    with pytest.raises(IngestExtractError) as exc:
        await extract_receipt(**_kwargs())

    assert exc.value.code == "extractor_failed"
    assert calls == ingest_client._MAX_ATTEMPTS == 2


async def test_slow_first_attempt_is_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    # First attempt burned 30s (>= 15s budget) → no room for a retry.
    _fake_clock(monkeypatch, [0.0, 30.0])
    calls = 0

    async def _attempt(*_args: object, **_kwargs: object) -> dict[str, object]:
        nonlocal calls
        calls += 1
        raise IngestExtractError("timeout", code="extractor_failed", rejected=False)

    monkeypatch.setattr(ingest_client, "_extract_attempt", _attempt)

    with pytest.raises(IngestExtractError) as exc:
        await extract_receipt(**_kwargs())

    assert exc.value.code == "extractor_failed"
    assert calls == 1
