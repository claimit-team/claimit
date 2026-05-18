"""Shared User document fixture for endpoint tests.

Used by tests/test_routes_auth.py and tests/test_routes_gmail.py to construct
a fully-populated User document compatible with the merged Pydantic model in
packages/shared/mongodb/claimit_mongodb_models/user.py. Tests that need a
variant (e.g. connected Gmail) deep-copy this dict and override fields.

The leading-underscore filename prefix marks the module as a private test
utility; pytest still collects sibling test_*.py files normally.
"""

from __future__ import annotations

USER_FIXTURE: dict[str, object] = {
    "_id": "00000000-0000-0000-0000-000000000001",
    "updated_at": None,
    "email": "test@example.com",
    "name": "Test User",
    "default_location": {
        "city": "San Francisco",
        "state": "CA",
        "lat": 37.7749,
        "lon": -122.4194,
    },
    "loyalty_memberships": [],
    "gmail_integration": {
        "connected": False,
        "connected_at": None,
        "connected_email": None,
        "scopes_granted": [],
        "refresh_token_ref": None,
        "watch_history_id": None,
        "watch_expires_at": None,
        "last_processed_message_id": None,
    },
    "send_preference": {
        "default_mode": "approval",
        "auto_send_delay_seconds": 300,
        "changed_at": None,
    },
    "ingestion_skiplist": [],
    "notification_prefs": {"web_push": True, "email": True, "muted_event_types": []},
    "subscription": {"tier": "free", "trial_ends": None, "renewed_at": None},
    "created_at": "2024-01-01T00:00:00Z",
}


# ---------------------------------------------------------------------------
# Claim + Purchase fixture builders for dashboard tests (6.6 PR A onward).
# Use the builder pattern instead of static dicts so each test can vary one
# field without copying the whole document.
# Defaults are valid for `Claim.model_validate` / `Purchase.model_validate`
# (StrEnum values are snake_case — see enums.py).
# ---------------------------------------------------------------------------


def make_claim(
    *,
    claim_id: str = "20000000-0000-0000-0000-000000000001",
    user_id: str = "00000000-0000-0000-0000-000000000001",
    purchase_id: str = "30000000-0000-0000-0000-000000000001",
    platform: str = "best_buy",
    claim_amount: float = 50.0,
    outcome: str = "approved",
    resolved_at: str | None = "2026-05-15T12:00:00Z",
    submitted_at: str | None = "2026-05-10T12:00:00Z",
    **overrides: object,
) -> dict[str, object]:
    """Build a Claim document dict; override any field via kwargs."""
    base: dict[str, object] = {
        "_id": claim_id,
        "updated_at": None,
        "purchase_id": purchase_id,
        "user_id": user_id,
        "platform": platform,
        "claim_amount": claim_amount,
        "currency": "USD",
        "claim_type": "email",
        "draft_content": "Test draft body.",
        "draft_versions": [
            {
                "version": 1,
                "content": "Test draft body.",
                "generated_by": "agent",
                "at": "2026-05-09T12:00:00Z",
            }
        ],
        "redraft_count": 0,
        "policy_clause_cited": "Section 3.2 of Best Buy price match policy.",
        "evidence_screenshot_url": None,
        "send_override": None,
        "submitted_at": submitted_at,
        "submitted_via": "gmail_send",
        "outcome": outcome,
        "outcome_note": None,
        "denial_reason_extracted": None,
        "resolved_at": resolved_at,
        "trace_id": None,
    }
    base.update(overrides)
    return base


def make_notification_event(
    *,
    notification_id: str = "40000000-0000-0000-0000-000000000001",
    user_id: str = "00000000-0000-0000-0000-000000000001",
    event_type: str = "price_dropped",
    entity_type: str | None = "claim",
    entity_id: str | None = "20000000-0000-0000-0000-000000000001",
    data: dict[str, object] | None = None,
    acknowledged: bool = False,
    acknowledged_at: str | None = None,
    surfaced_at: str | None = None,
    created_at: str = "2026-05-18T10:00:00+00:00",
    **overrides: object,
) -> dict[str, object]:
    """Build a NotificationEvent document dict; override any field via kwargs."""
    base: dict[str, object] = {
        "_id": notification_id,
        "updated_at": None,
        "user_id": user_id,
        "event_type": event_type,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "data": data
        if data is not None
        else {
            "platform": "best_buy",
            "refund_amount": 50.0,
            "currency": "USD",
        },
        "acknowledged": acknowledged,
        "acknowledged_at": acknowledged_at,
        "surfaced_at": surfaced_at,
        "created_at": created_at,
    }
    base.update(overrides)
    return base


def make_purchase(
    *,
    purchase_id: str = "30000000-0000-0000-0000-000000000001",
    user_id: str = "00000000-0000-0000-0000-000000000001",
    platform: str = "best_buy",
    status: str = "monitoring",
    **overrides: object,
) -> dict[str, object]:
    """Build a Purchase document dict; override any field via kwargs."""
    base: dict[str, object] = {
        "_id": purchase_id,
        "updated_at": None,
        "user_id": user_id,
        "platform": platform,
        "category": "retail",
        "product_name": "Test Product",
        "product_id": "TEST-SKU-1",
        "product_url": "https://example.com/product",
        "variant": None,
        "fare_class": None,
        "room_type": None,
        "bed_type": None,
        "rate_type": None,
        "price_paid": 100.0,
        "member_price_at_purchase": None,
        "non_member_price_at_purchase": None,
        "currency": "USD",
        "purchase_date": "2026-05-01T12:00:00Z",
        "purchase_date_basis": "order_date",
        "window_expires": "2026-05-16T12:00:00Z",
        "order_id": "BBY-987654",
        "member_tier_at_purchase": None,
        "status": status,
        "claim_type": "email",
        "monitoring_cadence_minutes": 360,
        "ingested_at": "2026-05-01T12:30:00Z",
        "ingestion_source": "gmail",
        "receipt_storage_url": "gs://test/receipt.pdf",
        "receipt_hash": "abc123",
        "extraction_confidence": {
            "platform": 0.99,
            "price": 0.97,
            "overall_min": 0.97,
        },
    }
    base.update(overrides)
    return base
