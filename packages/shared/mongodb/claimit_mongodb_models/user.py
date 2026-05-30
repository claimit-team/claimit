"""User collection — mirror of User.ts."""

from datetime import datetime

from pydantic import BaseModel, Field

from .base import BaseDocument
from .enums import (
    LoyaltyTier,
    NotificationEventType,
    Platform,
    SendMode,
    SubscriptionTier,
)


class DefaultLocation(BaseModel):
    city: str
    state: str
    lat: float
    lon: float


class LoyaltyMembership(BaseModel):
    platform: Platform
    member_id: str
    tier: LoyaltyTier


class GmailIntegration(BaseModel):
    connected: bool
    connected_at: datetime | None
    connected_email: str | None = None
    scopes_granted: list[str]
    refresh_token_ref: str | None
    watch_history_id: str | None
    watch_expires_at: datetime | None
    last_processed_message_id: str | None
    # Ticket 4.15: surfaces the most recent watch-registration failure so
    # the settings UI can show a "reconnect needed" prompt. Defaults so
    # docs persisted before this field shipped validate without migration —
    # same backward-compat treatment as connected_email.
    watch_failed: bool = False
    watch_error_message: str | None = None
    # Ticket 4.17: cursor for the Gmail ingest pipeline. Advances per
    # successful push-batch; the next push uses this as the
    # `startHistoryId` for `users.history.list`. Distinct from
    # `watch_history_id` (which is the historyId the watch was first
    # registered against and never moves) so we don't conflate
    # "where the watch began" with "where ingest has reached". Default
    # None means: ingest has never advanced past the watch's start
    # point — the handler falls back to `watch_history_id` for the
    # first push.
    last_processed_history_id: str | None = None


class SendPreference(BaseModel):
    default_mode: SendMode
    auto_send_delay_seconds: int
    changed_at: datetime | None


class IngestionSkiplistEntry(BaseModel):
    sender: str
    format_hash: str
    added_at: datetime
    reason: str


class NotificationPrefs(BaseModel):
    web_push: bool
    email: bool
    muted_event_types: list[NotificationEventType] = Field(default_factory=list)


class Subscription(BaseModel):
    tier: SubscriptionTier
    trial_ends: datetime | None
    renewed_at: datetime | None


class User(BaseDocument):
    email: str
    name: str
    provider_avatar_url: str | None = None
    custom_avatar_url: str | None = None
    default_location: DefaultLocation
    loyalty_memberships: list[LoyaltyMembership]
    gmail_integration: GmailIntegration
    send_preference: SendPreference
    ingestion_skiplist: list[IngestionSkiplistEntry]
    notification_prefs: NotificationPrefs
    subscription: Subscription
    onboarded: bool = True
    created_at: datetime
