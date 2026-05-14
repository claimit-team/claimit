"""ClaimIt MongoDB Pydantic v2 models.

Mirrors the TypeScript definitions in this same directory (User.ts, Purchase.ts, ...).
Wire format (snake_case keys, ISO 8601 timestamps (datetime in Python, branded
ISODateString in TypeScript), `_id` field) is identical across both languages by design.
"""

from .base import BaseDocument
from .claim import Claim, DraftVersion
from .client import MongoDBClient
from .conversation import Conversation, ConversationMessage, ToolCall
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
    Platform,
    PriceSource,
    PurchaseDateBasis,
    PurchaseStatus,
    SendMode,
    SubmittedVia,
    SubscriptionTier,
)
from .policy import Policy
from .price_history import PriceHistory
from .purchase import ExtractionConfidence, Purchase
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
    "BaseDocument",
    "Category",
    "Claim",
    "ClaimOutcome",
    "ClaimType",
    "Conversation",
    "ConversationMessage",
    "ConversationMode",
    "ConversationStatus",
    "DefaultLocation",
    "DenialReason",
    "DraftGeneratedBy",
    "DraftVersion",
    "ExtractionConfidence",
    "GmailIntegration",
    "IngestionSkiplistEntry",
    "IngestionSource",
    "LoyaltyMembership",
    "LoyaltyTier",
    "MessageRole",
    "MongoDBClient",
    "NotificationPrefs",
    "Platform",
    "Policy",
    "PriceHistory",
    "PriceSource",
    "Purchase",
    "PurchaseDateBasis",
    "PurchaseStatus",
    "SendMode",
    "SendPreference",
    "SubmittedVia",
    "Subscription",
    "SubscriptionTier",
    "ToolCall",
    "User",
]
