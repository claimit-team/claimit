/**
 * Claim-detail view-model layer.
 *
 * Owns the wire -> render adapter for `/claims/[id]`:
 *  - `mapOutcomeToWorkflowStatus`: `claim.outcome` (8 backend values
 *    + null + rogue) -> UI workflow `ClaimDetailWorkflowStatus`
 *    (7 visual states). Drives the header status badge + per-state
 *    action stack in `ClaimHeader`.
 *  - `mapClaimTypeToUi`: backend `ClaimType` -> `ClaimDetailDraftType`
 *    (the UI's 4-value draft-renderer enum). Handles the
 *    `in_store -> in_store_guide` / `self_service -> self_service_walkthrough`
 *    name drift.
 *  - `buildClaimDetailViewModel(response)`: maps the enriched wire
 *    `ClaimDetailResponse` into the render-friendly `ClaimDetail`
 *    shape that `ClaimDetailShell` + its panes consume.
 *
 * Mirrors `lib/purchase-detail-view.ts` (PR1) — non-mock module, lives
 * outside `lib/claim-detail.ts` so real code never reaches into a
 * mock-data file. The mock-data module retains only formatters used by
 * `claim-header`, `evidence-pane`, and `claims-status` (orthogonal,
 * not blocked by this rewrite).
 *
 * Read-tolerance (PR #142): every enum-typed wire field is widened to
 * `Enum | string | null` and every required scalar to `T | null`. The
 * builder coerces to safe defaults rather than throwing — a single
 * rogue/legacy row cannot crash the detail page.
 */

import type { ClaimDetailDoc, ClaimDetailResponse, PolicyDoc } from "@/lib/api/claims";
import type {
  ClaimDetail,
  ClaimDetailDraftType,
  ClaimDetailWorkflowStatus,
  ClaimEvidence,
  ClaimPolicy,
  ClaimPurchase,
  DraftVersion,
  OutcomeStatus,
} from "@/lib/claim-detail-types";

// ---------------------------------------------------------------------------
// Outcome -> workflow-status mapping
// ---------------------------------------------------------------------------

/**
 * Map a backend `claim.outcome` value to the UI workflow status the
 * header / shell branch on.
 *
 * The backend `ClaimOutcome` enum has 8 values; the UI workflow has 7.
 * Two intermediate UI states (`queued_for_send`, `ready_to_execute`)
 * have no backend counterpart — they only exist as transient
 * post-approval UI in the original mock and are NEVER emitted by this
 * mapper. Once real approve wiring lands, the API will surface state
 * for those buckets and this mapper can be extended.
 *
 * Mapping rules:
 *  - `draft_pending`        -> `awaiting_approval`
 *  - `queued_for_send`      -> `queued_for_send` (NEW in 5.15 / WI-8 —
 *                              live MM:SS countdown + Send now/Cancel
 *                              actions; replaces the previous
 *                              fall-through to awaiting_approval that
 *                              hid the queue state from the header)
 *  - `pending`              -> `submitted` (in-flight to merchant)
 *  - `approved`             -> `approved`
 *  - `denied`               -> `denied`
 *  - `expired`              -> `expired`
 *  - `no_response`          -> `expired` (UI has no separate label;
 *                              behavior is the same — window closed)
 *  - `user_cancelled`       -> `cancelled` (NEW in 5.7 — distinct
 *                              from `expired` so the header can
 *                              surface the user's cancel reason as
 *                              muted subtext + a neutral
 *                              "Cancelled" badge)
 *  - `user_self_service`    -> `expired` (CLOSED — user resolved
 *                              outside the funnel)
 *  - `awaiting_approval`    -> `awaiting_approval` (read-tolerance:
 *                              legacy docs from before 5.15 / WI-5
 *                              may still carry this; same UI as a
 *                              fresh draft_pending)
 *  - unknown / null         -> `awaiting_approval` (calm default;
 *                              same as a freshly-drafted claim)
 */
export function mapOutcomeToWorkflowStatus(
  outcome: string | null | undefined,
): ClaimDetailWorkflowStatus {
  switch (outcome) {
    case "draft_pending":
      return "awaiting_approval";
    case "queued_for_send":
      return "queued_for_send";
    case "pending":
      return "submitted";
    case "approved":
      return "approved";
    case "denied":
      return "denied";
    case "user_cancelled":
      return "cancelled";
    case "expired":
    case "no_response":
    case "user_self_service":
      return "expired";
    default:
      return "awaiting_approval";
  }
}

/**
 * Map the post-resolution `outcome` field to the UI's terminal
 * `OutcomeStatus` (used by `claim.outcome?` on the view-model — the
 * header renders "Reclaimed $X" / "Try a different angle" off this).
 */
function mapTerminalOutcome(outcome: string | null | undefined): OutcomeStatus {
  switch (outcome) {
    case "approved":
      return "approved";
    case "denied":
      return "denied";
    case "no_response":
      return "no_response";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Claim-type mapping
// ---------------------------------------------------------------------------

/**
 * Map backend `ClaimType` to the UI's `ClaimDetailDraftType`.
 *
 * Backend enum (per `claims-status.ts::claimTypeLabel`): `email`,
 * `chat_script`, `in_store`, `self_service`.
 *
 * UI enum (per `claim-detail-types.ts`): `email`, `chat_script`,
 * `in_store_guide`, `self_service_walkthrough`. Each variant drives a
 * different `DraftPane` renderer (Email subject+body, chat-script
 * sectioned view, generic for the last two).
 *
 * Rogue/null -> `email` (the universally-renderable variant — the
 * generic draft renderer also works, but `email` matches the most
 * common real claim shape).
 */
export function mapClaimTypeToUi(claimType: string | null | undefined): ClaimDetailDraftType {
  switch (claimType) {
    case "email":
      return "email";
    case "chat_script":
      return "chat_script";
    case "in_store":
    case "in_store_guide":
      return "in_store_guide";
    case "self_service":
    case "self_service_walkthrough":
      return "self_service_walkthrough";
    default:
      return "email";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a snake-case backend platform value to a brand-style label.
 * `best_buy` -> `Best Buy`; `null`/`""` -> `Unknown platform`.
 * Mirrors `safePlatformLabel` in `purchase-detail-view.ts`.
 *
 * TODO(refactor): hoist this + the `purchase-detail-view.ts` copy to a
 * shared helper in `lib/utils.ts` so the two detail VMs share one
 * definition. Out of scope for this demo-breaker fix; tracked in a
 * follow-up cleanup PR.
 */
function safePlatformLabel(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "Unknown platform";
  return raw
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Hours until `iso`, clamped at 0 (so the header's
 * `if (window_remaining_hours > 0)` guard naturally hides the chip
 * for an expired/missing window). Returns 0 for null / invalid date.
 */
function hoursUntil(iso: string | null | undefined): number {
  if (iso === null || iso === undefined || iso === "") return 0;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.ceil((ms - Date.now()) / (60 * 60 * 1000)));
}

/**
 * Build the `draft_versions` array the UI expects (`{version, content,
 * created_at}`) from the wire's `{version, content, generated_by, at}`.
 *
 * If the wire array is empty BUT `claim.draft_content` is non-null,
 * synthesize a single v1 row so `DraftPane` always has something to
 * render — matches the canonical Claim invariant
 * `draft_content == draft_versions[-1].content` even when a legacy
 * doc somehow lost the array.
 *
 * If both are empty, return `[]` and let `DraftPane` render an empty
 * body (acceptable — a draft-less claim is rare but not a crash case).
 */
function mapDraftVersions(claim: ClaimDetailDoc): DraftVersion[] {
  if (claim.draft_versions.length > 0) {
    return claim.draft_versions.map((dv, idx) => ({
      // `version` may be null on a partial sub-doc; index+1 is the
      // canonical fallback (matches the Claim schema's 1-based version
      // counter).
      version: dv.version ?? idx + 1,
      content: dv.content ?? "",
      created_at: dv.at ?? "",
      generated_by: dv.generated_by,
    }));
  }
  if (claim.draft_content !== null && claim.draft_content !== "") {
    return [
      {
        version: 1,
        content: claim.draft_content,
        created_at: claim.updated_at ?? "",
        // Synthesized fallback when the wire array is empty — assume
        // the (single) version came from the agent.
        generated_by: "agent",
      },
    ];
  }
  return [];
}

/**
 * Compose the `evidence` sub-object the UI expects, derived from the
 * wire `claim` + `purchase` + `policy` + `evidence_url`. Every field
 * has a calm fallback — empty string for URLs (the existing
 * `ScreenshotPlaceholder` renders when the url is empty), generic
 * copy for missing policy text.
 */
function buildEvidence(response: ClaimDetailResponse): ClaimEvidence {
  const { claim, purchase, policy, evidence_url, evidence_captured_at } = response;
  const pricePaid = purchase?.price_paid ?? 0;
  const claimAmount = claim.claim_amount ?? 0;
  // `current_price` is what the merchant is showing now -> price_paid
  // minus the claim amount. Floored at 0 so a rogue (negative) amount
  // can't render a sub-zero "current price".
  const currentPrice = Math.max(0, pricePaid - claimAmount);
  return {
    current_price: currentPrice,
    original_price: pricePaid,
    screenshot_url: evidence_url ?? claim.evidence_screenshot_url ?? "",
    // Real `checked_at` from the PriceHistory snapshot (WI-3). Empty
    // string when null — the formatter in evidence-pane hides the
    // captured-at pill rather than rendering `updated_at` as a proxy.
    captured_at: evidence_captured_at ?? "",
    source_url: purchase?.product_url ?? "",
    policy_clause:
      claim.policy_clause_cited ??
      policy?.policy_text_relevant_clause ??
      "Policy clause unavailable.",
    policy_url: policy?.policy_url ?? "",
  };
}

/**
 * Compose the `policy` sub-object the type-aware draft renderers
 * read. The wire `Policy` block can legitimately be `null` (no policy
 * row for this platform/category combo); calm fallbacks (empty
 * string / 0) so renderers can do `if (policy.claim_email !== "")`
 * without `?.` chains.
 */
function buildPolicyBlock(response: ClaimDetailResponse): ClaimPolicy {
  const { policy } = response;
  return {
    claim_email: policy?.claim_email ?? "",
    claim_url: policy?.claim_url ?? "",
    claim_phone: policy?.claim_phone ?? "",
    window_days: policy?.window_days ?? 0,
    policy_url: policy?.policy_url ?? "",
    last_verified: policy?.last_verified ?? "",
  };
}

/**
 * Compose the `purchase` sub-object the UI expects. Falls back to
 * empty strings / zero so a claim with a deleted (orphan) purchase
 * still renders the page — the defensive `formatDateShort` /
 * `formatClaimCurrency` calls then surface "—" / "$0.00" placeholders.
 */
function buildPurchaseBlock(response: ClaimDetailResponse): ClaimPurchase {
  const { claim, purchase } = response;
  return {
    purchase_id: purchase?._id ?? claim.purchase_id ?? "",
    purchase_date: purchase?.purchase_date ?? purchase?.ingested_at ?? "",
    order_id: purchase?.order_id ?? "",
    price_paid: purchase?.price_paid ?? 0,
  };
}

/**
 * Derive the post-resolution display fields the header reads off the
 * VM (`outcome_amount`, `denial_reason`) — only meaningful when the
 * claim has actually resolved.
 */
function buildResolutionFields(claim: ClaimDetailDoc): {
  outcome: OutcomeStatus;
  outcome_amount?: number;
  denial_reason?: string;
  cancel_reason?: string;
} {
  const outcome = mapTerminalOutcome(claim.outcome);
  const out: {
    outcome: OutcomeStatus;
    outcome_amount?: number;
    denial_reason?: string;
    cancel_reason?: string;
  } = { outcome };
  if (outcome === "approved") {
    const amount = claim.reclaimed_amount ?? claim.claim_amount;
    if (amount !== null) out.outcome_amount = amount;
  }
  if (outcome === "denied") {
    const reason = claim.denial_reason_extracted ?? claim.outcome_note ?? null;
    if (reason !== null && reason !== "") out.denial_reason = reason;
  }
  if (
    claim.outcome === "user_cancelled" &&
    claim.outcome_note !== null &&
    claim.outcome_note !== ""
  ) {
    out.cancel_reason = claim.outcome_note;
  }
  return out;
}

// ---------------------------------------------------------------------------
// View-model builder
// ---------------------------------------------------------------------------

/**
 * Map the enriched wire `ClaimDetailResponse` into the render-friendly
 * `ClaimDetail` shape `ClaimDetailShell` + its panes consume.
 *
 * Null-safe + rogue-safe everywhere — a legacy claim with unknown
 * `outcome`/`claim_type` lands in calm defaults; an orphan claim
 * (missing purchase) still renders.
 */
export function buildClaimDetailViewModel(response: ClaimDetailResponse): ClaimDetail {
  const { claim, purchase } = response;
  const draftVersions = mapDraftVersions(claim);
  const resolution = buildResolutionFields(claim);

  return {
    // `_id` could theoretically be null on the tolerant model, but the
    // route would have 404ed before reaching the page if the doc had
    // no `_id`. Fall back to empty string to keep the type honest.
    claim_id: claim._id ?? "",
    status: mapOutcomeToWorkflowStatus(claim.outcome),
    claim_type: mapClaimTypeToUi(claim.claim_type),
    platform: safePlatformLabel(claim.platform),
    product_name: purchase?.product_name ?? "—",
    refund_amount: claim.claim_amount ?? 0,
    currency: claim.currency ?? "USD",
    window_remaining_hours: hoursUntil(purchase?.window_expires),
    draft_versions: draftVersions,
    // `DraftPane` indexes via `selectedVersion - 1`; zero would break.
    // Empty draft_versions -> 1 so the index lands on the empty body
    // (acceptable; the same shell renders a blank draft when no
    // versions exist).
    current_version: draftVersions.length === 0 ? 1 : draftVersions.length,
    evidence: buildEvidence(response),
    purchase: buildPurchaseBlock(response),
    policy: buildPolicyBlock(response),
    // WI-7: surface auto_send_at as-is so the queued_for_send claim
    // header branch (WI-8) and any future detail-page banner can render
    // the live countdown. Null when not queued — the header's branch
    // guards on the value before computing MM:SS.
    auto_send_at: claim.auto_send_at,
    ...resolution,
  };
}

// Re-export the policy doc type so consumers that need the raw wire
// shape (e.g. a future "full policy" dialog) can pull it through this
// module instead of importing from `lib/api/claims.ts` directly.
export type { PolicyDoc };
