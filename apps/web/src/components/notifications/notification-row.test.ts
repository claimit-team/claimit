/**
 * Title + body builders for the resolver notification types (BUG-82 copy
 * rework). Vitest runs in `environment: "node"` (see
 * apps/web/vitest.config.ts) so we exercise the pure builders directly
 * rather than rendering the component.
 *
 * Covers every (event_type × data.had_url) cell of the BUG-82 copy
 * matrix plus a couple of platform-missing fallbacks to guarantee the
 * generic shape is preserved.
 */

import type { NotificationEvent } from "@claimit/mongodb-types";
import { describe, expect, it } from "vitest";

import { buildBody, buildTitle } from "./notification-row";

function makeNotification(
  event_type: NotificationEvent["event_type"],
  data: Record<string, unknown>,
): NotificationEvent {
  return {
    _id: "00000000-0000-0000-0000-000000000000",
    user_id: "11111111-1111-1111-1111-111111111111",
    event_type,
    entity_type: "purchase",
    entity_id: "22222222-2222-2222-2222-222222222222",
    data,
    acknowledged: false,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  } as NotificationEvent;
}

describe("buildTitle — resolver event_types", () => {
  it("product_url_resolved with had_url=false -> 'Product link found'", () => {
    const n = makeNotification("product_url_resolved", {
      platform: "best_buy",
      had_url: false,
    });
    expect(buildTitle(n)).toBe("Product link found");
  });

  it("product_url_resolved with had_url=true -> 'Product link verified'", () => {
    const n = makeNotification("product_url_resolved", {
      platform: "best_buy",
      had_url: true,
    });
    expect(buildTitle(n)).toBe("Product link verified");
  });

  it("product_url_corrected -> 'Product link verified' from EVENT_LABELS fallback", () => {
    // No title builder for corrected; falls back to the (updated) static
    // EVENT_LABELS entry.
    const n = makeNotification("product_url_corrected", {
      platform: "best_buy",
      had_url: true,
    });
    expect(buildTitle(n)).toBe("Product link verified");
  });

  it("product_url_unresolved with had_url=false -> 'Product link not found'", () => {
    const n = makeNotification("product_url_unresolved", {
      platform: "target",
      had_url: false,
    });
    expect(buildTitle(n)).toBe("Product link not found");
  });

  it("product_url_unresolved with had_url=true -> 'Product link invalid'", () => {
    const n = makeNotification("product_url_unresolved", {
      platform: "target",
      had_url: true,
    });
    expect(buildTitle(n)).toBe("Product link invalid");
  });
});

describe("buildBody — resolver event_types (BUG-82 copy matrix)", () => {
  it("product_url_resolved + had_url=false + best_buy", () => {
    const n = makeNotification("product_url_resolved", {
      platform: "best_buy",
      had_url: false,
    });
    expect(buildBody(n)).toBe(
      "Your Best Buy product link is ready — we'll start tracking the price",
    );
  });

  it("product_url_resolved + had_url=true + best_buy", () => {
    const n = makeNotification("product_url_resolved", {
      platform: "best_buy",
      had_url: true,
    });
    expect(buildBody(n)).toBe(
      "Your Best Buy product link has been verified — we'll start tracking the price",
    );
  });

  it("product_url_corrected + best_buy (had_url ignored, always 'verified')", () => {
    const n = makeNotification("product_url_corrected", {
      platform: "best_buy",
      had_url: true,
    });
    expect(buildBody(n)).toBe(
      "Your Best Buy product link has been verified — we'll start tracking the price",
    );
  });

  it("product_url_unresolved + had_url=false + target", () => {
    const n = makeNotification("product_url_unresolved", {
      platform: "target",
      had_url: false,
    });
    expect(buildBody(n)).toBe("We couldn't find your Target product link");
  });

  it("product_url_unresolved + had_url=true + target", () => {
    const n = makeNotification("product_url_unresolved", {
      platform: "target",
      had_url: true,
    });
    expect(buildBody(n)).toBe("We couldn't verify the Target link you provided");
  });

  it("platform-missing fallback drops the platform clause but keeps the verb", () => {
    const n = makeNotification("product_url_resolved", { had_url: false });
    expect(buildBody(n)).toBe("Your product link is ready — we'll start tracking the price");
  });

  it("platform-slug pretty-prints via getPlatformLabel", () => {
    // dicks_sporting_goods is in PLATFORM_LABELS as "Dick's Sporting Goods"
    const n = makeNotification("product_url_resolved", {
      platform: "dicks_sporting_goods",
      had_url: false,
    });
    expect(buildBody(n)).toBe(
      "Your Dick's Sporting Goods product link is ready — we'll start tracking the price",
    );
  });
});
