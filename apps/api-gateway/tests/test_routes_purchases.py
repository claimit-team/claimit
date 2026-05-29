"""Tests for /api/v1/purchases routes (Attachment 2 §3.3).

Pattern mirrors test_routes_notifications.py: AsyncMock(spec=MongoDBClient),
dependency_overrides[get_db]/[get_current_user]/[get_receipts_uploader].
"""

from __future__ import annotations

import copy
import hashlib
from datetime import UTC, datetime, timedelta
from typing import Annotated
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from claimit_mongodb_models import (
    SKIPLIST_MAX_ENTRIES,
    MongoDBClient,
    Purchase,
    PurchaseStatus,
    User,
)
from httpx import AsyncClient
from pydantic import Field, TypeAdapter, ValidationError
from src.deps import get_db, get_pubsub_publisher, get_receipts_uploader
from src.main import app
from src.middleware.auth import get_current_user
from src.middleware.errors import ApiError
from src.routes import purchases as purchases_route
from src.services.pubsub_publisher import PubSubPublisher
from src.services.receipts_storage import ReceiptObjectMissingError, ReceiptsUploader

from ._fixtures import USER_FIXTURE

PURCHASE_ID = UUID("22222222-2222-4222-8222-222222222222")
OTHER_USER_PURCHASE_ID = UUID("33333333-3333-4333-8333-333333333333")
USER_ID = UUID("00000000-0000-0000-0000-000000000001")
OTHER_USER_ID = UUID("99999999-9999-4999-8999-999999999999")


async def _override_user() -> User:
    return User.model_validate(USER_FIXTURE)


def _purchase_fixture(
    *,
    purchase_id: UUID = PURCHASE_ID,
    user_id: UUID = USER_ID,
    status: str = "pending_confirmation",
) -> Purchase:
    now = datetime.now(UTC)
    return Purchase.model_validate(
        {
            "_id": str(purchase_id),
            "updated_at": now.isoformat(),
            "user_id": str(user_id),
            "platform": "best_buy",
            "category": "retail",
            "product_name": "Widget",
            "product_id": "W123",
            "product_url": None,
            "variant": None,
            "fare_class": None,
            "room_type": None,
            "bed_type": None,
            "rate_type": None,
            "price_paid": 24.99,
            "member_price_at_purchase": None,
            "non_member_price_at_purchase": None,
            "currency": "USD",
            "purchase_date": now.isoformat(),
            "purchase_date_basis": "order_date",
            "window_expires": now.isoformat(),
            "order_id": "A123",
            "member_tier_at_purchase": None,
            "status": status,
            "claim_type": "self_service",
            "monitoring_cadence_minutes": 360,
            "ingested_at": now.isoformat(),
            "ingestion_source": "gmail",
            "receipt_storage_url": None,
            "receipt_hash": "sha256:abc123",
            "format_hash": "sha256:format123",
            "sender": "orders@retailer.example",
            "extraction_confidence": {
                "platform": 0.94,
                "price": 0.94,
                "overall_min": 0.94,
            },
        }
    )


def _set_overrides(
    db: AsyncMock,
    uploader: AsyncMock | None = None,
    publisher: AsyncMock | None = None,
) -> None:
    async def _override_db() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    if uploader is not None:

        async def _override_uploader() -> ReceiptsUploader:
            return uploader

        app.dependency_overrides[get_receipts_uploader] = _override_uploader
    if publisher is not None:

        async def _override_publisher() -> PubSubPublisher:
            return publisher

        app.dependency_overrides[get_pubsub_publisher] = _override_publisher


def _clear_overrides() -> None:
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_receipts_uploader, None)
    app.dependency_overrides.pop(get_pubsub_publisher, None)


# ---------------------------------------------------------------------------
# GET /purchases — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_purchases_returns_page(client: AsyncClient) -> None:
    purchase_a = _purchase_fixture(purchase_id=UUID("11111111-1111-4111-8111-111111111111"))
    purchase_b = _purchase_fixture(purchase_id=PURCHASE_ID)
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=2)
    mock_db.find_many = AsyncMock(return_value=[purchase_a, purchase_b])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["total_count"] == 2
        assert payload["next_cursor"] is None
        assert len(payload["purchases"]) == 2

        count_filter = mock_db.count.await_args.args[1]
        assert count_filter == {"user_id": USER_ID}
        find_filter = mock_db.find_many.await_args.args[1]
        assert find_filter == {"user_id": USER_ID}
        assert mock_db.find_many.await_args.kwargs["sort"] == [("_id", 1)]
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_applies_filters(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=0)
    mock_db.find_many = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases?status=monitoring&category=retail&limit=5",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200

        count_filter = mock_db.count.await_args.args[1]
        # `status` now uses `$in` even for a single value — semantically
        # equivalent to the prior equality match. FastAPI parses a
        # single `?status=monitoring` into a 1-element list which the
        # service translates to `$in: [monitoring]`.
        assert count_filter == {
            "user_id": USER_ID,
            "status": {"$in": ["monitoring"]},
            "category": "retail",
        }
        # find_many uses limit + 1 to detect has_more
        assert mock_db.find_many.await_args.kwargs["limit"] == 6
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_emits_next_cursor_when_has_more(client: AsyncClient) -> None:
    # Service requests limit+1 docs; if all limit+1 come back, has_more=True.
    docs = [
        _purchase_fixture(purchase_id=UUID(f"{i:08d}-0000-4000-8000-000000000000"))
        for i in range(1, 4)
    ]
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=3)
    mock_db.find_many = AsyncMock(return_value=docs)
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases?limit=2",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["purchases"]) == 2
        assert payload["next_cursor"] is not None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_invalid_cursor(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=0)
    mock_db.find_many = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases?cursor=not-a-real-cursor",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_cursor"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_q_matches_platform_product_or_order_id(
    client: AsyncClient,
) -> None:
    """`q` adds an `$or` regex over platform / product_name / order_id.

    The cursor `$or` (added by `apply_cursor_to_query`) and the q `$or`
    coexist as separate top-level filter keys — Mongo ANDs all top-level
    keys, so the cursor branch never reuses the same `$or` slot. No
    cursor in this test (clean assertion on the q `$or` shape alone).
    """
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=0)
    mock_db.find_many = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases?q=sony",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200

        count_filter = mock_db.count.await_args.args[1]
        assert count_filter["user_id"] == USER_ID
        # `$or` regex covers exactly the three fields, case-insensitive,
        # with `re.escape`d input. Literal substring "sony" round-trips
        # unchanged through `re.escape`.
        assert count_filter["$or"] == [
            {"platform": {"$regex": "sony", "$options": "i"}},
            {"product_name": {"$regex": "sony", "$options": "i"}},
            {"order_id": {"$regex": "sony", "$options": "i"}},
        ]
        # Sort + limit unchanged (no compound cursor change in this PR).
        assert mock_db.find_many.await_args.kwargs["sort"] == [("_id", 1)]
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_q_combines_with_status_category(
    client: AsyncClient,
) -> None:
    """`q` ANDs with status + category — same filter dict carries every key."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=0)
    mock_db.find_many = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases?status=monitoring&category=retail&q=widget",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200

        count_filter = mock_db.count.await_args.args[1]
        assert count_filter["user_id"] == USER_ID
        # status is now always `$in`-shaped (single or multi-value).
        assert count_filter["status"] == {"$in": ["monitoring"]}
        assert count_filter["category"] == "retail"
        assert "$or" in count_filter
        assert len(count_filter["$or"]) == 3
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_q_too_long_returns_400(client: AsyncClient) -> None:
    """`q` longer than `Q_MAX_LENGTH` (100) is rejected with 400 so
    runaway-input regex compile cost stays bounded. Same hard cap as
    the claims-list endpoint."""
    mock_db = AsyncMock(spec=MongoDBClient)
    _set_overrides(mock_db)
    try:
        long_q = "a" * 101
        response = await client.get(
            f"/api/v1/purchases?q={long_q}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_search_query"
        # Service must never be reached — guard fires in the route.
        mock_db.count.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_q_whitespace_is_ignored(client: AsyncClient) -> None:
    """Whitespace-only `q` is treated as no filter — `$or` is NOT added."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=0)
    mock_db.find_many = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases?q=%20%20%20",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200

        count_filter = mock_db.count.await_args.args[1]
        assert "$or" not in count_filter
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_q_special_chars_escape(client: AsyncClient) -> None:
    """`re.escape` turns regex metacharacters into literal substring matches —
    user input cannot inject ReDoS payloads or alter the pattern."""
    import re as _re

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=0)
    mock_db.find_many = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        # Url-encode the special chars so httpx doesn't strip them.
        response = await client.get(
            "/api/v1/purchases?q=%28%2A",  # "(*"
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200

        count_filter = mock_db.count.await_args.args[1]
        escaped = _re.escape("(*")
        # The literal regex string is what re.escape produced — never the
        # raw user input, which would be invalid as a regex anyway.
        assert count_filter["$or"][0]["platform"]["$regex"] == escaped
        assert count_filter["$or"][1]["product_name"]["$regex"] == escaped
        assert count_filter["$or"][2]["order_id"]["$regex"] == escaped
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_status_multi_value_uses_in_clause(
    client: AsyncClient,
) -> None:
    """Repeated `?status=` query keys produce a `$in` over all values.

    Real consumer: the dashboard's "Monitored purchases" hook needs
    to surface BOTH `monitoring` and `monitoring_degraded` so the
    section's row count matches the dashboard-summary
    `monitoring_purchases_count` (which counts both via
    `_MONITORING_STATUSES` in dashboard.py).
    """
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=0)
    mock_db.find_many = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases?status=monitoring&status=monitoring_degraded",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200

        count_filter = mock_db.count.await_args.args[1]
        assert count_filter["status"] == {"$in": ["monitoring", "monitoring_degraded"]}
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_q_with_cursor_preserves_search_filter(
    client: AsyncClient,
) -> None:
    """Pagination must preserve the `q` `$or` on follow-up pages.

    Regression guard suggested by CodeRabbit: a future refactor that
    collapses or rewrites top-level filter keys could accidentally
    drop `q`'s `$or` when the cursor branch adds its own `_id` key.
    This test asserts both filters coexist on the cursor'd request.
    """
    docs = [
        _purchase_fixture(purchase_id=UUID(f"{i:08d}-0000-4000-8000-000000000000"))
        for i in range(1, 4)
    ]
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=3)
    mock_db.find_many = AsyncMock(return_value=docs)
    _set_overrides(mock_db)
    try:
        first = await client.get(
            "/api/v1/purchases?limit=2&q=sony",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert first.status_code == 200
        cursor = first.json()["next_cursor"]
        assert cursor

        second = await client.get(
            f"/api/v1/purchases?limit=2&q=sony&cursor={cursor}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert second.status_code == 200

        # `count` is called with the base filter (no cursor) — q's `$or`
        # must be present.
        count_filter = mock_db.count.await_args.args[1]
        assert "$or" in count_filter
        assert len(count_filter["$or"]) == 3

        # `find_many`'s positional filter on the second call carries
        # BOTH the q `$or` AND the cursor's `_id` predicate — Mongo
        # ANDs top-level keys, so neither overwrites the other.
        page_filter = mock_db.find_many.await_args.args[1]
        assert "$or" in page_filter
        assert len(page_filter["$or"]) == 3
        assert "_id" in page_filter
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_cursor_roundtrip(client: AsyncClient) -> None:
    """A cursor produced by the server must be accepted on the next request."""
    docs = [
        _purchase_fixture(purchase_id=UUID(f"{i:08d}-0000-4000-8000-000000000000"))
        for i in range(1, 4)
    ]
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.count = AsyncMock(return_value=3)
    mock_db.find_many = AsyncMock(return_value=docs)
    _set_overrides(mock_db)
    try:
        first = await client.get(
            "/api/v1/purchases?limit=2",
            headers={"Authorization": "Bearer valid-token"},
        )
        cursor = first.json()["next_cursor"]
        assert cursor

        second = await client.get(
            f"/api/v1/purchases?limit=2&cursor={cursor}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert second.status_code == 200
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# GET /purchases/{id} — detail
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_purchase_returns_owned_purchase(client: AsyncClient) -> None:
    """Enriched detail (ticket 5.6): response carries `purchase`,
    `price_history`, `claims`. Empty histories/claims surface as `[]`,
    NOT missing keys — frontend renders a calm empty state."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(status="monitoring"))
    mock_db.find_price_history = AsyncMock(return_value=[])
    mock_db.aggregate = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["purchase"]["_id"] == str(PURCHASE_ID)
        assert payload["purchase"]["status"] == "monitoring"
        # Additive keys present, both `[]` on a freshly-monitored purchase.
        assert payload["price_history"] == []
        assert payload["claims"] == []
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_purchase_detail_enriches_with_price_history_and_claims(
    client: AsyncClient,
) -> None:
    """Enriched bundle includes the purchase's price_history (ASC by
    checked_at — the chart-friendly order) and the claims tied to this
    purchase. Wire shape matches ClaimListItem (`_id`, `outcome`,
    `claim_amount`, joined `product_name` from $lookup)."""
    from claimit_mongodb_models import PriceHistoryReadTolerant

    now = datetime.now(UTC)

    price_rows = [
        PriceHistoryReadTolerant.model_construct(
            id=UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"),
            purchase_id=PURCHASE_ID,
            platform="best_buy",
            product_id="BBY-987654",
            price_member=None,
            price_non_member=24.99,
            member_tier_required=None,
            currency="USD",
            checked_at=now - timedelta(days=4),
            source="scraperapi",
            evidence_screenshot_url=None,
            raw_response_hash="hash-a",
        ),
        PriceHistoryReadTolerant.model_construct(
            id=UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"),
            purchase_id=PURCHASE_ID,
            platform="best_buy",
            product_id="BBY-987654",
            price_member=None,
            price_non_member=19.99,
            member_tier_required=None,
            currency="USD",
            checked_at=now - timedelta(days=1),
            source="scraperapi",
            evidence_screenshot_url=None,
            raw_response_hash="hash-b",
        ),
    ]
    # Aggregate result shape matches a $project'd ClaimListItem row —
    # claim core fields + the three joined Purchase fields. Mirrors the
    # output of _CLAIM_LIST_PROJECT_STAGE.
    claim_rows = [
        {
            "_id": UUID("20000000-0000-0000-0000-000000000001"),
            "updated_at": now,
            "purchase_id": PURCHASE_ID,
            "user_id": USER_ID,
            "platform": "best_buy",
            "claim_amount": 5.0,
            "currency": "USD",
            "claim_type": "email",
            "outcome": "draft_pending",
            "submitted_at": None,
            "resolved_at": None,
            "redraft_count": 0,
            "product_name": "Widget",
            "category": "retail",
            "window_expires": now + timedelta(days=11),
        }
    ]

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(status="monitoring"))
    mock_db.find_price_history = AsyncMock(return_value=price_rows)
    mock_db.aggregate = AsyncMock(return_value=claim_rows)
    _set_overrides(mock_db)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["purchase"]["_id"] == str(PURCHASE_ID)
        # price_history surfaces both rows; client trusts the service to
        # ASC-sort by checked_at (verified by the find_price_history call args).
        assert len(payload["price_history"]) == 2
        assert payload["price_history"][0]["price_non_member"] == 24.99
        assert payload["price_history"][1]["price_non_member"] == 19.99
        # Verify the service requested ASC ordering on checked_at.
        sort_kw = mock_db.find_price_history.call_args.kwargs.get("sort")
        assert sort_kw == [("checked_at", 1)]
        # claims surfaces ClaimListItem-shaped rows.
        assert len(payload["claims"]) == 1
        claim = payload["claims"][0]
        assert claim["_id"] == "20000000-0000-0000-0000-000000000001"
        assert claim["outcome"] == "draft_pending"
        assert claim["product_name"] == "Widget"  # joined from purchase
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_purchase_detail_tolerant_to_rogue_price_history_row(
    client: AsyncClient,
) -> None:
    """A single price_history row with a rogue `source` value (a legacy
    value the current `PriceSource` enum no longer recognises) and a
    null `platform` must NOT 500 the detail endpoint — that's the
    tolerant-read contract from #142/#144 extended to price_history
    (ticket 5.6)."""
    from claimit_mongodb_models import PriceHistoryReadTolerant

    now = datetime.now(UTC)
    rogue = PriceHistoryReadTolerant.model_construct(
        id=UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"),
        purchase_id=PURCHASE_ID,
        platform=None,  # legacy doc with missing platform
        product_id="BBY-987654",
        price_member=None,
        price_non_member=20.0,
        member_tier_required=None,
        currency="USD",
        checked_at=now,
        source="seeded",  # not in current PriceSource enum
        evidence_screenshot_url=None,
        raw_response_hash=None,
    )

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(status="monitoring"))
    mock_db.find_price_history = AsyncMock(return_value=[rogue])
    mock_db.aggregate = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["price_history"]) == 1
        # Rogue source surfaces verbatim — no 500.
        assert payload["price_history"][0]["source"] == "seeded"
        assert payload["price_history"][0]["platform"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "input_limit, expected_limit",
    [
        # Floor at 1: $limit: 0 raises "$limit requires a positive number"
        # at MongoDB, so a 0/negative caller must still emit a positive
        # value (empty result is the right shape; a 500 is not).
        pytest.param(0, 1, id="zero-floors-to-one"),
        pytest.param(-5, 1, id="negative-floors-to-one"),
        # Cap at _CLAIMS_PER_PURCHASE_CAP: no caller can bypass the
        # hard ceiling by widening the kwarg.
        pytest.param(500, 50, id="overshoot-caps-at-50"),
        pytest.param(10000, 50, id="x200-still-caps-at-50"),
        # Identity inside the band — no clamping when the value is sane.
        pytest.param(10, 10, id="passthrough-within-band"),
    ],
)
async def test_list_claims_for_purchase_clamps_limit_to_hard_cap(
    input_limit: int, expected_limit: int
) -> None:
    """Defensive clamp (review findings C1 + Bugbot NEW-1): the emitted
    `$limit` MUST floor at 1 (so MongoDB never sees a non-positive
    value) and cap at `_CLAIMS_PER_PURCHASE_CAP` (so a future caller
    can't bypass the hard ceiling)."""
    from src.services.claims_service import list_claims_for_purchase

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.aggregate = AsyncMock(return_value=[])
    await list_claims_for_purchase(
        mock_db,
        user_id=USER_ID,
        purchase_id=PURCHASE_ID,
        limit=input_limit,
    )
    pipeline = mock_db.aggregate.await_args.args[1]
    limit_stage = next(s for s in pipeline if "$limit" in s)
    assert limit_stage["$limit"] == expected_limit


@pytest.mark.asyncio
async def test_get_purchase_404_when_missing(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=None)
    _set_overrides(mock_db)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_found"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_purchase_with_rogue_enum_does_not_500(client: AsyncClient) -> None:
    """Read-tolerance contract (PR #142): a Purchase with a null required
    field (e.g. category=None, the exact rogue shape from the §3 audit)
    must not 500 the detail endpoint. The route surfaces the null
    verbatim and the frontend renders it as '—'."""
    from claimit_mongodb_models import PurchaseReadTolerant

    rogue = PurchaseReadTolerant.model_construct(
        id=PURCHASE_ID,
        user_id=USER_ID,
        platform="best_buy",
        category=None,
        product_name=None,
        product_id=None,
        price_paid=99.99,
        currency="USD",
        purchase_date=None,
        purchase_date_basis=None,
        window_expires=None,
        order_id=None,
        status="monitoring",
        claim_type=None,
        monitoring_cadence_minutes=60,
        ingested_at=None,
        ingestion_source="gmail",
    )
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=rogue)
    mock_db.find_price_history = AsyncMock(return_value=[])
    mock_db.aggregate = AsyncMock(return_value=[])
    _set_overrides(mock_db)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        # Verbatim nulls reach the wire; no 500.
        assert payload["purchase"]["category"] is None
        assert payload["purchase"]["product_name"] is None
        assert payload["purchase"]["claim_type"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_purchases_rogue_enum_does_not_500(client: AsyncClient) -> None:
    """A page that contains one rogue Purchase among valid ones must not
    crash the entire list — the rogue row deserialises through the
    tolerant variant and surfaces verbatim alongside the valid rows."""
    from claimit_mongodb_models import PurchaseReadTolerant

    valid = _purchase_fixture(status="monitoring")
    rogue = PurchaseReadTolerant.model_construct(
        id=OTHER_USER_PURCHASE_ID,
        user_id=USER_ID,
        platform="rogue_marketplace",
        category=None,
        product_name=None,
        product_id="X",
        price_paid=10.0,
        currency="USD",
        purchase_date=None,
        purchase_date_basis=None,
        window_expires=None,
        order_id=None,
        status="monitoring",
        claim_type="price_drop_refund",  # legacy, not in current ClaimType
        monitoring_cadence_minutes=60,
        ingested_at=None,
        ingestion_source="gmail",
    )
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.find_many = AsyncMock(return_value=[valid, rogue])
    mock_db.count = AsyncMock(return_value=2)
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        purchases = response.json()["purchases"]
        assert len(purchases) == 2
        # Rogue platform / claim_type pass through verbatim.
        rogue_row = next(p for p in purchases if p["platform"] == "rogue_marketplace")
        assert rogue_row["claim_type"] == "price_drop_refund"
        assert rogue_row["product_name"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_purchase_404_when_owned_by_other_user(client: AsyncClient) -> None:
    """Cross-user access must 404 (never 403) so existence cannot be probed."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(
        return_value=_purchase_fixture(
            purchase_id=OTHER_USER_PURCHASE_ID,
            user_id=OTHER_USER_ID,
        )
    )
    _set_overrides(mock_db)
    try:
        response = await client.get(
            f"/api/v1/purchases/{OTHER_USER_PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_purchase_invalid_uuid(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    _set_overrides(mock_db)
    try:
        response = await client.get(
            "/api/v1/purchases/not-a-uuid",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_purchase_id"
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /purchases/{id}/confirm
# ---------------------------------------------------------------------------


def _policy_fixture(
    *,
    platform: str = "best_buy",
    window_days: int = 15,
    window_days_member: int | None = None,
) -> dict:
    """Minimal Policy doc for confirm/finalize window-recompute tests."""
    return {
        "_id": "00000000-0000-4000-8000-aaaaaaaaaaaa",
        "updated_at": datetime.now(UTC).isoformat(),
        "platform": platform,
        "category": "retail",
        "window_days": window_days,
        "window_days_member": window_days_member,
        "pre_arrival_hours_required": None,
        "covers_own_drops": True,
        "covers_competitor_drops": False,
        "claim_type": "self_service",
        "claim_url": "https://example.com",
        "claim_email": None,
        "claim_phone": None,
        "loyalty_required": False,
        "award_ticket_eligible": None,
        "bundle_exclusions": False,
        "key_exclusions": [],
        "policy_url": "https://example.com",
        "policy_text_full": "f",
        "policy_text_relevant_clause": "c",
        "last_verified": datetime.now(UTC).isoformat(),
        "active": True,
    }


@pytest.mark.asyncio
async def test_confirm_purchase_sets_monitoring(client: AsyncClient) -> None:
    pending = _purchase_fixture()
    monitoring = _purchase_fixture(status="monitoring")
    mock_db = AsyncMock(spec=MongoDBClient)
    # get_purchase: 1st call for ownership check, 2nd for the post-update read.
    mock_db.get_purchase = AsyncMock(side_effect=[pending, monitoring])
    mock_db.partial_update = AsyncMock(return_value=True)
    # No policy fixture → confirm logs a warning and leaves window_expires
    # untouched (current behavior preserved for tests that don't care).
    mock_db.get_policy = AsyncMock(return_value=None)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["purchase"]["status"] == PurchaseStatus.MONITORING
        update_args = mock_db.partial_update.await_args
        assert update_args.args[2]["status"] == PurchaseStatus.MONITORING
        assert "_id" not in update_args.args[2]
        # No Policy → server intentionally does not fabricate a window.
        assert "window_expires" not in update_args.args[2]
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_with_corrected_fields(client: AsyncClient) -> None:
    pending = _purchase_fixture()
    monitoring = _purchase_fixture(status="monitoring")
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[pending, monitoring])
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.get_policy = AsyncMock(return_value=None)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "corrected_fields": {
                    "product_name": "Corrected Widget",
                    "price_paid": 19.99,
                }
            },
        )
        assert response.status_code == 200
        updates = mock_db.partial_update.await_args.args[2]
        assert updates["product_name"] == "Corrected Widget"
        assert updates["price_paid"] == 19.99
        assert updates["status"] == PurchaseStatus.MONITORING
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_accepts_pending_user_edit(client: AsyncClient) -> None:
    """`pending_user_edit` is a peer of `pending_confirmation` at /confirm.

    The ingest extractor routes multi-item / synthesized-product-id
    receipts to `pending_user_edit` so monitoring doesn't start until
    the user picks the line; submitting /confirm transitions straight
    to `monitoring` like the low-confidence path.
    """
    pending_edit = _purchase_fixture(status="pending_user_edit")
    monitoring = _purchase_fixture(status="monitoring")
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[pending_edit, monitoring])
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.get_policy = AsyncMock(return_value=None)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["purchase"]["status"] == PurchaseStatus.MONITORING
        update_args = mock_db.partial_update.await_args
        assert update_args.args[2]["status"] == PurchaseStatus.MONITORING
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_with_corrected_fields_from_pending_user_edit(
    client: AsyncClient,
) -> None:
    """Regression for issue #197: multi-item OCR row corrects + monitors.

    Mirrors `test_confirm_purchase_with_corrected_fields` but starts
    from `pending_user_edit`, which is the load-bearing path for a
    multi-item receipt where the user must pick / correct the product
    line before monitoring can start.
    """
    pending_edit = _purchase_fixture(status="pending_user_edit")
    monitoring = _purchase_fixture(status="monitoring")
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[pending_edit, monitoring])
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.get_policy = AsyncMock(return_value=None)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "corrected_fields": {
                    "product_name": "Corrected Item Line",
                    "product_id": "SKU-CORRECTED",
                    "price_paid": 42.50,
                }
            },
        )
        assert response.status_code == 200
        updates = mock_db.partial_update.await_args.args[2]
        assert updates["product_name"] == "Corrected Item Line"
        assert updates["product_id"] == "SKU-CORRECTED"
        assert updates["price_paid"] == 42.50
        assert updates["status"] == PurchaseStatus.MONITORING
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_rejects_disallowed_field(client: AsyncClient) -> None:
    pending = _purchase_fixture()
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=pending)
    # window_expires is server-computed — confirm a client cannot smuggle
    # it through corrected_fields even though the route would otherwise
    # bail at the allow-list check.
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={"corrected_fields": {"user_id": str(OTHER_USER_ID)}},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_field"
        mock_db.partial_update.assert_not_awaited()
        mock_db.get_policy.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_rejects_window_expires_correction(client: AsyncClient) -> None:
    """Server owns window_expires — corrected_fields[window_expires] is 400."""
    pending = _purchase_fixture()
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=pending)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={"corrected_fields": {"window_expires": "2099-01-01T00:00:00Z"}},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_field"
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_invalid_corrected_value_returns_400(client: AsyncClient) -> None:
    pending = _purchase_fixture()
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=pending)
    mock_db.partial_update = AsyncMock(side_effect=_positive_float_validation_error())
    mock_db.get_policy = AsyncMock(return_value=None)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={"corrected_fields": {"price_paid": -1}},
        )
        assert response.status_code == 400
        payload = response.json()
        assert payload["error"]["code"] == "invalid_field"
        assert payload["error"]["details"]["fields"][0]["type"] == "greater_than"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_recomputes_window_from_policy(client: AsyncClient) -> None:
    """Upload-created sentinel (window=now) confirms with a policy → window in future."""
    purchase_date = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
    # Sentinel doc: window_expires == purchase_date == now (upload default).
    pending = _purchase_fixture().model_copy(
        update={
            "platform": "best_buy",
            "purchase_date": purchase_date,
            "window_expires": purchase_date,
            "member_tier_at_purchase": None,
        }
    )
    monitoring = _purchase_fixture(status="monitoring")
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[pending, monitoring])
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.get_policy = AsyncMock(
        return_value=type("P", (), _policy_fixture(window_days=30))()  # not used; see line below
    )
    # Hand the real Policy to get_policy so compute_window_days walks the
    # actual Policy attrs (model_validate avoids the duck-type trap above).
    from claimit_mongodb_models import Policy

    mock_db.get_policy = AsyncMock(
        return_value=Policy.model_validate(_policy_fixture(window_days=30))
    )
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        updates = mock_db.partial_update.await_args.args[2]
        # window_expires must move from purchase_date to purchase_date+30d.
        assert updates["window_expires"] == purchase_date + timedelta(days=30)
        mock_db.get_policy.assert_awaited_once_with("best_buy")
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_window_honors_corrected_purchase_date(
    client: AsyncClient,
) -> None:
    """User-corrected purchase_date drives the recomputed window."""
    original_date = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
    corrected_date = datetime(2026, 5, 10, 12, 0, 0, tzinfo=UTC)
    pending = _purchase_fixture().model_copy(
        update={
            "platform": "best_buy",
            "purchase_date": original_date,
            "window_expires": original_date,
        }
    )
    monitoring = _purchase_fixture(status="monitoring")
    from claimit_mongodb_models import Policy

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[pending, monitoring])
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.get_policy = AsyncMock(
        return_value=Policy.model_validate(_policy_fixture(window_days=30))
    )
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={"corrected_fields": {"purchase_date": corrected_date.isoformat()}},
        )
        assert response.status_code == 200
        updates = mock_db.partial_update.await_args.args[2]
        # Corrected purchase_date wins; window_expires is corrected+30d.
        assert updates["window_expires"] == corrected_date + timedelta(days=30)
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_window_uses_member_window_when_tier_set(
    client: AsyncClient,
) -> None:
    """Member tier on purchase + policy.window_days_member → use the member-specific window."""
    purchase_date = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
    pending = _purchase_fixture().model_copy(
        update={
            "platform": "best_buy",
            "purchase_date": purchase_date,
            "window_expires": purchase_date,
            "member_tier_at_purchase": "my_best_buy_total",
        }
    )
    monitoring = _purchase_fixture(status="monitoring")
    from claimit_mongodb_models import Policy

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[pending, monitoring])
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.get_policy = AsyncMock(
        return_value=Policy.model_validate(_policy_fixture(window_days=15, window_days_member=60))
    )
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        updates = mock_db.partial_update.await_args.args[2]
        # Tier present + member window present → 60d, not 15d.
        assert updates["window_expires"] == purchase_date + timedelta(days=60)
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_window_zero_days_yields_purchase_date(
    client: AsyncClient,
) -> None:
    """Amazon-style window_days=0 → window_expires == purchase_date (immediately past-window)."""
    purchase_date = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
    pending = _purchase_fixture().model_copy(
        update={
            "platform": "amazon",
            "purchase_date": purchase_date,
            "window_expires": purchase_date,
        }
    )
    monitoring = _purchase_fixture(status="monitoring")
    from claimit_mongodb_models import Policy

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[pending, monitoring])
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.get_policy = AsyncMock(
        return_value=Policy.model_validate(_policy_fixture(platform="amazon", window_days=0))
    )
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        updates = mock_db.partial_update.await_args.args[2]
        # window_expires must equal purchase_date — NOT a fabricated 15d fallback.
        assert updates["window_expires"] == purchase_date
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_malformed_corrected_purchase_date_returns_400(
    client: AsyncClient,
) -> None:
    """Bugbot regression: malformed ISO string in corrected_fields must 400, not 500.

    The 5.14 A2 commit added a server-side `window_expires` recompute
    that touches `corrected_fields["purchase_date"]` BEFORE Pydantic
    validates it inside `partial_update`. A direct
    `datetime.fromisoformat("not-a-date")` used to leak as a 500.
    Confirm restores the original 400 contract.
    """
    purchase_date = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
    pending = _purchase_fixture().model_copy(
        update={
            "platform": "best_buy",
            "purchase_date": purchase_date,
            "window_expires": purchase_date,
        }
    )
    from claimit_mongodb_models import Policy

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=pending)
    # partial_update is never reached — the 400 fires earlier in the
    # window-recompute block. Stub it just to satisfy AsyncMock.
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.get_policy = AsyncMock(
        return_value=Policy.model_validate(_policy_fixture(window_days=30))
    )
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={"corrected_fields": {"purchase_date": "not-a-date"}},
        )
        assert response.status_code == 400
        payload = response.json()
        assert payload["error"]["code"] == "invalid_field"
        # Must produce the SAME `details.fields` payload as other
        # corrected-field validation errors (price_paid, etc.). The
        # frontend's per-field error rendering reads this — a bare
        # ApiError without `details` would skip the inline highlight.
        details = payload["error"].get("details", {})
        assert isinstance(details.get("fields"), list) and details["fields"]
        # And the entry's `loc` must lead with "purchase_date" so PR-B
        # can route the message to the right form field.
        # `TypeAdapter(datetime)` returns `loc=()`; the call site
        # supplies the field name via `loc_prefix=("purchase_date",)`.
        first_loc = details["fields"][0]["loc"]
        assert first_loc and first_loc[0] == "purchase_date"
        # Must NOT have proceeded to write — window block aborts first.
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_falsy_corrected_platform_does_not_use_old_platform(
    client: AsyncClient,
) -> None:
    """Parallel of the purchase_date case for `platform`. Closes the
    falsy-handling parity set across all three `effective_*` resolvers
    (platform / purchase_date / member_tier).

    A falsy-but-present `platform` correction (`""`) must short-circuit
    the window block — the policy lookup must NOT run on the OLD
    `purchase.platform` and `window_expires` must NOT be set from a
    value the user is trying to overwrite. `partial_update` then
    produces the 400 from Pydantic's `platform` field validation.
    """
    purchase_date = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
    pending = _purchase_fixture().model_copy(
        update={
            "platform": "best_buy",
            "purchase_date": purchase_date,
            "window_expires": purchase_date,
        }
    )
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=pending)
    mock_db.partial_update = AsyncMock(side_effect=_positive_float_validation_error())
    # Sentinel: this MUST NOT be awaited — falsy platform short-circuits
    # the `if effective_platform and effective_purchase_date:` guard
    # before any policy lookup runs.
    mock_db.get_policy = AsyncMock(return_value=None)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={"corrected_fields": {"platform": ""}},
        )
        assert response.status_code == 400
        mock_db.partial_update.assert_awaited_once()
        updates_arg = mock_db.partial_update.await_args.args[2]
        assert "window_expires" not in updates_arg, (
            "window block must short-circuit on falsy platform instead of "
            "computing from the OLD purchase.platform's policy"
        )
        mock_db.get_policy.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_falsy_corrected_purchase_date_does_not_use_old_date(
    client: AsyncClient,
) -> None:
    """Bugbot LOW regression: falsy `purchase_date` correction must NOT silently
    fall back to `purchase.purchase_date` for the window computation.

    Pre-fix behaviour (`updates.get("purchase_date") or purchase.purchase_date`):
    an empty string flowed through the truthy fallback, the OLD
    `purchase.purchase_date` was used to compute `window_expires`, and
    then `partial_update` rejected the empty string anyway. The user-
    visible 400 was correct but the internal window computation was
    based on a value the user is trying to overwrite.

    Post-fix behaviour (`updates.get("purchase_date", purchase.purchase_date)`):
    `effective_purchase_date == ""` (falsy) short-circuits the window
    block entirely; `partial_update(..., model=Purchase)` then
    produces the same 400 with `details.fields[*].loc == ("purchase_date",)`
    from the Purchase model itself — no dead window computation.
    """
    purchase_date = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
    pending = _purchase_fixture().model_copy(
        update={
            "platform": "best_buy",
            "purchase_date": purchase_date,
            "window_expires": purchase_date,
        }
    )
    from claimit_mongodb_models import Policy

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=pending)
    # Simulate Pydantic rejecting the empty-string write — same
    # surface a real partial_update would produce.
    mock_db.partial_update = AsyncMock(side_effect=_positive_float_validation_error())
    mock_db.get_policy = AsyncMock(
        return_value=Policy.model_validate(_policy_fixture(window_days=30))
    )
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
            json={"corrected_fields": {"purchase_date": ""}},
        )
        assert response.status_code == 400
        # The window block short-circuited (empty string is falsy), so
        # partial_update fired and produced the 400 — i.e. NO call to
        # `window_expires =` happened from a stale fallback value.
        mock_db.partial_update.assert_awaited_once()
        updates_arg = mock_db.partial_update.await_args.args[2]
        assert "window_expires" not in updates_arg, (
            "window block must short-circuit on falsy purchase_date instead of "
            "computing from the OLD purchase.purchase_date"
        )
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_no_policy_leaves_window_untouched(client: AsyncClient) -> None:
    """Unknown platform (no Policy doc) → confirm does not fabricate a window."""
    purchase_date = datetime(2026, 5, 1, 12, 0, 0, tzinfo=UTC)
    pending = _purchase_fixture().model_copy(
        update={
            "platform": "best_buy",
            "purchase_date": purchase_date,
            "window_expires": purchase_date,
        }
    )
    monitoring = _purchase_fixture(status="monitoring")
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[pending, monitoring])
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.get_policy = AsyncMock(return_value=None)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        updates = mock_db.partial_update.await_args.args[2]
        assert "window_expires" not in updates
    finally:
        _clear_overrides()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", ["monitoring", "monitoring_degraded", "claimed", "dismissed", "expired"]
)
async def test_confirm_purchase_rejects_wrong_status(client: AsyncClient, status: str) -> None:
    """Only `pending_confirmation` and `pending_user_edit` are reviewable.

    `pending_user_edit` is covered by
    `test_confirm_purchase_accepts_pending_user_edit` (happy path) — this
    test exhaustively pins the rejected matrix so a future status added
    to the enum is forced through an explicit decision here.
    """
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(status=status))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "invalid_status"
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_purchase_cross_user_404(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(user_id=OTHER_USER_ID))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/confirm",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /purchases/{id}/dismiss
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dismiss_duplicate_does_not_write_skiplist(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture())
    mock_db.partial_update = AsyncMock(return_value=True)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "duplicate", "remember_sender": True, "sender": "x@y.z"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["status"] == PurchaseStatus.DISMISSED
        assert payload["reason"] == "duplicate"
        # Skiplist only applies to not_an_order / other, never duplicate.
        assert payload["skiplist_written"] is False
        mock_db.upsert.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_not_an_order_with_remember_sender_writes_skiplist(
    client: AsyncClient,
) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture())
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "reason": "not_an_order",
                "remember_sender": True,
                "sender": "promo@retailer.example",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["skiplist_written"] is True
        mock_db.upsert.assert_awaited_once()
        upserted_user = mock_db.upsert.await_args.args[2]
        assert len(upserted_user.ingestion_skiplist) == 1
        entry = upserted_user.ingestion_skiplist[0]
        assert entry.sender == "promo@retailer.example"
        assert entry.format_hash == "sha256:format123"
        assert entry.reason == "not_an_order"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_not_an_order_without_remember_sender_skips_skiplist(
    client: AsyncClient,
) -> None:
    """remember_sender defaults to False; skiplist must not be written."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture())
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock()
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "not_an_order", "sender": "promo@retailer.example"},
        )
        assert response.status_code == 200
        assert response.json()["skiplist_written"] is False
        mock_db.upsert.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_not_an_order_without_format_hash_skips_skiplist(
    client: AsyncClient,
) -> None:
    """Legacy purchases without format_hash cannot create classifier-matchable skiplist entries."""
    purchase = _purchase_fixture()
    purchase.format_hash = None
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "reason": "not_an_order",
                "remember_sender": True,
                "sender": "promo@retailer.example",
            },
        )
        assert response.status_code == 200
        assert response.json()["skiplist_written"] is False
        mock_db.upsert.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_not_an_order_prefers_purchase_format_hash(client: AsyncClient) -> None:
    """When the purchase has format_hash set, the skiplist entry uses it (not receipt_hash)."""
    purchase = _purchase_fixture()
    purchase.format_hash = "sha256:format-from-extractor"
    purchase.sender = "newsletter@retailer.example"
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "reason": "not_an_order",
                "remember_sender": True,
            },
        )
        assert response.status_code == 200
        upserted_user = mock_db.upsert.await_args.args[2]
        entry = upserted_user.ingestion_skiplist[0]
        assert entry.format_hash == "sha256:format-from-extractor"
        assert entry.sender == "newsletter@retailer.example"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_not_an_order_enforces_1000_entry_cap(client: AsyncClient) -> None:
    """Adding a new entry past the cap evicts oldest entries (FIFO)."""
    purchase = _purchase_fixture()
    purchase.format_hash = "sha256:brand-new-format"
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))

    base_now = datetime.now(UTC)
    user_doc = copy.deepcopy(USER_FIXTURE)
    user_doc["ingestion_skiplist"] = [
        {
            "sender": f"sender-{i}@example.com",
            "format_hash": f"sha256:hash-{i}",
            "added_at": base_now.isoformat(),
            "reason": "not_an_order",
        }
        for i in range(SKIPLIST_MAX_ENTRIES)
    ]

    async def _override_user_full() -> User:
        return User.model_validate(user_doc)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user_full
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "reason": "not_an_order",
                "remember_sender": True,
                "sender": "new@example.com",
            },
        )
        assert response.status_code == 200
        upserted_user = mock_db.upsert.await_args.args[2]
        assert len(upserted_user.ingestion_skiplist) == SKIPLIST_MAX_ENTRIES
        # Oldest entry (index 0) evicted; newest appended at the tail.
        assert upserted_user.ingestion_skiplist[0].sender == "sender-1@example.com"
        assert upserted_user.ingestion_skiplist[-1].sender == "new@example.com"
        assert upserted_user.ingestion_skiplist[-1].format_hash == "sha256:brand-new-format"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_dismiss_not_an_order_dedupes_existing_entry(client: AsyncClient) -> None:
    """Repeat dismiss of same (sender, format_hash) does not duplicate the entry."""
    purchase = _purchase_fixture()
    purchase.format_hash = "sha256:existing-format"
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))

    user_doc = copy.deepcopy(USER_FIXTURE)
    user_doc["ingestion_skiplist"] = [
        {
            "sender": "promo@retailer.example",
            "format_hash": "sha256:existing-format",
            "added_at": datetime.now(UTC).isoformat(),
            "reason": "not_an_order",
        }
    ]

    async def _override_user_full() -> User:
        return User.model_validate(user_doc)

    async def _override_db() -> MongoDBClient:
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user_full
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "reason": "not_an_order",
                "remember_sender": True,
                "sender": "promo@retailer.example",
            },
        )
        assert response.status_code == 200
        assert response.json()["skiplist_written"] is False
        mock_db.upsert.assert_not_awaited()
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_dismiss_other_reason_with_remember_sender_writes_skiplist(
    client: AsyncClient,
) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture())
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "other", "remember_sender": True, "sender": "x@y.z"},
        )
        assert response.status_code == 200
        assert response.json()["skiplist_written"] is True
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_skiplist_failure_is_best_effort(client: AsyncClient) -> None:
    """When db.upsert fails during skiplist write, dismiss still 200s."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture())
    mock_db.partial_update = AsyncMock(return_value=True)
    mock_db.upsert = AsyncMock(side_effect=RuntimeError("simulated"))
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "reason": "not_an_order",
                "remember_sender": True,
                "sender": "promo@retailer.example",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == PurchaseStatus.DISMISSED
        assert payload["skiplist_written"] is False
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_rejects_unknown_reason(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "made_up_reason"},
        )
        assert response.status_code == 422
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_dismiss_accepts_pending_user_edit(client: AsyncClient) -> None:
    """`pending_user_edit` rows can be dismissed without first confirming.

    Same gate as /confirm — a multi-item OCR receipt the user doesn't
    want to triage should be dismissable directly, not stuck.
    """
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(status="pending_user_edit"))
    mock_db.partial_update = AsyncMock(return_value=True)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/dismiss",
            headers={"Authorization": "Bearer valid-token"},
            json={"reason": "duplicate", "remember_sender": False},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["status"] == PurchaseStatus.DISMISSED
        update_args = mock_db.partial_update.await_args
        assert update_args.args[2]["status"] == PurchaseStatus.DISMISSED
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /purchases/upload
# ---------------------------------------------------------------------------


def _publisher_mock(*, fail: bool = False) -> AsyncMock:
    publisher = AsyncMock(spec=PubSubPublisher)
    if fail:
        publisher.publish = AsyncMock(side_effect=RuntimeError("broker rejected"))
    else:
        publisher.publish = AsyncMock(return_value="pub-msg-1")
    return publisher


def _extraction_fixture(**overrides: object) -> dict:
    """Shape the ingest-agent /internal/extract endpoint returns."""
    now = datetime.now(UTC)
    base = {
        "platform": "best_buy",
        "category": "retail",
        "product_name": "Widget",
        "product_id": "W123",
        "product_url": None,
        "variant": None,
        "fare_class": None,
        "room_type": None,
        "bed_type": None,
        "rate_type": None,
        "price_paid": 24.99,
        "member_price_at_purchase": None,
        "non_member_price_at_purchase": None,
        "purchase_date": now.isoformat(),
        "purchase_date_basis": "order_date",
        "order_id": "A123",
        "member_tier_at_purchase": None,
        "status": "pending_confirmation",
        "currency": "USD",
        "extraction_confidence": {"platform": 0.9, "price": 0.9, "overall_min": 0.9},
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_upload_pdf_returns_extraction_without_persisting(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Upload extracts synchronously and writes NOTHING to Mongo/Pub-Sub."""
    extraction = _extraction_fixture()
    monkeypatch.setattr(
        "src.services.purchases.ingest_client.extract_receipt",
        AsyncMock(return_value=extraction),
    )
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.upload = AsyncMock(return_value="gs://test-bucket/receipts/x.pdf")
    publisher = _publisher_mock()
    _set_overrides(mock_db, mock_uploader, publisher)
    try:
        response = await client.post(
            "/api/v1/purchases/upload",
            headers={"Authorization": "Bearer valid-token"},
            files={"file": ("receipt.pdf", b"%PDF-1.4 test content", "application/pdf")},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["storage_url"] == "gs://test-bucket/receipts/x.pdf"
        assert payload["content_type"] == "application/pdf"
        assert payload["receipt_hash"].startswith("sha256:")
        assert payload["extraction"]["product_name"] == "Widget"
        assert mock_uploader.upload.await_count == 1
        # Write-after-confirm: NO Mongo write, NO Pub/Sub on upload.
        mock_db.upsert.assert_not_awaited()
        publisher.publish.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_upload_image_echoes_content_type(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "src.services.purchases.ingest_client.extract_receipt",
        AsyncMock(return_value=_extraction_fixture()),
    )
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.upload = AsyncMock(return_value="gs://test/x.jpg")
    _set_overrides(mock_db, mock_uploader, _publisher_mock())
    try:
        response = await client.post(
            "/api/v1/purchases/upload",
            headers={"Authorization": "Bearer valid-token"},
            files={"file": ("r.jpg", b"\xff\xd8\xff\xe0jpeg", "image/jpeg")},
        )
        assert response.status_code == 200
        assert response.json()["content_type"] == "image/jpeg"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_upload_rejects_unsupported_content_type(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    publisher = _publisher_mock()
    _set_overrides(mock_db, mock_uploader, publisher)
    try:
        response = await client.post(
            "/api/v1/purchases/upload",
            headers={"Authorization": "Bearer valid-token"},
            files={"file": ("r.txt", b"hello", "text/plain")},
        )
        assert response.status_code == 415
        assert response.json()["error"]["code"] == "unsupported_media_type"
        mock_uploader.upload.assert_not_awaited()
        mock_db.upsert.assert_not_awaited()
        publisher.publish.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_upload_rejects_file_larger_than_10mb(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    publisher = _publisher_mock()
    _set_overrides(mock_db, mock_uploader, publisher)
    try:
        oversize = b"x" * (10 * 1024 * 1024 + 1)
        response = await client.post(
            "/api/v1/purchases/upload",
            headers={"Authorization": "Bearer valid-token"},
            files={"file": ("big.pdf", oversize, "application/pdf")},
        )
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "file_too_large"
        mock_uploader.upload.assert_not_awaited()
        mock_db.upsert.assert_not_awaited()
        publisher.publish.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_upload_extractor_failure_returns_null_extraction(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Extractor failure → 200 with extraction=null (FE opens manual fill)."""
    from src.services.ingest_client import IngestExtractError

    monkeypatch.setattr(
        "src.services.purchases.ingest_client.extract_receipt",
        AsyncMock(side_effect=IngestExtractError("boom", code="extractor_failed", rejected=False)),
    )
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.upload = AsyncMock(return_value="gs://test-bucket/receipts/x.pdf")
    publisher = _publisher_mock()
    _set_overrides(mock_db, mock_uploader, publisher)
    try:
        response = await client.post(
            "/api/v1/purchases/upload",
            headers={"Authorization": "Bearer valid-token"},
            files={"file": ("receipt.pdf", b"%PDF-1.4 ...", "application/pdf")},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["extraction"] is None
        assert payload["storage_url"] == "gs://test-bucket/receipts/x.pdf"
        mock_db.upsert.assert_not_awaited()
        publisher.publish.assert_not_awaited()
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /purchases/confirm-create — write-after-confirm
# ---------------------------------------------------------------------------

_RECEIPT_URL = f"gs://test-bucket/receipts/{USER_ID}/staging/x.pdf"


def _confirm_create_db(*, dedup_hit: bool = False, policy_window_days: int = 30) -> AsyncMock:
    from claimit_mongodb_models import Policy

    mock_db = AsyncMock(spec=MongoDBClient)
    existing = _purchase_fixture(status="monitoring") if dedup_hit else None
    mock_db.find_one = AsyncMock(return_value=existing)
    mock_db.get_policy = AsyncMock(
        return_value=Policy.model_validate(_policy_fixture(window_days=policy_window_days))
    )
    mock_db.upsert = AsyncMock(return_value=str(USER_ID))
    return mock_db


def _confirm_create_uploader() -> AsyncMock:
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.bucket_name = "test-bucket"
    # confirm-create recomputes receipt_hash from the stored object (it does
    # not trust a client-supplied hash), so the blob must be downloadable.
    mock_uploader.download = AsyncMock(return_value=(b"%PDF-1.4 receipt bytes", "application/pdf"))
    return mock_uploader


@pytest.mark.asyncio
async def test_confirm_create_writes_monitoring_and_publishes(client: AsyncClient) -> None:
    mock_db = _confirm_create_db()
    publisher = _publisher_mock()
    _set_overrides(mock_db, _confirm_create_uploader(), publisher)
    try:
        response = await client.post(
            "/api/v1/purchases/confirm-create",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
                "corrected_fields": None,
            },
        )
        assert response.status_code == 200, response.text
        purchase = response.json()["purchase"]
        assert purchase["status"] == "monitoring"
        assert purchase["ingestion_source"] == "upload_pdf"
        assert purchase["receipt_storage_url"] == _RECEIPT_URL
        # Hash is recomputed server-side from the downloaded blob bytes.
        assert (
            purchase["receipt_hash"]
            == f"sha256:{hashlib.sha256(b'%PDF-1.4 receipt bytes').hexdigest()}"
        )
        mock_db.upsert.assert_awaited_once()
        # purchase.ingested fires so the monitor-agent starts tracking.
        topic, body = publisher.publish.await_args.args
        assert topic == "purchase.ingested"
        assert body["status"] == "monitoring"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_create_duplicate_returns_409(client: AsyncClient) -> None:
    mock_db = _confirm_create_db(dedup_hit=True)
    _set_overrides(mock_db, _confirm_create_uploader(), _publisher_mock())
    try:
        response = await client.post(
            "/api/v1/purchases/confirm-create",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
            },
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "duplicate"
        mock_db.upsert.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_create_multi_item_line_sets_key_and_suffixed_hash(
    client: AsyncClient,
) -> None:
    """A per-line confirm carries receipt_line_key onto the doc and suffixes
    the internal receipt_hash so multiple lines off one receipt don't collide.
    The dedup pre-check is scoped to the line, leaving order_id clean."""
    mock_db = _confirm_create_db()
    _set_overrides(mock_db, _confirm_create_uploader(), _publisher_mock())
    try:
        response = await client.post(
            "/api/v1/purchases/confirm-create",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
                "receipt_line_key": "line-1",
            },
        )
        assert response.status_code == 200, response.text
        purchase = response.json()["purchase"]
        assert purchase["receipt_line_key"] == "line-1"
        base = f"sha256:{hashlib.sha256(b'%PDF-1.4 receipt bytes').hexdigest()}"
        assert purchase["receipt_hash"] == f"{base}#line-1"

        # order_id stays the clean merchant number (NOT suffixed) — the
        # claim-agent submits it downstream.
        extraction = _extraction_fixture()
        assert purchase["order_id"] == extraction["order_id"]

        # The (user_id, platform, order_id) dedup pre-check is scoped to the
        # line so a different line of the same order won't false-positive.
        order_query = mock_db.find_one.await_args_list[0].args[1]
        assert order_query["receipt_line_key"] == "line-1"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_create_single_item_has_null_line_key_and_bare_hash(
    client: AsyncClient,
) -> None:
    """Omitting receipt_line_key (single-item / manual fill) keeps the
    pre-existing behavior: null line key, un-suffixed receipt_hash."""
    mock_db = _confirm_create_db()
    _set_overrides(mock_db, _confirm_create_uploader(), _publisher_mock())
    try:
        response = await client.post(
            "/api/v1/purchases/confirm-create",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
            },
        )
        assert response.status_code == 200, response.text
        purchase = response.json()["purchase"]
        assert purchase["receipt_line_key"] is None
        assert purchase["receipt_hash"] == (
            f"sha256:{hashlib.sha256(b'%PDF-1.4 receipt bytes').hexdigest()}"
        )
        order_query = mock_db.find_one.await_args_list[0].args[1]
        assert order_query["receipt_line_key"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_create_applies_corrected_fields(client: AsyncClient) -> None:
    mock_db = _confirm_create_db()
    _set_overrides(mock_db, _confirm_create_uploader(), _publisher_mock())
    try:
        response = await client.post(
            "/api/v1/purchases/confirm-create",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(product_name="Wrong"),
                "corrected_fields": {"product_name": "Corrected Name", "price_paid": 99.5},
            },
        )
        assert response.status_code == 200, response.text
        purchase = response.json()["purchase"]
        assert purchase["product_name"] == "Corrected Name"
        assert purchase["price_paid"] == 99.5
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_create_rejects_non_correctable_field(client: AsyncClient) -> None:
    mock_db = _confirm_create_db()
    _set_overrides(mock_db, _confirm_create_uploader(), _publisher_mock())
    try:
        response = await client.post(
            "/api/v1/purchases/confirm-create",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
                "corrected_fields": {"status": "monitoring"},
            },
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_field"
        mock_db.upsert.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_create_rejects_foreign_receipt_url(client: AsyncClient) -> None:
    """A storage_url under another user's prefix is rejected (400)."""
    mock_db = _confirm_create_db()
    _set_overrides(mock_db, _confirm_create_uploader(), _publisher_mock())
    try:
        response = await client.post(
            "/api/v1/purchases/confirm-create",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": f"gs://test-bucket/receipts/{OTHER_USER_ID}/staging/x.pdf",
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
            },
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_field"
        mock_db.upsert.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_create_manual_fill_no_extraction(client: AsyncClient) -> None:
    """extraction=null → build from corrected_fields, status monitoring."""
    mock_db = _confirm_create_db()
    _set_overrides(mock_db, _confirm_create_uploader(), _publisher_mock())
    now_iso = datetime.now(UTC).isoformat()
    try:
        response = await client.post(
            "/api/v1/purchases/confirm-create",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "image/png",
                "extraction": None,
                "corrected_fields": {
                    "platform": "best_buy",
                    "category": "retail",
                    "product_name": "Hand Typed",
                    "price_paid": 12.0,
                    "purchase_date": now_iso,
                    "purchase_date_basis": "order_date",
                    "order_id": "M-1",
                },
            },
        )
        assert response.status_code == 200, response.text
        purchase = response.json()["purchase"]
        assert purchase["status"] == "monitoring"
        assert purchase["product_name"] == "Hand Typed"
        assert purchase["ingestion_source"] == "upload_image"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_confirm_create_missing_blob_returns_400(client: AsyncClient) -> None:
    """Blob gone at confirm (can't recompute hash) → 400 receipt_missing."""
    from src.services.receipts_storage import ReceiptObjectMissingError

    mock_db = _confirm_create_db()
    uploader = _confirm_create_uploader()
    uploader.download = AsyncMock(side_effect=ReceiptObjectMissingError("gone"))
    _set_overrides(mock_db, uploader, _publisher_mock())
    try:
        response = await client.post(
            "/api/v1/purchases/confirm-create",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
            },
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "receipt_missing"
        mock_db.upsert.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_limited_upload_reader_stops_after_size_limit() -> None:
    upload = _InfiniteChunkUpload(chunk_size=64 * 1024)

    with pytest.raises(ApiError) as exc_info:
        await purchases_route._read_limited_upload(upload)

    assert exc_info.value.code == "file_too_large"
    assert upload.read_calls == 161


def _positive_float_validation_error() -> ValidationError:
    try:
        TypeAdapter(Annotated[float, Field(gt=0)]).validate_python(-1)
    except ValidationError as exc:
        return exc
    raise AssertionError("expected validation error")


class _InfiniteChunkUpload:
    def __init__(self, *, chunk_size: int) -> None:
        self._chunk = b"x" * chunk_size
        self.read_calls = 0

    async def read(self, size: int) -> bytes:
        self.read_calls += 1
        assert size == purchases_route._UPLOAD_READ_CHUNK_BYTES
        return self._chunk


# ---------------------------------------------------------------------------
# GET /purchases/:id/receipt — proxy (ticket 5.14)
# ---------------------------------------------------------------------------


def _purchase_with_receipt(
    *,
    purchase_id: UUID = PURCHASE_ID,
    user_id: UUID = USER_ID,
    receipt_storage_url: str | None = "gs://test-bucket/receipts/u/p/x.pdf",
) -> Purchase:
    purchase = _purchase_fixture(purchase_id=purchase_id, user_id=user_id)
    # Mutate via model_copy so we don't rebuild every field.
    return purchase.model_copy(
        update={
            "receipt_storage_url": receipt_storage_url,
            "ingestion_source": "upload_pdf" if receipt_storage_url else "gmail",
        }
    )


@pytest.mark.asyncio
async def test_receipt_proxy_streams_owner_blob(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_with_receipt())
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    # The downloaded blob has the canonical PDF magic prefix; mime
    # comes back from GCS metadata, not sniffed.
    mock_uploader.bucket_name = "test-bucket"
    mock_uploader.download = AsyncMock(return_value=(b"%PDF-1.4 ...", "application/pdf"))
    _set_overrides(mock_db, mock_uploader)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}/receipt",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/pdf")
        assert response.content == b"%PDF-1.4 ..."
        # Service parses gs://test-bucket/receipts/u/p/x.pdf → blob_path
        # is everything after the bucket.
        mock_uploader.download.assert_awaited_once_with(blob_path="receipts/u/p/x.pdf")
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_receipt_proxy_returns_image_content_type(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(
        return_value=_purchase_with_receipt(
            receipt_storage_url="gs://test-bucket/receipts/u/p/x.jpg",
        )
    )
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.bucket_name = "test-bucket"
    mock_uploader.download = AsyncMock(return_value=(b"\xff\xd8\xff\xe0jpeg", "image/jpeg"))
    _set_overrides(mock_db, mock_uploader)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}/receipt",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("image/jpeg")
        assert response.content == b"\xff\xd8\xff\xe0jpeg"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_receipt_proxy_returns_404_for_non_owner(client: AsyncClient) -> None:
    other = _purchase_with_receipt(user_id=OTHER_USER_ID)
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=other)
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.bucket_name = "test-bucket"
    _set_overrides(mock_db, mock_uploader)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}/receipt",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
        # Never reach GCS for a doc we don't own — would leak existence
        # via a download-latency side channel otherwise.
        mock_uploader.download.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_receipt_proxy_returns_404_when_no_receipt_url(client: AsyncClient) -> None:
    purchase = _purchase_with_receipt(receipt_storage_url=None)
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.bucket_name = "test-bucket"
    _set_overrides(mock_db, mock_uploader)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}/receipt",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
        mock_uploader.download.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_receipt_proxy_returns_404_when_blob_missing(client: AsyncClient) -> None:
    from src.services.receipts_storage import ReceiptObjectMissingError

    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_with_receipt())
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.bucket_name = "test-bucket"
    mock_uploader.download = AsyncMock(side_effect=ReceiptObjectMissingError("missing"))
    _set_overrides(mock_db, mock_uploader)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}/receipt",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_receipt_proxy_returns_404_on_bucket_mismatch(client: AsyncClient) -> None:
    # Stored URI points at a bucket we don't manage — refuse the read
    # even though the SA might happen to have access. Defence-in-depth
    # against a bad write that aimed at another bucket.
    purchase = _purchase_with_receipt(
        receipt_storage_url="gs://other-bucket/some/object.pdf",
    )
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.bucket_name = "test-bucket"
    _set_overrides(mock_db, mock_uploader)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}/receipt",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
        mock_uploader.download.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_receipt_proxy_returns_404_on_malformed_gs_uri(client: AsyncClient) -> None:
    purchase = _purchase_with_receipt(receipt_storage_url="not-a-gs-uri")
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=purchase)
    mock_uploader = AsyncMock(spec=ReceiptsUploader)
    mock_uploader.bucket_name = "test-bucket"
    _set_overrides(mock_db, mock_uploader)
    try:
        response = await client.get(
            f"/api/v1/purchases/{PURCHASE_ID}/receipt",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
        mock_uploader.download.assert_not_awaited()
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# PATCH /purchases/{id} — BUG-19 remediation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_purchase_sets_product_url_and_clears_monitor_error(
    client: AsyncClient,
) -> None:
    """Happy path: PATCH sets product_url and clears any stale monitor error."""
    existing = _purchase_fixture(status="monitoring")
    updated_doc = _purchase_fixture(status="monitoring")
    object.__setattr__(updated_doc, "product_url", "https://www.bestbuy.com/site/foo.p")
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[existing, updated_doc])
    mock_db.partial_update = AsyncMock(return_value=True)
    _set_overrides(mock_db)
    try:
        response = await client.patch(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
            json={"product_url": "https://www.bestbuy.com/site/foo.p"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["purchase"]["product_url"] == "https://www.bestbuy.com/site/foo.p"
        updates = mock_db.partial_update.await_args.args[2]
        assert updates["product_url"] == "https://www.bestbuy.com/site/foo.p"
        # Stale failure trail is cleared in the same write.
        assert updates["last_monitor_error"] is None
        assert updates["last_monitor_error_at"] is None
        assert updates["last_monitor_error_code"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_patch_purchase_cross_user_404(client: AsyncClient) -> None:
    """Ownership check: another user's purchase 404s without writing."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(user_id=OTHER_USER_ID))
    mock_db.partial_update = AsyncMock()
    _set_overrides(mock_db)
    try:
        response = await client.patch(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
            json={"product_url": "https://example.com/foo"},
        )
        assert response.status_code == 404
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_patch_purchase_rejects_unknown_field(client: AsyncClient) -> None:
    """The PATCH body is a narrow Pydantic model — unknown keys are ignored
    by Pydantic (extra='ignore' by default), so confirm they never reach
    partial_update. The allowlist is enforced by the model, not a runtime
    check. (Pydantic v2 defaults — see field_set assertions below.)
    """
    existing = _purchase_fixture(status="monitoring")
    updated_doc = _purchase_fixture(status="monitoring")
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[existing, updated_doc])
    mock_db.partial_update = AsyncMock(return_value=True)
    _set_overrides(mock_db)
    try:
        response = await client.patch(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
            # `status` and `user_id` should be silently dropped, NOT written.
            json={
                "product_url": "https://example.com/x",
                "status": "dismissed",
                "user_id": str(OTHER_USER_ID),
            },
        )
        assert response.status_code == 200
        updates = mock_db.partial_update.await_args.args[2]
        assert "status" not in updates
        assert "user_id" not in updates
        # And the in-scope field still went through.
        assert updates["product_url"] == "https://example.com/x"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_patch_purchase_empty_body_422(client: AsyncClient) -> None:
    """Regression for CodeRabbit comment on PR #233: `product_url` is required
    (`Field(...)`) so an omitted-key body cannot silently wipe an existing URL.
    """
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock()
    mock_db.partial_update = AsyncMock()
    _set_overrides(mock_db)
    try:
        response = await client.patch(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
            json={},
        )
        assert response.status_code == 422
        mock_db.get_purchase.assert_not_awaited()
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_patch_purchase_explicit_null_accepted(client: AsyncClient) -> None:
    """A client may still pass `product_url: null` to intentionally clear the
    URL. Required-with-null-allowed is the documented shape of
    `UpdatePurchaseRequest`.
    """
    existing = _purchase_fixture(status="monitoring")
    updated_doc = _purchase_fixture(status="monitoring")
    object.__setattr__(updated_doc, "product_url", None)
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(side_effect=[existing, updated_doc])
    mock_db.partial_update = AsyncMock(return_value=True)
    _set_overrides(mock_db)
    try:
        response = await client.patch(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
            json={"product_url": None},
        )
        assert response.status_code == 200
        updates = mock_db.partial_update.await_args.args[2]
        assert updates["product_url"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_patch_purchase_missing_404(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=None)
    mock_db.partial_update = AsyncMock()
    _set_overrides(mock_db)
    try:
        response = await client.patch(
            f"/api/v1/purchases/{PURCHASE_ID}",
            headers={"Authorization": "Bearer valid-token"},
            json={"product_url": "https://example.com/foo"},
        )
        assert response.status_code == 404
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /purchases/{id}/stop-monitoring (BUG-85)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["monitoring", "monitoring_degraded"])
async def test_stop_monitoring_transitions_to_dismissed(client: AsyncClient, status: str) -> None:
    active = _purchase_fixture(status=status)
    dismissed = _purchase_fixture(status="dismissed")
    mock_db = AsyncMock(spec=MongoDBClient)
    # get_purchase: 1st for ownership check, 2nd for the post-update read.
    mock_db.get_purchase = AsyncMock(side_effect=[active, dismissed])
    mock_db.partial_update = AsyncMock(return_value=True)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/stop-monitoring",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["purchase"]["status"] == PurchaseStatus.DISMISSED
        updates = mock_db.partial_update.await_args.args[2]
        assert updates["status"] == PurchaseStatus.DISMISSED
        assert "_id" not in updates
    finally:
        _clear_overrides()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status",
    ["pending_confirmation", "pending_user_edit", "claimed", "expired", "refunded", "dismissed"],
)
async def test_stop_monitoring_rejects_wrong_status(client: AsyncClient, status: str) -> None:
    """Only the two live monitoring states can be stopped."""
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(status=status))
    mock_db.partial_update = AsyncMock()
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/stop-monitoring",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "invalid_status"
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_stop_monitoring_cross_user_404(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(user_id=OTHER_USER_ID))
    mock_db.partial_update = AsyncMock()
    _set_overrides(mock_db)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/stop-monitoring",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 404
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_stop_monitoring_invalid_uuid_400(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    _set_overrides(mock_db)
    try:
        response = await client.post(
            "/api/v1/purchases/not-a-uuid/stop-monitoring",
            headers={"Authorization": "Bearer valid-token"},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_purchase_id"
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /purchases/{id}/reupload-receipt (BUG-85)
# ---------------------------------------------------------------------------


def _reupload_db(*, status: str = "monitoring", dedup_hit: bool = False) -> AsyncMock:
    from claimit_mongodb_models import Policy

    active = _purchase_fixture(status=status)
    updated = _purchase_fixture(status="monitoring")
    mock_db = AsyncMock(spec=MongoDBClient)
    # 1st get_purchase = ownership/status guard, 2nd = post-update read.
    mock_db.get_purchase = AsyncMock(side_effect=[active, updated])
    mock_db.find_one = AsyncMock(
        return_value=_purchase_fixture(purchase_id=OTHER_USER_PURCHASE_ID, status="monitoring")
        if dedup_hit
        else None
    )
    mock_db.get_policy = AsyncMock(return_value=Policy.model_validate(_policy_fixture()))
    mock_db.partial_update = AsyncMock(return_value=True)
    return mock_db


@pytest.mark.asyncio
async def test_reupload_receipt_swaps_receipt_and_clears_errors(client: AsyncClient) -> None:
    mock_db = _reupload_db()
    _set_overrides(mock_db, _confirm_create_uploader())
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/reupload-receipt",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["purchase"]["status"] == "monitoring"
        updates = mock_db.partial_update.await_args.args[2]
        assert updates["receipt_storage_url"] == _RECEIPT_URL
        # Hash recomputed server-side from the downloaded blob, not trusted.
        assert (
            updates["receipt_hash"]
            == f"sha256:{hashlib.sha256(b'%PDF-1.4 receipt bytes').hexdigest()}"
        )
        assert updates["ingestion_source"] == "upload_pdf"
        assert updates["last_monitor_error"] is None
        assert updates["last_monitor_error_at"] is None
        assert updates["last_monitor_error_code"] is None
        assert "status" not in updates  # stays monitoring; never written here
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_reupload_receipt_applies_corrected_fields(client: AsyncClient) -> None:
    mock_db = _reupload_db()
    _set_overrides(mock_db, _confirm_create_uploader())
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/reupload-receipt",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(product_name="Wrong"),
                "corrected_fields": {"product_name": "Corrected Name", "price_paid": 99.5},
            },
        )
        assert response.status_code == 200, response.text
        updates = mock_db.partial_update.await_args.args[2]
        assert updates["product_name"] == "Corrected Name"
        assert updates["price_paid"] == 99.5
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_reupload_receipt_same_receipt_excludes_self_from_dedup(client: AsyncClient) -> None:
    """Re-uploading the identical receipt must not 409 against the purchase's
    own committed row — the dedup pre-check carries the self-exclusion."""
    mock_db = _reupload_db()
    _set_overrides(mock_db, _confirm_create_uploader())
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/reupload-receipt",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
            },
        )
        assert response.status_code == 200, response.text
        # Every dedup query excluded this purchase id.
        assert mock_db.find_one.await_count >= 1
        for call in mock_db.find_one.await_args_list:
            assert call.args[1]["_id"] == {"$ne": PURCHASE_ID}
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_reupload_receipt_duplicate_of_other_purchase_409(client: AsyncClient) -> None:
    mock_db = _reupload_db(dedup_hit=True)
    _set_overrides(mock_db, _confirm_create_uploader())
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/reupload-receipt",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
            },
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "duplicate"
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", ["pending_confirmation", "claimed", "dismissed", "expired", "refunded"]
)
async def test_reupload_receipt_rejects_wrong_status(client: AsyncClient, status: str) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(status=status))
    mock_db.partial_update = AsyncMock()
    uploader = _confirm_create_uploader()
    _set_overrides(mock_db, uploader)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/reupload-receipt",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
            },
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "invalid_status"
        mock_db.partial_update.assert_not_awaited()
        uploader.download.assert_not_awaited()  # guard is before any blob read
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_reupload_receipt_rejects_disallowed_field(client: AsyncClient) -> None:
    mock_db = _reupload_db()
    _set_overrides(mock_db, _confirm_create_uploader())
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/reupload-receipt",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
                "corrected_fields": {"status": "monitoring"},
            },
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_field"
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_reupload_receipt_rejects_foreign_receipt_url(client: AsyncClient) -> None:
    mock_db = _reupload_db()
    _set_overrides(mock_db, _confirm_create_uploader())
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/reupload-receipt",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": f"gs://test-bucket/receipts/{OTHER_USER_ID}/staging/x.pdf",
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
            },
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_field"
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_reupload_receipt_missing_blob_returns_400(client: AsyncClient) -> None:
    mock_db = _reupload_db()
    uploader = _confirm_create_uploader()
    uploader.download = AsyncMock(side_effect=ReceiptObjectMissingError("gone"))
    _set_overrides(mock_db, uploader)
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/reupload-receipt",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
            },
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "receipt_missing"
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_reupload_receipt_cross_user_404(client: AsyncClient) -> None:
    mock_db = AsyncMock(spec=MongoDBClient)
    mock_db.get_purchase = AsyncMock(return_value=_purchase_fixture(user_id=OTHER_USER_ID))
    mock_db.partial_update = AsyncMock()
    _set_overrides(mock_db, _confirm_create_uploader())
    try:
        response = await client.post(
            f"/api/v1/purchases/{PURCHASE_ID}/reupload-receipt",
            headers={"Authorization": "Bearer valid-token"},
            json={
                "storage_url": _RECEIPT_URL,
                "content_type": "application/pdf",
                "extraction": _extraction_fixture(),
            },
        )
        assert response.status_code == 404
        mock_db.partial_update.assert_not_awaited()
    finally:
        _clear_overrides()
