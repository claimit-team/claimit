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
    "notification_prefs": {"web_push": True, "email": True},
    "subscription": {"tier": "free", "trial_ends": None, "renewed_at": None},
    "created_at": "2024-01-01T00:00:00Z",
}
