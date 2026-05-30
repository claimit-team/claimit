import { describe, expect, it } from "vitest";

import { deriveMonitoringStatus, getListStatusBadge } from "./purchase-status";

// Fixed offsets relative to `Date.now()` so the tests stay wall-clock-robust.
const PAST = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const FUTURE = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

describe("deriveMonitoringStatus — window_expires reconciliation", () => {
  it("surfaces window_expired when a monitoring purchase's window is already past", () => {
    expect(deriveMonitoringStatus("monitoring", [], PAST())).toBe("window_expired");
  });

  it("treats monitoring_degraded with a past window as expired too", () => {
    expect(deriveMonitoringStatus("monitoring_degraded", [], PAST())).toBe("window_expired");
  });

  it("keeps monitoring when the window is still open", () => {
    expect(deriveMonitoringStatus("monitoring", [], FUTURE())).toBe("monitoring");
  });

  it("an expired window outranks a draft_pending eligible_drop promotion", () => {
    expect(deriveMonitoringStatus("monitoring", ["draft_pending"], PAST())).toBe("window_expired");
  });

  it("still promotes to eligible_drop when the window is open", () => {
    expect(deriveMonitoringStatus("monitoring", ["draft_pending"], FUTURE())).toBe("eligible_drop");
  });

  it("is read-tolerant: missing/malformed window does not override the base status", () => {
    expect(deriveMonitoringStatus("monitoring", [], null)).toBe("monitoring");
    expect(deriveMonitoringStatus("monitoring", [], undefined)).toBe("monitoring");
    expect(deriveMonitoringStatus("monitoring", [], "not-a-date")).toBe("monitoring");
  });

  it("does not touch terminal states even with a past window", () => {
    expect(deriveMonitoringStatus("refunded", [], PAST())).toBe("claim_resolved");
    expect(deriveMonitoringStatus("claimed", [], PAST())).toBe("claim_active");
  });
});

describe("getListStatusBadge — window_expires reconciliation", () => {
  it("labels a past-window monitoring row as Window expired", () => {
    expect(getListStatusBadge("monitoring", PAST()).label).toBe("Window expired");
    expect(getListStatusBadge("monitoring_degraded", PAST()).label).toBe("Window expired");
  });

  it("keeps the Monitoring label when the window is open or unknown", () => {
    expect(getListStatusBadge("monitoring", FUTURE()).label).toBe("Monitoring");
    expect(getListStatusBadge("monitoring", null).label).toBe("Monitoring");
    expect(getListStatusBadge("monitoring").label).toBe("Monitoring");
  });
});
