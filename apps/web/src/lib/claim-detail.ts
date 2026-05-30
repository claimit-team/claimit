import type { ClaimConversation, ClaimDetail } from "@/lib/claim-detail-types";

const chatScriptV1 = `[Opening]
Hi! I'd like to request a price match...

[Details]
Order: BBY-987654
Product: Sony WH-1000XM5
Original: $299.99
Current: $249.99

[Policy Reference]
Per your 15-day price match guarantee...

[Closing]
Thank you for your help!`;

const chatScriptV2 = `[Opening]
Hello, I noticed the price on my recent purchase has dropped and I'd like to request a price match adjustment.

[Purchase Details]
- Order Number: BBY-987654
- Product: Sony WH-1000XM5 Wireless Headphones
- Purchase Date: May 1st, 2026
- Price Paid: $299.99
- Current Price: $249.99
- Difference: $45.00

[Policy Reference]
I believe this qualifies under Best Buy's 15-day price match guarantee.

[Request]
Could you please help me process a $45 price adjustment to my original payment method?

[Closing]
Thank you so much for your assistance!`;

const claim002EmailDraft = `Subject: Hilton reservation price adjustment

Hello Hilton Guest Assistance,

I'd like to request a price match on my recent Waikiki booking. The nightly rate dropped after I booked.

Booking reference: HLW-QR882
Original confirmation total implied a higher nightly rate than currently shown on Hilton.com.

Thanks,
[Your name]`;

const claimDetailById: Record<string, ClaimDetail> = {
  claim_001: {
    claim_id: "claim_001",
    status: "awaiting_approval",
    claim_type: "chat_script",
    platform: "Best Buy",
    product_name: "Sony WH-1000XM5",
    refund_amount: 45,
    currency: "USD",
    window_remaining_hours: 264,
    draft_versions: [
      { version: 1, content: chatScriptV1, created_at: "2026-05-10T18:00:00Z" },
      { version: 2, content: chatScriptV2, created_at: "2026-05-13T20:00:00Z" },
    ],
    current_version: 2,
    evidence: {
      current_price: 249.99,
      original_price: 299.99,
      screenshot_url: "/mock/bestbuy-price.png",
      captured_at: "2026-05-13T20:00:00Z",
      policy_clause:
        "Best Buy will match the price if you find a lower price within 15 days of your purchase. We'll refund the difference in the form of your original payment method.",
      policy_url: "/mock/policies/best-buy",
    },
    purchase: {
      purchase_id: "purchase_001",
      purchase_date: "2026-05-01",
      order_id: "BBY-987654",
      price_paid: 299.99,
    },
  },
  claim_002: {
    claim_id: "claim_002",
    status: "submitted",
    claim_type: "email",
    platform: "Hilton",
    product_name: "Hilton Waikiki stay",
    refund_amount: 74,
    currency: "USD",
    window_remaining_hours: 120,
    draft_versions: [
      { version: 1, content: claim002EmailDraft, created_at: "2026-05-07T14:00:00Z" },
    ],
    current_version: 1,
    evidence: {
      current_price: 189,
      original_price: 263,
      screenshot_url: "/mock/hilton-price.png",
      captured_at: "2026-05-06T09:30:00Z",
      policy_clause:
        "Hilton's Best Rate Guarantee may provide price adjustments when you find a lower qualified rate for the same accommodations.",
      policy_url: "/mock/policies/hilton",
    },
    purchase: {
      purchase_id: "purchase_003",
      purchase_date: "2026-05-03",
      order_id: "HLW-QR882",
      price_paid: 263,
    },
  },
  // Minimal detail entries for claim_003 through claim_008. claim_001 / claim_002
  // remain the flagship rich examples; the rest carry just enough payload to
  // exercise the detail view without inventing flow-critical content.
  claim_003: {
    claim_id: "claim_003",
    status: "approved",
    claim_type: "self_service_walkthrough",
    platform: "Southwest Airlines",
    product_name: "LAX ↔ MIA",
    refund_amount: 128,
    currency: "USD",
    window_remaining_hours: 0,
    draft_versions: [
      {
        version: 1,
        content:
          "Self-service walkthrough: open Southwest's Manage Reservation, locate the price-honored credit, and confirm the $128 travel fund posts to your account.",
        created_at: "2026-04-12T15:00:00Z",
      },
    ],
    current_version: 1,
    evidence: {
      current_price: 372,
      original_price: 500,
      screenshot_url: "/mock/southwest-price.png",
      captured_at: "2026-04-11T18:00:00Z",
      policy_clause:
        "Southwest applies the difference as Travel Funds when the same itinerary drops in price after booking.",
      policy_url: "/mock/policies/southwest",
    },
    purchase: {
      purchase_id: "purchase_002",
      purchase_date: "2026-04-01",
      order_id: "SW-LAXMIA-22",
      price_paid: 500,
    },
  },
  claim_004: {
    claim_id: "claim_004",
    status: "awaiting_approval",
    claim_type: "email",
    platform: "Delta Air Lines",
    product_name: "NYC → LAX",
    refund_amount: 55,
    currency: "USD",
    window_remaining_hours: 168,
    draft_versions: [
      {
        version: 1,
        content:
          "Subject: NYC → LAX fare adjustment\n\nHi Delta team,\n\nThe fare on confirmation DL-NYCLAX-44 dropped by $55 within the 24-hour change window. Please apply the difference as an eCredit to my SkyMiles account.\n\nThank you,\n[Your name]",
        created_at: "2026-05-12T10:00:00Z",
      },
    ],
    current_version: 1,
    evidence: {
      current_price: 245,
      original_price: 300,
      screenshot_url: "/mock/delta-price.png",
      captured_at: "2026-05-12T09:30:00Z",
      policy_clause:
        "Delta's Best Fare Guarantee may issue an eCredit when the same itinerary drops within the published change window.",
      policy_url: "/mock/policies/delta",
    },
    purchase: {
      purchase_id: "purchase_005",
      purchase_date: "2026-05-11",
      order_id: "DL-NYCLAX-44",
      price_paid: 300,
    },
  },
  claim_005: {
    claim_id: "claim_005",
    status: "queued_for_send",
    claim_type: "chat_script",
    platform: "Amazon",
    product_name: "AirPods Pro 2",
    refund_amount: 32,
    currency: "USD",
    window_remaining_hours: 336,
    draft_versions: [
      {
        version: 1,
        content:
          "Hi! My order 112-9988776 (AirPods Pro 2) dropped from $249 to $217 within Amazon's 30-day post-purchase price protection window. Please refund the $32 difference to my original payment method.",
        created_at: "2026-05-11T19:30:00Z",
      },
    ],
    current_version: 1,
    evidence: {
      current_price: 217,
      original_price: 249,
      screenshot_url: "/mock/amazon-price.png",
      captured_at: "2026-05-11T19:25:00Z",
      policy_clause:
        "Amazon will issue post-purchase price adjustments at the agent's discretion within 30 days of order date.",
      policy_url: "/mock/policies/amazon",
    },
    purchase: {
      purchase_id: "purchase_004",
      purchase_date: "2026-05-04",
      order_id: "112-9988776",
      price_paid: 249,
    },
  },
  claim_006: {
    claim_id: "claim_006",
    status: "awaiting_approval",
    claim_type: "in_store_guide",
    platform: "Target",
    product_name: "Kitchen stand mixer",
    refund_amount: 19.99,
    currency: "USD",
    window_remaining_hours: 96,
    draft_versions: [
      {
        version: 1,
        content:
          "Bring receipt T-2200118 to Guest Services. The mixer dropped $19.99 within Target's 14-day price match window — they will refund the difference to your RedCard.",
        created_at: "2026-05-10T13:00:00Z",
      },
    ],
    current_version: 1,
    evidence: {
      current_price: 80,
      original_price: 99.99,
      screenshot_url: "/mock/target-price.png",
      captured_at: "2026-05-10T12:50:00Z",
      policy_clause:
        "Target Price Match Guarantee covers a Target-owned drop within 14 days of purchase, processed at Guest Services.",
      policy_url: "/mock/policies/target",
    },
    purchase: {
      purchase_id: "purchase_006",
      purchase_date: "2026-05-04",
      order_id: "T-2200118",
      price_paid: 99.99,
    },
  },
  claim_007: {
    claim_id: "claim_007",
    status: "denied",
    claim_type: "email",
    platform: "United Airlines",
    product_name: "SFO → ORD change fee",
    refund_amount: 0,
    currency: "USD",
    window_remaining_hours: 0,
    draft_versions: [
      {
        version: 1,
        content:
          "Subject: SFO → ORD change fee waiver\n\nHello United Customer Care,\n\nRequesting a waiver of the change fee on confirmation UA-SFOORD-12 under the schedule-change exception.\n\nThank you,\n[Your name]",
        created_at: "2026-03-02T11:00:00Z",
      },
    ],
    current_version: 1,
    evidence: {
      current_price: 0,
      original_price: 200,
      screenshot_url: "/mock/united-price.png",
      captured_at: "2026-03-01T14:00:00Z",
      policy_clause:
        "United may waive change fees for schedule changes that exceed the published threshold; non-schedule changes do not qualify.",
      policy_url: "/mock/policies/united",
    },
    purchase: {
      purchase_id: "purchase_007",
      purchase_date: "2026-02-15",
      order_id: "UA-SFOORD-12",
      price_paid: 200,
    },
  },
  claim_008: {
    claim_id: "claim_008",
    status: "expired",
    claim_type: "self_service_walkthrough",
    platform: "Nordstrom",
    product_name: "Men's blazer",
    refund_amount: 40,
    currency: "USD",
    window_remaining_hours: 0,
    draft_versions: [
      {
        version: 1,
        content:
          "Self-service walkthrough: log into Nordstrom.com, open the order, and request a price adjustment. Note the 14-day window has passed for this item.",
        created_at: "2026-04-22T17:00:00Z",
      },
    ],
    current_version: 1,
    evidence: {
      current_price: 160,
      original_price: 200,
      screenshot_url: "/mock/nordstrom-price.png",
      captured_at: "2026-04-22T16:55:00Z",
      policy_clause:
        "Nordstrom honors price adjustments within 14 days of purchase for sale items eligible for adjustment.",
      policy_url: "/mock/policies/nordstrom",
    },
    purchase: {
      purchase_id: "purchase_008",
      purchase_date: "2026-04-01",
      order_id: "NRD-9914",
      price_paid: 200,
    },
  },
};

const conversationByClaimId: Record<string, ClaimConversation> = {
  claim_001: {
    conversation_id: "conv_claim_001",
    claim_id: "claim_001",
    messages: [
      {
        id: "msg_001_a",
        role: "assistant",
        content:
          "I've drafted a chat script citing Best Buy's 15-day price match policy. You can tighten or soften the wording in Edit mode.",
      },
      { id: "msg_001_u1", role: "user", content: "Make it friendlier" },
      {
        id: "msg_001_a2",
        role: "assistant",
        content:
          "Done — version 2 uses warmer language while keeping dates, order ID, and the $45 delta explicit for the agent.",
      },
      { id: "msg_001_u2", role: "user", content: "Why this template?" },
      {
        id: "msg_001_a3",
        role: "assistant",
        content:
          "Live chat tends to resolve price drops fastest; you can paste one segment at a time if the agent asks follow-ups.",
      },
    ],
  },
  claim_002: {
    conversation_id: "conv_claim_002",
    claim_id: "claim_002",
    messages: [
      {
        id: "msg_002_a1",
        role: "assistant",
        content:
          "Here's a concise Hilton BRG-style email draft. Attach your original confirmation and the lower rate screenshot when you send it.",
      },
      { id: "msg_002_u1", role: "user", content: "Should I follow up if they stall?" },
      {
        id: "msg_002_a2",
        role: "assistant",
        content:
          "Give them 3–5 business days, then bump the thread with booking reference HLW-QR882 and the captured nightly rate screenshot.",
      },
    ],
  },
  claim_003: {
    conversation_id: "conv_claim_003",
    claim_id: "claim_003",
    messages: [
      {
        id: "msg_003_a1",
        role: "assistant",
        content:
          "Southwest already honored the $128 difference as Travel Funds — here's the self-service walkthrough to confirm it landed in your account.",
      },
      { id: "msg_003_u1", role: "user", content: "Where do the Travel Funds show up?" },
      {
        id: "msg_003_a2",
        role: "assistant",
        content:
          "Sign into Rapid Rewards, open My Account → Travel Funds. The credit posts under your confirmation number SW-LAXMIA-22.",
      },
    ],
  },
  claim_004: {
    conversation_id: "conv_claim_004",
    claim_id: "claim_004",
    messages: [
      {
        id: "msg_004_a1",
        role: "assistant",
        content:
          "Drafted a short Delta Best Fare Guarantee email — it cites the $55 drop and asks for an eCredit. Approve it whenever you're ready.",
      },
      { id: "msg_004_u1", role: "user", content: "Confidence on this one is low — why?" },
      {
        id: "msg_004_a2",
        role: "assistant",
        content:
          "The fare class on the new price differs slightly from yours; Delta sometimes denies cross-class adjustments. Worth sending anyway.",
      },
    ],
  },
  claim_005: {
    conversation_id: "conv_claim_005",
    claim_id: "claim_005",
    messages: [
      {
        id: "msg_005_a1",
        role: "assistant",
        content:
          "Queued a chat-script for Amazon citing the 30-day post-purchase price protection window. It will send next time you open the chat.",
      },
      { id: "msg_005_u1", role: "user", content: "Do I need to attach anything?" },
      {
        id: "msg_005_a2",
        role: "assistant",
        content:
          "No attachments needed — just paste the script. Order ID 112-9988776 is in the first message so the agent can pull it up.",
      },
    ],
  },
  claim_006: {
    conversation_id: "conv_claim_006",
    claim_id: "claim_006",
    messages: [
      {
        id: "msg_006_a1",
        role: "assistant",
        content:
          "Drafted an in-store walkthrough for Target Guest Services — bring receipt T-2200118 and the price-comparison printout.",
      },
      { id: "msg_006_u1", role: "user", content: "Will they refund to my RedCard?" },
      {
        id: "msg_006_a2",
        role: "assistant",
        content:
          "Yes — Target Price Match refunds to the original payment method. Expect 1-3 days for the credit to post.",
      },
    ],
  },
  claim_007: {
    conversation_id: "conv_claim_007",
    claim_id: "claim_007",
    messages: [
      {
        id: "msg_007_a1",
        role: "assistant",
        content:
          "United denied the change-fee waiver — the schedule shift fell below their published threshold. I've recorded the outcome.",
      },
      { id: "msg_007_u1", role: "user", content: "Anything else worth trying?" },
      {
        id: "msg_007_a2",
        role: "assistant",
        content:
          "Not for this rule. If you have a higher elite tier in the future the threshold is more lenient — I'll surface that next time.",
      },
    ],
  },
  claim_008: {
    conversation_id: "conv_claim_008",
    claim_id: "claim_008",
    messages: [
      {
        id: "msg_008_a1",
        role: "assistant",
        content:
          "Nordstrom's 14-day price-adjustment window already closed for this blazer. I've left a self-service walkthrough in case the policy changes.",
      },
      { id: "msg_008_u1", role: "user", content: "Why didn't this go out earlier?" },
      {
        id: "msg_008_a2",
        role: "assistant",
        content:
          "The drop was first detected on day 15 — outside the eligibility window. The monitoring data point is logged for future reference.",
      },
    ],
  },
};

export function getClaimDetail(claimId: string): ClaimDetail | undefined {
  return claimDetailById[claimId];
}

export function getClaimConversation(claimId: string): ClaimConversation | undefined {
  return conversationByClaimId[claimId];
}

export function formatClaimCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatClaimRemainingTime(hours: number): string {
  if (hours <= 0) return "Expired";
  const days = Math.ceil(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} remaining`;
  return `${remainingHours} hour${remainingHours !== 1 ? "s" : ""} remaining`;
}
