// SHOT_SPEC PART 5 — DP-1..DP-16, verbatim copy. The only content
// allowed on screen during the film. Numbers, names, addresses, and
// order IDs are fabricated for demo purposes; the visual style mirrors
// Best Buy / Amazon / Target / Southwest but no real assets are
// embedded.

import type { ClaimDetail, ClaimDetailDraftType } from "@/lib/claim-detail-types";
import type { PriceHistoryPointVm } from "@/lib/purchase-detail-view";

// ────────────────────────────────────────────────────────────────────
// DP-1 — Purchase chips for Shot 2
// ────────────────────────────────────────────────────────────────────
export interface PurchaseChip {
  title: string;
  paid: number;
  current?: number; // optional drop overlay (Sony hero is the only one)
  hero?: boolean;
}

// BUG-1: display names shortened so they fit the chip width (420 px)
// without truncating. The full canonical names live on the claim
// objects (e.g. SONY_CLAIM.product_name = "Sony WH-1000XM5
// Headphones") — these short forms are Shot 2 chip labels only.
export const DP1_PURCHASE_CHIPS: PurchaseChip[] = [
  {
    title: "Sony WH-1000XM5",
    paid: 399.99,
    current: 349.99,
    hero: true,
  },
  { title: "MacBook Neo A18 Pro", paid: 952.94 },
  { title: "United UA221", paid: 310.0 },
  { title: "Hilton Waikiki · 3 nt", paid: 612.0 },
  { title: "KitchenAid Mixer", paid: 99.99 },
  { title: "Anker USB-C Charger", paid: 34.99 },
];

// ────────────────────────────────────────────────────────────────────
// DP-2 — Gap stat for Shot 3
// ────────────────────────────────────────────────────────────────────
export const DP2_GAP = {
  topNumber: "57%",
  topLabel: "of major retailers offer price adjustments",
  bottomNumber: "7%",
  bottomLabel: "of shoppers ever get one",
  footnote: "Digital Commerce 360 × Bizrate Insights, 2022",
} as const;

// ────────────────────────────────────────────────────────────────────
// DP-3 — Tagline (Shot 4 reveal + Shot 17 echo)
// ────────────────────────────────────────────────────────────────────
export const DP3_TAGLINE = "Your Money, Still Yours." as const;

// ────────────────────────────────────────────────────────────────────
// DP-4 — One-liner (Shot 5)
// ────────────────────────────────────────────────────────────────────
export const DP4_ONE_LINER = {
  lineA: "ClaimIt watches what you buy.",
  lineB_prefix: "When the price drops, it ",
  lineB_navy: "prepares the claim",
  lineB_suffix: " — your way.",
} as const;

// ────────────────────────────────────────────────────────────────────
// DP-5 — Price series for Shot 6 (Best Buy · Sony WH-1000XM5)
// pricePaid 399.99 USD; reference line "Paid $399.99"; amber dot r=6
// when price < paid; line stroke #6B7280, width 2.
// ────────────────────────────────────────────────────────────────────
export const DP5_PRICE_HEADER = "Best Buy · Sony WH-1000XM5 Headphones" as const;
export const DP5_PRICE_CAPTION = "Price drop detected by ClaimIt monitor-agent" as const;
export const DP5_PRICE_PAID = 399.99 as const;
export const DP5_PRICE_CURRENT = 349.99 as const;

export const DP5_PRICE_SERIES: PriceHistoryPointVm[] = [
  { date: "2026-05-19", price: 399.99, dropDetected: false },
  { date: "2026-05-20", price: 399.99, dropDetected: false },
  { date: "2026-05-21", price: 399.99, dropDetected: false },
  { date: "2026-05-22", price: 399.99, dropDetected: false },
  { date: "2026-05-23", price: 379.99, dropDetected: true },
  { date: "2026-05-24", price: 369.99, dropDetected: false },
  { date: "2026-05-25", price: 369.99, dropDetected: false },
  { date: "2026-05-26", price: 359.99, dropDetected: false },
  { date: "2026-05-27", price: 349.99, dropDetected: false },
  { date: "2026-05-28", price: 349.99, dropDetected: false },
  { date: "2026-05-29", price: 349.99, dropDetected: false }, // current
];

// ────────────────────────────────────────────────────────────────────
// DP-6 — Email draft body (Sony / Best Buy)
// ────────────────────────────────────────────────────────────────────
export const DP6_EMAIL_SUBJECT = "Price match refund — Order demo-ord-e273a5c7b4" as const;

// Verbatim body from PART 5. \n\n is the paragraph break.
export const DP6_EMAIL_BODY = `Hello Best Buy Customer Care,

I'm writing to request a price match refund on a recent purchase.

Order demo-ord-e273a5c7b4 — Sony WH-1000XM5 Headphones at $399.99. The current price is $349.99, a difference of $50.00 within the published price match window.

Could you please refund the $50.00 difference to my original payment method? I have the order confirmation and a screenshot of the current price ready to share if you need them.

Thank you,
[Your name]`;

/**
 * Frame offset (Shot 8 local) where the literal substring "$50.00"
 * must first appear complete. Spec §3 Shot 8: "type body so '$50.00'
 * appears f470". Tolerance ±10. Used by ActIII_Stage's typewriter
 * driver to compute chars/frame.
 */
export const DP6_MONEY_LAND_F = 470 as const;

/**
 * BUG-4 (v3 review): the count of body chars Shot 7's entrance pre-
 * populates so the DraftPane's "No draft yet" empty state never
 * coexists with "v1 · AI draft · 4 days ago" version metadata. This
 * is the offset of "Order demo-ord" inside DP6_EMAIL_BODY — covers
 * the greeting + intro paragraph; Shot 8's typewriter takes over
 * from here and writes the specifics (where "$50.00" lands).
 */
export const DP6_BODY_SEED_CHARS = DP6_EMAIL_BODY.indexOf("Order demo-ord");

// ────────────────────────────────────────────────────────────────────
// DP-7 — Evidence pane content (drives EvidencePane)
// ────────────────────────────────────────────────────────────────────
export const DP7_EVIDENCE = {
  originalPrice: 399.99,
  currentPrice: 349.99,
  diff: -50.0,
  screenshotCaption:
    "Captured 2026-05-29 11:34 UTC · Price drop detected by ClaimIt monitor-agent · Source: Best Buy",
  policyLink: "Read Best Buy policy ↗",
  policyVerified: "Policy verified 2026-05-14",
  purchaseDate: "May 19, 2026",
  orderId: "Order demo-ord-e273a5c7b4",
  pricePaidLabel: "Price paid $399.99",
  policyClause:
    "Best Buy Price Match Guarantee: we will match a lower price on an identical item sold by Best Buy within the post-purchase window.",
} as const;

// ────────────────────────────────────────────────────────────────────
// DP-8 — Assistant pane content (drives AssistantPane)
// ────────────────────────────────────────────────────────────────────
export const DP8_ASSISTANT = {
  badge: "🎯 Claim-focused",
  userPill: "Explain the policy match",
  reply: `This claim qualifies for a price match based on the Best Buy Price Match Guarantee. The policy states that if an identical product's price drops at Best Buy within the customer's return window, Best Buy will refund the difference.

Here's how this claim matches:
• Policy Match: The price for the identical headphones dropped by $50.00 at Best Buy, and the purchase date of May 19, 2026, falls within the policy's return window (which expires on June 9, 2026).`,
  toolLine: "Tools · get_reasoning_trace · View trace",
  pills: [
    "Make it friendlier",
    "Why this template?",
    "Explain the policy match",
    "Switch to manual approval",
  ],
} as const;

// ────────────────────────────────────────────────────────────────────
// DP-9 — Approve & send (Shot 11)
// ────────────────────────────────────────────────────────────────────
export const DP9_APPROVE = {
  buttonLabel: "Approve and send",
  dialogTitle: "Send claim email",
  dialogBody:
    "This will send your price match request to Best Buy from your Gmail. You'll be notified when they respond.",
  cancelLabel: "Cancel",
  sendLabel: "Send email",
  badgePost: "Submitted",
  bannerPost: "Submitted — sending from your Gmail.",
} as const;

// ────────────────────────────────────────────────────────────────────
// DP-10 — Money overlay (Shot 12)
// ────────────────────────────────────────────────────────────────────
export const DP10_MONEY_OVERLAY = {
  amberValue: "−$50.00",
  greenValue: "$50.00",
  sub: "Still yours.",
} as const;

// ────────────────────────────────────────────────────────────────────
// DP-11 — Four-types grid label (Shots 13–14)
// ────────────────────────────────────────────────────────────────────
export const DP11_FOUR_TYPES = {
  headline: "Matches the actual claim process for each platform.",
  closing: "One agent. Every platform's real process.",
  footers: {
    email: "ClaimIt sends it from your Gmail.",
    chat_script: "ClaimIt writes the script. You run the chat.",
    in_store_guide: "ClaimIt preps the guide. You bring it in.",
    self_service_walkthrough: "ClaimIt maps the steps. You submit.",
  } satisfies Record<ClaimDetailDraftType, string>,
} as const;

// ────────────────────────────────────────────────────────────────────
// DP-12 — Chat script (Amazon / Anker)
// paid $34.99, current $16.00, diff $18.99 (sic — verbatim per spec).
// ────────────────────────────────────────────────────────────────────
export const DP12_CHAT = {
  header: "Amazon Price Match — Order demo-ord-5441c5cd19",
  paid: 34.99,
  current: 16.0,
  diff: 18.99,
  body: `Amazon Price Match — Order demo-ord-5441c5cd19
Step 1: Hi! I'd like to request a price match refund on a recent order.
Step 2: Order number demo-ord-5441c5cd19 — Anker USB-C Charger.
Step 3: I paid $34.99 but the current price is $16.00 — please refund the $18.99 difference.
Step 4: This falls within the published price match window for Amazon.
Step 5: I have a screenshot of the current lower price; I can share it with you here.
--- IF AGENT DECLINES ---
Step 6: Could you please transfer me to a supervisor or open a case for review?
Step 7: What's the formal submission channel, and can I get a reference number for my records?`,
} as const;

// ────────────────────────────────────────────────────────────────────
// DP-13 — In-Store guide (Target / KitchenAid)
// paid $99.99, current $79.99, save $20.00.
// ────────────────────────────────────────────────────────────────────
// Body format matches parseInStoreGuide's contract per CC_AUDIT §2.4 B:
//   • Line 1 is `## <title>`.
//   • Each section header is `**<heading>**` ON ITS OWN LINE
//     (regex `^\*\*([^*]+)\*\*$` requires nothing else on that line).
//   • Bullet/numbered lines under each section start with `- ` or `1. `.
// The previous inline `**What to Say** — body…` shape fell through to
// FallbackPre — fixed in P2 review pass.
export const DP13_IN_STORE = {
  paid: 99.99,
  current: 79.99,
  save: 20.0,
  body: `## In-Store Price Match Guide

**What to Say**
Hi, I'd like to request a Target price match for an item I bought recently — order demo-ord-9187ab5660 — that's now listed at a lower price.

**What to Bring**
- A printed or digital copy of your order confirmation (Order #: demo-ord-9187ab5660)
- A screenshot of the current lower price ($79.99)

**Talking Points**
1. The item was purchased recently — within the published price match window.
2. I paid $99.99 originally; the current price is $79.99.
3. Per Target's Price Match Guarantee, the difference should be refunded to my original payment method.

**Policy Reference**
Target Price Match Guarantee — applies to identical items priced lower at Target within the post-purchase window, refunded to the original tender.

**If Your Claim Is Denied**
Politely ask for a manager and reference the published price match policy.`,
} as const;

// ────────────────────────────────────────────────────────────────────
// DP-14 — Self-Service walkthrough (Southwest)
// paid $500.00, current $372.00, save $128.00. Header "LAX → MIA".
// ────────────────────────────────────────────────────────────────────
// DP-14 self-service walkthrough — the wire body MUST be valid JSON
// with the 8 fields parseSelfServiceWalkthrough requires (CC_AUDIT §2.4 C):
//   platform_display_name, order_summary, steps[], notes[],
//   sub_pattern, estimated_minutes, claim_url, credit_type.
// `body` is the serialized JSON the DraftPane will parse; the
// destructured constants are reused by overlays + the four-card
// mini-summary.
export const DP14_SELF_SERVICE = (() => {
  const header = "LAX → MIA";
  const paid = 500.0;
  const current = 372.0;
  const save = 128.0;
  const steps = [
    "Go to Southwest's self-service portal and locate the order management page",
    "Enter your Confirmation #: demo-ord-9a7c402215 and your name as it appears on the booking",
    'Open the "Request a price adjustment" or equivalent form',
    "Select Southwest LAX → MIA flight from the order item list",
    "Submit the price difference ($128.00) request — no further action needed after this step",
    "You'll receive the credit within 1–2 business days",
  ];
  const notes = [
    "Eligible only on identical items / itineraries; modifications may void the guarantee.",
    "Credit posts as a refund to the original payment method or as loyalty credit, depending on Southwest's policy.",
    "Must be completed within the published window for fastest processing.",
  ];
  const body = JSON.stringify(
    {
      platform_display_name: "Southwest",
      order_summary: `Southwest ${header} | Paid ${paid.toFixed(2)} → Now ${current.toFixed(2)} | Save ${save.toFixed(2)} USD`,
      steps,
      notes,
      sub_pattern: "portal_request",
      estimated_minutes: 3,
      claim_url: "https://southwest.example.com/self-service",
      credit_type: "refund to original payment method",
    },
    null,
    2,
  );
  return {
    header,
    paid,
    current,
    save,
    saveCurrency: "USD",
    duration: "~3 min",
    steps,
    notes,
    footer: "Refund to original payment method",
    body,
  };
})();

// ────────────────────────────────────────────────────────────────────
// DP-15 — Trust lines (Shot 15)
// ────────────────────────────────────────────────────────────────────
export const DP15_TRUST = {
  lines: ["You approve every claim.", "Every step is traceable.", "Least-access Gmail."],
  closing:
    "ClaimIt prepares the claim. You stay in control — it doesn't promise the refund, it makes sure you can ask for it.",
} as const;

// ────────────────────────────────────────────────────────────────────
// DP-16 — Close / credits (Shot 18)
// ────────────────────────────────────────────────────────────────────
export const DP16_CLOSE = {
  sonyChipPrice: "$349.99",
  sonyChipPaidPrice: "$399.99",
  sonyChipDelta: "+$50.00",
  sonyChipNote: "reclaimed",
  // REDESIGN-3: closing line for the Shot 16 "money came back" beat
  lineThe50: "The $50 came back.",
  tagline: "Your Money, Still Yours.",
  brand: "ClaimIt",
  team: ["Erdun E", "Raj Kavathekar", "Will Wan", "Chris Chen"],
  teamLine: "Erdun E · Raj Kavathekar · Will Wan · Chris Chen",
  url: "claimitai.vercel.app",
} as const;

// ────────────────────────────────────────────────────────────────────
// Composite: a single ClaimDetail object the real ClaimDetailShell
// consumes. Composed of DP-6 (email body), DP-7 (evidence), DP-9
// (status + outcome). The DraftPane / EvidencePane / AssistantPane
// shapes match `claim-detail-types.ts` 1:1 so the real shell mounts.
// ────────────────────────────────────────────────────────────────────
export const SONY_CLAIM: ClaimDetail = {
  claim_id: "demo-claim-sony-001",
  status: "awaiting_approval",
  claim_type: "email",
  platform: "Best Buy",
  product_name: "Sony WH-1000XM5 Headphones",
  refund_amount: 50.0,
  currency: "USD",
  // 8 days remaining — Math.ceil(192/24) = 8, so the header chip
  // reads "8 days remaining" (P5 review fix).
  window_remaining_hours: 192,
  draft_versions: [
    {
      version: 1,
      content: DP6_EMAIL_BODY,
      created_at: "2026-05-29T11:34:00Z",
      generated_by: "agent",
    },
  ],
  current_version: 1,
  evidence: {
    current_price: 349.99,
    original_price: 399.99,
    screenshot_url: "/demo/best-buy-sony-screenshot.png",
    captured_at: "2026-05-29T11:34:00Z",
    source_url: "https://www.bestbuy.com/site/sony-wh-1000xm5",
    policy_clause: DP7_EVIDENCE.policyClause,
    policy_url: "https://www.bestbuy.com/site/price-match-guarantee",
  },
  purchase: {
    purchase_id: "demo-purchase-sony-001",
    purchase_date: "2026-05-19",
    order_id: "demo-ord-e273a5c7b4",
    price_paid: 399.99,
  },
  policy: {
    claim_email: "customercare@bestbuy.com",
    claim_url: "https://www.bestbuy.com/site/price-match-guarantee",
    claim_phone: "+1-888-237-8289",
    window_days: 15,
    policy_url: "https://www.bestbuy.com/site/price-match-guarantee",
    last_verified: "2026-05-14T00:00:00Z",
  },
  outcome: null,
  subject: DP6_EMAIL_SUBJECT,
};

// Convenience: the four claim variants for the four-card grid in
// Shots 13–14. Each is a full ClaimDetail because the real DraftPane
// branches consume the same shape with different `claim_type`.
function makeChatClaim(): ClaimDetail {
  return {
    ...SONY_CLAIM,
    claim_id: "demo-claim-anker-001",
    claim_type: "chat_script",
    platform: "Amazon",
    product_name: "Anker USB-C Charger",
    refund_amount: DP12_CHAT.diff,
    draft_versions: [
      {
        version: 1,
        content: DP12_CHAT.body,
        created_at: "2026-05-29T11:34:00Z",
        generated_by: "agent",
      },
    ],
    evidence: {
      ...SONY_CLAIM.evidence,
      original_price: DP12_CHAT.paid,
      current_price: DP12_CHAT.current,
    },
    purchase: {
      ...SONY_CLAIM.purchase,
      purchase_id: "demo-purchase-anker-001",
      order_id: "demo-ord-5441c5cd19",
      price_paid: DP12_CHAT.paid,
    },
    subject: null,
  };
}

function makeInStoreClaim(): ClaimDetail {
  return {
    ...SONY_CLAIM,
    claim_id: "demo-claim-kitchenaid-001",
    claim_type: "in_store_guide",
    platform: "Target",
    product_name: "KitchenAid Stand Mixer",
    refund_amount: DP13_IN_STORE.save,
    draft_versions: [
      {
        version: 1,
        content: DP13_IN_STORE.body,
        created_at: "2026-05-29T11:34:00Z",
        generated_by: "agent",
      },
    ],
    evidence: {
      ...SONY_CLAIM.evidence,
      original_price: DP13_IN_STORE.paid,
      current_price: DP13_IN_STORE.current,
    },
    purchase: {
      ...SONY_CLAIM.purchase,
      purchase_id: "demo-purchase-kitchenaid-001",
      order_id: "demo-ord-9187ab5660",
      price_paid: DP13_IN_STORE.paid,
    },
    subject: null,
  };
}

function makeSelfServiceClaim(): ClaimDetail {
  return {
    ...SONY_CLAIM,
    claim_id: "demo-claim-southwest-001",
    claim_type: "self_service_walkthrough",
    platform: "Southwest",
    product_name: "Southwest LAX → MIA",
    refund_amount: DP14_SELF_SERVICE.save,
    draft_versions: [
      {
        version: 1,
        content: DP14_SELF_SERVICE.body,
        created_at: "2026-05-29T11:34:00Z",
        generated_by: "agent",
      },
    ],
    evidence: {
      ...SONY_CLAIM.evidence,
      original_price: DP14_SELF_SERVICE.paid,
      current_price: DP14_SELF_SERVICE.current,
    },
    purchase: {
      ...SONY_CLAIM.purchase,
      purchase_id: "demo-purchase-southwest-001",
      order_id: "demo-ord-9a7c402215",
      price_paid: DP14_SELF_SERVICE.paid,
    },
    subject: null,
  };
}

export const EMAIL_CLAIM = SONY_CLAIM;
export const CHAT_CLAIM = makeChatClaim();
export const IN_STORE_CLAIM = makeInStoreClaim();
export const SELF_SERVICE_CLAIM = makeSelfServiceClaim();

export const FOUR_CARD_GRID_CLAIMS = {
  email: EMAIL_CLAIM,
  chat_script: CHAT_CLAIM,
  in_store_guide: IN_STORE_CLAIM,
  self_service_walkthrough: SELF_SERVICE_CLAIM,
} as const;
