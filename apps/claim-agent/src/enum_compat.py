"""Helpers for enum fields that may be StrEnum members or plain strings."""

from __future__ import annotations


def enum_to_str(value: object) -> str:
    """StrEnum member or plain string from ClaimReadTolerant → span/event string."""
    return getattr(value, "value", value)  # type: ignore[return-value]
