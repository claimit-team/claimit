"""Shared enums for ClaimIt MongoDB collections.

Mirrors the `as const` objects in `types.ts`. Each enum subclasses `str`
so values serialize as plain strings (snake_case) for JSON / BSON round-trips.
"""

from enum import StrEnum


class Category(StrEnum):
    RETAIL = "retail"
    AIRLINE = "airline"
    HOTEL = "hotel"


class Platform(StrEnum):
    BEST_BUY = "best_buy"
    AMAZON = "amazon"
    TARGET = "target"
    WALMART = "walmart"
    MARRIOTT = "marriott"
    HILTON = "hilton"
    DELTA = "delta"
    UNITED = "united"
    AMERICAN = "american"
    SOUTHWEST = "southwest"


class LoyaltyTier(StrEnum):
    MY_BEST_BUY = "my_best_buy"
    MY_BEST_BUY_PLUS = "my_best_buy_plus"
    MY_BEST_BUY_TOTAL = "my_best_buy_total"
    MARRIOTT_SILVER = "marriott_silver"
    MARRIOTT_GOLD = "marriott_gold"
    MARRIOTT_PLATINUM = "marriott_platinum"
    DELTA_SILVER = "delta_silver"
    DELTA_GOLD = "delta_gold"
    DELTA_PLATINUM = "delta_platinum"
    DELTA_DIAMOND = "delta_diamond"
    NONE = "none"


class ClaimType(StrEnum):
    EMAIL = "email"
    CHAT_SCRIPT = "chat_script"
    IN_STORE = "in_store"
    SELF_SERVICE = "self_service"


class SendMode(StrEnum):
    APPROVAL = "approval"
    AUTO = "auto"


class SubscriptionTier(StrEnum):
    TRIAL = "trial"
    FREE = "free"
    PRO = "pro"
    FAMILY = "family"


class PurchaseDateBasis(StrEnum):
    ORDER_DATE = "order_date"
    SHIP_DATE = "ship_date"
    PICKUP_DATE = "pickup_date"
    CHECK_IN_DATE = "check_in_date"


class PurchaseStatus(StrEnum):
    PENDING_CONFIRMATION = "pending_confirmation"
    PENDING_USER_EDIT = "pending_user_edit"
    MONITORING = "monitoring"
    MONITORING_DEGRADED = "monitoring_degraded"
    CLAIMED = "claimed"
    EXPIRED = "expired"
    REFUNDED = "refunded"
    DISMISSED = "dismissed"


class IngestionSource(StrEnum):
    GMAIL = "gmail"
    UPLOAD_PDF = "upload_pdf"
    UPLOAD_IMAGE = "upload_image"


class PriceSource(StrEnum):
    KEEPA = "keepa"
    SCRAPERAPI = "scraperapi"
    APIFY = "apify"
    AMADEUS = "amadeus"
    DIRECT = "direct"


class DraftGeneratedBy(StrEnum):
    AGENT = "agent"
    USER_EDIT = "user_edit"
    ASSISTANT_REDRAFT = "assistant_redraft"


class SubmittedVia(StrEnum):
    GMAIL_SEND = "gmail_send"
    SENDGRID_FALLBACK = "sendgrid_fallback"
    CLIPBOARD = "clipboard"
    IN_STORE_PRINT = "in_store_print"
    SELF_SERVICE_LINK = "self_service_link"


class ClaimOutcome(StrEnum):
    DRAFT_PENDING = "draft_pending"
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    EXPIRED = "expired"
    USER_SELF_SERVICE = "user_self_service"
    USER_CANCELLED = "user_cancelled"
    NO_RESPONSE = "no_response"
    # Read-tolerance only as of ticket 5.15 (WI-5). Nothing in the writer
    # path produces this value any more; approval-mode draft creation now
    # writes DRAFT_PENDING so the rest of the stack (gateway gates,
    # dashboard hooks, seed) sees one canonical "user needs to review"
    # outcome. Kept in the enum so historical docs that still carry
    # `awaiting_approval` load cleanly through ClaimReadTolerant.
    AWAITING_APPROVAL = "awaiting_approval"
    QUEUED_FOR_SEND = "queued_for_send"


class DenialReason(StrEnum):
    CLEARANCE = "clearance"
    MARKETPLACE = "marketplace"
    WINDOW_EXPIRED = "window_expired"
    IDENTICAL_ROOM_MISMATCH = "identical_room_mismatch"
    BASIC_ECONOMY = "basic_economy"
    BUNDLE = "bundle"
    OTHER = "other"


class ConversationMode(StrEnum):
    GENERAL = "general"
    CLAIM_FOCUSED = "claim_focused"


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class ConversationStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class NotificationEventType(StrEnum):
    PRICE_DROPPED = "price_dropped"
    CLAIM_DRAFTED = "claim_drafted"
    CLAIM_QUEUED_AUTO = "claim_queued_auto"
    CLAIM_SUBMITTED = "claim_submitted"
    CLAIM_DENIED = "claim_denied"
    CLAIM_RESOLVED_SUCCESS = "claim_resolved_success"
    LOW_CONFIDENCE_EXTRACT = "low_confidence_extract"
    FIRST_TIME_DASHBOARD = "first_time_dashboard"
    USER_RETURNED_AFTER_LONG_ABSENCE = "user_returned_after_long_absence"
    CONSECUTIVE_REJECTIONS = "consecutive_rejections"


class NotificationEntityType(StrEnum):
    PURCHASE = "purchase"
    CLAIM = "claim"
    CONVERSATION = "conversation"
