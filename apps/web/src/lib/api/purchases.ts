/**
 * Thin client for /api/v1/purchases/* (list + detail endpoints).
 *
 * Mirrors lib/api/claims.ts:
 * - Pulls the Firebase ID token at call time so requests carry a fresh
 *   token (Firebase auto-refreshes hourly via getIdToken()).
 * - AbortController timeout protects against UI hangs.
 * - Translates the backend `{error: {code, message}}` envelope into a
 *   typed PurchasesApiError.
 *
 * The enriched detail response is the WIRE shape returned by
 * apps/api-gateway/src/serializers.py:serialize_purchase_detail — the
 * frontend view-model (lib/purchase-detail-view.ts) maps this into a
 * render-friendly bundle. The list endpoint returns rows whose shape
 * is identical to the detail wire doc (`PurchaseListItem` is aliased
 * to `PurchaseDetailDoc`) — no enrichment / join, every backend field
 * is surfaced verbatim.
 *
 * Read-tolerance (PR #142/#144/5.6/PR2): every enum-typed field on
 * the wire is widened to `Enum | string | null` so a legacy doc with a
 * value the current enum no longer recognises doesn't crash the client.
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
 * Wire shape of the `extraction_confidence` sub-object on a Purchase
 * document. Mirrors `ExtractionConfidenceReadTolerant` on the backend
 * (apps/api-gateway/src/middleware/.../purchase_read_tolerant.py): every
 * field is optional + nullable so a legacy/degraded doc never breaks
 * the FE confidence-banner derivation.
 *
 * `null` on a per-field score means "not applicable to this purchase"
 * (e.g. a retail purchase has no fare_class confidence) — the FE must
 * EXCLUDE nulls when computing the "low-confidence set" rather than
 * treat them as 0. `overall_min` and `price` are the two aggregates
 * intentionally NOT surfaced in the banner's low-field list (see the
 * `excluded` set in apps/ingest-agent/src/finalize.py); the FE
 * mirrors that exclusion when displaying field names.
 */
export type ExtractionConfidenceDoc = {
  platform: number | null;
  price: number | null;
  overall_min: number | null;
  order_id: number | null;
  product_name: number | null;
  product_id: number | null;
  price_paid: number | null;
  member_price_at_purchase: number | null;
  purchase_date: number | null;
  member_tier_at_purchase: number | null;
  variant: number | null;
  category: number | null;
};

/**
 * Wire shape of a Purchase document as returned by
 * serialize_purchase (model_dump by_alias on PurchaseReadTolerant).
 * Every enum-typed field is widened to `Enum | string | null` per the
 * read-tolerance contract.
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
  /**
   * Per-field extraction confidence scores written by the ingest-agent
   * finalize step (apps/ingest-agent/src/finalize.py). Null only for
   * legacy docs that pre-date the 5.14 contract — newly-created docs
   * always carry at least the platform/price/overall_min triple
   * (uploads land with sentinel zeros; finalize overwrites them with
   * real scores once Gemini returns).
   */
  extraction_confidence: ExtractionConfidenceDoc | null;
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

/**
 * Authenticated fetch helper used by every typed wrapper below.
 *
 * Centralises: API_BASE_URL guard, Firebase ID-token attachment,
 * AbortController timeout, and `{error: {code, message}}` envelope
 * translation. Returns the raw `Response` on success so callers can
 * read JSON OR a binary blob (the receipt-proxy endpoint streams
 * PDF/image bytes — `.json()` would crash there).
 *
 * Timeout is overridable per-call because uploads of receipts up to
 * MAX_UPLOAD_BYTES (10 MB) on a slow connection can exceed the 10s
 * default that's fine for JSON-only reads.
 */
async function _authedFetch(
  path: string,
  init: RequestInit,
  failureMessage: string,
  options: { timeoutMs?: number } = {},
): Promise<Response> {
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
  const timeoutMs = options.timeoutMs ?? PURCHASES_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
      // Non-JSON body (e.g. binary receipt with non-200) — keep defaults.
    }
    throw new PurchasesApiError(code, message);
  }

  return response;
}

async function _request<T>(
  path: string,
  init: RequestInit,
  failureMessage: string,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const response = await _authedFetch(path, init, failureMessage, options);
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

// ---------------------------------------------------------------------------
// List endpoint — wire shapes for GET /api/v1/purchases
// ---------------------------------------------------------------------------

/**
 * Row shape returned by `GET /api/v1/purchases`.
 *
 * The list service serializes each row via
 * `PurchaseReadTolerant.model_dump(mode="json", by_alias=True)` — the
 * same shape `serialize_purchase` produces and the detail page's
 * `purchase` field carries. Aliasing the list-row type to the existing
 * `PurchaseDetailDoc` keeps a single source of truth for the wire
 * contract — if a backend field ever moves between detail and list,
 * both consumers get the same change at once. NO enrichment, NO
 * `$lookup` (decision 7 in PR2 plan) — purchase rows do NOT carry
 * related-claim fields.
 */
export type PurchaseListItem = PurchaseDetailDoc;

export type ListPurchasesParams = {
  /**
   * Zero-or-more backend `PurchaseStatus` enum values (e.g.
   * "monitoring"). Accepts either a single string OR an array — both
   * shapes get serialized as repeated `?status=` query keys, which
   * the backend parses into a `$in` filter (a single value still
   * works; the server treats single + multi the same way at the
   * MongoDB layer). Typed as raw string here because the wire enum is
   * the source of truth — a future status will be accepted without a
   * frontend type bump.
   */
  status?: string | string[];
  /** Backend `Category` enum value (retail / airline / hotel). */
  category?: string;
  /**
   * Substring search over platform / product_name / order_id. Empty
   * strings are stripped client-side. Max 100 chars enforced
   * server-side (matches the claims-list cap).
   */
  q?: string;
  limit?: number;
  cursor?: string;
};

export type ListPurchasesResponse = {
  purchases: PurchaseListItem[];
  next_cursor: string | null;
  /**
   * Server-computed total over the FILTERED set (status + category + q
   * are honored). Not rendered today (v0 §4 forbids money totals) —
   * kept on the type for parity with the wire shape so a future
   * pagination footer / "X results" hint can read it without another
   * round-trip.
   */
  total_count: number;
};

/**
 * Fetch a page of purchases for the authenticated user.
 *
 * Empty / whitespace-only `q` is omitted from the query string entirely
 * — the backend treats absent and empty-string identically, but
 * omitting keeps URLs clean (no `?q=`) and avoids accidentally
 * triggering the q-path on the server when the user clears the search
 * input.
 */
export async function listPurchases(
  params: ListPurchasesParams = {},
): Promise<ListPurchasesResponse> {
  const query = new URLSearchParams();
  // `status` accepts both `string` (single value) and `string[]`
  // (multi). Both are serialized as repeated `status=...` query
  // params so the backend always sees a list (FastAPI's
  // `list[PurchaseStatus] | None` query type). Empty strings are
  // skipped so an accidental empty filter doesn't reach the server.
  if (params.status !== undefined) {
    const values = Array.isArray(params.status) ? params.status : [params.status];
    for (const value of values) {
      if (value.length > 0) query.append("status", value);
    }
  }
  if (params.category !== undefined && params.category.length > 0) {
    query.set("category", params.category);
  }
  if (params.q !== undefined && params.q.trim().length > 0) query.set("q", params.q.trim());
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.cursor !== undefined && params.cursor.length > 0) query.set("cursor", params.cursor);

  const qs = query.toString();
  const path = `/api/v1/purchases${qs ? `?${qs}` : ""}`;
  return _request<ListPurchasesResponse>(path, { method: "GET" }, "Purchases list request failed");
}

// ---------------------------------------------------------------------------
// Write endpoints — upload / confirm / dismiss
// ---------------------------------------------------------------------------

/** Single-purchase write response — every write returns `{purchase: ...}`. */
export type PurchaseWriteResponse = {
  purchase: PurchaseDetailDoc;
};

/**
 * POST /api/v1/purchases/upload — multipart receipt upload.
 *
 * The api-gateway validates content-type (PDF / PNG / JPEG only) and
 * file size (≤ MAX_UPLOAD_BYTES = 10 MB), writes a sentinel
 * `pending_confirmation` Purchase row, uploads the bytes to GCS, and
 * publishes `purchase.uploaded` so the ingest-agent extracts the
 * fields asynchronously. Returns the freshly-created purchase doc;
 * the FE then routes the user to `/confirm/:id` where the analyzing
 * poll waits for extraction to finalize (B3).
 *
 * Upload timeout is widened to 60s — a slow upstream + a 10 MB PDF
 * comfortably exceeds the 10s JSON-default in `PURCHASES_TIMEOUT_MS`.
 * Error envelope uses the same `code` discriminator as JSON 4xx
 * responses: `file_too_large` (413), `unsupported_media_type` (415),
 * everything else surfaces with `failureMessage` + the HTTP status.
 *
 * The `Content-Type` header is intentionally NOT set here — the
 * browser must build the `multipart/form-data; boundary=…` value
 * itself from the FormData object.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

export async function uploadPurchase(file: File): Promise<PurchaseWriteResponse> {
  const form = new FormData();
  form.append("file", file, file.name);
  return _request<PurchaseWriteResponse>(
    "/api/v1/purchases/upload",
    { method: "POST", body: form },
    "Receipt upload failed",
    { timeoutMs: UPLOAD_TIMEOUT_MS },
  );
}

/**
 * POST /api/v1/purchases/:id/confirm — apply user corrections and
 * flip the purchase to `monitoring`.
 *
 * `corrected_fields` is omitted entirely when the user accepted the
 * extraction verbatim — the backend's `_ALLOWED_CORRECTABLE_FIELDS`
 * allow-list will 400 on any unknown key, so the FE must send ONLY
 * fields the user actually edited (see B4's diff builder).
 */
export type ConfirmPurchaseRequest = {
  corrected_fields?: Record<string, unknown>;
};

export async function confirmPurchase(
  purchaseId: string,
  body: ConfirmPurchaseRequest = {},
): Promise<PurchaseWriteResponse> {
  return _request<PurchaseWriteResponse>(
    `/api/v1/purchases/${encodeURIComponent(purchaseId)}/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "Confirm purchase failed",
  );
}

/**
 * Dismiss reasons mirror the backend's
 * `DismissReason = Literal["not_an_order", "duplicate", "other"]`.
 * Only `not_an_order` may set `remember_sender=true` — `duplicate`
 * and `other` ignore the flag server-side; the FE additionally hides
 * the skip-sender checkbox for those two so the UI doesn't lie about
 * what dismiss will do.
 */
export type DismissReason = "not_an_order" | "duplicate" | "other";

export type DismissPurchaseRequest = {
  reason: DismissReason;
  remember_sender?: boolean;
  /**
   * Backward-compat shim for the still-open frontend issue #103:
   * when Purchase carries the original email sender, this field will
   * be dropped and the service will read it from the doc. Until then
   * the FE must pass `sender` for the gmail-source dismiss path so
   * `remember_sender=true` can actually write a skiplist entry.
   */
  sender?: string;
};

/**
 * Dismiss returns a status envelope (NOT a `{purchase}` object) — the
 * dismiss path may or may not write a skiplist entry depending on
 * reason + remember_sender + sender, and the FE renders the toast
 * differently based on `skiplist_written`.
 */
export type DismissPurchaseResponse = {
  success: boolean;
  status: string;
  reason: DismissReason;
  skiplist_written: boolean;
};

export async function dismissPurchase(
  purchaseId: string,
  body: DismissPurchaseRequest,
): Promise<DismissPurchaseResponse> {
  return _request<DismissPurchaseResponse>(
    `/api/v1/purchases/${encodeURIComponent(purchaseId)}/dismiss`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "Dismiss purchase failed",
  );
}

// ---------------------------------------------------------------------------
// Receipt proxy — binary blob
// ---------------------------------------------------------------------------

/**
 * Result of a successful receipt-proxy fetch. The caller is
 * responsible for `URL.createObjectURL(blob)` + revoking the URL on
 * unmount (B6's receipt-preview does both). `contentType` is the
 * server-asserted MIME — used to decide between `<img>` and `<iframe>`
 * rendering rather than trusting the URL extension.
 */
export type ReceiptBlob = {
  blob: Blob;
  contentType: string;
};

/**
 * GET /api/v1/purchases/:id/receipt — fetch the receipt bytes through
 * the authenticated proxy. Returns `null` when the purchase has no
 * receipt (gmail rows, in-app dismissals, or a degraded doc where
 * `receipt_storage_url` is missing) — the FE renders the "Original
 * not available" fallback instead of an error.
 *
 * Maps 404 → `null` because the backend collapses every "no receipt"
 * shape (missing url, non-owner, blob gone, malformed gs://) into a
 * single 404 — never 403 — to avoid existence leaks across users.
 * Any other non-2xx surfaces as a PurchasesApiError.
 */
export async function fetchReceiptBlob(purchaseId: string): Promise<ReceiptBlob | null> {
  try {
    const response = await _authedFetch(
      `/api/v1/purchases/${encodeURIComponent(purchaseId)}/receipt`,
      { method: "GET" },
      "Receipt fetch failed",
    );
    const blob = await response.blob();
    // Some servers report a default `application/octet-stream` here;
    // the receipt-preview component falls back to a generic icon when
    // that's the case rather than guessing from the URL extension.
    const contentType = response.headers.get("Content-Type") ?? blob.type ?? "";
    return { blob, contentType };
  } catch (err) {
    if (err instanceof PurchasesApiError && err.message.includes("(404)")) {
      // Backend collapses every "no receipt" shape into 404; treat as
      // an expected null instead of a hard error.
      return null;
    }
    throw err;
  }
}
