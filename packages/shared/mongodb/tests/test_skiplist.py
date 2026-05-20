"""Tests for the ingestion skiplist hash helper (ticket 3.7)."""

from __future__ import annotations

from claimit_mongodb_models import (
    FORMAT_HASH_BODY_PREFIX_CHARS,
    SKIPLIST_MAX_ENTRIES,
    compute_format_hash,
    normalize_sender,
)


def test_format_hash_is_deterministic() -> None:
    h1 = compute_format_hash("Your receipt", "Thanks for your order #1234")
    h2 = compute_format_hash("Your receipt", "Thanks for your order #1234")
    assert h1 == h2
    assert h1.startswith("sha256:")


def test_format_hash_ignores_body_beyond_500_chars() -> None:
    body_prefix = "a" * FORMAT_HASH_BODY_PREFIX_CHARS
    h_short = compute_format_hash("Subj", body_prefix)
    h_long = compute_format_hash("Subj", body_prefix + "TAIL DIFFERS HERE")
    assert h_short == h_long


def test_format_hash_changes_when_subject_changes() -> None:
    h1 = compute_format_hash("Subject A", "same body")
    h2 = compute_format_hash("Subject B", "same body")
    assert h1 != h2


def test_format_hash_is_case_and_whitespace_insensitive() -> None:
    h1 = compute_format_hash("Your   Receipt", "Thanks  for  your  order")
    h2 = compute_format_hash("YOUR RECEIPT", "thanks for your order")
    assert h1 == h2


def test_normalize_sender_lowercases_and_trims() -> None:
    assert normalize_sender("  ORDERS@Example.COM  ") == "orders@example.com"
    assert normalize_sender("") == ""


def test_skiplist_max_entries_constant() -> None:
    assert SKIPLIST_MAX_ENTRIES == 1000
