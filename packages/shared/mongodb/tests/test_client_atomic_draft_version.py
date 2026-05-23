"""Tests for MongoDBClient.atomic_append_draft_version()."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from claimit_mongodb_models import DraftGeneratedBy, MongoDBClient


def _client_with_find_one_and_update(return_doc: dict) -> tuple[MongoDBClient, MagicMock]:
    client = MongoDBClient.__new__(MongoDBClient)
    collection_mock = MagicMock()
    collection_mock.find_one_and_update = AsyncMock(return_value=return_doc)
    db_mock = MagicMock()
    db_mock.__getitem__ = MagicMock(return_value=collection_mock)
    client._db = db_mock  # type: ignore[attr-defined]
    return client, collection_mock


@pytest.mark.asyncio
async def test_atomic_append_draft_version_uses_pipeline_update() -> None:
    claim_id = uuid4()
    returned_doc = {
        "_id": claim_id,
        "draft_versions": [
            {"version": 1, "content": "v1", "generated_by": "agent", "at": datetime.now(UTC)},
            {
                "version": 2,
                "content": "new body",
                "generated_by": "assistant_redraft",
                "at": datetime(2026, 5, 20, tzinfo=UTC),
            },
        ],
    }
    client, collection_mock = _client_with_find_one_and_update(returned_doc)

    version = await client.atomic_append_draft_version(
        "claims",
        claim_id,
        content="new body",
        generated_by=DraftGeneratedBy.ASSISTANT_REDRAFT,
        at=datetime(2026, 5, 20, tzinfo=UTC),
        extra_updates={"self_eval_score": None},
    )

    assert version == 2
    collection_mock.find_one_and_update.assert_awaited_once()
    pipeline = collection_mock.find_one_and_update.await_args.args[1]
    assert isinstance(pipeline, list)
    assert (
        pipeline[0]["$set"]["_next_version"]["$add"][0]["$size"]["$ifNull"][0] == "$draft_versions"
    )


@pytest.mark.asyncio
async def test_try_insert_idempotency_record_returns_false_on_duplicate() -> None:
    from pymongo.errors import DuplicateKeyError

    client = MongoDBClient.__new__(MongoDBClient)
    collection_mock = MagicMock()
    collection_mock.insert_one = AsyncMock(side_effect=DuplicateKeyError("dup"))
    db_mock = MagicMock()
    db_mock.__getitem__ = MagicMock(return_value=collection_mock)
    client._db = db_mock  # type: ignore[attr-defined]

    inserted = await client.try_insert_idempotency_record(
        "redraft_processed_events",
        "evt-dup-001",
        {"claim_id": "claim-1", "status": "processing"},
    )

    assert inserted is False
