"""Tests for MongoDBClient.aggregate()."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from claimit_mongodb_models import MongoDBClient


class _AsyncCursor:
    """Mimics an async motor cursor that yields a fixed list of docs."""

    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self._docs = list(docs)

    def __aiter__(self) -> _AsyncCursor:
        return self

    async def __anext__(self) -> dict[str, Any]:
        if not self._docs:
            raise StopAsyncIteration
        return self._docs.pop(0)


@pytest.mark.asyncio
async def test_aggregate_returns_cursor_docs() -> None:
    """aggregate() iterates the motor cursor and returns the doc list."""
    client = MongoDBClient.__new__(MongoDBClient)  # bypass __init__
    expected = [{"_id": "a", "total": 100}, {"_id": "b", "total": 50}]

    collection_mock = MagicMock()
    collection_mock.aggregate = MagicMock(return_value=_AsyncCursor(expected.copy()))
    db_mock = MagicMock()
    db_mock.__getitem__ = MagicMock(return_value=collection_mock)
    client._db = db_mock  # type: ignore[attr-defined]

    result = await client.aggregate("claims", [{"$match": {}}])

    assert result == expected
    db_mock.__getitem__.assert_called_once_with("claims")
    collection_mock.aggregate.assert_called_once_with([{"$match": {}}])


@pytest.mark.asyncio
async def test_aggregate_empty_pipeline_returns_empty_list() -> None:
    """Empty cursor yields an empty result list."""
    client = MongoDBClient.__new__(MongoDBClient)

    collection_mock = MagicMock()
    collection_mock.aggregate = MagicMock(return_value=_AsyncCursor([]))
    db_mock = MagicMock()
    db_mock.__getitem__ = MagicMock(return_value=collection_mock)
    client._db = db_mock  # type: ignore[attr-defined]

    result = await client.aggregate("claims", [])

    assert result == []
