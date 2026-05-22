/**
 * Vitest unit tests for the four claim_type draft parsers in
 * `draft-parsers.ts`. Fixtures are lifted directly from the matching
 * generators in [`apps/claim-agent/src/draft/*.py`](apps/claim-agent/src/draft/)
 * so the parsers stay pinned to the real wire format — a generator
 * change that drifts the format will break these tests before it
 * silently fallback-renders into a `<pre>` block in production.
 */
import { describe, expect, it } from "vitest";

import {
  deriveEmailSubject,
  isValidSelfServiceJson,
  parseChatScript,
  parseInStoreGuide,
  parseOrderSummary,
  parseSelfServiceWalkthrough,
} from "./draft-parsers";

// ---------------------------------------------------------------------------
// chat_script — pinned to type_b_chat.py `_format_chat_script` L100-110
// ---------------------------------------------------------------------------

const CHAT_SCRIPT_HAPPY = `Best Buy Price Match — Order 112-9988776

Step 1: Hi! I'd like to request a price match refund on my recent order.
Step 2: Order number 112-9988776, purchased on 2026-05-04.
Step 3: I paid $249.99 but the current price is $217.99 — please refund the $32 difference.
Step 4: Per Best Buy's Price Match Guarantee, this falls within the 15-day post-purchase window.
Step 5: I have a screenshot of the lower price; I can share it with you here.

--- IF AGENT DECLINES ---

Step 6: Could you please transfer me to a supervisor or open a case for review?
Step 7: What's the formal submission channel, and can I get a reference number for my records?`;

describe("parseChatScript", () => {
  it("parses the canonical 5+2 step output", () => {
    const result = parseChatScript(CHAT_SCRIPT_HAPPY);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Best Buy Price Match — Order 112-9988776");
    expect(result?.mainSteps).toHaveLength(5);
    expect(result?.escalationSteps).toHaveLength(2);
    expect(result?.mainSteps[0]).toContain("price match refund");
    expect(result?.escalationSteps[0]).toContain("supervisor");
  });

  it("returns null when no `Step N:` lines are present (drift)", () => {
    expect(parseChatScript("Hello world")).toBeNull();
    expect(parseChatScript("")).toBeNull();
  });

  it("tolerates a missing escalation section (no divider)", () => {
    const noDivider = `Title only\n\nStep 1: just one step\n`;
    const result = parseChatScript(noDivider);
    expect(result?.mainSteps).toHaveLength(1);
    expect(result?.escalationSteps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// in_store — pinned to type_c_in_store.py `_format_in_store_guide` L72-97
// ---------------------------------------------------------------------------

const IN_STORE_HAPPY = `## In-Store Price Match Guide

**What to Say**
Hi, I'd like to request a Best Buy price match for an item I bought recently — order 112-9988776 — that's now listed at a lower price.

**What to Bring**
- A printed or digital copy of your order confirmation (Order #: 112-9988776)
- A screenshot of the current lower price ($217.99) on bestbuy.com

**Talking Points**
1. The item was purchased on May 4, 2026 — within the 15-day price match window.
2. I paid $249.99 originally; the current price is $217.99.
3. Per Best Buy's Price Match Guarantee, the difference should be refunded to my original payment method.

**Policy Reference**
Best Buy Price Match Guarantee — applies to identical items priced lower at Best Buy.com within 15 days of purchase, refunded to the original tender.

**If Your Claim Is Denied**
Politely ask for a manager and reference Best Buy's published Price Match Guarantee at https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat297300050000.c?id=pcmcat297300050000`;

describe("parseInStoreGuide", () => {
  it("parses the title and five fixed-order sections", () => {
    const result = parseInStoreGuide(IN_STORE_HAPPY);
    expect(result).not.toBeNull();
    expect(result?.title).toBe("In-Store Price Match Guide");
    expect(result?.sections).toHaveLength(5);
    expect(result?.sections.map((s) => s.key)).toEqual([
      "what_to_say",
      "what_to_bring",
      "talking_points",
      "policy_reference",
      "if_denied",
    ]);
  });

  it("extracts bullets from What to Bring and numbered from Talking Points", () => {
    const result = parseInStoreGuide(IN_STORE_HAPPY);
    const bring = result?.sections[1];
    const talking = result?.sections[2];
    expect(bring?.bullets).toHaveLength(2);
    expect(bring?.bullets[0]).toContain("order confirmation");
    expect(talking?.numbered).toHaveLength(3);
    expect(talking?.numbered[0]).toContain("15-day");
  });

  it("returns null on drift (no `## ` heading)", () => {
    expect(parseInStoreGuide("**Section**\nbody")).toBeNull();
    expect(parseInStoreGuide("")).toBeNull();
  });

  it("returns null when fewer than two sections present (drift)", () => {
    expect(parseInStoreGuide("## Title\n\n**Only One**\nbody")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// self_service — pinned to type_d_self_service.py L297 (JSON of
//                SelfServiceWalkthrough Pydantic model)
// ---------------------------------------------------------------------------

const SELF_SERVICE_HAPPY = JSON.stringify({
  platform_display_name: "Southwest Airlines",
  order_summary: "LAX → MIA flight | Paid 500.00 → Now 372.00 | Save 128.00 USD",
  steps: [
    'Go to https://support.southwest.com and click "Manage Reservations"',
    "Enter your Confirmation #: SW-LAXMIA-22 and your name as it appears on the booking",
    'Click "Change flight"',
    "Find and select the SAME flight: LAX → MIA",
    "Confirm the change — no action needed after this step",
    "Southwest will credit 128.00 USD in Rapid Rewards points to your account",
  ],
  notes: [
    "Eligible only on identical itineraries; route or date changes void the guarantee.",
    "Credit posts as Rapid Rewards points, NOT cash refund.",
    "Must be completed within 24 hours of the price drop for fastest processing.",
  ],
  sub_pattern: "direct_rebook",
  estimated_minutes: 3,
  claim_url: "https://support.southwest.com/helpcenter/s/article/changing-cancelling-flights",
  credit_type: "Rapid Rewards points",
});

describe("parseSelfServiceWalkthrough", () => {
  it("parses the canonical 8-field JSON shape", () => {
    const result = parseSelfServiceWalkthrough(SELF_SERVICE_HAPPY);
    expect(result).not.toBeNull();
    expect(result?.platform_display_name).toBe("Southwest Airlines");
    expect(result?.steps).toHaveLength(6);
    expect(result?.notes).toHaveLength(3);
    expect(result?.sub_pattern).toBe("direct_rebook");
    expect(result?.estimated_minutes).toBe(3);
  });

  it("returns null on malformed JSON", () => {
    expect(parseSelfServiceWalkthrough("not json")).toBeNull();
    expect(parseSelfServiceWalkthrough("")).toBeNull();
    expect(parseSelfServiceWalkthrough("{malformed")).toBeNull();
  });

  it("returns null on shape mismatch (missing fields)", () => {
    const missing = JSON.stringify({ platform_display_name: "X" });
    expect(parseSelfServiceWalkthrough(missing)).toBeNull();
  });

  it("returns null on type mismatch (wrong field type)", () => {
    const wrongType = JSON.stringify({
      platform_display_name: "X",
      order_summary: "X",
      steps: "not-an-array",
      notes: [],
      sub_pattern: "direct_rebook",
      estimated_minutes: 3,
      claim_url: "X",
      credit_type: "X",
    });
    expect(parseSelfServiceWalkthrough(wrongType)).toBeNull();
  });
});

describe("isValidSelfServiceJson", () => {
  it("accepts a valid SelfServiceWalkthrough JSON", () => {
    expect(isValidSelfServiceJson(SELF_SERVICE_HAPPY)).toBe(true);
  });

  it("rejects malformed JSON (used as the WI-3 pre-save gate)", () => {
    expect(isValidSelfServiceJson("{")).toBe(false);
    expect(isValidSelfServiceJson('{"foo": "bar"}')).toBe(false);
  });
});

describe("parseOrderSummary", () => {
  it("extracts the three price points + currency", () => {
    const result = parseOrderSummary(
      "LAX → MIA flight | Paid 500.00 → Now 372.00 | Save 128.00 USD",
    );
    expect(result).not.toBeNull();
    expect(result?.product).toBe("LAX → MIA flight");
    expect(result?.paid).toBe("500.00");
    expect(result?.now).toBe("372.00");
    expect(result?.save).toBe("128.00");
    expect(result?.currency).toBe("USD");
  });

  it("returns null on drift (missing `Paid X → Now Y`)", () => {
    expect(parseOrderSummary("just a product name")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// email — subject derivation
// ---------------------------------------------------------------------------

describe("deriveEmailSubject", () => {
  it("templates the order_id when present", () => {
    expect(deriveEmailSubject("ABC-123")).toBe("Price match refund — Order ABC-123");
  });

  it("falls back to a generic subject when order_id is empty", () => {
    expect(deriveEmailSubject("")).toBe("Price match refund request");
  });
});
