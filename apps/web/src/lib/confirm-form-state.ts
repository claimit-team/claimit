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

  // Backend stores purchase_date as a tz-aware datetime at midnight
  // UTC, treating it as a stable CALENDAR-DATE encoding (the time-of-
  // day is meaningless for window arithmetic). The picker, by contrast,
  // creates Date objects at midnight LOCAL on the user's selected day.
  // Reading the backend date with local accessors (`getDate()` etc.)
  // would roll the day BACKWARD for users in negative UTC offsets
  // (e.g. UTC-8: midnight UTC is 4pm the previous local day, so
  // `getDate()` returns the day before what the backend recorded).
  // Normalize on the way in by reading the UTC calendar fields and
  // constructing a fresh Date at LOCAL midnight on the same day —
  // then `sameDay` and `toIsoMidnightUtc` (which both use local
  // accessors) line up with the picker's output and with what the
  // backend stored. Symmetric tz handling: read = UTC components,
  // compare/write = local components, but only because the wire
  // encoding is a calendar date dressed as a UTC instant.
  let purchaseDate: Date | null = null;
  if (purchase.purchase_date) {
    const ms = Date.parse(purchase.purchase_date);
    if (Number.isFinite(ms)) {
      const dt = new Date(ms);
      purchaseDate = new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
    }
  }
  return {
    platform,
    productName: purchase.product_name ?? "",
    pricePaid: purchase.price_paid === null ? "" : String(purchase.price_paid),
    purchaseDate,
    orderId: purchase.order_id ?? "",
    category: coerceCategory(purchase.category),
    memberTier: purchase.member_tier_at_purchase ?? "",
  };
}

/**
 * Best-effort YYYY-MM-DD formatter for the purchase_date payload.
 *
 * The Calendar picker returns Date objects at midnight LOCAL time
 * (`new Date(year, month, day)` semantics). Using the UTC accessors
 * here would round the day backward for any UTC+ timezone — a user
 * in UTC+8 picking May 21 would serialize as May 20T16:00:00Z,
 * which the backend then stores as the wrong calendar day.
 *
 * We extract the year/month/day from the local clock and emit a
 * fixed-offset ISO that names the same calendar day. Backend stores
 * a tz-aware datetime; the time-of-day is irrelevant for the window
 * arithmetic (PR-A `confirm_purchase` uses purchase_date as a date,
 * not a wall-clock instant).
 */
function toIsoMidnightUtc(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00+00:00`;
}

/**
 * Compare two picker-source dates on the user's local calendar.
 *
 * Same timezone concern as `toIsoMidnightUtc` above: the form's
 * pre-fill (parsed from a backend ISO via `Date.parse`) and the
 * picker's "is this the same day the doc already had?" check must
 * compare LOCAL year/month/day, otherwise a UTC+ user re-selecting
 * the same prefilled date would falsely register as a change and
 * also serialize one day earlier.
 */
function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
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
