"""Tests for src/renewal.py — the 4.16 daily Gmail-watch renewal sweep.

These tests mock `claimit_gmail.register_watch_or_raise` at the boundary
between the sweep and the shared package. We're testing the SWEEP's
orchestration (query → iterate → count → never raise out), not Gmail-
API behaviour — that's already covered by
`packages/shared/gmail/tests/test_watch.py`.

Four scenarios:
- happy path: every user renews → counters reflect it
- WatchRegistrationError on one user → counter increments, loop continues
- unexpected Exception on one user → counter increments + traceback log
- empty query → counters all zero, no Gmail / persist calls made
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from claimit_gmail import WatchRegistrationError
from claimit_mongodb_models import MongoDBClient, User
from src import renewal

_USER_ID_A = "00000000-0000-0000-0000-00000000000a"
_USER_ID_B = "00000000-0000-0000-0000-00000000000b"


def _user_with_expiring_watch(user_id: str) -> User:
    """Build a User doc that the renewal query would surface — connected
    Gmail, refresh_token_ref set, watch_expires_at in the past so the
    24h lookahead matches."""
    return User.model_validate(
        {
            "_id": user_id,
            "updated_at": None,
            "email": "u@example.com",
            "name": "U",
            "default_location": {
                "city": "X",
                "state": "Y",
                "lat": 0.0,
                "lon": 0.0,
            },
            "loyalty_memberships": [],
            "gmail_integration": {
                "connected": True,
                "connected_at": "2026-05-14T00:00:00Z",
                "connected_email": "u@gmail.com",
                "scopes_granted": ["https://www.googleapis.com/auth/gmail.readonly"],
                "refresh_token_ref": (
                    f"projects/test-project/secrets/gmail-refresh-token-{user_id}/versions/latest"
                ),
                "watch_history_id": "1000",
                "watch_expires_at": "2026-05-21T00:00:00Z",  # in past relative to now
                "last_processed_message_id": None,
            },
            "send_preference": {
                "default_mode": "approval",
                "auto_send_delay_seconds": 300,
                "changed_at": None,
            },
            "ingestion_skiplist": [],
            "notification_prefs": {"web_push": True, "email": True, "muted_event_types": []},
            "subscription": {"tier": "free", "trial_ends": None, "renewed_at": None},
            "created_at": "2024-01-01T00:00:00Z",
        }
    )


@pytest.mark.asyncio
async def test_run_renewal_sweep_happy_path_renews_every_candidate() -> None:
    """Two users, both succeed. Counters reflect it; the query filter is
    the documented `connected + refresh_token_ref + watch_expires_at < now+24h`
    triple."""
    users = [_user_with_expiring_watch(_USER_ID_A), _user_with_expiring_watch(_USER_ID_B)]
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_many = AsyncMock(return_value=users)
    mock_db.partial_update = AsyncMock(return_value=1)

    sm_client = MagicMock()

    with patch.object(
        renewal,
        "register_watch_or_raise",
        new=AsyncMock(return_value=None),
    ) as mock_register:
        counters = await renewal.run_renewal_sweep(mock_db, sm_client)

    assert counters == {"scanned": 2, "renewed": 2, "failed": 0}
    assert mock_register.await_count == 2

    # Verify the query filter shape (documented contract worth pinning).
    find_call = mock_db.find_many.await_args
    collection = find_call.args[0]
    filter_ = find_call.args[1]
    assert collection == "users"
    assert filter_["gmail_integration.connected"] is True
    # Filter must require the field exists AND is non-null/non-empty —
    # not just `$ne: null`, which MongoDB also matches against missing
    # fields. A regression here would silently widen the sweep to docs
    # that can't be renewed.
    assert filter_["gmail_integration.refresh_token_ref"] == {
        "$exists": True,
        "$nin": [None, ""],
    }
    assert "$lt" in filter_["gmail_integration.watch_expires_at"]
    assert isinstance(filter_["gmail_integration.watch_expires_at"]["$lt"], datetime)


@pytest.mark.asyncio
async def test_run_renewal_sweep_continues_past_watch_registration_error() -> None:
    """One user fails with WatchRegistrationError, the next still gets
    processed, counters distinguish renewed vs failed, and the failed
    user's doc gets `watch_failed=True` persisted."""
    users = [_user_with_expiring_watch(_USER_ID_A), _user_with_expiring_watch(_USER_ID_B)]
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_many = AsyncMock(return_value=users)
    mock_db.partial_update = AsyncMock(return_value=1)

    sm_client = MagicMock()

    # User A raises, user B succeeds.
    async def _register(user_id: str, db, sm):
        if user_id == _USER_ID_A:
            raise WatchRegistrationError("Gmail watch rejected: Insufficient permission")

    with patch.object(renewal, "register_watch_or_raise", new=AsyncMock(side_effect=_register)):
        counters = await renewal.run_renewal_sweep(mock_db, sm_client)

    assert counters == {"scanned": 2, "renewed": 1, "failed": 1}

    # Failed user got watch_failed=True persisted with the terminal message.
    failure_call = next(
        c for c in mock_db.partial_update.await_args_list if c.args[1] == UUID(_USER_ID_A)
    )
    failure_update = failure_call.args[2]
    assert failure_update["gmail_integration.watch_failed"] is True
    assert "Insufficient permission" in failure_update["gmail_integration.watch_error_message"]


@pytest.mark.asyncio
async def test_run_renewal_sweep_continues_past_unexpected_exception() -> None:
    """An exception type other than WatchRegistrationError (e.g. a
    transient Mongo blip leaking out of register_watch_or_raise) is also
    counted as failed and the sweep keeps going. Persisted message
    surfaces the exception type for log triage."""
    users = [_user_with_expiring_watch(_USER_ID_A), _user_with_expiring_watch(_USER_ID_B)]
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_many = AsyncMock(return_value=users)
    mock_db.partial_update = AsyncMock(return_value=1)

    sm_client = MagicMock()

    async def _register(user_id: str, db, sm):
        if user_id == _USER_ID_A:
            raise RuntimeError("totally unrelated transient blip")

    with patch.object(renewal, "register_watch_or_raise", new=AsyncMock(side_effect=_register)):
        counters = await renewal.run_renewal_sweep(mock_db, sm_client)

    assert counters == {"scanned": 2, "renewed": 1, "failed": 1}

    failure_call = next(
        c for c in mock_db.partial_update.await_args_list if c.args[1] == UUID(_USER_ID_A)
    )
    failure_update = failure_call.args[2]
    assert failure_update["gmail_integration.watch_failed"] is True
    assert "RuntimeError" in failure_update["gmail_integration.watch_error_message"]


@pytest.mark.asyncio
async def test_run_renewal_sweep_empty_result_returns_zero_counters() -> None:
    """No users match the query → all-zero counters, no Gmail calls, no
    persist calls. The lookahead window query is still issued (we want
    to confirm "nothing to do" rather than "the cron got skipped")."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_many = AsyncMock(return_value=[])
    mock_db.partial_update = AsyncMock(return_value=1)

    sm_client = MagicMock()

    with patch.object(renewal, "register_watch_or_raise", new=AsyncMock()) as mock_register:
        counters = await renewal.run_renewal_sweep(mock_db, sm_client)

    assert counters == {"scanned": 0, "renewed": 0, "failed": 0}
    mock_register.assert_not_called()
    mock_db.partial_update.assert_not_called()
    mock_db.find_many.assert_awaited_once()
