#!/usr/bin/env python3
"""Seed demo claims + linked purchases + price_history for tickets 5.4/5.6.

Why this exists:
    The /claims list view (ticket 5.4) needs a deterministic, varied data
    set against the real prod app DB so the demo session can show all
    three status_group chips populated, mixed platforms (logo grid),
    mixed categories (retail / airline / hotel), and outcome variety
    (approved / denied / expired / no_response). Live ingestion isn't
    reliable enough - emails come in unevenly and outcomes only fire on
    real merchant replies.

    Ticket 5.6 extends this to also seed production-shaped `price_history`
    rows for the same 9 purchases. The /purchases/:id chart needs real
    price-timeline rows to render meaningfully, but the price_history
    collection is empty in prod (monitor-agent only writes via real
    adapters which we don't run in dev). Each purchase gets a series of
    snapshots stepping from `price_paid` down to roughly
    `price_paid - linked_claim.claim_amount`, so the chart's "Drop
    detected" point lines up with the dollar amount of the linked claim.
    Shape is identical to what monitor-agent's `_persist_price_history`
    writes today (same enums, same fields, same nullability).

Idempotency:
    Every seeded doc carries `_seed = "5_4_demo"`. The script:
      1. delete_many({"_seed": "5_4_demo"}) on `claims` AND `purchases`
         AND `price_history` (prior run wiped, real data untouched);
      2. inserts the fresh fixture.
    Re-running converges on the same known state. Safe to ship in a
    runbook or chain into CI without drift.

Target:
    Connects to the SAME MongoDB Atlas cluster the API uses, default
    database "claimit" (the prod app DB). It does NOT touch
    `claimit_test` (that's reserved for `validate_claims_lookup.py`).

Usage:
    From the repo root:

        MONGODB_URI=$(gcloud secrets versions access latest \\
            --secret=mongodb-uri --project=claimit-beta) \\
            uv run --project apps/api-gateway \\
            python scripts/seed_claims_demo.py

    Exits 0 on success (insert + 2/2/5 verification), 1 on failure
    (missing demo user, count mismatch, missing enrichment).
"""

from __future__ import annotations

import asyncio
import os
import sys
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

# Make `src.services.*` importable from the api-gateway editable install when
# this script is invoked via `uv run --project apps/api-gateway python ...`.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api-gateway"))

from claimit_mongodb_models import MongoDBClient  # noqa: E402
from claimit_mongodb_models.claim import Claim, DraftVersion  # noqa: E402
from claimit_mongodb_models.enums import (  # noqa: E402
    Category,
    ClaimOutcome,
    ClaimType,
    DraftGeneratedBy,
    IngestionSource,
    Platform,
    PriceSource,
    PurchaseDateBasis,
    PurchaseStatus,
    SubmittedVia,
)
from claimit_mongodb_models.price_history import PriceHistory  # noqa: E402
from claimit_mongodb_models.purchase import ExtractionConfidence, Purchase  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from src.services import claims_service  # noqa: E402

DEMO_EMAIL = "claimitbeta@gmail.com"
SEED_MARKER = "5_4_demo"
PROD_DB = "claimit"

# SPECS tuple layout — POSITIONAL fields (12):
# (group, outcome, platform, category, product_name,
#  price_paid, claim_amount,
#  claim_type, member_tier_at_purchase,
#  window_offset_days, submitted_offset_days, resolved_offset_days)
#
# Why `price_paid` and `claim_amount` are SEPARATE columns (Bugbot
# NEW-2): the previous single column collapsed them, so each seeded
# purchase had `claim_amount == price_paid`, and the chart's lowest
# snapshot collapsed to `max(price_paid - claim_amount, 1.0) == 1.0`
# — every seeded chart dropped to $1, regardless of product.
# Splitting the column gives a realistic `low = price_paid -
# claim_amount` per purchase (verified individually below):
#
#   Sony WH-1000XM5    $399.99 - $50   = $349.99
#   Anker USB-C         $34.99 - $19   =  $15.99
#   Delta DL482        $452.00 - $120  = $332.00
#   Hilton NYC (HH)    $489.00 - $89   = $400.00  (member rate)
#   Dyson V8           $399.99 - $75   = $324.99
#   Instant Pot Duo     $89.00 - $22.5 =  $66.50
#   United UA221       $310.00 - $60   = $250.00
#   Marriott SF        $289.00 - $40   = $249.00
#   Southwest WN1100   $189.00 - $30   = $159.00
#
# Member-tier data (`member_tier_at_purchase` populated): one HOTEL
# purchase carries a tier so the detail page demonstrates the
# matching-tier chart line + member/non-member price rows. Hilton NYC
# qualifies because its linked claim is PENDING (neither denied nor
# no_response). Its `price_paid` is the member rate at booking; the
# adapter populates BOTH `price_member` and `price_non_member` on each
# snapshot so the details list surfaces both prices and the chart plots
# the member line.
#
# All offsets are relative to the claim's `updated_at` timestamp; rank
# index stretches updated_at backwards by minutes so the cursor sort is
# natural.
SPECS: list[
    tuple[
        str,
        ClaimOutcome,
        Platform,
        Category,
        str,
        float,  # price_paid
        float,  # claim_amount
        ClaimType,
        str | None,  # member_tier_at_purchase
        int,
        int | None,
        int | None,
    ]
] = [
    # PENDING group (DRAFT_PENDING)
    (
        "pending",
        ClaimOutcome.DRAFT_PENDING,
        Platform.BEST_BUY,
        Category.RETAIL,
        "Sony WH-1000XM5 Headphones",
        399.99,
        50.00,
        ClaimType.EMAIL,
        None,
        11,
        None,
        None,
    ),
    (
        "pending",
        ClaimOutcome.DRAFT_PENDING,
        Platform.AMAZON,
        Category.RETAIL,
        "Anker USB-C Charger",
        34.99,
        18.99,
        ClaimType.CHAT_SCRIPT,
        None,
        3,
        None,
        None,
    ),
    # IN_PROGRESS group (PENDING)
    (
        "in_progress",
        ClaimOutcome.PENDING,
        Platform.DELTA,
        Category.AIRLINE,
        "Delta DL482 fare adjustment",
        452.00,
        120.00,
        ClaimType.EMAIL,
        None,
        9,
        -2,
        None,
    ),
    (
        "in_progress",
        ClaimOutcome.PENDING,
        Platform.HILTON,
        Category.HOTEL,
        "Hilton NYC 2-night stay",
        489.00,
        89.00,
        ClaimType.EMAIL,
        "Hilton Honors",  # ← member tier (only seeded entry with one)
        14,
        -4,
        None,
    ),
    # RESOLVED group (APPROVED / DENIED / EXPIRED / NO_RESPONSE)
    (
        "resolved",
        ClaimOutcome.APPROVED,
        Platform.TARGET,
        Category.RETAIL,
        "Dyson V8 Vacuum",
        399.99,
        75.00,
        ClaimType.EMAIL,
        None,
        30,
        -10,
        -6,
    ),
    (
        "resolved",
        ClaimOutcome.APPROVED,
        Platform.WALMART,
        Category.RETAIL,
        "Instant Pot Duo 6qt",
        89.00,
        22.50,
        ClaimType.CHAT_SCRIPT,
        None,
        30,
        -7,
        -3,
    ),
    (
        "resolved",
        ClaimOutcome.DENIED,
        Platform.UNITED,
        Category.AIRLINE,
        "United UA221 fare",
        310.00,
        60.00,
        ClaimType.EMAIL,
        None,
        30,
        -8,
        -5,
    ),
    (
        "resolved",
        ClaimOutcome.EXPIRED,
        Platform.MARRIOTT,
        Category.HOTEL,
        "Marriott SF 1-night",
        289.00,
        40.00,
        ClaimType.EMAIL,
        None,
        -2,  # window_expires already in the past for EXPIRED
        None,
        None,
    ),
    (
        "resolved",
        ClaimOutcome.NO_RESPONSE,
        Platform.SOUTHWEST,
        Category.AIRLINE,
        "Southwest WN1100 fare",
        189.00,
        30.00,
        ClaimType.EMAIL,
        None,
        30,
        -20,
        None,
    ),
]

EXPECTED_COUNTS = {"pending": 2, "in_progress": 2, "resolved": 5}


def _confidence_one() -> ExtractionConfidence:
    """All-1.0 extraction confidence — these are seeded fixtures, not
    real ingest output, so confidence is unconditionally maximal."""
    return ExtractionConfidence(
        platform=1.0,
        price=1.0,
        overall_min=1.0,
        order_id=1.0,
        product_name=1.0,
        product_id=1.0,
        price_paid=1.0,
        purchase_date=1.0,
        category=1.0,
    )


def _purchase_date_basis(category: Category) -> PurchaseDateBasis:
    if category == Category.HOTEL:
        return PurchaseDateBasis.CHECK_IN_DATE
    return PurchaseDateBasis.ORDER_DATE


# Source per category — mirrors what the real monitor-agent adapters
# write today. retail goes through scraperapi, airline through amadeus,
# hotel through direct partner APIs. All three are canonical
# `PriceSource` enum values so the strict `PriceHistory` model validates
# the row on insert (no tolerant-write hack).
_SOURCE_BY_CATEGORY: dict[Category, PriceSource] = {
    Category.RETAIL: PriceSource.SCRAPERAPI,
    Category.AIRLINE: PriceSource.AMADEUS,
    Category.HOTEL: PriceSource.DIRECT,
}

# Number of price-history snapshots per purchase. Enough to make the
# chart line look like a real timeline (vs a two-point spike) without
# bloating the seeded fixture.
_PRICE_SNAPSHOTS_PER_PURCHASE = 8


def _build_price_history_series(
    *,
    purchase: Purchase,
    claim_amount: float,
    now: datetime,
) -> list[PriceHistory]:
    """Build a production-shaped price_history series for a seeded purchase.

    Series shape: starts at/near `purchase.price_paid`, eases down, and
    ends at roughly `price_paid - claim_amount` so the chart's "Drop
    detected" point is visually consistent with the linked claim's
    dollar amount. Timestamps are evenly spread from
    `purchase.ingested_at` to `now`, all comfortably within the 90-day
    `checked_at` TTL.

    Member-tier handling: if the purchase has `member_tier_at_purchase`
    set, `price_member` is the populated price and `member_tier_required`
    surfaces the tier name. Otherwise `price_non_member` is the populated
    price. The frontend's matching-tier picker plots whichever is
    populated, so this guarantees the chart picks the right line for
    every seeded purchase.
    """
    paid = purchase.price_paid
    # Floor the low price at $1.00 - never zero/negative (would look broken
    # in the chart's mini-stats and would conflict with a future strict
    # `gt=0` constraint on the price columns).
    low = max(paid - claim_amount, 1.0)
    snapshots = max(_PRICE_SNAPSHOTS_PER_PURCHASE, 2)
    # Series spans from ingested_at to now; the gradient is linear from
    # paid -> low. A real adapter would have noise, but a smooth curve
    # reads more clearly in the chart's calm styling.
    start = purchase.ingested_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    span = (now - start).total_seconds()
    if span <= 0:
        # Defensive: degenerate purchase_date == now. Spread over 8 days
        # backwards so the chart still has a timeline.
        start = now - timedelta(days=snapshots)
        span = (now - start).total_seconds()

    # `purchase.category` / `.platform` are already enum instances on the
    # strict `Purchase` model; pass through directly to PriceHistory.
    source = _SOURCE_BY_CATEGORY[purchase.category]
    member_tier = purchase.member_tier_at_purchase

    rows: list[PriceHistory] = []
    for i in range(snapshots):
        # `i==0` -> at paid; `i==snapshots-1` -> at low.
        progress = i / (snapshots - 1)
        price = round(paid - (paid - low) * progress, 2)
        checked_at = start + timedelta(seconds=span * progress)
        if member_tier:
            # Member purchase: the matching-tier price (plotted on the
            # chart) is the member rate; the standard rate sits ~10%
            # above and surfaces in the detail page's tooltip/list.
            # This matches the +10% non_member_price_at_purchase booked
            # on the parent purchase so the chart and the details list
            # tell a coherent story.
            price_member: float | None = price
            price_non_member: float | None = round(price * 1.10, 2)
            tier_label: str | None = member_tier
        else:
            price_member = None
            price_non_member = price
            tier_label = None
        rows.append(
            PriceHistory(
                _id=uuid4(),
                purchase_id=purchase.id,
                platform=purchase.platform,
                product_id=purchase.product_id,
                price_member=price_member,
                price_non_member=price_non_member,
                member_tier_required=tier_label,
                currency="USD",
                checked_at=checked_at,
                source=source,
                evidence_screenshot_url=(
                    f"https://example.com/evidence/{purchase.id.hex[:8]}-{i:02d}.png"
                ),
                raw_response_hash=f"demo-{purchase.id.hex[:8]}-{i:02d}",
                updated_at=checked_at,
            )
        )
    return rows


def _purchase_status_from_outcome(outcome: ClaimOutcome) -> PurchaseStatus:
    """Map a claim outcome to the corresponding purchase status.

    Ticket 5.4/5.6 seeded fixtures defaulted every purchase to
    `MONITORING` because PR1 only needed one detail page. PR2's list
    surface needs ALL eight `PurchaseStatus` values exercised so the
    `getListStatusBadge` mapping is visually proven against real data.

    Decision matrix (PR2 plan, including the resolved open question on
    DENIED → MONITORING):

      DRAFT_PENDING  → MONITORING  (claim drafted, not yet submitted;
                                    we're still actively watching)
      PENDING        → CLAIMED     (claim submitted, awaiting merchant)
      APPROVED       → REFUNDED    (refund received; stop watching)
      DENIED         → MONITORING  (merchant said no, BUT seed
                                    `window_expires` is in the future
                                    → window still open → keep
                                    watching. "Expired" would falsely
                                    imply the window closed.)
      EXPIRED        → EXPIRED     (window expired with no useful
                                    resolution — this is the canonical
                                    expired status)
      NO_RESPONSE    → MONITORING  (merchant ghost; window still open
                                    per seed offset, so we keep
                                    watching)

    `monitoring_degraded`, `pending_confirmation`, `pending_user_edit`,
    and `dismissed` are intentionally NOT covered here — they aren't
    natural outcomes of the seeded claim outcomes, and forcing them
    via this mapping would mis-represent the seed. They'll be
    exercised separately if/when those states need a demo fixture.
    """
    match outcome:
        case ClaimOutcome.DRAFT_PENDING:
            return PurchaseStatus.MONITORING
        case ClaimOutcome.PENDING:
            return PurchaseStatus.CLAIMED
        case ClaimOutcome.APPROVED:
            return PurchaseStatus.REFUNDED
        case ClaimOutcome.DENIED:
            return PurchaseStatus.MONITORING
        case ClaimOutcome.EXPIRED:
            return PurchaseStatus.EXPIRED
        case ClaimOutcome.NO_RESPONSE:
            return PurchaseStatus.MONITORING
        case ClaimOutcome.USER_CANCELLED:
            # User cancelled this claim. The PURCHASE itself may still
            # have an open window, so we keep monitoring it (consistent
            # with DENIED above). The /claims/[id] page maps this
            # outcome to the "expired" workflow status, but that
            # describes the CLAIM lifecycle, not the purchase one.
            return PurchaseStatus.MONITORING
        case ClaimOutcome.USER_SELF_SERVICE:
            # User resolved the refund themselves (outside our flow).
            # We stop tracking it for refund — match the APPROVED
            # surface so the user sees "refund received" rather than
            # an active monitoring state. Same UI signal as a
            # platform-approved claim from the user's perspective.
            return PurchaseStatus.REFUNDED
        case _:
            # Defensive: any future ClaimOutcome enum value added
            # without updating this function falls through to a calm
            # default rather than silently returning None (which would
            # violate the `-> PurchaseStatus` annotation and pass an
            # invalid value to the Pydantic Purchase model). Wildcard
            # case makes the match exhaustive at runtime; the explicit
            # member cases above stay for readability + grep-ability.
            return PurchaseStatus.MONITORING


def _build_purchase(
    *,
    user_id: UUID,
    platform: Platform,
    category: Category,
    product_name: str,
    price: float,
    window_expires: datetime,
    claim_type: ClaimType,
    ingested_at: datetime,
    status: PurchaseStatus = PurchaseStatus.MONITORING,
    ingestion_source: IngestionSource = IngestionSource.GMAIL,
    member_tier_at_purchase: str | None = None,
    non_member_price_at_purchase: float | None = None,
) -> Purchase:
    # When the purchase carries a member tier, `price_paid` IS the
    # member rate (what the user actually paid as a tier member); the
    # standard non-member rate (passed in explicitly) surfaces in the
    # detail page's "Original purchase details" list. The frontend's
    # matching-tier picker plots the member line because the snapshot
    # populates `price_member`.
    member_price = price if member_tier_at_purchase is not None else None
    purchase_id = uuid4()
    return Purchase(
        _id=purchase_id,
        user_id=user_id,
        platform=platform,
        category=category,
        product_name=product_name,
        product_id=f"demo-prod-{purchase_id.hex[:8]}",
        product_url=None,
        variant=None,
        fare_class=None,
        room_type=None,
        bed_type=None,
        rate_type=None,
        price_paid=price,
        member_price_at_purchase=member_price,
        non_member_price_at_purchase=non_member_price_at_purchase,
        currency="USD",
        purchase_date=ingested_at - timedelta(days=10),
        purchase_date_basis=_purchase_date_basis(category),
        window_expires=window_expires,
        order_id=f"demo-ord-{purchase_id.hex[:10]}",
        member_tier_at_purchase=member_tier_at_purchase,
        status=status,
        claim_type=claim_type,
        monitoring_cadence_minutes=1440,
        last_checked_at=None,
        ingested_at=ingested_at,
        ingestion_source=ingestion_source,
        receipt_storage_url=None,
        receipt_hash=None,
        format_hash=None,
        sender=None,
        extraction_confidence=_confidence_one(),
        updated_at=ingested_at,
    )


def _build_claim(
    *,
    user_id: UUID,
    purchase_id: UUID,
    platform: Platform,
    claim_amount: float,
    claim_type: ClaimType,
    outcome: ClaimOutcome,
    updated_at: datetime,
    submitted_at: datetime | None,
    resolved_at: datetime | None,
) -> Claim:
    submitted_via = None if outcome == ClaimOutcome.DRAFT_PENDING else SubmittedVia.GMAIL_SEND
    draft_text = "Demo claim draft (seeded for ticket 5.4)."
    return Claim(
        _id=uuid4(),
        purchase_id=purchase_id,
        user_id=user_id,
        platform=platform,
        claim_amount=claim_amount,
        currency="USD",
        claim_type=claim_type,
        draft_content=draft_text,
        draft_versions=[
            DraftVersion(
                version=1,
                content=draft_text,
                generated_by=DraftGeneratedBy.AGENT,
                at=updated_at,
            )
        ],
        redraft_count=0,
        policy_clause_cited="demo-clause",
        evidence_screenshot_url=None,
        send_override=None,
        submitted_at=submitted_at,
        submitted_via=submitted_via,
        outcome=outcome,
        outcome_note=None,
        denial_reason_extracted=None,
        resolved_at=resolved_at,
        trace_id=None,
        updated_at=updated_at,
    )


async def _resolve_demo_user_id(raw_db: object, email: str) -> UUID:
    """Look up the demo user by email and return its `_id` UUID.

    Raises a ``SystemExit`` (non-zero) with a clear message if the user
    isn't present — we never auto-create the demo account from this
    script.
    """
    user_doc = await raw_db["users"].find_one({"email": email})
    if user_doc is None:
        raise SystemExit(
            f"ERROR: demo user with email {email!r} not found in users "
            "collection. Aborting — seed_claims_demo does not auto-create "
            "the demo user."
        )
    uid = user_doc["_id"]
    return uid if isinstance(uid, UUID) else UUID(str(uid))


def _stamp(doc: dict[str, object], marker: str) -> dict[str, object]:
    """Tag every seeded doc with `_seed` so the next run's purge step can
    target only this fixture without touching any real user data."""
    doc["_seed"] = marker
    return doc


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
    # raw (for direct insert with the `_seed` marker, which is not a field on
    # the Pydantic Claim/Purchase models). Both share the same Atlas
    # connection string and target the prod app DB.
    db = MongoDBClient(uri=uri, database=PROD_DB)
    raw_client = AsyncIOMotorClient(uri, uuidRepresentation="standard")
    raw_db = raw_client[PROD_DB]

    try:
        user_id = await _resolve_demo_user_id(raw_db, DEMO_EMAIL)
        print(f"Resolved demo user_id = {user_id}")

        purged_claims = await raw_db["claims"].delete_many({"_seed": SEED_MARKER})
        purged_purchases = await raw_db["purchases"].delete_many({"_seed": SEED_MARKER})
        # Ticket 5.6: price_history rows are also seeded and need to be
        # purged on each run so they don't accumulate across runs (and so
        # the snapshot counts in the verification block stay deterministic).
        purged_price_history = await raw_db["price_history"].delete_many({"_seed": SEED_MARKER})
        print(
            f"Purged prior seed run: {purged_claims.deleted_count} claims, "
            f"{purged_purchases.deleted_count} purchases, "
            f"{purged_price_history.deleted_count} price_history rows "
            f"(db={PROD_DB!r})"
        )

        now = datetime.now(UTC)

        purchase_models: list[Purchase] = []
        claim_models: list[tuple[str, Claim]] = []
        for rank, spec in enumerate(SPECS):
            (
                group,
                outcome,
                platform,
                category,
                product_name,
                price_paid,
                claim_amount,
                claim_type,
                member_tier,
                window_offset_days,
                submitted_off_days,
                resolved_off_days,
            ) = spec
            # Stagger updated_at by minutes — newest first (rank 0).
            ts = now - timedelta(minutes=rank)
            window_expires = now + timedelta(days=window_offset_days)
            # When a purchase carries a member tier the "standard rate"
            # at booking sits ~10% above the member rate — a believable
            # member-vs-rack-rate gap that the detail page surfaces in
            # the "Original purchase details" list. Non-tier purchases
            # leave this None.
            non_member_price = round(price_paid * 1.10, 2) if member_tier is not None else None
            # PR2: derive purchase status from claim outcome so the list
            # surface exercises multiple `PurchaseStatus` values (not
            # uniformly MONITORING). See `_purchase_status_from_outcome`
            # for the decision matrix.
            purchase_status = _purchase_status_from_outcome(outcome)
            # PR2: vary `ingestion_source` on exactly two seeded
            # purchases so the list source-icon column shows non-Gmail
            # variety. Targets chosen by (platform, product_name) to
            # stay stable across SPECS reorderings: one UPLOAD_PDF
            # (Marriott SF — a hotel receipt scan) and one
            # UPLOAD_IMAGE (Anker USB-C — a retail snap). The other
            # 7 stay GMAIL (matches the default ingestion path).
            if platform == Platform.MARRIOTT:
                ingestion_source = IngestionSource.UPLOAD_PDF
            elif platform == Platform.AMAZON and product_name.startswith("Anker"):
                ingestion_source = IngestionSource.UPLOAD_IMAGE
            else:
                ingestion_source = IngestionSource.GMAIL
            purchase = _build_purchase(
                user_id=user_id,
                platform=platform,
                category=category,
                product_name=product_name,
                price=price_paid,
                window_expires=window_expires,
                claim_type=claim_type,
                ingested_at=ts,
                status=purchase_status,
                ingestion_source=ingestion_source,
                member_tier_at_purchase=member_tier,
                non_member_price_at_purchase=non_member_price,
            )
            submitted_at = (
                ts + timedelta(days=submitted_off_days) if submitted_off_days is not None else None
            )
            resolved_at = (
                ts + timedelta(days=resolved_off_days) if resolved_off_days is not None else None
            )
            claim = _build_claim(
                user_id=user_id,
                purchase_id=purchase.id,
                platform=platform,
                claim_amount=claim_amount,
                claim_type=claim_type,
                outcome=outcome,
                updated_at=ts,
                submitted_at=submitted_at,
                resolved_at=resolved_at,
            )
            purchase_models.append(purchase)
            claim_models.append((group, claim))

        # Build the per-purchase price_history series. The series is
        # anchored to the LINKED claim's amount so the chart's drop point
        # lines up with the claim card on the detail page.
        # `purchase_models` and `claim_models` are zipped 1:1 — see the
        # spec-iteration loop above.
        price_history_models: list[PriceHistory] = []
        for purchase, (_, claim) in zip(purchase_models, claim_models, strict=True):
            series = _build_price_history_series(
                purchase=purchase,
                claim_amount=claim.claim_amount,
                now=now,
            )
            price_history_models.extend(series)

        # `mode="python"` keeps native UUID/datetime; StrEnum subclasses str
        # so pymongo serialises enum values as plain strings on the wire.
        purchase_docs = [
            _stamp(p.model_dump(by_alias=True, mode="python"), SEED_MARKER) for p in purchase_models
        ]
        claim_docs = [
            _stamp(c.model_dump(by_alias=True, mode="python"), SEED_MARKER) for _, c in claim_models
        ]
        price_history_docs = [
            _stamp(p.model_dump(by_alias=True, mode="python"), SEED_MARKER)
            for p in price_history_models
        ]

        await raw_db["purchases"].insert_many(purchase_docs)
        await raw_db["claims"].insert_many(claim_docs)
        await raw_db["price_history"].insert_many(price_history_docs)

        group_counts = Counter(g for g, _ in claim_models)
        platforms_used = sorted({c.platform.value for _, c in claim_models})
        categories_used = sorted({p.category.value for p in purchase_models})
        print(
            f"\nInserted {len(claim_docs)} claims + {len(purchase_docs)} "
            f"purchases + {len(price_history_docs)} price_history rows "
            f"(_seed={SEED_MARKER!r})"
        )
        print(
            f"Per group: pending={group_counts['pending']}, "
            f"in_progress={group_counts['in_progress']}, "
            f"resolved={group_counts['resolved']}"
        )
        print(f"Platforms: {platforms_used}")
        print(f"Categories: {categories_used}")

        # ---- Verification ----
        # Two-stage check:
        #   (a) raw _seed-scoped count per status_group from the
        #       claims collection — answers "did the seeder write the
        #       right rows?" without depending on anything else in the
        #       user's history.
        #   (b) live claims_service.list_claims call — answers "does
        #       the API return them correctly with enrichment?". A
        #       ValidationError here flags pre-existing unmarked data
        #       that is broken under the current schema and would also
        #       break the live /claims page for this user.
        print("\nVerification — _seed-scoped raw counts:")
        all_ok = True
        for group, expected in EXPECTED_COUNTS.items():
            outcomes = claims_service.STATUS_GROUP_OUTCOMES[group]
            raw_count = await raw_db["claims"].count_documents(
                {
                    "user_id": user_id,
                    "_seed": SEED_MARKER,
                    "outcome": {"$in": [o.value for o in outcomes]},
                }
            )
            status = "OK" if raw_count == expected else "FAIL"
            print(
                f"  status_group={group:<11} → seeded={raw_count} (expect {expected})  [{status}]"
            )
            if raw_count != expected:
                all_ok = False

        print("\nVerification — calling claims_service.list_claims:")
        for group, expected in EXPECTED_COUNTS.items():
            try:
                result = await claims_service.list_claims(
                    db=db, user_id=user_id, status_group=group, limit=20
                )
            except ValidationError as exc:
                # Pre-existing unmarked claim with a now-invalid enum
                # value is corrupting this user's history. Surface it
                # rather than crash — the seeder did its job, but the
                # /claims demo page will hit the same error live.
                print(
                    f"  status_group={group:<11} → list_claims raised "
                    f"ValidationError (unmarked stale claim with invalid "
                    f"schema in user history): {exc.errors()[0]}"
                )
                all_ok = False
                continue
            claims_returned = result["claims"]
            assert isinstance(claims_returned, list)
            actual = len(claims_returned)
            enriched = sum(1 for c in claims_returned if c.get("product_name"))
            status = "OK" if actual == expected and enriched == actual else "FAIL"
            print(
                f"  status_group={group:<11} → got {actual} (expect {expected}); "
                f"enriched={enriched}/{actual}  [{status}]"
            )
            if actual != expected or enriched != actual:
                all_ok = False

        # ---- Verification (ticket 5.6) - price_history per purchase ----
        # Confirm each seeded purchase has the expected snapshot count
        # AND that the price coherence holds:
        #   low = price_paid - claim_amount   (Bugbot NEW-2 check)
        # i.e. the chart's drop magnitude must equal the linked claim's
        # claim_amount (modulo the $1 floor in _build_price_history_series).
        # Uses the live `find_price_history` helper so we also exercise
        # the (now read-tolerant) typed read path that the api-gateway
        # detail endpoint uses.
        claim_amount_by_purchase: dict[UUID, float] = {
            c.purchase_id: c.claim_amount for _, c in claim_models
        }
        print("\nVerification - price_history snapshots per purchase:")
        for purchase in purchase_models:
            rows = await db.find_price_history(purchase.id, limit=200)
            expected = _PRICE_SNAPSHOTS_PER_PURCHASE
            row_status = "OK" if len(rows) == expected else "FAIL"
            ca = claim_amount_by_purchase[purchase.id]
            computed_low = max(purchase.price_paid - ca, 1.0)
            tier = purchase.member_tier_at_purchase or "-"
            # Pick the plotted price field per matching-tier rule so the
            # printed low matches what the chart actually shows.
            plotted = [r.price_member if tier != "-" else r.price_non_member for r in rows]
            observed_low = min((p for p in plotted if p is not None), default=None)
            low_match = observed_low is not None and abs(observed_low - computed_low) < 0.01
            low_status = "OK" if low_match else "FAIL"
            print(
                f"  {purchase.product_name[:38]:<38} "
                f"({purchase.platform.value:<10}) "
                f"paid=${purchase.price_paid:>7.2f}  claim=${ca:>6.2f}  "
                f"low=${computed_low:>7.2f}  tier={tier:<14}  "
                f"snapshots={len(rows)}  [{row_status}/{low_status}]"
            )
            if len(rows) != expected or not low_match:
                all_ok = False

        # ---- Verification (PR2) - status + ingestion_source variety ----
        # PR2 split the seed across multiple PurchaseStatus values (was
        # uniformly MONITORING) and added 2 non-Gmail ingestion sources.
        # Print the per-purchase status + source so an operator can
        # eyeball the variety the list page now exercises. Also
        # asserts: exactly 2 non-Gmail sources and at least 2 distinct
        # statuses (the seed gets at least 3: MONITORING, CLAIMED,
        # REFUNDED, EXPIRED).
        print("\nVerification - purchase status + ingestion_source variety:")
        status_counts: Counter[str] = Counter()
        source_counts: Counter[str] = Counter()
        for purchase in purchase_models:
            status_counts[purchase.status.value] += 1
            source_counts[purchase.ingestion_source.value] += 1
            print(
                f"  {purchase.product_name[:38]:<38} "
                f"status={purchase.status.value:<12} "
                f"source={purchase.ingestion_source.value}"
            )
        non_gmail = sum(c for s, c in source_counts.items() if s != "gmail")
        print(f"  -> statuses: {dict(status_counts)}")
        print(f"  -> sources:  {dict(source_counts)}")
        variety_ok = non_gmail == 2 and len(status_counts) >= 2
        variety_label = "OK" if variety_ok else "FAIL"
        print(
            f"  -> [{variety_label}] non-gmail={non_gmail} (expect 2); "
            f"distinct_statuses={len(status_counts)} (expect ≥ 2)"
        )
        if not variety_ok:
            all_ok = False

        # ---- Stale-data probe ----
        # Any unmarked claim still under the demo user is reportable -
        # not deleted by this script, but flagged so the operator can
        # decide whether to clean it up.
        stale_count = await raw_db["claims"].count_documents(
            {"user_id": user_id, "_seed": {"$ne": SEED_MARKER}}
        )
        if stale_count > 0:
            print(
                f"\nWarning: {stale_count} UNMARKED claim(s) still present for the "
                f"demo user (no `_seed=={SEED_MARKER}` tag). These were not "
                "touched by this script."
            )

        # ---- Marker confirmation ----
        marker_count = await raw_db["claims"].count_documents(
            {"user_id": user_id, "_seed": SEED_MARKER}
        )
        purchase_marker_count = await raw_db["purchases"].count_documents(
            {"user_id": user_id, "_seed": SEED_MARKER}
        )
        price_history_marker_count = await raw_db["price_history"].count_documents(
            {"_seed": SEED_MARKER}
        )
        print(
            f"\n_seed marker confirmed on {marker_count}/{len(claim_docs)} claims, "
            f"{purchase_marker_count}/{len(purchase_docs)} purchases, "
            f"{price_history_marker_count}/{len(price_history_docs)} price_history rows."
        )
        if (
            marker_count != len(claim_docs)
            or purchase_marker_count != len(purchase_docs)
            or price_history_marker_count != len(price_history_docs)
        ):
            all_ok = False

        if all_ok:
            print("\nSEED OK")
            return 0
        print("\nSEED FAILED — see above.")
        return 1
    finally:
        await db.close()
        raw_client.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(_run()))
