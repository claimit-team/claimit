/**
 * Shared enums used across multiple ClaimIt MongoDB collections.
 * Defined as `as const` objects + derived union types so they can be used
 * both as runtime values (validation, fixtures, Pydantic mirrors) and as types.
 */

/**
 * Branded string for UUIDv4 document references (`_id`, `*_id` foreign keys).
 * At runtime it's just a string; the brand only narrows TypeScript inference.
 */
export type UUID = string & { readonly __brand: unique symbol };

/**
 * Branded string for ISO 8601 timestamps (e.g. "2026-05-09T12:08:20Z").
 * At runtime it's just a string; mirrors `datetime` on the Python side.
 */
export type ISODateString = string & { readonly __brand: unique symbol };

export const Category = {
  RETAIL: "retail",
  AIRLINE: "airline",
  HOTEL: "hotel",
} as const;
export type Category = (typeof Category)[keyof typeof Category];

export const Platform = {
  BEST_BUY: "best_buy",
  AMAZON: "amazon",
  TARGET: "target",
  WALMART: "walmart",
  MARRIOTT: "marriott",
  HILTON: "hilton",
  DELTA: "delta",
  UNITED: "united",
  AMERICAN: "american",
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

export const LoyaltyTier = {
  MY_BEST_BUY: "my_best_buy",
  MY_BEST_BUY_PLUS: "my_best_buy_plus",
  MY_BEST_BUY_TOTAL: "my_best_buy_total",
  MARRIOTT_SILVER: "marriott_silver",
  MARRIOTT_GOLD: "marriott_gold",
  MARRIOTT_PLATINUM: "marriott_platinum",
  DELTA_SILVER: "delta_silver",
  DELTA_GOLD: "delta_gold",
  DELTA_PLATINUM: "delta_platinum",
  DELTA_DIAMOND: "delta_diamond",
  NONE: "none",
} as const;
export type LoyaltyTier = (typeof LoyaltyTier)[keyof typeof LoyaltyTier];

export const ClaimType = {
  EMAIL: "email",
  CHAT_SCRIPT: "chat_script",
  IN_STORE: "in_store",
  SELF_SERVICE: "self_service",
} as const;
export type ClaimType = (typeof ClaimType)[keyof typeof ClaimType];

export const SendMode = {
  APPROVAL: "approval",
  AUTO: "auto",
} as const;
export type SendMode = (typeof SendMode)[keyof typeof SendMode];

export const SubscriptionTier = {
  TRIAL: "trial",
  FREE: "free",
  PRO: "pro",
  FAMILY: "family",
} as const;
export type SubscriptionTier = (typeof SubscriptionTier)[keyof typeof SubscriptionTier];

export const PurchaseDateBasis = {
  ORDER_DATE: "order_date",
  SHIP_DATE: "ship_date",
  PICKUP_DATE: "pickup_date",
  CHECK_IN_DATE: "check_in_date",
} as const;
export type PurchaseDateBasis = (typeof PurchaseDateBasis)[keyof typeof PurchaseDateBasis];

export const PurchaseStatus = {
  PENDING_CONFIRMATION: "pending_confirmation",
  PENDING_USER_EDIT: "pending_user_edit",
  MONITORING: "monitoring",
  MONITORING_DEGRADED: "monitoring_degraded",
  CLAIMED: "claimed",
  EXPIRED: "expired",
  REFUNDED: "refunded",
  DISMISSED: "dismissed",
} as const;
export type PurchaseStatus = (typeof PurchaseStatus)[keyof typeof PurchaseStatus];

export const IngestionSource = {
  GMAIL: "gmail",
  UPLOAD_PDF: "upload_pdf",
  UPLOAD_IMAGE: "upload_image",
} as const;
export type IngestionSource = (typeof IngestionSource)[keyof typeof IngestionSource];

export const PriceSource = {
  KEEPA: "keepa",
  SCRAPERAPI: "scraperapi",
  APIFY: "apify",
  AMADEUS: "amadeus",
  DIRECT: "direct",
} as const;
export type PriceSource = (typeof PriceSource)[keyof typeof PriceSource];

export const DraftGeneratedBy = {
  AGENT: "agent",
  USER_EDIT: "user_edit",
  ASSISTANT_REDRAFT: "assistant_redraft",
} as const;
export type DraftGeneratedBy = (typeof DraftGeneratedBy)[keyof typeof DraftGeneratedBy];

export const SubmittedVia = {
  GMAIL_SEND: "gmail_send",
  SENDGRID_FALLBACK: "sendgrid_fallback",
  CLIPBOARD: "clipboard",
  IN_STORE_PRINT: "in_store_print",
  SELF_SERVICE_LINK: "self_service_link",
} as const;
export type SubmittedVia = (typeof SubmittedVia)[keyof typeof SubmittedVia];

export const ClaimOutcome = {
  DRAFT_PENDING: "draft_pending",
  PENDING: "pending",
  APPROVED: "approved",
  DENIED: "denied",
  EXPIRED: "expired",
  USER_SELF_SERVICE: "user_self_service",
  USER_CANCELLED: "user_cancelled",
  NO_RESPONSE: "no_response",
} as const;
export type ClaimOutcome = (typeof ClaimOutcome)[keyof typeof ClaimOutcome];

export const DenialReason = {
  CLEARANCE: "clearance",
  MARKETPLACE: "marketplace",
  WINDOW_EXPIRED: "window_expired",
  IDENTICAL_ROOM_MISMATCH: "identical_room_mismatch",
  BASIC_ECONOMY: "basic_economy",
  BUNDLE: "bundle",
  OTHER: "other",
} as const;
export type DenialReason = (typeof DenialReason)[keyof typeof DenialReason];

export const ConversationMode = {
  GENERAL: "general",
  CLAIM_FOCUSED: "claim_focused",
} as const;
export type ConversationMode = (typeof ConversationMode)[keyof typeof ConversationMode];

export const MessageRole = {
  USER: "user",
  ASSISTANT: "assistant",
} as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

export const ConversationStatus = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const;
export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];
