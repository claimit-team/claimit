"""Tests for the /pubsub/purchase.ingested resolution handler."""

from __future__ import annotations

import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient


def _event(**overrides) -> dict:
    event = {
        "schema_version": 1,
        "event_id": str(uuid4()),
        "emitted_at": "2026-05-31T00:00:00Z",
        "event_type": "purchase.ingested",
        "user_id": str(uuid4()),
        "purchase_id": str(uuid4()),
        "platform": "best_buy",
        "category": "retail",
        "status": "monitoring",
        "ingestion_source": "gmail",
        "overall_confidence": 1.0,
    }
    event.update(overrides)
    return event


def _envelope(event: dict) -> dict:
    data = base64.b64encode(json.dumps(event).encode()).decode()
    return {"message": {"data": data, "messageId": "m1"}, "subscription": "sub"}


def _post(event: dict, db: MagicMock, resolve_mock: AsyncMock):
    with (
        patch("src.main.init_phoenix", MagicMock()),
        patch("src.main.MongoDBClient", return_value=db),
        patch("src.main._resolve_and_persist", resolve_mock),
    ):
        from src.main import app

        with TestClient(app) as client:
            return client.post("/pubsub/purchase.ingested", json=_envelope(event))


def _db_with_purchase(purchase) -> MagicMock:
    db = MagicMock()
    db.get_purchase = AsyncMock(return_value=purchase)
    db.close = AsyncMock()
    return db


def test_resolves_and_acks() -> None:
    purchase = SimpleNamespace(status="monitoring", product_name="Sony WH-1000XM5")
    resolve_mock = AsyncMock()
    resp = _post(_event(), _db_with_purchase(purchase), resolve_mock)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    resolve_mock.assert_awaited_once()


def test_skips_unresolvable_platform() -> None:
    resolve_mock = AsyncMock()
    resp = _post(_event(platform="amazon"), _db_with_purchase(None), resolve_mock)
    assert resp.status_code == 200
    assert resp.json()["reason"] == "not_resolvable"
    resolve_mock.assert_not_awaited()


def test_skips_when_not_monitoring() -> None:
    purchase = SimpleNamespace(status="dismissed", product_name="Sony")
    resolve_mock = AsyncMock()
    resp = _post(_event(), _db_with_purchase(purchase), resolve_mock)
    assert resp.status_code == 200
    assert resp.json()["reason"] == "not_resolvable"
    resolve_mock.assert_not_awaited()


def test_acks_200_even_when_resolver_raises() -> None:
    purchase = SimpleNamespace(status="monitoring", product_name="Sony")
    resolve_mock = AsyncMock(side_effect=RuntimeError("boom"))
    resp = _post(_event(), _db_with_purchase(purchase), resolve_mock)
    assert resp.status_code == 200
    assert resp.json()["reason"] == "handler_exception"
