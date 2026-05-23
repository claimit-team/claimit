"""Tests for claim.redraft_requested handler (task 3.21)."""

from __future__ import annotations

import base64
import json
import sys
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from claimit_mongodb_models import DraftGeneratedBy
from src.main import handle_claim_redraft_requested
from src.validator import ValidationResult

_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
_CLAIM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


def _make_redraft_event(
    claim_id: str = _CLAIM_ID,
    feedback: str = "make it friendlier",
) -> dict:
    return {
        "schema_version": 1,
        "event_id": "evt-redraft-001",
        "emitted_at": "2026-01-15T00:00:00Z",
        "event_type": "claim.redraft_requested",
        "user_id": _USER_ID,
        "claim_id": claim_id,
        "feedback": feedback,
    }


def _pubsub_body(event_dict: dict) -> dict:
    encoded = base64.b64encode(json.dumps(event_dict).encode()).decode()
    return {"message": {"data": encoded, "messageId": "msg-001"}, "subscription": "sub-001"}


def _make_mock_claim(
    claim_type: str = "email",
    redraft_count: int = 0,
    draft_versions: int = 1,
) -> MagicMock:
    claim = MagicMock()
    claim.id = uuid4()
    claim.user_id = UUID(_USER_ID)
    claim.purchase_id = uuid4()
    claim.platform = "best_buy"
    claim.claim_type = claim_type
    claim.claim_amount = 20.0
    claim.currency = "USD"
    claim.redraft_count = redraft_count
    claim.self_eval_attempts = 0
    claim.policy_clause_cited = "Price match within 15 days of purchase."
    claim.evidence_screenshot_url = None
    claim.send_override = None
    claim.trace_id = None
    claim.draft_versions = [MagicMock() for _ in range(draft_versions)]
    return claim


def _make_mock_db(claim: MagicMock | None = None) -> AsyncMock:
    now = datetime.now()
    purchase = MagicMock()
    purchase.id = uuid4()
    purchase.platform = "best_buy"
    purchase.price_paid = 100.0
    purchase.purchase_date = now
    purchase.window_expires = now + timedelta(days=14)
    purchase.order_id = "ord-test-001"
    purchase.product_name = "Mock Product"

    policy = MagicMock()
    policy.claim_email = "support@bestbuy.com"
    policy.policy_text_relevant_clause = "Price match within 15 days."
    policy.claim_url = None
    policy.policy_url = "https://bestbuy.com/price-match"
    policy.claim_phone = None

    user = MagicMock()
    user.name = "Jane Doe"
    user.send_preference = MagicMock()
    user.send_preference.default_mode = "approval"
    user.default_location = None

    db = AsyncMock()
    db.get_claim.return_value = claim if claim is not None else _make_mock_claim()
    db.get_purchase.return_value = purchase
    db.get_policy.return_value = policy
    db.get_user.return_value = user
    db.find_one.return_value = None
    db.try_insert_idempotency_record = AsyncMock(return_value=True)
    db.update_idempotency_record = AsyncMock(return_value=None)
    db.atomic_append_draft_version = AsyncMock(return_value=2)
    db.array_push.return_value = True
    db.array_push_and_update.return_value = None
    db.partial_update.return_value = True
    db.upsert_notification_event.return_value = "notif-id"
    return db


def _make_mock_request(body: dict) -> AsyncMock:
    req = AsyncMock()
    req.json.return_value = body
    return req


def _make_mock_draft(content: str = "Refined email draft content.") -> MagicMock:
    draft = MagicMock()
    draft.draft_content = content
    draft.policy_clause_cited = "Price match within 15 days."
    draft.claim_id = uuid4()
    return draft


# ---------------------------------------------------------------------------
# 1. Happy path — email claim type
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redraft_happy_path_email() -> None:
    mock_claim = _make_mock_claim(claim_type="email", redraft_count=0, draft_versions=1)
    mock_db = _make_mock_db(mock_claim)
    mock_draft = _make_mock_draft()
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_redraft_event()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.generate_email_draft", return_value=mock_draft),
        patch("src.main.validate", return_value=ValidationResult(valid=True)),
        patch("src.main.write_notification_event", return_value="notif-id"),
        patch(
            "src.main.handle_approval_mode", new=AsyncMock(return_value=MagicMock())
        ) as mock_approval,
        patch(
            "src.main.handle_auto_mode",
            new=AsyncMock(return_value=(MagicMock(), MagicMock())),
        ) as mock_auto,
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_claim_redraft_requested(request)

    assert result == {"status": "ok"}
    mock_db.atomic_append_draft_version.assert_awaited_once()
    append_kwargs = mock_db.atomic_append_draft_version.await_args.kwargs
    assert append_kwargs["content"] == mock_draft.draft_content
    assert append_kwargs["generated_by"] == DraftGeneratedBy.ASSISTANT_REDRAFT
    assert mock_approval.await_count + mock_auto.await_count == 1


# ---------------------------------------------------------------------------
# 2. Happy path — all other claim types route to correct generator
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "claim_type,generator_patch",
    [
        ("chat_script", "src.main.generate_chat_script"),
        ("in_store", "src.main.generate_in_store_guide"),
        ("self_service", "src.main.generate_self_service_walkthrough"),
    ],
)
async def test_redraft_happy_path_all_claim_types(claim_type: str, generator_patch: str) -> None:
    mock_claim = _make_mock_claim(claim_type=claim_type)
    mock_db = _make_mock_db(mock_claim)
    mock_draft = _make_mock_draft()
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_redraft_event()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch(generator_patch, return_value=mock_draft) as mock_gen,
        patch("src.main.validate", return_value=ValidationResult(valid=True)),
        patch("src.main.write_notification_event", return_value="notif-id"),
        patch("src.main.handle_approval_mode", new=AsyncMock(return_value=MagicMock())),
        patch(
            "src.main.handle_auto_mode",
            new=AsyncMock(return_value=(MagicMock(), MagicMock())),
        ),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_claim_redraft_requested(request)

    assert result == {"status": "ok"}
    mock_gen.assert_awaited_once()


# ---------------------------------------------------------------------------
# 3. Claim not found
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redraft_claim_not_found() -> None:
    mock_db = _make_mock_db()
    mock_db.get_claim.return_value = None

    request = _make_mock_request(_pubsub_body(_make_redraft_event()))

    with patch("src.main.MongoDBClient", return_value=mock_db):
        result = await handle_claim_redraft_requested(request)

    assert result == {"status": "error", "reason": "claim_not_found"}
    mock_db.array_push.assert_not_awaited()


# ---------------------------------------------------------------------------
# 4. Validation failure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redraft_validation_failure() -> None:
    mock_claim = _make_mock_claim(claim_type="email", redraft_count=0)
    mock_db = _make_mock_db(mock_claim)
    mock_draft = _make_mock_draft()
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_redraft_event()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.generate_email_draft", return_value=mock_draft),
        patch(
            "src.main.validate",
            return_value=ValidationResult(valid=False, issues=["Too short"]),
        ),
        patch("src.main.write_notification_event", return_value=None),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_claim_redraft_requested(request)

    assert result == {"status": "error", "reason": "validation_failed"}
    mock_db.atomic_append_draft_version.assert_not_awaited()


# ---------------------------------------------------------------------------
# 5. Validation failure escalation (redraft_count >= 1)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redraft_validation_failure_escalation() -> None:
    mock_claim = _make_mock_claim(claim_type="email", redraft_count=1)
    mock_db = _make_mock_db(mock_claim)
    mock_draft = _make_mock_draft()
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_redraft_event()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.generate_email_draft", return_value=mock_draft),
        patch(
            "src.main.validate",
            return_value=ValidationResult(valid=False, issues=["Placeholder not replaced"]),
        ),
        patch("src.main.write_notification_event", return_value=None) as mock_write,
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_claim_redraft_requested(request)

    assert result == {"status": "error", "reason": "validation_failed"}
    mock_write.assert_awaited_once()
    call_data = mock_write.await_args.kwargs["data"]
    assert call_data.get("escalated") is True


# ---------------------------------------------------------------------------
# 6. event.feedback is passed through to the generator (as `user_instruction`,
#    which is the generator's downstream kwarg — different field name on each
#    side of the event-to-generator boundary; see main.py:gen_kwargs comment).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redraft_feedback_passed_to_generator() -> None:
    mock_claim = _make_mock_claim(claim_type="email")
    mock_db = _make_mock_db(mock_claim)
    mock_draft = _make_mock_draft()
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    instruction = "make it friendlier"
    request = _make_mock_request(_pubsub_body(_make_redraft_event(feedback=instruction)))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.generate_email_draft", return_value=mock_draft) as mock_gen,
        patch("src.main.validate", return_value=ValidationResult(valid=True)),
        patch("src.main.write_notification_event", return_value="notif-id"),
        patch("src.main.handle_approval_mode", new=AsyncMock(return_value=MagicMock())),
        patch(
            "src.main.handle_auto_mode",
            new=AsyncMock(return_value=(MagicMock(), MagicMock())),
        ),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        await handle_claim_redraft_requested(request)

    mock_gen.assert_awaited_once()
    assert mock_gen.await_args.kwargs.get("user_instruction") == instruction


# ---------------------------------------------------------------------------
# 7. Appends a new version (array_push) — does not overwrite via upsert_claim
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redraft_email_null_policy_email_succeeds() -> None:
    """Redraft succeeds when policy.claim_email is null (Type A fallback)."""
    mock_claim = _make_mock_claim(claim_type="email", redraft_count=0, draft_versions=1)
    mock_db = _make_mock_db(mock_claim)
    mock_db.get_policy.return_value.claim_email = None
    mock_draft = _make_mock_draft()
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_redraft_event()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.generate_email_draft", return_value=mock_draft),
        patch("src.main.validate", return_value=ValidationResult(valid=True)),
        patch("src.main.write_notification_event", return_value="notif-id"),
        patch("src.main.handle_approval_mode", new=AsyncMock(return_value=MagicMock())),
        patch(
            "src.main.handle_auto_mode",
            new=AsyncMock(return_value=(MagicMock(), MagicMock())),
        ),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_claim_redraft_requested(request)

    assert result == {"status": "ok"}
    mock_db.atomic_append_draft_version.assert_awaited_once()


@pytest.mark.asyncio
async def test_redraft_appends_version_not_replaces() -> None:
    mock_claim = _make_mock_claim(claim_type="email", draft_versions=1)
    mock_db = _make_mock_db(mock_claim)
    mock_draft = _make_mock_draft()
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_redraft_event()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.generate_email_draft", return_value=mock_draft),
        patch("src.main.validate", return_value=ValidationResult(valid=True)),
        patch("src.main.write_notification_event", return_value="notif-id"),
        patch("src.main.handle_approval_mode", new=AsyncMock(return_value=MagicMock())),
        patch(
            "src.main.handle_auto_mode",
            new=AsyncMock(return_value=(MagicMock(), MagicMock())),
        ),
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_claim_redraft_requested(request)

    assert result == {"status": "ok"}
    mock_db.atomic_append_draft_version.assert_awaited_once()
    mock_db.upsert_claim.assert_not_awaited()
    append_kwargs = mock_db.atomic_append_draft_version.await_args.kwargs
    assert append_kwargs["generated_by"] == DraftGeneratedBy.ASSISTANT_REDRAFT


@pytest.mark.asyncio
async def test_redraft_already_processed_is_idempotent() -> None:
    mock_claim = _make_mock_claim(claim_type="email")
    mock_db = _make_mock_db(mock_claim)
    mock_db.try_insert_idempotency_record = AsyncMock(return_value=False)
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_redraft_event()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.generate_email_draft", new=AsyncMock()) as mock_gen,
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_claim_redraft_requested(request)

    assert result == {"status": "ok", "reason": "already_processed"}
    mock_gen.assert_not_awaited()
    mock_db.atomic_append_draft_version.assert_not_awaited()


# ---------------------------------------------------------------------------
# 8. Handler publishes claim.drafted event via send-mode functions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_redraft_publishes_claim_drafted_event() -> None:
    mock_claim = _make_mock_claim(claim_type="email")
    mock_db = _make_mock_db(mock_claim)
    mock_draft = _make_mock_draft()
    mock_search = MagicMock()
    mock_search.get_search_adapter.return_value = AsyncMock()

    request = _make_mock_request(_pubsub_body(_make_redraft_event()))

    with (
        patch("src.main.MongoDBClient", return_value=mock_db),
        patch("src.main.generate_email_draft", return_value=mock_draft),
        patch("src.main.validate", return_value=ValidationResult(valid=True)),
        patch("src.main.write_notification_event", return_value="notif-id"),
        patch("src.send_mode.publish_event", new=AsyncMock()) as mock_publish,
        patch.dict(sys.modules, {"search": mock_search}),
    ):
        result = await handle_claim_redraft_requested(request)

    assert result == {"status": "ok"}
    mock_publish.assert_awaited_once()
    topic, _event = mock_publish.await_args.args
    assert topic == "claim.drafted"
