/**
 * Mock purchase fixtures — confirm-flow only.
 *
 * Scope (PR2 post-cleanup): this file now ONLY supplies fixtures
 * consumed by the still-mocked /confirm/[purchaseId] extraction flow.
 * The /purchases list real-ified in PR2 and the list export
 * (`getPurchasesForListView`) has been removed. The detail-page
 * view-model types + formatters live in:
 *
 *   - `lib/purchase-detail-view.ts`  (VM types + builder + formatters)
 *   - `lib/purchase-status.ts`       (PurchaseStatus -> badge mapping)
 *   - `lib/api/purchases.ts`         (wire types + client, list + detail)
 *
 * Real (api-driven) components must NOT import from this file. The
 * remaining exports (`Purchase`, `getPurchaseById`,
 * `ConfirmExtractionPayload`, `getConfirmExtractionForPurchase`,
 * `ExtractionField`, `PurchaseCategory`) are kept solely for the
 * confirm flow. They'll be removed when the confirm flow real-ifies
 * in its own ticket.
 */

export type PurchaseCategory = "retail" | "airline" | "hotel";
export type PurchaseStatus =
  | "monitoring"
  | "claim drafted"
  | "submitted"
  | "window ending soon"
  | "approved";

/** Flow control for `/confirm/[purchaseId]` — only `pending_confirmation` stays on confirm. */
export type PurchaseConfirmationState = "pending_confirmation" | "confirmed";

export interface Purchase {
  purchaseId: string;
  platform: string;
  title: string;
  category: PurchaseCategory;
  status: PurchaseStatus;
  windowRemaining: string;
  confirmationState?: PurchaseConfirmationState;
}

export const mockPurchases: Purchase[] = [
  {
    purchaseId: "purchase_001",
    platform: "Best Buy",
    title: "Sony WH-1000XM5",
    category: "retail",
    status: "monitoring",
    windowRemaining: "11 days remaining",
    confirmationState: "confirmed",
  },
  {
    purchaseId: "purchase_002",
    platform: "Southwest",
    title: "LAX ↔ MIA",
    category: "airline",
    status: "claim drafted",
    windowRemaining: "Before departure",
    confirmationState: "confirmed",
  },
  {
    purchaseId: "purchase_003",
    platform: "Hilton",
    title: "Hilton Waikiki stay",
    category: "hotel",
    status: "submitted",
    windowRemaining: "Outcome needed",
    confirmationState: "confirmed",
  },
  {
    purchaseId: "purchase_004",
    platform: "Amazon",
    title: "AirPods Pro 2",
    category: "retail",
    status: "monitoring",
    windowRemaining: "22 days remaining",
    confirmationState: "confirmed",
  },
  {
    purchaseId: "purchase_005",
    platform: "Delta Air Lines",
    title: "NYC → LAX",
    category: "airline",
    status: "window ending soon",
    windowRemaining: "3 days remaining",
    confirmationState: "confirmed",
  },
  {
    purchaseId: "purchase_006",
    platform: "Target",
    title: "Kitchen espresso machine",
    category: "retail",
    status: "monitoring",
    windowRemaining: "30 days remaining",
    confirmationState: "confirmed",
  },
  {
    purchaseId: "purchase_007",
    platform: "United Airlines",
    title: "ORD → DEN",
    category: "airline",
    status: "approved",
    windowRemaining: "Fare drop honored",
    confirmationState: "confirmed",
  },
  {
    purchaseId: "purchase_008",
    platform: "Marriott Bonvoy",
    title: "San Diego Waterfront",
    category: "hotel",
    status: "monitoring",
    windowRemaining: "45 days remaining",
    confirmationState: "confirmed",
  },
  {
    purchaseId: "purchase_009",
    platform: "Best Buy",
    title: "Sony WH-1000XM5 (pending confirm)",
    category: "retail",
    status: "monitoring",
    windowRemaining: "Awaiting your confirmation",
    confirmationState: "pending_confirmation",
  },
  {
    purchaseId: "purchase_010",
    platform: "Best Buy",
    title: "Blurry receipt (pending confirm)",
    category: "retail",
    status: "monitoring",
    windowRemaining: "Awaiting your confirmation",
    confirmationState: "pending_confirmation",
  },
];

export function getPurchaseById(purchaseId: string): Purchase | undefined {
  return mockPurchases.find((p) => p.purchaseId === purchaseId);
}

export function purchaseShouldSkipConfirmRedirect(purchase: Purchase | undefined): boolean {
  if (!purchase) return false;
  return purchase.confirmationState !== "pending_confirmation";
}

/** --- Confirm / extraction mocks (Batch 6) --- */

export type ExtractionField<T> = { value: T; confidence: number };

export interface ConfirmExtractionPayload {
  purchase_id: string;
  source: "upload" | "gmail";
  filename: string;
  receipt_url: string;
  receipt_type: "image" | "pdf";
  overall_confidence: number;
  low_confidence_fields: string[];
  is_mostly_failed?: boolean;
  fields: {
    platform: ExtractionField<string>;
    product_name: ExtractionField<string>;
    price_paid: ExtractionField<number>;
    purchase_date: ExtractionField<string>;
    order_id: ExtractionField<string>;
    category: PurchaseCategory;
  };
}

const extractionsById: Record<string, ConfirmExtractionPayload> = {
  purchase_009: {
    purchase_id: "purchase_009",
    source: "upload",
    filename: "best-buy-order.pdf",
    receipt_url: "/mock/receipt.pdf",
    receipt_type: "pdf",
    overall_confidence: 0.96,
    low_confidence_fields: [],
    fields: {
      platform: { value: "Best Buy", confidence: 0.98 },
      product_name: { value: "Sony WH-1000XM5", confidence: 0.97 },
      price_paid: { value: 299.99, confidence: 0.96 },
      purchase_date: { value: "2026-05-10", confidence: 0.99 },
      order_id: { value: "BBY-887001", confidence: 0.92 },
      category: "retail",
    },
  },
  purchase_010: {
    purchase_id: "purchase_010",
    source: "upload",
    filename: "blurry-receipt.jpg",
    receipt_url: "/mock/receipt.jpg",
    receipt_type: "image",
    overall_confidence: 0.42,
    low_confidence_fields: ["price_paid", "purchase_date"],
    fields: {
      platform: { value: "Best Buy", confidence: 0.71 },
      product_name: { value: "Receipt image", confidence: 0.55 },
      price_paid: { value: 0, confidence: 0.12 },
      purchase_date: { value: "", confidence: 0.08 },
      order_id: { value: "", confidence: 0.15 },
      category: "retail",
    },
  },
};

function emptyExtraction(purchaseId: string): ConfirmExtractionPayload {
  return {
    purchase_id: purchaseId,
    source: "upload",
    filename: "manual-entry.pdf",
    receipt_url: "",
    receipt_type: "pdf",
    overall_confidence: 0.12,
    low_confidence_fields: ["product_name", "price_paid", "purchase_date", "order_id"],
    is_mostly_failed: true,
    fields: {
      platform: { value: "", confidence: 0 },
      product_name: { value: "", confidence: 0 },
      price_paid: { value: 0, confidence: 0 },
      purchase_date: { value: "", confidence: 0 },
      order_id: { value: "", confidence: 0 },
      category: "retail",
    },
  };
}

export function getConfirmExtractionForPurchase(purchaseId: string): ConfirmExtractionPayload {
  return extractionsById[purchaseId] ?? emptyExtraction(purchaseId);
}
