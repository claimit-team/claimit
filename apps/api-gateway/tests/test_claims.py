"""Tests for /api/v1/claims/* endpoints.

Pattern mirrors test_routes_notifications.py:
- AsyncMock(spec=MongoDBClient) with side_effect-driven find_one
- app.dependency_overrides for get_db + get_pubsub_publisher
- firebase_admin.auth.verify_id_token patched per request
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from claimit_mongodb_models import Claim, MongoDBClient, User
from httpx import AsyncClient
from src.deps import get_db, get_pubsub_publisher
from src.main import app
from src.services.pubsub_publisher import PubSubPublisher

from ._fixtures import USER_FIXTURE, make_claim, make_purchase

_FIREBASE_CLAIMS = {"uid": "test-uid", "email": "test@example.com"}
_USER_ID = "00000000-0000-0000-0000-000000000001"
_CLAIM_ID = "20000000-0000-0000-0000-000000000001"
_OTHER_CLAIM_ID = "20000000-0000-0000-0000-000000000099"


def _user_for_auth() -> User:
    return User.model_validate(USER_FIXTURE)


def _claim_doc(**overrides: object) -> dict[str, object]:
    return make_claim(user_id=_USER_ID, claim_id=_CLAIM_ID, **overrides)


def _override_publisher(publisher: PubSubPublisher) -> None:
    async def _override() -> PubSubPublisher:
        return publisher

    app.dependency_overrides[get_pubsub_publisher] = _override


def _override_db(db: MongoDBClient) -> None:
    async def _override() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override


def _clear_overrides() -> None:
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_pubsub_publisher, None)


# ---------------------------------------------------------------------------
# GET /claims
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_claims_empty(client: AsyncClient) -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get("/api/v1/claims", headers={"Authorization": "Bearer t"})
        assert response.status_code == 200
        payload = response.json()
        assert payload == {"claims": [], "next_cursor": None}
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_claims_with_filters_passes_them_to_aggregation(
    client: AsyncClient,
) -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[_claim_doc()])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/claims",
                params={"outcome": "approved", "platform": "best_buy", "limit": "5"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        # Inspect the aggregation $match the service built.
        pipeline = db.aggregate.await_args.args[1]
        match = pipeline[0]["$match"]
        assert match["user_id"] == UUID(_USER_ID)
        assert match["outcome"] == "approved"
        assert match["platform"] == "best_buy"
        assert pipeline[-1]["$limit"] == 6  # limit + 1 for has-more probe
        assert response.json()["next_cursor"] is None
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# GET /claims/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_claim_detail_success(client: AsyncClient) -> None:
    from claimit_mongodb_models import Purchase

    claim = Claim.model_validate(_claim_doc())
    purchase = Purchase.model_validate(make_purchase(user_id=_USER_ID))

    db = AsyncMock(spec=MongoDBClient)
    # 1st find_one: auth middleware (User). 2nd find_one: claims_service._load_owned_claim.
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.get_purchase = AsyncMock(return_value=purchase)
    db.get_policy = AsyncMock(return_value=None)  # policy may legitimately be missing

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_CLAIM_ID}", headers={"Authorization": "Bearer t"}
            )
        assert response.status_code == 200
        payload = response.json()
        assert set(payload.keys()) == {"claim", "purchase", "policy", "evidence_url"}
        assert payload["claim"]["_id"] == _CLAIM_ID
        assert payload["purchase"]["_id"] == str(purchase.id)
        assert payload["policy"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_claim_detail_not_found(client: AsyncClient) -> None:
    db = AsyncMock(spec=MongoDBClient)
    # auth: User. service load: None → 404.
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), None])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_OTHER_CLAIM_ID}", headers={"Authorization": "Bearer t"}
            )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "claim_not_found"
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /claims/{id}/approve
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_approve_claim_success_publishes_event(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.upsert_claim = AsyncMock(return_value=_CLAIM_ID)

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(return_value="msg-id-123")

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={"send_override": "auto"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["claim_id"] == _CLAIM_ID
        assert payload["submitted_at"] is not None

        # Verify the publish call: right topic, right event shape.
        publisher.publish.assert_awaited_once()
        topic, event = publisher.publish.await_args.args
        assert topic == "claim.approved"
        assert event["claim_id"] == _CLAIM_ID
        assert event["user_id"] == _USER_ID
        assert event["send_override"] == "auto"
        assert "event_id" in event
        assert "approved_at" in event

        db.upsert_claim.assert_awaited_once()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_claim_with_edited_draft_appends_version(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.upsert_claim = AsyncMock(return_value=_CLAIM_ID)

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(return_value="msg-id")

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={"edited_draft_content": "My edited draft."},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        # Inspect the persisted Claim — should have a v2 draft version.
        persisted = db.upsert_claim.await_args.args[0]
        assert persisted.draft_content == "My edited draft."
        assert len(persisted.draft_versions) == 2
        assert persisted.draft_versions[-1].content == "My edited draft."
        assert persisted.draft_versions[-1].generated_by.value == "user_edit"
        # Pydantic invariant: draft_content == draft_versions[-1].content
        assert persisted.draft_content == persisted.draft_versions[-1].content
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_claim_rejects_non_draft_pending_state(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="pending"))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    publisher = AsyncMock(spec=PubSubPublisher)

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "claim_not_approvable"
        publisher.publish.assert_not_called()
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /claims/{id}/cancel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_claim_success_when_draft_pending(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/cancel",
                json={"reason": "Changed my mind"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        assert response.json() == {"success": True}
        db.partial_update.assert_awaited_once()
        updates = db.partial_update.await_args.args[2]
        assert updates["outcome"] == "user_cancelled"
        assert updates["outcome_note"] == "Changed my mind"
        assert updates["resolved_at"] is not None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_cancel_claim_rejected_after_resolved(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="approved", resolved_at="2026-05-10T12:00:00Z"))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/cancel",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "claim_not_cancellable"
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# PUT /claims/{id}/edit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_edit_draft_appends_version(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    assert len(claim.draft_versions) == 1  # baseline

    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.upsert_claim = AsyncMock(return_value=_CLAIM_ID)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                f"/api/v1/claims/{_CLAIM_ID}/edit",
                json={"draft_content": "Edited body v2"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        persisted = db.upsert_claim.await_args.args[0]
        assert len(persisted.draft_versions) == 2
        assert persisted.draft_versions[-1].version == 2
        assert persisted.draft_versions[-1].content == "Edited body v2"
        assert persisted.draft_versions[-1].generated_by.value == "user_edit"
        assert persisted.draft_content == "Edited body v2"  # invariant
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_edit_draft_rejected_when_not_draft_pending(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="approved"))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                f"/api/v1/claims/{_CLAIM_ID}/edit",
                json={"draft_content": "Should not save"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "claim_not_editable"
    finally:
        _clear_overrides()
