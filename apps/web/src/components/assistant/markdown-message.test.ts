import { describe, expect, it } from "vitest";

import { nextRevealCount } from "./markdown-message";

describe("nextRevealCount", () => {
  it("stays 0 when target is 0", () => {
    expect(nextRevealCount(0, 0)).toBe(0);
    expect(nextRevealCount(5, 0)).toBe(5);
  });

  it("returns current unchanged when current >= targetLen", () => {
    expect(nextRevealCount(10, 10)).toBe(10);
    expect(nextRevealCount(15, 10)).toBe(15);
  });

  it("never exceeds targetLen", () => {
    for (let target = 1; target <= 200; target += 7) {
      let current = 0;
      for (let i = 0; i < 500; i += 1) {
        const next = nextRevealCount(current, target);
        expect(next).toBeLessThanOrEqual(target);
        current = next;
        if (current >= target) break;
      }
    }
  });

  it("is monotonic non-decreasing until target is reached", () => {
    const target = 120;
    let current = 0;
    let prev = 0;
    while (current < target) {
      current = nextRevealCount(current, target);
      expect(current).toBeGreaterThanOrEqual(prev);
      prev = current;
    }
  });

  it("reaches target exactly when starting from 0", () => {
    for (const target of [1, 2, 40, 41, 80, 200]) {
      let current = 0;
      while (current < target) {
        current = nextRevealCount(current, target);
      }
      expect(current).toBe(target);
    }
  });
});
