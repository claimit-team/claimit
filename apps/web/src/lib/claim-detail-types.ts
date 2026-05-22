/** Claim detail domain (Batch 6) — aligns with v0 claim detail views. */

export type ClaimDetailWorkflowStatus =
  | "awaiting_approval"
  | "queued_for_send"
  | "ready_to_execute"
  | "submitted"
  | "approved"
  | "denied"
  | "expired"
  /**
   * User-driven cancellation (POST /api/v1/claims/:id/cancel). Distinct
   * from `expired` (window closed) and `submitted` (in-flight) — the
   * claim is CLOSED but for a different reason. Header surfaces a
   * neutral "Cancelled" badge + the user's reason as muted subtext;
   * no actions.
   */
  | "cancelled";

export type ClaimDetailDraftType =
  | "email"
  | "chat_script"
  | "in_store_guide"
  | "self_service_walkthrough";

export type OutcomeStatus = "approved" | "denied" | "no_response" | null;

export interface DraftVersion {
  version: number;
  content: string;
  created_at: string;
  /**
   * Author of this version. Backend `DraftGeneratedBy` enum:
   *  - `agent`              — initial AI-authored draft
   *  - `user_edit`          — user saved an edit via PUT /edit
   *  - `assistant_redraft`  — assistant-driven redraft (5.9)
   *
   * Widened to `string | null | undefined` (read-tolerant: a legacy
   * doc may carry a value the current enum no longer recognises;
   * null/undefined when the wire field is missing). Renderers fall
   * back to a Title-Case label on unknown values. The `undefined`
   * branch keeps legacy mock fixtures in `claim-detail.ts`
   * type-checking without forcing a synthetic value on every row.
   */
  generated_by?: string | null;
}

export interface ClaimEvidence {
  current_price: number;
  original_price: number;
  screenshot_url: string;
  /**
   * Real capture time joined from the `PriceHistory` snapshot whose
   * `evidence_screenshot_url` matches the claim's (ticket 5.8 / WI-3).
   * Empty string when the wire field is null (no snapshot row OR the
   * claim was drafted without a price-drop event); evidence-pane
   * formats empty as "hide the pill" rather than rendering a proxy
   * date like `claim.updated_at`.
   */
  captured_at: string;
  /**
   * The original product URL (`purchase.product_url`) — used as the
   * "Source" link in the evidence card so the user can verify the
   * snapshot against the live page. Optional in the interface so legacy
   * fixtures in `claim-detail.ts` (a dead-code mock module slated for
   * cleanup) keep type-checking without forcing a synthetic URL on
   * every row; the view-model builder always populates a string
   * (empty when `purchase` is null) so renderers can treat empty +
   * undefined identically as "platform label only, no link".
   */
  source_url?: string;
  policy_clause: string;
  policy_url: string;
}

export interface ClaimPurchase {
  purchase_id: string;
  purchase_date: string;
  order_id: string;
  price_paid: number;
}

/**
 * The subset of `Policy` the type-aware renderers read. Calm fallbacks
 * (empty string / 0) when the wire `policy` block is missing — the
 * renderers gracefully omit rows that have no data rather than
 * surfacing literal "—" placeholders.
 */
export interface ClaimPolicy {
  claim_email: string;
  claim_url: string;
  claim_phone: string;
  window_days: number;
  /**
   * External link to the merchant's price-match policy page. Empty
   * string when no row matches the claim's platform/category combo —
   * evidence-pane renders the "Read full policy" link conditionally
   * (passes through `toSafeExternalHref` so a malformed/relative URL
   * also hides the link). Optional in the interface to keep legacy
   * mock fixtures type-checking.
   */
  policy_url?: string;
  /**
   * ISO timestamp of when the policy text was last verified
   * (ticket 5.8 / WI-4). Empty string when null on the wire — the
   * evidence-pane hides the "Policy verified …" caption. Optional so
   * legacy mocks keep type-checking.
   */
  last_verified?: string;
}

export interface ClaimDetail {
  claim_id: string;
  status: ClaimDetailWorkflowStatus;
  claim_type: ClaimDetailDraftType;
  platform: string;
  product_name: string;
  refund_amount: number;
  currency: string;
  window_remaining_hours: number;
  draft_versions: DraftVersion[];
  current_version: number;
  evidence: ClaimEvidence;
  purchase: ClaimPurchase;
  /**
   * Subset of the wire `Policy` doc the type-aware draft renderers
   * read (To: address for email, claim URL for chat/in_store/self_service
   * call-to-action buttons, claim phone for in_store "call ahead",
   * window_days as a reference). The view-model builder always
   * populates this; optional in the interface so legacy fixtures in
   * `claim-detail.ts` (a dead-code mock module slated for cleanup)
   * keep type-checking without forcing a synthetic policy on every
   * row.
   */
  policy?: ClaimPolicy;
  outcome?: OutcomeStatus;
  outcome_amount?: number;
  denial_reason?: string;
  /**
   * User-provided cancel reason (`outcome_note` when the backend
   * `outcome === "user_cancelled"`). Surfaced by the header's
   * `cancelled` branch as muted subtext.
   */
  cancel_reason?: string;
  /**
   * Ticket 5.15 / WI-7: ISO timestamp the auto-send worker will (or
   * did) submit this claim. Set only while the claim is in
   * `queued_for_send`; null/absent otherwise. Surfaced as a live
   * MM:SS countdown by the claim-header's queued branch (WI-8) and
   * by the dashboard auto-send banner (WI-9).
   */
  auto_send_at?: string | null;
}

export interface ClaimMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  toolSummary?: string;
}

export interface ClaimConversation {
  conversation_id: string;
  claim_id: string;
  messages: ClaimMessage[];
}
