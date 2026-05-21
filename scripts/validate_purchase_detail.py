#!/usr/bin/env python3
"""Atlas read-tolerance validation for the enriched purchase-detail endpoint (ticket 5.6).

Why this exists:
    The api-gateway unit tests use `unittest.mock.AsyncMock(spec=MongoDBClient)`
    so they can only assert pipeline SHAPE and serializer output on mocked
    data. They cannot exercise:

      - `find_price_history` against real BSON / native UUID coercion.
      - `list_claims_for_purchase`'s shared `$lookup` against real
        purchases docs (the join is also why `validate_claims_lookup.py`
        exists for the /claims list endpoint).
      - The full read-tolerance contract: rogue / null fields stored as
        BSON in Mongo, NOT as Pydantic-`model_construct` instances.

    This script mirrors `validate_claims_lookup.py`: spin up a throwaway
    user_id, raw-insert a purchase + price_history + claims with a
    rogue/null shape (the exact failure mode the tolerant variant was
    written for), call the real service, and assert the page-build
    end-to-end against Atlas.

Isolation:
    Same convention as validate_claims_lookup.py — all temp data lives on
    the SAME Atlas cluster but in the `claimit_test` database, so the
    demo `claimit` database is untouched. Cleanup deletes by the
    throwaway uuid4 user_id (and the purchase's uuid4 _id for the
    price_history rows) in a `finally` block, so a Ctrl-C still leaves
    only the docs from this run.

Usage:
    From the repo root:

        MONGODB_URI=$(gcloud secrets versions access latest \\
            --secret=mongodb-uri --project=claimit-beta) \\
            uv run --project apps/api-gateway \\
            python scripts/validate_purchase_detail.py

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

# Make `src.services.*` importable from the api-gateway editable install
# (matches the pattern from validate_claims_lookup.py / seed_claims_demo.py).
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api-gateway"))

from claimit_mongodb_models import MongoDBClient  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from src.services import purchases as purchases_service  # noqa: E402

TEST_DB = "claimit_test"


def _bson_default(o: object) -> object:
    """JSON encoder for datetime / UUID / Enum so a dump of the
    aggregation result doesn't crash on Pythonic-only types."""
    if isinstance(o, datetime):
        return o.isoformat()
    if isinstance(o, UUID):
        return str(o)
    if hasattr(o, "value"):
        return o.value
    return str(o)


def _print_scenario(label: str, payload: object) -> None:
    print(f"\n--- {label} ---")
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

    db = MongoDBClient(uri=uri, database=TEST_DB)
    raw_client = AsyncIOMotorClient(uri, uuidRepresentation="standard")
    raw_db = raw_client[TEST_DB]

    run_user_id = uuid4()
    purchase_id = uuid4()
    rogue_history_id_1 = uuid4()
    rogue_history_id_2 = uuid4()
    valid_history_id = uuid4()
    linked_claim_id = uuid4()
    rogue_claim_id = uuid4()  # carries a legacy `claim_type` not in current enum

    now = datetime.now(UTC)

    # ---- The "rogue Purchase" from PR #142 audit: category=None,
    # product_name=None, claim_type=None. Read-tolerant under
    # PurchaseReadTolerant; would 500 on the strict Purchase model.
    purchase_doc: dict[str, object] = {
        "_id": purchase_id,
        "updated_at": now,
        "user_id": run_user_id,
        "platform": "best_buy",
        "category": None,  # rogue
        "product_name": None,  # rogue
        "product_id": "BBY-987654",
        "product_url": None,
        "variant": None,
        "fare_class": None,
        "room_type": None,
        "bed_type": None,
        "rate_type": None,
        "price_paid": 299.99,
        "member_price_at_purchase": None,
        "non_member_price_at_purchase": None,
        "currency": "USD",
        "purchase_date": now - timedelta(days=10),
        "purchase_date_basis": "order_date",
        "window_expires": now + timedelta(days=11),
        "order_id": "ord-001",
        "member_tier_at_purchase": None,
        "status": "monitoring",
        "claim_type": None,  # rogue
        "monitoring_cadence_minutes": 360,
        "last_checked_at": None,
        "ingested_at": now - timedelta(days=10),
        "ingestion_source": "gmail",
        "receipt_storage_url": None,
        "receipt_hash": None,
        "format_hash": None,
        "sender": None,
        "extraction_confidence": {
            "platform": 1.0,
            "price": 1.0,
            "overall_min": 1.0,
        },
    }

    # price_history rows: one rogue + one with a null required field +
    # one strictly valid (the chart-plottable one).
    rogue_history_doc_1: dict[str, object] = {
        "_id": rogue_history_id_1,
        "updated_at": now,
        "purchase_id": purchase_id,
        "platform": None,  # rogue: null required platform
        "product_id": "BBY-987654",
        "price_member": None,
        "price_non_member": 280.00,
        "member_tier_required": None,
        "currency": "USD",
        "checked_at": now - timedelta(days=5),
        # "seeded" is NOT in the current PriceSource enum — exactly the
        # failure mode the tolerant variant was written for.
        "source": "seeded",
        "evidence_screenshot_url": None,
        "raw_response_hash": None,
    }
    rogue_history_doc_2: dict[str, object] = {
        "_id": rogue_history_id_2,
        "updated_at": now,
        "purchase_id": purchase_id,
        "platform": "best_buy",
        "product_id": "BBY-987654",
        # Null currency — strict model has Literal["USD"], tolerant
        # widens to str | None.
        "price_member": None,
        "price_non_member": 260.00,
        "member_tier_required": None,
        "currency": None,
        "checked_at": now - timedelta(days=3),
        "source": "scraperapi",
        "evidence_screenshot_url": None,
        "raw_response_hash": None,
    }
    valid_history_doc: dict[str, object] = {
        "_id": valid_history_id,
        "updated_at": now,
        "purchase_id": purchase_id,
        "platform": "best_buy",
        "product_id": "BBY-987654",
        "price_member": None,
        "price_non_member": 249.99,
        "member_tier_required": None,
        "currency": "USD",
        "checked_at": now - timedelta(days=1),
        "source": "scraperapi",
        "evidence_screenshot_url": None,
        "raw_response_hash": None,
    }

    # Claims: one valid linked + one rogue (legacy claim_type).
    base_claim: dict[str, object] = {
        "user_id": run_user_id,
        "purchase_id": purchase_id,
        "platform": "best_buy",
        "claim_amount": 50.0,
        "currency": "USD",
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
        "outcome": "draft_pending",
        "claim_type": "email",
        "updated_at": now,
    }
    rogue_claim = {
        **base_claim,
        "_id": rogue_claim_id,
        "outcome": "approved",
        "claim_type": "price_drop_refund",  # rogue (pre-2.2 schema scratch)
        "updated_at": now - timedelta(seconds=1),
        "resolved_at": now - timedelta(hours=1),
    }

    failures: list[str] = []

    try:
        await raw_db["purchases"].insert_one(purchase_doc)
        await raw_db["price_history"].insert_many(
            [rogue_history_doc_1, rogue_history_doc_2, valid_history_doc]
        )
        await raw_db["claims"].insert_many([linked_claim, rogue_claim])

        # ---- S1: enriched detail does NOT 500 even with rogue rows ----
        # The exact scenario the read-tolerance contract was written for:
        # a purchase with null required enums + price_history with a
        # rogue source + null platform + claims with a legacy claim_type.
        # Pre-fix, ANY of these alone would crash this call.
        purchase, price_history, claims = await purchases_service.get_purchase_detail(
            db=db, user_id=run_user_id, purchase_id=purchase_id
        )
        _print_scenario(
            "S1 / get_purchase_detail tolerant survives rogue rows",
            {
                "purchase_id": str(purchase.id),
                "purchase_category": purchase.category,
                "purchase_product_name": purchase.product_name,
                "purchase_claim_type": purchase.claim_type,
                "price_history_count": len(price_history),
                "claims_count": len(claims),
            },
        )
        try:
            # Purchase rogue values came back verbatim, not coerced.
            _expect(purchase.category is None, f"purchase.category = {purchase.category!r}")
            _expect(
                purchase.product_name is None,
                f"purchase.product_name = {purchase.product_name!r}",
            )
            _expect(purchase.claim_type is None, f"purchase.claim_type = {purchase.claim_type!r}")
            # All 3 price_history rows surfaced — tolerant read, no 500.
            _expect(
                len(price_history) == 3,
                f"expected 3 price_history rows, got {len(price_history)}",
            )
            # Rogue source surfaced verbatim.
            sources = sorted(p.source for p in price_history if p.source is not None)
            _expect(
                "seeded" in sources,
                f"expected 'seeded' (rogue source) in price_history sources, got {sources!r}",
            )
            # Null platform / null currency passed through verbatim.
            platforms = [p.platform for p in price_history]
            _expect(None in platforms, "expected null platform on at least one row")
            currencies = [p.currency for p in price_history]
            _expect(None in currencies, "expected null currency on at least one row")
            # checked_at sort is ASC (chart-friendly).
            checked_ats = [p.checked_at for p in price_history if p.checked_at is not None]
            _expect(
                all(checked_ats[i] <= checked_ats[i + 1] for i in range(len(checked_ats) - 1)),
                f"expected ASC checked_at order, got {checked_ats!r}",
            )
            # Both claims surfaced (rogue claim_type didn't crash the
            # list_claims_for_purchase aggregation).
            _expect(len(claims) == 2, f"expected 2 claims, got {len(claims)}")
            outcomes = sorted(c["outcome"] for c in claims if c["outcome"] is not None)
            _expect(
                outcomes == ["approved", "draft_pending"],
                f"unexpected outcomes: {outcomes!r}",
            )
            rogue_row = next(c for c in claims if c["_id"] == str(rogue_claim_id))
            _expect(
                rogue_row["claim_type"] == "price_drop_refund",
                f"rogue claim_type should surface verbatim, got {rogue_row['claim_type']!r}",
            )
            # Joined product_name on the claim is None because the
            # purchase has product_name=None (orphan-like tolerance).
            _expect(
                rogue_row["product_name"] is None,
                f"joined product_name = {rogue_row['product_name']!r}",
            )
            print("S1 PASS")
        except AssertionError as exc:
            failures.append(f"S1: {exc}")
            print(f"S1 FAIL: {exc}")

        # ---- S2: cross-user 404 ----
        # A different user_id must NOT see this purchase; the route's
        # ownership check raises ApiError("not_found", ...).
        other_user_id = uuid4()
        try:
            await purchases_service.get_purchase_detail(
                db=db, user_id=other_user_id, purchase_id=purchase_id
            )
            failures.append("S2: cross-user lookup did not raise")
            print("S2 FAIL: cross-user lookup did not raise")
        except Exception as exc:
            # purchases_service raises ApiError with code "not_found".
            # We expect any exception whose payload signals not-found.
            code = getattr(exc, "code", None)
            if code == "not_found":
                print("S2 PASS (cross-user lookup raised not_found)")
            else:
                failures.append(f"S2: unexpected exception {type(exc).__name__}({exc})")
                print(f"S2 FAIL: unexpected exception {type(exc).__name__}({exc})")

        # ---- S3: missing purchase 404 ----
        try:
            await purchases_service.get_purchase_detail(
                db=db, user_id=run_user_id, purchase_id=uuid4()
            )
            failures.append("S3: missing purchase lookup did not raise")
            print("S3 FAIL: missing purchase lookup did not raise")
        except Exception as exc:
            code = getattr(exc, "code", None)
            if code == "not_found":
                print("S3 PASS (missing purchase raised not_found)")
            else:
                failures.append(f"S3: unexpected exception {type(exc).__name__}({exc})")
                print(f"S3 FAIL: unexpected exception {type(exc).__name__}({exc})")

    finally:
        # Cleanup keyed on the throwaway user_id + purchase_id so a
        # mid-run Ctrl-C still leaves NO residue.
        purged_purchases = await raw_db["purchases"].delete_many({"user_id": run_user_id})
        purged_history = await raw_db["price_history"].delete_many({"purchase_id": purchase_id})
        purged_claims = await raw_db["claims"].delete_many({"user_id": run_user_id})
        print(
            f"\nCleanup: deleted {purged_purchases.deleted_count} purchases, "
            f"{purged_history.deleted_count} price_history rows, "
            f"{purged_claims.deleted_count} claims (db={TEST_DB})"
        )
        await db.close()
        raw_client.close()

    if failures:
        print(f"\n{len(failures)} SCENARIO(S) FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nALL 3 SCENARIOS PASSED (S1 enriched-tolerant, S2 cross-user, S3 missing)")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_run()))
