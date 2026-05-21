/**
 * Thin client for /api/v1/purchases/* (detail endpoint, ticket 5.6).
 *
 * Mirrors lib/api/claims.ts:
 * - Pulls the Firebase ID token at call time so requests carry a fresh
 *   token (Firebase auto-refreshes hourly via getIdToken()).
 * - AbortController timeout protects against UI hangs.
 * - Translates the backend `{error: {code, message}}` envelope into a
 *   typed PurchasesApiError.
 *
 * The enriched response shape is the WIRE shape returned by
 * apps/api-gateway/src/serializers.py:serialize_purchase_detail — the
 * frontend view-model (lib/purchase-detail-view.ts) maps this into a
 * render-friendly bundle.
 *
 * Read-tolerance (PR #142/#144/5.6): every enum-typed field on the wire
 * is widened to `Enum | string | null` so a legacy doc with a value the
 * current enum no longer recognises doesn't crash the client.
 */

import type {
  Category,
  ClaimType,
  IngestionSource,
  Platform,
  PriceSource,
  PurchaseDateBasis,
  PurchaseStatus,
} from "@claimit/mongodb-types";
import type { ClaimListItem } from "@/lib/api/claims";
import { auth } from "@/lib/firebase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const PURCHASES_TIMEOUT_MS = 10000;

/**
 * Wire shape of a Purchase document as returned by
 * serialize_purchase (model_dump by_alias on PurchaseReadTolerant).
 * Every enum-typed field is widened to `Enum | string | null` per the
 * read-tolerance contract.
 *
 * Heavy fields kept off the type:
 *   - ExtractionConfidence: detail page doesn't render it; if needed
 *     later, add a typed sub-object.
 */
export type PurchaseDetailDoc = {
  _id: string;
  updated_at: string | null;
  user_id: string | null;
  platform: Platform | string | null;
  category: Category | string | null;
  product_name: string | null;
  product_id: string | null;
  product_url: string | null;
  variant: string | null;
  fare_class: string | null;
  room_type: string | null;
  bed_type: string | null;
  rate_type: string | null;
  price_paid: number | null;
  member_price_at_purchase: number | null;
  non_member_price_at_purchase: number | null;
  currency: string | null;
  purchase_date: string | null;
  purchase_date_basis: PurchaseDateBasis | string | null;
  window_expires: string | null;
  order_id: string | null;
  member_tier_at_purchase: string | null;
  status: PurchaseStatus | string | null;
  claim_type: ClaimType | string | null;
  monitoring_cadence_minutes: number | null;
  last_checked_at: string | null;
  ingested_at: string | null;
  ingestion_source: IngestionSource | string | null;
  receipt_storage_url: string | null;
  receipt_hash: string | null;
  format_hash: string | null;
  sender: string | null;
};

/**
 * Wire shape of a PriceHistory row (PriceHistoryReadTolerant JSON).
 * `source` / `platform` widened for read-tolerance.
 */
export type PriceHistoryDoc = {
  _id: string | null;
  updated_at: string | null;
  purchase_id: string | null;
  platform: Platform | string | null;
  product_id: string | null;
  price_member: number | null;
  price_non_member: number | null;
  member_tier_required: string | null;
  currency: string | null;
  checked_at: string | null;
  source: PriceSource | string | null;
  evidence_screenshot_url: string | null;
  raw_response_hash: string | null;
};

/**
 * Wire shape of a claim row attached to this purchase. Identical to
 * `ClaimListItem` because `list_claims_for_purchase` reuses the shared
 * projection. Aliased here so consumers don't reach across the
 * /claims api module — keeps the dependency direction clean.
 */
export type PurchaseClaim = ClaimListItem;

export type PurchaseDetailResponse = {
  purchase: PurchaseDetailDoc;
  price_history: PriceHistoryDoc[];
  claims: PurchaseClaim[];
};

export class PurchasesApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PurchasesApiError";
  }
}

async function _request<T>(path: string, init: RequestInit, failureMessage: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new PurchasesApiError(
      "missing_api_base_url",
      "NEXT_PUBLIC_API_BASE_URL is not configured.",
    );
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new PurchasesApiError("unauthenticated", "User must be signed in.");
  }

  const token = await currentUser.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PURCHASES_TIMEOUT_MS);

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
      throw new PurchasesApiError(
        "request_timeout",
        "Timed out loading purchase. Please try again.",
      );
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
    throw new PurchasesApiError(code, message);
  }

  return (await response.json()) as T;
}

/**
 * Fetch the enriched purchase-detail bundle for `purchaseId`.
 *
 * Throws `PurchasesApiError("not_found", ...)` if the purchase doesn't
 * exist or belongs to a different user (the route returns the same 404
 * for both — never leaks existence across users).
 */
export async function getPurchaseDetail(purchaseId: string): Promise<PurchaseDetailResponse> {
  return _request<PurchaseDetailResponse>(
    `/api/v1/purchases/${encodeURIComponent(purchaseId)}`,
    { method: "GET" },
    "Purchase detail request failed",
  );
}
