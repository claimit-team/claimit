"""Unit tests for UTC-explicit datetime JSON serialization."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel
from src.services.datetime_json import dump_model_json_utc, to_json_datetime


def test_to_json_datetime_naive_treated_as_utc() -> None:
    naive = datetime(2026, 5, 13, 20, 0, 0)
    assert to_json_datetime(naive) == "2026-05-13T20:00:00Z"


def test_to_json_datetime_aware_emits_z_suffix() -> None:
    aware = datetime(2026, 5, 13, 20, 0, 0, tzinfo=UTC)
    assert to_json_datetime(aware) == "2026-05-13T20:00:00Z"


class _SampleModel(BaseModel):
    at: datetime
    auto_send_at: datetime | None = None


def test_dump_model_json_utc_normalizes_nested_datetimes() -> None:
    payload = dump_model_json_utc(
        _SampleModel(
            at=datetime(2026, 5, 9, 12, 0, 0),
            auto_send_at=datetime(2030, 1, 1, 12, 0, 0, tzinfo=UTC),
        )
    )
    assert payload["at"].endswith("Z")
    assert payload["auto_send_at"].endswith("Z")
