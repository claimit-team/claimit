"""Receipt content hashing and deduplication for ingest."""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# ISO 8601 timestamps: 2026-05-04T18:22:31Z, 2026-05-04 18:22:31+00:00
_ISO_8601_PATTERN = re.compile(
    r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?",
    re.IGNORECASE,
)
# RFC 2822-style: Mon, 4 May 2026 18:22:31
_RFC_2822_PATTERN = re.compile(
    r"\w{3},?\s+\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}(?::\d{2})?",
    re.IGNORECASE,
)
# Message-ID headers
_MESSAGE_ID_PATTERN = re.compile(r"message-id:\s*<[^>]+>", re.IGNORECASE)


class DuplicateReceiptError(Exception):
    """Raised when a purchase with the same receipt_hash already exists."""

    def __init__(self, receipt_hash: str) -> None:
        self.receipt_hash = receipt_hash
        super().__init__(f"Duplicate receipt: hash={receipt_hash}")


def _normalize(email_body: str) -> str:
    """Normalize receipt content before hashing.

    Collapses whitespace, lowercases, and strips volatile fields (timestamps,
    message IDs) so Gmail replays of the same email produce the same hash.
    """
    text = email_body.lower()
    text = _ISO_8601_PATTERN.sub(" ", text)
    text = _RFC_2822_PATTERN.sub(" ", text)
    text = _MESSAGE_ID_PATTERN.sub(" ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def hash_receipt(email_body: str) -> str:
    """SHA-256 of normalized receipt content for deduplication."""
    normalized = _normalize(email_body)
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


async def check_duplicate(receipt_hash: str, collection: Any) -> bool:
    """Return True if a purchase with this receipt_hash already exists."""
    existing = await collection.find_one({"receipt_hash": receipt_hash}, {"_id": 1})
    if existing:
        logger.info("Duplicate receipt skipped: hash=%s", receipt_hash)
        return True
    return False
