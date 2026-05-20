"""Helpers for `users.ingestion_skiplist` (ticket 3.7).

The skiplist lets the classifier short-circuit emails from senders the user has
previously dismissed as "not an order". The `format_hash` is computed from the
subject plus the first 500 characters of the body so that emails sharing a
boilerplate template (e.g. promotional newsletters) produce a stable identity.
"""

from __future__ import annotations

import hashlib
import re

FORMAT_HASH_BODY_PREFIX_CHARS = 500
SKIPLIST_MAX_ENTRIES = 1000


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def compute_format_hash(subject: str, body_text: str) -> str:
    """SHA-256 over normalized `subject + first 500 chars of body`."""
    body_prefix = (body_text or "")[:FORMAT_HASH_BODY_PREFIX_CHARS]
    normalized = f"{_normalize(subject or '')}\n{_normalize(body_prefix)}"
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def normalize_sender(sender: str) -> str:
    """Lowercase + trim sender so skiplist matches are case-insensitive."""
    return (sender or "").strip().lower()
