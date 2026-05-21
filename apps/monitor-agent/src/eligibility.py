"""Eligibility validation rules engine (master doc §5.4 + §4 edge cases).

`validate_eligibility` decides whether a price drop is *claimable* against
the platform's policy. It is the gate between "we observed a lower price"
(ticket 3.10's `compare_prices`) and "create a claim draft" (ticket 3.12).

Defensive posture: when an adapter signal is unknown (`None`) we treat the
rule as "no evidence to reject on" and let the path pass. This avoids
silently rejecting legitimate drops just because the adapter hasn't
learned to detect bundles / sales / room type yet. Adapters add those
signals over time and the validator's behavior tightens with them.

Short-circuiting check order is cheapest-first (no DB / network / IO
required), and structured so each rule's failure surfaces a distinct
machine-readable `code` (mostly `DenialReason` values, with `other` for
the rejection paths the shared enum doesn't yet cover — see §3.11 plan
for the rationale).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from claimit_mongodb_models import DenialReason, Policy, Purchase

from .adapters.base import PriceSnapshot
from .comparison import PriceComparison

# Sale-event substrings that, when present in `policy.key_exclusions`,
# turn an `is_on_sale=True` snapshot into a rejection. Lower-cased
# substring match — generous on purpose so future key_exclusions entries
# (e.g. "summer doorbuster event") are also caught.
_SALE_EXCLUSION_MARKERS = (
    "clearance",
    "doorbuster",
    "black friday",
    "cyber monday",
    "anniversary sale",
    "final sale",
    "open-box",
)

# Fare-class substrings that mark an award/miles booking. Matches the
# wording airline confirmations actually use — we look for any of these
# as a substring of the lowercased fare_class string.
_AWARD_FARE_MARKERS = (
    "award",
    "miles",
    "rapid_rewards",
    "rapid rewards",
)


@dataclass(frozen=True)
class EligibilityResult:
    """Outcome of running the eligibility rules engine for one drop."""

    eligible: bool
    code: str | None
    reason: str | None


_ELIGIBLE = EligibilityResult(eligible=True, code=None, reason=None)


def _as_utc_aware(value: datetime) -> datetime:
    """Mirror `cron._as_utc_aware`: treat naive Mongo datetimes as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _reject(code: DenialReason | str, reason: str) -> EligibilityResult:
    code_str = code.value if isinstance(code, DenialReason) else code
    return EligibilityResult(eligible=False, code=code_str, reason=reason)


def _has_sale_exclusion(key_exclusions: list[str]) -> bool:
    blob = " ".join(key_exclusions).lower()
    return any(marker in blob for marker in _SALE_EXCLUSION_MARKERS)


def _mentions_basic_economy(key_exclusions: list[str]) -> bool:
    return any("basic economy" in entry.lower() for entry in key_exclusions)


def _is_award_fare_class(fare_class: str | None) -> bool:
    if not fare_class:
        return False
    lowered = fare_class.lower()
    return any(marker in lowered for marker in _AWARD_FARE_MARKERS)


def _is_basic_economy(fare_class: str | None) -> bool:
    if not fare_class:
        return False
    lowered = fare_class.lower()
    return "basic" in lowered and "economy" in lowered


def validate_eligibility(
    purchase: Purchase,
    policy: Policy,
    snapshot: PriceSnapshot,
    comparison: PriceComparison,
    *,
    now: datetime | None = None,
) -> EligibilityResult:
    """Decide whether `comparison` represents a claimable drop under `policy`.

    `purchase` may be a `PurchaseReadTolerant` at runtime — the cron pulls
    those — which is field-compatible with `Purchase` for everything we
    read here. Caller is responsible for ensuring the strict critical
    fields (`window_expires`, `category`, etc.) are non-null; the cron's
    `_is_degraded` gate handles that upstream.
    """
    if now is None:
        now = datetime.now(UTC)

    # 1. Policy must be active. `MongoDBClient.get_policy` already filters
    #    on `active=True`, but the validator is a pure function and can be
    #    called from other paths (replay tools, debugging scripts, future
    #    Assistant Agent explanations), so don't trust callers.
    if not policy.active:
        return _reject(DenialReason.OTHER, "platform_inactive")

    # 2. There must be a qualifying price drop. `compare_prices` already
    #    handles tier-match + drop > 0; reusing it here avoids duplicating
    #    that math and keeps the false-positive guard from 3.10 intact.
    if not comparison.is_eligible:
        return _reject(DenialReason.OTHER, "no_drop_or_tier_mismatch")

    # 3. Window not expired. `purchase.window_expires` is precomputed at
    #    ingest using the buyer's member tier (so Best Buy Plus members
    #    get the 60-day window encoded here, not 15). Naive datetimes
    #    coming from Mongo are treated as UTC.
    window_expires = _as_utc_aware(purchase.window_expires)
    if window_expires <= now:
        return _reject(DenialReason.WINDOW_EXPIRED, "window_expired")

    # 4. Drop type must match what the policy covers. Today snapshots are
    #    always own-platform, so this passes whenever the policy covers
    #    own drops. Walmart/Amazon (`active=False`) never reach this rule
    #    because of #1, but keep the check so any future policy that
    #    *opts out* of own-drop coverage (e.g. retailer discontinuing the
    #    program) is honored without code changes.
    if not policy.covers_own_drops:
        return _reject(DenialReason.OTHER, "own_drops_not_covered")

    # 5. Bundle exclusion. Fires only when the adapter reported a concrete
    #    `True`. `None` (unknown) passes — see module docstring.
    if policy.bundle_exclusions and snapshot.is_bundle is True:
        return _reject(DenialReason.BUNDLE, "bundle_excluded")

    # 6. On-sale exclusion. Same posture: only on a concrete `True`, and
    #    only when the policy's key_exclusions list mentions a sale
    #    event by name (clearance, doorbuster, Black Friday, etc.).
    if snapshot.is_on_sale is True and _has_sale_exclusion(policy.key_exclusions):
        return _reject(DenialReason.CLEARANCE, "on_sale_excluded")

    # 7. Pre-arrival hours (hotels only). Encoded as
    #    `pre_arrival_hours_required` — today only Wyndham=48 in the seed.
    #    Purchase.purchase_date holds the check-in datetime when
    #    `purchase_date_basis == "check_in_date"`, so we measure forward
    #    from `now`.
    if (
        policy.pre_arrival_hours_required is not None
        and purchase.category == "hotel"
        and purchase.purchase_date_basis == "check_in_date"
    ):
        check_in = _as_utc_aware(purchase.purchase_date)
        if check_in - now < timedelta(hours=policy.pre_arrival_hours_required):
            return _reject(DenialReason.OTHER, "pre_arrival_window_missed")

    # 8. Loyalty required. All five hotels in the current seed require
    #    this. `LoyaltyTier.NONE` serializes as the literal string "none"
    #    (see comparison.py for the same guard against treating that as
    #    a member tier).
    if policy.loyalty_required and (
        purchase.member_tier_at_purchase is None or purchase.member_tier_at_purchase == "none"
    ):
        return _reject(DenialReason.OTHER, "loyalty_required")

    # 9. Award ticket exclusion (airline). Heuristic on the fare_class
    #    string — the natural source signal from airline confirmations is
    #    the word "Award" or "Miles" appearing in the cabin description.
    #    `award_ticket_eligible is None` (retail/hotel) skips this check.
    if policy.award_ticket_eligible is False and _is_award_fare_class(purchase.fare_class):
        return _reject(DenialReason.OTHER, "award_ticket_excluded")

    # 10. Basic Economy exclusion (airline). United is the canonical case
    #     in the current seed; any future carrier with this exclusion in
    #     key_exclusions is automatically covered.
    if (
        purchase.category == "airline"
        and _is_basic_economy(purchase.fare_class)
        and _mentions_basic_economy(policy.key_exclusions)
    ):
        return _reject(DenialReason.BASIC_ECONOMY, "basic_economy_excluded")

    # 11. Fare-class match (airline). Only fires when the adapter has
    #     reported a concrete fare_class on the snapshot — today's
    #     adapters do not, so this is structural for future adapters
    #     that return airline cabin info from the competitor offering.
    if (
        purchase.category == "airline"
        and snapshot.fare_class is not None
        and purchase.fare_class is not None
        and snapshot.fare_class.lower() != purchase.fare_class.lower()
    ):
        return _reject(DenialReason.OTHER, "fare_class_mismatch")

    # 12. Identical-room (hotel). The strict identical-room rule from
    #     Marriott / Hyatt / Hilton et al. — same room_type, bed_type,
    #     and rate_type. Each comparison only fires when both sides
    #     report the field (i.e. snapshot supplies it). Today no hotel
    #     adapter does, so this rule is structural; it tightens
    #     automatically as adapters gain detection.
    if purchase.category == "hotel":
        for attr in ("room_type", "bed_type", "rate_type"):
            snap_value = getattr(snapshot, attr)
            purchase_value = getattr(purchase, attr)
            if (
                snap_value is not None
                and purchase_value is not None
                and snap_value.lower() != purchase_value.lower()
            ):
                return _reject(DenialReason.IDENTICAL_ROOM_MISMATCH, f"{attr}_mismatch")

    return _ELIGIBLE
