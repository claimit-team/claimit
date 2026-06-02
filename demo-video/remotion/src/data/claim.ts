// Hard-coded demo data from FRONTEND_RECON.md §8 — Apple AirPods Pro,
// Best Buy, $199 → $149, $50 refund, 60-day Plus window.
import type { ClaimDetail } from "@/lib/claim-detail-types";

export const MOCK_CLAIM: ClaimDetail = {
  claim_id: "demo-claim-airpods-001",
  status: "awaiting_approval",
  claim_type: "email",
  platform: "Best Buy",
  product_name: "Apple AirPods Pro",
  refund_amount: 50,
  currency: "USD",
  // Storyboard + script say "8 days remaining". formatClaimRemainingTime
  // does `Math.ceil(hours/24)`, so we set the wire value to *exactly*
  // 8 × 24 = 192 to land on the spec'd label.
  window_remaining_hours: 192,
  draft_versions: [
    {
      version: 1,
      content:
        "Hi Best Buy team,\n\nI purchased a pair of Apple AirPods Pro on May 14, 2026 (order BBY-201-AIRPODS) for $199.00. " +
        "I noticed that the same item is now listed at $149.00 on bestbuy.com — a $50 difference, well within the 60-day " +
        "price match window for Best Buy Plus members.\n\nUnder your published price match policy, I'd like to request a " +
        "$50 refund to the original payment method.\n\nThanks,\nThe ClaimIt agent on behalf of the cardholder",
      created_at: "2026-05-31T17:00:00Z",
      generated_by: "agent",
    },
  ],
  current_version: 1,
  evidence: {
    current_price: 149,
    original_price: 199,
    screenshot_url: "",
    captured_at: "2026-05-31T16:58:00Z",
    source_url: "https://www.bestbuy.com/site/apple-airpods-pro/0000.p",
    policy_clause:
      "If a qualifying item you bought from Best Buy is reduced in price within 15 days of purchase (or 60 days for Plus members), we'll refund the difference upon request.",
    policy_url: "https://www.bestbuy.com/site/help-topics/price-match-guarantee",
  },
  purchase: {
    purchase_id: "demo-purchase-airpods-001",
    purchase_date: "2026-05-14T00:00:00Z",
    order_id: "BBY-201-AIRPODS",
    price_paid: 199,
  },
  policy: {
    claim_email: "claims@bestbuy.com",
    claim_url: "https://www.bestbuy.com/site/help-topics/price-match-guarantee",
    claim_phone: "",
    window_days: 60,
    policy_url: "https://www.bestbuy.com/site/help-topics/price-match-guarantee",
    last_verified: "2026-05-30T12:00:00Z",
  },
  subject: "Price adjustment request — order BBY-201-AIRPODS",
};
