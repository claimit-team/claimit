"""Tests for PATCH/DELETE /api/v1/conversations/{id}."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from claimit_mongodb_models import MongoDBClient, User
from claimit_mongodb_models.conversation import Conversation
from claimit_mongodb_models.enums import ConversationMode, ConversationStatus
from httpx import AsyncClient
from src.deps import get_db
from src.main import app

from ._fixtures import USER_FIXTURE

_FIREBASE_CLAIMS = {"uid": "test-uid", "email": "test@example.com"}
USER_ID = UUID("00000000-0000-0000-0000-000000000001")
OTHER_USER_ID = UUID("00000000-0000-0000-0000-000000000002")
CONV_ID = UUID("10000000-0000-0000-0000-000000000001")


def _make_conversation(
    *,
    user_id: UUID = USER_ID,
    title: str = "Test Conversation",
    status: ConversationStatus = ConversationStatus.ACTIVE,
    archived_at: datetime | None = None,
) -> Conversation:
    now = datetime.now(UTC)
    return Conversation(
        id=CONV_ID,
        user_id=user_id,
        mode=ConversationMode.GENERAL,
        claim_id=None,
        title=title,
        messages=[],
        trace_ids=[],
        status=status,
        created_at=now,
        last_message_at=now,
        archived_at=archived_at,
        agent_session_id=None,
    )


def _mock_db(
    *,
    conversation: Conversation | None,
    partial_update_result: bool = True,
    delete_result: bool = True,
) -> AsyncMock:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(return_value=User.model_validate(USER_FIXTURE))
    db.get_conversation = AsyncMock(return_value=conversation)
    db.partial_update = AsyncMock(return_value=partial_update_result)
    db.delete = AsyncMock(return_value=delete_result)
    return db


@pytest.mark.asyncio
async def test_patch_conversation_title_returns_200(client: AsyncClient) -> None:
    conv = _make_conversation()
    updated = conv.model_copy(update={"title": "Renamed title"})
    db = _mock_db(conversation=conv)
    db.get_conversation = AsyncMock(side_effect=[conv, updated])

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                f"/api/v1/conversations/{CONV_ID}",
                headers={"Authorization": "Bearer valid-token"},
                json={"title": "  Renamed title  "},
            )
        assert response.status_code == 200
        payload = response.json()["conversation"]
        assert payload["title"] == "Renamed title"
        db.partial_update.assert_awaited_once()
        updates = db.partial_update.call_args.args[2]
        assert updates["title"] == "Renamed title"
        assert len(updates["title"]) <= 200
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_conversation_status_archived_sets_archived_at(client: AsyncClient) -> None:
    conv = _make_conversation()
    archived = conv.model_copy(
        update={"status": ConversationStatus.ARCHIVED, "archived_at": datetime.now(UTC)}
    )
    db = _mock_db(conversation=conv)
    db.get_conversation = AsyncMock(side_effect=[conv, archived])

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                f"/api/v1/conversations/{CONV_ID}",
                headers={"Authorization": "Bearer valid-token"},
                json={"status": "archived"},
            )
        assert response.status_code == 200
        assert response.json()["conversation"]["status"] == "archived"
        assert response.json()["conversation"]["archived_at"] is not None
        updates = db.partial_update.call_args.args[2]
        assert updates["status"] == "archived"
        assert updates["archived_at"] is not None
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_conversation_status_active_clears_archived_at(client: AsyncClient) -> None:
    conv = _make_conversation(
        status=ConversationStatus.ARCHIVED,
        archived_at=datetime.now(UTC),
    )
    restored = conv.model_copy(update={"status": ConversationStatus.ACTIVE, "archived_at": None})
    db = _mock_db(conversation=conv)
    db.get_conversation = AsyncMock(side_effect=[conv, restored])

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                f"/api/v1/conversations/{CONV_ID}",
                headers={"Authorization": "Bearer valid-token"},
                json={"status": "active"},
            )
        assert response.status_code == 200
        assert response.json()["conversation"]["archived_at"] is None
        updates = db.partial_update.call_args.args[2]
        assert updates["status"] == "active"
        assert updates["archived_at"] is None
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_conversation_empty_title_returns_422(client: AsyncClient) -> None:
    conv = _make_conversation()
    db = _mock_db(conversation=conv)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                f"/api/v1/conversations/{CONV_ID}",
                headers={"Authorization": "Bearer valid-token"},
                json={"title": "   "},
            )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_title"
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_conversation_wrong_user_returns_404(client: AsyncClient) -> None:
    conv = _make_conversation(user_id=OTHER_USER_ID)
    db = _mock_db(conversation=conv)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                f"/api/v1/conversations/{CONV_ID}",
                headers={"Authorization": "Bearer valid-token"},
                json={"title": "Nope"},
            )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "conversation_not_found"
        db.partial_update.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_patch_conversation_missing_returns_404(client: AsyncClient) -> None:
    db = _mock_db(conversation=None)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.patch(
                f"/api/v1/conversations/{CONV_ID}",
                headers={"Authorization": "Bearer valid-token"},
                json={"title": "Ghost"},
            )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "conversation_not_found"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_delete_conversation_returns_204(client: AsyncClient) -> None:
    conv = _make_conversation()
    db = _mock_db(conversation=conv)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.delete(
                f"/api/v1/conversations/{CONV_ID}",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 204
        db.delete.assert_awaited_once_with("conversations", CONV_ID)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_delete_conversation_wrong_user_returns_404(client: AsyncClient) -> None:
    conv = _make_conversation(user_id=OTHER_USER_ID)
    db = _mock_db(conversation=conv)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.delete(
                f"/api/v1/conversations/{CONV_ID}",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "conversation_not_found"
        db.delete.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_delete_conversation_missing_returns_404(client: AsyncClient) -> None:
    db = _mock_db(conversation=None)

    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.delete(
                f"/api/v1/conversations/{CONV_ID}",
                headers={"Authorization": "Bearer valid-token"},
            )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "conversation_not_found"
        db.delete.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)
