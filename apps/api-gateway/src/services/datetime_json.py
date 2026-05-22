"""UTC-explicit datetime serialization for JSON API responses.

MongoDB stores BSON datetimes as UTC but without tzinfo. Pydantic's
`model_dump(mode="json")` emits naive ISO strings (no ``Z`` suffix), which
browsers parse as local time — shifting countdowns and relative timestamps.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel


def to_json_datetime(dt: datetime | None) -> str | None:
    """Serialize a datetime for JSON with an explicit UTC ``Z`` suffix."""
    if dt is None:
        return None
    dt = dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)
    return dt.isoformat().replace("+00:00", "Z")


def dump_model_json_utc(model: BaseModel) -> dict[str, Any]:
    """Like ``model_dump(mode=\"json\")`` but with UTC-explicit datetimes."""
    payload = model.model_dump(mode="python", by_alias=True)
    normalized = _normalize_datetimes(payload)
    return json.loads(json.dumps(normalized, default=_json_default))


def _json_default(value: object) -> object:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return to_json_datetime(value)
    raise TypeError(f"Object of type {type(value)!r} is not JSON serializable")


def _normalize_datetimes(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _normalize_datetimes(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize_datetimes(v) for v in value]
    if isinstance(value, datetime):
        return to_json_datetime(value)
    return value
