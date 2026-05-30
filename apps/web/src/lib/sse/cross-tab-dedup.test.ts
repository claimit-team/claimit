import { describe, expect, it } from "vitest";

import { createCrossTabDedup, type DedupChannel } from "@/lib/sse/cross-tab-dedup";

/**
 * In-memory stand-in for BroadcastChannel: every channel built by the
 * returned factory is wired into one hub, and postMessage delivers
 * synchronously to all *other* live channels (matching BroadcastChannel's
 * "not echoed to the sender" semantics). Synchronous delivery makes claim
 * ordering deterministic for the test.
 */
function makeFakeChannelHub(): () => DedupChannel {
  const channels: DedupChannel[] = [];
  return () => {
    const ch: DedupChannel = {
      onmessage: null,
      postMessage(message) {
        for (const other of channels) {
          if (other !== ch) other.onmessage?.({ data: message });
        }
      },
      close() {
        const i = channels.indexOf(ch);
        if (i >= 0) channels.splice(i, 1);
      },
    };
    channels.push(ch);
    return ch;
  };
}

describe("createCrossTabDedup", () => {
  it("lets only the first tab claim an id; peers skip it", () => {
    const factory = makeFakeChannelHub();
    const tabA = createCrossTabDedup({ channelFactory: factory });
    const tabB = createCrossTabDedup({ channelFactory: factory });

    expect(tabA.claim("n1")).toBe(true);
    expect(tabB.claim("n1")).toBe(false); // A's broadcast reached B

    // Either tab can win for a different id; the other then defers.
    expect(tabB.claim("n2")).toBe(true);
    expect(tabA.claim("n2")).toBe(false);

    tabA.dispose();
    tabB.dispose();
  });

  it("treats distinct ids independently", () => {
    const factory = makeFakeChannelHub();
    const tabA = createCrossTabDedup({ channelFactory: factory });
    const tabB = createCrossTabDedup({ channelFactory: factory });

    expect(tabA.claim("a")).toBe(true);
    expect(tabB.claim("b")).toBe(true);
    expect(tabA.claim("a")).toBe(false); // same tab, already claimed
    expect(tabB.claim("a")).toBe(false); // peer claimed it

    tabA.dispose();
    tabB.dispose();
  });

  it("stops cross-talk after dispose without blocking the survivor", () => {
    const factory = makeFakeChannelHub();
    const tabA = createCrossTabDedup({ channelFactory: factory });
    const tabB = createCrossTabDedup({ channelFactory: factory });

    tabA.dispose(); // tab closed

    // B's claims no longer reach A, and A no longer pre-empts B.
    expect(tabB.claim("n3")).toBe(true);
    expect(tabB.claim("n3")).toBe(false);

    tabB.dispose();
  });

  it("dedups locally when no channel is available (BroadcastChannel unsupported)", () => {
    const solo = createCrossTabDedup({ channelFactory: () => null });
    expect(solo.claim("x")).toBe(true);
    expect(solo.claim("x")).toBe(false);
    solo.dispose();
  });

  it("evicts the oldest id once the FIFO cap is exceeded", () => {
    const d = createCrossTabDedup({ channelFactory: () => null, max: 2 });
    expect(d.claim("1")).toBe(true);
    expect(d.claim("2")).toBe(true);
    expect(d.claim("3")).toBe(true); // {2,3} — evicts "1"
    expect(d.claim("1")).toBe(true); // "1" forgotten -> claimable again; {3,1} — evicts "2"
    expect(d.claim("3")).toBe(false); // "3" still remembered
    d.dispose();
  });
});
