"""Tests for GET /api/v1/notifications, POST /api/v1/notifications/:id/ack,
and POST /api/v1/notifications/ack-all.

Pattern mirrors test_routes_settings.py: AsyncMock(spec=MongoDBClient),
dependency_overrides[get_db], firebase_admin.auth.verify_id_token patched.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from claimit_mongodb_models import MongoDBClient, NotificationEvent, User
from httpx import AsyncClient
from src.deps import get_db
from src.main import app
from src.middleware.pagination import encode_cursor

from ._fixtures import USER_FIXTURE, make_notification_event

_FIREBASE_CLAIMS = {"uid": "test-uid", "email": "test@example.com"}
_NOTIF_ID_A = "40000000-0000-0000-0000-000000000001"
_NOTIF_ID_B = "40000000-0000-0000-0000-000000000002"


def _mock_db(
    *,
    list_docs: list[dict[str, object]] | None = None,
    unread_count: int = 0,
) -> AsyncMock:
    """DB mock for list endpoint: aggregate returns a $facet-shaped result.

    find_one returns a fresh User per call (same hardening as the settings
    tests — avoids cross-test mutation bleed from get_current_user)."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_args, **_kwargs: User.model_validate(USER_FIXTURE))
    unread_facet = [{"count": unread_count}] if unread_count else []
    db.aggregate = AsyncMock(return_value=[{"list": list_docs or [], "unread_count": unread_facet}])
    return db


def _mock_db_for_ack(
    *,
    existing_notification: NotificationEvent | None,
    partial_update_result: bool = True,
) -> AsyncMock:
    """DB mock for ack endpoint: find_one returns User for auth middleware,
    then the NotificationEvent (or None) for the ack lookup.

    side_effect cycles by call order: 1st call = auth middleware (User),
    2nd call = ack service (NotificationEvent | None)."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[User.model_validate(USER_FIXTURE), existing_notification])
    db.partial_update = AsyncMock(return_value=partial_update_result)
    return db


# ---------------------------------------------------------------------------
# GET /notifications
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_notifications_returns_200_with_expected_shape(
    client: AsyncClient,
) -> None:
    db = _mock_db(list_docs=[make_notification_event()], unread_count=1)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/notifications",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert set(payload.keys()) == {"notifications", "next_cursor", "unread_count"}
        assert len(payload["notifications"]) == 1
        assert payload["next_cursor"] is None
        assert payload["unread_count"] == 1
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_notifications_event_type_filter_passed_to_service(
    client: AsyncClient,
) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            await client.get(
                "/api/v1/notifications?event_type=claim_denied",
                headers={"Authorization": "Bearer valid-token"},
            )
        pipeline = db.aggregate.call_args.args[1]
        inner_match = pipeline[1]["$facet"]["list"][0]["$match"]
        assert inner_match == {"event_type": "claim_denied"}
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_notifications_acknowledged_filter_passed_to_service(
    client: AsyncClient,
) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            await client.get(
                "/api/v1/notifications?acknowledged=true",
                headers={"Authorization": "Bearer valid-token"},
            )
        pipeline = db.aggregate.call_args.args[1]
        inner_match = pipeline[1]["$facet"]["list"][0]["$match"]
        assert inner_match == {"acknowledged": True}
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_notifications_invalid_event_type_returns_422(
    client: AsyncClient,
) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/notifications?event_type=NOT_A_REAL_EVENT",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 422
        db.aggregate.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_notifications_limit_above_max_returns_422(
    client: AsyncClient,
) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/notifications?limit=101",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 422
        db.aggregate.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_notifications_limit_zero_returns_422(client: AsyncClient) -> None:
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/notifications?limit=0",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 422
        db.aggregate.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_notifications_default_limit_is_20(client: AsyncClient) -> None:
    """No limit query param → service called with limit=20 → pipeline queries
    21 docs (limit+1 for has-more detection)."""
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            await client.get(
                "/api/v1/notifications",
                headers={"Authorization": "Bearer valid-token"},
            )
        pipeline = db.aggregate.call_args.args[1]
        list_stages = pipeline[1]["$facet"]["list"]
        limit_stage = next(s for s in list_stages if "$limit" in s)
        assert limit_stage["$limit"] == 21
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_notifications_invalid_cursor_returns_400(
    client: AsyncClient,
) -> None:
    """A malformed cursor reaches decode_cursor in the service, which raises
    ApiError(invalid_cursor, 400)."""
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/notifications?cursor=garbage-not-base64-json",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_cursor"
        db.aggregate.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_notifications_requires_bearer(client: AsyncClient) -> None:
    """No Authorization header → 401. get_db override required because
    FastAPI resolves all dependencies eagerly (same pattern as
    test_routes_settings.py / test_routes_dashboard.py)."""
    mock_db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        response = await client.get("/api/v1/notifications")
        assert response.status_code == 401
        mock_db.aggregate.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_notifications_pagination_emits_next_cursor_when_has_more(
    client: AsyncClient,
) -> None:
    """Three docs returned with limit=2 → response carries 2 items and a
    next_cursor whose sort_key matches the second doc's created_at."""
    docs = [
        make_notification_event(
            notification_id=_NOTIF_ID_A, created_at="2026-05-18T12:00:00+00:00"
        ),
        make_notification_event(
            notification_id=_NOTIF_ID_B, created_at="2026-05-18T11:00:00+00:00"
        ),
        make_notification_event(
            notification_id="40000000-0000-0000-0000-000000000099",
            created_at="2026-05-18T10:00:00+00:00",
        ),
    ]
    db = _mock_db(list_docs=docs)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/notifications?limit=2",
                headers={"Authorization": "Bearer valid-token"},
            )
        payload = response.json()
        assert response.status_code == 200
        assert len(payload["notifications"]) == 2
        assert payload["next_cursor"] is not None
        from src.middleware.pagination import decode_cursor

        doc_id, sort_key = decode_cursor(payload["next_cursor"])
        assert doc_id == _NOTIF_ID_B
        assert sort_key == "2026-05-18T11:00:00+00:00"
    finally:
        app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# POST /notifications/:id/ack
# ---------------------------------------------------------------------------


def _make_notification(*, acknowledged: bool = False) -> NotificationEvent:
    return NotificationEvent.model_validate(make_notification_event(acknowledged=acknowledged))


@pytest.mark.asyncio
async def test_ack_notification_returns_200_with_notification(
    client: AsyncClient,
) -> None:
    db = _mock_db_for_ack(existing_notification=_make_notification(acknowledged=False))

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/notifications/{_NOTIF_ID_A}/ack",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert "notification" in payload
        assert payload["notification"]["acknowledged"] is True
        assert payload["notification"]["acknowledged_at"] is not None
        db.partial_update.assert_called_once()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_ack_notification_returns_404_when_not_found(
    client: AsyncClient,
) -> None:
    db = _mock_db_for_ack(existing_notification=None)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/notifications/{_NOTIF_ID_A}/ack",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "notification_not_found"
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_ack_notification_returns_404_when_belongs_to_other_user(
    client: AsyncClient,
) -> None:
    """find_one is filtered by {_id, user_id}; if the notification belongs
    to a different user, Motor returns None (same code path as 'not found').
    Response must NOT leak the existence of the other user's notification."""
    db = _mock_db_for_ack(existing_notification=None)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/notifications/{_NOTIF_ID_A}/ack",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "notification_not_found"
        # Confirm the ack lookup filter included user_id (2nd find_one call;
        # 1st was the auth middleware's user lookup).
        ack_call_filter = db.find_one.call_args_list[1].args[1]
        assert "user_id" in ack_call_filter
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_ack_notification_idempotent_returns_existing_without_write(
    client: AsyncClient,
) -> None:
    db = _mock_db_for_ack(existing_notification=_make_notification(acknowledged=True))

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/notifications/{_NOTIF_ID_A}/ack",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        assert response.json()["notification"]["acknowledged"] is True
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_ack_notification_requires_bearer(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        response = await client.post(f"/api/v1/notifications/{_NOTIF_ID_A}/ack")
        assert response.status_code == 401
        mock_db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_ack_notification_invalid_uuid_in_path_returns_422(
    client: AsyncClient,
) -> None:
    """FastAPI auto-validates the Annotated[UUID, Path()] param — a non-UUID
    path component returns 422 before any handler code runs."""
    db = _mock_db_for_ack(existing_notification=_make_notification())

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                "/api/v1/notifications/not-a-uuid/ack",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 422
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# POST /notifications/ack-all
# ---------------------------------------------------------------------------


def _mock_db_for_ack_all(*, modified_count: int) -> AsyncMock:
    """DB mock for ack-all: find_one returns User for auth middleware, then
    update_many returns the modified_count from the bulk $set."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_args, **_kwargs: User.model_validate(USER_FIXTURE))
    db.update_many = AsyncMock(return_value=modified_count)
    return db


@pytest.mark.asyncio
async def test_ack_all_returns_200_with_count(client: AsyncClient) -> None:
    """Happy path: 5 unread notifications flipped → response is
    `{"acknowledged_count": 5}` with HTTP 200."""
    db = _mock_db_for_ack_all(modified_count=5)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                "/api/v1/notifications/ack-all",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        assert response.json() == {"acknowledged_count": 5}
        db.update_many.assert_awaited_once()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_ack_all_idempotent_returns_zero(client: AsyncClient) -> None:
    """Second call from the same client (or any user with no unread) returns
    `acknowledged_count: 0` without raising."""
    db = _mock_db_for_ack_all(modified_count=0)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                "/api/v1/notifications/ack-all",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        assert response.json() == {"acknowledged_count": 0}
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_ack_all_filter_scopes_to_user_and_unread(client: AsyncClient) -> None:
    """The bulk filter is `{user_id, acknowledged: False}` — never bare —
    so a user can never ack another user's notifications, and acked rows
    are never re-flipped."""
    db = _mock_db_for_ack_all(modified_count=2)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            await client.post(
                "/api/v1/notifications/ack-all",
                headers={"Authorization": "Bearer valid-token"},
            )
        # Service calls update_many positionally: (collection, filter, updates).
        call = db.update_many.await_args
        assert call.args[0] == "notification_events"
        assert call.args[1] == {
            "user_id": UUID(USER_FIXTURE["_id"]),
            "acknowledged": False,
        }
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_ack_all_sets_acknowledged_true_and_iso_timestamp(
    client: AsyncClient,
) -> None:
    """The $set payload flips `acknowledged` to True and writes a non-empty
    ISO-8601 string into `acknowledged_at` (matches the schema field's
    `str | None` type)."""
    db = _mock_db_for_ack_all(modified_count=1)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            await client.post(
                "/api/v1/notifications/ack-all",
                headers={"Authorization": "Bearer valid-token"},
            )
        call = db.update_many.await_args
        updates = call.args[2]
        assert updates["acknowledged"] is True
        assert isinstance(updates["acknowledged_at"], str) and updates["acknowledged_at"]
        # Round-trips through datetime.fromisoformat — the service uses
        # datetime.now(UTC).isoformat().
        from datetime import datetime as _dt

        _dt.fromisoformat(updates["acknowledged_at"])
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_ack_all_requires_bearer(client: AsyncClient) -> None:
    """No Authorization header → 401 before the service is reached."""
    mock_db = AsyncMock(spec=MongoDBClient)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    try:
        response = await client.post("/api/v1/notifications/ack-all")
        assert response.status_code == 401
        mock_db.update_many.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_ack_all_route_takes_precedence_over_uuid_path(
    client: AsyncClient,
) -> None:
    """Route ordering is load-bearing: `/ack-all` is declared before
    `/{notification_id}/ack`. A POST to `/ack-all` must invoke the
    bulk handler (update_many), NOT 422 from UUID parsing or hit the
    single-id ack path."""
    db = _mock_db_for_ack_all(modified_count=1)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                "/api/v1/notifications/ack-all",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        db.update_many.assert_awaited_once()
        # partial_update is the single-id ack code path; ack-all must not touch it.
        assert "partial_update" not in {c[0] for c in db.method_calls}
    finally:
        app.dependency_overrides.pop(get_db, None)


# Smoke: confirm cursor round-trips end-to-end through the GET endpoint so a
# next_cursor returned in one response can be sent back as ?cursor= in the
# next and reach the service as a `$lt` on created_at.
@pytest.mark.asyncio
async def test_list_notifications_cursor_roundtrip_filters_next_page(
    client: AsyncClient,
) -> None:
    cursor = encode_cursor(doc_id=_NOTIF_ID_A, sort_key="2026-05-18T11:00:00+00:00")
    db = _mock_db()

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/notifications?cursor={cursor}",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 200
        pipeline = db.aggregate.call_args.args[1]
        inner_match = pipeline[1]["$facet"]["list"][0]["$match"]
        assert inner_match == {
            "$or": [
                {"created_at": {"$lt": "2026-05-18T11:00:00+00:00"}},
                {
                    "created_at": "2026-05-18T11:00:00+00:00",
                    "_id": {"$lt": UUID(_NOTIF_ID_A)},
                },
            ]
        }
    finally:
        app.dependency_overrides.pop(get_db, None)
