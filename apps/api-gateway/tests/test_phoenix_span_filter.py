"""Unit tests for the Phoenix span filter that silences the SSE-poll noise.

`init_phoenix(..., drop_db_collections={"notification_events"})` wraps the OTLP
exporter so the api-gateway's 1s SSE-poll `aggregate` spans on
`notification_events` (pymongo auto-instrumentation) never reach Phoenix.
"""

from __future__ import annotations

from types import SimpleNamespace

from claimit_observability.phoenix import _CollectionFilterSpanExporter
from opentelemetry.sdk.trace.export import SpanExportResult


class _RecordingExporter:
    """Inner exporter that records what it was asked to export."""

    def __init__(self) -> None:
        self.batches: list[list] = []
        self.shutdown_called = False
        self.flush_called = False

    def export(self, spans):
        self.batches.append(list(spans))
        return SpanExportResult.SUCCESS

    def shutdown(self) -> None:
        self.shutdown_called = True

    def force_flush(self, timeout_millis: int = 30_000) -> bool:
        self.flush_called = True
        return True


def _span(collection: str | None) -> SimpleNamespace:
    attrs = {"db.mongodb.collection": collection} if collection is not None else {}
    return SimpleNamespace(name="claimit.aggregate", attributes=attrs)


def test_drops_only_targeted_collection() -> None:
    inner = _RecordingExporter()
    exporter = _CollectionFilterSpanExporter(inner, {"notification_events"})

    noisy = _span("notification_events")
    other = _span("claims")
    non_mongo = _span(None)  # e.g. an httpx span — no collection attribute

    result = exporter.export([noisy, other, non_mongo])

    assert result is SpanExportResult.SUCCESS
    assert len(inner.batches) == 1
    forwarded = inner.batches[0]
    assert noisy not in forwarded
    assert other in forwarded
    assert non_mongo in forwarded


def test_all_dropped_short_circuits_without_calling_inner() -> None:
    inner = _RecordingExporter()
    exporter = _CollectionFilterSpanExporter(inner, {"notification_events"})

    result = exporter.export([_span("notification_events"), _span("notification_events")])

    assert result is SpanExportResult.SUCCESS
    assert inner.batches == []  # nothing forwarded → no wasted OTLP round-trip


def test_shutdown_and_flush_delegate() -> None:
    inner = _RecordingExporter()
    exporter = _CollectionFilterSpanExporter(inner, {"notification_events"})

    assert exporter.force_flush(1000) is True
    exporter.shutdown()

    assert inner.flush_called is True
    assert inner.shutdown_called is True
