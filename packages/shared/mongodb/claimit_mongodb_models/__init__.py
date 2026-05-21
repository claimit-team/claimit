"""ClaimIt MongoDB Pydantic v2 models.

Mirrors the TypeScript definitions in this same directory (User.ts, Purchase.ts, ...).
Wire format (snake_case keys, ISO 8601 timestamps (datetime in Python, branded
ISODateString in TypeScript), `_id` field) is identical across both languages by design.
"""

from .base import BaseDocument
from .claim import Claim, DraftVersion, SelfEvalScore
from .claim_read_tolerant import ClaimReadTolerant, DraftVersionReadTolerant
from .client import MongoDBClient
from .conversation import Conversation, ConversationMessage, ToolCall
from .create_indexes import INDEX_DEFINITIONS, create_indexes
from .enums import (
    Category,
    ClaimOutcome,
    ClaimType,
    ConversationMode,
    ConversationStatus,
    DenialReason,
    DraftGeneratedBy,
    IngestionSource,
    LoyaltyTier,
    MessageRole,
    NotificationEntityType,
    NotificationEventType,
    Platform,
    PriceSource,
    PurchaseDateBasis,
    PurchaseStatus,
    SendMode,
    SubmittedVia,
    SubscriptionTier,
)
from .notification_event import NotificationEvent
from .notification_helpers import write_notification_event
from .policy import DEFAULT_CLAIM_WINDOW_DAYS, Policy, compute_window_days
from .price_history import PriceHistory
from .price_history_read_tolerant import PriceHistoryReadTolerant
from .purchase import ExtractionConfidence, Purchase
from .purchase_read_tolerant import (
    ExtractionConfidenceReadTolerant,
    PurchaseReadTolerant,
)
from .skiplist import (
    FORMAT_HASH_BODY_PREFIX_CHARS,
    SKIPLIST_MAX_ENTRIES,
    compute_format_hash,
    normalize_sender,
)
from .user import (
    DefaultLocation,
    GmailIntegration,
    IngestionSkiplistEntry,
    LoyaltyMembership,
    NotificationPrefs,
    SendPreference,
    Subscription,
    User,
)

__all__ = [
    "DEFAULT_CLAIM_WINDOW_DAYS",
    "FORMAT_HASH_BODY_PREFIX_CHARS",
    "INDEX_DEFINITIONS",
    "SKIPLIST_MAX_ENTRIES",
    "BaseDocument",
    "Category",
    "Claim",
    "ClaimOutcome",
    "ClaimReadTolerant",
    "ClaimType",
    "Conversation",
    "ConversationMessage",
    "ConversationMode",
    "ConversationStatus",
    "DefaultLocation",
    "DenialReason",
    "DraftGeneratedBy",
    "DraftVersion",
    "DraftVersionReadTolerant",
    "ExtractionConfidence",
    "ExtractionConfidenceReadTolerant",
    "GmailIntegration",
    "IngestionSkiplistEntry",
    "IngestionSource",
    "LoyaltyMembership",
    "LoyaltyTier",
    "MessageRole",
    "MongoDBClient",
    "NotificationEntityType",
    "NotificationEvent",
    "NotificationEventType",
    "NotificationPrefs",
    "Platform",
    "Policy",
    "PriceHistory",
    "PriceHistoryReadTolerant",
    "PriceSource",
    "Purchase",
    "PurchaseDateBasis",
    "PurchaseReadTolerant",
    "PurchaseStatus",
    "SelfEvalScore",
    "SendMode",
    "SendPreference",
    "SubmittedVia",
    "Subscription",
    "SubscriptionTier",
    "ToolCall",
    "User",
    "compute_format_hash",
    "compute_window_days",
    "create_indexes",
    "normalize_sender",
    "write_notification_event",
]
