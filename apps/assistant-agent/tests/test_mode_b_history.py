"""Unit tests for Mode B history replay prefix."""

from __future__ import annotations

from src.mode_b import HistoryMessage, _format_history_prefix


def test_format_history_prefix_empty() -> None:
    assert _format_history_prefix(None) == ""
    assert _format_history_prefix([]) == ""


def test_format_history_prefix_includes_roles() -> None:
    prefix = _format_history_prefix(
        [
            HistoryMessage(role="user", content="first"),
            HistoryMessage(role="assistant", content="reply"),
        ]
    )
    assert "User: first" in prefix
    assert "Assistant: reply" in prefix
    assert "Prior conversation" in prefix
