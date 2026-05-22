"""End-to-end tests for the 4.17 Gmail ingest pipeline.

The unit under test is `src.main._process_gmail_inbound` — the helper
that drives user lookup → token mint → history.list → loop over
messages.get → classify → dedup → insert sentinel → extract → finalize.

Mock boundaries are deliberately HIGH (at the module imports the
handler resolves, not at httpx / Gemini / Mongo) so each test reads as
"this is the scenario the handler walks through" instead of "this is
how the HTTP wrappers + Gemini agent + Mongo client are stitched
together". Per-module unit tests (test_gmail_api, test_gmail_parser,
test_extractor) cover those lower layers.

Scenarios:
- happy: history.list returns 2 messages, both are orders, both finalize cleanly
- skip not_order: classifier returns is_order=False (no sentinel insert)
- skip duplicate: receipt_hash already exists (no sentinel insert)
- skip user_not_found: cursor does NOT advance
- skip no_starting_cursor: cursor does NOT advance
- cap overflow: history returns 10, process 5, log over_cap, advance cursor anyway
- error messages.get: one msg fails, others process normally
- error extract: rescue helper called (sentinel doesn't spin forever)
- error finalize: log only, NO rescue (would double-clobber)
- empty messagesAdded: cursor STILL advances (per the agreed design)
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from claimit_mongodb_models import User
from src import main
from src.classifier import ClassificationResult
from src.extractor import EmailForExtraction
from src.finalize import FinalizeError
from src.gmail_api import GmailApiError

_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000aaa")
_EMAIL_ADDR = "user@gmail.com"
_PUSH_HISTORY_ID = "999"


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------


def _connected_user(
    *,
    last_processed_history_id: str | None = "100",
    watch_history_id: str | None = "50",
    ingestion_skiplist: list | None = None,
) -> User:
    """Build a User doc with Gmail connected and the requested cursor state."""
    return User.model_validate(
        {
            "_id": str(_USER_ID),
            "updated_at": None,
            "email": "u@example.com",
            "name": "U",
            "default_location": {"city": "X", "state": "Y", "lat": 0.0, "lon": 0.0},
            "loyalty_memberships": [],
            "gmail_integration": {
                "connected": True,
                "connected_at": "2026-05-14T00:00:00Z",
                "connected_email": _EMAIL_ADDR,
                "scopes_granted": ["https://www.googleapis.com/auth/gmail.readonly"],
                "refresh_token_ref": (
                    f"projects/test-project/secrets/gmail-refresh-token-{_USER_ID}/versions/latest"
                ),
                "watch_history_id": watch_history_id,
                "watch_expires_at": "2026-05-28T00:00:00Z",
                "last_processed_message_id": None,
                "last_processed_history_id": last_processed_history_id,
            },
            "send_preference": {
                "default_mode": "approval",
                "auto_send_delay_seconds": 300,
                "changed_at": None,
            },
            "ingestion_skiplist": ingestion_skiplist or [],
            "notification_prefs": {
                "web_push": True,
                "email": True,
                "muted_event_types": [],
            },
            "subscription": {"tier": "free", "trial_ends": None, "renewed_at": None},
            "created_at": "2024-01-01T00:00:00Z",
        }
    )


def _history_response(message_ids: list[str], *, history_id: str = "200") -> dict:
    """Shape that matches Gmail's users.history.list response."""
    return {
        "historyId": history_id,
        "history": [
            {
                "id": str(int(history_id) - 1),
                "messagesAdded": [{"message": {"id": mid}} for mid in message_ids],
            }
        ],
    }


def _email_for_extraction(*, sender: str = "Amazon <orders@amazon.com>") -> EmailForExtraction:
    return EmailForExtraction(
        user_id=_USER_ID,
        sender=sender,
        subject="Your order",
        snippet="Order confirmation",
        body_text="Total $24.99",
        ingestion_source="gmail",
    )


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.find_one = AsyncMock(return_value=None)
    db.partial_update = AsyncMock(return_value=1)
    db.upsert = AsyncMock(return_value=str(uuid.uuid4()))
    return db


@pytest.fixture
def mock_sm():
    return MagicMock()


@pytest.fixture(autouse=True)
def patch_all_pipeline_boundaries():
    """Patch every external dependency of `_process_gmail_inbound` at the
    module level. Tests opt in to specific behaviour by configuring the
    yielded mocks; otherwise they all behave as well-tempered no-ops."""
    with (
        patch.object(
            main, "exchange_refresh_for_access", new=AsyncMock(return_value="access-token")
        ) as mock_token,
        patch.object(
            main, "history_list", new=AsyncMock(return_value={"history": []})
        ) as mock_hist,
        patch.object(main, "messages_get", new=AsyncMock(return_value={})) as mock_msgs,
        patch.object(
            main, "parse_gmail_message", new=MagicMock(return_value=_email_for_extraction())
        ) as mock_parse,
        patch.object(
            main,
            "classify",
            new=MagicMock(return_value=ClassificationResult(is_order=True, confidence=0.99)),
        ) as mock_classify,
        patch.object(main, "hash_receipt", new=MagicMock(return_value="sha256:abc")) as mock_hash,
        patch.object(
            main, "compute_format_hash", new=MagicMock(return_value="sha256:fmt")
        ) as mock_fmt,
        patch.object(
            main, "insert_gmail_sentinel_purchase", new=AsyncMock(return_value=uuid.uuid4())
        ) as mock_insert,
        patch.object(main, "extract_from_email", new=AsyncMock()) as mock_extract,
        patch.object(main, "finalize_purchase_extraction", new=AsyncMock()) as mock_finalize,
        patch.object(main, "finalize_purchase_extraction_failure", new=AsyncMock()) as mock_rescue,
    ):
        yield {
            "token": mock_token,
            "hist": mock_hist,
            "msgs": mock_msgs,
            "parse": mock_parse,
            "classify": mock_classify,
            "hash": mock_hash,
            "fmt": mock_fmt,
            "insert": mock_insert,
            "extract": mock_extract,
            "finalize": mock_finalize,
            "rescue": mock_rescue,
        }


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_processes_both_messages_and_advances_cursor(
    mock_db, mock_sm, patch_all_pipeline_boundaries
) -> None:
    """2 new orders → both get sentinel-inserted + extracted + finalized,
    cursor advances to the push's historyId."""
    user = _connected_user()
    mock_db.find_one.side_effect = [user, None, None]  # user lookup, then dedup-misses
    patch_all_pipeline_boundaries["hist"].return_value = _history_response(["msg-1", "msg-2"])

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    # Both messages reached finalize.
    assert patch_all_pipeline_boundaries["finalize"].await_count == 2
    assert patch_all_pipeline_boundaries["rescue"].await_count == 0
    # Sentinel inserted twice.
    assert patch_all_pipeline_boundaries["insert"].await_count == 2
    # Cursor advanced.
    advance_call = next(
        c
        for c in mock_db.partial_update.await_args_list
        if "gmail_integration.last_processed_history_id" in c.args[2]
    )
    assert advance_call.args[2]["gmail_integration.last_processed_history_id"] == _PUSH_HISTORY_ID


# ---------------------------------------------------------------------------
# Skip paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_skip_user_not_found_does_not_advance_cursor(
    mock_db, mock_sm, patch_all_pipeline_boundaries
) -> None:
    """No User matches the emailAddress → log + return, no cursor write."""
    mock_db.find_one = AsyncMock(return_value=None)

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    assert patch_all_pipeline_boundaries["token"].await_count == 0
    assert patch_all_pipeline_boundaries["hist"].await_count == 0
    # No partial_update at all — cursor stays at the (unknown) prior value.
    mock_db.partial_update.assert_not_called()


@pytest.mark.asyncio
async def test_skip_no_starting_cursor_does_not_advance(
    mock_db, mock_sm, patch_all_pipeline_boundaries
) -> None:
    """User exists but has neither last_processed_history_id nor
    watch_history_id (watch was never registered) → log + return."""
    user = _connected_user(last_processed_history_id=None, watch_history_id=None)
    mock_db.find_one = AsyncMock(return_value=user)

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    assert patch_all_pipeline_boundaries["token"].await_count == 0
    mock_db.partial_update.assert_not_called()


@pytest.mark.asyncio
async def test_skip_classifier_not_order_no_sentinel_insert(
    mock_db, mock_sm, patch_all_pipeline_boundaries
) -> None:
    """Classifier rejects → no sentinel insert, no extract, no finalize.
    Cursor still advances (we did process the message — its outcome was
    "not an order")."""
    user = _connected_user()
    mock_db.find_one = AsyncMock(return_value=user)
    patch_all_pipeline_boundaries["hist"].return_value = _history_response(["msg-1"])
    patch_all_pipeline_boundaries["classify"].return_value = ClassificationResult(
        is_order=False, confidence=0.95
    )

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    assert patch_all_pipeline_boundaries["insert"].await_count == 0
    assert patch_all_pipeline_boundaries["extract"].await_count == 0
    assert patch_all_pipeline_boundaries["finalize"].await_count == 0
    # Cursor still advanced.
    advance_calls = [
        c
        for c in mock_db.partial_update.await_args_list
        if "gmail_integration.last_processed_history_id" in c.args[2]
    ]
    assert len(advance_calls) == 1


@pytest.mark.asyncio
async def test_skip_dedup_existing_receipt_no_sentinel_insert(
    mock_db, mock_sm, patch_all_pipeline_boundaries
) -> None:
    """receipt_hash already exists for this user → dedup skip."""
    user = _connected_user()
    existing_purchase = MagicMock(id=uuid.uuid4())
    # find_one called twice: once for user lookup, once for dedup
    mock_db.find_one = AsyncMock(side_effect=[user, existing_purchase])
    patch_all_pipeline_boundaries["hist"].return_value = _history_response(["msg-1"])

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    assert patch_all_pipeline_boundaries["insert"].await_count == 0
    assert patch_all_pipeline_boundaries["extract"].await_count == 0


# ---------------------------------------------------------------------------
# Cap overflow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cap_overflow_processes_first_n_and_advances_cursor(
    mock_db, mock_sm, patch_all_pipeline_boundaries, caplog
) -> None:
    """10 messages returned, cap=5 → process 5, log over_cap, advance to
    push's historyId regardless. Messages 6-10 are lost in this first
    cut (per the agreed design)."""
    user = _connected_user()
    mock_db.find_one = AsyncMock(
        side_effect=[user] + [None] * 10  # user + 5 dedup misses (only 5 reach dedup)
    )
    patch_all_pipeline_boundaries["hist"].return_value = _history_response(
        [f"msg-{i}" for i in range(10)]
    )

    import logging

    caplog.set_level(logging.WARNING, logger="src.main")

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    # Process cap is 5.
    assert patch_all_pipeline_boundaries["finalize"].await_count == 5
    # over_cap warning fired.
    assert any("gmail.over_cap" in r.getMessage() for r in caplog.records)
    # Cursor still advanced.
    advance_calls = [
        c
        for c in mock_db.partial_update.await_args_list
        if "gmail_integration.last_processed_history_id" in c.args[2]
    ]
    assert len(advance_calls) == 1


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_messages_get_failure_does_not_break_batch(
    mock_db, mock_sm, patch_all_pipeline_boundaries
) -> None:
    """One messages.get raises GmailApiError; others process normally."""
    user = _connected_user()
    mock_db.find_one = AsyncMock(side_effect=[user, None, None])
    patch_all_pipeline_boundaries["hist"].return_value = _history_response(["msg-1", "msg-2"])
    # First call fails, second succeeds (returns the default {}).
    patch_all_pipeline_boundaries["msgs"].side_effect = [
        GmailApiError(503, "transient"),
        {},
    ]

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    # Second message reached finalize despite first one failing.
    assert patch_all_pipeline_boundaries["finalize"].await_count == 1
    assert patch_all_pipeline_boundaries["rescue"].await_count == 0


@pytest.mark.asyncio
async def test_extract_failure_calls_rescue(
    mock_db, mock_sm, patch_all_pipeline_boundaries
) -> None:
    """extract_from_email raising → finalize_purchase_extraction_failure
    is called on the sentinel. No regular finalize call."""
    user = _connected_user()
    mock_db.find_one = AsyncMock(side_effect=[user, None])
    patch_all_pipeline_boundaries["hist"].return_value = _history_response(["msg-1"])
    sentinel_id = uuid.uuid4()
    patch_all_pipeline_boundaries["insert"].return_value = sentinel_id
    patch_all_pipeline_boundaries["extract"].side_effect = RuntimeError("gemini timeout")

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    # Rescue called exactly once, with the sentinel id.
    assert patch_all_pipeline_boundaries["rescue"].await_count == 1
    assert patch_all_pipeline_boundaries["rescue"].await_args.kwargs["purchase_id"] == sentinel_id
    # No regular finalize.
    assert patch_all_pipeline_boundaries["finalize"].await_count == 0


@pytest.mark.asyncio
async def test_finalize_error_does_not_call_rescue(
    mock_db, mock_sm, patch_all_pipeline_boundaries
) -> None:
    """finalize_purchase_extraction raising FinalizeError → log only.
    Rescue is NOT called (would double-clobber a doc that's already
    gone or partial-updated)."""
    user = _connected_user()
    mock_db.find_one = AsyncMock(side_effect=[user, None])
    patch_all_pipeline_boundaries["hist"].return_value = _history_response(["msg-1"])
    patch_all_pipeline_boundaries["finalize"].side_effect = FinalizeError("purchase disappeared")

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    assert patch_all_pipeline_boundaries["finalize"].await_count == 1
    # The crucial assertion — NO rescue.
    assert patch_all_pipeline_boundaries["rescue"].await_count == 0


# ---------------------------------------------------------------------------
# Empty messagesAdded — cursor still advances
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_messages_added_still_advances_cursor(
    mock_db, mock_sm, patch_all_pipeline_boundaries
) -> None:
    """history.list returns no messagesAdded (the push fired on a label
    change / metadata update, not a new message) → cursor advances to
    the push's historyId so we don't re-query the same empty window."""
    user = _connected_user()
    mock_db.find_one = AsyncMock(return_value=user)
    # Empty history array — no messagesAdded anywhere.
    patch_all_pipeline_boundaries["hist"].return_value = {"history": []}

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    assert patch_all_pipeline_boundaries["finalize"].await_count == 0
    advance_calls = [
        c
        for c in mock_db.partial_update.await_args_list
        if "gmail_integration.last_processed_history_id" in c.args[2]
    ]
    assert len(advance_calls) == 1
    assert (
        advance_calls[0].args[2]["gmail_integration.last_processed_history_id"] == _PUSH_HISTORY_ID
    )


# ---------------------------------------------------------------------------
# Cursor selection: first delivery vs steady state
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_first_delivery_uses_watch_history_id_as_start_cursor(
    mock_db, mock_sm, patch_all_pipeline_boundaries
) -> None:
    """User has watch_history_id=50 but no last_processed_history_id →
    history_list is called with startHistoryId=50."""
    user = _connected_user(last_processed_history_id=None, watch_history_id="50")
    mock_db.find_one = AsyncMock(return_value=user)

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    # history_list was called with start_history_id=50.
    call = patch_all_pipeline_boundaries["hist"].await_args
    assert call.args[1] == "50"


@pytest.mark.asyncio
async def test_steady_state_uses_last_processed_history_id_as_start_cursor(
    mock_db, mock_sm, patch_all_pipeline_boundaries
) -> None:
    """User has both — last_processed_history_id wins."""
    user = _connected_user(last_processed_history_id="100", watch_history_id="50")
    mock_db.find_one = AsyncMock(return_value=user)

    await main._process_gmail_inbound(mock_db, mock_sm, _EMAIL_ADDR, _PUSH_HISTORY_ID)

    assert patch_all_pipeline_boundaries["hist"].await_args.args[1] == "100"
