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
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} remaining`;
  return `${remainingHours} hour${remainingHours !== 1 ? "s" : ""} remaining`;
}
