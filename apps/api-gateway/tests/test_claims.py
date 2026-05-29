"""Tests for /api/v1/claims/* endpoints.

Pattern mirrors test_routes_notifications.py:
- AsyncMock(spec=MongoDBClient) with side_effect-driven find_one
- app.dependency_overrides for get_db + get_pubsub_publisher
- firebase_admin.auth.verify_id_token patched per request

Note on $lookup tests: db.aggregate is a pure AsyncMock — these tests
verify pipeline STRUCTURE (correct stages, correct $match shape, correct
$regex pattern, correct $project shape) but cannot exercise the actual
$lookup join semantics. End-to-end correctness of the `$lookup` against
real MongoDB is validated by scripts/validate_claims_lookup.py against
an Atlas dev cluster.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from claimit_mongodb_models import Claim, MongoDBClient, User
from httpx import AsyncClient
from src.deps import get_db, get_evidence_reader, get_pubsub_publisher
from src.main import app
from src.services.evidence_storage import EvidenceReader
from src.services.pubsub_publisher import PubSubPublisher

from ._fixtures import USER_FIXTURE, make_claim, make_purchase


def _stage(pipeline: list[dict[str, Any]], op: str) -> dict[str, Any] | None:
    """Return the FIRST stage whose top-level key is `op`, or None."""
    for stage in pipeline:
        if op in stage:
            return stage
    return None


def _stages(pipeline: list[dict[str, Any]], op: str) -> list[dict[str, Any]]:
    """Return ALL stages whose top-level key is `op`."""
    return [s for s in pipeline if op in s]


_FIREBASE_CLAIMS = {"uid": "test-uid", "email": "test@example.com"}
_USER_ID = "00000000-0000-0000-0000-000000000001"
_CLAIM_ID = "20000000-0000-0000-0000-000000000001"
_OTHER_CLAIM_ID = "20000000-0000-0000-0000-000000000099"


def _user_for_auth() -> User:
    return User.model_validate(USER_FIXTURE)


def _claim_doc(**overrides: object) -> dict[str, object]:
    return make_claim(user_id=_USER_ID, claim_id=_CLAIM_ID, **overrides)


def _override_publisher(publisher: PubSubPublisher) -> None:
    async def _override() -> PubSubPublisher:
        return publisher

    app.dependency_overrides[get_pubsub_publisher] = _override


def _override_db(db: MongoDBClient) -> None:
    async def _override() -> MongoDBClient:
        return db

    app.dependency_overrides[get_db] = _override


def _override_evidence_reader(reader: EvidenceReader) -> None:
    async def _override() -> EvidenceReader:
        return reader

    app.dependency_overrides[get_evidence_reader] = _override


def _clear_overrides() -> None:
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_pubsub_publisher, None)
    app.dependency_overrides.pop(get_evidence_reader, None)


# ---------------------------------------------------------------------------
# GET /claims
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_claims_empty(client: AsyncClient) -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get("/api/v1/claims", headers={"Authorization": "Bearer t"})
        assert response.status_code == 200
        payload = response.json()
        assert payload == {
            "claims": [],
            "next_cursor": None,
            "counts": {"all": 0, "pending": 0, "in_progress": 0, "resolved": 0},
        }
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_claims_with_filters_passes_them_to_aggregation(
    client: AsyncClient,
) -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[_claim_doc()])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/claims",
                params={"outcome": "approved", "platform": "best_buy", "limit": "5"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        # Inspect the aggregation $match the service built.
        # First call is the main pipeline, second is the count pipeline.
        pipeline = db.aggregate.await_args_list[0].args[1]
        match = _stage(pipeline, "$match")
        assert match is not None
        assert match["$match"]["user_id"] == UUID(_USER_ID)
        assert match["$match"]["outcome"] == "approved"
        assert match["$match"]["platform"] == "best_buy"
        limit_stage = _stage(pipeline, "$limit")
        assert limit_stage is not None and limit_stage["$limit"] == 6  # +1 for has-more probe
        assert response.json()["next_cursor"] is None
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# GET /claims — enrichment, status_group, search (5.4)
# ---------------------------------------------------------------------------


def _enriched_doc(**overrides: object) -> dict[str, object]:
    """Return a dict shaped like the post-$project aggregation output —
    Claim core fields + the three Purchase fields joined by $lookup."""
    base: dict[str, object] = {
        "_id": UUID(_CLAIM_ID),
        "updated_at": None,
        "purchase_id": UUID("30000000-0000-0000-0000-000000000001"),
        "user_id": UUID(_USER_ID),
        "platform": "best_buy",
        "claim_amount": 50.0,
        "currency": "USD",
        "claim_type": "email",
        "outcome": "draft_pending",
        "submitted_at": None,
        "resolved_at": None,
        "redraft_count": 0,
        "product_name": "Sony WH-1000XM5",
        "category": "retail",
        "window_expires": "2026-06-01T12:00:00Z",
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_list_claims_enriches_product_name_category_window(client: AsyncClient) -> None:
    """The $lookup-projected fields surface on the API response unchanged."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[_enriched_doc()])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get("/api/v1/claims", headers={"Authorization": "Bearer t"})
        assert response.status_code == 200
        row = response.json()["claims"][0]
        assert row["product_name"] == "Sony WH-1000XM5"
        assert row["category"] == "retail"
        assert row["window_expires"].startswith("2026-06-01")
        # Heavy fields stay off the wire.
        assert "draft_content" not in row
        assert "draft_versions" not in row
        # Pipeline shape: $match → $lookup(purchases) → $unwind → $sort → $limit → $project
        # First call is the main pipeline, second is the count pipeline.
        pipeline = db.aggregate.await_args_list[0].args[1]
        lookup = _stage(pipeline, "$lookup")
        assert lookup is not None
        assert lookup["$lookup"]["from"] == "purchases"
        assert lookup["$lookup"]["localField"] == "purchase_id"
        assert lookup["$lookup"]["foreignField"] == "_id"
        # Sub-pipeline projects only the 3 fields the list view needs.
        sub_proj = lookup["$lookup"]["pipeline"][0]["$project"]
        assert sub_proj == {"_id": 0, "product_name": 1, "category": 1, "window_expires": 1}
        unwind = _stage(pipeline, "$unwind")
        assert unwind is not None
        assert unwind["$unwind"]["preserveNullAndEmptyArrays"] is True
        proj = _stage(pipeline, "$project")
        assert proj is not None
        assert proj["$project"]["product_name"] == "$purchase.product_name"
        assert proj["$project"]["category"] == "$purchase.category"
        assert proj["$project"]["window_expires"] == "$purchase.window_expires"
    finally:
        _clear_overrides()


@pytest.mark.parametrize(
    ("group", "expected"),
    [
        ("pending", ["draft_pending"]),
        ("in_progress", ["pending"]),
        (
            "resolved",
            [
                "approved",
                "denied",
                "expired",
                "user_self_service",
                "user_cancelled",
                "no_response",
            ],
        ),
    ],
)
@pytest.mark.asyncio
async def test_list_claims_status_group_maps_to_outcome_in(
    client: AsyncClient, group: str, expected: list[str]
) -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/claims",
                params={"status_group": group},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        # First call is the main pipeline, second is the count pipeline.
        pipeline = db.aggregate.await_args_list[0].args[1]
        match = _stage(pipeline, "$match")["$match"]  # type: ignore[index]
        assert "outcome" in match
        assert match["outcome"] == {"$in": expected}
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_claims_outcome_wins_over_status_group(client: AsyncClient) -> None:
    """When both `outcome` and `status_group` are supplied, `outcome` wins
    (status_group is silently ignored)."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/claims",
                params={"outcome": "approved", "status_group": "pending"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        # First call is the main pipeline, second is the count pipeline.
        pipeline = db.aggregate.await_args_list[0].args[1]
        match = _stage(pipeline, "$match")["$match"]  # type: ignore[index]
        # outcome wins → exact string, no $in
        assert match["outcome"] == "approved"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_claims_q_matches_product_name(client: AsyncClient) -> None:
    """`q` lands as a post-lookup $match with $regex over platform AND
    purchase.product_name; user input is re.escape'd."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[_enriched_doc()])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/claims",
                params={"q": "sony"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        pipeline = db.aggregate.await_args.args[1]
        # Two $match stages now: pre-lookup (claim filters + cursor) and
        # post-lookup (q regex). The post-lookup one is the second $match.
        matches = _stages(pipeline, "$match")
        assert len(matches) == 2
        post_lookup = matches[1]["$match"]
        ors = post_lookup["$or"]
        assert {"platform": {"$regex": "sony", "$options": "i"}} in ors
        assert {"purchase.product_name": {"$regex": "sony", "$options": "i"}} in ors
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_claims_q_re_escapes_metacharacters(client: AsyncClient) -> None:
    """Regex metacharacters in `q` are escaped to literals — proves
    re.escape neutralizes ReDoS vectors and accidental wildcards."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/claims",
                params={"q": "(.*"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        pipeline = db.aggregate.await_args.args[1]
        post_lookup = _stages(pipeline, "$match")[1]["$match"]
        ors = post_lookup["$or"]
        # Each metachar in `(.*` ( "(", ".", "*" ) is escaped → literal.
        # `re.escape("(.*")` → `\(\.\*` on Python 3.7+.
        for clause in ors:
            ((_field, op_dict),) = clause.items()
            assert "\\(" in op_dict["$regex"]
            assert "\\." in op_dict["$regex"]
            assert "\\*" in op_dict["$regex"]
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_claims_q_too_long_rejected(client: AsyncClient) -> None:
    """Search input beyond Q_MAX_LENGTH is rejected with 400 at the route."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/claims",
                params={"q": "x" * 101},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "invalid_search_query"
        # Service must NOT have been called.
        db.aggregate.assert_not_called()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_claims_pagination_with_status_group(client: AsyncClient) -> None:
    """Cursor + status_group together: cursor predicate ANDs with the
    outcome $in inside the pre-lookup $match."""
    from src.middleware.pagination import encode_cursor

    cursor = encode_cursor(
        doc_id="20000000-0000-0000-0000-0000000000aa", sort_key="2026-05-15T12:00:00+00:00"
    )

    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/claims",
                params={"status_group": "resolved", "cursor": cursor},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        # First call is the main pipeline, second is the count pipeline.
        pipeline = db.aggregate.await_args_list[0].args[1]
        match = _stage(pipeline, "$match")["$match"]  # type: ignore[index]
        assert match["outcome"] == {
            "$in": [
                "approved",
                "denied",
                "expired",
                "user_self_service",
                "user_cancelled",
                "no_response",
            ]
        }
        assert "$or" in match
        assert len(match["$or"]) == 2
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_claims_orphan_claim_no_purchase(client: AsyncClient) -> None:
    """preserveNullAndEmptyArrays keeps an orphan claim in the result with
    null enrichment fields. ClaimListItem accepts and serializes the nulls."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    orphan = _enriched_doc(product_name=None, category=None, window_expires=None)
    db.aggregate = AsyncMock(return_value=[orphan])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get("/api/v1/claims", headers={"Authorization": "Bearer t"})
        assert response.status_code == 200
        row = response.json()["claims"][0]
        assert row["product_name"] is None
        assert row["category"] is None
        assert row["window_expires"] is None
        # Claim-side fields still populated.
        assert row["platform"] == "best_buy"
        assert row["outcome"] == "draft_pending"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_claims_rogue_enum_does_not_500(client: AsyncClient) -> None:
    """Read-tolerance contract (PR #142): an enriched aggregation row with
    a `claim_type` value no longer in the current ClaimType enum
    (e.g. legacy `price_drop_refund`) must surface verbatim in the
    response rather than 500ing `ClaimListItem.model_validate`. This is
    the exact rogue-claim shape from the PR #141 follow-up audit."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    rogue_row = _enriched_doc(claim_type="price_drop_refund", outcome="approved")
    db.aggregate = AsyncMock(return_value=[rogue_row])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get("/api/v1/claims", headers={"Authorization": "Bearer t"})
        assert response.status_code == 200
        row = response.json()["claims"][0]
        # Verbatim pass-through: not None, not coerced.
        assert row["claim_type"] == "price_drop_refund"
        assert row["outcome"] == "approved"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_claims_null_required_fields_do_not_500(client: AsyncClient) -> None:
    """Read-tolerance contract (PR #142): null `claim_amount` / `currency` /
    `redraft_count` (all required on the strict Claim) must surface as
    null on the wire instead of crashing the page."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    half_null = _enriched_doc(claim_amount=None, currency=None, redraft_count=None)
    db.aggregate = AsyncMock(return_value=[half_null])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get("/api/v1/claims", headers={"Authorization": "Bearer t"})
        assert response.status_code == 200
        row = response.json()["claims"][0]
        assert row["claim_amount"] is None
        assert row["currency"] is None
        assert row["redraft_count"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_list_claims_invalid_status_group_rejected(client: AsyncClient) -> None:
    """FastAPI's Literal validator rejects unknown status_group values
    before the service ever runs."""
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=lambda *_a, **_k: _user_for_auth())
    db.aggregate = AsyncMock(return_value=[])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                "/api/v1/claims",
                params={"status_group": "bogus"},
                headers={"Authorization": "Bearer t"},
            )
        # FastAPI returns 422 for query-param validation failures.
        assert response.status_code == 422
        db.aggregate.assert_not_called()
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# GET /claims/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_claim_detail_success(client: AsyncClient) -> None:
    from claimit_mongodb_models import Purchase

    claim = Claim.model_validate(_claim_doc())
    purchase = Purchase.model_validate(make_purchase(user_id=_USER_ID))

    db = AsyncMock(spec=MongoDBClient)
    # find_one calls: 1) auth User, 2) _load_owned_claim, 3) _find_evidence_snapshot.
    # The claim fixture has evidence_screenshot_url=None, so the snapshot
    # lookup short-circuits and the 3rd find_one is never invoked — match
    # that by NOT providing a 3rd side_effect value (extra ones would
    # raise StopIteration here only if hit).
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.get_purchase = AsyncMock(return_value=purchase)
    db.get_policy = AsyncMock(return_value=None)  # policy may legitimately be missing

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_CLAIM_ID}", headers={"Authorization": "Bearer t"}
            )
        assert response.status_code == 200
        payload = response.json()
        assert set(payload.keys()) == {
            "claim",
            "purchase",
            "policy",
            "evidence_url",
            "evidence_captured_at",
        }
        assert payload["claim"]["_id"] == _CLAIM_ID
        assert payload["purchase"]["_id"] == str(purchase.id)
        assert payload["policy"] is None
        # No evidence_screenshot_url on the claim → snapshot lookup
        # short-circuits and returns None → wire field is null.
        assert payload["evidence_captured_at"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_claim_detail_joins_price_history_for_evidence_captured_at(
    client: AsyncClient,
) -> None:
    """When the claim carries an `evidence_screenshot_url`, the gateway
    looks up the matching `PriceHistory` row on
    `(purchase_id, evidence_screenshot_url)` and surfaces its
    `checked_at` as a top-level `evidence_captured_at` (ticket 5.8 / WI-3).

    The frontend uses this as the real capture time instead of the
    `claim.updated_at` proxy used before this PR.
    """
    from claimit_mongodb_models import PriceHistory, Purchase

    evidence_url = "gs://test-evidence-bucket/evidence/best_buy/sku/2026-05-13.png"
    claim = Claim.model_validate(_claim_doc(evidence_screenshot_url=evidence_url))
    purchase = Purchase.model_validate(make_purchase(user_id=_USER_ID))
    snapshot = PriceHistory.model_validate(
        {
            "_id": "50000000-0000-0000-0000-000000000001",
            "updated_at": None,
            "purchase_id": str(claim.purchase_id),
            "platform": "best_buy",
            "product_id": "sku-123",
            "price_member": 199.99,
            "price_non_member": 249.99,
            "member_tier_required": None,
            "currency": "USD",
            "checked_at": "2026-05-13T20:00:00+00:00",
            "source": "scraperapi",
            "evidence_screenshot_url": evidence_url,
            "raw_response_hash": "abc",
        }
    )

    db = AsyncMock(spec=MongoDBClient)
    # find_one: 1) auth User, 2) _load_owned_claim, 3) _find_evidence_snapshot.
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim, snapshot])
    db.get_purchase = AsyncMock(return_value=purchase)
    db.get_policy = AsyncMock(return_value=None)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_CLAIM_ID}", headers={"Authorization": "Bearer t"}
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["evidence_url"] == evidence_url
        # Real PriceHistory checked_at threaded through.
        assert payload["evidence_captured_at"].startswith("2026-05-13T20:00")
        assert payload["evidence_captured_at"].endswith("Z")
        assert payload["claim"]["draft_versions"][0]["at"].endswith("Z")

        # Confirm the lookup filter shape — purchase_id + evidence_url
        # are both required to disambiguate when a purchase has many
        # snapshots.
        snapshot_call = db.find_one.await_args_list[2]
        coll, query = snapshot_call.args[0], snapshot_call.args[1]
        assert coll == "price_history"
        assert query == {
            "purchase_id": claim.purchase_id,
            "evidence_screenshot_url": evidence_url,
        }
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_claim_detail_evidence_captured_at_null_when_no_matching_snapshot(
    client: AsyncClient,
) -> None:
    """Legacy claim with an evidence link but NO matching `PriceHistory`
    row (pre-4.12 or rogue write) — the gateway must NOT 500; it
    surfaces `evidence_captured_at = null` and the frontend hides the
    captured-at pill rather than rendering a proxy timestamp.
    """
    from claimit_mongodb_models import Purchase

    evidence_url = "gs://test-evidence-bucket/evidence/orphan.png"
    claim = Claim.model_validate(_claim_doc(evidence_screenshot_url=evidence_url))
    purchase = Purchase.model_validate(make_purchase(user_id=_USER_ID))

    db = AsyncMock(spec=MongoDBClient)
    # find_one #3 returns None → no matching PriceHistory row.
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim, None])
    db.get_purchase = AsyncMock(return_value=purchase)
    db.get_policy = AsyncMock(return_value=None)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_CLAIM_ID}", headers={"Authorization": "Bearer t"}
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["evidence_url"] == evidence_url
        assert payload["evidence_captured_at"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_claim_detail_with_rogue_enum_does_not_500(client: AsyncClient) -> None:
    """Read-tolerance contract (PR #142): the detail endpoint must not 500
    when the loaded claim carries a legacy enum value (`claim_type` no
    longer in the current ClaimType enum). The tolerant variant absorbs
    the rogue string and the response surfaces it verbatim."""
    from claimit_mongodb_models import ClaimReadTolerant

    # Build a rogue claim by direct model_construct on the tolerant variant —
    # the strict Claim would refuse the rogue claim_type at construction.
    rogue = ClaimReadTolerant.model_construct(
        id=UUID(_CLAIM_ID),
        purchase_id=UUID("30000000-0000-0000-0000-000000000001"),
        user_id=UUID(_USER_ID),
        platform="best_buy",
        claim_amount=50.0,
        currency="USD",
        claim_type="price_drop_refund",  # rogue, no longer in ClaimType
        draft_content="hi",
        draft_versions=[],
        redraft_count=0,
        policy_clause_cited="",
        outcome="approved",
        submitted_at=None,
        resolved_at=None,
        evidence_screenshot_url=None,
        send_override=None,
        submitted_via=None,
        outcome_note=None,
        denial_reason_extracted=None,
        trace_id=None,
    )

    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), rogue])
    db.get_purchase = AsyncMock(return_value=None)
    db.get_policy = AsyncMock(return_value=None)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_CLAIM_ID}", headers={"Authorization": "Bearer t"}
            )
        assert response.status_code == 200
        payload = response.json()
        # Verbatim pass-through of the rogue enum.
        assert payload["claim"]["claim_type"] == "price_drop_refund"
        assert payload["claim"]["outcome"] == "approved"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_get_claim_detail_not_found(client: AsyncClient) -> None:
    db = AsyncMock(spec=MongoDBClient)
    # auth: User. service load: None → 404.
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), None])
    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_OTHER_CLAIM_ID}", headers={"Authorization": "Bearer t"}
            )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "claim_not_found"
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /claims/{id}/approve
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_approve_claim_success_publishes_event(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    # Approve now writes via partial_update (PR #142 — read-tolerance) so
    # legacy claims don't re-validate their full strict schema on every
    # write. Mock returns True (matched).
    db.partial_update = AsyncMock(return_value=True)

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(return_value="msg-id-123")

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={"send_override": "auto"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["claim_id"] == _CLAIM_ID
        assert payload["submitted_at"] is not None
        assert payload["submitted_at"].endswith("Z")

        # Verify the publish call: right topic, right event shape.
        publisher.publish.assert_awaited_once()
        topic, event = publisher.publish.await_args.args
        assert topic == "claim.approved"
        assert event["claim_id"] == _CLAIM_ID
        assert event["user_id"] == _USER_ID
        assert event["send_override"] == "auto"
        assert "event_id" in event
        assert "approved_at" in event

        # The approve write: only the mutated fields go through
        # partial_update (outcome, submitted_at, send_override).
        db.partial_update.assert_awaited_once()
        coll, _id, updates = db.partial_update.await_args.args[:3]
        assert coll == "claims"
        assert updates["outcome"] == "pending"
        assert updates["send_override"] == "auto"
        assert updates["submitted_at"] is not None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_claim_with_edited_draft_appends_version(client: AsyncClient) -> None:
    """The edited-draft approval path now uses `db.array_push` so existing
    `draft_versions[]` are NEVER read or re-validated on write — only the
    new element is. Asserts both halves: $push targets `draft_versions`
    with a strict `DraftVersion`, and the paired $set keeps the
    `draft_content == draft_versions[-1].content` invariant."""
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.array_push = AsyncMock(return_value=True)

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(return_value="msg-id")

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={"edited_draft_content": "My edited draft."},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200

        # The edited path uses array_push, NOT partial_update.
        db.array_push.assert_awaited_once()
        kwargs = db.array_push.await_args.kwargs
        args = db.array_push.await_args.args
        assert args[0] == "claims"
        assert kwargs["field"] == "draft_versions"
        # The new element is a strict DraftVersion (rejected at the
        # call site if any field is bad), not a dict — guarantees the
        # nested DraftVersion model gates new data.
        from claimit_mongodb_models import DraftVersion

        assert isinstance(kwargs["element"], DraftVersion)
        assert kwargs["element"].content == "My edited draft."
        assert kwargs["element"].generated_by.value == "user_edit"
        assert kwargs["element_model"] is DraftVersion
        # The paired $set: scalar mutations + draft_content (kept
        # equal to the just-pushed version's content).
        set_fields = kwargs["set_fields"]
        assert set_fields["draft_content"] == "My edited draft."
        assert set_fields["outcome"] == "pending"
        assert set_fields["submitted_at"] is not None
        # Invariant lock: draft_content matches the new version.
        assert set_fields["draft_content"] == kwargs["element"].content
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_with_edit_succeeds_on_legacy_rogue_generated_by(
    client: AsyncClient,
) -> None:
    """The principle locked in PR #144 (round 2): historical
    `draft_versions[].generated_by` values are NEVER re-validated on
    write. A claim whose existing v1 carries a value not in the current
    `DraftGeneratedBy` enum (here `"legacy_gen"`) must still be
    approve-with-edit-able. The mock `array_push` doesn't touch the
    historical entries — only the new v2 element is validated, against
    the strict `DraftVersion` model.
    """
    from claimit_mongodb_models import ClaimReadTolerant
    from claimit_mongodb_models.claim_read_tolerant import DraftVersionReadTolerant

    rogue = ClaimReadTolerant.model_construct(
        id=UUID(_CLAIM_ID),
        purchase_id=UUID("30000000-0000-0000-0000-000000000001"),
        user_id=UUID(_USER_ID),
        platform="best_buy",
        claim_amount=50.0,
        currency="USD",
        claim_type="email",
        draft_content="v1 body",
        # Tolerant variant carries a generated_by no longer in the
        # current enum — mirrors a long-lived claim that survived a
        # `DraftGeneratedBy` schema migration.
        draft_versions=[
            DraftVersionReadTolerant(
                version=1,
                content="v1 body",
                generated_by="legacy_gen",
                at=datetime(2025, 1, 1, tzinfo=UTC),
            )
        ],
        redraft_count=0,
        policy_clause_cited="",
        outcome="draft_pending",
        submitted_at=None,
        resolved_at=None,
        evidence_screenshot_url=None,
        send_override=None,
        submitted_via=None,
        outcome_note=None,
        denial_reason_extracted=None,
        trace_id=None,
    )

    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), rogue])
    db.array_push = AsyncMock(return_value=True)

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(return_value="msg-id")

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={"edited_draft_content": "My v2 body"},
                headers={"Authorization": "Bearer t"},
            )
        # Pre-fix this would have 500'd because the previous code dumped
        # the rogue v1 and re-validated it via partial_update(model=Claim).
        assert response.status_code == 200

        # The new v2 was pushed with version=2 (one more than the
        # legacy v1 the tolerant load saw).
        db.array_push.assert_awaited_once()
        new_element = db.array_push.await_args.kwargs["element"]
        assert new_element.version == 2
        assert new_element.content == "My v2 body"

        # Critical: the historical v1 is NOT in any write payload.
        # (`array_push` keeps it in-place via Mongo $push.)
        push_kwargs = db.array_push.await_args.kwargs
        # `set_fields` is the $set portion — must NOT contain
        # `draft_versions` (which would be a full-array overwrite).
        assert "draft_versions" not in push_kwargs["set_fields"]
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_rejects_invalid_new_generated_by(client: AsyncClient) -> None:
    """Strict-on-NEW-data still holds. A bad value on the NEW DraftVersion
    must be rejected — only HISTORICAL entries are exempt from
    re-validation. We can't reach the production code's
    `DraftGeneratedBy.USER_EDIT` line via the API (that's a hard-coded
    constant), so this test exercises `array_push` directly: a
    `DraftVersion` constructed with a rogue `generated_by` raises a
    `ValidationError` at the model boundary, before any write happens.
    """
    from claimit_mongodb_models import DraftVersion
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        DraftVersion(
            version=2,
            content="hi",
            generated_by="legacy_gen",  # type: ignore[arg-type]
            at=datetime(2026, 5, 20, tzinfo=UTC),
        )


@pytest.mark.asyncio
async def test_approve_rollback_outcome_on_publish_failure(client: AsyncClient) -> None:
    """If publish fails after the DB write, outcome must be rolled back to
    DRAFT_PENDING so a client retry can re-enter the approve path."""
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    # Two partial_update calls expected: (1) the approve write itself,
    # (2) the rollback after publish fails.
    db.partial_update = AsyncMock(return_value=True)

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(side_effect=RuntimeError("broker unreachable"))

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "submit_failed"
        assert db.partial_update.await_count == 2
        # First call: the approve write (outcome -> pending).
        first_call = db.partial_update.await_args_list[0]
        assert first_call.args[0] == "claims"
        assert first_call.args[2]["outcome"] == "pending"
        # Second call: the rollback (outcome -> draft_pending).
        rollback_call = db.partial_update.await_args_list[1]
        assert rollback_call.args[0] == "claims"
        assert rollback_call.args[2]["outcome"] == "draft_pending"
        assert rollback_call.args[2]["submitted_at"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_rollback_restores_queued_for_send_state(client: AsyncClient) -> None:
    """Regression for CodeRabbit MAJOR (PR #182): when approval starts from
    queued_for_send, a publish failure must restore the ORIGINAL outcome +
    its `auto_send_at`, not silently drop the claim to draft_pending."""
    original_auto_send_at = datetime(2030, 1, 1, 12, 0, 0, tzinfo=UTC)
    claim = Claim.model_validate(
        _claim_doc(
            outcome="queued_for_send",
            submitted_at=None,
            resolved_at=None,
            auto_send_at=original_auto_send_at,
            send_override="auto",
        )
    )
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(side_effect=RuntimeError("broker unreachable"))

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "submit_failed"
        assert db.partial_update.await_count == 2
        rollback_call = db.partial_update.await_args_list[1]
        rollback_updates = rollback_call.args[2]
        assert rollback_updates["outcome"] == "queued_for_send"
        assert rollback_updates["submitted_at"] is None
        assert rollback_updates["auto_send_at"] == original_auto_send_at
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_skips_notification_when_publish_fails(client: AsyncClient) -> None:
    """Regression for CodeRabbit MAJOR (PR #182): the claim_submitted
    notification must be emitted AFTER the publish so a publish failure
    doesn't surface a false 'Sent ✓' SSE event."""
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)
    db.upsert_notification_event = AsyncMock(return_value="notif-id")

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(side_effect=RuntimeError("broker unreachable"))

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 503
        db.upsert_notification_event.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_claim_rejects_non_draft_pending_state(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="pending"))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    publisher = AsyncMock(spec=PubSubPublisher)

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "claim_not_approvable"
        publisher.publish.assert_not_called()
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /claims/{id}/cancel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_claim_success_when_draft_pending(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/cancel",
                json={"reason": "Changed my mind"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        assert response.json() == {"success": True}
        db.partial_update.assert_awaited_once()
        updates = db.partial_update.await_args.args[2]
        assert updates["outcome"] == "user_cancelled"
        assert updates["outcome_note"] == "Changed my mind"
        assert updates["resolved_at"] is not None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_cancel_pending_claim_rejected_when_not_auto_send(client: AsyncClient) -> None:
    """A claim in PENDING with send_override != AUTO is past the cancel
    window even if submitted_at is recent — approval-mode sends are not
    held in a buffer, so they can't be retroactively cancelled."""
    from datetime import UTC, datetime

    now_iso = datetime.now(UTC).isoformat()
    claim = Claim.model_validate(
        _claim_doc(outcome="pending", submitted_at=now_iso, send_override=None)
    )
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/cancel",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "claim_not_cancellable"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_cancel_pending_auto_within_window_succeeds(client: AsyncClient) -> None:
    """PENDING + send_override=AUTO + submitted within 5min → cancellable."""
    from datetime import UTC, datetime

    now_iso = datetime.now(UTC).isoformat()
    claim = Claim.model_validate(
        _claim_doc(outcome="pending", submitted_at=now_iso, send_override="auto")
    )
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/cancel",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        assert response.json() == {"success": True}
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_event_payload_guards_null_uuids(client: AsyncClient) -> None:
    """Read-tolerance follow-up (PR #144 bot finding): a tolerant claim
    can carry `purchase_id=None` / `user_id=None` if the doc is degraded.
    `str(None)` produces the literal `"None"` — wrong wire shape (the
    downstream subscriber tries to parse `purchase_id` as a UUID). The
    approve event payload must emit a JSON null for null UUID fields,
    NOT `"None"`.

    Constructing via `ClaimReadTolerant` since the strict `Claim` would
    refuse `purchase_id=None` at validation. This mirrors what
    `_load_owned_claim` returns at runtime (same tolerant model).
    """
    from claimit_mongodb_models import ClaimReadTolerant

    rogue = ClaimReadTolerant.model_construct(
        id=UUID(_CLAIM_ID),
        purchase_id=None,
        user_id=None,
        platform="best_buy",
        claim_amount=50.0,
        currency="USD",
        claim_type="email",
        draft_content="hi",
        draft_versions=[],
        redraft_count=0,
        policy_clause_cited="",
        outcome="draft_pending",
        submitted_at=None,
        resolved_at=None,
        evidence_screenshot_url=None,
        send_override=None,
        submitted_via=None,
        outcome_note=None,
        denial_reason_extracted=None,
        trace_id=None,
    )

    db = AsyncMock(spec=MongoDBClient)
    # Two find_one calls: auth User → tolerant claim. Note: ownership
    # filter on _load_owned_claim is matched on user_id; we override it
    # to return the rogue claim regardless so the gate exercises the
    # null-UUID code path.
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), rogue])
    db.partial_update = AsyncMock(return_value=True)

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(return_value="msg-id")

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200

        publisher.publish.assert_awaited_once()
        _topic, event = publisher.publish.await_args.args
        # The bug being prevented: `str(None) == "None"`. The fix emits
        # JSON null instead.
        assert event["purchase_id"] is None, (
            f"null purchase_id must serialize as JSON null, got {event['purchase_id']!r}"
        )
        assert event["user_id"] is None, (
            f"null user_id must serialize as JSON null, got {event['user_id']!r}"
        )
        # claim_id comes from the request param, never from the loaded
        # tolerant doc, so it stays a string.
        assert event["claim_id"] == _CLAIM_ID
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_with_no_body_uses_defaults(client: AsyncClient) -> None:
    """POST /approve with no JSON body should succeed (all fields optional)."""
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(return_value="msg-id")

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            # No json= kwarg → no request body at all.
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_cancel_claim_rejected_after_resolved(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="approved", resolved_at="2026-05-10T12:00:00Z"))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/cancel",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "claim_not_cancellable"
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# POST /claims/{id}/outcome
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_record_outcome_approved_with_reclaimed_amount(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="pending", claim_amount=50.0))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/outcome",
                json={"outcome": "approved", "reclaimed_amount": 42.0},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["claim_id"] == _CLAIM_ID
        assert payload["outcome"] == "approved"
        assert payload["reclaimed_amount"] == 42.0
        assert payload["resolved_at"] is not None
        assert payload["outcome_note"] is None
        db.partial_update.assert_awaited_once()
        updates = db.partial_update.await_args.args[2]
        assert updates["outcome"] == "approved"
        assert updates["reclaimed_amount"] == 42.0
        assert updates["resolved_at"] is not None
        assert updates["outcome_note"] is None
        assert updates["denial_reason_extracted"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_record_outcome_approved_without_amount_falls_back(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="pending", claim_amount=50.0))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/outcome",
                json={"outcome": "approved"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["reclaimed_amount"] == 50.0
        updates = db.partial_update.await_args.args[2]
        assert updates["reclaimed_amount"] == 50.0
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_record_outcome_denied(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="pending"))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/outcome",
                json={"outcome": "denied", "denial_reason": "Window expired"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        payload = response.json()
        assert payload["outcome"] == "denied"
        assert payload["reclaimed_amount"] is None
        assert payload["outcome_note"] == "Window expired"
        updates = db.partial_update.await_args.args[2]
        assert updates["outcome"] == "denied"
        assert updates["reclaimed_amount"] is None
        assert updates["outcome_note"] == "Window expired"
        assert updates["denial_reason_extracted"] is None
        assert updates["resolved_at"] is not None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_record_outcome_rejects_draft_pending(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/outcome",
                json={"outcome": "approved"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "invalid_state"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_record_outcome_rejects_queued_for_send(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="queued_for_send", submitted_at=None))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/outcome",
                json={"outcome": "approved"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "invalid_state"
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_record_outcome_rejects_non_positive_reclaimed_amount(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="pending"))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/outcome",
                json={"outcome": "approved", "reclaimed_amount": 0},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_reclaimed_amount"
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# PUT /claims/{id}/edit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_edit_draft_appends_version(client: AsyncClient) -> None:
    """Edit-draft now uses `db.array_push` so historical draft_versions
    entries are NEVER read or rewritten on this write — only the new
    element is validated against the strict `DraftVersion` model."""
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    assert len(claim.draft_versions) == 1  # baseline

    db = AsyncMock(spec=MongoDBClient)
    # find_one is hit twice: (1) the auth user lookup, (2) _load_owned_claim.
    # get_claim is hit once at the end to reload the post-edit claim for the
    # response body.
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.array_push = AsyncMock(return_value=True)
    db.get_claim = AsyncMock(return_value=claim)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                f"/api/v1/claims/{_CLAIM_ID}/edit",
                json={"draft_content": "Edited body v2"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200

        db.array_push.assert_awaited_once()
        kwargs = db.array_push.await_args.kwargs
        args = db.array_push.await_args.args
        assert args[0] == "claims"
        assert kwargs["field"] == "draft_versions"
        # New element is a strict DraftVersion → enum validation on
        # generated_by happens at construction in the service layer.
        from claimit_mongodb_models import DraftVersion

        assert isinstance(kwargs["element"], DraftVersion)
        assert kwargs["element"].version == 2
        assert kwargs["element"].content == "Edited body v2"
        assert kwargs["element"].generated_by.value == "user_edit"
        # The paired $set keeps draft_content == new version content
        # atomically. `draft_versions` MUST NOT appear in set_fields —
        # that would be a full-array overwrite and re-validate
        # historical entries (the bug this fix prevents).
        set_fields = kwargs["set_fields"]
        assert set_fields == {"draft_content": "Edited body v2"}
        assert "draft_versions" not in set_fields
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_edit_draft_succeeds_on_legacy_rogue_generated_by(
    client: AsyncClient,
) -> None:
    """Counterpart to the approve-with-edit rogue test — same principle
    on the dedicated edit endpoint. A claim whose existing v1 has a
    `generated_by` value not in `DraftGeneratedBy` must still be
    edit-able. Pre-fix: the previous code dumped that v1 and writes
    the whole array via `partial_update(model=Claim)`, which
    re-validated v1 and 500'd. Post-fix: $push leaves v1 untouched.
    """
    from claimit_mongodb_models import ClaimReadTolerant
    from claimit_mongodb_models.claim_read_tolerant import DraftVersionReadTolerant

    rogue = ClaimReadTolerant.model_construct(
        id=UUID(_CLAIM_ID),
        purchase_id=UUID("30000000-0000-0000-0000-000000000001"),
        user_id=UUID(_USER_ID),
        platform="best_buy",
        claim_amount=50.0,
        currency="USD",
        claim_type="email",
        draft_content="v1 body",
        draft_versions=[
            DraftVersionReadTolerant(
                version=1,
                content="v1 body",
                generated_by="legacy_gen",  # not in DraftGeneratedBy
                at=datetime(2025, 1, 1, tzinfo=UTC),
            )
        ],
        redraft_count=0,
        policy_clause_cited="",
        outcome="draft_pending",
        submitted_at=None,
        resolved_at=None,
        evidence_screenshot_url=None,
        send_override=None,
        submitted_via=None,
        outcome_note=None,
        denial_reason_extracted=None,
        trace_id=None,
    )

    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), rogue])
    db.array_push = AsyncMock(return_value=True)
    db.get_claim = AsyncMock(return_value=rogue)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                f"/api/v1/claims/{_CLAIM_ID}/edit",
                json={"draft_content": "Edited v2"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        db.array_push.assert_awaited_once()
        kwargs = db.array_push.await_args.kwargs
        # New v2 → version 2, content matches.
        assert kwargs["element"].version == 2
        assert kwargs["element"].content == "Edited v2"
        # Critical: the rogue v1 is NOT in the write payload.
        assert "draft_versions" not in kwargs["set_fields"]
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_edit_draft_rejected_when_not_draft_pending(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="approved"))
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.put(
                f"/api/v1/claims/{_CLAIM_ID}/edit",
                json={"draft_content": "Should not save"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "claim_not_editable"
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# GET /claims/{id}/evidence — proxy (ticket 5.8)
# ---------------------------------------------------------------------------

_EVIDENCE_BUCKET = "test-evidence-bucket"


def _claim_with_evidence(
    *,
    user_id: str = _USER_ID,
    evidence_url: str | None = f"gs://{_EVIDENCE_BUCKET}/evidence/best_buy/sku123/2026.png",
    outcome: str = "draft_pending",
) -> Claim:
    # `_claim_doc` already pins user_id/claim_id; route ownership-mismatch
    # tests pass a different user via `make_claim` directly instead of
    # this helper.
    return Claim.model_validate(
        make_claim(
            user_id=user_id,
            claim_id=_CLAIM_ID,
            evidence_screenshot_url=evidence_url,
            outcome=outcome,
            submitted_at=None if outcome == "draft_pending" else "2026-05-10T12:00:00Z",
            resolved_at=None,
        )
    )


@pytest.mark.asyncio
async def test_evidence_proxy_streams_owner_blob(client: AsyncClient) -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), _claim_with_evidence()])
    reader = AsyncMock(spec=EvidenceReader)
    reader.bucket_name = _EVIDENCE_BUCKET
    reader.download = AsyncMock(return_value=(b"\x89PNG\r\n\x1a\nfake", "image/png"))

    _override_db(db)
    _override_evidence_reader(reader)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_CLAIM_ID}/evidence",
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("image/png")
        assert response.content == b"\x89PNG\r\n\x1a\nfake"
        # The service parses gs://{bucket}/evidence/best_buy/sku123/2026.png →
        # blob_path is everything after the bucket.
        reader.download.assert_awaited_once_with(blob_path="evidence/best_buy/sku123/2026.png")
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_evidence_proxy_returns_404_for_non_owner(client: AsyncClient) -> None:
    # _load_owned_claim filters on {_id, user_id} — a non-owner read yields
    # None, surfaced as 404 (`claim_not_found`). Mirrors the
    # `test_get_claim_detail_not_found` shape.
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), None])
    reader = AsyncMock(spec=EvidenceReader)
    reader.bucket_name = _EVIDENCE_BUCKET

    _override_db(db)
    _override_evidence_reader(reader)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_OTHER_CLAIM_ID}/evidence",
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 404
        # Never reach GCS for a doc we don't own — same leak-prevention
        # stance as the receipt proxy.
        reader.download.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_evidence_proxy_returns_404_when_no_evidence_url(client: AsyncClient) -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), _claim_with_evidence(evidence_url=None)])
    reader = AsyncMock(spec=EvidenceReader)
    reader.bucket_name = _EVIDENCE_BUCKET

    _override_db(db)
    _override_evidence_reader(reader)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_CLAIM_ID}/evidence",
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 404
        reader.download.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_evidence_proxy_returns_404_on_bucket_mismatch(client: AsyncClient) -> None:
    # Stored URI points at a bucket we don't manage — refuse the read
    # even though the SA might happen to have access. Defence-in-depth
    # against a bad write (H1: TF env wiring uses the bucket name from
    # google_storage_bucket.evidence.name so this should never fire in
    # prod, but the guard is the contract).
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(
        side_effect=[
            _user_for_auth(),
            _claim_with_evidence(evidence_url="gs://other-bucket/some/object.png"),
        ]
    )
    reader = AsyncMock(spec=EvidenceReader)
    reader.bucket_name = _EVIDENCE_BUCKET

    _override_db(db)
    _override_evidence_reader(reader)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_CLAIM_ID}/evidence",
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 404
        reader.download.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_evidence_proxy_returns_404_on_malformed_gs_uri(client: AsyncClient) -> None:
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(
        side_effect=[
            _user_for_auth(),
            _claim_with_evidence(evidence_url="not-a-gs-uri"),
        ]
    )
    reader = AsyncMock(spec=EvidenceReader)
    reader.bucket_name = _EVIDENCE_BUCKET

    _override_db(db)
    _override_evidence_reader(reader)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_CLAIM_ID}/evidence",
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 404
        reader.download.assert_not_awaited()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_evidence_proxy_returns_404_when_blob_missing(client: AsyncClient) -> None:
    from src.services.evidence_storage import EvidenceObjectMissingError

    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), _claim_with_evidence()])
    reader = AsyncMock(spec=EvidenceReader)
    reader.bucket_name = _EVIDENCE_BUCKET
    reader.download = AsyncMock(side_effect=EvidenceObjectMissingError("missing"))

    _override_db(db)
    _override_evidence_reader(reader)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.get(
                f"/api/v1/claims/{_CLAIM_ID}/evidence",
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 404
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# Ticket 5.15 / WI-6 — queued_for_send cancel + Send-now (approve) path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_claim_success_when_queued_for_send(client: AsyncClient) -> None:
    """A claim in QUEUED_FOR_SEND must be cancellable from the auto-send
    banner — the user has 5 minutes to abort the scheduler before it
    auto-submits. Before WI-6 this 409'd because the cancel gate only
    accepted DRAFT_PENDING + the within-auto-window PENDING case."""
    claim = Claim.model_validate(
        _claim_doc(
            outcome="queued_for_send",
            submitted_at=None,
            resolved_at=None,
        )
    )
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/cancel",
                json={"reason": "Changed my mind"},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        assert response.json() == {"success": True}
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_cancel_clears_auto_send_at(client: AsyncClient) -> None:
    """Cancelling a queued claim must clear `auto_send_at` so the WI-10
    Cloud Scheduler worker cannot pick the claim up after the cancel.
    The field stays cleared regardless of the pre-state (draft_pending
    or queued_for_send), keeping the post-cancel doc consistent."""
    claim = Claim.model_validate(
        _claim_doc(
            outcome="queued_for_send",
            submitted_at=None,
            resolved_at=None,
        )
    )
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)

    _override_db(db)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/cancel",
                json={"reason": "Stop the queue"},
                headers={"Authorization": "Bearer t"},
            )
        db.partial_update.assert_awaited_once()
        updates = db.partial_update.await_args.args[2]
        assert updates["outcome"] == "user_cancelled"
        # Critical: auto_send_at cleared explicitly so the scheduler
        # filter (auto_send_at <= now) drops this claim.
        assert updates["auto_send_at"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_claim_success_from_queued_for_send(client: AsyncClient) -> None:
    """The auto-send banner's "Send now" button reuses the approve
    endpoint (no dedicated route). Approve must accept a claim in
    QUEUED_FOR_SEND in addition to DRAFT_PENDING."""
    claim = Claim.model_validate(
        _claim_doc(
            outcome="queued_for_send",
            submitted_at=None,
            resolved_at=None,
        )
    )
    db = AsyncMock(spec=MongoDBClient)
    # find_one calls: 1) auth User, 2) _load_owned_claim,
    # 3) write_notification_event dedup lookup (H2 — claim_submitted).
    # The third call returns None so the helper writes a fresh
    # NotificationEvent via upsert_notification_event.
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim, None])
    db.partial_update = AsyncMock(return_value=True)
    db.upsert_notification_event = AsyncMock(return_value="notif-id")

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(return_value="msg-id")

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        assert response.json()["claim_id"] == _CLAIM_ID
        publisher.publish.assert_awaited_once()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_clears_auto_send_at(client: AsyncClient) -> None:
    """Send-now must clear `auto_send_at` so the scheduler cannot
    auto-submit the same claim a second time. Cleared on both the
    plain-approve path (partial_update) and the edited-draft path
    (array_push set_fields) — this test exercises the plain path; the
    edited path is covered by the existing
    test_approve_claim_with_edited_draft_appends_version test (now also
    asserts the clear via the set_fields snapshot below)."""
    claim = Claim.model_validate(
        _claim_doc(
            outcome="queued_for_send",
            submitted_at=None,
            resolved_at=None,
        )
    )
    db = AsyncMock(spec=MongoDBClient)
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim, None])
    db.partial_update = AsyncMock(return_value=True)
    db.upsert_notification_event = AsyncMock(return_value="notif-id")

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(return_value="msg-id")

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        updates = db.partial_update.await_args.args[2]
        assert updates["outcome"] == "pending"
        assert updates["submitted_at"] is not None
        # Critical: the queue marker is cleared so the WI-10 scheduler
        # filter (`auto_send_at <= now`) cannot pick the claim up
        # again. Same clear shape across draft_pending → pending and
        # queued_for_send → pending — explicit None either way.
        assert updates["auto_send_at"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_approve_writes_claim_submitted_notification(client: AsyncClient) -> None:
    """H2: approve must write a `claim_submitted` NotificationEvent so
    the dashboard auto-send banner gets the same event-driven Sent ✓
    signal whether submission came from the scheduler worker or from
    a user clicking Send-now. Before this fix, the Send-now path only
    published the `claim.approved` Pub/Sub (no SSE subscriber) and the
    banner would have depended solely on an FE-optimistic 0:00 flip.
    """
    claim = Claim.model_validate(
        _claim_doc(
            outcome="draft_pending",
            submitted_at=None,
            resolved_at=None,
        )
    )
    db = AsyncMock(spec=MongoDBClient)
    # find_one #3 returns None so the helper writes a fresh notification.
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim, None])
    db.partial_update = AsyncMock(return_value=True)
    db.upsert_notification_event = AsyncMock(return_value="notif-id")

    publisher = AsyncMock(spec=PubSubPublisher)
    publisher.publish = AsyncMock(return_value="msg-id")

    _override_db(db)
    _override_publisher(publisher)
    try:
        with patch("firebase_admin.auth.verify_id_token", return_value=_FIREBASE_CLAIMS):
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200

        # The helper does a dedup find_one then upserts. Verify it
        # got the right event_type + entity wiring; data carries the
        # claim_id / submitted_via passthrough / refund_amount.
        db.upsert_notification_event.assert_awaited_once()
        event_doc = db.upsert_notification_event.await_args.args[0]
        assert event_doc.event_type.value == "claim_submitted"
        assert event_doc.entity_type.value == "claim"
        assert str(event_doc.entity_id) == _CLAIM_ID
        assert event_doc.data["claim_id"] == _CLAIM_ID
        # The Pub/Sub publish is independent and still fires (claim.approved
        # topic; downstream Cloud Run subscriber is still 4.18 stub work).
        publisher.publish.assert_awaited_once()
    finally:
        _clear_overrides()
