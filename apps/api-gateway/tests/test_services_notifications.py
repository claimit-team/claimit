"""Tests for the notifications service layer.

Mocks MongoDBClient.aggregate / find_one / partial_update; asserts the
pipeline structure, cursor handling, ownership filter, and idempotency.
Pattern mirrors test_services_dashboard.py.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from claimit_mongodb_models import MongoDBClient, NotificationEvent
from claimit_mongodb_models.enums import NotificationEntityType, NotificationEventType
from src.middleware.errors import ApiError
from src.middleware.pagination import encode_cursor
from src.services import notifications as svc

_USER_ID = UUID("00000000-0000-0000-0000-000000000001")
_OTHER_USER_ID = UUID("00000000-0000-0000-0000-000000000002")
_NOTIF_ID_A = UUID("40000000-0000-0000-0000-000000000001")
_NOTIF_ID_B = UUID("40000000-0000-0000-0000-000000000002")


def _doc(
    *,
    notif_id: UUID = _NOTIF_ID_A,
    user_id: UUID = _USER_ID,
    event_type: str = "price_dropped",
    acknowledged: bool = False,
    created_at: str = "2026-05-18T10:00:00+00:00",
) -> dict[str, object]:
    """Build a NotificationEvent-shaped dict (what aggregate() returns)."""
    return {
        "_id": notif_id,
        "updated_at": None,
        "user_id": user_id,
        "event_type": event_type,
        "entity_type": "claim",
        "entity_id": UUID("20000000-0000-0000-0000-000000000001"),
        "data": {"platform": "best_buy", "refund_amount": 50.0, "currency": "USD"},
        "acknowledged": acknowledged,
        "acknowledged_at": None,
        "surfaced_at": None,
        "created_at": created_at,
    }


def _mock_db_with_aggregate(
    list_docs: list[dict[str, object]] | None = None,
    unread_count: int | None = 0,
) -> AsyncMock:
    db = AsyncMock(spec=MongoDBClient)
    unread_facet = [{"count": unread_count}] if unread_count else []
    db.aggregate = AsyncMock(return_value=[{"list": list_docs or [], "unread_count": unread_facet}])
    return db


# ---------------------------------------------------------------------------
# list_notifications — pipeline structure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_pipeline_top_match_filters_by_user_id() -> None:
    db = _mock_db_with_aggregate()
    await svc.list_notifications(
        db=db, user_id=_USER_ID, event_type=None, acknowledged=None, limit=20, cursor=None
    )
    pipeline = db.aggregate.call_args.args[1]
    assert pipeline[0] == {"$match": {"user_id": _USER_ID}}


@pytest.mark.asyncio
async def test_list_pipeline_includes_event_type_filter_when_given() -> None:
    db = _mock_db_with_aggregate()
    await svc.list_notifications(
        db=db,
        user_id=_USER_ID,
        event_type=NotificationEventType.CLAIM_DENIED,
        acknowledged=None,
        limit=20,
        cursor=None,
    )
    pipeline = db.aggregate.call_args.args[1]
    inner_list_match = pipeline[1]["$facet"]["list"][0]["$match"]
    assert inner_list_match == {"event_type": "claim_denied"}


@pytest.mark.asyncio
async def test_list_pipeline_includes_acknowledged_true_filter() -> None:
    db = _mock_db_with_aggregate()
    await svc.list_notifications(
        db=db,
        user_id=_USER_ID,
        event_type=None,
        acknowledged=True,
        limit=20,
        cursor=None,
    )
    inner = db.aggregate.call_args.args[1][1]["$facet"]["list"][0]["$match"]
    assert inner == {"acknowledged": True}


@pytest.mark.asyncio
async def test_list_pipeline_includes_acknowledged_false_filter() -> None:
    db = _mock_db_with_aggregate()
    await svc.list_notifications(
        db=db,
        user_id=_USER_ID,
        event_type=None,
        acknowledged=False,
        limit=20,
        cursor=None,
    )
    inner = db.aggregate.call_args.args[1][1]["$facet"]["list"][0]["$match"]
    assert inner == {"acknowledged": False}


@pytest.mark.asyncio
async def test_list_pipeline_applies_cursor_as_lt_on_created_at() -> None:
    db = _mock_db_with_aggregate()
    cursor = encode_cursor(
        doc_id=str(_NOTIF_ID_A),
        sort_key="2026-05-18T09:30:00+00:00",
    )
    await svc.list_notifications(
        db=db,
        user_id=_USER_ID,
        event_type=None,
        acknowledged=None,
        limit=20,
        cursor=cursor,
    )
    inner = db.aggregate.call_args.args[1][1]["$facet"]["list"][0]["$match"]
    assert inner == {"created_at": {"$lt": "2026-05-18T09:30:00+00:00"}}


@pytest.mark.asyncio
async def test_list_pipeline_queries_limit_plus_one_docs() -> None:
    db = _mock_db_with_aggregate()
    await svc.list_notifications(
        db=db, user_id=_USER_ID, event_type=None, acknowledged=None, limit=20, cursor=None
    )
    list_stages = db.aggregate.call_args.args[1][1]["$facet"]["list"]
    limit_stage = next(s for s in list_stages if "$limit" in s)
    assert limit_stage["$limit"] == 21


@pytest.mark.asyncio
async def test_list_unread_count_facet_independent_of_request_filters() -> None:
    """The unread_count badge must reflect the user's total unread,
    not the filtered request — even if the caller filtered by event_type
    or acknowledged=True."""
    db = _mock_db_with_aggregate()
    await svc.list_notifications(
        db=db,
        user_id=_USER_ID,
        event_type=NotificationEventType.PRICE_DROPPED,
        acknowledged=True,
        limit=20,
        cursor=None,
    )
    unread_stages = db.aggregate.call_args.args[1][1]["$facet"]["unread_count"]
    assert unread_stages[0] == {"$match": {"acknowledged": False}}
    assert unread_stages[1] == {"$count": "count"}


# ---------------------------------------------------------------------------
# list_notifications — pagination result handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_emits_next_cursor_when_results_exceed_limit() -> None:
    docs = [
        _doc(notif_id=_NOTIF_ID_A, created_at="2026-05-18T12:00:00+00:00"),
        _doc(notif_id=_NOTIF_ID_B, created_at="2026-05-18T11:00:00+00:00"),
        _doc(
            notif_id=UUID("40000000-0000-0000-0000-000000000099"),
            created_at="2026-05-18T10:00:00+00:00",
        ),
    ]
    db = _mock_db_with_aggregate(list_docs=docs)
    result = await svc.list_notifications(
        db=db, user_id=_USER_ID, event_type=None, acknowledged=None, limit=2, cursor=None
    )
    assert len(result["notifications"]) == 2
    assert result["next_cursor"] is not None
    # next_cursor sort_key must be the LAST VISIBLE doc's created_at, not the
    # extra (limit+1) doc's.
    from src.middleware.pagination import decode_cursor as _decode

    doc_id, sort_key = _decode(result["next_cursor"])
    assert doc_id == str(_NOTIF_ID_B)
    assert sort_key == "2026-05-18T11:00:00+00:00"


@pytest.mark.asyncio
async def test_list_next_cursor_null_when_at_end_of_pages() -> None:
    docs = [_doc(notif_id=_NOTIF_ID_A)]
    db = _mock_db_with_aggregate(list_docs=docs, unread_count=1)
    result = await svc.list_notifications(
        db=db, user_id=_USER_ID, event_type=None, acknowledged=None, limit=20, cursor=None
    )
    assert len(result["notifications"]) == 1
    assert result["next_cursor"] is None
    assert result["unread_count"] == 1


# ---------------------------------------------------------------------------
# list_notifications — invalid cursors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_decode_cursor_failure_raises_400() -> None:
    db = _mock_db_with_aggregate()
    with pytest.raises(ApiError) as exc_info:
        await svc.list_notifications(
            db=db,
            user_id=_USER_ID,
            event_type=None,
            acknowledged=None,
            limit=20,
            cursor="not-a-real-cursor-!!!",
        )
    assert exc_info.value.code == "invalid_cursor"
    assert exc_info.value.status_code == 400
    db.aggregate.assert_not_called()


@pytest.mark.asyncio
async def test_list_cursor_missing_sort_key_raises_400() -> None:
    db = _mock_db_with_aggregate()
    cursor = encode_cursor(doc_id=str(_NOTIF_ID_A), sort_key=None)
    with pytest.raises(ApiError) as exc_info:
        await svc.list_notifications(
            db=db,
            user_id=_USER_ID,
            event_type=None,
            acknowledged=None,
            limit=20,
            cursor=cursor,
        )
    assert exc_info.value.code == "invalid_cursor"
    assert exc_info.value.status_code == 400
    db.aggregate.assert_not_called()


# ---------------------------------------------------------------------------
# ack_notification
# ---------------------------------------------------------------------------


def _make_event(*, acknowledged: bool = False) -> NotificationEvent:
    return NotificationEvent(
        _id=_NOTIF_ID_A,
        user_id=_USER_ID,
        event_type=NotificationEventType.PRICE_DROPPED,
        entity_type=NotificationEntityType.CLAIM,
        entity_id=UUID("20000000-0000-0000-0000-000000000001"),
        data={"platform": "best_buy"},
        acknowledged=acknowledged,
        acknowledged_at="2026-05-18T08:00:00+00:00" if acknowledged else None,
        created_at="2026-05-18T07:00:00+00:00",
    )


@pytest.mark.asyncio
async def test_ack_find_one_filter_scopes_to_user_id() -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=_make_event())
    db.partial_update = AsyncMock(return_value=True)

    await svc.ack_notification(db=db, user_id=_USER_ID, notification_id=_NOTIF_ID_A)

    db.find_one.assert_called_once()
    args = db.find_one.call_args.args
    assert args[0] == "notification_events"
    assert args[1] == {"_id": _NOTIF_ID_A, "user_id": _USER_ID}


@pytest.mark.asyncio
async def test_ack_returns_404_when_find_one_returns_none() -> None:
    """Covers both 'no notification with that id' AND 'notification belongs
    to a different user' (same code path — find_one filters on user_id, so a
    mismatch yields None just like a missing _id)."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=None)
    db.partial_update = AsyncMock()

    with pytest.raises(ApiError) as exc_info:
        await svc.ack_notification(db=db, user_id=_USER_ID, notification_id=_NOTIF_ID_A)
    assert exc_info.value.code == "notification_not_found"
    assert exc_info.value.status_code == 404
    db.partial_update.assert_not_called()


@pytest.mark.asyncio
async def test_ack_other_users_notification_returns_404() -> None:
    """Compound filter mismatch (id exists but for a different user) is
    indistinguishable from 'not found' to the caller."""
    db = AsyncMock(spec=MongoDBClient)
    # find_one returns None because the {_id, user_id} compound filter
    # didn't match — exactly what Motor would return.
    db.find_one = AsyncMock(return_value=None)

    with pytest.raises(ApiError) as exc_info:
        await svc.ack_notification(db=db, user_id=_OTHER_USER_ID, notification_id=_NOTIF_ID_A)
    assert exc_info.value.code == "notification_not_found"
    # And we confirm the filter included the user_id, not just the _id.
    args = db.find_one.call_args.args
    assert args[1] == {"_id": _NOTIF_ID_A, "user_id": _OTHER_USER_ID}


@pytest.mark.asyncio
async def test_ack_idempotent_when_already_acked() -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=_make_event(acknowledged=True))
    db.partial_update = AsyncMock()

    result = await svc.ack_notification(db=db, user_id=_USER_ID, notification_id=_NOTIF_ID_A)

    assert result.acknowledged is True
    assert result.acknowledged_at == "2026-05-18T08:00:00+00:00"
    db.partial_update.assert_not_called()


@pytest.mark.asyncio
async def test_ack_success_writes_true_and_iso_acknowledged_at() -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=_make_event(acknowledged=False))
    db.partial_update = AsyncMock(return_value=True)

    before = datetime.now(UTC)
    result = await svc.ack_notification(db=db, user_id=_USER_ID, notification_id=_NOTIF_ID_A)
    after = datetime.now(UTC)

    db.partial_update.assert_called_once()
    args = db.partial_update.call_args.args
    kwargs = db.partial_update.call_args.kwargs
    assert args[0] == "notification_events"
    assert args[1] == _NOTIF_ID_A
    updates = args[2]
    assert updates["acknowledged"] is True
    acked_at = datetime.fromisoformat(updates["acknowledged_at"])
    assert before <= acked_at <= after
    assert kwargs.get("model") is NotificationEvent
    # Returned object reflects the write.
    assert result.acknowledged is True
    assert result.acknowledged_at == updates["acknowledged_at"]
