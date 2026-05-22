/**
 * Thin client for /api/v1/claims/* (list + detail endpoints).
 *
 * Mirrors lib/api/notifications.ts and lib/api/purchases.ts:
 * - Pulls the Firebase ID token at call time so requests carry a fresh
 *   token (Firebase auto-refreshes hourly via getIdToken()).
 * - AbortController timeout protects against UI hangs.
 * - Translates the backend `{error: {code, message}}` envelope into a
 *   typed ClaimsApiError.
 *
 * The list-row shape (`ClaimListItem`) is inlined here rather than
 * imported from @claimit/mongodb-types because it represents the
 * server-derived projection — Claim core fields plus three Purchase
 * fields joined via $lookup — which is not a canonical document.
 *
 * Read-tolerance (PR #142/#144/5.6 + this PR): every enum-typed wire
 * field is widened to `Enum | string | null` and every required scalar
 * to `T | null`, so a legacy doc with a value the current enum no
 * longer recognises doesn't crash the client.
 */

import type { Category, ClaimOutcome, ClaimType, Platform } from "@claimit/mongodb-types";
import { auth } from "@/lib/firebase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// Same 10s budget as the other thin clients — Cloud Run cold-start
// tolerance vs UX. The /claims list is the heaviest read in the app
// (aggregation + lookup) so the timeout is intentionally generous.
const CLAIMS_TIMEOUT_MS = 10000;

/**
 * UI grouping that drives the filter chips on the /claims page. Maps
 * 1:N to ClaimOutcome on the server (see STATUS_GROUP_OUTCOMES in
 * apps/api-gateway/src/services/claims_service.py).
 */
export type StatusGroup = "pending" | "in_progress" | "resolved";

/**
 * Enriched list-row payload returned by GET /api/v1/claims.
 *
 * Claim core fields plus three Purchase fields joined server-side via
 * $lookup. The joined fields are nullable because orphan claims (claim
 * whose linked Purchase has been deleted) are intentionally surfaced —
 * the user can still see and manage them; their joined fields are null.
 *
 * The enum-typed fields (`platform`, `claim_type`, `outcome`,
 * `category`) are typed as `Enum | string | null` because the backend
 * is read-tolerant (PR #142) — a legacy doc may carry a value the
 * current enum no longer recognises (e.g. `claim_type="price_drop_refund"`
 * from a pre-2.2 schema scratch). The list endpoint surfaces the raw
 * value rather than 500ing; consumers render via Title Case fallback
 * helpers (`claimTypeLabel`, `ClaimOutcomeBadge`, `PlatformLogo`,
 * `outcomeToGroup`). Required scalars (`claim_amount`, `currency`,
 * `redraft_count`) are also widened so a missing/null field renders
 * as "—" rather than crashing the page.
 *
 * Heavy claim fields (draft_content, draft_versions, policy_clause_cited,
 * outcome_note, etc.) are NOT in this payload — fetch the detail
 * endpoint for those.
 */
export type ClaimListItem = {
  _id: string;
  updated_at: string | null;
  purchase_id: string | null;
  user_id: string | null;
  platform: Platform | string | null;
  claim_amount: number | null;
  currency: string | null;
  claim_type: ClaimType | string | null;
  outcome: ClaimOutcome | string | null;
  submitted_at: string | null;
  resolved_at: string | null;
  redraft_count: number | null;
  // Joined from Purchase (nullable for orphan claims).
  product_name: string | null;
  category: Category | string | null;
  window_expires: string | null;
};

export type ListClaimsParams = {
  outcome?: ClaimOutcome;
  status_group?: StatusGroup;
  platform?: Platform;
  q?: string;
  limit?: number;
  cursor?: string;
};

export type ListClaimsResponse = {
  claims: ClaimListItem[];
  next_cursor: string | null;
};

export class ClaimsApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ClaimsApiError";
  }
}

/**
 * Authenticated fetch helper. Returns the raw `Response` on success so
 * callers can decode JSON OR a binary blob (the evidence-proxy endpoint
 * streams PNG bytes — `.json()` would crash there).
 *
 * Mirrors lib/api/purchases.ts:_authedFetch so the JSON wrapper
 * `_request` can stay focused on shape conversion.
 */
async function _authedFetch(
  path: string,
  init: RequestInit,
  failureMessage: string,
): Promise<Response> {
  if (!API_BASE_URL) {
    throw new ClaimsApiError("missing_api_base_url", "NEXT_PUBLIC_API_BASE_URL is not configured.");
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new ClaimsApiError("unauthenticated", "User must be signed in.");
  }

  const token = await currentUser.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLAIMS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ClaimsApiError("request_timeout", "Timed out loading claims. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    // Default `code` derives from the HTTP status so callers can
    // reliably match `err.code === "not_found"` on a 404 regardless of
    // whether the server attached a structured JSON error body. Without
    // this, a plain-text 404 (or one with a non-JSON body — e.g. a load
    // balancer returning HTML) would leave `code` as the generic
    // `request_failed`. Same shape as the receipt-proxy helper.
    let code = response.status === 404 ? "not_found" : "request_failed";
    let message = `${failureMessage} (${response.status})`;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON body (e.g. binary evidence with non-200) — keep defaults.
    }
    throw new ClaimsApiError(code, message);
  }

  return response;
}

async function _request<T>(path: string, init: RequestInit, failureMessage: string): Promise<T> {
  const response = await _authedFetch(path, init, failureMessage);
  return (await response.json()) as T;
}

export async function listClaims(params: ListClaimsParams = {}): Promise<ListClaimsResponse> {
  const query = new URLSearchParams();
  if (params.outcome !== undefined) query.set("outcome", params.outcome);
  if (params.status_group !== undefined) query.set("status_group", params.status_group);
  if (params.platform !== undefined) query.set("platform", params.platform);
  if (params.q !== undefined && params.q.length > 0) query.set("q", params.q);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.cursor !== undefined) query.set("cursor", params.cursor);

  const qs = query.toString();
  const path = `/api/v1/claims${qs ? `?${qs}` : ""}`;
  return _request<ListClaimsResponse>(path, { method: "GET" }, "Claims request failed");
}

// ---------------------------------------------------------------------------
// Detail endpoint — wire shapes for GET /api/v1/claims/:id
// ---------------------------------------------------------------------------

/**
 * Wire shape of a `DraftVersion` row inside the claim doc.
 *
 * Mirrors `DraftVersionReadTolerant` — every field nullable so a
 * legacy/partial sub-document doesn't crash deserialization. Note the
 * server-side field is `at` (the canonical Claim schema name); the UI
 * view-model maps this to `created_at` to stay consistent with the
 * existing `ClaimDetail` shape consumed by `DraftPane`.
 */
export type DraftVersionDoc = {
  version: number | null;
  content: string | null;
  generated_by: string | null;
  at: string | null;
};

/**
 * Wire shape of the `claim` field in the detail bundle
 * (`ClaimReadTolerant.model_dump(by_alias=True)`). Mirrors
 * `claim_read_tolerant.py` 1:1 with all enums widened to
 * `Enum | string | null` and all required scalars to `T | null`.
 */
export type ClaimDetailDoc = {
  _id: string | null;
  updated_at: string | null;
  purchase_id: string | null;
  user_id: string | null;
  platform: Platform | string | null;
  claim_amount: number | null;
  currency: string | null;
  claim_type: ClaimType | string | null;
  draft_content: string | null;
  draft_versions: DraftVersionDoc[];
  redraft_count: number | null;
  policy_clause_cited: string | null;
  evidence_screenshot_url: string | null;
  send_override: string | null;
  submitted_at: string | null;
  submitted_via: string | null;
  outcome: ClaimOutcome | string | null;
  outcome_note: string | null;
  denial_reason_extracted: string | null;
  resolved_at: string | null;
  trace_id: string | null;
};

/**
 * Wire shape of the `policy` field. Only the subset of `Policy` fields
 * the detail page renders is typed here; everything else is dropped at
 * deserialization (TypeScript structural typing — extra wire keys are
 * ignored without runtime error).
 */
export type PolicyDoc = {
  platform: Platform | string | null;
  category: Category | string | null;
  window_days: number | null;
  policy_url: string | null;
  policy_text_relevant_clause: string | null;
  claim_url: string | null;
  claim_email: string | null;
  claim_phone: string | null;
};

/**
 * Wire shape of the `purchase` field. Identical to
 * `PurchaseDetailDoc` from `lib/api/purchases.ts` because both call
 * sites consume the same `PurchaseReadTolerant.model_dump` — aliased
 * here as a type-only re-export so consumers don't reach across the
 * /purchases module.
 */
export type { PurchaseDetailDoc as ClaimPurchaseDoc } from "@/lib/api/purchases";

/**
 * Enriched detail bundle returned by `GET /api/v1/claims/:id`.
 *
 * Backend serializer: `serialize_claim_detail` in
 * `apps/api-gateway/src/services/claims_service.py::get_claim_detail`.
 * `purchase` / `policy` may legitimately be null (orphan claim or a
 * policy lookup that returned nothing); `evidence_url` is a top-level
 * convenience copy of `claim.evidence_screenshot_url`.
 */
export type ClaimDetailResponse = {
  claim: ClaimDetailDoc;
  // ClaimPurchaseDoc type re-exported above; reference by the runtime
  // import to avoid duplicating the full doc shape.
  purchase: import("@/lib/api/purchases").PurchaseDetailDoc | null;
  policy: PolicyDoc | null;
  evidence_url: string | null;
};

/**
 * Fetch the enriched claim-detail bundle for `claimId`.
 *
 * Backend returns 404 (`claim_not_found`) for both "missing" and
 * "owned by a different user" — never leaks existence across users.
 * Page-level consumer uses `err.code === "claim_not_found"` to render
 * the not-found UI; other failures (timeout, 5xx, network) get a
 * retryable error message.
 */
export async function getClaimDetail(claimId: string): Promise<ClaimDetailResponse> {
  return _request<ClaimDetailResponse>(
    `/api/v1/claims/${encodeURIComponent(claimId)}`,
    { method: "GET" },
    "Claim detail request failed",
  );
}

// ---------------------------------------------------------------------------
// Write endpoints — approve / cancel / edit
// ---------------------------------------------------------------------------
//
// All three mirror the request models in `apps/api-gateway/src/routes/claims.py`
// (`ApproveClaimRequest`, `CancelClaimRequest`, `EditClaimDraftRequest`) and the
// concrete return values in
// `apps/api-gateway/src/services/claims_service.py`. 5.7 intentionally omits
// `send_override` from the approve body — that toggle is wired in 5.15.
//
// Return-type alignment with the backend:
//   - approveClaim → `{claim_id, submitted_at, submitted_via}` (small descriptor)
//   - cancelClaim  → `{success: true}`
//   - editClaimDraft → `{claim: <full refreshed claim doc>}` — NOT
//     `{success: true}`. The page refetches after every write (single source of
//     truth), so callers don't depend on this payload, but the type must match
//     so future call sites don't trip on it.

/**
 * Request body for `POST /api/v1/claims/{id}/approve`. 5.7 omits
 * `send_override` (5.15's toggle); only `edited_draft_content` is opt-in here.
 */
export type ApproveClaimBody = {
  edited_draft_content?: string;
};

/**
 * Response shape for `POST /api/v1/claims/{id}/approve` — see
 * `apps/api-gateway/src/services/claims_service.py::approve_claim`. The
 * downstream `claim.approved` Pub/Sub topic has no consumer yet (4.18 work),
 * so `submitted_via` only reflects which path the gateway intended; the user
 * sees an optimistic "Submitted" UI rather than a merchant confirmation.
 */
export type ApproveClaimResponse = {
  claim_id: string;
  submitted_at: string;
  submitted_via: string | null;
};

export async function approveClaim(
  claimId: string,
  body: ApproveClaimBody = {},
): Promise<ApproveClaimResponse> {
  return _request<ApproveClaimResponse>(
    `/api/v1/claims/${encodeURIComponent(claimId)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "Approve claim request failed",
  );
}

export type CancelClaimBody = {
  reason?: string;
};

export type CancelClaimResponse = {
  success: true;
};

export async function cancelClaim(
  claimId: string,
  body: CancelClaimBody = {},
): Promise<CancelClaimResponse> {
  return _request<CancelClaimResponse>(
    `/api/v1/claims/${encodeURIComponent(claimId)}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "Cancel claim request failed",
  );
}

export type EditClaimDraftBody = {
  draft_content: string;
};

export type EditClaimDraftResponse = {
  claim: ClaimDetailDoc;
};

export async function editClaimDraft(
  claimId: string,
  body: EditClaimDraftBody,
): Promise<EditClaimDraftResponse> {
  return _request<EditClaimDraftResponse>(
    `/api/v1/claims/${encodeURIComponent(claimId)}/edit`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "Edit claim draft request failed",
  );
}

// ---------------------------------------------------------------------------
// Evidence proxy — binary blob (ticket 5.8)
// ---------------------------------------------------------------------------

/**
 * Result of a successful evidence-proxy fetch. Caller is responsible for
 * `URL.createObjectURL(blob)` + revoking the URL on unmount — same
 * pattern as `ReceiptBlob` in lib/api/purchases.ts.
 */
export type EvidenceBlob = {
  blob: Blob;
  contentType: string;
};

/**
 * GET /api/v1/claims/:id/evidence — fetch the price-drop screenshot bytes
 * through the authenticated proxy. Returns `null` when the claim has no
 * evidence (`evidence_screenshot_url` null, non-owner, blob gone,
 * bucket mismatch, or malformed gs://) — the evidence card renders a
 * calm "No evidence captured yet" fallback instead of an error.
 *
 * Maps 404 → `null` because the backend collapses every "no evidence"
 * shape into a single 404 (never 403) to avoid existence leaks across
 * users. Any other non-2xx surfaces as a ClaimsApiError. Mirrors
 * `fetchReceiptBlob` exactly.
 */
export async function fetchEvidenceBlob(claimId: string): Promise<EvidenceBlob | null> {
  try {
    const response = await _authedFetch(
      `/api/v1/claims/${encodeURIComponent(claimId)}/evidence`,
      { method: "GET" },
      "Evidence fetch failed",
    );
    const blob = await response.blob();
    const contentType = response.headers.get("Content-Type") ?? blob.type ?? "";
    return { blob, contentType };
  } catch (err) {
    if (err instanceof ClaimsApiError && err.code === "not_found") {
      return null;
    }
    throw err;
  }
}
