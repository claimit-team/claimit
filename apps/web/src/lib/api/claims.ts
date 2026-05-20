/**
 * Thin client for /api/v1/claims/* (list endpoint).
 *
 * Mirrors lib/api/notifications.ts:
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

async function _request<T>(path: string, init: RequestInit, failureMessage: string): Promise<T> {
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
    let code = "request_failed";
    let message = `${failureMessage} (${response.status})`;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Non-JSON body; keep defaults.
    }
    throw new ClaimsApiError(code, message);
  }

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
