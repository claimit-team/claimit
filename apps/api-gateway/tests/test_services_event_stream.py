"""Service-level tests for event_stream_generator.

The generator is an infinite loop. Tests use a few patterns to keep
control:
- Patch asyncio.sleep with an AsyncMock(side_effect=asyncio.CancelledError)
  to break out of the loop after a configurable number of yields.
- Patch db.aggregate to return canned doc lists.
- Drive the generator manually with __anext__() so each tick is observable.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from claimit_mongodb_models import MongoDBClient
from src.services import event_stream as event_stream_module
from src.services.event_stream import (
    MAX_DOCS_PER_TICK,
    POLL_INTERVAL_SECONDS,
    event_stream_generator,
    format_event_id,
    parse_event_id,
)

from ._fixtures import make_notification_event

USER_ID = UUID("00000000-0000-0000-0000-000000000001")


def _mock_db(aggregate_returns: list[list[dict[str, Any]]]) -> AsyncMock:
    """Build a MongoDBClient mock whose `aggregate` returns each list in
    sequence. Once the list is exhausted, subsequent calls return [].
    """
    mock = AsyncMock(spec=MongoDBClient)
    iterator = iter(aggregate_returns)

    async def fake_aggregate(
        _collection: str, _pipeline: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        try:
            return next(iterator)
        except StopIteration:
            return []

    mock.aggregate = AsyncMock(side_effect=fake_aggregate)
    return mock


@pytest.mark.asyncio
async def test_constants_match_design() -> None:
    """Lock the polling cadence + safety cap so a future change is intentional."""
    assert POLL_INTERVAL_SECONDS == 1.0
    assert MAX_DOCS_PER_TICK == 50


@pytest.mark.asyncio
async def test_generator_yields_notification_event_for_each_doc() -> None:
    doc1 = make_notification_event(
        notification_id="40000000-0000-0000-0000-000000000001",
        created_at="2026-05-18T10:00:01+00:00",
    )
    doc2 = make_notification_event(
        notification_id="40000000-0000-0000-0000-000000000002",
        created_at="2026-05-18T10:00:02+00:00",
    )
    db = _mock_db([[doc1, doc2]])

    with patch.object(event_stream_module.asyncio, "sleep", new=AsyncMock()):
        gen = event_stream_generator(db, USER_ID)
        first = await gen.__anext__()
        second = await gen.__anext__()

    assert first["event"] == "notification"
    assert second["event"] == "notification"
    payload1 = json.loads(first["data"])
    payload2 = json.loads(second["data"])
    assert payload1["_id"] == "40000000-0000-0000-0000-000000000001"
    assert payload2["_id"] == "40000000-0000-0000-0000-000000000002"


@pytest.mark.asyncio
async def test_generator_emits_no_frames_when_no_new_docs() -> None:
    """Empty poll returns an empty list — generator should sleep, not yield."""
    db = _mock_db([[]])

    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    with patch.object(event_stream_module.asyncio, "sleep", new=sleep_mock):
        gen = event_stream_generator(db, USER_ID)
        with pytest.raises(asyncio.CancelledError):
            await gen.__anext__()

    sleep_mock.assert_awaited_once_with(POLL_INTERVAL_SECONDS)


class _FrozenDatetime:
    """Mocks datetime.now(UTC).isoformat() with a fixed value.

    Set _FrozenDatetime.value before patching to control the seed.
    """

    value: str = "2026-05-18T00:00:00+00:00"

    @classmethod
    def now(cls, tz: object) -> _FrozenInstant:
        del tz
        return _FrozenInstant(cls.value)


class _FrozenInstant:
    def __init__(self, value: str) -> None:
        self._value = value

    def isoformat(self) -> str:
        return self._value


@pytest.mark.asyncio
async def test_generator_advances_last_seen_after_emit() -> None:
    """After yielding a doc, second poll uses the compound (created_at, _id)
    $or predicate so docs sharing the boundary timestamp are not dropped."""
    doc_id = "40000000-0000-0000-0000-000000000001"
    doc = make_notification_event(
        notification_id=doc_id,
        created_at="2026-05-18T10:00:01+00:00",
    )
    db = _mock_db([[doc], []])

    sleep_calls = 0

    async def fake_sleep(_seconds: float) -> None:
        nonlocal sleep_calls
        sleep_calls += 1
        if sleep_calls >= 2:
            raise asyncio.CancelledError

    _FrozenDatetime.value = "2026-05-18T00:00:00+00:00"  # seed < doc.created_at
    with (
        patch.object(event_stream_module.asyncio, "sleep", new=fake_sleep),
        patch.object(event_stream_module, "datetime", _FrozenDatetime),
    ):
        gen = event_stream_generator(db, USER_ID)
        await gen.__anext__()  # yields the notification frame
        with pytest.raises(asyncio.CancelledError):
            await gen.__anext__()  # second poll empty -> sleep raises

    second_call_pipeline = db.aggregate.await_args_list[1].args[1]
    match_stage = second_call_pipeline[0]["$match"]
    assert match_stage["$or"] == [
        {"created_at": {"$gt": "2026-05-18T10:00:01+00:00"}},
        {
            "created_at": "2026-05-18T10:00:01+00:00",
            "_id": {"$gt": UUID(doc_id)},
        },
    ]
    # bare $gt: must not exist at the top level once the compound predicate
    # is in play — otherwise both filters would be ANDed together.
    assert "created_at" not in match_stage


@pytest.mark.asyncio
async def test_generator_does_not_advance_watermark_on_empty_tick() -> None:
    """Two empty polls in a row: $gt filter on the second poll matches the first."""
    db = _mock_db([[], []])

    sleep_calls = 0

    async def fake_sleep(_seconds: float) -> None:
        nonlocal sleep_calls
        sleep_calls += 1
        if sleep_calls >= 2:
            raise asyncio.CancelledError

    with patch.object(event_stream_module.asyncio, "sleep", new=fake_sleep):
        gen = event_stream_generator(db, USER_ID)
        with pytest.raises(asyncio.CancelledError):
            await gen.__anext__()

    first_filter = db.aggregate.await_args_list[0].args[1][0]["$match"]["created_at"]
    second_filter = db.aggregate.await_args_list[1].args[1][0]["$match"]["created_at"]
    assert first_filter == second_filter


@pytest.mark.asyncio
async def test_generator_initial_last_seen_is_now() -> None:
    """First poll seeds last_seen with now() so backlog isn't replayed."""
    db = _mock_db([[]])

    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    fixed_now = "2026-05-18T11:00:00+00:00"
    _FrozenDatetime.value = fixed_now

    with (
        patch.object(event_stream_module.asyncio, "sleep", new=sleep_mock),
        patch.object(event_stream_module, "datetime", _FrozenDatetime),
    ):
        gen = event_stream_generator(db, USER_ID)
        with pytest.raises(asyncio.CancelledError):
            await gen.__anext__()

    pipeline = db.aggregate.await_args_list[0].args[1]
    assert pipeline[0]["$match"]["created_at"] == {"$gt": fixed_now}


@pytest.mark.asyncio
async def test_generator_pipeline_filters_by_user_and_caps_limit() -> None:
    """Pipeline shape: $match user + $gt last_seen, $sort ASC, $limit 50."""
    db = _mock_db([[]])

    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    with patch.object(event_stream_module.asyncio, "sleep", new=sleep_mock):
        gen = event_stream_generator(db, USER_ID)
        with pytest.raises(asyncio.CancelledError):
            await gen.__anext__()

    pipeline = db.aggregate.await_args_list[0].args[1]
    assert pipeline[0]["$match"]["user_id"] == USER_ID
    assert pipeline[1]["$sort"] == {"created_at": 1, "_id": 1}
    assert pipeline[2]["$limit"] == MAX_DOCS_PER_TICK


@pytest.mark.asyncio
async def test_generator_emits_error_event_on_db_failure() -> None:
    """A poll exception emits an `error` SSE frame, generator continues."""
    db = AsyncMock(spec=MongoDBClient)
    db.aggregate = AsyncMock(side_effect=RuntimeError("connection refused"))

    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    with patch.object(event_stream_module.asyncio, "sleep", new=sleep_mock):
        gen = event_stream_generator(db, USER_ID)
        first = await gen.__anext__()

    assert first["event"] == "error"
    payload = json.loads(first["data"])
    assert payload == {"message": "Stream temporarily unavailable"}


@pytest.mark.asyncio
async def test_generator_uses_notification_events_collection() -> None:
    db = _mock_db([[]])

    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    with patch.object(event_stream_module.asyncio, "sleep", new=sleep_mock):
        gen = event_stream_generator(db, USER_ID)
        with pytest.raises(asyncio.CancelledError):
            await gen.__anext__()

    collection = db.aggregate.await_args_list[0].args[0]
    assert collection == "notification_events"


@pytest.mark.asyncio
async def test_generator_compound_watermark_breaks_ties_on_created_at() -> None:
    """Two docs with IDENTICAL created_at, sorted by _id ASC. Second tick's
    $match must use the compound predicate with the second doc's _id so
    docs sharing the boundary timestamp aren't silently dropped."""
    same_ts = "2026-05-18T10:00:01+00:00"
    id_a = "40000000-0000-0000-0000-0000000000aa"
    id_b = "40000000-0000-0000-0000-0000000000bb"
    doc_a = make_notification_event(notification_id=id_a, created_at=same_ts)
    doc_b = make_notification_event(notification_id=id_b, created_at=same_ts)
    db = _mock_db([[doc_a, doc_b], []])

    sleep_calls = 0

    async def fake_sleep(_seconds: float) -> None:
        nonlocal sleep_calls
        sleep_calls += 1
        if sleep_calls >= 2:
            raise asyncio.CancelledError

    _FrozenDatetime.value = "2026-05-18T00:00:00+00:00"  # seed < same_ts
    with (
        patch.object(event_stream_module.asyncio, "sleep", new=fake_sleep),
        patch.object(event_stream_module, "datetime", _FrozenDatetime),
    ):
        gen = event_stream_generator(db, USER_ID)
        first = await gen.__anext__()
        second = await gen.__anext__()
        with pytest.raises(asyncio.CancelledError):
            await gen.__anext__()

    payload_a = json.loads(first["data"])
    payload_b = json.loads(second["data"])
    assert payload_a["_id"] == id_a
    assert payload_b["_id"] == id_b

    second_pipeline = db.aggregate.await_args_list[1].args[1]
    match_stage = second_pipeline[0]["$match"]
    assert match_stage["$or"] == [
        {"created_at": {"$gt": same_ts}},
        {"created_at": same_ts, "_id": {"$gt": UUID(id_b)}},
    ]


@pytest.mark.asyncio
async def test_generator_skips_bad_doc_in_else_path() -> None:
    """A doc that fails Pydantic validation in the per-doc try-except is
    logged + skipped; the generator does not crash and watermark advances
    past the poison doc so it is not re-fetched forever."""
    good_id = "40000000-0000-0000-0000-0000000000aa"
    bad_id = "40000000-0000-0000-0000-0000000000bb"
    good_doc = make_notification_event(
        notification_id=good_id,
        created_at="2026-05-18T10:00:00+00:00",
    )
    bad_doc = make_notification_event(
        notification_id=bad_id,
        created_at="2026-05-18T10:00:01+00:00",
        event_type="not_a_real_event_type",
    )
    db = _mock_db([[good_doc, bad_doc], []])

    sleep_calls = 0

    async def fake_sleep(_seconds: float) -> None:
        nonlocal sleep_calls
        sleep_calls += 1
        if sleep_calls >= 2:
            raise asyncio.CancelledError

    _FrozenDatetime.value = "2026-05-18T00:00:00+00:00"
    with (
        patch.object(event_stream_module.asyncio, "sleep", new=fake_sleep),
        patch.object(event_stream_module, "datetime", _FrozenDatetime),
        patch.object(event_stream_module.logger, "exception") as log_exception,
    ):
        gen = event_stream_generator(db, USER_ID)
        emitted = await gen.__anext__()  # only the good doc yields
        with pytest.raises(asyncio.CancelledError):
            await gen.__anext__()  # second poll empty -> sleep raises

    payload = json.loads(emitted["data"])
    assert payload["_id"] == good_id
    log_exception.assert_called_once()

    second_pipeline = db.aggregate.await_args_list[1].args[1]
    match_stage = second_pipeline[0]["$match"]
    # Watermark advanced past the BAD doc (later created_at + its _id),
    # not just the good one. Otherwise the bad doc would be re-fetched
    # on every subsequent poll and re-fail validation forever.
    assert match_stage["$or"] == [
        {"created_at": {"$gt": "2026-05-18T10:00:01+00:00"}},
        {
            "created_at": "2026-05-18T10:00:01+00:00",
            "_id": {"$gt": UUID(bad_id)},
        },
    ]


# ---------------------------------------------------------------------------
# Composite event-id helpers (BUG-123 S2)
# ---------------------------------------------------------------------------


def test_format_and_parse_event_id_round_trip() -> None:
    created_at = "2026-05-18T10:00:01+00:00"
    event_id = UUID("40000000-0000-0000-0000-000000000001")
    raw = format_event_id(created_at, event_id)
    assert raw == f"{created_at}|{event_id}"
    assert parse_event_id(raw) == (created_at, event_id)


def test_parse_event_id_rejects_unusable_values() -> None:
    assert parse_event_id("no-separator-here") is None  # no pipe
    assert parse_event_id("2026-05-18T10:00:01+00:00|not-a-uuid") is None  # bad id
    assert parse_event_id("|40000000-0000-0000-0000-000000000001") is None  # empty created_at


# ---------------------------------------------------------------------------
# Resume from Last-Event-ID (BUG-123 S2)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generator_resumes_from_last_event_id_on_first_poll() -> None:
    """A reconnect passes the last delivered event id back. The FIRST poll
    must seed the compound (created_at, _id) watermark from it — NOT now() —
    so events written during the disconnect gap are delivered, not skipped."""
    db = _mock_db([[]])
    resume_ts = "2026-05-18T10:00:05+00:00"
    resume_id = "40000000-0000-0000-0000-0000000000cc"
    last_event_id = format_event_id(resume_ts, UUID(resume_id))

    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    # Freeze now() far in the future so a now()-seed would be obviously wrong.
    _FrozenDatetime.value = "2099-01-01T00:00:00+00:00"
    with (
        patch.object(event_stream_module.asyncio, "sleep", new=sleep_mock),
        patch.object(event_stream_module, "datetime", _FrozenDatetime),
    ):
        gen = event_stream_generator(db, USER_ID, last_event_id=last_event_id)
        with pytest.raises(asyncio.CancelledError):
            await gen.__anext__()

    match_stage = db.aggregate.await_args_list[0].args[1][0]["$match"]
    assert match_stage["$or"] == [
        {"created_at": {"$gt": resume_ts}},
        {"created_at": resume_ts, "_id": {"$gt": UUID(resume_id)}},
    ]
    assert "created_at" not in match_stage  # compound predicate only


@pytest.mark.asyncio
async def test_generator_malformed_last_event_id_falls_back_to_now() -> None:
    """A malformed resume token degrades to the now() path rather than
    replaying the user's full history or crashing the stream."""
    db = _mock_db([[]])

    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    fixed_now = "2026-05-18T11:00:00+00:00"
    _FrozenDatetime.value = fixed_now
    with (
        patch.object(event_stream_module.asyncio, "sleep", new=sleep_mock),
        patch.object(event_stream_module, "datetime", _FrozenDatetime),
    ):
        gen = event_stream_generator(db, USER_ID, last_event_id="garbage-no-uuid")
        with pytest.raises(asyncio.CancelledError):
            await gen.__anext__()

    match_stage = db.aggregate.await_args_list[0].args[1][0]["$match"]
    assert match_stage["created_at"] == {"$gt": fixed_now}


@pytest.mark.asyncio
async def test_generator_stamps_composite_id_on_each_frame() -> None:
    """Every emitted frame carries the composite `id:` so the client can
    echo it back on reconnect for gap-free resume."""
    doc_id = "40000000-0000-0000-0000-000000000001"
    created_at = "2026-05-18T10:00:01+00:00"
    doc = make_notification_event(notification_id=doc_id, created_at=created_at)
    db = _mock_db([[doc]])

    with patch.object(event_stream_module.asyncio, "sleep", new=AsyncMock()):
        gen = event_stream_generator(db, USER_ID)
        frame = await gen.__anext__()

    assert frame["id"] == f"{created_at}|{doc_id}"
