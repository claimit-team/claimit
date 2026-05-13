export type PurchaseCategory = "retail" | "airline" | "hotel";
export type PurchaseStatus =
  | "monitoring"
  | "claim drafted"
  | "submitted"
  | "window ending soon"
  | "approved";

export interface Purchase {
  purchaseId: string;
  platform: string;
  title: string;
  category: PurchaseCategory;
  status: PurchaseStatus;
  windowRemaining: string;
}

export const mockPurchases: Purchase[] = [
  {
    purchaseId: "purchase_001",
    platform: "Best Buy",
    title: "Sony WH-1000XM5",
    category: "retail",
    status: "monitoring",
    windowRemaining: "11 days remaining",
  },
  {
    purchaseId: "purchase_002",
    platform: "Southwest",
    title: "LAX ↔ MIA",
    category: "airline",
    status: "claim drafted",
    windowRemaining: "Before departure",
  },
  {
    purchaseId: "purchase_003",
    platform: "Hilton",
    title: "Hilton Waikiki stay",
    category: "hotel",
    status: "submitted",
    windowRemaining: "Outcome needed",
  },
  {
    purchaseId: "purchase_004",
    platform: "Amazon",
    title: "AirPods Pro 2",
    category: "retail",
    status: "monitoring",
    windowRemaining: "22 days remaining",
  },
  {
    purchaseId: "purchase_005",
    platform: "Delta Air Lines",
    title: "NYC → LAX",
    category: "airline",
    status: "window ending soon",
    windowRemaining: "3 days remaining",
  },
  {
    purchaseId: "purchase_006",
    platform: "Target",
    title: "Kitchen espresso machine",
    category: "retail",
    status: "monitoring",
    windowRemaining: "30 days remaining",
  },
  {
    purchaseId: "purchase_007",
    platform: "United Airlines",
    title: "ORD → DEN",
    category: "airline",
    status: "approved",
    windowRemaining: "Fare drop honored",
  },
  {
    purchaseId: "purchase_008",
    platform: "Marriott Bonvoy",
    title: "San Diego Waterfront",
    category: "hotel",
    status: "monitoring",
    windowRemaining: "45 days remaining",
  },
];
