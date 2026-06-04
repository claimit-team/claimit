// ─────────────────────────────────────────────────────────────────────────
// uiref fixture data — Costco iPad Air M2 (packages/shared/fixtures/*.costco.json)
// Hard-coded here so each uiref is a deterministic static frame. Values are
// lifted verbatim from purchase.costco.json + claim.costco.json + price_history.costco.json.
// Temporal frame is anchored to the fixture's reference instant (2026-05-31),
// so relative-time strings ("21 days remaining", "5 minutes ago") are stable.
// ─────────────────────────────────────────────────────────────────────────

export const COSTCO = {
  platformRaw: "costco",
  platformLabel: "Costco",
  category: "retail" as const,
  productName: "Apple iPad Air 11-inch (M2, 128GB, Wi-Fi)",
  productId: "1820413",
  productUrl:
    "https://www.costco.com/apple-ipad-air-m2-11-inch-128gb-wifi.product.4000236789.html",
  policyUrl: "https://www.costco.com/price-adjustment.html",
  variant: "Space Gray",
  orderId: "1185402639",
  pricePaid: 599.99,
  currentPrice: 499.99,
  diff: 100.0,
  claimAmount: 100.0,
  currency: "USD",
  memberTier: "Executive",
  purchaseDateLong: "May 22, 2026", // purchase_date 2026-05-22
  capturedAtLong: "May 31, 2026, 4:00 PM", // price_history checked_at 2026-05-31T16:00
  windowEndShort: "Jun 21", // window_expires 2026-06-21
  purchaseDateShort: "May 22",
  windowRemaining: "21 days remaining", // from 2026-05-31 → 2026-06-21
  policyClause:
    "Members can request a price adjustment within 30 days if the price of an item drops at Costco; refund is issued as member account credit.",
  policyVerifiedLong: "May 1, 2026",
  subject: "Price match refund — Order 1185402639", // deriveEmailSubject(orderId)
} as const;

// Draft v1 — generated_by "agent" (claim.costco.json draft_versions[0].content)
export const DRAFT_V1 = `Hello Costco Member Service,

I placed order 1185402639 on 2026-05-22 for the Apple iPad Air 11-inch (M2, 128GB, Wi-Fi), item 1820413, at $599.99. As of 2026-05-31 the same item is listed at Costco for $499.99 — a $100.00 reduction within the 30-day price-adjustment window.

Please apply a price adjustment of $100.00 as member account credit.

Thank you,
Jane Doe
Costco Executive Member #111 222 333 444`;

// Draft v2 — generated_by "assistant_redraft" (claim.costco.json draft_versions[1].content)
export const DRAFT_V2 = `Hello Costco Member Service,

I hope you're well. I placed order 1185402639 on May 22, 2026 for the Apple iPad Air 11-inch (M2, 128GB, Wi-Fi), item 1820413, at $599.99. As of May 31, 2026, the same item is listed at Costco for $499.99 — a $100.00 drop, well within the 30-day price-adjustment window.

Would you please apply a one-time price adjustment of $100.00 as member account credit? I'd really appreciate your help.

Warm regards,
Jane Doe
Costco Executive Member #111 222 333 444`;

// Synthesized price-history series (price_history.costco.json carries a single
// snapshot; the VM's priceHistory would be 1 point. A faithful monitored
// series tracks retail flat at $599.99 then drops to $499.99 on the
// 2026-05-31 sweep — the drop point renders the amber CustomDot).
export const PRICE_SERIES: { date: string; formattedDate: string; price: number; dropDetected: boolean }[] =
  [
    { date: "2026-05-22", formattedDate: "May 22", price: 599.99, dropDetected: false },
    { date: "2026-05-24", formattedDate: "May 24", price: 599.99, dropDetected: false },
    { date: "2026-05-26", formattedDate: "May 26", price: 599.99, dropDetected: false },
    { date: "2026-05-28", formattedDate: "May 28", price: 599.99, dropDetected: false },
    { date: "2026-05-30", formattedDate: "May 30", price: 599.99, dropDetected: false },
    { date: "2026-05-31", formattedDate: "May 31", price: 499.99, dropDetected: true },
  ];

// Assistant exchange shown in surface #5 (claimshell-assistant-active).
// User asks the verbatim quick action; assistant confirms the v2 redraft.
export const ASSISTANT_TURN = {
  userText: "Make it friendlier",
  // MarkdownMessage renders markdown; **bold** segments preserved as <strong>.
  assistantText:
    "Done — I've rewritten the draft in a warmer, friendlier tone. The new version (v2) opens with a polite greeting and frames the request more graciously, while keeping every key fact intact: order **1185402639**, the **$100.00** price drop, and the 30-day adjustment window. Take a look in the Draft panel.",
  toolName: "request_redraft",
  traceId: "trace-c0a1b2c3",
} as const;

// /claims list rows (surfaces #3 + #2 needs-attention context). The Costco
// iPad is the only real fixture; the other rows are representative seeded
// list-texture claims the user requested for status variety
// ("2-3 other seeded claims — 1 draft + 1 sent + 1 resolved").
export type ListClaim = {
  id: string;
  platformRaw: string;
  platformLabel: string;
  category: "retail" | "airline" | "hotel";
  product: string;
  type: string; // claimTypeLabel
  amount: number;
  amountStr: string;
  outcome: "draft_pending" | "pending" | "approved" | "denied";
  windowCell: string;
  submitted: string;
};

export const LIST_CLAIMS: ListClaim[] = [
  {
    id: "costco",
    platformRaw: "costco",
    platformLabel: "Costco",
    category: "retail",
    product: "Apple iPad Air 11-inch (M2, 128GB, Wi-Fi)",
    type: "Email",
    amount: 100,
    amountStr: "$100.00",
    outcome: "draft_pending",
    windowCell: "21 days remaining",
    submitted: "—",
  },
  {
    id: "bestbuy",
    platformRaw: "best_buy",
    platformLabel: "Best Buy",
    category: "retail",
    product: "Sony WH-1000XM5 Headphones",
    type: "Self service",
    amount: 50,
    amountStr: "$50.00",
    outcome: "pending",
    windowCell: "Submitted 2 days ago",
    submitted: "May 30, 2026",
  },
  {
    id: "target",
    platformRaw: "target",
    platformLabel: "Target",
    category: "retail",
    product: "Dyson V8 Origin Vacuum",
    type: "Email",
    amount: 40,
    amountStr: "$40.00",
    outcome: "approved",
    windowCell: "Resolved May 28, 2026",
    submitted: "May 24, 2026",
  },
  {
    id: "amazon",
    platformRaw: "amazon",
    platformLabel: "Amazon",
    category: "retail",
    product: "Anker 737 Power Bank",
    type: "Chat script",
    amount: 18,
    amountStr: "$18.00",
    outcome: "denied",
    windowCell: "Resolved May 26, 2026",
    submitted: "May 22, 2026",
  },
];
