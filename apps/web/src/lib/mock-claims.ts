export type ClaimStatus =
  | "drafted"
  | "awaiting_approval"
  | "queued_for_send"
  | "low_confidence"
  | "submitted"
  | "approved"
  | "denied"
  | "expired"
  | "no_response";

export type ClaimType = "email" | "chat_script" | "in_store" | "self_service";

export interface Claim {
  claimId: string;
  status: ClaimStatus;
  platform: string;
  productName: string;
  claimType: ClaimType;
  amount: number;
  currency: string;
  windowLabel: string;
  submittedDate: string | null;
  resolvedDate: string | null;
}

/** Canonical demo claims aligned with dashboard needsAttention IDs (claim_001, claim_002). */
export const mockClaims: Claim[] = [
  {
    claimId: "claim_001",
    status: "drafted",
    platform: "Best Buy",
    productName: "Sony WH-1000XM5",
    claimType: "chat_script",
    amount: 45,
    currency: "USD",
    windowLabel: "11 days remaining",
    submittedDate: null,
    resolvedDate: null,
  },
  {
    claimId: "claim_002",
    status: "submitted",
    platform: "Hilton",
    productName: "Hilton Waikiki stay",
    claimType: "email",
    amount: 74,
    currency: "USD",
    windowLabel: "Awaiting merchant response",
    submittedDate: "2026-05-07",
    resolvedDate: null,
  },
  {
    claimId: "claim_003",
    status: "approved",
    platform: "Southwest Airlines",
    productName: "LAX ↔ MIA",
    claimType: "self_service",
    amount: 128,
    currency: "USD",
    windowLabel: "Closed · price match honored",
    submittedDate: "2026-04-12",
    resolvedDate: "2026-04-18",
  },
  {
    claimId: "claim_004",
    status: "low_confidence",
    platform: "Delta Air Lines",
    productName: "NYC → LAX",
    claimType: "email",
    amount: 55,
    currency: "USD",
    windowLabel: "7 days remaining",
    submittedDate: null,
    resolvedDate: null,
  },
  {
    claimId: "claim_005",
    status: "queued_for_send",
    platform: "Amazon",
    productName: "AirPods Pro 2",
    claimType: "chat_script",
    amount: 32,
    currency: "USD",
    windowLabel: "14 days remaining",
    submittedDate: null,
    resolvedDate: null,
  },
  {
    claimId: "claim_006",
    status: "awaiting_approval",
    platform: "Target",
    productName: "Kitchen stand mixer",
    claimType: "in_store",
    amount: 19.99,
    currency: "USD",
    windowLabel: "4 days remaining",
    submittedDate: null,
    resolvedDate: null,
  },
  {
    claimId: "claim_007",
    status: "denied",
    platform: "United Airlines",
    productName: "SFO → ORD change fee",
    claimType: "email",
    amount: 0,
    currency: "USD",
    windowLabel: "Policy exception not granted",
    submittedDate: "2026-03-02",
    resolvedDate: "2026-03-09",
  },
  {
    claimId: "claim_008",
    status: "expired",
    platform: "Nordstrom",
    productName: "Men's blazer",
    claimType: "self_service",
    amount: 40,
    currency: "USD",
    windowLabel: "Past window · not submitted",
    submittedDate: null,
    resolvedDate: null,
  },
];
