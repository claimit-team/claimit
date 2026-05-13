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

/** Rows shown on `/purchases` — hide purchases still on the mandatory confirm step. */
export function getPurchasesForListView(): Purchase[] {
  return mockPurchases.filter((p) => p.confirmationState !== "pending_confirmation");
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

// --- Purchase detail (Batch 6) ---

export type PurchaseDetailMonitoringStatus =
  | "monitoring"
  | "eligible_drop"
  | "claim_active"
  | "claim_resolved"
  | "window_expired"
  | "stopped";

export type RelatedClaimBriefStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "resolved";

export type RelatedClaimType = "chat_script" | "email_template" | "phone_guide";

export interface RelatedClaimBrief {
  claimId: string;
  status: RelatedClaimBriefStatus;
  claimType: RelatedClaimType;
  amount: number;
  currency: string;
  createdAt: string;
}

export interface PriceHistoryPointVm {
  date: string;
  price: number;
  dropDetected: boolean;
}

export type PurchaseDetailOriginalSource = "upload" | "email" | "api";

export interface PurchaseDetailExtension {
  monitoringStatus: PurchaseDetailMonitoringStatus;
  purchaseDate: string;
  orderId: string;
  pricePaid: number;
  currency: string;
  priceHistory: PriceHistoryPointVm[];
  currentPrice: number;
  lowestSeen: number;
  highestSeen: number;
  lastCheckedIso: string;
  windowEndDate: string;
  daysRemaining: number;
  policySummary: string;
  policyFullUrl: string;
  relatedClaims: RelatedClaimBrief[];
  memberTier?: string;
  sourceEmail?: string;
  purchaseSource?: PurchaseDetailOriginalSource;
}

/** Row used by `/purchases/[id]` merged from list + extensions. */
export interface PurchaseDetailViewModel extends Purchase {
  monitoringStatus: PurchaseDetailMonitoringStatus;
  purchaseDate: string;
  orderId: string;
  pricePaid: number;
  currency: string;
  priceHistory: PriceHistoryPointVm[];
  currentPrice: number;
  lowestSeen: number;
  highestSeen: number;
  lastCheckedIso: string;
  windowEndDate: string;
  daysRemaining: number;
  policySummary: string;
  policyFullUrl: string;
  relatedClaims: RelatedClaimBrief[];
  memberTier?: string;
  sourceEmail?: string;
  purchaseSource: PurchaseDetailOriginalSource;
}

const purchaseDetailExtensions: Partial<Record<string, PurchaseDetailExtension>> = {
  purchase_001: {
    monitoringStatus: "eligible_drop",
    purchaseDate: "2026-05-01",
    orderId: "BBY-987654",
    pricePaid: 299.99,
    currency: "USD",
    priceHistory: [
      { date: "2026-05-01", price: 299.99, dropDetected: false },
      { date: "2026-05-03", price: 299.99, dropDetected: false },
      { date: "2026-05-05", price: 289.99, dropDetected: false },
      { date: "2026-05-08", price: 269.99, dropDetected: false },
      { date: "2026-05-10", price: 249.99, dropDetected: true },
      { date: "2026-05-13", price: 249.99, dropDetected: false },
    ],
    currentPrice: 249.99,
    lowestSeen: 249.99,
    highestSeen: 299.99,
    lastCheckedIso: "2026-05-13T18:00:00Z",
    windowEndDate: "2026-05-31",
    daysRemaining: 11,
    policySummary: "Best Buy matches identical product price within 30 days of purchase.",
    policyFullUrl: "/mock/policies/best-buy",
    relatedClaims: [
      {
        claimId: "claim_001",
        status: "awaiting_approval",
        claimType: "chat_script",
        amount: 45,
        currency: "USD",
        createdAt: "2026-05-10",
      },
    ],
    purchaseSource: "upload",
  },
};

export function getPurchaseDetailViewModel(
  purchaseId: string,
): PurchaseDetailViewModel | undefined {
  const base = getPurchaseById(purchaseId);
  const ext = purchaseDetailExtensions[purchaseId];
  if (!base || !ext) return undefined;
  if (base.confirmationState !== "confirmed") return undefined;

  return {
    ...base,
    monitoringStatus: ext.monitoringStatus,
    purchaseDate: ext.purchaseDate,
    orderId: ext.orderId,
    pricePaid: ext.pricePaid,
    currency: ext.currency,
    priceHistory: ext.priceHistory,
    currentPrice: ext.currentPrice,
    lowestSeen: ext.lowestSeen,
    highestSeen: ext.highestSeen,
    lastCheckedIso: ext.lastCheckedIso,
    windowEndDate: ext.windowEndDate,
    daysRemaining: ext.daysRemaining,
    policySummary: ext.policySummary,
    policyFullUrl: ext.policyFullUrl,
    relatedClaims: ext.relatedClaims,
    memberTier: ext.memberTier,
    sourceEmail: ext.sourceEmail,
    purchaseSource: ext.purchaseSource ?? "upload",
  };
}

export function formatPurchaseCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatPurchaseDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatPurchaseShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function getPurchaseRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}
