"""Unit tests for the purchases service-layer helpers that don't need a router.

Route-level scenarios live in `test_routes_purchases.py`; this file keeps
small pure helpers + service-level branches (gs:// parsing, future
policy lookup branches) close to the code they exercise.
"""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from claimit_mongodb_models import MongoDBClient
from src.middleware.errors import ApiError
from src.services.purchases import _assert_not_duplicate_purchase, _parse_gs_uri


@pytest.mark.parametrize(
    ("uri", "expected"),
    [
        ("gs://bucket/path", ("bucket", "path")),
        ("gs://bucket/nested/path/file.pdf", ("bucket", "nested/path/file.pdf")),
        ("gs://b/p/spaces in name.jpg", ("b", "p/spaces in name.jpg")),
    ],
)
def test_parse_gs_uri_happy_paths(uri: str, expected: tuple[str, str]) -> None:
    assert _parse_gs_uri(uri) == expected


@pytest.mark.parametrize(
    "malformed",
    [
        "",
        "not-a-gs-uri",
        "https://bucket/path",
        "gs:/bucket/path",
        "gs://",
        "gs://bucketonly",
        "gs:///pathonly",
    ],
)
def test_parse_gs_uri_rejects_malformed(malformed: str) -> None:
    with pytest.raises(ValueError):
        _parse_gs_uri(malformed)


# ---------------------------------------------------------------------------
# _assert_not_duplicate_purchase — exclude_purchase_id (BUG-85 re-upload)
# ---------------------------------------------------------------------------

_USER_ID = UUID("00000000-0000-0000-0000-000000000001")
_PURCHASE_ID = UUID("22222222-2222-4222-8222-222222222222")


@pytest.mark.asyncio
async def test_assert_not_duplicate_passes_exclude_clause_to_both_queries() -> None:
    """Re-upload excludes the purchase's OWN row from both dedup checks.

    Without the `_id: {$ne}` clause, re-uploading the identical receipt (or
    keeping the same order_id) would match the purchase's own committed row
    and falsely 409.
    """
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=None)

    await _assert_not_duplicate_purchase(
        mock_db,
        user_id=_USER_ID,
        platform="best_buy",
        order_id="A123",
        receipt_hash="sha256:abc",
        exclude_purchase_id=_PURCHASE_ID,
    )

    # Both the (user, platform, order_id) and receipt_hash queries ran with
    # the self-exclusion clause.
    assert mock_db.find_one.await_count == 2
    for call in mock_db.find_one.await_args_list:
        query = call.args[1]
        assert query["_id"] == {"$ne": _PURCHASE_ID}


@pytest.mark.asyncio
async def test_assert_not_duplicate_omits_exclude_clause_by_default() -> None:
    """The create path (no exclude id) keeps the original filter shape."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=None)

    await _assert_not_duplicate_purchase(
        mock_db,
        user_id=_USER_ID,
        platform="best_buy",
        order_id="A123",
        receipt_hash="sha256:abc",
    )

    for call in mock_db.find_one.await_args_list:
        assert "_id" not in call.args[1]


@pytest.mark.asyncio
async def test_assert_not_duplicate_still_raises_on_other_purchase_match() -> None:
    """A DIFFERENT purchase matching the receipt_hash still 409s even when an
    exclude id is supplied."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_one = AsyncMock(return_value=object())  # truthy = a match

    with pytest.raises(ApiError) as exc:
        await _assert_not_duplicate_purchase(
            mock_db,
            user_id=_USER_ID,
            platform="best_buy",
            order_id="A123",
            receipt_hash="sha256:abc",
            exclude_purchase_id=_PURCHASE_ID,
        )
    assert exc.value.code == "duplicate"
