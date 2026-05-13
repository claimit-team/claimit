"""User collection — mirror of User.ts."""

from pydantic import BaseModel

from .base import BaseDocument
from .enums import SendMode, SubscriptionTier


class DefaultLocation(BaseModel):
    city: str
    state: str
    lat: float
    lon: float


class LoyaltyMembership(BaseModel):
    platform: str
    member_id: str
    tier: str


class GmailIntegration(BaseModel):
    connected: bool
    connected_at: str | None
    scopes_granted: list[str]
    refresh_token_ref: str | None
    watch_history_id: str | None
    watch_expires_at: str | None
    last_processed_message_id: str | None


class SendPreference(BaseModel):
    default_mode: SendMode
    auto_send_delay_seconds: int
    changed_at: str | None


class IngestionSkiplistEntry(BaseModel):
    sender: str
    format_hash: str
    added_at: str
    reason: str


class NotificationPrefs(BaseModel):
    web_push: bool
    email: bool


class Subscription(BaseModel):
    tier: SubscriptionTier
    trial_ends: str | None
    renewed_at: str | None


class User(BaseDocument):
    email: str
    name: str
    default_location: DefaultLocation
    loyalty_memberships: list[LoyaltyMembership]
    gmail_integration: GmailIntegration
    send_preference: SendPreference
    ingestion_skiplist: list[IngestionSkiplistEntry]
    notification_prefs: NotificationPrefs
    subscription: Subscription
    created_at: str
