"""Tests for the change-stream sync loop.

Focused on the `ChangeStreamHistoryLost` recovery path added for issue #309:
when the persisted resume token has rolled off the Atlas oplog, the worker
must discard the token, backfill to close the gap, and reopen the stream
from "now" — instead of crash-looping forever on the same dead token.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pymongo.errors import OperationFailure
from src import sync

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _non_resumable(
    code: int = 286, label: str | None = "NonResumableChangeStreamError"
) -> OperationFailure:
    """Build an OperationFailure that mimics MongoDB's ChangeStreamHistoryLost.

    Pass `code != 286` + a label to assert the label path; pass `label=None`
    to assert the code path.
    """
    details: dict[str, Any] = {"code": code, "codeName": "ChangeStreamHistoryLost"}
    if label is not None:
        details["errorLabels"] = [label]
    return OperationFailure("resume not possible", code=code, details=details)


class _ExitLoop(BaseException):
    """Sentinel used to break out of `watch_collection`'s `while True`.

    Inherits from BaseException so the `except OperationFailure` / `except
    Exception` clauses in `watch_collection` don't swallow it.
    """


class _FailingStream:
    """Async context manager whose `__aenter__` raises a given exception."""

    def __init__(self, exc: BaseException) -> None:
        self._exc = exc

    async def __aenter__(self) -> Any:
        raise self._exc

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False


class _FakeCollection:
    """Records every `.watch()` kwargs and returns the next queued stream."""

    def __init__(self, streams: list[_FailingStream]) -> None:
        self._streams = list(streams)
        self.watch_calls: list[dict[str, Any]] = []

    def watch(self, **kwargs: Any) -> _FailingStream:
        self.watch_calls.append(kwargs)
        return self._streams.pop(0)


class _FakeSyncState:
    """Minimal in-memory stand-in for the `sync_state` collection."""

    def __init__(self, initial_token: dict[str, Any] | None = None) -> None:
        self.docs: dict[str, dict[str, Any]] = {}
        if initial_token is not None:
            self.docs["my_coll"] = {"_id": "my_coll", "resume_token": initial_token}
        self.deleted: list[str] = []

    async def find_one(self, query: dict[str, Any]) -> dict[str, Any] | None:
        return self.docs.get(query["_id"])

    async def delete_one(self, query: dict[str, Any]) -> None:
        self.deleted.append(query["_id"])
        self.docs.pop(query["_id"], None)

    async def replace_one(
        self, query: dict[str, Any], doc: dict[str, Any], upsert: bool = False
    ) -> None:
        self.docs[query["_id"]] = doc


class _FakeDB:
    def __init__(self, coll: _FakeCollection, sync_state: _FakeSyncState) -> None:
        self._coll = coll
        self._sync = sync_state

    def __getitem__(self, name: str) -> Any:
        if name == sync._SYNC_STATE_COLLECTION:
            return self._sync
        return self._coll


# ---------------------------------------------------------------------------
# _is_non_resumable
# ---------------------------------------------------------------------------


def test_is_non_resumable_matches_code_286() -> None:
    assert sync._is_non_resumable(_non_resumable(code=286, label=None)) is True


def test_is_non_resumable_matches_label_without_code_286() -> None:
    # Some future server build could ship the label with a different code;
    # the label is the documented contract, so it must trigger recovery.
    assert sync._is_non_resumable(_non_resumable(code=999)) is True


def test_is_non_resumable_rejects_unrelated_operation_failure() -> None:
    # e.g. DuplicateKey (11000) — must NOT clear the resume token.
    other = OperationFailure("dup key", code=11000, details={"code": 11000})
    assert sync._is_non_resumable(other) is False


# ---------------------------------------------------------------------------
# _clear_resume_token
# ---------------------------------------------------------------------------


async def test_clear_resume_token_deletes_by_collection_name() -> None:
    state = _FakeSyncState(initial_token={"_data": "x"})
    db = _FakeDB(_FakeCollection([]), state)
    await sync._clear_resume_token(db, "my_coll")
    assert state.deleted == ["my_coll"]
    assert "my_coll" not in state.docs


# ---------------------------------------------------------------------------
# watch_collection recovery path
# ---------------------------------------------------------------------------


async def _run_recovery(
    *,
    first_failure: OperationFailure,
    backfill_result: dict[str, int] | Exception | None = None,
) -> tuple[_FakeCollection, _FakeSyncState, AsyncMock]:
    """Drive `watch_collection` through one recovery cycle and exit.

    Wires a fake DB where the first `watch()` raises `first_failure` and the
    second raises `_ExitLoop` to escape the otherwise-infinite while loop.
    Returns the fake collection, sync_state, and the backfill mock for the
    caller to assert on. `backfill_result` defaults to a successful 5/0 count;
    pass an `Exception` to assert the backfill-failure recovery branch.
    """
    if backfill_result is None:
        backfill_result = {"ok": 5, "errors": 0}
    stale = {"_data": "stale"}
    state = _FakeSyncState(initial_token=stale)
    coll = _FakeCollection([_FailingStream(first_failure), _FailingStream(_ExitLoop())])
    db = _FakeDB(coll, state)
    es = AsyncMock()
    project_fn = MagicMock()

    if isinstance(backfill_result, Exception):
        backfill_mock = AsyncMock(side_effect=backfill_result)
    else:
        backfill_mock = AsyncMock(return_value=backfill_result)

    with (
        patch.object(sync, "backfill_collection", new=backfill_mock),
        patch("asyncio.sleep", new=AsyncMock()),
        pytest.raises(_ExitLoop),
    ):
        await sync.watch_collection(db, es, "my_coll", "my_index", project_fn)

    return coll, state, backfill_mock


async def test_non_resumable_clears_token_runs_backfill_and_restarts_clean() -> None:
    coll, state, backfill_mock = await _run_recovery(first_failure=_non_resumable())

    # Token cleared from sync_state.
    assert state.deleted == ["my_coll"]
    # Backfill was invoked once with the right collection/index/projection.
    backfill_mock.assert_awaited_once()
    args, _ = backfill_mock.call_args
    assert args[2] == "my_coll" and args[3] == "my_index"
    # First watch() carried the stale token; second watch() did NOT —
    # i.e. the loop reopened the stream from "now".
    assert coll.watch_calls[0].get("resume_after") == {"_data": "stale"}
    assert "resume_after" not in coll.watch_calls[1]


async def test_non_resumable_via_label_only_triggers_recovery() -> None:
    # Server build that ships the label with a non-286 code must still
    # take the recovery branch (the label is the contract).
    coll, state, backfill_mock = await _run_recovery(first_failure=_non_resumable(code=999))
    assert state.deleted == ["my_coll"]
    backfill_mock.assert_awaited_once()
    assert "resume_after" not in coll.watch_calls[1]


async def test_non_resumable_with_failing_backfill_still_clears_token() -> None:
    # Backfill blowing up must not block recovery: the token is already
    # gone, so the next iteration reopens the stream cleanly — operator
    # is responsible for re-running backfill to close the gap.
    coll, state, backfill_mock = await _run_recovery(
        first_failure=_non_resumable(),
        backfill_result=RuntimeError("ES unavailable"),
    )
    assert state.deleted == ["my_coll"]
    backfill_mock.assert_awaited_once()
    assert "resume_after" not in coll.watch_calls[1]


async def test_unrelated_operation_failure_preserves_token() -> None:
    # Generic OperationFailure (e.g. transient network) must NOT clear the
    # token — otherwise a blip would silently lose history.
    stale = {"_data": "stale"}
    state = _FakeSyncState(initial_token=stale)
    coll = _FakeCollection(
        [
            _FailingStream(OperationFailure("transient", code=11000, details={"code": 11000})),
            _FailingStream(_ExitLoop()),
        ]
    )
    db = _FakeDB(coll, state)
    es = AsyncMock()

    backfill_mock = AsyncMock()
    with (
        patch.object(sync, "backfill_collection", new=backfill_mock),
        patch("asyncio.sleep", new=AsyncMock()),
        pytest.raises(_ExitLoop),
    ):
        await sync.watch_collection(db, es, "my_coll", "my_index", MagicMock())

    # Token preserved; backfill not invoked; second watch() retried WITH the token.
    assert state.deleted == []
    backfill_mock.assert_not_awaited()
    assert coll.watch_calls[1].get("resume_after") == stale
