"""Cursor-based pagination helpers."""

from __future__ import annotations

import base64
import json
from uuid import UUID

from .errors import ApiError


def encode_cursor(doc_id: str, sort_key: str | None = None) -> str:
    payload = json.dumps({"id": doc_id, "sort_key": sort_key}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode()).rstrip(b"=").decode()


def decode_cursor(cursor: str) -> tuple[str, str | None]:
    try:
        padding = (4 - len(cursor) % 4) % 4
        data = json.loads(base64.urlsafe_b64decode(cursor + "=" * padding))
        return data["id"], data.get("sort_key")
    except Exception as err:
        raise ApiError("invalid_cursor", "Cursor is malformed", status_code=400) from err


def apply_cursor_to_query(query: dict, cursor: str | None) -> dict:
    if cursor is None:
        return query
    doc_id, _ = decode_cursor(cursor)
    try:
        uid = UUID(doc_id)
    except ValueError as err:
        raise ApiError("invalid_cursor", "Cursor contains invalid ID", status_code=400) from err
    # NOTE: sort_key is stored in cursor for future compound-sort support
    # but not yet applied in the filter. All current endpoints sort by _id
    # ascending. Compound cursor support tracked in ticket TBD.
    return {**query, "_id": {"$gt": uid}}
