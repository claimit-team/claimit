"""Unit tests for tools/claim_tools.py.

Each test invokes the factory with stubbed dependencies and exercises the
returned coroutine. The closure scope is the key invariant — the LLM never
provides user_id or claim_id at call time, so the tools must read them
from the closure and refuse access if the underlying doc disagrees.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from src.tools.claim_tools import (
    make_get_claim_context,
    make_get_reasoning_trace,
    make_request_redraft,
    make_update_send_override,
)

_USER_ID = "11111111-1111-4111-8111-111111111111"
_OTHER_USER_ID = "99999999-9999-4999-8999-999999999999"
_CLAIM_ID = "22222222-2222-4222-8222-222222222222"
_PURCHASE_ID = UUID("33333333-3333-4333-8333-333333333333")


def _fake_claim(
    *,
    user_id: str = _USER_ID,
    purchase_id: UUID | None = _PURCHASE_ID,
    platform: str | None = "best_buy",
    trace_id: str | None = "trace-abc",
    claim_type: str | None = "type_a_email",
    policy_clause_cited: str = "30-day price-protection guarantee §3.1",
    self_eval_score: Any = None,
    self_eval_attempts: int = 1,
) -> SimpleNamespace:
    """Build a minimal stand-in for a ClaimReadTolerant.

    The tool surface only touches a handful of attributes plus
    `model_dump` for context bundling, so a SimpleNamespace with a
    dummy `model_dump` is enough — keeps the tests free of the read-
    tolerant model's strict-field gymnastics.
    """
    obj = SimpleNamespace(
        user_id=UUID(user_id),
        purchase_id=purchase_id,
        platform=platform,
        trace_id=trace_id,
        claim_type=claim_type,
        policy_clause_cited=policy_clause_cited,
        self_eval_score=self_eval_score,
        self_eval_attempts=self_eval_attempts,
    )
    obj.model_dump = lambda **_kw: {  # type: ignore[attr-defined]
        "user_id": str(obj.user_id),
        "claim_id": _CLAIM_ID,
    }
    return obj


def _fake_db(*, claim: Any, purchase: Any = None, policy: Any = None) -> AsyncMock:
    db = AsyncMock()
    db.get_claim = AsyncMock(return_value=claim)
    db.get_purchase = AsyncMock(return_value=purchase)
    db.get_policy = AsyncMock(return_value=policy)
    db.partial_update = AsyncMock(return_value=True)
    return db


# ---------------------------------------------------------------------------
# get_claim_context
# ---------------------------------------------------------------------------


async def test_get_claim_context_happy_path() -> None:
    claim = _fake_claim()
    purchase = SimpleNamespace(model_dump=lambda **_kw: {"id": str(_PURCHASE_ID)})
    policy = SimpleNamespace(model_dump=lambda **_kw: {"platform": "best_buy"})
    db = _fake_db(claim=claim, purchase=purchase, policy=policy)

    tool = make_get_claim_context(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    out = await tool()

    assert out["claim"]["user_id"] == _USER_ID
    assert out["purchase"]["id"] == str(_PURCHASE_ID)
    assert out["policy"]["platform"] == "best_buy"
    db.get_claim.assert_awaited_once_with(_CLAIM_ID)


async def test_get_claim_context_refuses_when_user_mismatch() -> None:
    claim = _fake_claim(user_id=_OTHER_USER_ID)
    db = _fake_db(claim=claim)

    tool = make_get_claim_context(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    out = await tool()

    assert out == {"error": "not_authorized"}
    db.get_purchase.assert_not_awaited()
    db.get_policy.assert_not_awaited()


async def test_get_claim_context_missing_claim_returns_error() -> None:
    db = _fake_db(claim=None)

    tool = make_get_claim_context(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    out = await tool()

    assert out == {"error": "claim_not_found"}


# ---------------------------------------------------------------------------
# update_send_override
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("mode", ["approval", "auto", None])
async def test_update_send_override_accepts_valid_modes(mode: str | None) -> None:
    claim = _fake_claim()
    db = _fake_db(claim=claim)

    tool = make_update_send_override(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    out = await tool(mode)

    assert out == {"ok": True, "send_override": mode}
    db.partial_update.assert_awaited_once()
    args, _kwargs = db.partial_update.call_args
    # partial_update(collection, id, updates, model=Claim) — keep the
    # interface contract green so a future signature change has to come
    # back and update this test alongside the production code.
    assert args[0] == "claims"
    assert args[1] == _CLAIM_ID
    assert "send_override" in args[2]


async def test_update_send_override_rejects_invalid_mode() -> None:
    claim = _fake_claim()
    db = _fake_db(claim=claim)

    tool = make_update_send_override(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    out = await tool("nonsense")

    assert out["error"] == "invalid_mode"
    db.get_claim.assert_not_awaited()
    db.partial_update.assert_not_awaited()


async def test_update_send_override_refuses_when_user_mismatch() -> None:
    """The api-gateway already gates ownership at conversation open time —
    this is defense-in-depth for the case where a stale or hijacked
    session reaches the tool with the wrong user_id closure."""
    claim = _fake_claim(user_id=_OTHER_USER_ID)
    db = _fake_db(claim=claim)

    tool = make_update_send_override(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    out = await tool("auto")

    assert out == {"error": "not_authorized"}
    db.partial_update.assert_not_awaited()


async def test_update_send_override_missing_claim() -> None:
    db = _fake_db(claim=None)

    tool = make_update_send_override(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    out = await tool("auto")

    assert out == {"error": "claim_not_found"}
    db.partial_update.assert_not_awaited()


# ---------------------------------------------------------------------------
# request_redraft
# ---------------------------------------------------------------------------


async def test_request_redraft_publishes_with_correct_payload() -> None:
    publish = AsyncMock(return_value="message-id-xyz")
    db = _fake_db(claim=_fake_claim())
    tool = make_request_redraft(
        user_id=_USER_ID,
        claim_id=_CLAIM_ID,
        db_factory=lambda: db,
        publish=publish,
    )

    out = await tool("make it friendlier")

    assert out["ok"] is True
    assert out["message_id"] == "message-id-xyz"
    db.get_claim.assert_awaited_once_with(_CLAIM_ID)
    publish.assert_awaited_once()
    topic, event = publish.call_args.args
    assert topic == "claim.redraft_requested"
    assert event.user_id == _USER_ID
    assert event.claim_id == _CLAIM_ID
    assert event.feedback == "make it friendlier"
    assert event.requested_by == "assistant"
    assert out["event_id"] == event.event_id


async def test_request_redraft_rejects_empty_feedback() -> None:
    publish = AsyncMock()
    tool = make_request_redraft(user_id=_USER_ID, claim_id=_CLAIM_ID, publish=publish)

    out = await tool("   ")

    assert out == {"error": "empty_feedback"}
    publish.assert_not_awaited()


async def test_request_redraft_truncates_overlong_feedback() -> None:
    """The Pydantic model caps at 500 — truncating here gives the LLM a
    clean success path rather than a validation traceback to interpret."""
    publish = AsyncMock(return_value="ok")
    db = _fake_db(claim=_fake_claim())
    tool = make_request_redraft(
        user_id=_USER_ID,
        claim_id=_CLAIM_ID,
        db_factory=lambda: db,
        publish=publish,
    )

    await tool("x" * 1000)

    event = publish.call_args.args[1]
    assert len(event.feedback) == 500


async def test_request_redraft_reports_publish_failure() -> None:
    publish = AsyncMock(side_effect=RuntimeError("broker unreachable"))
    db = _fake_db(claim=_fake_claim())
    tool = make_request_redraft(
        user_id=_USER_ID,
        claim_id=_CLAIM_ID,
        db_factory=lambda: db,
        publish=publish,
    )

    out = await tool("shorter please")

    assert out["error"] == "publish_failed"
    assert "broker unreachable" in out["detail"]


async def test_request_redraft_refuses_when_user_mismatch() -> None:
    publish = AsyncMock(return_value="message-id-xyz")
    db = _fake_db(claim=_fake_claim(user_id=_OTHER_USER_ID))
    tool = make_request_redraft(
        user_id=_USER_ID,
        claim_id=_CLAIM_ID,
        db_factory=lambda: db,
        publish=publish,
    )

    out = await tool("make it friendlier")

    assert out == {"error": "not_authorized"}
    publish.assert_not_awaited()


async def test_request_redraft_missing_claim() -> None:
    publish = AsyncMock(return_value="message-id-xyz")
    db = _fake_db(claim=None)
    tool = make_request_redraft(
        user_id=_USER_ID,
        claim_id=_CLAIM_ID,
        db_factory=lambda: db,
        publish=publish,
    )

    out = await tool("make it friendlier")

    assert out == {"error": "claim_not_found"}
    publish.assert_not_awaited()


# ---------------------------------------------------------------------------
# get_reasoning_trace
# ---------------------------------------------------------------------------


async def test_get_reasoning_trace_happy_path_no_phoenix_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PHOENIX_BASE_URL", raising=False)
    claim = _fake_claim(
        trace_id="trace-abc",
        self_eval_score=SimpleNamespace(
            model_dump=lambda: {"clarity": 9, "tone": 8, "accuracy": 10, "completeness": 9}
        ),
        self_eval_attempts=2,
    )
    db = _fake_db(claim=claim)

    tool = make_get_reasoning_trace(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    out = await tool()

    assert out["trace_id"] == "trace-abc"
    assert out["claim_type"] == "type_a_email"
    assert out["policy_clause_cited"].startswith("30-day")
    assert out["self_eval_score"] == {
        "clarity": 9,
        "tone": 8,
        "accuracy": 10,
        "completeness": 9,
    }
    assert out["self_eval_attempts"] == 2
    assert out["phoenix_link"] is None


async def test_get_reasoning_trace_builds_phoenix_link(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PHOENIX_BASE_URL", "https://phoenix.example.com/projects/claimit/")
    claim = _fake_claim(trace_id="trace-abc")
    db = _fake_db(claim=claim)

    tool = make_get_reasoning_trace(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    out = await tool()

    assert out["phoenix_link"] == "https://phoenix.example.com/projects/claimit/traces/trace-abc"


async def test_get_reasoning_trace_refuses_when_user_mismatch() -> None:
    claim = _fake_claim(user_id=_OTHER_USER_ID)
    db = _fake_db(claim=claim)

    tool = make_get_reasoning_trace(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    out = await tool()

    assert out == {"error": "not_authorized"}


async def test_get_reasoning_trace_no_trace_id_omits_link() -> None:
    claim = _fake_claim(trace_id=None)
    db = _fake_db(claim=claim)

    tool = make_get_reasoning_trace(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    out = await tool()

    assert out["trace_id"] is None
    assert out["phoenix_link"] is None


# ---------------------------------------------------------------------------
# Closure scope guarantee
# ---------------------------------------------------------------------------


async def test_tools_do_not_accept_claim_id_arg() -> None:
    """The closure-scoped tools must NOT expose claim_id or user_id as
    callable arguments — that's the whole point of the factory shape.
    If a model tried to pass them, Python should reject the call before
    the body runs."""
    claim = _fake_claim()
    db = _fake_db(claim=claim)

    tool_a = make_get_claim_context(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)
    tool_b = make_get_reasoning_trace(user_id=_USER_ID, claim_id=_CLAIM_ID, db_factory=lambda: db)

    with pytest.raises(TypeError):
        await tool_a(claim_id="hijacked")  # type: ignore[call-arg]
    with pytest.raises(TypeError):
        await tool_b(user_id="hijacked")  # type: ignore[call-arg]
