/**
 * Confirm-flow form state — single source of truth for the lifted
 * form state on /confirm/[purchaseId] (ticket 5.14 B4).
 *
 * The form's state lives on the parent `ConfirmPurchaseContent` so
 * that the ActionBar (which submits) can read the same values the
 * inputs in `extraction-review-form.tsx` rendered without prop-
 * drilling each field as a controlled callback.
 *
 * This module owns:
 *   - the FormState shape (single object, easy to memo on);
 *   - `buildInitialFormState(purchase)` — mirrors the doc into the
 *     editable shape we render;
 *   - `buildCorrectedFields(initial, current)` — returns a backend-
 *     ready `corrected_fields` patch containing ONLY changed values
 *     (empty patch → confirm endpoint runs the no-corrections path
 *     and just flips status to monitoring).
 */

import type { Platform } from "@claimit/mongodb-types";

import type { PurchaseDetailDoc } from "@/lib/api/purchases";

export type ConfirmCategory = "retail" | "airline" | "hotel";

export type ConfirmFormState = {
  /**
   * Empty string means "user hasn't picked a platform yet" — only
   * possible if the extracted platform was not one of the 10 values
   * the backend Platform enum currently supports (latent data
   * mismatch; see PLATFORM_OPTIONS in extraction-review-form.tsx).
   * Submit is gated on this NOT being empty.
   */
  platform: Platform | "";
  productName: string;
  /** Stored as a string to match the controlled `<Input type="number">` element. */
  pricePaid: string;
  /** Date object owned by the calendar picker; null until picked. */
  purchaseDate: Date | null;
  orderId: string;
  category: ConfirmCategory;
  /** Additional-details fields are optional + free-form. */
  memberTier: string;
};

const ENUM_PLATFORMS: ReadonlySet<string> = new Set([
  "best_buy",
  "amazon",
  "target",
  "walmart",
  "marriott",
  "hilton",
  "delta",
  "united",
  "american",
  "southwest",
]);

function coerceCategory(raw: string | null | undefined): ConfirmCategory {
  if (raw === "airline" || raw === "hotel") return raw;
  return "retail";
}

/**
 * Build the initial editable state from a Purchase doc.
 *
 * The platform field is preserved only if it's one of the 10 enum
 * values the backend currently accepts as a `corrected_fields`
 * value. Anything else (legacy seed, future policy platform the
 * enum hasn't caught up on) is presented as "" so the Select shows
 * the placeholder and the user MUST pick — submitting the original
 * raw string would fail server-side at `_ALLOWED_CORRECTABLE_FIELDS`
 * → `Platform.model_validate`.
 */
export function buildInitialFormState(purchase: PurchaseDetailDoc): ConfirmFormState {
  const rawPlatform = purchase.platform ?? "";
  const platform: Platform | "" =
    typeof rawPlatform === "string" && ENUM_PLATFORMS.has(rawPlatform)
      ? (rawPlatform as Platform)
      : "";

  const purchaseDateMs = purchase.purchase_date ? Date.parse(purchase.purchase_date) : Number.NaN;
  return {
    platform,
    productName: purchase.product_name ?? "",
    pricePaid: purchase.price_paid === null ? "" : String(purchase.price_paid),
    purchaseDate: Number.isFinite(purchaseDateMs) ? new Date(purchaseDateMs) : null,
    orderId: purchase.order_id ?? "",
    category: coerceCategory(purchase.category),
    memberTier: purchase.member_tier_at_purchase ?? "",
  };
}

/**
 * Best-effort YYYY-MM-DD formatter for the purchase_date payload.
 * The backend accepts an ISO datetime string (`TypeAdapter(datetime)
 * .validate_python`); a calendar date with no time-of-day is
 * surfaced as midnight UTC to match how `_purchase_payload` writes
 * the email-path date today.
 */
function toIsoMidnightUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00+00:00`;
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Build the `corrected_fields` patch the FE posts to /confirm.
 *
 * Returns `undefined` when the user did not edit anything — that
 * tells the caller to invoke `confirmPurchase(id)` with no body
 * (the backend short-circuits the validation path entirely).
 *
 * Every key on the returned object must be in
 * `_ALLOWED_CORRECTABLE_FIELDS` on the backend (see
 * apps/api-gateway/src/services/purchases.py). The categories below
 * mirror that allow-list:
 *   - platform / category / product_name / order_id / member_tier
 *     are top-level form inputs.
 *   - price_paid is the only price field the form edits; the
 *     backend's `price` mirror is recomputed server-side.
 *   - purchase_date is converted to an ISO string the
 *     `TypeAdapter(datetime)` step on the server accepts.
 *
 * Additional-details fields (variant / fare_class / room_type /
 * bed_type / rate_type / product_url / currency / product_id) are
 * NOT exposed by the v0 form — they stay on the doc as-is.
 */
export function buildCorrectedFields(
  initial: ConfirmFormState,
  current: ConfirmFormState,
): Record<string, unknown> | undefined {
  const patch: Record<string, unknown> = {};

  if (current.platform !== "" && current.platform !== initial.platform) {
    patch.platform = current.platform;
  }
  if (current.category !== initial.category) {
    patch.category = current.category;
  }
  if (current.productName.trim() !== initial.productName.trim()) {
    patch.product_name = current.productName.trim();
  }
  if (current.orderId.trim() !== initial.orderId.trim()) {
    patch.order_id = current.orderId.trim();
  }
  // The member-tier field is a free-form string on the form but the
  // backend's allow-list key is `member_tier_at_purchase`. Empty
  // string is fine — the server will overwrite the existing value.
  if (current.memberTier.trim() !== initial.memberTier.trim()) {
    patch.member_tier_at_purchase = current.memberTier.trim() || null;
  }

  // Price is a number; the form holds it as a string for the input.
  // Skip the diff when the user didn't change anything OR when the
  // input parses to NaN (input cleared mid-edit) — the form
  // validation gate on submit catches the NaN case before we get
  // here.
  if (current.pricePaid !== initial.pricePaid) {
    const parsed = Number.parseFloat(current.pricePaid);
    if (Number.isFinite(parsed) && parsed > 0) {
      patch.price_paid = parsed;
    }
  }

  if (!sameDay(current.purchaseDate, initial.purchaseDate)) {
    if (current.purchaseDate) {
      patch.purchase_date = toIsoMidnightUtc(current.purchaseDate);
    }
  }

  return Object.keys(patch).length === 0 ? undefined : patch;
}

/**
 * Submit guard: returns the first user-facing reason the form
 * cannot be submitted, or null if every required input is valid.
 * Centralised here so both the ActionBar (disabling the button)
 * and a future a11y `aria-describedby` consumer use the same
 * source of truth.
 */
export function getSubmitBlocker(state: ConfirmFormState): string | null {
  if (state.platform === "") return "Pick a platform to continue.";
  if (!state.productName.trim()) return "Add the product or item name.";
  const price = Number.parseFloat(state.pricePaid);
  if (!Number.isFinite(price) || price <= 0) return "Enter a price greater than zero.";
  if (!state.purchaseDate) return "Add the purchase date.";
  if (!state.orderId.trim()) return "Add the order ID or confirmation number.";
  return null;
}
