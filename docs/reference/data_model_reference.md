# Data Model Reference

ClaimIt uses MongoDB Atlas with six core collections. All models are defined as Pydantic v2 classes in `packages/shared/mongodb/claimit_mongodb_models/`, mirroring TypeScript definitions in the same package. Currency is hard-coded to USD across all collections.

Every document extends `BaseDocument`: `id` (UUID, aliased from `_id`) + `updated_at` (datetime | None).

---

## Collections Overview

| Collection | Model | Purpose |
| --- | --- | --- |
| `users` | `User` | Accounts, Gmail integration, send preferences, loyalty memberships |
| `purchases` | `Purchase` | Extracted purchase records with extraction confidence scores |
| `claims` | `Claim` | Draft versions, approval state, submission tracking, self-eval scores |
| `policies` | `Policy` | Platform refund policies — windows, exclusions, submission channels |
| `price_history` | `PriceHistory` | Timestamped price observations with evidence references |
| `conversations` | `Conversation` | Assistant chat threads with message history |

Two auxiliary collections also exist: `notification_events` and `careers_interest_submissions`.

---

## users

Accounts and integration state.

| Field | Type | Description |
| --- | --- | --- |
| `email`, `name` | `str` | Account identity |
| `provider_avatar_url`, `custom_avatar_url` | `str?` | Profile images |
| `default_location` | `DefaultLocation` | City, state, lat, lon — used for in-store guide directions |
| `loyalty_memberships` | `list[LoyaltyMembership]` | Platform, member_id, tier — affects member pricing and extended windows |
| `gmail_integration` | `GmailIntegration` | `connected`, tokens, watch history IDs, `watch_failed`, `last_processed_history_id` |
| `send_preference` | `SendPreference` | `default_mode` (auto/manual), `auto_send_delay_seconds`, `changed_at` |
| `ingestion_skiplist` | `list[IngestionSkiplistEntry]` | Senders/formats to skip during Gmail ingestion |
| `notification_prefs` | `NotificationPrefs` | Web push, email, muted event types |
| `subscription` | `Subscription` | Tier, trial end, renewal date |
| `onboarded` | `bool` | Default `True` |
| `created_at` | `datetime` | Account creation timestamp |

---

## purchases

Extracted purchase records. One document per line item.

| Field Group | Fields | Description |
| --- | --- | --- |
| **Identity** | `user_id`, `platform`, `category`, `product_name`, `product_id`, `product_url?`, `variant?` | Core purchase identity |
| **Category-specific** | `fare_class?`, `room_type?`, `bed_type?`, `rate_type?` | Null for retail; populated for airlines/hotels |
| **Pricing** | `price_paid` (>0), `member_price_at_purchase?`, `non_member_price_at_purchase?`, `currency` (USD) | Prices at time of purchase |
| **Window** | `purchase_date`, `purchase_date_basis`, `window_expires` | Claim eligibility window |
| **Order** | `order_id`, `member_tier_at_purchase?`, `receipt_line_key?` | Multi-item receipt support |
| **Lifecycle** | `status`, `claim_type`, `monitoring_cadence_minutes`, `last_checked_at?`, `last_monitor_error?`, `last_monitor_error_at?`, `last_monitor_error_code?` | Monitoring state |
| **Ingest** | `ingested_at`, `ingestion_source`, `receipt_storage_url?`, `receipt_hash?`, `format_hash?`, `sender?` | Receipt provenance |
| **Confidence** | `extraction_confidence` | Per-field 0.0–1.0 scores: `platform`, `price`, `overall_min` (required) + ~9 optional fields |

---

## claims

Draft lifecycle from generation through outcome.

| Field Group | Fields | Description |
| --- | --- | --- |
| **References** | `purchase_id`, `user_id`, `platform` | Links to purchase and user |
| **Amounts** | `claim_amount` (>0), `reclaimed_amount?` (>0, set on approval), `currency` (USD) | Financial values |
| **Draft** | `claim_type`, `draft_content`, `draft_versions` (≥1), `redraft_count` (≥0) | Current content + version history |
| **Policy** | `policy_clause_cited`, `evidence_screenshot_url?` | Policy reference and evidence |
| **Send** | `send_override?`, `auto_send_at?`, `subject?`, `recipient_email?`, `gmail_message_id?` | Email-specific; last three only for email type |
| **Outcome** | `submitted_at?`, `submitted_via?`, `outcome`, `outcome_note?`, `denial_reason_extracted?`, `resolved_at?` | Submission and resolution state |
| **Evaluation** | `trace_id?`, `self_eval_score?`, `self_eval_attempts` (≥0) | Phoenix trace reference and Gemini self-evaluation |

### DraftVersion

Each entry in `draft_versions`: `version` (int), `content` (str), `generated_by` (ai_draft / user_edit / assistant_rewrite), `at` (datetime).

Invariant: `draft_content` always equals `draft_versions[-1].content`.

### SelfEvalScore

Four integer dimensions (0–10): `clarity`, `tone`, `accuracy`, `completeness`. Pass threshold: all ≥ 7.

---

## policies

Platform refund policies. One document per platform.

| Field | Type | Description |
| --- | --- | --- |
| `platform` | `str` | Platform identifier (e.g., `best_buy`, `southwest`) |
| `category` | `str` | `retail`, `airline`, or `hotel` |
| `window_days` | `int` | Standard claim window in days |
| `window_days_member` | `int?` | Extended window for loyalty members (if applicable) |
| `pre_arrival_hours_required` | `int?` | Hotel/airline: must be before check-in/departure |
| `covers_own_drops` | `bool` | Policy covers the platform's own price drops |
| `covers_competitor_drops` | `bool` | Policy covers competitor price matches |
| `claim_type` | `str` | `email`, `chat`, `in_store`, or `self_service` |
| `claim_url`, `claim_email`, `claim_phone` | `str?` | Submission channel contact details |
| `loyalty_required` | `bool` | Whether loyalty membership is required to claim |
| `award_ticket_eligible` | `bool?` | Airline: applies to award/points bookings |
| `bundle_exclusions` | `bool` | Excludes bundled/package purchases |
| `key_exclusions` | `list[str]` | Other exclusion categories (e.g., "sale items", "clearance") |
| `policy_url` | `str` | Source URL of the published policy |
| `policy_text_full` | `str` | Full policy text as extracted |
| `policy_text_relevant_clause` | `str` | The specific clause relevant to price matching |
| `last_verified` | `datetime` | When the policy was last checked against the source |
| `active` | `bool` | Whether this policy is currently valid |

Helper: `compute_window_days(policy, member_tier)` returns the effective window — member window if applicable, else standard window. A `window_days` of 0 is legitimate (e.g., Amazon) and is never substituted with a fallback.

---

## price_history

Timestamped price observations.

| Field | Type | Description |
| --- | --- | --- |
| `purchase_id` | `UUID` | Links to the monitored purchase |
| `platform`, `product_id` | `str` | Platform and product identifiers |
| `price_member` | `float?` (≥0) | Member price at check time |
| `price_non_member` | `float?` (≥0) | Non-member price at check time |
| `member_tier_required` | `str?` | Which tier gets the member price |
| `currency` | `str` | Always `USD` |
| `checked_at` | `datetime` | When the price was observed |
| `source` | `PriceSource` | How the price was obtained (adapter type) |
| `evidence_screenshot_url` | `str?` | GCS URL of the screenshot proof |
| `raw_response_hash` | `str?` | Hash of the raw adapter response for dedup |

---

## conversations

Assistant chat threads.

| Field | Type | Description |
| --- | --- | --- |
| `user_id` | `UUID` | Thread owner |
| `mode` | `ConversationMode` | `general` (Mode A) or `claim_focused` (Mode B) |
| `claim_id` | `UUID?` | Linked claim (Mode B only) |
| `title` | `str` | Thread title |
| `messages` | `list[ConversationMessage]` | Message history |
| `trace_ids` | `list[str]` | OTel trace IDs from this conversation |
| `status` | `str` | Thread status |
| `created_at`, `last_message_at` | `datetime` | Timestamps |
| `archived_at` | `datetime?` | When archived (if applicable) |
| `agent_session_id` | `str?` | Vertex AI Agent Engine session handle (Mode A) |

### ConversationMessage

`role` (user/assistant), `content` (str), `at` (datetime), `tool_calls?` (list of `ToolCall`).

### ToolCall

`tool` (str), `input` (dict), `output_summary` (str), `at` (datetime).

---

## Read-Tolerant Variants

Lenient model variants exist for backward compatibility: `PurchaseReadTolerant`, `ClaimReadTolerant`, `PriceHistoryReadTolerant`. These accept documents that predate schema additions (e.g., missing fields added in later iterations). The strict models above are the canonical write schema.

---

## Enums

Core enums live in `claimit_mongodb_models/enums.py`:

| Enum | Values |
| --- | --- |
| `Platform` | `best_buy`, `amazon`, `target`, `walmart`, `home_depot`, `costco`, `lowes`, `apple`, `nike`, `nordstrom`, `macys`, `rei`, `ikea`, `southwest`, `delta`, `united`, `jetblue`, `alaska`, `american`, `hilton`, `marriott`, `hyatt`, `ihg`, `wyndham` |
| `Category` | `retail`, `airline`, `hotel` |
| `ClaimType` | `email`, `chat_script`, `in_store`, `self_service` |
| `PurchaseStatus` | `pending_confirmation`, `monitoring`, `expired`, `paused` |
| `ClaimOutcome` | `draft_pending`, `pending`, `approved`, `denied`, `expired`, `user_self_service`, `user_cancelled`, `no_response`, `awaiting_approval`, `queued_for_send` |
| `DraftGeneratedBy` | `ai_draft`, `user_edit`, `assistant_rewrite` |

The Pub/Sub `events.py` intentionally duplicates these as `Literal` types to keep the pubsub package free of a MongoDB dependency.

---

→ Back to [ClaimIt](../../README.md) [Architecture](architecture.md)
