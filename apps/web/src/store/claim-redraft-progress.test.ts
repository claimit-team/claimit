import { describe, expect, it } from "vitest";

import { normalizeClaimId, useClaimRedraftProgressStore } from "./claim-redraft-progress";

describe("claim-redraft-progress store", () => {
  it("normalizes claim id keys case-insensitively", () => {
    const mixed = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
    const upper = mixed.toUpperCase();
    expect(normalizeClaimId(mixed)).toBe(normalizeClaimId(upper));
  });

  it("clearRegenerating produces a new byClaimId reference and stops regenerating", () => {
    const claimId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    useClaimRedraftProgressStore.setState({ byClaimId: {} });

    useClaimRedraftProgressStore.getState().startRegenerating(claimId, 1);
    const afterStart = useClaimRedraftProgressStore.getState().byClaimId;
    expect(useClaimRedraftProgressStore.getState().isRegenerating(claimId)).toBe(true);

    useClaimRedraftProgressStore.getState().clearRegenerating(claimId);
    const afterClear = useClaimRedraftProgressStore.getState().byClaimId;

    expect(afterClear).not.toBe(afterStart);
    expect(useClaimRedraftProgressStore.getState().isRegenerating(claimId)).toBe(false);
    expect(Object.keys(afterClear)).toHaveLength(0);
  });

  it("markTimedOut keeps entry but stops isRegenerating", () => {
    const claimId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    useClaimRedraftProgressStore.setState({ byClaimId: {} });
    useClaimRedraftProgressStore.getState().startRegenerating(claimId, 1);
    useClaimRedraftProgressStore.getState().markTimedOut(claimId);

    expect(useClaimRedraftProgressStore.getState().isRegenerating(claimId)).toBe(false);
    expect(useClaimRedraftProgressStore.getState().isTimedOut(claimId)).toBe(true);
  });
});
