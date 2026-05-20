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

from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from claimit_mongodb_models import Claim, MongoDBClient, User
from httpx import AsyncClient
from src.deps import get_db, get_pubsub_publisher
from src.main import app
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


def _clear_overrides() -> None:
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_pubsub_publisher, None)


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
        assert payload == {"claims": [], "next_cursor": None}
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
        pipeline = db.aggregate.await_args.args[1]
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
        pipeline = db.aggregate.await_args.args[1]
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
        pipeline = db.aggregate.await_args.args[1]
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
        pipeline = db.aggregate.await_args.args[1]
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
        pipeline = db.aggregate.await_args.args[1]
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
    # 1st find_one: auth middleware (User). 2nd find_one: claims_service._load_owned_claim.
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
        assert set(payload.keys()) == {"claim", "purchase", "policy", "evidence_url"}
        assert payload["claim"]["_id"] == _CLAIM_ID
        assert payload["purchase"]["_id"] == str(purchase.id)
        assert payload["policy"] is None
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
            response = await client.post(
                f"/api/v1/claims/{_CLAIM_ID}/approve",
                json={"edited_draft_content": "My edited draft."},
                headers={"Authorization": "Bearer t"},
            )
        assert response.status_code == 200
        # Inspect the partial_update payload — should append a v2 draft
        # version and set draft_content in the same write.
        db.partial_update.assert_awaited_once()
        updates = db.partial_update.await_args.args[2]
        assert updates["draft_content"] == "My edited draft."
        assert len(updates["draft_versions"]) == 2
        assert updates["draft_versions"][-1]["content"] == "My edited draft."
        assert updates["draft_versions"][-1]["generated_by"] == "user_edit"
        # The draft_content == draft_versions[-1].content invariant is
        # now enforced PROGRAMMATICALLY by approve_claim rather than via
        # the @model_validator(after) on Claim — partial_update never
        # instantiates a full Claim. Asserting both fields stay
        # consistent in the same write payload locks in the invariant.
        assert updates["draft_content"] == updates["draft_versions"][-1]["content"]
    finally:
        _clear_overrides()


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
        assert response.status_code == 502
        assert response.json()["error"]["code"] == "publish_failed"
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
# PUT /claims/{id}/edit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_edit_draft_appends_version(client: AsyncClient) -> None:
    claim = Claim.model_validate(_claim_doc(outcome="draft_pending", submitted_at=None))
    assert len(claim.draft_versions) == 1  # baseline

    db = AsyncMock(spec=MongoDBClient)
    # find_one is hit twice: (1) the auth user lookup, (2) _load_owned_claim.
    # get_claim is hit once at the end to reload the post-edit claim for the
    # response body.
    db.find_one = AsyncMock(side_effect=[_user_for_auth(), claim])
    db.partial_update = AsyncMock(return_value=True)
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
        # Edit now writes via partial_update. Inspect the update payload —
        # the appended draft version + draft_content go in the same write
        # so the (draft_content == draft_versions[-1].content) invariant
        # is enforced programmatically.
        db.partial_update.assert_awaited_once()
        updates = db.partial_update.await_args.args[2]
        assert len(updates["draft_versions"]) == 2
        assert updates["draft_versions"][-1]["version"] == 2
        assert updates["draft_versions"][-1]["content"] == "Edited body v2"
        assert updates["draft_versions"][-1]["generated_by"] == "user_edit"
        assert updates["draft_content"] == "Edited body v2"
        assert updates["draft_content"] == updates["draft_versions"][-1]["content"]
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
