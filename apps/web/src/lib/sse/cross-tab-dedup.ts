/**
 * Cross-tab dedup for proactive notifications (BUG-123 S4).
 *
 * Each open tab runs its own EventSource and its own in-tab dedup set, so
 * without coordination two tabs both surface the same proactive card (and
 * both add the same auto-send banner row). This coordinator lets exactly
 * one tab "claim" a notification id: the first tab to call claim(id) wins
 * and broadcasts the claim to peers over a BroadcastChannel; the other
 * tabs record the id and skip surfacing it.
 *
 * Scope: this gates the *user-visible* surfacing only. Per-tab side effects
 * that every tab legitimately needs (e.g. refetching an open claim detail)
 * stay outside the claim gate.
 *
 * Known limitation: claim() is best-effort, not a distributed lock. If two
 * tabs poll the same brand-new event within the same animation frame, both
 * can claim before either broadcast lands, producing a rare double-surface.
 * That window is sub-frame and acceptable for proactive cards; the Web
 * Locks API (navigator.locks) is the upgrade path if it ever matters.
 */

const CHANNEL_NAME = "claimit-proactive-dedup";
const DEFAULT_MAX = 500;

type ClaimMessage = { type: "claim"; id: string };

/** Minimal slice of BroadcastChannel we depend on — keeps tests injectable. */
export interface DedupChannel {
  postMessage(message: ClaimMessage): void;
  close(): void;
  onmessage: ((event: { data: ClaimMessage }) => void) | null;
}

export interface CrossTabDedup {
  /**
   * Returns true if THIS tab should surface `id` (and records + broadcasts
   * the claim), or false if it was already claimed locally or by a peer.
   */
  claim(id: string): boolean;
  /** Tear down the channel; call on hook cleanup. */
  dispose(): void;
}

export interface CrossTabDedupOptions {
  /** Override channel creation (tests inject an in-memory fake). */
  channelFactory?: () => DedupChannel | null;
  /** FIFO cap on remembered claim ids. */
  max?: number;
}

function defaultChannelFactory(): DedupChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(CHANNEL_NAME) as unknown as DedupChannel;
}

export function createCrossTabDedup(options: CrossTabDedupOptions = {}): CrossTabDedup {
  const max = options.max ?? DEFAULT_MAX;
  const factory = options.channelFactory ?? defaultChannelFactory;

  const claimed = new Set<string>();
  const order: string[] = [];

  const remember = (id: string): void => {
    if (claimed.has(id)) return;
    claimed.add(id);
    order.push(id);
    if (order.length > max) {
      const evicted = order.shift();
      if (evicted !== undefined) claimed.delete(evicted);
    }
  };

  const channel = factory();
  if (channel) {
    // A peer claimed this id first — record it so we don't also surface it.
    channel.onmessage = (event) => {
      if (event.data?.type === "claim" && typeof event.data.id === "string") {
        remember(event.data.id);
      }
    };
  }

  return {
    claim(id: string): boolean {
      if (claimed.has(id)) return false;
      remember(id);
      channel?.postMessage({ type: "claim", id });
      return true;
    },
    dispose(): void {
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
      claimed.clear();
      order.length = 0;
    },
  };
}
