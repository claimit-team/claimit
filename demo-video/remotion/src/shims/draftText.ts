// Shared Costco refund draft text (used by the b19-24 claim beats).
export const DRAFT_V1 = `Hello Costco Member Service,

I placed order 1185402639 on May 22 for the Apple iPad Air 11" M2 at $599.99. As of May 31 it's listed at $499.99 — a $100.00 drop, within the 30-day window.

Please apply a price adjustment as member credit.

Thank you,
Jane Doe`;

export const DRAFT_V2 = `Hi Costco Member Service,

I hope you're well! I picked up the Apple iPad Air 11" M2 (order 1185402639) on May 22 for $599.99. It's now $499.99 — a $100.00 drop, well within the 30-day window.

Would you mind applying a price adjustment as member credit? Thanks so much!

Warmly,
Jane Doe`;

// b22 "quick edit yourself" — greeting tweaked by hand.
export const DRAFT_V2_EDITED = DRAFT_V2.replace("Hi Costco Member Service,", "Hi Costco team,");
