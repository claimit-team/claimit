#!/usr/bin/env python3
"""Atlas $lookup validation for ticket 5.4 claims list enrichment.

Why this exists:
    The api-gateway test suite uses `unittest.mock.AsyncMock(spec=MongoDBClient)`
    — `db.aggregate` is a stub, so the unit tests can only assert pipeline
    SHAPE (correct stages, correct $regex, correct $project). They cannot
    exercise the real `$lookup`-with-subpipeline join semantics.
    `mongomock` has incomplete support for that stage shape too. So this
    script is the authoritative correctness check: it runs the live
    `claims_service.list_claims` against a real MongoDB Atlas dev cluster
    and asserts enrichment, status_group filtering, q regex matching, and
    the `re.escape` ReDoS guard.

Isolation:
    All temp data lives on the SAME Atlas cluster but in the `claimit_test`
    database, so the demo `claimit` database is never touched. Cleanup
    deletes by the throwaway uuid4 user_id from claims AND purchases in a
    `finally` block, so a Ctrl-C still leaves only the docs from this one
    run (and each run uses a fresh uuid4).

Usage:
    From the repo root:

        MONGODB_URI=$(gcloud secrets versions access latest \\
            --secret=mongodb-uri --project=claimit-beta) \\
            uv run --project apps/api-gateway \\
            python scripts/validate_claims_lookup.py

    Exits 0 on all-pass, 1 on any assertion failure or setup error.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

# Make `src.services.*` importable from the api-gateway editable install when
# this script is invoked via `uv run --project apps/api-gateway python ...`.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api-gateway"))

from claimit_mongodb_models import MongoDBClient  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from src.services import claims_service  # noqa: E402

TEST_DB = "claimit_test"


def _bson_default(o: object) -> object:
    """JSON encoder for datetime / UUID / Enum so `json.dumps` of the
    aggregation result doesn't crash on Pythonic-only types in the dump."""
    if isinstance(o, datetime):
        return o.isoformat()
    if isinstance(o, UUID):
        return str(o)
    if hasattr(o, "value"):
        return o.value
    return str(o)


def _print_scenario(label: str, payload: object) -> None:
    print(f"\n— {label} —")
    print(json.dumps(payload, default=_bson_default, indent=2))


def _expect(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


async def _run() -> int:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("ERROR: MONGODB_URI environment variable is required.", file=sys.stderr)
        print(
            "Source it via: "
            "MONGODB_URI=$(gcloud secrets versions access latest "
            "--secret=mongodb-uri --project=claimit-beta)",
            file=sys.stderr,
        )
        return 1

    # Two motor handles: one wrapped (for the real list_claims call) and one
    # raw (for direct insert/cleanup that bypasses Pydantic). Both share the
    # same Atlas connection string and target the isolated `claimit_test` DB.
    db = MongoDBClient(uri=uri, database=TEST_DB)
    raw_client = AsyncIOMotorClient(uri, uuidRepresentation="standard")
    raw_db = raw_client[TEST_DB]

    run_user_id = uuid4()
    purchase_id = uuid4()
    linked_claim_id = uuid4()
    orphan_claim_id = uuid4()
    bogus_purchase_id = uuid4()  # no Purchase doc with this id ever inserted

    now = datetime.now(UTC)

    # Raw insert — only the fields the $lookup sub-pipeline projects
    # (product_name, category, window_expires) are strictly needed for the
    # join to be observable. Other Purchase fields would be required if we
    # validated through Pydantic, but the aggregate read just returns what's
    # there.
    purchase_doc: dict[str, object] = {
        "_id": purchase_id,
        "updated_at": now,
        "user_id": run_user_id,
        "platform": "amazon",
        "product_name": "Test Sony Headphones",
        "category": "retail",
        "window_expires": now + timedelta(days=11),
    }

    base_claim: dict[str, object] = {
        "user_id": run_user_id,
        "platform": "amazon",
        "claim_amount": 50.0,
        "currency": "USD",
        "claim_type": "email",
        "draft_content": "test",
        "draft_versions": [{"version": 1, "content": "test", "generated_by": "agent", "at": now}],
        "redraft_count": 0,
        "policy_clause_cited": "test",
        "evidence_screenshot_url": None,
        "send_override": None,
        "submitted_at": None,
        "submitted_via": None,
        "outcome_note": None,
        "denial_reason_extracted": None,
        "resolved_at": None,
        "trace_id": None,
    }

    linked_claim = {
        **base_claim,
        "_id": linked_claim_id,
        "purchase_id": purchase_id,
        "outcome": "draft_pending",
        # Linked claim sorts first (newer updated_at).
        "updated_at": now,
    }
    orphan_claim = {
        **base_claim,
        "_id": orphan_claim_id,
        "purchase_id": bogus_purchase_id,
        "outcome": "pending",
        "updated_at": now - timedelta(seconds=1),
    }

    failures: list[str] = []

    try:
        await raw_db["purchases"].insert_one(purchase_doc)
        await raw_db["claims"].insert_one(linked_claim)
        await raw_db["claims"].insert_one(orphan_claim)

        # ---- S1: no filters → both claims, enrichment populated on linked ----
        s1 = await claims_service.list_claims(db=db, user_id=run_user_id)
        _print_scenario("S1 / no filters", s1)
        try:
            claims = s1["claims"]
            assert isinstance(claims, list)
            _expect(len(claims) == 2, f"expected 2 claims, got {len(claims)}")
            by_id = {c["_id"]: c for c in claims}
            linked_row = by_id[str(linked_claim_id)]
            orphan_row = by_id[str(orphan_claim_id)]
            _expect(
                linked_row["product_name"] == "Test Sony Headphones",
                f"linked product_name = {linked_row['product_name']!r}",
            )
            _expect(
                linked_row["category"] == "retail",
                f"linked category = {linked_row['category']!r}",
            )
            _expect(
                linked_row["window_expires"] is not None,
                "linked window_expires should be populated",
            )
            _expect(
                orphan_row["product_name"] is None,
                f"orphan product_name = {orphan_row['product_name']!r}",
            )
            _expect(
                orphan_row["category"] is None,
                f"orphan category = {orphan_row['category']!r}",
            )
            _expect(
                orphan_row["window_expires"] is None,
                "orphan window_expires should be None",
            )
            print("S1 PASS")
        except AssertionError as exc:
            failures.append(f"S1: {exc}")
            print(f"S1 FAIL: {exc}")

        # ---- S2: status_group=pending → only linked (DRAFT_PENDING) ----
        s2 = await claims_service.list_claims(db=db, user_id=run_user_id, status_group="pending")
        _print_scenario("S2 / status_group=pending", s2)
        try:
            claims = s2["claims"]
            assert isinstance(claims, list)
            _expect(len(claims) == 1, f"expected 1 claim, got {len(claims)}")
            _expect(
                claims[0]["_id"] == str(linked_claim_id),
                f"expected linked_claim_id, got {claims[0]['_id']}",
            )
            _expect(
                claims[0]["outcome"] == "draft_pending",
                f"outcome = {claims[0]['outcome']!r}",
            )
            print("S2 PASS")
        except AssertionError as exc:
            failures.append(f"S2: {exc}")
            print(f"S2 FAIL: {exc}")

        # ---- S3: status_group=in_progress → only orphan (PENDING) ----
        s3 = await claims_service.list_claims(
            db=db, user_id=run_user_id, status_group="in_progress"
        )
        _print_scenario("S3 / status_group=in_progress", s3)
        try:
            claims = s3["claims"]
            assert isinstance(claims, list)
            _expect(len(claims) == 1, f"expected 1 claim, got {len(claims)}")
            _expect(
                claims[0]["_id"] == str(orphan_claim_id),
                f"expected orphan_claim_id, got {claims[0]['_id']}",
            )
            _expect(
                claims[0]["product_name"] is None,
                "orphan product_name should be None",
            )
            print("S3 PASS")
        except AssertionError as exc:
            failures.append(f"S3: {exc}")
            print(f"S3 FAIL: {exc}")

        # ---- S4: q="sony" → linked claim via product_name ----
        s4 = await claims_service.list_claims(db=db, user_id=run_user_id, q="sony")
        _print_scenario("S4 / q=sony (product_name)", s4)
        try:
            claims = s4["claims"]
            assert isinstance(claims, list)
            _expect(len(claims) == 1, f"expected 1 claim, got {len(claims)}")
            _expect(
                claims[0]["_id"] == str(linked_claim_id),
                f"expected linked_claim_id, got {claims[0]['_id']}",
            )
            print("S4 PASS")
        except AssertionError as exc:
            failures.append(f"S4: {exc}")
            print(f"S4 FAIL: {exc}")

        # ---- S5: q="amazon" → both claims via platform field ----
        s5 = await claims_service.list_claims(db=db, user_id=run_user_id, q="amazon")
        _print_scenario("S5 / q=amazon (platform)", s5)
        try:
            claims = s5["claims"]
            assert isinstance(claims, list)
            _expect(len(claims) == 2, f"expected 2 claims, got {len(claims)}")
            print("S5 PASS")
        except AssertionError as exc:
            failures.append(f"S5: {exc}")
            print(f"S5 FAIL: {exc}")

        # ---- S6: q="(.*"  metachar → re.escape applied → zero matches ----
        s6 = await claims_service.list_claims(db=db, user_id=run_user_id, q="(.*")
        _print_scenario("S6 / q=(.* (regex metachar literal)", s6)
        try:
            claims = s6["claims"]
            assert isinstance(claims, list)
            _expect(
                len(claims) == 0,
                f"expected 0 claims (metachar should be literal), got {len(claims)}",
            )
            print("S6 PASS")
        except AssertionError as exc:
            failures.append(f"S6: {exc}")
            print(f"S6 FAIL: {exc}")

    finally:
        # Cleanup is keyed on the throwaway uuid4 user_id, so a Ctrl-C or
        # AssertionError mid-run still leaves NO residue.
        purged_claims = await raw_db["claims"].delete_many({"user_id": run_user_id})
        purged_purchases = await raw_db["purchases"].delete_many({"user_id": run_user_id})
        print(
            f"\nCleanup: deleted {purged_claims.deleted_count} claims, "
            f"{purged_purchases.deleted_count} purchases (db={TEST_DB})"
        )
        await db.close()
        raw_client.close()

    if failures:
        print(f"\n{len(failures)} SCENARIO(S) FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nALL 6 SCENARIOS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_run()))
